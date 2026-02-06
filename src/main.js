const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const telegramService = require('./telegramService');

let mainWindow;
let tray = null;
let isQuitting = false;

// IPC handler for getting user data path
ipcMain.handle('get-user-data-path', () => {
  return app.getPath('userData');
});

// IPC handler for clearing config
ipcMain.handle('clear-config', () => {
  const fs = require('fs');
  const path = require('path');
  const configPath = path.join(app.getPath('userData'), 'config.json');
  try {
    if (fs.existsSync(configPath)) {
      fs.unlinkSync(configPath);
      console.log('[Main] Config cleared');
    }
    return { success: true };
  } catch (error) {
    console.error('[Main] Failed to clear config:', error);
    return { success: false, error: error.message };
  }
});

// Telegram IPC handlers
ipcMain.handle('telegram:connect', async (event, apiId, apiHash, sessionString) => {
  try {
    await telegramService.connect(apiId, apiHash, sessionString);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('telegram:start-auth', async (event, phoneNumber) => {
  try {
    const result = await telegramService.startAuth(phoneNumber);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('telegram:submit-code', async (event, code) => {
  try {
    const result = await telegramService.submitCode(code);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('telegram:submit-password', async (event, password) => {
  try {
    const result = await telegramService.submitPassword(password);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('telegram:get-me', async () => {
  try {
    const profile = await telegramService.getMe();
    return { success: true, data: profile };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('telegram:update-profile', async (event, firstName, lastName) => {
  try {
    await telegramService.updateProfile(firstName, lastName);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('telegram:disconnect', async () => {
  try {
    await telegramService.disconnect();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('telegram:get-session', () => {
  try {
    const session = telegramService.getSessionString();
    return { success: true, data: session };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Tray handlers
ipcMain.handle('set-auto-start', (event, enabled) => {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    openAsHidden: enabled
  });
  return { success: true };
});

ipcMain.handle('get-auto-start', () => {
  return { success: true, data: app.getLoginItemSettings().openAtLogin };
});

// Create tray
function createTray() {
  // Создаем простую иконку (можно заменить на свою)
  const icon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAABzSURBVFhH7ZYxDoAgDEVR7+RJPIgn8ySexDt4Eg/iSRyMiYkGA6X8xkT6kpf0p6UNIYQQQgghhBBCCCGEEEIIIYT8jxVYgRVYgRVYgRVYgRVYgRVYgRVYgRVYgRVYgRVYgRVYgRVYgRVYgRVYgRVYQUqp3gEm7xVYvwAAAABJRU5ErkJggg==');
  
  tray = new Tray(icon);
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Показать',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
        } else {
          createWindow();
        }
      }
    },
    {
      label: 'Выход',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);
  
  tray.setToolTip('Telegram Nickname Updater');
  tray.setContextMenu(contextMenu);
  
  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
      }
    } else {
      createWindow();
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    minWidth: 600,
    minHeight: 500,
    backgroundColor: '#000000',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      devTools: false // Отключаем DevTools в продакшене
    },
    frame: true,
    resizable: true,
    show: false,
    autoHideMenuBar: true // Скрываем меню автоматически
  });

  // Полностью убираем меню
  mainWindow.setMenu(null);

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      return false;
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createTray();
  createWindow();
});

app.on('window-all-closed', () => {
  // Не выходим из приложения, оставляем в трее
  // if (process.platform !== 'darwin') {
  //   app.quit();
  // }
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
