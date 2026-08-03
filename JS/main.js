const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const unzipper = require('unzipper');

const USER_DIR = path.join(__dirname, 'User');
const RECENT_PATH = path.join(__dirname, 'resources', 'recent.json');
const SETTINGS_PATH = path.join(USER_DIR, 'settings.json');
const ACCOUNT_PATH = path.join(USER_DIR, 'account.json');
const ACCOUNT_AVATAR_DIR = path.join(USER_DIR, 'avatars');
const LANG_DIR = path.join(USER_DIR, 'lang');
const APP_VERSION = "0.4.2";

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
    backgroundMaterial: 'none',
    materialTint: 78,
    materialOverlay: 30,
    materialBarTint: 100,
    colorPreset: 'default-dark',
    customColors: null,
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
ui.background_material = 背景材质
ui.bg_none = 无
ui.bg_mica = 云母 (Mica)
ui.bg_acrylic = 亚克力 (Acrylic)
ui.bg_tabbed = 标签式 (Tabbed)
ui.bg_tint = 内容区透明度
ui.bg_overlay = 遮罩透明度
ui.bg_bar_tint = 标题栏透明度
ui.bg_material_hint = 仅 Windows 11 支持。当前版本为预览版，需窗口透明模式配合
ui.appearance = 外观
ui.color_preset = 主题配色
ui.color_scheme = 配色方案
ui.theme_default_dark = 默认暗色
ui.theme_default_light = 默认亮色
ui.theme_custom = 自定义
ui.custom_colors = 自定义颜色
ui.color_bg_main = 主背景
ui.color_bg_sidebar = 侧边栏
ui.color_bg_toolbar = 工具栏
ui.color_text = 文字
ui.color_text_secondary = 次要文字
ui.color_accent = 强调色
ui.color_border = 边框
ui.color_gap = 间隙
ui.reset_colors = 重置为默认
ui.coming_soon = 敬请期待
ui.always_on_top = 窗口置顶
ui.group_light = 亮色主题
ui.group_dark = 暗色主题
ui.project_template = 项目模板
ui.template_empty = 空白项目
ui.template_empty_desc = 不创建任何文件
ui.template_novel = 小说
ui.template_novel_desc = 章节、角色、大纲
ui.template_world = 世界观
ui.template_world_desc = 地理、种族、历史、魔法
ui.template_script = 剧本
ui.template_script_desc = 场景、角色、对话
ui.account = 账户
ui.account_register = 注册账户
ui.account_settings = 账户设置
ui.upload_avatar = 上传头像
ui.remove_avatar = 移除头像
ui.account_name = 账户名称
ui.account_name_placeholder = 请输入账户名称
ui.account_name_required = 请输入账户名称
ui.display_name = 显示名称
ui.display_name_placeholder = 请输入显示名称
ui.display_name_hint = 显示在项目所有者位置
ui.avatar_too_large = 头像不能超过2MB
ui.account_created = 账户创建成功
ui.account_updated = 账户已更新
ui.account_deleted = 账户已删除
ui.account_delete_confirm = 确定要删除账户吗？此操作不可撤销。
ui.account_delete_confirm_2 = 真的要删除吗？所有账户数据将被清除。
ui.change_avatar = 更换头像
ui.delete_account = 删除账户
ui.loading = 加载中...
ui.edit = 修改
ui.not_set = 未设置
ui.account_name_too_short = 账户名称至少2个字符
ui.account_name_hint = 仅支持英文、数字、下划线、连字符
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

ipcMain.handle('toggle-devtools', () => {
    if (mainWin) {
        if (mainWin.webContents.isDevToolsOpened()) {
            mainWin.webContents.closeDevTools();
        } else {
            mainWin.webContents.openDevTools({ mode: 'detach' });
        }
    }
});

// ========== 账户系统 ==========
const crypto = require('crypto');

// 生成唯一ID
function generateAccountId() {
    return 'u_' + Date.now().toString(36) + '_' + crypto.randomBytes(3).toString('hex');
}

// 读取头像 dataUrl
function getAvatarDataUrl(account) {
    try {
        if (account.avatarPath && fs.existsSync(account.avatarPath)) {
            const ext = path.extname(account.avatarPath).slice(1) || 'png';
            const data = fs.readFileSync(account.avatarPath);
            return `data:image/${ext};base64,${data.toString('base64')}`;
        }
    } catch (e) {}
    return '';
}

ipcMain.handle('get-account', () => {
    try {
        if (!fs.existsSync(ACCOUNT_PATH)) return { success: true, account: null };
        const account = JSON.parse(fs.readFileSync(ACCOUNT_PATH, 'utf-8'));
        // 读取头像文件转为 dataUrl
        account.avatarDataUrl = getAvatarDataUrl(account);
        return { success: true, account };
    } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('save-account', (event, account) => {
    try {
        if (!account || !account.name || !account.name.trim()) {
            return { success: false, error: 'Name is required' };
        }
        if (!fs.existsSync(USER_DIR)) fs.mkdirSync(USER_DIR, { recursive: true });
        if (!fs.existsSync(ACCOUNT_AVATAR_DIR)) fs.mkdirSync(ACCOUNT_AVATAR_DIR, { recursive: true });

        // 读取已有账户（保留ID）
        let existing = {};
        if (fs.existsSync(ACCOUNT_PATH)) {
            existing = JSON.parse(fs.readFileSync(ACCOUNT_PATH, 'utf-8'));
        }

        // ID 在创建时生成，之后不可修改
        if (!existing.id) {
            account.id = generateAccountId();
        } else {
            account.id = existing.id;
        }
        // 保留创建时间
        if (existing.createdAt) account.createdAt = existing.createdAt;

        // 如果有上传头像，保存到头像目录
        if (account.avatarDataUrl) {
            const base64Data = account.avatarDataUrl.replace(/^data:image\/\w+;base64,/, '');
            const ext = account.avatarDataUrl.match(/^data:image\/(\w+);base64,/)?.[1] || 'png';
            const avatarPath = path.join(ACCOUNT_AVATAR_DIR, 'avatar.' + ext);
            fs.writeFileSync(avatarPath, Buffer.from(base64Data, 'base64'));
            account.avatarPath = avatarPath;
            delete account.avatarDataUrl;
        }

        fs.writeFileSync(ACCOUNT_PATH, JSON.stringify(account, null, 2));

        // 用户改名时同步更新所有其名下项目的 owner 信息
        if (existing.id && (existing.name !== account.name || existing.displayName !== account.displayName)) {
            syncOwnerToProjects(existing.id, account);
        }

        return { success: true, account };
    } catch (e) { return { success: false, error: e.message }; }
});

// 同步用户信息到所有其名下项目
function syncOwnerToProjects(userId, account) {
    try {
        const avatarDataUrl = getAvatarDataUrl(account);
        const recent = loadRecent();
        for (const folder of recent) {
            const metaPath = path.join(folder, '.metadata');
            if (!fs.existsSync(metaPath)) continue;
            try {
                const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                if (meta.owner && meta.owner.id === userId) {
                    meta.owner.name = account.name || '';
                    meta.owner.displayName = account.displayName || account.name || '';
                    meta.owner.avatarDataUrl = avatarDataUrl;
                    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
                }
            } catch (e) {}
        }
    } catch (e) {}
}

ipcMain.handle('delete-account', () => {
    try {
        if (fs.existsSync(ACCOUNT_PATH)) {
            fs.unlinkSync(ACCOUNT_PATH);
        }
        if (fs.existsSync(ACCOUNT_AVATAR_DIR)) {
            fs.rmSync(ACCOUNT_AVATAR_DIR, { recursive: true, force: true });
        }
        return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('get-account-avatar', (event, account) => {
    try {
        if (!account || !account.avatarPath) return { success: false };
        if (fs.existsSync(account.avatarPath)) {
            const data = fs.readFileSync(account.avatarPath).toString('base64');
            const ext = path.extname(account.avatarPath).slice(1);
            return { success: true, dataUrl: `data:image/${ext};base64,${data}` };
        }
        return { success: false };
    } catch (e) { return { success: false }; }
});

ipcMain.handle('get-update-notes', async (event, lang) => {
    try {
        const updateDir = path.join(__dirname, 'resources', 'UPDATE_INF');
        if (!fs.existsSync(updateDir)) return { success: true, notes: [] };

        // 语言映射：zh_CN -> cn, en -> en, ja -> ja
        const langPrefix = (lang === 'zh_CN' || lang === 'zh-TW') ? 'cn' : (lang === 'ja' ? 'ja' : 'en');

        const entries = fs.readdirSync(updateDir, { withFileTypes: true });
        const notes = [];

        for (const entry of entries) {
            if (!entry.isDirectory()) continue;

            const ver = entry.name;
            const verMatch = ver.match(/^(\d+\.\d+\.\d+)$/);
            if (!verMatch) continue;

            const verDir = path.join(updateDir, ver);
            // 优先读取当前语言文件，找不到则回退到 en
            let langFile = path.join(verDir, `${langPrefix}.${ver}.md`);
            let fallbackFile = path.join(verDir, `en.${ver}.md`);

            let content;
            if (fs.existsSync(langFile)) {
                content = fs.readFileSync(langFile, 'utf-8');
            } else if (fs.existsSync(fallbackFile)) {
                content = fs.readFileSync(fallbackFile, 'utf-8');
            } else {
                continue;
            }

            notes.push({
                version: ver,
                content: content,
                lang: langPrefix
            });
        }

        // 按版本号降序排列
        notes.sort((a, b) => {
            const va = a.version.split('.').map(Number);
            const vb = b.version.split('.').map(Number);
            for (let i = 0; i < 3; i++) {
                if ((vb[i] || 0) !== (va[i] || 0)) return (vb[i] || 0) - (va[i] || 0);
            }
            return 0;
        });

        return { success: true, notes };
    } catch (e) { return { success: true, notes: [] }; }
});

// ========== 导出功能 ==========
ipcMain.handle('export-pdf', async (event, html, suggestedName) => {
    try {
        const { canceled, filePath } = await dialog.showSaveDialog(mainWin, {
            title: 'Export PDF',
            defaultPath: (suggestedName || 'document') + '.pdf',
            filters: [{ name: 'PDF', extensions: ['pdf'] }]
        });
        if (canceled) return { success: false, canceled: true };

        const win = new BrowserWindow({
            width: 800, height: 600,
            show: false,
            webPreferences: { contextIsolation: true, nodeIntegration: false }
        });
        await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
        // 等待渲染完成
        await new Promise(r => setTimeout(r, 300));
        const pdfData = await win.webContents.printToPDF({
            printBackground: true,
            pageSize: 'A4',
            margins: { top: 0, bottom: 0, left: 0, right: 0 }
        });
        fs.writeFileSync(filePath, pdfData);
        win.destroy();
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('export-zip', async (event, folder, suggestedName) => {
    try {
        const { canceled, filePath } = await dialog.showSaveDialog(mainWin, {
            title: 'Export ZIP',
            defaultPath: (suggestedName || 'project') + '.zip',
            filters: [{ name: 'ZIP', extensions: ['zip'] }]
        });
        if (canceled) return { success: false, canceled: true };
        const wepPath = path.join(folder, 'project.wep');
        if (!fs.existsSync(wepPath)) return { success: false, error: 'project.wep not found' };
        fs.copyFileSync(wepPath, filePath);
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
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
    const preset = appSettings.colorPreset || 'default-dark';
    const isLight = preset.includes('light') || preset === 'we-light';
    const bgColor = isLight ? '#e8e8e8' : '#2a2a2a';
    splash = new BrowserWindow({
        width: 400, height: 260, frame: false, transparent: true,
        alwaysOnTop: true, resizable: false,
        icon: path.join(__dirname, 'resources', 'icon.png'),
        webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
    });
    splash.loadFile('renderer/splash.html');
}

function createMainWindow() {
    const preset = appSettings.colorPreset || 'default-dark';
    const isLight = preset.includes('light') || preset === 'we-light';
    const material = appSettings.backgroundMaterial || 'none';
    const validMaterial = (material === 'transparent') ? 'none' : material;
    // 对齐测试文件：材质激活时窗口背景透明让 OS 材质透过；无材质时用主题不透明色
    const bgColor = (material === 'none' || material === 'transparent')
        ? (isLight ? '#e8e8e8' : '#2a2a2a')
        : '#00000000';
    mainWin = new BrowserWindow({
        width: 1000, height: 700, minWidth: 800, minHeight: 500, frame: false,
        show: false,
        backgroundColor: bgColor,
        backgroundMaterial: validMaterial,
        icon: path.join(__dirname, 'resources', 'icon.png'),
        webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
    });
    mainWin.loadFile('renderer/main.html');

    // 外部链接统一用系统浏览器打开，阻止 target="_blank" 创建新 Electron 窗口
    mainWin.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('http:') || url.startsWith('https:') || url.startsWith('mailto:') || url.startsWith('tel:')) {
            shell.openExternal(url).catch(() => {});
            return { action: 'deny' };
        }
        return { action: 'allow' };
    });
    // 备用：will-navigate 拦截当前窗口导航到外部链接
    mainWin.webContents.on('will-navigate', (e, url) => {
        if (url.startsWith('http:') || url.startsWith('https:') || url.startsWith('mailto:') || url.startsWith('tel:')) {
            e.preventDefault();
            shell.openExternal(url).catch(() => {});
        }
    });

    // 恢复窗口置顶设置
    if (appSettings.alwaysOnTop) {
        mainWin.setAlwaysOnTop(true);
    }

    mainWin.on('maximize', () => mainWin.webContents.send('maximized-change', true));
    mainWin.on('unmaximize', () => mainWin.webContents.send('maximized-change', false));
    mainWin.on('resize', () => mainWin.webContents.send('maximized-change', mainWin.isMaximized()));

    // 首次显示
    mainWin.once('ready-to-show', () => mainWin.show());

    ipcMain.on('minimize-window', () => mainWin.minimize());
    ipcMain.on('maximize-window', () => mainWin.isMaximized() ? mainWin.unmaximize() : mainWin.maximize());
    ipcMain.on('close-window', () => mainWin.close());
    ipcMain.handle('set-always-on-top', (event, flag) => {
        mainWin.setAlwaysOnTop(flag);
        return mainWin.isAlwaysOnTop();
    });
    ipcMain.handle('is-always-on-top', () => mainWin.isAlwaysOnTop());
    ipcMain.on('set-background-color', (event, color) => mainWin.setBackgroundColor(color));

    // 实时切换背景材质（云母/亚克力/标签式）
    // 对齐测试文件 set-material：none 时设不透明主题色，其他材质设透明
    ipcMain.handle('set-background-material', (event, material) => {
        if (!mainWin) return false;
        try {
            appSettings.backgroundMaterial = material;
            const validMaterial = (material === 'transparent') ? 'none' : material;
            mainWin.setBackgroundMaterial(validMaterial);
            if (material === 'none' || material === 'transparent') {
                // 无材质：恢复不透明主题色，避免露出桌面
                const preset = appSettings.colorPreset || 'default-dark';
                const isLight = preset.includes('light') || preset === 'we-light';
                mainWin.setBackgroundColor(isLight ? '#e8e8e8' : '#2a2a2a');
            } else {
                // 材质激活：窗口背景透明让 OS 材质透过
                mainWin.setBackgroundColor('#00000000');
            }
            return true;
        } catch (e) {
            console.error('set-background-material error:', e);
            return false;
        }
    });

    ipcMain.handle('get-default-project-path', (event, name) => path.join(USER_DIR, name));

    ipcMain.handle('create-project', async (event, folder, name, desc, template, projectMode) => {
        try {
            if (!fs.existsSync(folder)) {
                fs.mkdirSync(folder, { recursive: true });
            }
            // 注意：不要修改文件夹权限！使用默认继承的权限即可。
            // 之前用 SetAccessRuleProtection 切断继承导致文件夹无法删除。
            const files = {};

            // 有描述时自动创建 README
            if (desc && desc.trim()) {
                files['README.txt'] = `# ${name}\n\n${desc}`;
            }

            // 根据模板创建初始文件
            if (template === 'novel') {
                if (!files['README.txt']) files['README.txt'] = `# ${name}\n\n`;
                files['chapters/chapter1.txt'] = '第一章 开端\n\n故事从这里开始...';
                files['chapters/chapter2.txt'] = '第二章 发展\n\n';
                files['characters/protagonist.txt'] = '名称: \n角色: 主角\n性格: \n背景: \n';
                files['characters/antagonist.txt'] = '名称: \n角色: 反派\n动机: \n';
                files['outline.txt'] = '# 大纲\n\n## 第一幕\n\n## 第二幕\n\n## 第三幕\n';
            } else if (template === 'worldbuilding') {
                if (!files['README.txt']) files['README.txt'] = `# ${name}\n\n`;
                files['geography/continents.txt'] = '# 大陆\n\n';
                files['geography/locations.txt'] = '# 重要地点\n\n';
                files['races/races.txt'] = '# 种族\n\n## 人类\n\n## 精灵\n\n## 矮人\n';
                files['history/timeline.txt'] = '# 历史年表\n\n## 上古时代\n\n## 中古时代\n\n## 近代\n';
                files['magic/system.txt'] = '# 魔法体系\n\n## 能力来源\n\n## 限制\n\n## 分级\n';
                files['culture/customs.txt'] = '# 文化习俗\n\n';
            } else if (template === 'script') {
                if (!files['README.txt']) files['README.txt'] = `# ${name}\n\n`;
                files['scenes/scene1.txt'] = '场景一\n\n时间: \n地点: \n人物: \n\n[场景描述]\n\n角色A: 对白\n角色B: 对白\n';
                files['scenes/scene2.txt'] = '场景二\n\n时间: \n地点: \n人物: \n\n[场景描述]\n';
                files['characters/cast.txt'] = '# 角色表\n\n## 角色A\n性别: \n年龄: \n特征: \n\n## 角色B\n';
                files['dialogue/notes.txt'] = '# 对话笔记\n\n';
            }
            await writeProjectWep(folder, files);
            
            // 存储项目模式到 metadata
            try {
                const metaPath = path.join(folder, '.metadata');
                let metadata = {};
                if (fs.existsSync(metaPath)) {
                    metadata = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                }
                metadata.projectMode = projectMode || 'rich';
                // 写入创建者信息（包含ID用于跨用户区分）
                try {
                    if (fs.existsSync(ACCOUNT_PATH)) {
                        const account = JSON.parse(fs.readFileSync(ACCOUNT_PATH, 'utf-8'));
                        metadata.owner = {
                            id: account.id || '',
                            name: account.name || '',
                            displayName: account.displayName || account.name || '',
                            avatarDataUrl: getAvatarDataUrl(account),
                            createdAt: new Date().toISOString()
                        };
                    }
                } catch(e) {}
                fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2));
            } catch(e) {}
            
            addRecent(folder);
            // 读取刚写入的 owner 信息用于返回
            let ownerResult = null;
            try {
                if (fs.existsSync(ACCOUNT_PATH)) {
                    const account = JSON.parse(fs.readFileSync(ACCOUNT_PATH, 'utf-8'));
                    ownerResult = {
                        id: account.id || '',
                        name: account.name || '',
                        displayName: account.displayName || account.name || '',
                        avatarDataUrl: getAvatarDataUrl(account)
                    };
                }
            } catch(e) {}
            return { success: true, folder, fileList: Object.keys(files), projectMode: projectMode || 'rich', owner: ownerResult };
        } catch (e) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('open-project', async (event, folder) => {
        if (!fs.existsSync(folder)) return { success: false, error: '文件夹不存在' };
        addRecent(folder);
        try {
            const files = await readProjectWep(folder);
            // 读取项目模式和创建者信息
            let projectMode = 'rich';
            let owner = null;
            try {
                const metaPath = path.join(folder, '.metadata');
                if (fs.existsSync(metaPath)) {
                    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                    if (meta.projectMode) projectMode = meta.projectMode;
                    if (meta.owner) owner = meta.owner;
                }
            } catch(e) {}
            return { success: true, folder, name: path.basename(folder), fileList: Object.keys(files), projectMode, owner };
        } catch (e) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('read-file', async (event, folder, filename) => {
        try {
            const files = await readProjectWep(folder);
            return { success: true, content: files[filename] || '' };
        } catch (e) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('list-files', async (event, folder) => {
        try {
            const files = await readProjectWep(folder);
            return { success: true, files: Object.keys(files) };
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
            // 如果文件夹有了实际文件，移除 .keep 占位
            const dir = filename.includes('/') ? filename.substring(0, filename.lastIndexOf('/')) : '';
            if (dir && files[dir + '/.keep']) delete files[dir + '/.keep'];
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
            // 创建占位文件使文件夹在 wep 中可见
            files[folderPath + '/.keep'] = '';
            await writeProjectWep(folder, files);
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

    // 删除项目
    ipcMain.handle('delete-project', async (event, folder) => {
        try {
            if (!fs.existsSync(folder)) return { success: false, error: '文件夹不存在' };

            const { execSync } = require('child_process');
            let deleted = false;

            // Step 1: 获取所有权和完全控制权限（处理账户变更导致的权限问题）
            try {
                // 获取所有权（需要管理员权限或当前用户是所有者）
                execSync(`takeown /f "${folder}" /r /d y`, { timeout: 15000, stdio: 'pipe' });
            } catch (e) {
                // takeown 可能失败，继续尝试 icacls
            }

            try {
                // 授予当前用户完全控制权限
                const username = process.env.USERNAME || '';
                if (username) {
                    execSync(`icacls "${folder}" /grant "${username}:(OI)(CI)F" /T /C`, { timeout: 15000, stdio: 'pipe' });
                }
            } catch (e) {
                // icacls 可能失败，继续尝试
            }

            // Step 2: 清除只读/系统/隐藏属性
            try {
                execSync(`attrib -R -S -H "${folder}" /S /D`, { timeout: 5000, stdio: 'pipe' });
            } catch (e) {}

            // Step 3: 尝试各种删除方法
            // 方法A: cmd rmdir
            try {
                execSync(`cmd /c rmdir /s /q "${folder}"`, { timeout: 30000, stdio: 'pipe' });
                deleted = !fs.existsSync(folder);
            } catch (e) {}

            // 方法B: PowerShell Remove-Item
            if (!deleted) {
                try {
                    const psPath = folder.replace(/'/g, "''");
                    execSync(`powershell -NoProfile -Command "Remove-Item -LiteralPath '${psPath}' -Recurse -Force"`, { timeout: 30000, stdio: 'pipe' });
                    deleted = !fs.existsSync(folder);
                } catch (e) {}
            }

            // 方法C: fs.rmSync
            if (!deleted) {
                try {
                    fs.rmSync(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
                    deleted = !fs.existsSync(folder);
                } catch (e) {}
            }

            // 方法D: shell.trashItem
            if (!deleted) {
                try {
                    await shell.trashItem(folder);
                    deleted = !fs.existsSync(folder);
                } catch (e) {}
            }

            if (!deleted) return { success: false, error: '删除失败：文件夹可能被占用或权限不足。请尝试以管理员身份运行本程序后重试。' };

            // 从最近项目列表中移除
            let recent = loadRecent();
            recent = recent.filter(p => normalizeFolder(p) !== normalizeFolder(folder));
            saveRecent(recent);
            return { success: true };
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

    // 切换项目编辑器模式（单向转化）
    ipcMain.handle('set-project-mode', async (event, folder, newMode) => {
        try {
            const metaPath = path.join(folder, '.metadata');
            let metadata = {};
            if (fs.existsSync(metaPath)) {
                metadata = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
            }
            metadata.projectMode = newMode;
            fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2));
            return { success: true };
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
