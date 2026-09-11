import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('openfield', { version: '0.1.0' });
