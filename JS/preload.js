const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('weAPI', {
    minimize: () => ipcRenderer.send('minimize-window'),
    maximize: () => ipcRenderer.send('maximize-window'),
    close: () => ipcRenderer.send('close-window'),
    onMaximizedChanged: (callback) => ipcRenderer.on('maximized-change', (event, isMaximized) => callback(isMaximized)),

    getDefaultProjectPath: (name) => ipcRenderer.invoke('get-default-project-path', name),
    createProject: (folder, name, desc, initReadme, initSample) =>
        ipcRenderer.invoke('create-project', folder, name, desc, initReadme, initSample),
    openProject: (folder) => ipcRenderer.invoke('open-project', folder),
    readFile: (folder, filename) => ipcRenderer.invoke('read-file', folder, filename),
    saveFile: (folder, filename, content) => ipcRenderer.invoke('save-file', folder, filename, content),
    addFile: (folder, filename) => ipcRenderer.invoke('add-file', folder, filename),
    addFolder: (folder, folderPath) => ipcRenderer.invoke('add-folder', folder, folderPath),
    selectFolder: () => ipcRenderer.invoke('select-folder'),
    getRecentProjects: () => ipcRenderer.invoke('get-recent-projects'),
    getVersion: () => ipcRenderer.invoke('get-version'),
    getSettings: () => ipcRenderer.invoke('get-settings'),
    setSettings: (settings) => ipcRenderer.invoke('set-settings', settings),
    loadLang: (lang) => ipcRenderer.invoke('load-lang', lang),
    setAlwaysOnTop: (flag) => ipcRenderer.invoke('set-always-on-top', flag),
    isAlwaysOnTop: () => ipcRenderer.invoke('is-always-on-top'),

    readMetadata: (folder) => ipcRenderer.invoke('read-metadata', folder),
    saveMetadata: (folder, metadata) => ipcRenderer.invoke('save-metadata', folder, metadata),
    storeImage: (folder, imageName, imageData) => ipcRenderer.invoke('store-image', folder, imageName, imageData),
    deleteImage: (folder, imageName) => ipcRenderer.invoke('delete-image', folder, imageName),
    getUpdateNotes: () => ipcRenderer.invoke('get-update-notes'),

    renameFile: (folder, oldPath, newPath) => ipcRenderer.invoke('rename-file', folder, oldPath, newPath),
    renameFolder: (folder, oldPath, newPath) => ipcRenderer.invoke('rename-folder', folder, oldPath, newPath),
    deleteFile: (folder, filePath) => ipcRenderer.invoke('delete-file', folder, filePath),
    deleteFolder: (folder, folderPath) => ipcRenderer.invoke('delete-folder', folder, folderPath),
    renameProject: (oldFolder, newName) => ipcRenderer.invoke('rename-project', oldFolder, newName),

    // Splash 状态更新（仅用于 splash 页面）
    onSplashStatus: (callback) => ipcRenderer.on('splash-status', (event, text, progress) => callback(text, progress)),

    // 打开外部链接（使用系统默认浏览器）
    openExternalLink: (url) => ipcRenderer.invoke('open-external-link', url),

    setBackgroundColor: (color) => ipcRenderer.send('set-background-color', color),

    // 文件拖放支持
    saveFileFromPath: (folder, filePath) => ipcRenderer.invoke('save-file-from-path', folder, filePath),
    getProjectStats: (folder) => ipcRenderer.invoke('get-project-stats', folder),
});