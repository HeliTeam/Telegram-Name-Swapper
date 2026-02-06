# Структура кода проекта

Подробное описание архитектуры и назначения каждого файла в проекте Telegram Name Swapper.

---

## Общая архитектура

Приложение построено на **Electron** и состоит из двух основных процессов:

1. **Main Process** (`src/main.js`) - главный процесс Node.js
2. **Renderer Process** (`src/renderer/`) - процесс отображения (браузерный контекст)

Взаимодействие между процессами происходит через **IPC** (Inter-Process Communication).

---

## Структура файлов

```
telegram-nickname-updater-desktop/
├── src/
│   ├── main.js              # Главный процесс Electron
│   ├── telegramService.js   # Сервис работы с Telegram API
│   └── renderer/
│       ├── index.html       # HTML интерфейс
│       ├── app.js           # Логика UI
│       └── particles.js     # Анимация частиц
├── assets/
│   └── icon.png             # Иконка приложения
├── package.json             # Конфигурация проекта
├── LICENSE                  # Лицензия MIT
├── README.md                # Основная документация
└── CODE_STRUCTURE.md        # Этот файл
```

---

## Детальное описание файлов

### `src/main.js` - Главный процесс

**Назначение:** Управление жизненным циклом приложения, окнами, системным треем.

**Основные функции:**


#### 1. Создание окна приложения
```javascript
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    backgroundColor: '#000000',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
}
```
- Создаёт окно 800x600 пикселей
- Чёрный фон для минималистичного дизайна
- `nodeIntegration: true` - доступ к Node.js API из renderer
- `contextIsolation: false` - упрощённая коммуникация между процессами

#### 2. Системный трей
```javascript
function createTray() {
  tray = new Tray(icon);
  tray.setContextMenu(contextMenu);
}
```
- Создаёт иконку в системном трее
- Меню: "Показать" и "Выход"
- Клик по иконке - показать/скрыть окно

#### 3. IPC обработчики
```javascript
ipcMain.handle('telegram:connect', async (event, apiId, apiHash, sessionString) => {
  // Подключение к Telegram
});
```

**Список IPC каналов:**
- `get-user-data-path` - получить путь к папке данных приложения
- `clear-config` - очистить конфигурацию
- `telegram:connect` - подключиться к Telegram API
- `telegram:start-auth` - начать авторизацию
- `telegram:submit-code` - отправить код подтверждения
- `telegram:submit-password` - отправить пароль 2FA
- `telegram:get-me` - получить информацию о профиле
- `telegram:update-profile` - обновить имя пользователя
- `telegram:disconnect` - отключиться от Telegram
- `telegram:get-session` - получить session string
- `set-auto-start` - настроить автозапуск
- `get-auto-start` - проверить статус автозапуска

---

### `src/telegramService.js` - Telegram API сервис

**Назначение:** Инкапсуляция всей логики работы с Telegram API.

**Класс TelegramService:**

#### Свойства
```javascript
{
  client: null,           // TelegramClient instance
  session: null,          // StringSession для сохранения сессии
  apiId: null,            // API ID из my.telegram.org
  apiHash: null,          // API Hash из my.telegram.org
  authResolvers: {        // Промисы для авторизации
    phoneCode: null,
    password: null
  },
  authPromise: null       // Общий промис авторизации
}
```

#### Методы

**`connect(apiId, apiHash, sessionString)`**
- Создаёт TelegramClient с указанными credentials
- Если есть sessionString - восстанавливает сессию
- Проверяет валидность сессии через `getMe()`

**`startAuth(phoneNumber)`**
- Запускает процесс авторизации
- Возвращает промис, который резолвится на каждом шаге
- Использует callback'и для запроса кода и пароля

**`submitCode(code)`**
- Отправляет код подтверждения из Telegram
- Проверяет, нужен ли пароль 2FA
- Возвращает следующий шаг или результат

**`submitPassword(password)`**
- Отправляет пароль двухфакторной аутентификации
- Завершает процесс авторизации
- Возвращает session string

**`getMe()`**
- Получает информацию о текущем пользователе
- Скачивает аватарку и конвертирует в base64
- Возвращает объект с полями: displayName, username, firstName, lastName, id, avatar

**`updateProfile(firstName, lastName)`**
- Обновляет имя пользователя в Telegram
- Проверяет, не совпадает ли уже (оптимизация)
- Использует `Api.account.UpdateProfile`

**`disconnect()`**
- Отключается от Telegram
- Сбрасывает все resolvers

**`getSessionString()`**
- Возвращает строку сессии для сохранения

---

### `src/renderer/index.html` - HTML интерфейс

**Назначение:** Структура пользовательского интерфейса.

**Основные блоки:**

#### 1. Экран подключения API
```html
<div id="api-screen">
  <input id="api-id" placeholder="API ID">
  <input id="api-hash" placeholder="API Hash">
  <button id="connect-btn">Подключиться</button>
</div>
```
- Ввод API ID и API Hash
- Кнопка подключения

#### 2. Экран авторизации
```html
<div id="auth-screen">
  <input id="phone-input" placeholder="+79991234567">
  <button id="send-code-btn">Отправить код</button>
  
  <input id="code-input" placeholder="Код из Telegram">
  <button id="submit-code-btn">Подтвердить</button>
  
  <input id="password-input" type="password" placeholder="Пароль 2FA">
  <button id="submit-password-btn">Войти</button>
</div>
```
- Поэтапная авторизация
- Поля появляются по мере прохождения шагов

#### 3. Главный экран
```html
<div id="main-screen">
  <img id="user-avatar" src="">
  <div id="user-name"></div>
  
  <select id="timezone-select">
    <option value="0">UTC+0</option>
    <!-- ... -->
  </select>
  
  <div id="preview-nickname"></div>
  
  <label class="toggle">
    <input type="checkbox" id="auto-update-toggle">
    <span>Автообновление</span>
  </label>
  
  <button id="logout-btn">Выйти</button>
</div>
```
- Отображение профиля
- Выбор часового пояса
- Предпросмотр имени
- Переключатель автообновления

#### 4. Canvas для анимации
```html
<canvas id="particles-canvas"></canvas>
```
- Фоновая анимация частиц

---

### `src/renderer/app.js` - Логика UI

**Назначение:** Управление интерфейсом, обработка событий, автообновление.

**Основные компоненты:**

#### 1. Управление экранами
```javascript
function showScreen(screenId) {
  // Скрывает все экраны
  // Показывает нужный
}
```
Экраны: `api-screen`, `auth-screen`, `main-screen`

#### 2. Загрузка конфигурации
```javascript
async function loadConfig() {
  const userDataPath = await ipcRenderer.invoke('get-user-data-path');
  const configPath = path.join(userDataPath, 'config.json');
  // Читает и парсит config.json
}
```
Сохраняет:
- API ID и API Hash
- Session string
- Часовой пояс
- Состояние автообновления

#### 3. Подключение к Telegram
```javascript
connectBtn.addEventListener('click', async () => {
  const apiId = apiIdInput.value.trim();
  const apiHash = apiHashInput.value.trim();
  
  const result = await ipcRenderer.invoke('telegram:connect', apiId, apiHash, sessionString);
  
  if (result.success) {
    // Проверяем авторизацию
    const meResult = await ipcRenderer.invoke('telegram:get-me');
    if (meResult.success) {
      showMainScreen(meResult.data);
    } else {
      showScreen('auth-screen');
    }
  }
});
```

#### 4. Процесс авторизации
```javascript
// Шаг 1: Отправка номера телефона
sendCodeBtn.addEventListener('click', async () => {
  const result = await ipcRenderer.invoke('telegram:start-auth', phoneNumber);
  // Показываем поле для кода
});

// Шаг 2: Отправка кода
submitCodeBtn.addEventListener('click', async () => {
  const result = await ipcRenderer.invoke('telegram:submit-code', code);
  if (result.step === 'password') {
    // Показываем поле для пароля
  } else if (result.step === 'success') {
    // Авторизация завершена
  }
});

// Шаг 3: Отправка пароля (если нужен)
submitPasswordBtn.addEventListener('click', async () => {
  const result = await ipcRenderer.invoke('telegram:submit-password', password);
  // Авторизация завершена
});
```

#### 5. Главный экран
```javascript
async function showMainScreen(profile) {
  // Отображаем аватар
  userAvatar.src = profile.avatar || 'default-avatar.png';
  
  // Отображаем имя
  userName.textContent = profile.displayName;
  
  // Загружаем настройки
  const savedTimezone = localStorage.getItem('timezone') || '0';
  timezoneSelect.value = savedTimezone;
  
  // Запускаем предпросмотр
  startPreview();
}
```

#### 6. Генерация имени
```javascript
function generateNickname(baseName, timezoneOffset) {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const localTime = new Date(utc + (3600000 * timezoneOffset));
  
  const hours = String(localTime.getHours()).padStart(2, '0');
  const minutes = String(localTime.getMinutes()).padStart(2, '0');
  
  const icon = (localTime.getHours() >= 6 && localTime.getHours() < 22) ? 'Day' : 'Night';
  
  return `${baseName} | ${hours}:${minutes} | ${icon}`;
}
```
Формат: `Имя | ЧЧ:ММ | Day/Night`

#### 7. Автообновление
```javascript
let updateInterval = null;

autoUpdateToggle.addEventListener('change', () => {
  if (autoUpdateToggle.checked) {
    startAutoUpdate();
  } else {
    stopAutoUpdate();
  }
});

function startAutoUpdate() {
  updateNickname(); // Сразу обновляем
  updateInterval = setInterval(updateNickname, 60000); // Каждую минуту
}

async function updateNickname() {
  const newName = generateNickname(baseName, timezoneOffset);
  await ipcRenderer.invoke('telegram:update-profile', newName, '');
}
```

#### 8. Предпросмотр в реальном времени
```javascript
function startPreview() {
  updatePreview();
  setInterval(updatePreview, 1000); // Каждую секунду
}

function updatePreview() {
  const preview = generateNickname(baseName, timezoneOffset);
  previewNickname.textContent = preview;
}
```

#### 9. Сохранение конфигурации
```javascript
async function saveConfig() {
  const config = {
    apiId: currentApiId,
    apiHash: currentApiHash,
    sessionString: await ipcRenderer.invoke('telegram:get-session'),
    timezone: timezoneSelect.value,
    autoUpdate: autoUpdateToggle.checked
  };
  
  const userDataPath = await ipcRenderer.invoke('get-user-data-path');
  const configPath = path.join(userDataPath, 'config.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}
```

#### 10. Выход из аккаунта
```javascript
logoutBtn.addEventListener('click', async () => {
  await ipcRenderer.invoke('telegram:disconnect');
  await ipcRenderer.invoke('clear-config');
  localStorage.clear();
  location.reload();
});
```

---

### `src/renderer/particles.js` - Анимация частиц

**Назначение:** Создание красивого анимированного фона.

**Структура:**

#### 1. Инициализация Canvas
```javascript
const canvas = document.getElementById('particles-canvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
```

#### 2. Класс Particle
```javascript
class Particle {
  constructor() {
    this.x = Math.random() * canvas.width;
    this.y = Math.random() * canvas.height;
    this.vx = (Math.random() - 0.5) * 0.5;
    this.vy = (Math.random() - 0.5) * 0.5;
    this.radius = Math.random() * 2 + 1;
  }
  
  update() {
    this.x += this.vx;
    this.y += this.vy;
    
    // Отскок от границ
    if (this.x < 0 || this.x > canvas.width) this.vx *= -1;
    if (this.y < 0 || this.y > canvas.height) this.vy *= -1;
  }
  
  draw() {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.fill();
  }
}
```

#### 3. Анимационный цикл
```javascript
const particles = [];
for (let i = 0; i < 50; i++) {
  particles.push(new Particle());
}

function animate() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  particles.forEach(particle => {
    particle.update();
    particle.draw();
  });
  
  // Рисуем линии между близкими частицами
  connectParticles();
  
  requestAnimationFrame(animate);
}
```

#### 4. Соединение частиц
```javascript
function connectParticles() {
  for (let i = 0; i < particles.length; i++) {
    for (let j = i + 1; j < particles.length; j++) {
      const dx = particles[i].x - particles[j].x;
      const dy = particles[i].y - particles[j].y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance < 100) {
        ctx.beginPath();
        ctx.moveTo(particles[i].x, particles[i].y);
        ctx.lineTo(particles[j].x, particles[j].y);
        ctx.strokeStyle = `rgba(255, 255, 255, ${1 - distance / 100})`;
        ctx.stroke();
      }
    }
  }
}
```

---

## Поток данных

### 1. Запуск приложения
```
main.js (createWindow) 
  → index.html загружается
  → app.js инициализируется
  → particles.js запускается
  → loadConfig() проверяет сохранённые данные
```

### 2. Первый запуск (нет конфига)
```
Показывается api-screen
  → Пользователь вводит API ID и Hash
  → Клик "Подключиться"
  → IPC: telegram:connect
  → telegramService.connect()
  → Показывается auth-screen
```

### 3. Авторизация
```
Пользователь вводит номер телефона
  → IPC: telegram:start-auth
  → telegramService.startAuth()
  → Показывается поле для кода
  
Пользователь вводит код
  → IPC: telegram:submit-code
  → telegramService.submitCode()
  → Если нужен пароль: показывается поле для пароля
  → Иначе: авторизация завершена
  
(Опционально) Пользователь вводит пароль
  → IPC: telegram:submit-password
  → telegramService.submitPassword()
  → Авторизация завершена
```

### 4. Главный экран
```
IPC: telegram:get-me
  → telegramService.getMe()
  → Получение профиля и аватара
  → Отображение в UI
  → Загрузка настроек из localStorage
  → Запуск предпросмотра (каждую секунду)
```

### 5. Автообновление
```
Пользователь включает переключатель
  → startAutoUpdate()
  → updateNickname() вызывается сразу
  → setInterval(updateNickname, 60000)
  
Каждую минуту:
  → generateNickname()
  → IPC: telegram:update-profile
  → telegramService.updateProfile()
  → Telegram API: account.UpdateProfile
```

### 6. Сохранение конфигурации
```
При любом изменении настроек:
  → saveConfig()
  → IPC: telegram:get-session
  → Сохранение в config.json
```

---

## Стилизация

### CSS переменные
```css
:root {
  --bg-color: #000000;
  --text-color: #ffffff;
  --accent-color: #ffffff;
  --border-color: rgba(255, 255, 255, 0.2);
}
```

### Основные классы
- `.screen` - контейнер экрана
- `.input-group` - группа полей ввода
- `.btn` - кнопка
- `.toggle` - переключатель
- `.avatar` - аватар пользователя
- `.preview` - предпросмотр имени

---

## Безопасность

### Хранение данных
- **config.json** - в `%APPDATA%\telegram-nickname-updater\`
- Содержит: API credentials, session string, настройки
- Не содержит: пароли, коды подтверждения

### Session String
- Зашифрованная строка от Telegram
- Позволяет восстановить сессию без повторной авторизации
- Хранится локально, не передаётся никуда

### API Credentials
- Получаются на https://my.telegram.org
- Персональные для каждого пользователя
- Не должны передаваться третьим лицам

---

## Оптимизации

### 1. Проверка перед обновлением
```javascript
if (currentFirstName === firstName) {
  return { success: true, skipped: true };
}
```
Не обновляем, если имя уже правильное.

### 2. Отключение логов в продакшене
```javascript
const isDev = false;
const log = isDev ? console.log : () => {};
```

### 3. Переиспользование клиента
```javascript
if (this.client) {
  await this.client.disconnect();
}
this.client = new TelegramClient(...);
```

### 4. Кэширование аватара
Аватар загружается один раз при входе и сохраняется в base64.

---

## Сборка

### package.json scripts
```json
{
  "start": "electron .",
  "build": "electron-builder --win --x64",
  "build:portable": "electron-builder --win portable --x64"
}
```

### electron-builder конфигурация
```json
{
  "build": {
    "appId": "com.heliteam.telegram.nickname.updater",
    "productName": "Telegram Nickname Updater",
    "win": {
      "target": ["nsis", "portable"],
      "icon": "assets/icon.png"
    }
  }
}
```

Создаёт:
- **NSIS installer** - установщик с автозапуском
- **Portable** - .exe без установки

---

## Обработка ошибок

### В telegramService.js
```javascript
try {
  await this.client.connect();
} catch (error) {
  logError('[TelegramService] Connection failed:', error.message);
  throw error;
}
```

### В app.js
```javascript
try {
  const result = await ipcRenderer.invoke('telegram:connect', ...);
  if (!result.success) {
    showError(result.error);
  }
} catch (error) {
  showError('Неизвестная ошибка');
}
```

### В main.js
```javascript
ipcMain.handle('telegram:connect', async (event, apiId, apiHash) => {
  try {
    await telegramService.connect(apiId, apiHash);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
```

---

## Зависимости

### Production
- `telegram` (^2.26.22) - библиотека для работы с Telegram API (GramJS)
- `react` (^19.1.0) - не используется, можно удалить
- `react-dom` (^19.1.0) - не используется, можно удалить

### Development
- `electron` (^33.2.1) - фреймворк для десктопных приложений
- `electron-builder` (^25.1.8) - сборка .exe файлов
- `png-to-ico` (^3.0.1) - конвертация иконок

---

## Возможные улучшения

1. **Удалить неиспользуемые зависимости** (react, react-dom)
2. **Добавить TypeScript** для типобезопасности
3. **Добавить тесты** (Jest, Spectron)
4. **Улучшить обработку ошибок** (более детальные сообщения)
5. **Добавить логирование** (winston, electron-log)
6. **Оптимизировать анимацию** (использовать WebGL)
7. **Добавить темы** (светлая/тёмная)
8. **Поддержка других ОС** (macOS, Linux)
9. **Автообновление приложения** (electron-updater)
10. **Настройка формата имени** (пользовательские шаблоны)

---

**Документация актуальна на:** 06.02.2026  
**Версия приложения:** 1.0.0  
**Автор:** Klieer (@klir1337) - HeliTeam
