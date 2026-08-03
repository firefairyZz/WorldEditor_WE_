// Win11 毛玻璃/石英（Mica/Acrylic）窗口测试主进程
// 运行方式：在 JS 目录下执行  npx electron test/mica-test.js
// 注意：此文件仅用于测试，不会被主程序引用。

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

// 使用独立的 userData 目录，避免与主程序冲突（缓存锁、拒绝访问等）
app.setPath('userData', path.join(__dirname, '.userData'));

let win = null;

// 当前测试状态（可由渲染进程切换）
let state = {
    material: 'mica',      // 'none' | 'mica' | 'acrylic' | 'tabbed' | 'auto'
    transparent: false,    // 是否使用 transparent: true 重建窗口
    alwaysOnTop: false,
    theme: 'dark'          // 'light' | 'dark'
};

function createWindow() {
    const options = {
        width: 1000, height: 700,
        minWidth: 800, minHeight: 500,
        frame: false,
        // 关键：让窗口默认背景透明，Mica/Acrylic 才能透过来
        backgroundColor: '#00000000',
        // Electron 30+：构造期直接指定背景材质
        backgroundMaterial: state.material,
        icon: path.join(__dirname, '..', 'resources', 'icon.png'),
        webPreferences: {
            preload: path.join(__dirname, 'mica-preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    };

    if (state.transparent) {
        options.transparent = true;
        // 透明窗口下保留 backgroundColor 透明
    }

    win = new BrowserWindow(options);
    win.loadFile(path.join(__dirname, 'mica-test.html'));

    if (state.alwaysOnTop) win.setAlwaysOnTop(true);

    win.on('closed', () => { win = null; });
}

app.whenReady().then(() => {
    createWindow();

    // 实时切换背景材质（无需重建窗口）
    ipcMain.handle('set-material', (e, material) => {
        state.material = material;
        if (!win) return false;
        try {
            if (material === 'none') {
                // 切到"无"时恢复实心背景，避免窗口透明露出桌面
                win.setBackgroundMaterial('none');
                win.setBackgroundColor(state.theme === 'light' ? '#e8e8e8' : '#1f1f1f');
            } else {
                win.setBackgroundMaterial(material);
            }
            return true;
        } catch (err) {
            console.error('setBackgroundMaterial failed:', err);
            return false;
        }
    });

    // 切换 transparent 选项需要重建窗口
    ipcMain.handle('recreate', (e, newState) => {
        state = { ...state, ...newState };
        if (win) {
            win.close();
            createWindow();
        }
        return true;
    });

    ipcMain.handle('get-state', () => state);

    // 同步主题到主进程（用于切换"无"材质时选择正确的回退背景色）
    ipcMain.handle('set-theme', (e, theme) => {
        state.theme = theme;
        return true;
    });

    // 窗口控制
    ipcMain.on('win-minimize', () => win && win.minimize());
    ipcMain.on('win-maximize', () => {
        if (!win) return;
        if (win.isMaximized()) win.unmaximize();
        else win.maximize();
    });
    ipcMain.on('win-close', () => win && win.close());
    ipcMain.handle('win-toggle-top', (e, flag) => {
        state.alwaysOnTop = flag;
        if (win) win.setAlwaysOnTop(flag);
        return flag;
    });
});

app.on('window-all-closed', () => app.quit());
