const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');

// Production mode - отключаем логи
const isDev = false;
const log = isDev ? console.log : () => {};
const logError = console.error; // Ошибки всегда логируем

class TelegramService {
  constructor() {
    this.client = null;
    this.session = null;
    this.apiId = null;
    this.apiHash = null;
    this.authResolvers = {
      phoneCode: null,
      password: null
    };
    this.authPromise = null;
  }

  async connect(apiId, apiHash, sessionString = '') {
    this.apiId = parseInt(apiId);
    this.apiHash = apiHash;
    this.session = new StringSession(sessionString);
    
    // Если уже есть клиент, отключаем его
    if (this.client) {
      try {
        await this.client.disconnect();
      } catch (e) {
        log('[TelegramService] Error disconnecting old client:', e.message);
      }
    }
    
    this.client = new TelegramClient(this.session, this.apiId, this.apiHash, {
      connectionRetries: 5,
      useWSS: false, // Использовать TCP вместо WebSocket
    });
    
    await this.client.connect();
    
    // Если есть сессия, нужно убедиться что клиент авторизован
    if (sessionString) {
      log('[TelegramService] Connecting with existing session');
      // Проверяем авторизацию
      try {
        await this.client.getMe();
        log('[TelegramService] Session is valid');
      } catch (error) {
        logError('[TelegramService] Session invalid:', error.message);
        throw error;
      }
    }
    
    return true;
  }

  async startAuth(phoneNumber) {
    if (!this.client) {
      throw new Error('Client not connected');
    }

    return new Promise((resolveStart, rejectStart) => {
      // Создаем промис для отслеживания завершения авторизации
      let authCompleteResolve;
      this.authPromise = new Promise((resolve) => {
        authCompleteResolve = resolve;
      });

      // Запускаем процесс авторизации
      const authProcess = this.client.start({
        phoneNumber: async () => {
          log('[TelegramService] Phone number callback');
          return phoneNumber;
        },
        password: async () => {
          log('[TelegramService] Password callback - notifying renderer');
          // Уведомляем, что нужен пароль
          resolveStart({ step: 'password' });
          
          return new Promise((resolvePassword) => {
            this.authResolvers.password = resolvePassword;
          });
        },
        phoneCode: async () => {
          log('[TelegramService] Phone code callback - notifying renderer');
          // Уведомляем, что нужен код
          resolveStart({ step: 'code' });
          
          return new Promise((resolveCode) => {
            this.authResolvers.phoneCode = resolveCode;
          });
        },
        onError: (err) => {
          logError('[TelegramService] Auth error:', err);
        },
      });

      // Когда авторизация завершится, сохраняем сессию
      authProcess.then(() => {
        const sessionString = this.client.session.save();
        log('[TelegramService] Auth completed successfully');
        authCompleteResolve({ step: 'success', session: sessionString });
      }).catch((err) => {
        logError('[TelegramService] Auth failed:', err.message);
        authCompleteResolve({ step: 'error', error: err.message });
      });
    });
  }

  async submitCode(code) {
    log('[TelegramService] submitCode called');
    if (this.authResolvers.phoneCode) {
      log('[TelegramService] Resolving phone code');
      this.authResolvers.phoneCode(code);
      this.authResolvers.phoneCode = null;
      
      // Ждем немного, чтобы понять, нужен ли пароль
      log('[TelegramService] Waiting to check if password is needed...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Проверяем, запрашивается ли пароль
      if (this.authResolvers.password) {
        log('[TelegramService] Password is required');
        return { step: 'password' };
      }
      
      log('[TelegramService] No password needed, waiting for auth completion');
      // Если пароль не нужен, ждем завершения авторизации
      if (this.authPromise) {
        const result = await this.authPromise;
        this.authPromise = null;
        log('[TelegramService] Auth completed:', result);
        return result;
      }
      
      log('[TelegramService] Still waiting...');
      return { step: 'waiting' };
    }
    throw new Error('No code resolver available');
  }

  async submitPassword(password) {
    log('[TelegramService] submitPassword called');
    if (this.authResolvers.password) {
      log('[TelegramService] Resolving password');
      this.authResolvers.password(password);
      this.authResolvers.password = null;
      
      log('[TelegramService] Waiting for auth completion after password');
      // Ждем завершения авторизации
      if (this.authPromise) {
        const result = await this.authPromise;
        this.authPromise = null;
        log('[TelegramService] Auth completed after password:', result);
        return result;
      }
      
      log('[TelegramService] Still waiting after password...');
      return { step: 'waiting' };
    }
    throw new Error('No password resolver available');
  }

  async getMe() {
    if (!this.client) {
      throw new Error('Client not connected');
    }
    
    // Проверяем, подключен ли клиент
    if (!this.client.connected) {
      log('[TelegramService] Client disconnected, reconnecting...');
      await this.client.connect();
    }
    
    const me = await this.client.getMe();
    
    // Пытаемся получить аватарку
    let avatarBase64 = null;
    try {
      if (me.photo) {
        log('[TelegramService] Downloading profile photo...');
        const buffer = await this.client.downloadProfilePhoto(me);
        if (buffer) {
          // Конвертируем Buffer в base64
          avatarBase64 = `data:image/jpeg;base64,${buffer.toString('base64')}`;
          log('[TelegramService] Profile photo downloaded');
        }
      }
    } catch (error) {
      logError('[TelegramService] Failed to download photo:', error.message);
    }
    
    return {
      displayName: me.firstName || me.username || 'User', // Отображаемое имя
      username: me.username,
      firstName: me.firstName,
      lastName: me.lastName,
      id: me.id.toString(),
      avatar: avatarBase64 // base64 аватарка или null
    };
  }

  async updateProfile(firstName, lastName = '') {
    if (!this.client) {
      throw new Error('Client not connected');
    }
    
    try {
      // Проверяем, подключен ли клиент
      if (!this.client.connected) {
        log('[TelegramService] Client disconnected, reconnecting...');
        await this.client.connect();
      }
      
      // Получаем текущий профиль
      const currentMe = await this.client.getMe();
      const currentFirstName = currentMe.firstName || '';
      
      log('[TelegramService] Current firstName:', currentFirstName);
      log('[TelegramService] New firstName:', firstName);
      
      // Проверяем, не совпадает ли уже
      if (currentFirstName === firstName) {
        log('[TelegramService] FirstName already correct, skipping update');
        return { success: true, skipped: true };
      }
      
      log('[TelegramService] Updating profile...');
      
      const result = await this.client.invoke(
        new (require('telegram/tl').Api.account.UpdateProfile)({
          firstName: firstName,
          lastName: lastName || currentMe.lastName || ''
        })
      );
      
      log('[TelegramService] Profile updated successfully');
      return { success: true, skipped: false };
    } catch (error) {
      logError('[TelegramService] Failed to update profile:', error);
      throw error;
    }
  }

  async disconnect() {
    if (this.client) {
      await this.client.disconnect();
      this.client = null;
    }
    // Сбрасываем все resolvers
    this.authResolvers = {
      phoneCode: null,
      password: null
    };
    this.authPromise = null;
  }

  getSessionString() {
    return this.client ? this.client.session.save() : '';
  }
}

module.exports = new TelegramService();
