import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'node:path';
import { resolveHome } from './home';
import { AppState } from './state';
import { createIpcHandlers } from './ipc';
import { startInboxWatcher } from './watcher';
import { IPC_CHANNELS } from '../shared/ipc';

const state = new AppState(resolveHome(process.argv, join(app.getPath('userData'), 'openfield')));
let stopWatcher: (() => void) | null = null;

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 980,
    height: 760,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }
  return win;
}

void app.whenReady().then(() => {
  const handlers = createIpcHandlers(state);
  for (const channel of IPC_CHANNELS) {
    ipcMain.handle(channel, (_event, payload: unknown) => handlers[channel](payload));
  }
  const win = createWindow();
  stopWatcher = startInboxWatcher(state, (s) => win.webContents.send('inbox:changed', s));
});

app.on('window-all-closed', () => {
  stopWatcher?.();
  state.close();
  app.quit();
});
