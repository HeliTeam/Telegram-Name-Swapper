const fs = require('fs');
const path = require('path');
const { ipcRenderer } = require('electron');

// Storage paths
let userDataPath = '';
let configPath = '';

// Get user data path from main process
async function initPaths() {
  try {
    userDataPath = await ipcRenderer.invoke('get-user-data-path');
    configPath = path.join(userDataPath, 'config.json');
  } catch (error) {
    console.error('Failed to get user data path:', error);
    // Fallback to current directory
    userDataPath = process.cwd();
    configPath = path.join(userDataPath, 'config.json');
  }
}

// State
let state = {
  screen: 'loading',
  apiId: null,
  apiHash: null,
  session: null,
  client: null,
  profile: null,
  autoUpdate: false, // по дефолту выключено
  timezone: 0,
  error: null,
  startInTray: false,
  autoStart: false,
  originalNickname: null // Сохраняем оригинальный ник
};

// Load config
function loadConfig() {
  try {
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(data);
      state.apiId = config.apiId;
      state.apiHash = config.apiHash;
      state.session = config.session;
      state.autoUpdate = config.autoUpdate || false; // по дефолту false
      state.timezone = config.timezone || 0;
      state.startInTray = config.startInTray || false;
      state.autoStart = config.autoStart || false;
      state.originalNickname = config.originalNickname || null; // Загружаем оригинальный ник
      return true;
    }
  } catch (error) {
    console.error('Failed to load config:', error);
  }
  return false;
}

// Save config
function saveConfig() {
  try {
    const config = {
      apiId: state.apiId,
      apiHash: state.apiHash,
      session: state.session,
      autoUpdate: state.autoUpdate || false, // по дефолту false
      timezone: state.timezone,
      startInTray: state.startInTray || false,
      autoStart: state.autoStart || false,
      originalNickname: state.originalNickname || null // Сохраняем оригинальный ник
    };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error('Failed to save config:', error);
  }
}

// Initialize
async function init() {
  await initPaths();
  
  const hasConfig = loadConfig();
  
  if (!state.apiId || !state.apiHash) {
    showScreen('apiCredentials');
  } else if (!state.session) {
    showScreen('login');
  } else {
    try {
      await connectClient();
      state.profile = await getProfile();
      
      // Если автообновление включено, но originalNickname не сохранен - парсим из текущего ника
      if (state.autoUpdate && !state.originalNickname) {
        let baseNickname = state.profile.displayName;
        if (baseNickname.includes(' | ')) {
          baseNickname = baseNickname.split(' | ')[0];
        }
        console.log('[Init] Parsed original nickname from current:', baseNickname);
        state.originalNickname = baseNickname;
        saveConfig();
      }
      
      showScreen('main');
      
      // Запускаем автообновление только если оно было включено
      if (state.autoUpdate) {
        console.log('[Init] Auto update was enabled, starting...');
        // Небольшая задержка чтобы UI успел отрисоваться
        setTimeout(() => {
          startAutoUpdate();
        }, 1000);
      }
    } catch (error) {
      console.error('Failed to connect:', error);
      // Если сессия невалидна или требует пароль, очищаем её
      if (error.message.includes('SESSION_PASSWORD_NEEDED') || 
          error.message.includes('AUTH_KEY') ||
          error.message.includes('401')) {
        console.log('Session invalid, clearing...');
        state.session = null;
        saveConfig();
        // Отключаемся от клиента
        if (state.client) {
          await ipcRenderer.invoke('telegram:disconnect');
          state.client = null;
        }
      }
      showScreen('login');
    }
  }
}

// Connect Telegram client
async function connectClient() {
  const result = await ipcRenderer.invoke('telegram:connect', state.apiId, state.apiHash, state.session || '');
  if (!result.success) {
    throw new Error(result.error);
  }
  state.client = true; // Mark as connected
}

// Get profile
async function getProfile() {
  const result = await ipcRenderer.invoke('telegram:get-me');
  if (!result.success) {
    throw new Error(result.error);
  }
  return {
    displayName: result.data.displayName, // Отображаемое имя для форматирования
    username: result.data.username || result.data.displayName, // Для показа в профиле
    status: 'онлайн',
    avatar: result.data.avatar // base64 аватарка
  };
}

// Update nickname
async function updateNickname(nickname) {
  const result = await ipcRenderer.invoke('telegram:update-profile', nickname, '');
  if (!result.success) {
    throw new Error(result.error);
  }
}

// Format nickname
function formatNickname() {
  const now = new Date();
  const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
  const localTime = new Date(utcTime + (state.timezone * 3600000));
  
  const hours = String(localTime.getHours()).padStart(2, '0');
  const minutes = String(localTime.getMinutes()).padStart(2, '0');
  const isDayTime = localTime.getHours() >= 6 && localTime.getHours() < 18;
  const timeOfDay = isDayTime ? 'day' : 'night';
  
  // Используем оригинальный ник (сохраненный при включении автообновления)
  const baseName = state.originalNickname || state.profile.displayName;
  
  return `${baseName} | ${hours}:${minutes} | ${timeOfDay}`;
}

// Auto update interval
let updateInterval = null;
let lastUpdateTime = 0;
let lastNickname = '';
let isUpdating = false;

function startAutoUpdate() {
  // Жесткая проверка - если уже запущено, не запускаем снова
  if (updateInterval) {
    console.log('[AutoUpdate] Already running, skipping');
    return;
  }
  
  console.log('[AutoUpdate] Starting auto update');
  
  updateInterval = setInterval(async () => {
    // Проверка что не обновляемся прямо сейчас
    if (isUpdating) {
      console.log('[AutoUpdate] Update in progress, skipping');
      return;
    }
    
    // Проверка что прошла минута с последнего обновления
    const now = Date.now();
    if (now - lastUpdateTime < 55000) { // 55 секунд минимум
      console.log('[AutoUpdate] Too soon since last update, skipping');
      return;
    }
    
    try {
      isUpdating = true;
      const nickname = formatNickname();
      
      // Проверка что ник изменился
      if (nickname === lastNickname) {
        console.log('[AutoUpdate] Nickname unchanged, skipping');
        isUpdating = false;
        return;
      }
      
      console.log('[AutoUpdate] Updating nickname to:', nickname);
      await updateNickname(nickname);
      
      lastNickname = nickname;
      lastUpdateTime = now;
      updatePreview();
      
      console.log('[AutoUpdate] Update successful');
    } catch (error) {
      console.error('[AutoUpdate] Update failed:', error);
    } finally {
      isUpdating = false;
    }
  }, 60000); // Every minute
  
  // При старте проверяем текущий ник перед обновлением
  (async () => {
    try {
      isUpdating = true;
      
      // Получаем текущий ник из Telegram
      const currentProfile = await ipcRenderer.invoke('telegram:get-me');
      const currentNickname = currentProfile.success ? currentProfile.data.firstName : null;
      const newNickname = formatNickname();
      
      console.log('[AutoUpdate] Current nickname:', currentNickname);
      console.log('[AutoUpdate] New nickname:', newNickname);
      
      // Обновляем только если ник отличается
      if (currentNickname !== newNickname) {
        console.log('[AutoUpdate] Initial update to:', newNickname);
        await updateNickname(newNickname);
        lastNickname = newNickname;
        lastUpdateTime = Date.now();
        updatePreview();
      } else {
        console.log('[AutoUpdate] Nickname already correct, skipping initial update');
        lastNickname = newNickname;
        lastUpdateTime = Date.now();
      }
    } catch (error) {
      console.error('[AutoUpdate] Initial update failed:', error);
    } finally {
      isUpdating = false;
    }
  })();
}

function stopAutoUpdate() {
  if (updateInterval) {
    console.log('[AutoUpdate] Stopping auto update');
    clearInterval(updateInterval);
    updateInterval = null;
    lastUpdateTime = 0;
    lastNickname = '';
    isUpdating = false;
  }
}

// UI Functions
function showScreen(screenName) {
  state.screen = screenName;
  const root = document.getElementById('root');
  
  switch (screenName) {
    case 'apiCredentials':
      root.innerHTML = renderApiCredentialsScreen();
      break;
    case 'login':
      root.innerHTML = renderLoginScreen();
      break;
    case 'main':
      root.innerHTML = renderMainScreen();
      break;
    case 'about':
      root.innerHTML = renderAboutScreen();
      break;
    default:
      root.innerHTML = '<div class="loading">Загрузка...</div>';
  }
}

function showAbout() {
  showScreen('about');
}

function openExternal(url) {
  require('electron').shell.openExternal(url);
}

function renderApiCredentialsScreen() {
  return `
    <div class="container">
      <div class="screen">
        <img src="../../assets/icon.png" alt="Logo" class="app-logo">
        <h1 class="title">Настройка API</h1>
        <p class="subtitle">Получите API ID и API Hash на сайте<br>my.telegram.org</p>
        
        <div class="input-group">
          <label class="label">API ID</label>
          <input type="text" id="apiId" placeholder="Введите API ID">
        </div>
        
        <div class="input-group">
          <label class="label">API Hash</label>
          <input type="text" id="apiHash" placeholder="Введите API Hash">
        </div>
        
        <div class="error" id="error"></div>
        
        <button onclick="saveApiCredentials()">Продолжить</button>
      </div>
    </div>
  `;
}

function renderLoginScreen() {
  return `
    <div class="container">
      <div class="screen">
        <img src="../../assets/icon.png" alt="Logo" class="app-logo">
        <h1 class="title">Вход в Telegram</h1>
        
        <div class="input-group">
          <label class="label">Номер телефона</label>
          <input type="tel" id="phone" placeholder="+7 999 123 45 67">
        </div>
        
        <div class="input-group hidden" id="codeGroup">
          <label class="label">Код подтверждения</label>
          <input type="text" id="code" placeholder="12345" maxlength="5">
        </div>
        
        <div class="input-group hidden" id="passwordGroup">
          <label class="label">Пароль 2FA</label>
          <input type="password" id="password" placeholder="Введите пароль">
        </div>
        
        <div class="error" id="error"></div>
        
        <button id="loginBtn" onclick="handleLogin()">Отправить код</button>
      </div>
    </div>
  `;
}

function renderMainScreen() {
  const preview = formatNickname();
  const statusText = state.autoUpdate ? 'активно' : 'отключено';
  
  // Generate timezone options
  let timezoneOptions = '';
  for (let i = -12; i <= 14; i++) {
    const sign = i >= 0 ? '+' : '';
    const selected = i === state.timezone ? 'selected' : '';
    timezoneOptions += `<option value="${i}" ${selected}>UTC${sign}${i}</option>`;
  }
  
  // Аватарка или первая буква имени
  const avatarContent = state.profile.avatar 
    ? `<img src="${state.profile.avatar}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;" />`
    : state.profile.username[0].toUpperCase();
  
  return `
    <div class="container">
      <div class="screen">
        <div class="profile-section">
          <div class="avatar">${avatarContent}</div>
          <div class="profile-info">
            <div class="username">${state.profile.username}</div>
            <div class="status">${state.profile.status}</div>
          </div>
        </div>
      </div>
      
      <div class="screen">
        <h2 class="title" style="font-size: 16px; text-align: left;">Предпросмотр</h2>
        <div class="preview" id="preview">${preview}</div>
      </div>
      
      <div class="screen">
        <h2 class="title" style="font-size: 16px; text-align: left;">Настройки</h2>
        
        <div class="toggle-container">
          <span>Автообновление</span>
          <div class="toggle ${state.autoUpdate ? 'active' : ''}" onclick="toggleAutoUpdate()">
            <div class="toggle-thumb"></div>
          </div>
        </div>
        
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0;">
          <span style="color: #B3B3B3;">Статус:</span>
          <span style="font-weight: 600;">${statusText}</span>
        </div>
        
        <div class="input-group">
          <label class="label">Часовой пояс</label>
          <select class="picker" onchange="changeTimezone(this.value)">
            ${timezoneOptions}
          </select>
        </div>
        
        <div class="toggle-container">
          <span>Запуск при старте ПК</span>
          <div class="toggle ${state.autoStart ? 'active' : ''}" onclick="toggleAutoStart()">
            <div class="toggle-thumb"></div>
          </div>
        </div>
        
        <div class="toggle-container">
          <span>Запускать в трее</span>
          <div class="toggle ${state.startInTray ? 'active' : ''}" onclick="toggleStartInTray()">
            <div class="toggle-thumb"></div>
          </div>
        </div>
        
        <button onclick="showAbout()">О программе</button>
        <button onclick="logout()">Выйти</button>
      </div>
    </div>
  `;
}

function renderAboutScreen() {
  return `
    <div class="container">
      <div class="screen">
        <h1 class="title">О программе</h1>
        <p class="subtitle">Telegram Nickname Updater</p>
        
        <div style="margin: 24px 0; padding: 16px; background: #1A1A1A; border-radius: 8px;">
          <div style="margin-bottom: 16px;">
            <div style="color: #B3B3B3; font-size: 12px; margin-bottom: 4px;">Fullstack Developer</div>
            <div style="font-weight: 600;">Klieer</div>
            <a href="#" onclick="openExternal('https://t.me/klier1337'); return false;" class="link">@klir1337</a>
          </div>
          
          <div style="margin-bottom: 16px;">
            <div style="color: #B3B3B3; font-size: 12px; margin-bottom: 4px;">Team</div>
            <div style="font-weight: 600;">HeliTeam</div>
            <a href="#" onclick="openExternal('https://t.me/helitop1337'); return false;" class="link">@helitop1337</a>
            <a href="#" onclick="openExternal('https://helitop.ru'); return false;" class="link">helitop.ru</a>
          </div>
        </div>
        
        <div style="text-align: center; margin-top: 32px; color: #666; font-size: 14px; display: flex; align-items: center; justify-content: center; gap: 8px;">
          <span>Created with</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="#666"/>
          </svg>
        </div>
        
        <button onclick="showScreen('main')" style="margin-top: 24px;">Назад</button>
      </div>
    </div>
  `;
}

function updatePreview() {
  const preview = document.getElementById('preview');
  if (preview) {
    preview.textContent = formatNickname();
  }
}

// Event handlers
async function saveApiCredentials() {
  const apiId = document.getElementById('apiId').value.trim();
  const apiHash = document.getElementById('apiHash').value.trim();
  const errorEl = document.getElementById('error');
  
  if (!apiId || !apiHash) {
    errorEl.textContent = 'Заполните все поля';
    return;
  }
  
  if (!/^\d+$/.test(apiId)) {
    errorEl.textContent = 'API ID должен содержать только цифры';
    return;
  }
  
  state.apiId = apiId;
  state.apiHash = apiHash;
  saveConfig();
  showScreen('login');
}

let loginStep = 'phone';

async function handleLogin() {
  const errorEl = document.getElementById('error');
  const btn = document.getElementById('loginBtn');
  
  try {
    btn.disabled = true;
    errorEl.textContent = '';
    
    if (loginStep === 'phone') {
      const phone = document.getElementById('phone').value.trim();
      if (!phone) {
        errorEl.textContent = 'Введите номер телефона';
        btn.disabled = false;
        return;
      }
      
      console.log('Starting connection...');
      errorEl.textContent = 'Подключение...';
      
      try {
        await connectClient();
        console.log('Client connected');
      } catch (error) {
        console.error('Connection failed:', error);
        errorEl.textContent = 'Ошибка подключения: ' + error.message;
        btn.disabled = false;
        return;
      }
      
      console.log('Starting auth flow...');
      errorEl.textContent = 'Отправка запроса...';
      
      // Запуск авторизации через IPC
      const authResult = await ipcRenderer.invoke('telegram:start-auth', phone);
      
      if (!authResult.success) {
        errorEl.textContent = 'Ошибка: ' + authResult.error;
        btn.disabled = false;
        return;
      }
      
      if (authResult.data.step === 'code') {
        loginStep = 'code';
        document.getElementById('codeGroup').classList.remove('hidden');
        errorEl.textContent = 'Код отправлен в Telegram';
        btn.disabled = false;
        btn.textContent = 'Подтвердить';
      } else if (authResult.data.step === 'password') {
        loginStep = 'password';
        document.getElementById('passwordGroup').classList.remove('hidden');
        errorEl.textContent = 'Введите пароль 2FA';
        btn.disabled = false;
        btn.textContent = 'Войти';
      } else if (authResult.data.step === 'success') {
        // Успешный вход
        state.session = authResult.data.session;
        saveConfig();
        state.profile = await getProfile();
        showScreen('main');
      }
      
    } else if (loginStep === 'code') {
      const code = document.getElementById('code').value.trim();
      if (!code) {
        errorEl.textContent = 'Введите код подтверждения';
        btn.disabled = false;
        return;
      }
      
      console.log('Submitting code:', code);
      errorEl.textContent = 'Проверка кода...';
      
      const codeResult = await ipcRenderer.invoke('telegram:submit-code', code);
      
      console.log('Code result:', codeResult);
      
      if (!codeResult.success) {
        errorEl.textContent = 'Ошибка: ' + codeResult.error;
        btn.disabled = false;
        // Очищаем поле кода
        document.getElementById('code').value = '';
        return;
      }
      
      // Проверяем результат
      if (codeResult.data.step === 'password') {
        // Нужен пароль 2FA
        console.log('Password required');
        loginStep = 'password';
        document.getElementById('passwordGroup').classList.remove('hidden');
        errorEl.textContent = 'Введите пароль 2FA';
        btn.disabled = false;
        btn.textContent = 'Войти';
      } else if (codeResult.data.step === 'success') {
        // Успешный вход без пароля
        console.log('Auth success, session:', codeResult.data.session);
        state.session = codeResult.data.session;
        saveConfig();
        state.profile = await getProfile();
        showScreen('main');
      } else if (codeResult.data.step === 'error') {
        // Ошибка при вводе кода
        console.log('Code error:', codeResult.data.error);
        
        if (codeResult.data.error.includes('PHONE_CODE_INVALID') || 
            codeResult.data.error.includes('PHONE_CODE_EXPIRED')) {
          errorEl.textContent = 'Неверный или устаревший код. Попробуйте снова.';
          // Очищаем поле кода
          document.getElementById('code').value = '';
          btn.disabled = false;
        } else {
          errorEl.textContent = 'Ошибка: ' + codeResult.data.error;
          // Сбрасываем через 2 секунды
          setTimeout(() => {
            loginStep = 'phone';
            showScreen('login');
          }, 2000);
        }
      } else {
        // Ждем завершения
        console.log('Waiting for completion, step:', codeResult.data.step);
        errorEl.textContent = 'Завершение авторизации...';
        btn.disabled = false;
      }
      
    } else if (loginStep === 'password') {
      const password = document.getElementById('password').value;
      if (!password) {
        errorEl.textContent = 'Введите пароль';
        btn.disabled = false;
        return;
      }
      
      console.log('Submitting password');
      errorEl.textContent = 'Проверка пароля...';
      
      const passwordResult = await ipcRenderer.invoke('telegram:submit-password', password);
      
      console.log('Password result:', passwordResult);
      
      if (!passwordResult.success) {
        errorEl.textContent = 'Ошибка: ' + passwordResult.error;
        btn.disabled = false;
        return;
      }
      
      // Проверяем результат
      if (passwordResult.data.step === 'success') {
        // Успешный вход
        console.log('Auth success with password, session:', passwordResult.data.session);
        state.session = passwordResult.data.session;
        saveConfig();
        state.profile = await getProfile();
        showScreen('main');
      } else if (passwordResult.data.step === 'error') {
        // Ошибка авторизации (неправильный пароль)
        console.log('Auth error:', passwordResult.data.error);
        
        // Отключаемся и сбрасываем состояние
        await ipcRenderer.invoke('telegram:disconnect');
        state.client = null;
        
        if (passwordResult.data.error.includes('PASSWORD_HASH_INVALID')) {
          errorEl.textContent = 'Неправильный пароль. Начните заново.';
        } else {
          errorEl.textContent = 'Ошибка: ' + passwordResult.data.error;
        }
        
        // Сбрасываем форму через 2 секунды
        setTimeout(() => {
          loginStep = 'phone';
          showScreen('login');
        }, 2000);
      } else {
        console.log('Waiting for completion after password, step:', passwordResult.data.step);
        errorEl.textContent = 'Завершение авторизации...';
        btn.disabled = false;
      }
    }
    
  } catch (error) {
    console.error('Login error:', error);
    errorEl.textContent = 'Ошибка: ' + error.message;
    btn.disabled = false;
  }
}

function toggleAutoUpdate() {
  const wasEnabled = state.autoUpdate;
  state.autoUpdate = !state.autoUpdate;
  
  console.log('[Toggle] Auto update:', wasEnabled, '->', state.autoUpdate);
  
  if (state.autoUpdate && !wasEnabled) {
    // Включаем - сохраняем оригинальный ник
    // Парсим текущий ник, чтобы извлечь базовое имя (без времени)
    let baseNickname = state.profile.displayName;
    
    // Если ник уже содержит " | ", берем только первую часть
    if (baseNickname.includes(' | ')) {
      baseNickname = baseNickname.split(' | ')[0];
    }
    
    console.log('[Toggle] Enabling - saving original nickname:', baseNickname);
    state.originalNickname = baseNickname;
    saveConfig();
    
    // Останавливаем старый интервал если есть (на всякий случай)
    stopAutoUpdate();
    
    // Запускаем новый
    startAutoUpdate();
  } else if (!state.autoUpdate && wasEnabled) {
    // Выключаем - возвращаем оригинальный ник
    console.log('[Toggle] Disabling - stopping auto update');
    stopAutoUpdate();
    
    if (state.originalNickname) {
      console.log('[Toggle] Restoring original nickname:', state.originalNickname);
      updateNickname(state.originalNickname).then(() => {
        console.log('[Toggle] Original nickname restored');
      }).catch(error => {
        console.error('[Toggle] Failed to restore nickname:', error);
      });
    }
    saveConfig();
  }
  
  showScreen('main');
}

async function toggleAutoStart() {
  state.autoStart = !state.autoStart;
  saveConfig();
  
  await ipcRenderer.invoke('set-auto-start', state.autoStart);
  showScreen('main');
}

function toggleStartInTray() {
  state.startInTray = !state.startInTray;
  saveConfig();
  showScreen('main');
}

function changeTimezone(value) {
  state.timezone = parseInt(value);
  saveConfig();
  updatePreview();
}

function logout() {
  stopAutoUpdate();
  state.session = null;
  state.profile = null;
  if (state.client) {
    ipcRenderer.invoke('telegram:disconnect');
    state.client = null;
  }
  saveConfig();
  showScreen('login');
}

// Start app
init();
