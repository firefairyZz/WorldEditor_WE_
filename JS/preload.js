const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('weAPI', {
    minimize: () => ipcRenderer.send('minimize-window'),
    maximize: () => ipcRenderer.send('maximize-window'),
    close: () => ipcRenderer.send('close-window'),
    onMaximizedChanged: (callback) => ipcRenderer.on('maximized-change', (event, isMaximized) => callback(isMaximized)),

    getDefaultProjectPath: (name) => ipcRenderer.invoke('get-default-project-path', name),
    createProject: (folder, name, desc, template, projectMode) =>
        ipcRenderer.invoke('create-project', folder, name, desc, template, projectMode),
    openProject: (folder) => ipcRenderer.invoke('open-project', folder),
    readFile: (folder, filename) => ipcRenderer.invoke('read-file', folder, filename),
    listFiles: (folder) => ipcRenderer.invoke('list-files', folder),
    saveFile: (folder, filename, content) => ipcRenderer.invoke('save-file', folder, filename, content),
    addFile: (folder, filename) => ipcRenderer.invoke('add-file', folder, filename),
    addFolder: (folder, folderPath) => ipcRenderer.invoke('add-folder', folder, folderPath),
    selectFolder: () => ipcRenderer.invoke('select-folder'),
    getRecentProjects: () => ipcRenderer.invoke('get-recent-projects'),
    togglePinProject: (folder) => ipcRenderer.invoke('toggle-pin-project', folder),
    isProjectPinned: (folder) => ipcRenderer.invoke('is-project-pinned', folder),
    getVersion: () => ipcRenderer.invoke('get-version'),
    toggleDevTools: () => ipcRenderer.invoke('toggle-devtools'),
    getAccount: () => ipcRenderer.invoke('get-account'),
    saveAccount: (account) => ipcRenderer.invoke('save-account', account),
    deleteAccount: () => ipcRenderer.invoke('delete-account'),
    getAccountAvatar: (account) => ipcRenderer.invoke('get-account-avatar', account),
    getSettings: () => ipcRenderer.invoke('get-settings'),
    setSettings: (settings) => ipcRenderer.invoke('set-settings', settings),
    loadLang: (lang) => ipcRenderer.invoke('load-lang', lang),
    setAlwaysOnTop: (flag) => ipcRenderer.invoke('set-always-on-top', flag),
    isAlwaysOnTop: () => ipcRenderer.invoke('is-always-on-top'),

    readMetadata: (folder) => ipcRenderer.invoke('read-metadata', folder),
    saveMetadata: (folder, metadata) => ipcRenderer.invoke('save-metadata', folder, metadata),
    storeImage: (folder, imageName, imageData) => ipcRenderer.invoke('store-image', folder, imageName, imageData),
    deleteImage: (folder, imageName) => ipcRenderer.invoke('delete-image', folder, imageName),
    getUpdateNotes: (lang) => ipcRenderer.invoke('get-update-notes', lang),

    renameFile: (folder, oldPath, newPath) => ipcRenderer.invoke('rename-file', folder, oldPath, newPath),
    renameFolder: (folder, oldPath, newPath) => ipcRenderer.invoke('rename-folder', folder, oldPath, newPath),
    deleteFile: (folder, filePath) => ipcRenderer.invoke('delete-file', folder, filePath),
    deleteFolder: (folder, folderPath) => ipcRenderer.invoke('delete-folder', folder, folderPath),
    renameProject: (oldFolder, newName) => ipcRenderer.invoke('rename-project', oldFolder, newName),
    deleteProject: (folder) => ipcRenderer.invoke('delete-project', folder),

    // Splash 状态更新（仅用于 splash 页面）
    onSplashStatus: (callback) => ipcRenderer.on('splash-status', (event, text, progress) => callback(text, progress)),

    // 打开外部链接（使用系统默认浏览器）
    openExternalLink: (url) => ipcRenderer.invoke('open-external-link', url),

    setBackgroundMaterial: (material) => ipcRenderer.invoke('set-background-material', material),

    // 文件拖放支持
    saveFileFromPath: (folder, filePath) => ipcRenderer.invoke('save-file-from-path', folder, filePath),
    getProjectStats: (folder) => ipcRenderer.invoke('get-project-stats', folder),
    setProjectMode: (folder, newMode) => ipcRenderer.invoke('set-project-mode', folder, newMode),

    // 导出功能
    exportPdf: (html, filename) => ipcRenderer.invoke('export-pdf', html, filename),
    exportZip: (folder, filename) => ipcRenderer.invoke('export-zip', folder, filename),

    // 背景图片
    selectBackgroundImage: () => ipcRenderer.invoke('select-background-image'),
    getBackgroundImage: (name) => ipcRenderer.invoke('get-background-image', name),
    clearBackgroundImage: () => ipcRenderer.invoke('clear-background-image'),

    // 检查更新
    checkUpdate: () => ipcRenderer.invoke('check-update'),
});