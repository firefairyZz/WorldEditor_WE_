// Mica/Acrylic 测试专用 preload
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('testAPI', {
    setMaterial: (m) => ipcRenderer.invoke('set-material', m),
    recreate: (newState) => ipcRenderer.invoke('recreate', newState),
    getState: () => ipcRenderer.invoke('get-state'),
    setTheme: (theme) => ipcRenderer.invoke('set-theme', theme),
    minimize: () => ipcRenderer.send('win-minimize'),
    maximize: () => ipcRenderer.send('win-maximize'),
    close: () => ipcRenderer.send('win-close'),
    toggleTop: (flag) => ipcRenderer.invoke('win-toggle-top', flag)
});
