const { app, BrowserWindow, ipcMain, dialog, shell, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const unzipper = require('unzipper');
// mica-electron：Win11 真材质（Mica/Acrylic/Tabbed）。库直接调 DwmSetWindowAttribute，
// 并在 restore/resize 事件里自动重新 applyEffect()，解决最大化/还原后材质丢失问题。
// 库在 Electron 27-40 下强制 transparent:true（构造时覆盖），圆角改由 setRoundedCorner() 提供。
// 非 Win11 或 native 模块缺失时，材质方法 no-op（executeDwm 为 undefined，方法内有 if 保护）。
const { MicaBrowserWindow, IS_WINDOWS_11: IS_WIN11_MICA } = require('mica-electron');

// ═══════════════════════════════════════════════════════════════════
//  标题栏拖动方案说明
//  ───────────────────────────────────────────────────────────────────
//  使用 -webkit-app-region:drag（CSS），由 Electron 在 Chromium 层处理
//  hit-test 返回 HTCAPTION，Windows 原生接管拖动循环：
//    · 拖动跟随、Aero snap（顶/左右/四角）、双击最大化还原过渡动画
//  不使用 koffi/SendMessage(WM_NCLBUTTONDOWN,HTCAPTION)：mica-electron 的
//  removeCaption() 调 DwmSetWindowAttribute(DWMWA_NCRENDERING_POLICY) 移除了
//  Windows NC caption 渲染，SendMessage 没有 NC 处理器接收 → 无效。
//  最大化→drag 还原由 'move' 事件监听 + unmaximize + setBounds 实现。
// ═══════════════════════════════════════════════════════════════════


// 打包后使用 userData 目录（可写），开发时使用项目目录
const DATA_DIR = app.isPackaged ? app.getPath('userData') : __dirname;

const USER_DIR = path.join(DATA_DIR, 'User');
const RECENT_PATH = path.join(DATA_DIR, 'resources', 'recent.json');
const SETTINGS_PATH = path.join(USER_DIR, 'settings.json');
const ACCOUNT_PATH = path.join(USER_DIR, 'account.json');
const ACCOUNT_AVATAR_DIR = path.join(USER_DIR, 'avatars');
const LANG_DIR = path.join(USER_DIR, 'lang');
const APP_VERSION = "0.8.0";

if (!fs.existsSync(USER_DIR)) fs.mkdirSync(USER_DIR, { recursive: true });
if (!fs.existsSync(path.join(DATA_DIR, 'resources'))) fs.mkdirSync(path.join(DATA_DIR, 'resources'), { recursive: true });
if (!fs.existsSync(LANG_DIR)) fs.mkdirSync(LANG_DIR, { recursive: true });

// 打包后首次运行：从 asar 复制语言文件到可写目录
if (app.isPackaged) {
    const bundledLangDir = path.join(__dirname, 'User', 'lang');
    if (fs.existsSync(bundledLangDir)) {
        for (const file of fs.readdirSync(bundledLangDir)) {
            const destFile = path.join(LANG_DIR, file);
            if (!fs.existsSync(destFile)) {
                try { fs.copyFileSync(path.join(bundledLangDir, file), destFile); } catch (e) {}
            }
        }
    }
}

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
ui.open_folder = 打开项目
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
function saveSettings() {
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(appSettings, null, 2));
    // 追踪 backgroundMaterial 变化
    try {
        const logLine = `[${new Date().toISOString().replace('T',' ').replace('Z','')}] [saveSettings] backgroundMaterial=${appSettings.backgroundMaterial}\n`;
        fs.appendFileSync(RENDERER_LOG_PATH, logLine, 'utf8');
    } catch (e) {}
}

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

// ========== 渲染进程日志（轮转：保留最近 10 个） ==========
const RENDERER_LOG_DIR = path.join(DATA_DIR, 'log', 'JS');
if (!fs.existsSync(RENDERER_LOG_DIR)) fs.mkdirSync(RENDERER_LOG_DIR, { recursive: true });
const MAX_LOG_FILES = 10;
// 本次启动的日志文件名：renderer-YYYYMMDD-HHmmss.log
const _now = new Date();
const _pad = (n) => String(n).padStart(2, '0');
const _tsStr = `${_now.getFullYear()}${_pad(_now.getMonth() + 1)}${_pad(_now.getDate())}-${_pad(_now.getHours())}${_pad(_now.getMinutes())}${_pad(_now.getSeconds())}`;
const RENDERER_LOG_PATH = path.join(RENDERER_LOG_DIR, `renderer-${_tsStr}.log`);

// 启动时清理旧日志：只保留最近 MAX_LOG_FILES 个
(function rotateLogs() {
    try {
        const files = fs.readdirSync(RENDERER_LOG_DIR)
            .filter(f => /^renderer-\d{8}-\d{6}\.log$/.test(f))
            .sort();  // 按文件名（时间戳）升序
        const excess = files.length - MAX_LOG_FILES + 1; // +1 因为本次还要新建一个
        if (excess > 0) {
            for (let i = 0; i < excess; i++) {
                try { fs.unlinkSync(path.join(RENDERER_LOG_DIR, files[i])); } catch (e) {}
            }
        }
    } catch (e) {}
})();

// 写入分隔头
fs.writeFileSync(RENDERER_LOG_PATH, `===== World Editor 渲染进程日志 - 启动于 ${new Date().toISOString()} =====\n`, 'utf8');
// 日志缓冲：批量写入以减少磁盘 IO
let _logBuffer = [];
let _logFlushTimer = null;
function _flushLogBuffer() {
    if (_logBuffer.length === 0) return;
    const data = _logBuffer.join('\n') + '\n';
    _logBuffer = [];
    try { fs.appendFileSync(RENDERER_LOG_PATH, data, 'utf8'); } catch (e) {}
}
ipcMain.on('renderer-log', (event, level, module, message, dataStr) => {
    const ts = new Date().toISOString().replace('T', ' ').replace('Z', '');
    let line = `[${ts}] [${level}] [${module}] ${message}`;
    if (dataStr) line += ` | ${dataStr}`;
    _logBuffer.push(line);
    // 错误级别立即刷新，其他级别延迟 500ms 批量写入
    if (level === 'ERROR') {
        _flushLogBuffer();
    } else if (!_logFlushTimer) {
        _logFlushTimer = setTimeout(() => {
            _logFlushTimer = null;
            _flushLogBuffer();
        }, 500);
    }
});
// 应用退出前刷新剩余日志
app.on('before-quit', () => { _flushLogBuffer(); });

// 全局 IPC 处理器
ipcMain.handle('get-version', () => APP_VERSION);

// ========== 检查更新 ==========
const { net } = require('electron');
const UPDATE_REPO = 'firefairyZz/WorldEditor_WE_';

function compareVersions(v1, v2) {
    const p1 = String(v1).replace(/^v/, '').split('.').map(Number);
    const p2 = String(v2).replace(/^v/, '').split('.').map(Number);
    for (let i = 0; i < 3; i++) {
        const a = p1[i] || 0, b = p2[i] || 0;
        if (a > b) return 1;
        if (a < b) return -1;
    }
    return 0;
}

ipcMain.handle('check-update', async () => {
    // 优先使用 splash 阶段缓存的结果
    if (appSettings._pendingUpdateCheck) {
        const result = appSettings._pendingUpdateCheck;
        appSettings._pendingUpdateCheck = null;
        return result;
    }
    // 否则实时检查
    return await checkUpdateInternal();
});

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
        const allFolders = [...loadRecent(), ...loadPinned()];
        for (const folder of allFolders) {
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
    console.log(`[set-settings] backgroundMaterial: ${appSettings.backgroundMaterial} → ${settings.backgroundMaterial}`);
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

// recent.json 结构: { pinned: [path...], recent: [path...] }
function loadRecentData() {
    if (!fs.existsSync(RECENT_PATH)) return { pinned: [], recent: [] };
    try {
        const data = JSON.parse(fs.readFileSync(RECENT_PATH, 'utf-8'));
        // 兼容旧格式（纯数组）
        if (Array.isArray(data)) return { pinned: [], recent: data };
        if (!data.pinned) data.pinned = [];
        if (!data.recent) data.recent = [];
        return data;
    } catch { return { pinned: [], recent: [] }; }
}
function saveRecentData(data) { fs.writeFileSync(RECENT_PATH, JSON.stringify(data, null, 2)); }

function loadRecent() { return loadRecentData().recent; }
function saveRecent(folders) {
    const data = loadRecentData();
    data.recent = folders;
    saveRecentData(data);
}
function loadPinned() { return loadRecentData().pinned; }
function savePinned(folders) {
    const data = loadRecentData();
    data.pinned = folders;
    saveRecentData(data);
}

function addRecent(folder) {
    folder = normalizeFolder(folder);
    let data = loadRecentData();
    // 如果项目已固定，不添加到 recent（保持 pinned 状态不变）
    const pinnedNorm = data.pinned.map(f => normalizeFolder(f));
    if (pinnedNorm.includes(folder)) return;
    let recent = data.recent.map(f => normalizeFolder(f));
    recent = recent.filter(p => p !== folder);
    recent.unshift(folder);
    data.recent = [...new Set(recent)].slice(0, 10);
    saveRecentData(data);
}

function addPinned(folder) {
    folder = normalizeFolder(folder);
    let data = loadRecentData();
    let pinned = data.pinned.map(f => normalizeFolder(f));
    pinned = pinned.filter(p => p !== folder);
    pinned.unshift(folder);
    data.pinned = [...new Set(pinned)];
    // 同时从 recent 中移除
    data.recent = data.recent.map(f => normalizeFolder(f)).filter(p => p !== folder);
    saveRecentData(data);
}

function removePinned(folder) {
    folder = normalizeFolder(folder);
    let data = loadRecentData();
    data.pinned = data.pinned.map(f => normalizeFolder(f)).filter(p => p !== folder);
    saveRecentData(data);
}

function isPinned(folder) {
    folder = normalizeFolder(folder);
    return loadPinned().map(f => normalizeFolder(f)).includes(folder);
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
    const backupDir = path.join(USER_DIR, 'Backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const name = path.basename(folder);
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const timestamp = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const backupPath = path.join(backupDir, `${name}_${timestamp}.bwep`);
    const wepPath = path.join(folder, 'project.wep');
    if (fs.existsSync(wepPath)) {
        fs.copyFileSync(wepPath, backupPath);
        // 清理旧备份，只保留最近 10 份
        try {
            const files = fs.readdirSync(backupDir)
                .filter(f => f.startsWith(name + '_') && f.endsWith('.bwep'))
                .sort()
                .reverse();
            if (files.length > 10) {
                files.slice(10).forEach(f => {
                    try { fs.unlinkSync(path.join(backupDir, f)); } catch (e) {}
                });
            }
        } catch (e) {}
    }
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

// 应用 mica-electron 材质到窗口（OS 层）
// material: 'none' | 'mica' | 'acrylic' | 'tabbed'（'transparent' 视为 'none'）
// 非 Win11 时仅尝试圆角（库内 executeDwm 为 undefined 会 no-op），不调材质方法，
// 避免 enableMargin 在 frameless 下启动 1ms setInterval 空转浪费 CPU。
function applyMicaMaterial(win, material) {
    if (!win || win.isDestroyed()) return;
    const m = (material === 'transparent') ? 'none' : material;
    try {
        if (!IS_WIN11_MICA) {
            if (typeof win.setRoundedCorner === 'function') win.setRoundedCorner();
            return;
        }
        if (m === 'none') {
            // 关闭 DWM 材质：disableDWM → executeDwm(BACKGROUND.NONE) + disableMargin + useDWM=false
            // 窗口仍 transparent:true，靠渲染进程 CSS 实心遮罩（resetMaterialStyles）提供不透明视觉
            if (typeof win.disableDWM === 'function') win.disableDWM();
        } else if (m === 'mica') {
            win.setMicaEffect();
        } else if (m === 'acrylic') {
            win.setMicaAcrylicEffect();
        } else if (m === 'tabbed') {
            win.setMicaTabbedEffect();
        } else {
            if (typeof win.disableDWM === 'function') win.disableDWM();
        }
        // 圆角：库强制 transparent:true 会丢失 OS 原生圆角，统一用 DWM 圆角属性恢复
        // 最大化时不需要圆角（窗口占满全屏），仅非最大化时调用
        if (typeof win.setRoundedCorner === 'function' && !win.__isMaximized) win.setRoundedCorner();
    } catch (e) {
        console.error(`[applyMicaMaterial] 异常: ${e.message}`);
    }
}

function createMainWindow() {
    const material = appSettings.backgroundMaterial || 'none';
    const validMaterial = (material === 'transparent') ? 'none' : material;
    // ╔══════════════════════════════════════════════════════════════════════════════╗
    // ║  ⚠️  材质渲染核心配置 — 方案二：mica-electron 真材质                              ║
    // ║                                                                              ║
    // ║  使用 MicaBrowserWindow（mica-electron）替换原生 BrowserWindow。库直接调          ║
    // ║  DwmSetWindowAttribute 实现 Mica/Acrylic/Tabbed，并在 restore/resize 事件里        ║
    // ║  自动重新 applyEffect()，解决最大化/还原后材质丢失问题。                              ║
    // ║                                                                              ║
    // ║  库的强制行为（构造时覆盖传入参数，无法绕开）：                                       ║
    // ║    · backgroundColor → '#00ffffff'（alpha=0 透明，等效 '#00000000'）              ║
    // ║    · transparent → true（Electron 27-40 分支，保 DWM 材质合成）                   ║
    // ║  此处传入的 backgroundColor:'#00000000' 会被库覆盖，保留仅为字面记录意图。            ║
    // ║                                                                              ║
    // ║  backgroundMaterial（Electron 原生封装）不再使用：与 transparent:true 冲突，         ║
    // ║  改用库的 setMicaEffect()/setMicaAcrylicEffect()/setMicaTabbedEffect()。           ║
    // ║  圆角：transparent:true 丢失 OS 原生圆角，改由 setRoundedCorner()（DWM 圆角属性）。  ║
    // ║                                                                              ║
    // ║  正确流程：                                                                   ║
    // ║    窗口创建（库强制透明）→ ready-to-show 时 show() + applyMicaMaterial() 激活材质   ║
    // ║    切到材质：applyMicaMaterial(win, 'mica'/'acrylic'/'tabbed')                   ║
    // ║    切到 none ：applyMicaMaterial(win, 'none') → win.disableDWM()                ║
    // ║    最大化/还原：库 restore/resize 自动 applyEffect（动画后），此处不再同步重应用    ║
    // ║                                                                              ║
    // ║  运行时绝不调 setBackgroundColor（会挡死材质）。CSS 三层遮罩由渲染进程控制。          ║
    // ╚══════════════════════════════════════════════════════════════════════════════╝
    console.log(`\n========== [createMainWindow] 创建窗口 ==========`);
    console.log(`  appSettings.backgroundMaterial=${material}`);
    console.log(`  validMaterial=${validMaterial}`);
    console.log(`  IS_WIN11_MICA=${IS_WIN11_MICA}`);
    console.log(`  构造参数: MicaBrowserWindow frame:false（库强制 transparent:true + backgroundColor:'#00ffffff'）`);
    mainWin = new MicaBrowserWindow({
        width: 1000, height: 700, minWidth: 800, minHeight: 500, frame: false,
        show: false,
        backgroundColor: '#00000000',  // 库会强制覆盖为 '#00ffffff'，保留仅为记录意图
        icon: path.join(__dirname, 'resources', 'icon.png'),
        webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
    });
    console.log(`[createMainWindow] 窗口已创建 | id=${mainWin.id} | useDWM=${mainWin.useDWM}`);
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

    // 最大化/还原事件：仅通知渲染进程更新图标与 is-maximized 标记；
    // 材质重应用延迟 280ms 后再执行（Win11 最大化过渡动画约 200-250ms），
    // 之前同步调用会在动画中途调用 DwmSetWindowAttribute → Windows 中止过渡 → "最大化非常生硬"。
    // mica-electron 库自身的 restore/resize 监听（restore→applyEffect, resize→60ms 后 applyEffect）
    // 已经作为一层兜底，此处延迟重应用是在过渡结束后兜底刷新，避免肉眼可见的材质闪黑/丢失。
    let matApplyTimer = null;
    const scheduleApplyMaterial = () => {
        if (matApplyTimer) clearTimeout(matApplyTimer);
        matApplyTimer = setTimeout(() => {
            applyMicaMaterial(mainWin, appSettings.backgroundMaterial);
        }, 280);
    };
    // 最大化状态拖动标题栏不还原是 frameless+transparent 的已知限制：
    // mica-electron 的 removeCaption() 已移除 Windows NC caption，
    // 没有 NC 处理器接收拖动 → 逐帧 setBounds 无法触发系统动画/Aero snap，
    // 主进程 'move' 事件检测又会与最大化动画产生竞态 → 撤销最大化。
    // 用户可通过双击标题栏（drag region 双击系统自动还原）或点最大化按钮还原。
    let lastNormalBounds = null;
    const saveNormalBounds = () => {
        if (!mainWin || mainWin.isDestroyed()) return;
        if (!mainWin.isMaximized()) {
            lastNormalBounds = mainWin.getBounds();
        }
    };
    mainWin.on('move', saveNormalBounds);
    mainWin.on('resize', saveNormalBounds);
    mainWin.once('ready-to-show', () => { saveNormalBounds(); });

    // 最大化/还原事件：通知渲染进程 + 延迟重应用材质（280ms 等 DWM 动画完成）
    // 不使用 setResizable()：会影响 Aero snap，导致还原后 snap 失效。
    // 改用 will-resize 事件阻止最大化时的边缘缩放。
    // __isMaximized 标记：true = 最大化（含 Aero snap 最大化，isMaximized() 可能返回 false）
    mainWin.on('maximize', () => {
        console.log('[maximize] event fired');
        mainWin.__isMaximized = true;
        mainWin.webContents.send('maximized-change', true);
        scheduleApplyMaterial();
    });
    mainWin.on('unmaximize', () => {
        console.log('[unmaximize] event fired');
        mainWin.__isMaximized = false;
        mainWin.webContents.send('maximized-change', false);
        scheduleApplyMaterial();
    });
    // 最大化时阻止边缘缩放（frameless 窗口原生 resize 边缘仍可触发）
    mainWin.on('will-resize', (event) => {
        if (mainWin.__isMaximized) {
            event.preventDefault();
        }
    });
    // Aero snap 最大化检测：拖到顶部触发系统最大化，不经过 Electron maximize() API，
    // isMaximized() 返回 false → __isMaximized 没同步 → 渲染进程状态错误
    // 监听 resize 后检测窗口是否占据整个工作区（4px 容差）
    let aeroSnapTimer = null;
    mainWin.on('resize', () => {
        if (aeroSnapTimer) clearTimeout(aeroSnapTimer);
        aeroSnapTimer = setTimeout(() => {
            if (!mainWin || mainWin.isDestroyed()) return;
            const b = mainWin.getBounds();
            const wa = screen.getDisplayMatching(b).workArea;
            // 检测是否占据整个工作区（Aero snap 最大化）
            const isSnapMaximized = !mainWin.isMaximized() &&
                Math.abs(b.x - wa.x) <= 4 && Math.abs(b.y - wa.y) <= 4 &&
                Math.abs(b.width - wa.width) <= 4 && Math.abs(b.height - wa.height) <= 4;
            if (isSnapMaximized && !mainWin.__isMaximized) {
                console.log('[aero-snap] detected snap maximize');
                mainWin.__isMaximized = true;
                mainWin.webContents.send('maximized-change', true);
            }
        }, 100);
    });

    // 首次显示：show() 触发库的 show 事件（初始化 frameless caption 等），
    // 随后激活材质。首次 show 时 useDWM=false，库的 applyEffect no-op，
    // 必须主动调一次 set 方法让 useDWM=true，后续 restore/resize 才能自动重应用。
    mainWin.once('ready-to-show', () => {
        mainWin.show();
        applyMicaMaterial(mainWin, appSettings.backgroundMaterial);
        // 主动发送当前最大化状态，确保渲染进程初始化 win-maximized class
        // （防止 maximize 事件在渲染进程 IPC 监听器注册前触发）
        mainWin.webContents.send('maximized-change', mainWin.isMaximized());
    });

    ipcMain.on('minimize-window', () => mainWin.minimize());
    // 最大化/还原切换：处理三种状态
    //   1. isMaximized()=true → 标准 unmaximize
    //   2. __isMaximized=true 但 isMaximized()=false → Aero snap 假最大化，手动 setBounds 还原
    //   3. 都不是 → maximize()
    ipcMain.on('maximize-window', () => {
        if (!mainWin || mainWin.isDestroyed()) return;
        if (mainWin.isMaximized()) {
            mainWin.unmaximize();
        } else if (mainWin.__isMaximized) {
            // Aero snap 最大化（isMaximized 返回 false），手动还原到上次正常 bounds
            console.log('[maximize-btn] restoring from aero-snap maximize');
            mainWin.__isMaximized = false;
            mainWin.webContents.send('maximized-change', false);
            if (lastNormalBounds) {
                mainWin.setBounds(lastNormalBounds);
            } else {
                // 无记录 bounds，用默认尺寸
                mainWin.setSize(1000, 700, true);
                mainWin.center();
            }
        } else {
            mainWin.maximize();
        }
    });
    ipcMain.on('unmaximize-window', () => { if (mainWin && !mainWin.isDestroyed() && mainWin.isMaximized()) mainWin.unmaximize(); });
    ipcMain.on('close-window', () => mainWin.close());
    ipcMain.handle('is-maximized', () => !!(mainWin && !mainWin.isDestroyed() && mainWin.isMaximized()));

    // 最大化→拖动还原：渲染进程在最大化窗口上 mousedown 时发起
    // 主进程 unmaximize + 等 resize 生效 + 按比例缩放后的抓取偏移重定位
    // （光标在标题栏的相对位置保持不变：最大化中心 → 还原中心）
    ipcMain.handle('restore-for-drag', async (event, cursorX, cursorY, clientX, clientY, maximizedWidth) => {
        if (!mainWin || mainWin.isDestroyed()) return null;
        if (mainWin.isMaximized()) {
            // 等 unmaximize 的 resize 生效，确保 getSize() 返回还原后尺寸再重定位
            await new Promise(resolve => {
                let done = false;
                const onResize = () => {
                    if (done) return;
                    done = true;
                    mainWin.removeListener('resize', onResize);
                    resolve();
                };
                mainWin.once('resize', onResize);
                mainWin.unmaximize(); // 触发 unmaximize 事件 → __isMaximized=false + setMaximized(false)
                setTimeout(onResize, 150); // 兜底：resize 未触发也继续
            });
        }
        const [restoredWidth] = mainWin.getSize();
        // 按 X 比例缩放：最大化时光标在标题栏的相对位置 → 还原后同一相对位置
        const ratio = maximizedWidth > 0 ? (clientX / maximizedWidth) : 0.5;
        const grabX = ratio * restoredWidth;
        const grabY = clientY; // 标题栏顶部对齐，Y 无需缩放
        mainWin.setPosition(Math.round(cursorX - grabX), Math.round(cursorY - grabY));
        return { grabX, grabY };
    });
    // 逐帧跟随：渲染进程 mousemove 调用，移动窗口到指定屏幕坐标
    ipcMain.on('move-window-to', (event, x, y) => {
        if (!mainWin || mainWin.isDestroyed()) return;
        if (mainWin.isMaximized()) return; // 还原未完成，跳过
        mainWin.setPosition(Math.round(x), Math.round(y));
    });
    // Aero snap 手动触发：JS setPosition 拖动不触发系统 snap，靠 mouseup 边缘检测手动触发
    // top → 最大化；left → 左半屏；right → 右半屏
    ipcMain.handle('aero-snap', async (event, snap) => {
        if (!mainWin || mainWin.isDestroyed()) return false;
        if (mainWin.__isMaximized) {
            // 已最大化状态拖动还原后 snap：先确保 __isMaximized=false
            mainWin.__isMaximized = false;
            mainWin.webContents.send('maximized-change', false);
        }
        const cursor = screen.getCursorScreenPoint();
        const display = screen.getDisplayMatching({ x: cursor.x, y: cursor.y, width: 1, height: 1 });
        const wa = display.workArea;
        if (snap === 'top') {
            // 顶部 → 最大化
            mainWin.setBounds({ x: wa.x, y: wa.y, width: wa.width, height: wa.height });
            mainWin.__isMaximized = true;
            mainWin.webContents.send('maximized-change', true);
        } else if (snap === 'left') {
            // 左半屏
            mainWin.setBounds({ x: wa.x, y: wa.y, width: Math.floor(wa.width / 2), height: wa.height });
            mainWin.webContents.send('maximized-change', false);
        } else if (snap === 'right') {
            // 右半屏
            const halfW = Math.floor(wa.width / 2);
            mainWin.setBounds({ x: wa.x + halfW, y: wa.y, width: wa.width - halfW, height: wa.height });
            mainWin.webContents.send('maximized-change', false);
        }
        return true;
    });

    ipcMain.handle('set-always-on-top', (event, flag) => {
        mainWin.setAlwaysOnTop(flag);
        return mainWin.isAlwaysOnTop();
    });
    ipcMain.handle('is-always-on-top', () => mainWin.isAlwaysOnTop());

    // ╔══════════════════════════════════════════════════════════════════╗
    // ║  ⚠️  材质切换 IPC — 方案二：mica-electron                            ║
    // ║                                                                    ║
    // ║  按材质类型调 mica-electron 对应方法（见 applyMicaMaterial）：          ║
    // ║    mica    → mainWin.setMicaEffect()                              ║
    // ║    acrylic → mainWin.setMicaAcrylicEffect()                       ║
    // ║    tabbed  → mainWin.setMicaTabbedEffect()                        ║
    // ║    none    → mainWin.disableDWM()（关闭 DWM，靠 CSS 实心遮罩）       ║
    // ║  非材质方法均附带 setRoundedCorner()（transparent:true 下保圆角）       ║
    // ║                                                                    ║
    // ║  核心原则：运行时绝不调 setBackgroundColor（会挡死材质）。              ║
    // ║  CSS 三层遮罩（--content-tint/--overlay-tint/--title-bar-tint）       ║
    // ║  由渲染进程 applyBackgroundMaterial() 控制，本 IPC 只管 OS 层材质。     ║
    // ║                                                                    ║
    // ║  渲染进程调用顺序：先 await IPC（等 OS 材质生效），再改 CSS             ║
    // ║  否则 CSS 先变半透明时材质还没生效，会看到桌面 → 拖影                  ║
    // ╚══════════════════════════════════════════════════════════════════╝
    ipcMain.handle('set-background-material', (event, material) => {
        const ts = new Date().toISOString();
        console.log(`\n========== [材质切换 ${ts}] 开始 ==========`);
        console.log(`[1/4] 收到请求 | 入参 material="${material}"`);
        if (!mainWin) {
            console.error(`[材质切换] ✗ 终止：mainWin 不存在`);
            return false;
        }
        try {
            const prevMaterial = appSettings.backgroundMaterial;
            appSettings.backgroundMaterial = material;
            const validMaterial = (material === 'transparent') ? 'none' : material;
            console.log(`[2/4] 配置变更 | 前=${prevMaterial} → 新=${material} → 有效值=${validMaterial}`);

            // 应用 OS 层材质（mica-electron）：按类型调对应 set 方法
            applyMicaMaterial(mainWin, validMaterial);
            console.log(`[3/4] OS 层材质已应用 | useDWM=${mainWin.useDWM} effect=${mainWin.effect}`);

            // 持久化到 settings.json
            try {
                fs.writeFileSync(SETTINGS_PATH, JSON.stringify(appSettings, null, 2));
                console.log(`[4/4] 已持久化到 settings.json`);
            } catch (saveErr) {
                console.error(`[4/4] ⚠ 持久化失败：${saveErr.message}`);
            }

            console.log(`========== [材质切换] 完成 ==========\n`);
            return true;
        } catch (e) {
            console.error(`========== [材质切换] ✗ 异常 ==========`);
            console.error(`  错误信息：${e.message}`);
            console.error(`  堆栈：${e.stack}`);
            console.error(`=======================================\n`);
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
            // 更新最近项目和固定项目列表
            let data = loadRecentData();
            data.recent = data.recent.map(p => normalizeFolder(p) === normalizeFolder(oldFolder) ? normalizeFolder(newFolder) : normalizeFolder(p));
            data.pinned = data.pinned.map(p => normalizeFolder(p) === normalizeFolder(oldFolder) ? normalizeFolder(newFolder) : normalizeFolder(p));
            data.recent = [...new Set(data.recent)];
            data.pinned = [...new Set(data.pinned)];
            saveRecentData(data);
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

            // 从最近项目和固定项目中移除
            let data = loadRecentData();
            data.recent = data.recent.filter(p => normalizeFolder(p) !== normalizeFolder(folder));
            data.pinned = data.pinned.filter(p => normalizeFolder(p) !== normalizeFolder(folder));
            saveRecentData(data);
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

    // 选择背景图片：复制到 User/bg-image.<ext>，返回文件名
    ipcMain.handle('select-background-image', async () => {
        const result = await dialog.showOpenDialog({
            properties: ['openFile'],
            filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'] }],
            defaultPath: USER_DIR
        });
        if (!result.filePaths[0]) return null;
        const filePath = result.filePaths[0];
        const ext = path.extname(filePath).slice(1).toLowerCase();
        const destName = `bg-image.${ext}`;
        const destPath = path.join(USER_DIR, destName);
        // 清理旧图
        try {
            fs.readdirSync(USER_DIR).forEach(f => {
                if (f.startsWith('bg-image.')) fs.unlinkSync(path.join(USER_DIR, f));
            });
        } catch (e) {}
        fs.copyFileSync(filePath, destPath);
        return destName;
    });

    // 读取背景图片为 dataURL
    ipcMain.handle('get-background-image', async (event, imageName) => {
        if (!imageName) return null;
        const imgPath = path.join(USER_DIR, imageName);
        if (!fs.existsSync(imgPath)) return null;
        const data = fs.readFileSync(imgPath);
        const ext = path.extname(imageName).slice(1).toLowerCase();
        const mime = ext === 'jpg' ? 'jpeg' : ext;
        return `data:image/${mime};base64,${data.toString('base64')}`;
    });

    // 清除背景图片
    ipcMain.handle('clear-background-image', async () => {
        try {
            fs.readdirSync(USER_DIR).forEach(f => {
                if (f.startsWith('bg-image.')) fs.unlinkSync(path.join(USER_DIR, f));
            });
        } catch (e) {}
        return true;
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
        const buildList = (folders) => {
            const valid = [];
            for (const folder of folders) {
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
            return valid;
        };

        let data = loadRecentData();
        let pinned = buildList(data.pinned);
        let recent = buildList(data.recent);

        // 清理无效路径
        const validPinnedPaths = pinned.map(p => p.path);
        const validRecentPaths = recent.map(p => p.path);
        if (validPinnedPaths.length !== data.pinned.length || validRecentPaths.length !== data.recent.length) {
            saveRecentData({ pinned: validPinnedPaths, recent: validRecentPaths });
        }
        return { pinned, recent };
    });

    ipcMain.handle('toggle-pin-project', (event, folder) => {
        try {
            if (isPinned(folder)) {
                removePinned(folder);
                return { success: true, pinned: false };
            } else {
                addPinned(folder);
                return { success: true, pinned: true };
            }
        } catch (e) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('is-project-pinned', (event, folder) => {
        return isPinned(folder);
    });
}

// ====== 教程初始化 ======
const TUTORIAL_SRC_DIR = path.join(__dirname, 'resources', 'Tutorial', '使用教程(CN)');

function initTutorial() {
    // 开发环境跳过
    if (!app.isPackaged) return;

    const userDataDir = app.getPath('userData');
    const tutorialDir = path.join(userDataDir, 'Tutorial', '使用教程(CN)');

    // 如果 userData 里没有教程，从打包资源复制一份
    if (!fs.existsSync(tutorialDir)) {
        try {
            fs.mkdirSync(path.dirname(tutorialDir), { recursive: true });
            copyFolderSync(TUTORIAL_SRC_DIR, tutorialDir);
        } catch (e) {
            console.error('复制教程失败:', e);
            return;
        }
    }
}

function copyFolderSync(src, dest) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyFolderSync(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

function initRecentJson() {
    // 确保 recent.json 存在
    if (!fs.existsSync(RECENT_PATH)) {
        saveRecentData({ pinned: [], recent: [] });
    }

    // 首次打开：将使用教程固定到 pinned
    const tutorialDir = app.isPackaged
        ? path.join(app.getPath('userData'), 'Tutorial', '使用教程(CN)')
        : TUTORIAL_SRC_DIR;

    if (fs.existsSync(tutorialDir)) {
        const data = loadRecentData();
        const tutorialNorm = normalizeFolder(tutorialDir);
        const pinnedNorm = data.pinned.map(f => normalizeFolder(f));
        if (!pinnedNorm.includes(tutorialNorm)) {
            data.pinned.unshift(tutorialDir);
            saveRecentData(data);
        }
    }
}

app.whenReady().then(() => {
    // 初始化教程和 recent.json（在主窗口打开前）
    initTutorial();
    initRecentJson();

    createSplash();

    // 发送状态到 splash 的辅助函数
    const sendSplashStatus = (text, progress) => {
        if (splash && !splash.isDestroyed()) {
            splash.webContents.send('splash-status', text, progress);
        }
    };

    // 保存更新检查结果供主窗口使用
    let updateCheckResult = null;

    // 步骤 1：初始化
    sendSplashStatus('正在初始化应用...', 10);

    // 步骤 2：检查更新（在 splash 阶段完成，结果传递给主窗口）
    setTimeout(async () => {
        sendSplashStatus('正在检查更新...', 25);
        try {
            updateCheckResult = await checkUpdateInternal();
        } catch (e) {
            updateCheckResult = { success: false };
        }
        sendSplashStatus(updateCheckResult && updateCheckResult.hasUpdate
            ? `发现新版本 v${updateCheckResult.latestVersion}`
            : '已是最新版本', 40);

        // 步骤 3：继续加载
        setTimeout(() => {
            sendSplashStatus('正在加载配置...', 60);
        }, 300);

        setTimeout(() => {
            sendSplashStatus('正在初始化界面...', 80);
        }, 800);

        setTimeout(() => {
            // 检查是否有需要传递给主窗口的更新信息
            if (updateCheckResult && updateCheckResult.hasUpdate && mainWin) {
                // 主窗口创建后会通过 IPC 获取此结果
                appSettings._pendingUpdateCheck = updateCheckResult;
            }
            sendSplashStatus('加载完成', 100);
            setTimeout(() => {
                if (splash && !splash.isDestroyed()) {
                    splash.close();
                    splash = null;
                }
                createMainWindow();
            }, 800);
        }, 1400);
    }, 400);
});

// 内部更新检查函数（可在 splash 阶段调用）
function checkUpdateInternal() {
    return new Promise((resolve) => {
        const request = net.request({
            method: 'GET',
            url: `https://api.github.com/repos/${UPDATE_REPO}/releases/latest`,
            useSessionCookies: false,
        });
        request.setHeader('User-Agent', 'WorldEditor-Update-Checker');
        request.setHeader('Accept', 'application/vnd.github+json');
        request.on('response', (response) => {
            if (response.statusCode !== 200) {
                resolve({ success: false, isDevEnvironment: !app.isPackaged });
                return;
            }
            let body = '';
            response.on('data', (chunk) => { body += chunk.toString(); });
            response.on('end', () => {
                try {
                    const data = JSON.parse(body);
                    if (!data || !data.tag_name) {
                        resolve({ success: false, isDevEnvironment: !app.isPackaged });
                        return;
                    }
                    const latestVersion = data.tag_name.replace(/^v/, '');
                    const hasUpdate = compareVersions(latestVersion, APP_VERSION) > 0;
                    resolve({
                        success: true,
                        hasUpdate,
                        isDevEnvironment: !app.isPackaged,
                        currentVersion: APP_VERSION,
                        latestVersion,
                        releaseUrl: data.html_url || `https://github.com/${UPDATE_REPO}/releases/tag/v${latestVersion}`,
                    });
                } catch (e) { resolve({ success: false, isDevEnvironment: !app.isPackaged }); }
            });
        });
        request.on('error', () => resolve({ success: false, isDevEnvironment: !app.isPackaged }));
        request.on('aborted', () => resolve({ success: false, isDevEnvironment: !app.isPackaged }));
        setTimeout(() => { request.abort(); resolve({ success: false, isDevEnvironment: !app.isPackaged }); }, 8000);
        request.end();
    });
}

ipcMain.handle('open-external-link', async (event, url) => {
    try {
        await shell.openExternal(url);
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
