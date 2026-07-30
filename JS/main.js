const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const unzipper = require('unzipper');

const USER_DIR = path.join(__dirname, 'User');
const RECENT_PATH = path.join(__dirname, 'resources', 'recent.json');
const SETTINGS_PATH = path.join(USER_DIR, 'settings.json');
const LANG_DIR = path.join(USER_DIR, 'lang');
const APP_VERSION = "0.3.0";

if (!fs.existsSync(USER_DIR)) fs.mkdirSync(USER_DIR);
if (!fs.existsSync(path.join(__dirname, 'resources'))) fs.mkdirSync(path.join(__dirname, 'resources'));
if (!fs.existsSync(LANG_DIR)) fs.mkdirSync(LANG_DIR);

let splash = null;
let mainWin = null;

const DEFAULT_SETTINGS = {
    language: 'zh_CN',
    theme: 'dark',
    fontFamily: 'Microsoft YaHei',
    fontSize: '16',
    autoSave: '0',
    alwaysOnTop: false,
    customShortcuts: null
};

let appSettings = { ...DEFAULT_SETTINGS };

// 确保默认语言文件存在
const defaultLangPath = path.join(LANG_DIR, 'zh_CN.lib');
if (!fs.existsSync(defaultLangPath)) {
    const defaultContent = `# WE 中文语言文件
ui.file = 文件
ui.new_project = 新建项目
ui.open_folder = 打开文件夹
ui.new_file = 新建文件
ui.recent_projects = 最近打开的项目
ui.settings = 设置
ui.save = 保存
ui.cancel = 取消
ui.create = 创建项目
ui.project_name = 项目名称
ui.description = 描述
ui.readme = 添加 README 文件
ui.sample = 添加示例世界观文件
ui.visibility = 可见性
ui.local = 本地
ui.shared = 共享
ui.general = 通用
ui.editor = 编辑器
ui.about = 关于
ui.language = 语言
ui.theme = 主题
ui.font = 字体
ui.font_size = 字体大小
ui.auto_save = 自动保存
ui.apply = 应用
ui.welcome_title1 = Welcome to
ui.welcome_title2 = World Editor
ui.owner = Owner
ui.name_required = 项目名称 *
ui.optional = (可选)
ui.local_desc = 仅在这台计算机上访问。
ui.shared_desc = 与他人同步（即将推出）。
ui.init_readme = 添加 README 文件
ui.init_sample = 添加示例世界观文件
ui.create_project = 创建项目
ui.file_new = 新建
ui.file_open = 打开
ui.file_save = 保存
ui.tab_welcome = 启程
ui.tab_new_project = 新建项目
ui.tab_settings = 设置
ui.status_ready = 就绪
ui.status_modified = 已修改
ui.status_saved = 已保存
ui.prompt_file_name = 文件名
ui.alert_unsaved = 文件未保存，确定关闭？
ui.alert_create_fail = 创建失败：
ui.alert_open_fail = 打开失败：
ui.alert_save_fail = 保存失败：
ui.alert_add_fail = 添加失败：
ui.alert_project_name_required = 项目名称不能为空
ui.settings_saved = 设置已保存
ui.always_on_top = 窗口置顶
ui.always_on_top_off = 取消窗口置顶
ui.tag_settings = 标签设置
ui.tag_label = 标签文字
ui.tag_label_placeholder = 标签内容
ui.tag_emoji = 表情
ui.no_emoji = 无表情
ui.tag_color = 颜色
ui.add_tag = 添加标签
ui.manage_tags = 管理标签
ui.manage_thumbnail = 管理缩略图
ui.thumbnail_settings = 缩略图设置
ui.current_thumbnail = 当前缩略图
ui.select_image = 选择图片
ui.upload_image = 上传图片
ui.upload_hint = 支持 PNG, JPG, GIF, WEBP 格式
ui.no_thumbnail = 暂无缩略图
ui.table_of_contents = 目录
ui.no_headings = 暂无标题，使用标题格式创建章节
ui.export_markdown = 导出 Markdown
ui.toggle_toc = 切换目录
ui.word_count = 字数统计
ui.words = 字数
ui.chars = 字符
ui.bold = 粗体
ui.italic = 斜体
ui.underline = 下划线
ui.strike = 删除线
ui.ordered_list = 有序列表
ui.bullet_list = 无序列表
ui.check_list = 任务列表
ui.quote = 引用
ui.code_block = 代码块
ui.link = 链接
ui.image = 图片
ui.heading1 = 标题1
ui.heading2 = 标题2
ui.heading3 = 标题3
ui.normal = 正文
ui.ok = 确定
ui.read_failed = 读取失败
ui.need_open_project = 请先打开一个项目
`;
    fs.writeFileSync(defaultLangPath, defaultContent, 'utf-8');
}

if (fs.existsSync(SETTINGS_PATH)) {
    try { appSettings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8')); } catch {}
}
function saveSettings() { fs.writeFileSync(SETTINGS_PATH, JSON.stringify(appSettings, null, 2)); }

// 解析 .lib 文件
function parseLibFile(lang) {
    const filePath = path.join(LANG_DIR, `${lang}.lib`);
    if (!fs.existsSync(filePath)) return {};
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split(/\r?\n/);
    const result = {};
    for (let line of lines) {
        line = line.trim();
        if (!line || line.startsWith('#')) continue;
        const idx = line.indexOf('=');
        if (idx === -1) continue;
        const key = line.substring(0, idx).trim();
        const value = line.substring(idx + 1).trim();
        if (key.startsWith('ui.')) {
            result[key] = value;
        }
    }
    return result;
}

// 全局 IPC 处理器
ipcMain.handle('get-version', () => APP_VERSION);
ipcMain.handle('get-update-notes', async () => {
    try {
        const updateDir = path.join(__dirname, 'resources', 'UPDATE_INF');
        if (!fs.existsSync(updateDir)) return { success: true, notes: [] };
        const files = fs.readdirSync(updateDir).filter(f => f.endsWith('.md')).sort();
        const notes = [];
        for (const file of files) {
            const content = fs.readFileSync(path.join(updateDir, file), 'utf-8');
            const versionMatch = file.match(/^(\d+)\.md$/);
            const versionMap = { '010': '0.1.0', '020': '0.2.0', '030': '0.3.0' };
            const version = versionMap[versionMatch?.[1]] || file.replace('.md', '');
            notes.push({ file, version, content });
        }
        return { success: true, notes };
    } catch (e) { return { success: true, notes: [] } };
});
ipcMain.handle('get-settings', () => appSettings);
ipcMain.handle('set-settings', (event, settings) => {
    appSettings = { ...appSettings, ...settings };
    saveSettings();
    return true;
});

ipcMain.handle('load-lang', (event, lang) => {
    const filePath = path.join(USER_DIR, 'lang', `${lang}.lib`);
    console.log('Loading language file:', filePath);   // 调试用，重启后可查看控制台
    if (!fs.existsSync(filePath)) {
        console.log('File not found');
        return {};
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split(/\r?\n/);
    const result = {};
    for (let line of lines) {
        line = line.trim();
        if (!line || line.startsWith('#')) continue;
        const idx = line.indexOf('=');
        if (idx === -1) continue;
        const key = line.substring(0, idx).trim();
        const value = line.substring(idx + 1).trim();
        if (key.startsWith('ui.')) {
            result[key] = value;
        }
    }
    return result;
});

// 路径标准化（去掉末尾斜杠/反斜杠）
function normalizeFolder(f) {
    return path.resolve(f).replace(/[\\/]$/, '');
}

function loadRecent() {
    if (!fs.existsSync(RECENT_PATH)) return [];
    try { return JSON.parse(fs.readFileSync(RECENT_PATH, 'utf-8')); } catch { return []; }
}
function saveRecent(folders) { fs.writeFileSync(RECENT_PATH, JSON.stringify(folders, null, 2)); }
function addRecent(folder) {
    folder = normalizeFolder(folder);
    let recent = loadRecent().map(f => normalizeFolder(f));
    recent = recent.filter(p => p !== folder);
    recent.unshift(folder);
    const unique = [...new Set(recent)];
    saveRecent(unique.slice(0, 10));
}

// 项目文件读写
function readProjectWep(folder) {
    const wepPath = path.join(folder, 'project.wep');
    if (!fs.existsSync(wepPath)) return {};
    return new Promise((resolve, reject) => {
        const data = {};
        fs.createReadStream(wepPath)
            .pipe(unzipper.Parse())
            .on('entry', entry => {
                const fileName = entry.path;
                let content = '';
                entry.on('data', chunk => content += chunk.toString());
                entry.on('end', () => { data[fileName] = content; });
            })
            .on('finish', () => resolve(data))
            .on('error', reject);
    });
}
function writeProjectWep(folder, files) {
    return new Promise((resolve, reject) => {
        const wepPath = path.join(folder, 'project.wep');
        const output = fs.createWriteStream(wepPath);
        const archive = archiver('zip', { zlib: { level: 5 } });
        archive.pipe(output);
        for (const [name, content] of Object.entries(files)) {
            archive.append(content, { name });
        }
        output.on('close', resolve);
        archive.finalize();
    });
}
function backupProject(folder) {
    const backupDir = path.join(folder, 'Backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir);
    const name = path.basename(folder);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `${name}_${timestamp}.bwep`);
    const wepPath = path.join(folder, 'project.wep');
    if (fs.existsSync(wepPath)) fs.copyFileSync(wepPath, backupPath);
}

function createSplash() {
    splash = new BrowserWindow({
        width: 400, height: 260, frame: false, transparent: true,
        alwaysOnTop: true, resizable: false,
        icon: path.join(__dirname, 'resources', 'icon.png'),   // 添加这一行
        webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
    });
    splash.loadFile('renderer/splash.html');
}

function createMainWindow() {
    const bgColor = appSettings.theme === 'light' ? '#e8e8e8' : '#2a2a2a';
    mainWin = new BrowserWindow({
        width: 1000, height: 700, minWidth: 800, minHeight: 500, frame: false, backgroundColor: bgColor,
        icon: path.join(__dirname, 'resources', 'icon.png'),   // 添加这一行
        webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
    });
    mainWin.loadFile('renderer/main.html');

    // 恢复窗口置顶设置
    if (appSettings.alwaysOnTop) {
        mainWin.setAlwaysOnTop(true);
    }

    mainWin.on('maximize', () => mainWin.webContents.send('maximized-change', true));
    mainWin.on('unmaximize', () => mainWin.webContents.send('maximized-change', false));
    mainWin.on('resize', () => mainWin.webContents.send('maximized-change', mainWin.isMaximized()));

    ipcMain.on('minimize-window', () => mainWin.minimize());
    ipcMain.on('maximize-window', () => mainWin.isMaximized() ? mainWin.unmaximize() : mainWin.maximize());
    ipcMain.on('close-window', () => mainWin.close());
    ipcMain.handle('set-always-on-top', (event, flag) => {
        mainWin.setAlwaysOnTop(flag);
        return mainWin.isAlwaysOnTop();
    });
    ipcMain.handle('is-always-on-top', () => mainWin.isAlwaysOnTop());
    ipcMain.on('set-background-color', (event, color) => mainWin.setBackgroundColor(color));

    ipcMain.handle('get-default-project-path', (event, name) => path.join(USER_DIR, name));

    ipcMain.handle('create-project', async (event, folder, name, desc, initReadme, initSample) => {
        try {
            if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
            const files = {};
            if (initReadme) files['README.txt'] = `# ${name}\n\n${desc || '欢迎'}`;
            if (initSample) {
                files['chapters/chapter1.txt'] = '第一章 开端\n\n...';
                files['characters/hero.txt'] = '名称: \n角色: \n';
            }
            await writeProjectWep(folder, files);
            addRecent(folder);
            return { success: true, folder, fileList: Object.keys(files) };
        } catch (e) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('open-project', async (event, folder) => {
        if (!fs.existsSync(folder)) return { success: false, error: '文件夹不存在' };
        addRecent(folder);
        try {
            const files = await readProjectWep(folder);
            return { success: true, folder, name: path.basename(folder), fileList: Object.keys(files) };
        } catch (e) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('read-file', async (event, folder, filename) => {
        try {
            const files = await readProjectWep(folder);
            return { success: true, content: files[filename] || '' };
        } catch (e) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('save-file', async (event, folder, filename, content) => {
        try {
            const files = await readProjectWep(folder);
            files[filename] = content;
            await writeProjectWep(folder, files);
            backupProject(folder);
            return { success: true };
        } catch (e) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('add-file', async (event, folder, filename) => {
        try {
            const files = await readProjectWep(folder);
            if (files[filename]) return { success: false, error: '文件已存在' };
            files[filename] = '';
            await writeProjectWep(folder, files);
            return { success: true };
        } catch (e) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('add-folder', async (event, folder, folderPath) => {
        try {
            const files = await readProjectWep(folder);
            // 检查是否已存在同名文件或文件夹
            if (files[folderPath]) return { success: false, error: '已存在同名项' };
            const prefix = folderPath + '/';
            // 检查是否已有文件在该路径下
            for (const key of Object.keys(files)) {
                if (key.startsWith(prefix)) return { success: false, error: '文件夹已存在' };
            }
            // 文件夹在 wep 中以路径前缀表示，无需实际创建条目
            return { success: true };
        } catch (e) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('rename-file', async (event, folder, oldPath, newPath) => {
        try {
            const files = await readProjectWep(folder);
            if (!(oldPath in files)) return { success: false, error: '文件不存在' };
            if (newPath in files) return { success: false, error: '目标文件已存在' };
            const renamed = {};
            for (const [k, v] of Object.entries(files)) {
                if (k === oldPath) renamed[newPath] = v;
                else renamed[k] = v;
            }
            await writeProjectWep(folder, renamed);
            backupProject(folder);
            return { success: true, fileList: Object.keys(renamed) };
        } catch (e) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('rename-folder', async (event, folder, oldFolder, newFolder) => {
        try {
            const files = await readProjectWep(folder);
            const renamed = {};
            let found = false;
            for (const [k, v] of Object.entries(files)) {
                if (k === oldFolder || k.startsWith(oldFolder + '/')) {
                    renamed[newFolder + k.slice(oldFolder.length)] = v;
                    found = true;
                } else {
                    renamed[k] = v;
                }
            }
            if (!found) return { success: false, error: '文件夹不存在' };
            if (newFolder in files) return { success: false, error: '目标已存在' };
            await writeProjectWep(folder, renamed);
            backupProject(folder);
            return { success: true, fileList: Object.keys(renamed) };
        } catch (e) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('delete-file', async (event, folder, filePath) => {
        try {
            const files = await readProjectWep(folder);
            if (!(filePath in files)) return { success: false, error: '文件不存在' };
            delete files[filePath];
            await writeProjectWep(folder, files);
            backupProject(folder);
            return { success: true, fileList: Object.keys(files) };
        } catch (e) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('delete-folder', async (event, folder, folderPath) => {
        try {
            const files = await readProjectWep(folder);
            const kept = {};
            let found = false;
            for (const [k, v] of Object.entries(files)) {
                if (k === folderPath || k.startsWith(folderPath + '/')) {
                    found = true;
                } else {
                    kept[k] = v;
                }
            }
            if (!found) return { success: false, error: '文件夹不存在' };
            await writeProjectWep(folder, kept);
            backupProject(folder);
            return { success: true, fileList: Object.keys(kept) };
        } catch (e) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('rename-project', async (event, oldFolder, newName) => {
        try {
            const parent = path.dirname(oldFolder);
            const newFolder = path.join(parent, newName);
            if (fs.existsSync(newFolder)) return { success: false, error: '目标文件夹已存在' };
            fs.renameSync(oldFolder, newFolder);
            // 更新最近项目列表
            let recent = loadRecent();
            recent = recent.map(p => normalizeFolder(p) === normalizeFolder(oldFolder) ? normalizeFolder(newFolder) : normalizeFolder(p));
            recent = [...new Set(recent)];
            saveRecent(recent);
            return { success: true, newFolder };
        } catch (e) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('read-metadata', async (event, folder) => {
        try {
            const files = await readProjectWep(folder);
            const metaFile = files['_metadata.json'];
            if (!metaFile) return { success: true, metadata: { tags: {}, thumbnails: {}, images: {} } };
            const metadata = JSON.parse(metaFile);
            if (!metadata.tags) metadata.tags = {};
            if (!metadata.thumbnails) metadata.thumbnails = {};
            if (!metadata.images) metadata.images = {};
            return { success: true, metadata };
        } catch (e) { return { success: true, metadata: { tags: {}, thumbnails: {}, images: {} } }; }
    });

    ipcMain.handle('save-metadata', async (event, folder, metadata) => {
        try {
            const files = await readProjectWep(folder);
            files['_metadata.json'] = JSON.stringify(metadata, null, 2);
            await writeProjectWep(folder, files);
            return { success: true };
        } catch (e) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('store-image', async (event, folder, imageName, imageData) => {
        try {
            const files = await readProjectWep(folder);
            files['_images/' + imageName] = imageData;
            await writeProjectWep(folder, files);
            return { success: true };
        } catch (e) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('delete-image', async (event, folder, imageName) => {
        try {
            const files = await readProjectWep(folder);
            delete files['_images/' + imageName];
            await writeProjectWep(folder, files);
            return { success: true };
        } catch (e) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('select-folder', async () => {
        const result = await dialog.showOpenDialog({ properties: ['openDirectory'], defaultPath: USER_DIR });
        return result.filePaths[0] || null;
    });

    // 从文件路径保存文件（用于拖放）
    ipcMain.handle('save-file-from-path', async (event, folder, filePath) => {
        try {
            if (!fs.existsSync(filePath)) return { success: false, error: '源文件不存在' };
            const content = fs.readFileSync(filePath, 'utf-8');
            const files = await readProjectWep(folder);
            const filename = path.basename(filePath);
            files[filename] = content;
            await writeProjectWep(folder, files);
            backupProject(folder);
            return { success: true, filename, fileList: Object.keys(files) };
        } catch (e) { return { success: false, error: e.message }; }
    });

    // 获取项目统计信息
    ipcMain.handle('get-project-stats', async (event, folder) => {
        try {
            const files = await readProjectWep(folder);
            const fileList = Object.keys(files).filter(f => !f.startsWith('_'));
            const totalWords = fileList.reduce((sum, f) => {
                const content = files[f] || '';
                return sum + (content.trim() ? content.trim().split(/\s+/).length : 0);
            }, 0);
            const totalChars = fileList.reduce((sum, f) => sum + (files[f]?.length || 0), 0);
            
            return { 
                success: true, 
                stats: {
                    fileCount: fileList.length,
                    totalWords,
                    totalChars,
                    projectName: path.basename(folder)
                }
            };
        } catch (e) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('get-recent-projects', () => {
        let recent = loadRecent();
        const valid = [];
        for (const folder of recent) {
            const absPath = path.resolve(folder);
            if (fs.existsSync(absPath)) {
                try {
                    const stat = fs.statSync(absPath);
                    valid.push({
                        path: absPath,
                        name: path.basename(absPath),
                        modified: stat.mtimeMs
                    });
                } catch (e) { /* 忽略 */ }
            }
        }
        if (valid.length !== recent.length) saveRecent(valid.map(p => p.path));
        return valid;
    });
}

app.whenReady().then(() => {
    createSplash();

    // 发送状态到 splash 的辅助函数
    const sendSplashStatus = (text, progress) => {
        if (splash && !splash.isDestroyed()) {
            splash.webContents.send('splash-status', text, progress);
        }
    };

    // 模拟加载步骤并更新 splash
    sendSplashStatus('正在初始化应用...', 10);

    setTimeout(() => {
        sendSplashStatus('正在检查项目文件...', 30);
    }, 400);

    setTimeout(() => {
        sendSplashStatus('正在加载配置...', 50);
    }, 900);

    setTimeout(() => {
        sendSplashStatus('正在初始化界面...', 75);
    }, 1400);

    setTimeout(() => {
        sendSplashStatus('加载完成', 100);
        // 加载完成后等待2秒，然后关闭 splash 并创建主窗口
        setTimeout(() => {
            if (splash && !splash.isDestroyed()) {
                splash.close();
                splash = null;
            }
            createMainWindow();
        }, 2000);
    }, 1800);
});

ipcMain.handle('open-external-link', async (event, url) => {
    try {
        await shell.openExternal(url);
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
