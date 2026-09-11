import { join } from 'node:path';
import { app, BrowserWindow } from 'electron';

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'OpenField',
    webPreferences: { preload: join(__dirname, '../preload/index.js') },
  });
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else win.loadFile(join(__dirname, '../renderer/index.html'));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
