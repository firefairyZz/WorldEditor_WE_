const { app, BrowserWindow, ipcMain, dialog, shell, screen, nativeTheme, protocol } = require('electron');
const path = require('path');
const fs = require('fs');
const { pipeline } = require('stream');
const archiver = require('archiver');
const unzipper = require('unzipper');
const crypto = require('crypto');

// ========== 自定义文件协议 ==========
// 用于在渲染进程中直接访问本地文件（避免 IPC 传输大数据）
const tempFileMap = new Map(); // { fileId: { path, mimeType, expireAt } }
const FILE_URL_PROTOCOL = 'we-file';
const FILE_URL_TTL = 600000; // 10 分钟过期

// 注册为特权协议（必须在 app.whenReady() 之前调用）
// 这样 <img>、<video>、fetch() 等才能正常使用 we-file:// URL
protocol.registerSchemesAsPrivileged([
    { scheme: FILE_URL_PROTOCOL, privileges: { standard: true, secure: true, supportFetchAPI: true } }
]);
console.log('[file-protocol] 已注册为特权协议');

// 注册文件协议（在 app.whenReady 后调用）
function registerFileProtocol() {
    try {
        // Electron 30+ 使用 protocol.handle（更可靠）
        if (typeof protocol.handle === 'function') {
            protocol.handle(FILE_URL_PROTOCOL, (request) => {
                try {
                    const url = new URL(request.url);
                    const fileId = url.hostname;
                    
                    const entry = tempFileMap.get(fileId);
                    if (!entry) {
                        console.warn(`[file-protocol] 文件 ID 不存在或已过期: ${fileId}`);
                        return new Response('Not Found', { status: 404 });
                    }
                    
                    // 检查是否过期
                    if (Date.now() > entry.expireAt) {
                        tempFileMap.delete(fileId);
                        return new Response('Gone', { status: 410 });
                    }
                    
                    // 文件是否存在
                    if (!fs.existsSync(entry.path)) {
                        console.warn(`[file-protocol] 文件不存在: ${entry.path}`);
                        return new Response('File Not Found', { status: 404 });
                    }
                    
                    // 读取文件并返回
                    const fileBuffer = fs.readFileSync(entry.path);
                    return new Response(fileBuffer, {
                        status: 200,
                        headers: {
                            'Content-Type': entry.mimeType || 'application/octet-stream',
                            'Cache-Control': 'max-age=3600',
                            'Content-Length': fileBuffer.length
                        }
                    });
                } catch (e) {
                    console.error('[file-protocol] 错误:', e);
                    return new Response('Internal Server Error', { status: 500 });
                }
            });
            console.log('[file-protocol] 已注册 we-file 协议（使用 protocol.handle）');
        } else {
            // 回退：使用旧版 registerFileProtocol
            if (protocol.isProtocolRegistered(FILE_URL_PROTOCOL)) return;
            
            protocol.registerFileProtocol(FILE_URL_PROTOCOL, (request, callback) => {
                try {
                    const url = new URL(request.url);
                    const fileId = url.hostname;
                    
                    const entry = tempFileMap.get(fileId);
                    if (!entry) {
                        console.warn(`[file-protocol] 文件 ID 不存在或已过期: ${fileId}`);
                        callback({ statusCode: 404 });
                        return;
                    }
                    
                    if (Date.now() > entry.expireAt) {
                        tempFileMap.delete(fileId);
                        callback({ statusCode: 410 });
                        return;
                    }
                    
                    if (!fs.existsSync(entry.path)) {
                        callback({ statusCode: 404 });
                        return;
                    }
                    
                    callback({
                        path: entry.path,
                        headers: {
                            'Content-Type': entry.mimeType || 'application/octet-stream',
                            'Cache-Control': 'max-age=3600'
                        }
                    });
                } catch (e) {
                    console.error('[file-protocol] 错误:', e);
                    callback({ statusCode: 500 });
                }
            });
            console.log('[file-protocol] 已注册 we-file 协议（使用 registerFileProtocol）');
        }
    } catch (e) {
        console.error('[file-protocol] 注册失败:', e);
    }
}

// 注册一个临时文件访问，返回 URL
function registerTempFile(localPath, mimeType = 'application/octet-stream') {
    // 清理过期条目
    const now = Date.now();
    for (const [id, entry] of tempFileMap) {
        if (entry.expireAt < now) tempFileMap.delete(id);
    }
    
    const fileId = crypto.randomBytes(12).toString('hex');
    tempFileMap.set(fileId, {
        path: localPath,
        mimeType: mimeType,
        expireAt: now + FILE_URL_TTL
    });
    
    return `${FILE_URL_PROTOCOL}://${fileId}`;
}

// 清理临时文件映射
function cleanupTempFiles() {
    const now = Date.now();
    let cleaned = 0;
    for (const [id, entry] of tempFileMap) {
        if (entry.expireAt < now) {
            tempFileMap.delete(id);
            cleaned++;
        }
    }
    if (cleaned > 0) console.log(`[file-protocol] 清理了 ${cleaned} 个过期文件映射`);
}

// 全局错误处理 - 防止主进程因未捕获异常而崩溃
process.on('unhandledRejection', (reason, promise) => {
    console.error('[CRASH] 未处理的 Promise 拒绝:', reason);
    if (reason && reason.stack) {
        console.error('[CRASH] 堆栈:', reason.stack);
    }
});

process.on('uncaughtException', (error) => {
    console.error('[CRASH] 未捕获的异常:', error);
    if (error && error.stack) {
        console.error('[CRASH] 堆栈:', error.stack);
    }
    // 不退出进程，让它继续运行
});
// mica-electron：Win11 真材质（Mica/Acrylic/Tabbed）。库直接调 DwmSetWindowAttribute，
// 并在 restore/resize 事件里自动重新 applyEffect()，解决最大化/还原后材质丢失问题。
// 库在 Electron 27-40 下强制 transparent:true（构造时覆盖），圆角改由 setRoundedCorner() 提供。
// 非 Win11 或 native 模块缺失时，材质方法 no-op（executeDwm 为 undefined，方法内有 if 保护）。
// 手机模式下禁用 mica-electron（--mobile 启动参数），避免库强制最小宽度。
const IS_MOBILE_MODE = process.argv.includes('--mobile');
console.log(`[startup] process.argv=${JSON.stringify(process.argv)}  IS_MOBILE_MODE=${IS_MOBILE_MODE}`);
console.log('[startup] main.js loaded — Open.file API with lazy loading');
let MicaBrowserWindow = null;
let IS_WIN11_MICA = false;
if (!IS_MOBILE_MODE) {
    try {
        const mica = require('mica-electron');
        MicaBrowserWindow = mica.MicaBrowserWindow;
        IS_WIN11_MICA = mica.IS_WINDOWS_11;
        console.log('[startup] mica-electron 加载成功');
    } catch (e) {
        console.log(`[startup] mica-electron 加载失败: ${e.message}，使用原生 BrowserWindow`);
    }
}

// we-window-native (N-API Native Addon) — Win32 原生窗口控制
// 功能：WS_THICKFRAME（边缘 resize + Aero snap）+ DWM 圆角自动切换 + 材质
// 编译：JS/we-window-native/ 目录下 node-gyp rebuild
// Fallback：自动检测 mica-electron 预编译 .node
let weWindow = null;
try {
    weWindow = require('./we-window-native');
    console.log('[startup] we-window-native 加载成功, isWin11=' + weWindow.isWin11());
} catch (e) {
    console.log(`[startup] we-window-native 加载失败: ${e.message}`);
}

// 手机模式 IPC
ipcMain.handle('is-mobile-mode', () => IS_MOBILE_MODE);
// 使用 on 而非 handle（ipcRenderer.send 比 invoke 更可靠）
ipcMain.on('enter-mobile-mode', () => {
    console.log('[ipc] enter-mobile-mode 被调用, IS_MOBILE_MODE=', IS_MOBILE_MODE);
    if (IS_MOBILE_MODE) return;
    console.log('[mobile-mode] 正在重启进入手机模式...');
    app.relaunch({ args: process.argv.filter(a => a !== '--mobile').concat('--mobile') });
    app.exit(0);
});

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
    theme: 'auto',
    fontFamily: 'Microsoft YaHei',
    fontSize: '16',
    autoSave: '0',
    alwaysOnTop: false,
    backgroundMaterial: 'none',
    materialTint: 78,
    materialOverlay: 30,
    materialBarTint: 100,
    colorPreset: 'auto',
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
ui.theme_auto = 自动
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
ui.close_file = 关闭文件
ui.temp_cleanup = 临时文件
ui.temp_projects = 项目
ui.temp_size = 占用空间
ui.temp_idle = 可清理
ui.refresh = 刷新
ui.cleanup_temp = 清理临时文件
ui.temp_cleanup_hint = 清理已关闭项目的临时文件缓存，正在打开的项目不会被清理。清理后下次打开项目会重新解包。
ui.cleanup_temp_confirm_title = 清理临时文件
ui.cleanup_temp_confirm_desc = 确定要清理所有已关闭项目的临时文件缓存吗？正在打开的项目不会被清理。此操作不可撤销。
ui.cleaning = 清理中...
`;
    fs.writeFileSync(defaultLangPath, defaultContent, 'utf-8');
}
// 加载设置
if (fs.existsSync(SETTINGS_PATH)) {
    try { appSettings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8')); } catch {}
} else {
    // 首次启动：检测系统语言并设为默认
    const detectedLang = detectSystemLanguage();
    appSettings.language = detectedLang;
    saveSettings();
}

// 系统语言 → 应用语言代码映射
function detectSystemLanguage() {
    const locale = app.getLocale(); // e.g. 'zh-CN', 'en-US', 'ja-JP'
    const langMap = {
        'zh': 'zh_CN',
        'zh-CN': 'zh_CN',
        'zh-Hans': 'zh_CN',
        'zh-SG': 'zh_CN',
        'zh-TW': 'zh_CN',
        'zh-HK': 'zh_CN',
        'zh-MO': 'zh_CN',
        'zh-Hant': 'zh_CN',
        'ja': 'ja',
        'ja-JP': 'ja',
    };
    const mapped = langMap[locale];
    if (mapped) {
        const langPath = path.join(LANG_DIR, `${mapped}.lib`);
        if (fs.existsSync(langPath)) return mapped;
    }
    // 系统语言对应的语言包不存在，默认使用英语（显示原始 key）
    return 'en';
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

ipcMain.handle('get-system-theme', () => {
    return { isDark: nativeTheme.shouldUseDarkColors };
});

// 监听系统主题变化，推送给渲染进程
nativeTheme.on('updated', () => {
    const isDark = nativeTheme.shouldUseDarkColors;
    if (mainWin && !mainWin.isDestroyed()) {
        mainWin.webContents.send('system-theme-changed', { isDark });
    }
});

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
// 使用独立窗口弹出保存对话框，避免 Mica 透明窗口导致的权限问题
async function showExportDialog(options) {
    // 直接创建隐藏的标准窗口作为对话框父窗口，绕过 Mica 透明窗口的权限限制
    let tempDialog = null;
    try {
        tempDialog = new BrowserWindow({
            show: false, frame: true, width: 1, height: 1,
            backgroundColor: '#ffffff',
            webPreferences: { contextIsolation: true, nodeIntegration: false }
        });
        const result = await dialog.showSaveDialog(tempDialog, options);
        return result;
    } catch (e) {
        _logBuffer.push(`[showExportDialog] 对话框错误: ${e.message}`);
        _flushLogBuffer();
        return { canceled: true, filePath: null };
    } finally {
        if (tempDialog) {
            try { tempDialog.destroy(); } catch (_) {}
        }
    }
}

/**
 * 写入文件，失败时自动尝试 PowerShell Copy-Item 绕过权限限制
 */
function writeFileWithFallback(filePath, content, encoding = 'utf-8') {
    try {
        fs.writeFileSync(filePath, content, encoding);
        return true;
    } catch (writeErr) {
        _logBuffer.push(`[writeFile] 直接写入失败: ${writeErr.message}`);
        _flushLogBuffer();
        try {
            const { execFileSync } = require('child_process');
            const tmpFile = path.join(app.getPath('temp'), 'we_export_' + Date.now() + '_' + path.basename(filePath));
            fs.writeFileSync(tmpFile, content, encoding);
            execFileSync('powershell.exe', ['-NoProfile', '-Command',
                `Copy-Item -Path '${tmpFile.replace(/'/g, "''")}' -Destination '${filePath.replace(/'/g, "''")}' -Force`],
                { timeout: 30000, shell: false });
            try { fs.unlinkSync(tmpFile); } catch (_) {}
            return true;
        } catch (psErr) {
            _logBuffer.push(`[writeFile] PowerShell 回退也失败: ${psErr.message}`);
            _flushLogBuffer();
            return false;
        }
    }
}

ipcMain.handle('export-pdf', async (event, html, suggestedName) => {
    try {
        const defaultDir = app.getPath('temp');
        const { canceled, filePath } = await showExportDialog({
            title: 'Export PDF',
            defaultPath: path.join(defaultDir, (suggestedName || 'document') + '.pdf'),
            filters: [{ name: 'PDF', extensions: ['pdf'] }]
        });
        if (canceled) return { success: false, canceled: true };

        const win = new BrowserWindow({
            width: 800, height: 600,
            show: false,
            webPreferences: { contextIsolation: true, nodeIntegration: false }
        });
        await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
        await new Promise(r => setTimeout(r, 300));
        const pdfData = await win.webContents.printToPDF({
            printBackground: true,
            pageSize: 'A4',
            margins: { top: 0, bottom: 0, left: 0, right: 0 }
        });
        const pdfOk = writeFileWithFallback(filePath, pdfData);
        win.destroy();
        if (!pdfOk) return { success: false, error: '写入PDF文件失败' };
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('export-zip', async (event, folder, suggestedName) => {
    try {
        const defaultDir = app.getPath('temp');
        const { canceled, filePath } = await showExportDialog({
            title: 'Export ZIP',
            defaultPath: path.join(defaultDir, (suggestedName || 'project') + '.zip'),
            filters: [{ name: 'ZIP', extensions: ['zip'] }]
        });
        if (canceled) return { success: false, canceled: true };
        const wepPath = path.join(folder, 'project.wep');
        if (!fs.existsSync(wepPath)) return { success: false, error: 'project.wep not found' };
        const zipData = fs.readFileSync(wepPath);
        const zipOk = writeFileWithFallback(filePath, zipData);
        if (!zipOk) return { success: false, error: '写入ZIP文件失败' };
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});
ipcMain.handle('export-html', async (event, html, suggestedName) => {
    try {
        const defaultDir = app.getPath('temp');
        const { canceled, filePath } = await showExportDialog({
            title: 'Export HTML',
            defaultPath: path.join(defaultDir, (suggestedName || 'nodegraph') + '.html'),
            filters: [{ name: 'HTML', extensions: ['html'] }]
        });
        _logBuffer.push(`[export-html] 结果: canceled=${canceled} filePath=${filePath}`);
        _flushLogBuffer();
        if (canceled) return { success: false, canceled: true };
        if (!filePath) return { success: false, error: '未获取到文件路径' };
        const ok = writeFileWithFallback(filePath, html, 'utf-8');
        if (!ok) return { success: false, error: '写入文件失败' };
        return { success: true };
    } catch (e) {
        _logBuffer.push(`[export-html] 错误: ${e.message}`);
        _flushLogBuffer();
        return { success: false, error: e.message };
    }
});
ipcMain.handle('export-archive', async (event, content, suggestedName) => {
    try {
        // 优先弹出系统保存对话框
        const defaultDir = app.getPath('desktop');
        const { canceled, filePath } = await showExportDialog({
            title: '导出角色档案',
            defaultPath: path.join(defaultDir, (suggestedName || '角色档案') + '.md'),
            filters: [{ name: 'Markdown', extensions: ['md'] }]
        });
        if (canceled) return { success: false, canceled: true };

        if (filePath) {
            // 用户选择了路径，尝试写入
            const ok = writeFileWithFallback(filePath, content, 'utf-8');
            if (ok) {
                shell.showItemInFolder(filePath);
                _logBuffer.push(`[export-archive] 成功: ${filePath}`);
                _flushLogBuffer();
                return { success: true, filePath };
            }
        }

        // 对话框无返回路径 或 写入失败 → 自动保存到 JS/Input 备用
        const inputDir = path.join(__dirname, 'Input');
        if (!fs.existsSync(inputDir)) {
            fs.mkdirSync(inputDir, { recursive: true });
        }
        const fileName = (suggestedName || '角色档案') + '.md';
        const fallbackPath = path.join(inputDir, fileName);
        fs.writeFileSync(fallbackPath, content, 'utf-8');
        shell.showItemInFolder(fallbackPath);
        _logBuffer.push(`[export-archive] 备用保存成功: ${fallbackPath}`);
        _flushLogBuffer();
        return { success: true, filePath: fallbackPath };
    } catch (e) {
        _logBuffer.push(`[export-archive] 错误: ${e.message}`);
        _flushLogBuffer();
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

// === 项目解包目录架构 ===
// 打开项目时将 project.wep 解压到临时目录，所有读写操作基于该目录
// 关闭项目时重新打包回 project.wep（+ .bwep 备份）

const EXTRACT_DIR = path.join(app.getPath('temp'), 'we-editor-projects');
const projectExtractMap = new Map(); // folder -> extractDir
const projectDirtyMap = new Map();  // folder -> boolean (是否有未保存修改)

function ensureExtractDir() {
    if (!fs.existsSync(EXTRACT_DIR)) {
        fs.mkdirSync(EXTRACT_DIR, { recursive: true });
    }
}

// 辅助函数：计算目录大小（递归）
function calculateDirSize(dirPath) {
    let totalSize = 0;
    try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            try {
                if (entry.isFile()) {
                    totalSize += fs.statSync(fullPath).size;
                } else if (entry.isDirectory()) {
                    totalSize += calculateDirSize(fullPath);
                }
            } catch (e) {
                // 忽略无法访问的文件
            }
        }
    } catch (e) {
        // 忽略
    }
    return totalSize;
}

// 辅助函数：格式化文件大小
function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const k = 1024;
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + units[i];
}

// 辅助函数：获取目录最后修改时间
function getLastModifiedTime(dirPath) {
    try {
        const stat = fs.statSync(dirPath);
        return stat.mtime.toISOString();
    } catch (e) {
        return null;
    }
}

// 将项目路径转换为安全的临时目录名
function getSafeExtractName(folder) {
    return folder.replace(/[:\\\/\s]/g, '_').replace(/[^a-zA-Z0-9_]/g, '_');
}

// 解包项目到临时目录
async function extractProject(folder) {
    const wepPath = path.join(folder, 'project.wep');
    const backupDir = path.join(folder, 'Backups');
    // 优先查找 Backups 目录下的 project.bwep 安全备份
    const bwepPath = path.join(backupDir, 'project.bwep');
    // 如果安全备份不存在，尝试找 Backups 中最新的时间戳备份
    let recoveryBwepPath = bwepPath;
    
    // 收集所有可能的备份搜索路径
    const searchPaths = [];
    
    // 1. 项目内 Backups 目录
    if (fs.existsSync(backupDir)) {
        searchPaths.push(backupDir);
    }
    
    // 2. 搜索 TS 版本的 dist 备份目录（用户可能同时使用 JS 和 TS 版本）
    const tsProjectPath = folder.replace(/\\JS\\resources\\/, '\\TS\\dist\\resources\\');
    const tsBackupDir = path.join(tsProjectPath, 'Backups');
    if (fs.existsSync(tsBackupDir) && tsBackupDir !== backupDir) {
        searchPaths.push(tsBackupDir);
    }
    
    // 3. 搜索 JS 版本的 resources 备份目录
    const jsProjectPath = folder;
    const jsParent = path.dirname(jsProjectPath);
    // 检查是否有同级的其他项目备份
    
    console.log(`[extractProject] 备份搜索路径: ${searchPaths.length} 个`);
    
    if (!fs.existsSync(bwepPath)) {
        // 在所有搜索路径中查找可用备份
        let bestBackup = null;
        let bestSize = 0;
        
        for (const searchDir of searchPaths) {
            try {
                const backups = fs.readdirSync(searchDir)
                    .filter(f => f.endsWith('.bwep'))
                    .map(f => ({
                        name: f,
                        path: path.join(searchDir, f),
                        size: fs.statSync(path.join(searchDir, f)).size,
                        mtime: fs.statSync(path.join(searchDir, f)).mtimeMs
                    }))
                    .sort((a, b) => b.mtime - a.mtime); // 最新的排前面
                
                if (backups.length > 0) {
                    // 优先选择最大的备份（包含更多文件）
                    const best = backups.reduce((max, b) => b.size > max.size ? b : max, backups[0]);
                    console.log(`[extractProject] 在 ${searchDir} 找到 ${backups.length} 个备份, 最佳: ${best.name} (${best.size} bytes)`);
                    if (best.size > bestSize) {
                        bestSize = best.size;
                        bestBackup = best;
                    }
                }
            } catch (e) {
                console.warn(`[extractProject] 搜索备份失败: ${searchDir}, ${e.message}`);
            }
        }
        
        if (bestBackup) {
            recoveryBwepPath = bestBackup.path;
            console.log(`[extractProject] 选择最佳备份: ${recoveryBwepPath} (${bestSize} bytes)`);
        }
    }
    let extractDir = path.join(EXTRACT_DIR, getSafeExtractName(folder));
    
    console.log(`[extractProject] 开始: ${folder}`);
    
    // 尝试解包的内部函数（支持跳过损坏文件）
    async function tryExtract(zipPath, targetDir, skipErrors = false) {
        // 使用 unzipper 打开 ZIP 文件
        let directory;
        try {
            directory = await unzipper.Open.file(zipPath);
        } catch (openError) {
            console.error(`[extractProject] 无法打开 ZIP 文件: ${openError.message}`);
            throw openError;
        }
        
        let fileCount = 0;
        let failedFiles = 0;
        const totalFiles = directory.files.length;
        
        console.log(`[extractProject] 开始解压: ${totalFiles} 个文件, skipErrors=${skipErrors}`);
        
        for (let i = 0; i < directory.files.length; i++) {
            const file = directory.files[i];
            const targetPath = path.join(targetDir, file.path);
            const fileIdx = i + 1;
            
            if (file.type === 'Directory') {
                try {
                    fs.mkdirSync(targetPath, { recursive: true });
                    console.log(`[extractProject] [${fileIdx}/${totalFiles}] 目录: ${file.path}`);
                } catch (e) {
                    if (!skipErrors) throw e;
                    console.warn(`[extractProject] 目录创建失败: ${file.path}, ${e.message}`);
                }
            } else {
                const extractStart = Date.now();
                try {
                    // 确保父目录存在
                    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
                    
                    // 获取 ZIP 中记录的文件大小
                    const expectedSize = file.uncompressedSize || 0;
                    
                    // 使用 pipeline 替代 pipe，提供更好的错误处理和资源清理
                    await new Promise((resolve, reject) => {
                        let readStream, writeStream;
                        try {
                            readStream = file.stream();
                            writeStream = fs.createWriteStream(targetPath);
                        } catch (streamError) {
                            reject(streamError);
                            return;
                        }
                        
                        // 双重保险：直接监听错误事件
                        let settled = false;
                        const onError = (err) => {
                            if (!settled) {
                                settled = true;
                                reject(err);
                            }
                        };
                        readStream.on('error', onError);
                        writeStream.on('error', onError);
                        
                        // pipeline 会自动处理错误传播和资源清理
                        pipeline(readStream, writeStream, (err) => {
                            if (!settled) {
                                settled = true;
                                if (err) {
                                    reject(err);
                                } else {
                                    resolve();
                                }
                            }
                        });
                    });
                    
                    // 验证文件是否正确写入
                    let actualSize = 0;
                    try {
                        actualSize = fs.statSync(targetPath).size;
                    } catch (statErr) {
                        console.warn(`[extractProject] [${fileIdx}/${totalFiles}] 无法验证文件大小: ${file.path}, ${statErr.message}`);
                    }
                    
                    const duration = Date.now() - extractStart;
                    const sizeMatch = expectedSize > 0 && actualSize !== expectedSize;
                    if (sizeMatch) {
                        console.warn(`[extractProject] [${fileIdx}/${totalFiles}] ⚠️ 大小不匹配: ${file.path}, 期望=${expectedSize}, 实际=${actualSize}, 耗时=${duration}ms`);
                    } else {
                        console.log(`[extractProject] [${fileIdx}/${totalFiles}] ✓ ${file.path} (${actualSize} bytes, ${duration}ms)`);
                    }
                    
                    fileCount++;
                } catch (fileError) {
                    const duration = Date.now() - extractStart;
                    console.error(`[extractProject] [${fileIdx}/${totalFiles}] ✗ 失败: ${file.path}, ${fileError.message} (耗时 ${duration}ms)`);
                    if (skipErrors) {
                        failedFiles++;
                        // 清理可能的部分文件
                        try { fs.unlinkSync(targetPath); } catch (e) {}
                    } else {
                        // 清理部分文件
                        try { fs.unlinkSync(targetPath); } catch (e) {}
                        throw fileError;
                    }
                }
            }
        }
        
        // 关闭 directory，释放资源
        try {
            if (typeof directory.close === 'function') {
                await directory.close();
            } else if (typeof directory._close === 'function') {
                await directory._close();
            }
            // 如果没有 close 方法，unzipper 会自动释放资源
        } catch (closeError) {
            console.warn(`[extractProject] 关闭 ZIP 句柄失败: ${closeError.message}`);
        }
        
        console.log(`[extractProject] 解压完成: ${fileCount}/${totalFiles} 文件成功, ${failedFiles} 失败`);
        return { fileCount, failedFiles, totalFiles };
    }
    
    try {
        // 如果 .wep 不存在但 .bwep 存在，使用备份（带重试）
        if (!fs.existsSync(wepPath) && fs.existsSync(recoveryBwepPath)) {
            console.log('[extractProject] 使用备份文件恢复:', recoveryBwepPath);
            let copied = false;
            for (let attempt = 1; attempt <= 5; attempt++) {
                try {
                    fs.copyFileSync(recoveryBwepPath, wepPath);
                    copied = true;
                    console.log(`[extractProject] 备份恢复成功 (尝试 ${attempt})`);
                    break;
                } catch (copyErr) {
                    if (attempt < 5 && (copyErr.code === 'EPERM' || copyErr.code === 'EBUSY')) {
                        console.warn(`[extractProject] 备份复制重试 ${attempt}/5: ${copyErr.message}`);
                        await new Promise(r => setTimeout(r, 200 * attempt));
                    } else {
                        throw copyErr;
                    }
                }
            }
            if (!copied) throw new Error('备份复制失败');
        }
        
        if (!fs.existsSync(wepPath)) {
            // 没有项目文件，创建空目录
            fs.mkdirSync(extractDir, { recursive: true });
            fs.writeFileSync(path.join(extractDir, '__project__.md'), 'World Editor Project', 'utf8');
            projectExtractMap.set(folder, extractDir);
            projectDirtyMap.set(folder, false);
            console.log(`[extractProject] 新项目: ${folder}`);
            return extractDir;
        }
        
        // 检查是否已解包过（且 ZIP 没有被修改）
        const cachedDir = projectExtractMap.get(folder);
        if (cachedDir && fs.existsSync(cachedDir)) {
            if (fs.existsSync(wepPath)) {
                try {
                    const stat = fs.statSync(wepPath);
                    const metaPath = path.join(cachedDir, '.extract_meta.json');
                    if (fs.existsSync(metaPath)) {
                        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                        if (meta.mtime === stat.mtimeMs && meta.size === stat.size) {
                            // 额外检查：确保临时目录中有合理数量的文件
                            // 如果 .wep 很大但临时目录文件很少，说明临时目录可能损坏
                            const cachedFiles = getAllFiles(cachedDir);
                            const cachedFileCount = cachedFiles.filter(f => !f.endsWith('.extract_meta.json')).length;
                            const hasMedia = cachedFiles.some(f => {
                                const rel = path.relative(cachedDir, f).replace(/\\/g, '/');
                                return rel.startsWith('__media_');
                            });
                            
                            // 检测缓存损坏：多种条件
                            let cacheCorrupted = false;
                            
                            // 条件 1：临时目录完全为空
                            if (cachedFileCount === 0) {
                                console.warn(`[extractProject] 缓存损坏: 临时目录为空，强制重新解压`);
                                cacheCorrupted = true;
                            }
                            // 条件 2：.wep 很大但临时目录文件很少
                            else if (stat.size > 1000000 && cachedFileCount < 5) {
                                console.warn(`[extractProject] 缓存可能损坏: .wep=${stat.size} bytes 但临时目录只有 ${cachedFileCount} 个文件，强制重新解压`);
                                cacheCorrupted = true;
                            }
                            // 条件 3：.wep 包含媒体文件但临时目录没有
                            else if (!hasMedia && cachedFileCount > 0) {
                                try {
                                    const wepDir = await unzipper.Open.file(wepPath);
                                    const wepHasMedia = wepDir.files.some(f => f.path.startsWith('__media_'));
                                    if (wepHasMedia) {
                                        console.warn(`[extractProject] 缓存损坏: .wep 包含媒体文件但临时目录没有`);
                                        cacheCorrupted = true;
                                    }
                                    try { if (typeof wepDir.close === 'function') await wepDir.close(); } catch(e) {}
                                } catch (e) {}
                            }
                            
                            if (cacheCorrupted) {
                                try { fs.rmSync(cachedDir, { recursive: true, force: true }); } catch (e) {}
                                projectExtractMap.delete(folder);
                            } else {
                                console.log(`[extractProject] 命中缓存: ${folder}, 文件数=${cachedFileCount}, 媒体文件=${hasMedia}`);
                                return cachedDir;
                            }
                        }
                    } else {
                        console.warn(`[extractProject] 缓存元信息不存在，强制重新解压`);
                        try { fs.rmSync(cachedDir, { recursive: true, force: true }); } catch (e) {}
                        projectExtractMap.delete(folder);
                    }
                } catch (e) {
                    console.warn('[extractProject] 缓存检查失败:', e.message);
                }
            }
        }
        
        // 清理旧的解包目录
        if (cachedDir) {
            try { fs.rmSync(cachedDir, { recursive: true, force: true }); } catch (e) {}
        }
        
        ensureExtractDir();
        
        console.log(`[extractProject] 解压项目: ${folder}`);
        const t0 = Date.now();
        
        // 验证 ZIP 文件是否有效（检查文件大小）
        const wepStat = fs.statSync(wepPath);
        if (wepStat.size < 22) {
            throw new Error('ZIP 文件过小，可能已损坏');
        }
        
        // 首先尝试正常解包（不跳过错误）
        try {
            const result = await tryExtract(wepPath, extractDir, false);
            
            // 写入元信息
            const stat = fs.statSync(wepPath);
            fs.writeFileSync(path.join(extractDir, '.extract_meta.json'), JSON.stringify({
                mtime: stat.mtimeMs,
                size: stat.size,
                extractedAt: Date.now()
            }));
            
            projectExtractMap.set(folder, extractDir);
            projectDirtyMap.set(folder, false);
            
            console.log(`[extractProject] 完成: ${Date.now() - t0}ms, ${result.fileCount} 个文件`);
            
            // 验证解压结果：如果文件数不匹配，强制重试一次
            if (result.fileCount < result.totalFiles) {
                console.warn(`[extractProject] ⚠️ 解压文件数不匹配: ${result.fileCount}/${result.totalFiles}, 强制重试...`);
                try { fs.rmSync(extractDir, { recursive: true, force: true }); } catch (e) {}
                fs.mkdirSync(extractDir, { recursive: true });
                
                const retryResult = await tryExtract(wepPath, extractDir, false);
                console.log(`[extractProject] 重试结果: ${retryResult.fileCount}/${retryResult.totalFiles} 文件`);
                
                // 重新写入元信息
                const retryStat = fs.statSync(wepPath);
                fs.writeFileSync(path.join(extractDir, '.extract_meta.json'), JSON.stringify({
                    mtime: retryStat.mtimeMs,
                    size: retryStat.size,
                    extractedAt: Date.now()
                }));
                
                projectExtractMap.set(folder, extractDir);
                
                if (retryResult.fileCount < retryResult.totalFiles) {
                    console.error(`[extractProject] ✗ 重试后文件数仍不匹配: ${retryResult.fileCount}/${retryResult.totalFiles}`);
                }
            }
            
            // 注意：不再自动调用 packProject，避免与并发操作产生竞态条件
            // ZIP 修复会在用户下次保存时通过 save-project 触发
            
            return extractDir;
        } catch (extractError) {
            console.warn(`[extractProject] 正常解包失败: ${extractError.message}`);
            
            // 如果正常解包失败，尝试跳过损坏文件
            console.log('[extractProject] 尝试跳过损坏文件继续...');
            try {
                try { fs.rmSync(extractDir, { recursive: true, force: true }); } catch (e) {}
                fs.mkdirSync(extractDir, { recursive: true });
                
                const result = await tryExtract(wepPath, extractDir, true);
                
                if (result.fileCount > 0) {
                    console.log(`[extractProject] 部分恢复: ${result.fileCount}/${result.totalFiles} 文件成功, ${result.failedFiles} 个损坏`);
                    
                    // 写入元信息
                    const stat = fs.statSync(wepPath);
                    fs.writeFileSync(path.join(extractDir, '.extract_meta.json'), JSON.stringify({
                        mtime: stat.mtimeMs,
                        size: stat.size,
                        extractedAt: Date.now()
                    }));
                    
                    projectExtractMap.set(folder, extractDir);
                    projectDirtyMap.set(folder, true); // 标记为需要重新保存
                    
                    // 注意：不再自动调用 packProject
                    console.log('[extractProject] 部分恢复完成，标记为需要重新保存');
                    
                    return extractDir;
                } else {
                    throw new Error('所有文件都已损坏');
                }
            } catch (partialError) {
                console.error(`[extractProject] 部分恢复也失败: ${partialError.message}`);
                throw extractError; // 重新抛出原始错误
            }
        }
    } catch (e) {
        console.error(`[extractProject] 解压失败: ${e.message}`);
        
        // 尝试使用备份文件
        if (fs.existsSync(recoveryBwepPath)) {
            console.log('[extractProject] 尝试使用备份文件');
            try {
                try { fs.rmSync(extractDir, { recursive: true, force: true }); } catch (e) {}
                fs.mkdirSync(extractDir, { recursive: true });
                
                const backupStat = fs.statSync(recoveryBwepPath);
                if (backupStat.size >= 22) {
                    const result = await tryExtract(recoveryBwepPath, extractDir, true);
                    
                    if (result.fileCount > 0) {
                        // 恢复主文件
                        fs.copyFileSync(recoveryBwepPath, wepPath);
                        
                        const stat = fs.statSync(wepPath);
                        fs.writeFileSync(path.join(extractDir, '.extract_meta.json'), JSON.stringify({
                            mtime: stat.mtimeMs,
                            size: stat.size,
                            extractedAt: Date.now()
                        }));
                        
                        projectExtractMap.set(folder, extractDir);
                        projectDirtyMap.set(folder, false);
                        
                        console.log(`[extractProject] 从备份恢复成功: ${result.fileCount} 文件`);
                        // 注意：不再自动调用 packProject
                        
                        return extractDir;
                    }
                }
            } catch (backupError) {
                console.error(`[extractProject] 备份也无效: ${backupError.message}`);
            }
        }
        
        // 回退：创建空目录（项目损坏，重新开始）
        console.log('[extractProject] 创建新的空项目');
        try { fs.rmSync(extractDir, { recursive: true, force: true }); } catch (e) {}
        fs.mkdirSync(extractDir, { recursive: true });
        fs.writeFileSync(path.join(extractDir, '__project__.md'), 'World Editor Project', 'utf8');
        projectExtractMap.set(folder, extractDir);
        projectDirtyMap.set(folder, true); // 标记为需要重新保存
        return extractDir;
    }
}

// 打包临时目录回 project.wep
async function packProject(folder) {
    const extractDir = getExtractDir(folder);
    if (!extractDir) {
        console.error(`[packProject] 找不到解包目录, folder=${folder}`);
        return false;
    }
    
    const wepPath = path.join(folder, 'project.wep');
    const backupDir = path.join(folder, 'Backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const bwepPath = path.join(backupDir, 'project.bwep');
    
    console.log(`[packProject] 打包项目: ${folder}, extractDir=${extractDir}`);
    const t0 = Date.now();
    
    // 原子写入：先写临时文件，成功后再替换原文件，避免 .wep 丢失
    const tmpPath = wepPath + '.tmp';
    
    try {
        // ===== 安全性检查：比较临时目录与现有 .wep 的内容 =====
        // 如果临时目录文件远少于 .wep 中的文件，说明临时目录可能损坏
        // 此时拒绝打包，避免用损坏的数据覆盖好的 .wep
        if (fs.existsSync(wepPath)) {
            try {
                const existingWepFiles = await listWepFiles(wepPath);
                const tmpFiles = getAllFiles(extractDir).filter(f => {
                    const rel = path.relative(extractDir, f).replace(/\\/g, '/');
                    return rel !== '.extract_meta.json';
                });
                const tmpFileCount = tmpFiles.length;
                const wepFileCount = existingWepFiles.length;
                
                // 如果 .wep 包含较多文件但临时目录文件很少，可能是临时目录损坏
                if (wepFileCount > 5 && tmpFileCount < wepFileCount * 0.5) {
                    console.error(`[packProject] 🛑 安全检查失败！临时目录可能已损坏：` +
                        `.wep 包含 ${wepFileCount} 个文件，但临时目录只有 ${tmpFileCount} 个文件。` +
                        `拒绝打包以防止数据丢失。请重启应用恢复项目。`);
                    return false;
                }
                console.log(`[packProject] 安全检查: .wep=${wepFileCount} 文件, 临时目录=${tmpFileCount} 文件 ✓`);
            } catch (checkErr) {
                console.warn('[packProject] 安全检查出错（继续打包）:', checkErr.message);
            }
        }
        
        // 创建 .bwep 安全备份到项目 Backups 目录（在删除 .wep 之前）
        if (fs.existsSync(wepPath)) {
            try {
                fs.copyFileSync(wepPath, bwepPath);
                console.log(`[packProject] 安全备份: ${bwepPath}, size=${fs.statSync(bwepPath).size}`);
            } catch (e) {
                console.warn('[packProject] 安全备份失败:', e.message);
            }
        }
        
        // 清理可能残留的旧临时文件
        try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch (e) {}
        
        // 创建 ZIP 并逐个添加文件（写入临时文件而非正式 .wep）
        const output = fs.createWriteStream(tmpPath);
        const archive = archiver('zip', { zlib: { level: 9 } });
        
        let archiveError = null;
        archive.on('error', err => { 
            console.error('[packProject] archiver 错误:', err.message);
            archiveError = err; 
        });
        output.on('error', err => {
            console.error('[packProject] 写入流错误:', err.message);
            archiveError = err;
        });
        
        archive.pipe(output);
        
        // 收集所有文件
        const files = getAllFiles(extractDir);
        console.log(`[packProject] 扫描到 ${files.length} 个文件`);
        
        let addedCount = 0;
        let failedCount = 0;
        let totalSize = 0;
        let mediaFileCount = 0;
        let hasValidContent = false;
        
        // 带重试的文件添加（处理 Windows 下文件锁）
        async function addFileWithRetry(filePath, relativePath, isDir, isEmpty) {
            const maxRetries = 3;
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    if (isDir) {
                        archive.append('', { name: relativePath + '/' });
                    } else if (isEmpty) {
                        archive.append(' ', { name: relativePath });
                    } else {
                        archive.file(filePath, { name: relativePath });
                    }
                    return true;
                } catch (err) {
                    if (attempt < maxRetries && (err.code === 'ENOENT' || err.code === 'EPERM' || err.code === 'EPIPE')) {
                        console.warn(`[packProject] 文件添加重试 ${attempt}/${maxRetries}: ${relativePath}, error=${err.message}`);
                        await new Promise(r => setTimeout(r, 100 * attempt));
                    } else {
                        throw err;
                    }
                }
            }
            return false;
        }
        
        for (const file of files) {
            const relativePath = path.relative(extractDir, file).replace(/\\/g, '/');
            if (relativePath === '.extract_meta.json') continue;
            
            const stat = fs.statSync(file);
            totalSize += stat.size;
            
            try {
                await addFileWithRetry(file, relativePath, stat.isDirectory(), stat.size === 0);
                addedCount++;
                hasValidContent = true;
                
                // 日志：打印媒体文件
                if (relativePath.startsWith('__media_') || relativePath.startsWith('__img_')) {
                    mediaFileCount++;
                    console.log(`[packProject] ✓ 添加媒体文件: ${relativePath}, size=${stat.size} bytes (${(stat.size/1024/1024).toFixed(2)} MB)`);
                }
            } catch (addErr) {
                console.error(`[packProject] ✗ 添加文件失败 ${relativePath}:`, addErr.message);
                failedCount++;
            }
        }
        
        console.log(`[packProject] 已添加 ${addedCount} 个文件, 失败 ${failedCount} 个, 源总大小=${totalSize} bytes (${(totalSize/1024/1024).toFixed(2)} MB), 媒体文件数=${mediaFileCount}`);
        
        if (!hasValidContent) {
            archive.append('World Editor Project', { name: '__project__.md' });
            console.log('[packProject] 空项目，添加占位文件');
        }
        
        await archive.finalize();
        await new Promise((resolve) => output.on('close', resolve));
        
        if (archiveError) throw archiveError;
        
        // 验证 ZIP 文件是否有效
        const tmpStat = fs.statSync(tmpPath);
        if (tmpStat.size < 22) { // 最小有效 ZIP 大小
            console.error('[packProject] ZIP 文件过小，可能无效');
            throw new Error('生成的 ZIP 文件过小');
        }
        
        // ===== 原子替换：临时文件 → 正式 .wep =====
        // 最安全的策略：永不删除旧 .wep 直到新文件确认写入
        // 1. 验证 .tmp 文件有效
        // 2. 将 .tmp 复制为 .wep.new（临时命名）
        // 3. 用 copyFileSync 覆盖 .wep（Windows 兼容，可覆盖）
        // 4. 删除 .wep.new
        // 5. 删除 .tmp
        // 任何步骤失败，旧 .wep 都完好无损
        
        const newPath = wepPath + '.new';
        let replaceSuccess = false;
        let lastError = null;
        
        for (let attempt = 1; attempt <= 5; attempt++) {
            try {
                // 步骤 1：再次验证 tmp 文件仍然有效
                if (!fs.existsSync(tmpPath)) {
                    throw new Error('临时文件已不存在');
                }
                const tmpStat = fs.statSync(tmpPath);
                if (tmpStat.size < 22) {
                    throw new Error('临时文件过小');
                }
                
                // 步骤 2：复制到 .wep.new
                fs.copyFileSync(tmpPath, newPath);
                console.log(`[packProject] ${attempt}/5: 复制 tmp → .new 成功, size=${fs.statSync(newPath).size}`);
                
                // 步骤 3: 用 copyFileSync 覆盖 .wep（Windows 下可覆盖已有文件）
                // 这是关键：copyFileSync 在 Windows 上可以覆盖已存在的文件
                fs.copyFileSync(newPath, wepPath);
                console.log(`[packProject] ${attempt}/5: 覆盖 .wep 成功`);
                
                // 步骤 4: 验证 .wep 存在且有效
                const finalStat = fs.statSync(wepPath);
                if (finalStat.size < 22) {
                    throw new Error('.wep 过小，可能损坏');
                }
                console.log(`[packProject] ${attempt}/5: 验证 .wep, size=${finalStat.size}`);
                
                // 步骤 5: 清理临时文件
                try { fs.unlinkSync(newPath); } catch (e) {}
                try { fs.unlinkSync(tmpPath); } catch (e) {}
                
                replaceSuccess = true;
                break;
            } catch (replaceErr) {
                lastError = replaceErr;
                console.warn(`[packProject] 原子替换尝试 ${attempt}/5 失败: ${replaceErr.message}`);
                
                // 清理可能的残留文件
                try { if (fs.existsSync(newPath)) fs.unlinkSync(newPath); } catch (e) {}
                
                if (attempt < 5 && (replaceErr.code === 'EPERM' || replaceErr.code === 'EBUSY' || replaceErr.code === 'EPIPE' || replaceErr.code === 'EACCES')) {
                    await new Promise(r => setTimeout(r, 300 * attempt));
                } else {
                    break;
                }
            }
        }
        
        if (!replaceSuccess) {
            // 关键安全保障：如果所有替换方案都失败，保留旧 .wep 不动
            console.error('[packProject] 所有替换方案都失败，但旧 .wep 仍完好。错误:', lastError?.message);
            console.error('[packProject] 用户需要重试保存。临时文件保留在:', tmpPath);
            throw lastError || new Error('原子替换失败');
        }
        
        console.log(`[packProject] .wep 替换成功, size=${fs.statSync(wepPath).size} bytes`);
        
        // 更新元信息
        const finalStat = fs.statSync(wepPath);
        fs.writeFileSync(path.join(extractDir, '.extract_meta.json'), JSON.stringify({
            mtime: finalStat.mtimeMs,
            size: finalStat.size,
            extractedAt: Date.now()
        }));
        
        projectDirtyMap.set(folder, false);
        const compressionRatio = totalSize > 0 ? (finalStat.size / totalSize).toFixed(2) : 'N/A';
        console.log(`[packProject] 完成: ${Date.now() - t0}ms, 源大小=${totalSize} bytes, 压缩后=${finalStat.size} bytes, 压缩比=${compressionRatio}`);
        
        // ===== 打包后验证：读回 .wep 确认媒体文件真的被打进去了 =====
        try {
            const directory = await unzipper.Open.file(wepPath);
            const filesInZip = directory.files.map(f => f.path);
            
            // 检查媒体文件是否存在
            const mediaFilesInZip = filesInZip.filter(f => f.startsWith('__media_'));
            if (mediaFileCount > 0 && mediaFilesInZip.length === 0) {
                console.error(`[packProject] 严重错误: 预期 ${mediaFileCount} 个媒体文件，但 .wep 中一个都没有！`);
                archiveError = new Error('媒体文件未正确打包');
            } else if (mediaFilesInZip.length > 0) {
                console.log(`[packProject] 验证通过: .wep 中包含 ${mediaFilesInZip.length} 个媒体文件: ${mediaFilesInZip.join(', ')}`);
            } else if (mediaFileCount === 0) {
                console.log(`[packProject] 验证: .wep 中包含 ${filesInZip.length} 个文件（无媒体文件）`);
            }
            
            // 关闭 directory（如果支持）
            if (typeof directory.close === 'function') {
                try { await directory.close(); } catch (e) {}
            } else if (typeof directory._close === 'function') {
                try { await directory._close(); } catch (e) {}
            }
        } catch (verifyErr) {
            console.error('[packProject] 验证失败:', verifyErr.message);
        }
        
        // 验证：如果源文件总大小很大但打包结果很小，可能有问题
        if (totalSize > 1000000 && finalStat.size < totalSize * 0.5 && mediaFileCount > 0) {
            console.warn(`[packProject] 警告: 压缩比异常 (${compressionRatio})，媒体文件可能未正确打包！`);
            if (!archiveError) archiveError = new Error('压缩比异常，媒体文件可能未正确打包');
        }
        
        // 检查验证阶段发现的错误
        if (archiveError) {
            console.error('[packProject] 打包验证失败:', archiveError.message);
            try { if (fs.existsSync(bwepPath)) fs.unlinkSync(bwepPath); } catch (e) {}
            return false;
        }
        
        // 清理项目内的旧 .bwep 安全备份
        try {
            if (fs.existsSync(bwepPath)) {
                fs.unlinkSync(bwepPath);
                console.log(`[packProject] 已清理项目内安全备份: ${bwepPath}`);
            }
        } catch (e) {
            console.warn('[packProject] 清理 .bwep 失败:', e.message);
        }
        
        // 清理临时文件
        try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch (e) {}
        
        return true;
    } catch (e) {
        console.error(`[packProject] 打包失败: ${e.message}`);
        // 清理残留临时文件
        try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch (cleanupErr) {}
        return false;
    }
}

// 列出 .wep 文件中包含的所有文件路径（用于安全检查）
async function listWepFiles(wepPath) {
    try {
        const directory = await unzipper.Open.file(wepPath);
        const files = directory.files.map(f => f.path);
        // 关闭
        if (typeof directory.close === 'function') {
            try { await directory.close(); } catch (e) {}
        } else if (typeof directory._close === 'function') {
            try { await directory._close(); } catch (e) {}
        }
        return files;
    } catch (e) {
        console.warn('[listWepFiles] 读取失败:', e.message);
        return [];
    }
}

// 递归获取所有文件
function getAllFiles(dir, files = []) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            getAllFiles(fullPath, files);
        } else {
            files.push(fullPath);
        }
    }
    return files;
}

// 获取解包目录（如果项目已解包）
function getExtractDir(folder) {
    // 直接匹配
    let dir = projectExtractMap.get(folder);
    if (dir) {
        console.log(`[getExtractDir] 直接匹配成功: ${folder} -> ${dir}`);
        return dir;
    }
    
    // 尝试规范化路径匹配（处理大小写、斜杠差异）
    const normalizedFolder = path.resolve(folder);
    for (const [key, value] of projectExtractMap.entries()) {
        if (path.resolve(key) === normalizedFolder) {
            console.log(`[getExtractDir] 规范化匹配: ${folder} (normalized: ${normalizedFolder}) -> ${value} (key: ${key})`);
            return value;
        }
    }
    
    // 打印当前所有 map 条目用于调试
    console.error(`[getExtractDir] 未找到解包目录: ${folder}`);
    console.error(`[getExtractDir] 当前 map 中有 ${projectExtractMap.size} 个条目:`);
    for (const [key, value] of projectExtractMap.entries()) {
        console.error(`  key="${key}" -> value="${value}"`);
        try {
            if (fs.existsSync(value)) {
                const files = fs.readdirSync(value);
                console.error(`    目录存在，包含 ${files.length} 个文件: ${files.slice(0, 10).join(', ')}${files.length > 10 ? '...' : ''}`);
            } else {
                console.error(`    目录不存在！`);
            }
        } catch (e) {
            console.error(`    检查目录出错: ${e.message}`);
        }
    }
    
    return undefined;
}

// 标记项目为已修改
function markProjectDirty(folder) {
    projectDirtyMap.set(folder, true);
}

// 检查项目是否有未保存修改
function isProjectDirty(folder) {
    return projectDirtyMap.get(folder) || false;
}

// 关闭项目（重新打包并清理）
async function closeProject(folder, shouldPack = true) {
    if (shouldPack && isProjectDirty(folder)) {
        await packProject(folder);
        // 打包成功后创建备份
        backupProject(folder);
    }
    // 不删除解包目录（缓存可以加速下次打开）
    // 但清理超过24小时的旧目录
    projectExtractMap.delete(folder);
    projectDirtyMap.delete(folder);
}

// === 项目文件缓存（保留用于兼容性，但主要使用解包目录）===
const wepDirectoryCache = new Map(); // folder -> { directory, mtime, timestamp }
const wepFileContentCache = new Map(); // folder -> Map<filename, content>
const WEPCACHE_TTL = 30000; // 30秒缓存有效期
const MAX_CONTENT_CACHE_SIZE = 50; // 最多缓存50个文件内容

function invalidateWepCache(folder) {
    if (folder) {
        const cached = wepDirectoryCache.get(folder);
        if (cached && cached.directory) {
            try { cached.directory.close(); } catch (e) {}
        }
        wepDirectoryCache.delete(folder);
        wepFileContentCache.delete(folder);
    } else {
        // 关闭所有缓存的 directory 对象
        for (const [, cached] of wepDirectoryCache) {
            if (cached && cached.directory) {
                try { cached.directory.close(); } catch (e) {}
            }
        }
        wepDirectoryCache.clear();
        wepFileContentCache.clear();
    }
}

// 获取或打开 ZIP 目录句柄（带缓存）
async function getWepDirectory(folder) {
    const wepPath = path.join(folder, 'project.wep');
    if (!fs.existsSync(wepPath)) return null;

    const now = Date.now();
    let cached = wepDirectoryCache.get(folder);
    
    try {
        const mtime = fs.statSync(wepPath).mtimeMs;
        if (cached && (now - cached.timestamp) < WEPCACHE_TTL && cached.mtime === mtime) {
            console.log(`[WepCache] 命中缓存: ${folder}`);
            return cached.directory;
        }
    } catch (e) {}

    // 如果缓存过期或无效，关闭旧的 directory
    if (cached && cached.directory) {
        try { cached.directory.close(); } catch (e) {}
    }

    // 打开新的 ZIP 目录（使用 Open.file API，只读中央目录，毫秒级）
    const t0 = Date.now();
    console.log(`[WepCache] 打开ZIP: ${wepPath}`);
    
    let directory;
    try {
        directory = await unzipper.Open.file(wepPath);
    } catch (openError) {
        console.error(`[WepCache] ZIP打开失败: ${openError.message}`);
        throw openError;
    }
    
    console.log(`[WepCache] ZIP打开完成: ${Date.now() - t0}ms, 文件数: ${directory.files.length}`);
    
    try {
        const mtime = fs.statSync(wepPath).mtimeMs;
        wepDirectoryCache.set(folder, { directory, mtime, timestamp: Date.now() });
    } catch (e) {}
    return directory;
}

// 系统文件过滤规则（在后端统一过滤，减少前端负担）
function shouldFilterSystemFile(filePath) {
    const fileName = filePath.split('/').pop();
    // 以 . 开头的隐藏文件（.metadata 等）
    if (fileName.startsWith('.')) return true;
    // .keep 占位文件
    if (filePath.endsWith('/.keep')) return true;
    // .wep 和 .bwep 压缩文件（项目本身）
    if (/\.wep$/i.test(fileName) || /\.bwep$/i.test(fileName)) return true;
    // 项目内部占位文件（不需要显示在文件树中）
    if (fileName === '__project__.md') return true;
    return false;
}

// 只读取文件名列表（毫秒级），过滤掉系统文件
async function readProjectFileList(folder, retries = 1) {
    try {
        const directory = await getWepDirectory(folder);
        if (!directory) return [];
        return directory.files
            .map(f => f.path)
            .filter(path => !shouldFilterSystemFile(path));
    } catch (e) {
        // 如果缓存的句柄失效，清除缓存重试
        if (retries > 0) {
            console.log(`[readProjectFileList] 缓存失效，清除重试...`);
            invalidateWepCache(folder);
            return readProjectFileList(folder, retries - 1);
        }
        throw e;
    }
}

// 读取单个文件内容（使用流式读取，稳定可靠）
async function readSingleFileContent(folder, filename, retries = 2) {
    // 检查内容缓存
    let contentMap = wepFileContentCache.get(folder);
    if (contentMap && contentMap.has(filename)) {
        const cached = contentMap.get(filename);
        if (cached === '__ERROR__') {
            contentMap.delete(filename);
        } else {
            return cached;
        }
    }

    const wepPath = path.join(folder, 'project.wep');
    if (!fs.existsSync(wepPath)) {
        console.warn(`[readSingleFileContent] WEP文件不存在: ${wepPath}`);
        return '';
    }

    try {
        // 打开 ZIP 目录
        const directory = await unzipper.Open.file(wepPath);
        
        try {
            // 查找文件（精确路径匹配）
            let file = directory.files.find(f => f.path === filename);
            
            // 如果没找到，尝试不区分大小写
            if (!file) {
                const lowerName = filename.toLowerCase();
                file = directory.files.find(f => f.path.toLowerCase() === lowerName);
            }
            
            if (!file) {
                console.warn(`[readSingleFileContent] 文件未找到: ${filename}`);
                console.warn(`[readSingleFileContent] ZIP中文件列表:`, directory.files.map(f => f.path).slice(0, 5));
                return '';
            }

            // 使用流式读取（比 buffer() 更稳定）
            const buffer = await new Promise((resolve, reject) => {
                const chunks = [];
                let totalSize = 0;
                let readStream;
                
                try {
                    readStream = file.stream();
                } catch (streamError) {
                    reject(streamError);
                    return;
                }
                
                readStream
                    .on('data', (chunk) => {
                        chunks.push(chunk);
                        totalSize += chunk.length;
                    })
                    .on('end', () => {
                        const result = Buffer.concat(chunks);
                        resolve(result);
                    })
                    .on('error', (err) => {
                        reject(err);
                    });
            });
            
            const content = buffer.toString('utf8');
            console.log(`[readSingleFileContent] 成功: ${filename}, size=${content.length}`);
            
            // 写入内容缓存
            if (!contentMap) {
                contentMap = new Map();
                wepFileContentCache.set(folder, contentMap);
            }
            if (contentMap.size >= MAX_CONTENT_CACHE_SIZE) {
                const firstKey = contentMap.keys().next().value;
                contentMap.delete(firstKey);
            }
            contentMap.set(filename, content);
            
            return content;
        } finally {
            // 确保 directory 总是被关闭
            try {
                if (directory && typeof directory.close === 'function') {
                    await directory.close();
                } else if (directory && typeof directory._close === 'function') {
                    await directory._close();
                }
            } catch (e) {}
        }
    } catch (e) {
        console.error(`[readSingleFileContent] 错误: ${filename}`, e.message);
        
        // 重试机制
        if (retries > 0) {
            console.log(`[readSingleFileContent] 重试 (${retries}次)...`);
            await new Promise(resolve => setTimeout(resolve, 300));
            return readSingleFileContent(folder, filename, retries - 1);
        }
        
        if (contentMap) {
            contentMap.set(filename, '__ERROR__');
        }
        throw e;
    }
}

// 读取所有文件内容（用于全量操作，如保存前的读取）
async function readProjectWep(folder) {
    const wepPath = path.join(folder, 'project.wep');
    if (!fs.existsSync(wepPath)) return {};

    let directory;
    try {
        directory = await unzipper.Open.file(wepPath);
    } catch (openError) {
        console.error(`[readProjectWep] ZIP打开失败: ${openError.message}`);
        throw openError;
    }
    
    const data = {};
    
    try {
        for (const file of directory.files) {
            try {
                // 使用流式读取，添加 stream() 调用的错误保护
                const buffer = await new Promise((resolve, reject) => {
                    const chunks = [];
                    let readStream;
                    
                    try {
                        readStream = file.stream();
                    } catch (streamError) {
                        reject(streamError);
                        return;
                    }
                    
                    readStream
                        .on('data', (chunk) => chunks.push(chunk))
                        .on('end', () => resolve(Buffer.concat(chunks)))
                        .on('error', reject);
                });
                const content = buffer.toString('utf8');
                data[file.path] = content;
                
                // 写入内容缓存
                let contentMap = wepFileContentCache.get(folder);
                if (!contentMap) {
                    contentMap = new Map();
                    wepFileContentCache.set(folder, contentMap);
                }
                if (contentMap.size >= MAX_CONTENT_CACHE_SIZE) {
                    const firstKey = contentMap.keys().next().value;
                    contentMap.delete(firstKey);
                }
                contentMap.set(file.path, content);
            } catch (e) {
                console.warn(`[readProjectWep] 读取失败: ${file.path}`, e.message);
                data[file.path] = '';
            }
        }
    } finally {
        // 确保 directory 总是被关闭
        try {
            if (directory && typeof directory.close === 'function') {
                await directory.close();
            } else if (directory && typeof directory._close === 'function') {
                await directory._close();
            }
        } catch (e) {}
    }
    
    console.log(`[readProjectWep] 完成, ${Object.keys(data).length} 个文件`);
    return data;
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
        output.on('close', () => {
            // 写入完成后失效缓存
            invalidateWepCache(folder);
            resolve();
        });
        archive.finalize();
    });
}
function backupProject(folder) {
    const backupDir = path.join(folder, 'Backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const name = path.basename(folder);
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const timestamp = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const backupPath = path.join(backupDir, `${name}_${timestamp}.bwep`);
    const wepPath = path.join(folder, 'project.wep');
    if (fs.existsSync(wepPath)) {
        try {
            fs.copyFileSync(wepPath, backupPath);
            // 显式设置备份文件的修改时间为当前时间（Windows 下 copyFileSync 会保留源文件 mtime）
            fs.utimesSync(backupPath, now, now);
            const stat = fs.statSync(backupPath);
            console.log(`[backupProject] 备份已创建: ${backupPath}, size=${stat.size}, mtime=${stat.mtime.toISOString()}`);
        } catch (e) {
            console.error(`[backupProject] 备份失败: ${e.message}`);
            return;
        }
        // 清理旧备份，只保留最近 10 份（按文件修改时间排序，而不是文件名）
        try {
            const files = fs.readdirSync(backupDir)
                .filter(f => f.endsWith('.bwep'))
                .map(f => ({ name: f, mtime: fs.statSync(path.join(backupDir, f)).mtimeMs }))
                .sort((a, b) => b.mtime - a.mtime); // 最新的排前面
            if (files.length > 10) {
                files.slice(10).forEach(f => {
                    try { fs.unlinkSync(path.join(backupDir, f.name)); } catch (e) {}
                });
            }
            console.log(`[backupProject] 清理完成: 保留 ${Math.min(files.length, 10)} 份备份`);
        } catch (e) {}
    } else {
        console.warn(`[backupProject] .wep 不存在，无法创建备份: ${wepPath}`);
    }
}

function createSplash() {
    let preset = appSettings.colorPreset || 'default-dark';
    if (preset === 'auto') {
        preset = nativeTheme.shouldUseDarkColors ? 'default-dark' : 'default-light';
    }
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

// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  ⚠️  方案 B：全 weWindow-native DWM 材质                                    ║
// ║                                                                              ║
// ║  不再依赖 mica-electron 做材质/圆角！                                       ║
// ║  全部调我们自己的 native 模块直接调 DWM API：                                  ║
// ║    weWindow.setMaterial(win, MATERIAL.MICA/ACRYLIC/TABBED/NONE)              ║
// ║    weWindow.setCorner(win, CORNER.ROUND/DONOTROUND/...)                      ║
// ║                                                                              ║
// ║  transparent:false + WS_CAPTION 后：                                         ║
// ║    · DWM Mica/Acrylic/Tabbed 直接由 DWMWA_SYSTEMBACKDROP 实现                  ║
// ║    · 圆角自动跟随最大化/还原（DWM 原生行为）                                  ║
// ║    · 不需要 setRoundedCorner()（mica-electron 的方法已不相关）                 ║
// ╚══════════════════════════════════════════════════════════════════════════════╝
function applyMicaMaterial(win, material) {
    if (!win || win.isDestroyed()) {
        console.log('[applyMicaMaterial] ❌ win 无效或已销毁');
        return;
    }
    // Electron 原生 backgroundMaterial 接受：'auto' | 'none' | 'mica' | 'acrylic' | 'tabbed'
    const mat = material === 'transparent' ? 'none' : material;
    console.log(`[applyMicaMaterial] → Electron 原生 setBackgroundMaterial('${mat}')`);
    try {
        if (typeof win.setBackgroundMaterial === 'function') {
            win.setBackgroundMaterial(mat);
            console.log('[applyMicaMaterial] ✅ setBackgroundMaterial 成功');
        } else {
            console.warn('[applyMicaMaterial] ⚠️ BrowserWindow.setBackgroundMaterial 不存在（Electron 版本过低？）');
        }
        // 圆角：Electron backgroundMaterial 自动处理，最大化/还原时 DWM 自动切换
        if (weWindow && weWindow.isLoaded() && !win.__isMaximized) {
            const ok = weWindow.setCorner(win, weWindow.CORNER.ROUND);
            console.log(`[applyMicaMaterial] setCorner(ROUND)=${ok}`);
        }
    } catch (e) {
        console.error(`[applyMicaMaterial] ❌ 异常: ${e.message}\n${e.stack}`);
    }
}

function createMainWindow() {
    const material = appSettings.backgroundMaterial || 'none';
    const validMaterial = (material === 'transparent') ? 'none' : material;
    // ╔══════════════════════════════════════════════════════════════════════════════╗
    // ║  ⚠️  方案 B：原生 Win32 窗口（DWM 完全接管）                                ║
    // ║                                                                              ║
    // ║  不再用 MicaBrowserWindow（它强制 transparent:true + removeCaption）！         ║
    // ║  改成纯原生 BrowserWindow({frame:false, transparent:false})                  ║
    // ║                                                                              ║
    // ║  创建后 we-window-native 做 3 件事：                                        ║
    // ║    1. EnableThickFrame    → WS_CAPTION + WS_THICKFRAME + WS_MAX/MIN           ║
    // ║    2. ExtendFrame        → DwmExtendFrameIntoClientArea（Chromium 画整个窗口） ║
    // ║    3. applyMicaMaterial  → weWindow.setMaterial（DWM 画 Mica 在背后）          ║
    // ║                                                                              ║
    // ║  结果：                                                                      ║
    // ║    · DWM 原生接管：Aero Snap ✅  边缘 resize ✅  最大化动画 ✅  圆角自动 ✅     ║
    // ║    · Chromium 画内容（background:transparent）+ CSS -webkit-app-region:drag  ║
    // ║    · DWM 在背后画 Mica/Acrylic → 透出来 ✅                                   ║
    // ╚══════════════════════════════════════════════════════════════════════════════╝
    console.log(`\n========== [createMainWindow] 创建窗口 ==========`);
    console.log(`  appSettings.backgroundMaterial=${material}`);
    console.log(`  validMaterial=${validMaterial}`);
    console.log(`  IS_WIN11_MICA=${IS_WIN11_MICA}`);
    console.log(`  IS_MOBILE_MODE=${IS_MOBILE_MODE}`);
    console.log(`  weWindow=${!!weWindow}`);

    // ✅ Electron 原生支持！backgroundMaterial + thickFrame = DWM 完全接管
    // thickFrame 默认 true，显式写更清楚：WS_THICKFRAME 让 frame:false 窗口支持边缘 resize + Aero Snap
    // backgroundMaterial 直接设 DWMWA_SYSTEMBACKDROP，Chromium 透明背景 → DWM Mica 透出来 ✅
    mainWin = new BrowserWindow({
        width: 1000, height: 700, minWidth: 240, minHeight: 300, frame: false,
        thickFrame: true,                         // ⚠️ 关键！WS_THICKFRAME → 边缘 resize + Aero Snap
        show: false,
        transparent: false,                       // 非分层窗口，让 DWM 完全接管原生行为
        backgroundColor: '#00000000',              // 透明初始背景
        backgroundMaterial: validMaterial === 'none' ? 'none' : validMaterial, // Electron 原生 Mica/Acrylic
        icon: path.join(__dirname, 'resources', 'icon.png'),
        webPreferences: { 
            preload: path.join(__dirname, 'preload.js'), 
            contextIsolation: true, 
            nodeIntegration: false,
            webSecurity: false
        }
    });
    console.log(`[createMainWindow] 窗口已创建 | id=${mainWin.id}`);
    mainWin.loadFile('renderer/main.html');

    mainWin.setMinimumSize(240, 300);

    // ⚠️ 方案 B：关键！窗口创建后立即应用 Win32 样式 + DWM 配置
    // thickFrame 已在构造函数里设了，backgroundMaterial 也已设好
    // 这里只做圆角调整和监听
    mainWin.once('ready-to-show', () => {
        // ✅ show() 无条件调用！
        mainWin.show();
        mainWin.webContents.send('maximized-change', mainWin.isMaximized());

        // 1. 圆角：Electron backgroundMaterial 自动处理 Win11 圆角
        //    最大化/还原时 DWM 自动切换，不需要手动干预
        //    但如果有 native 模块，手动设一下更保险
        if (weWindow && weWindow.isLoaded() && !mainWin.__isMaximized) {
            const ok = weWindow.setCorner(mainWin, weWindow.CORNER.ROUND);
            console.log(`[ready-to-show] setCorner(ROUND)=${ok}`);
        }

        // 2. 圆角自动切换监听（最大化→无圆角，还原→有圆角）
        mainWin.on('maximize', () => {
            mainWin.__isMaximized = true;
            mainWin.webContents.send('maximized-change', true);
            if (weWindow && weWindow.isLoaded()) {
                weWindow.setCorner(mainWin, weWindow.CORNER.DONOTROUND);
            }
        });
        mainWin.on('unmaximize', () => {
            mainWin.__isMaximized = false;
            mainWin.webContents.send('maximized-change', false);
            if (weWindow && weWindow.isLoaded()) {
                weWindow.setCorner(mainWin, weWindow.CORNER.ROUND);
            }
        });
    });

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

    ipcMain.on('minimize-window', () => weWindow && weWindow.isLoaded() ? weWindow.nativeMinimize(mainWin) : mainWin.minimize());
    ipcMain.on('maximize-window', () => {
        if (!mainWin || mainWin.isDestroyed()) return;
        if (mainWin.isMaximized()) {
            if (weWindow && weWindow.isLoaded()) weWindow.nativeRestore(mainWin);
            else mainWin.unmaximize();
        } else {
            if (weWindow && weWindow.isLoaded()) weWindow.nativeMaximize(mainWin);
            else mainWin.maximize();
        }
    });
    ipcMain.on('unmaximize-window', () => { if (mainWin && !mainWin.isDestroyed() && mainWin.isMaximized()) {
        if (weWindow && weWindow.isLoaded()) weWindow.nativeRestore(mainWin);
        else mainWin.unmaximize();
    }});
    ipcMain.on('close-window', () => mainWin.close());
    ipcMain.handle('is-maximized', () => !!(mainWin && !mainWin.isDestroyed() && mainWin.isMaximized()));

    // ╔══════════════════════════════════════════════════════════════════════════╗
    // ║  方案 B：restore-for-drag / move-window-to 全部简化！                  ║
    // ║                                                                          ║
    // ║  transparent:false + WS_CAPTION + CSS -webkit-app-region:drag            ║
    // ║  → DWM 原生处理 SC_MOVE 拖动循环                                        ║
    // ║    · 最大化窗口上拖动 → SC_MOVE 自动 SW_RESTORE → 继续跟随鼠标           ║
    // ║    · 还原后的位置由 SC_MOVE 自然处理                                     ║
    // ║    · DWM 感知移动 → Aero Snap 贴靠预览自动出现 ✅                        ║
    // ║                                                                          ║
    // ║  所以 restore-for-drag 和 move-window-to 都不需要了！                    ║
    // ║  保留 handler 空实现以防渲染端还在发 IPC（避免 crash）                   ║
    // ╚══════════════════════════════════════════════════════════════════════════╝
    ipcMain.handle('restore-for-drag', () => null);
    ipcMain.on('move-window-to', () => {});

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

    ipcMain.handle('delete-user-config', () => {
        try {
            if (fs.existsSync(ACCOUNT_PATH)) fs.unlinkSync(ACCOUNT_PATH);
            if (fs.existsSync(ACCOUNT_AVATAR_DIR)) fs.rmSync(ACCOUNT_AVATAR_DIR, { recursive: true, force: true });
            appSettings = { ...DEFAULT_SETTINGS };
            saveSettings();
            return { success: true };
        } catch (e) { return { success: false, error: e.message }; }
    });

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

    // === 基于解包目录的文件操作 ===
    
    // IPC 安全包装器 - 确保所有 handler 都能返回 reply，防止 "reply was never sent" 错误
    function safeIpcHandle(channel, handler) {
        ipcMain.handle(channel, async (event, ...args) => {
            try {
                const result = await handler(event, ...args);
                return result;
            } catch (e) {
                console.error(`[IPC:${channel}] 未捕获错误:`, e.message);
                if (e && e.stack) {
                    console.error('[IPC:${channel}] 堆栈:', e.stack);
                }
                return { success: false, error: e.message || '未知错误' };
            }
        });
    }
    
    // 将 ZIP 内路径转换为本地文件路径
    function zipPathToLocal(extractDir, zipPath) {
        // Windows 下确保路径分隔符正确
        const safePath = zipPath.replace(/\//g, path.sep).replace(/\\/g, path.sep);
        return path.join(extractDir, safePath);
    }
    
    // 将本地文件路径转换为 ZIP 内路径（相对于 extractDir）
    function localPathToZip(extractDir, localPath) {
        const relative = path.relative(extractDir, localPath);
        return relative.replace(/\\/g, '/');
    }
    
    // 检查文件是否应该被过滤（系统文件）
    function shouldFilterSystemFile(filePath) {
        const fileName = filePath.split('/').pop();
        if (fileName.startsWith('.')) return true;
        if (filePath.endsWith('/.keep')) return true;
        if (/\.wep$/i.test(fileName) || /\.bwep$/i.test(fileName)) return true;
        if (fileName === '.extract_meta.json') return true;
        if (fileName === '__project__.md') return true;
        return false;
    }
    
    // 列出文件（从解包目录）
    ipcMain.handle('list-files', async (event, folder) => {
        try {
            const t0 = Date.now();
            let extractDir = getExtractDir(folder);
            
            // 检查临时目录是否为空或损坏
            if (extractDir && fs.existsSync(extractDir)) {
                try {
                    const dirFiles = fs.readdirSync(extractDir);
                    const visibleFiles = dirFiles.filter(f => f !== '.extract_meta.json' && !f.startsWith('.'));
                    if (visibleFiles.length === 0) {
                        console.warn(`[list-files] 临时目录为空: ${extractDir}, 强制重新解压`);
                        try { fs.rmSync(extractDir, { recursive: true, force: true }); } catch (e) {}
                        projectExtractMap.delete(folder);
                        extractDir = null;
                    }
                } catch (dirErr) {
                    console.warn(`[list-files] 临时目录读取失败: ${dirErr.message}, 强制重新解压`);
                    try { fs.rmSync(extractDir, { recursive: true, force: true }); } catch (e) {}
                    projectExtractMap.delete(folder);
                    extractDir = null;
                }
            }
            
            if (!extractDir) {
                // 自动解包
                await extractProject(folder);
                extractDir = getExtractDir(folder);
                if (!extractDir) {
                    return { success: true, files: [] };
                }
            }
            
            // 递归列出所有文件
            const files = [];
            function scanDir(dir) {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);
                    const relativePath = path.relative(extractDir, fullPath).replace(/\\/g, '/');
                    
                    if (entry.isDirectory()) {
                        // 检查目录下是否有非系统文件
                        const hasVisibleFiles = scanDir(fullPath);
                        if (hasVisibleFiles && !shouldFilterSystemFile(relativePath)) {
                            files.push(relativePath + '/');
                        }
                    } else {
                        if (!shouldFilterSystemFile(relativePath)) {
                            files.push(relativePath);
                        }
                    }
                }
                // 返回是否有可见文件
                return entries.some(e => !shouldFilterSystemFile(e.name));
            }
            scanDir(extractDir);
            
            console.log(`[IPC] list-files: ${Date.now() - t0}ms, ${files.length} files`);
            return { success: true, files };
        } catch (e) {
            console.error('[IPC] list-files error:', e.message);
            return { success: false, error: e.message };
        }
    });
    
    // 打开项目（触发解包）
    ipcMain.handle('open-project', async (event, folder) => {
        if (!fs.existsSync(folder)) return { success: false, error: '文件夹不存在' };
        addRecent(folder);
        try {
            const t0 = Date.now();
            
            // 解包项目到临时目录
            const extractDir = await extractProject(folder);
            
            // 读取文件列表
            const files = [];
            function scanDir(dir) {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);
                    const relativePath = path.relative(extractDir, fullPath).replace(/\\/g, '/');
                    
                    if (entry.isDirectory()) {
                        scanDir(fullPath);
                    } else {
                        if (!shouldFilterSystemFile(relativePath)) {
                            files.push(relativePath);
                        }
                    }
                }
            }
            scanDir(extractDir);
            
            // 读取元数据
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
            
            console.log(`[IPC] open-project: ${Date.now() - t0}ms, ${files.length} files`);
            return { success: true, folder, name: path.basename(folder), fileList: files, projectMode, owner };
        } catch (e) { 
            console.error('[IPC] open-project error:', e.message);
            return { success: false, error: e.message }; 
        }
    });
    
    // 关闭项目（重新打包 + 备份）
    ipcMain.handle('close-project', async (event, folder, shouldSave) => {
        try {
            if (shouldSave !== false && isProjectDirty(folder)) {
                // 关键修复：先备份当前 .wep，再打包
                if (fs.existsSync(path.join(folder, 'project.wep'))) {
                    backupProject(folder);
                }
                await packProject(folder);
                // 打包成功后创建新状态备份
                backupProject(folder);
            }
            // 不删除解包目录（缓存加速）
            projectExtractMap.delete(folder);
            projectDirtyMap.delete(folder);
            return { success: true };
        } catch (e) { return { success: false, error: e.message }; }
    });
    
    // 清理临时目录
    ipcMain.handle('clear-temp-directory', async (event, options = {}) => {
        try {
            console.log('[clear-temp-directory] 开始清理临时目录:', EXTRACT_DIR);
            
            // 统计要删除的项目数
            let clearedCount = 0;
            const errors = [];
            
            if (!fs.existsSync(EXTRACT_DIR)) {
                return { success: true, message: '临时目录不存在', clearedCount: 0, totalSize: 0 };
            }
            
            // 获取当前正在打开的项目
            const activeProjects = Array.from(projectExtractMap.keys());
            console.log('[clear-temp-directory] 当前活跃项目:', activeProjects);
            
            // 遍历临时目录中的所有项目
            const entries = fs.readdirSync(EXTRACT_DIR, { withFileTypes: true });
            
            for (const entry of entries) {
                if (!entry.isDirectory()) continue;
                
                const projectDir = path.join(EXTRACT_DIR, entry.name);
                const folderPath = path.join(entry.name); // 原始项目路径
                
                // 如果指定了清理特定项目
                if (options.projects && Array.isArray(options.projects)) {
                    const isTarget = options.projects.some(p => entry.name === getSafeExtractName(p));
                    if (!isTarget) continue;
                }
                
                // 如果排除活跃项目
                if (options.excludeActive !== false) {
                    const isActive = activeProjects.some(p => entry.name === getSafeExtractName(p));
                    if (isActive) {
                        console.log(`[clear-temp-directory] 跳过活跃项目: ${entry.name}`);
                        continue;
                    }
                }
                
                try {
                    // 计算目录大小
                    const dirSize = calculateDirSize(projectDir);
                    
                    // 删除目录
                    fs.rmSync(projectDir, { recursive: true, force: true });
                    clearedCount++;
                    
                    console.log(`[clear-temp-directory] 已清理: ${entry.name} (${formatSize(dirSize)})`);
                } catch (err) {
                    console.error(`[clear-temp-directory] 清理失败: ${entry.name}`, err.message);
                    errors.push({ name: entry.name, error: err.message });
                }
            }
            
            // 如果目录为空，删除根目录
            try {
                const remaining = fs.readdirSync(EXTRACT_DIR);
                if (remaining.length === 0) {
                    fs.rmSync(EXTRACT_DIR, { recursive: true, force: true });
                    console.log('[clear-temp-directory] 临时目录已清空');
                }
            } catch (e) {
                // 忽略
            }
            
            return { 
                success: true, 
                clearedCount, 
                errors: errors.length > 0 ? errors : undefined,
                message: `已清理 ${clearedCount} 个项目的临时文件`
            };
        } catch (e) { 
            console.error('[clear-temp-directory] 错误:', e);
            return { success: false, error: e.message }; 
        }
    });
    
    // 获取临时目录状态
    ipcMain.handle('get-temp-directory-status', async (event) => {
        try {
            if (!fs.existsSync(EXTRACT_DIR)) {
                return { exists: false, projects: [], totalSize: 0, activeCount: projectExtractMap.size };
            }
            
            const activeProjects = Array.from(projectExtractMap.keys());
            const entries = fs.readdirSync(EXTRACT_DIR, { withFileTypes: true });
            const projects = [];
            let totalSize = 0;
            
            for (const entry of entries) {
                if (!entry.isDirectory()) continue;
                
                const projectDir = path.join(EXTRACT_DIR, entry.name);
                const size = calculateDirSize(projectDir);
                const isActive = activeProjects.some(p => entry.name === getSafeExtractName(p));
                
                projects.push({
                    name: entry.name,
                    size,
                    sizeFormatted: formatSize(size),
                    isActive,
                    lastModified: getLastModifiedTime(projectDir)
                });
                
                totalSize += size;
            }
            
            return { 
                exists: true, 
                projects, 
                totalSize,
                totalSizeFormatted: formatSize(totalSize),
                activeCount: projectExtractMap.size,
                idleCount: projects.filter(p => !p.isActive).length
            };
        } catch (e) { 
            return { exists: false, projects: [], totalSize: 0, error: e.message }; 
        }
    });
    
    // 手动保存项目（重新打包 + 备份）
    ipcMain.handle('save-project', async (event, folder) => {
        try {
            const wepPath = path.join(folder, 'project.wep');
            const beforeStat = fs.existsSync(wepPath) ? fs.statSync(wepPath) : null;
            console.log(`[save-project] 保存前: .wep=${beforeStat ? beforeStat.size + ' bytes, mtime=' + beforeStat.mtime.toISOString() : '不存在'}`);
            
            // 关键修复：先备份当前 .wep，再打包
            // 这样即使 packProject 失败，也有时间戳备份可用
            if (fs.existsSync(wepPath)) {
                backupProject(folder);
            } else {
                console.warn('[save-project] .wep 不存在，跳过预备份');
            }
            
            const success = await packProject(folder);
            if (success) {
                const afterStat = fs.statSync(wepPath);
                console.log(`[save-project] 保存后: .wep=${afterStat.size} bytes, mtime=${afterStat.mtime.toISOString()}`);
                
                // 打包成功后创建时间戳备份到 Backups 目录
                backupProject(folder);
                
                // 验证：确认备份文件和新 .wep 大文件一致
                try {
                    const backupDir = path.join(folder, 'Backups');
                    const backups = fs.readdirSync(backupDir)
                        .filter(f => f.endsWith('.bwep') && f.startsWith(path.basename(folder) + '_'))
                        .sort().reverse();
                    if (backups.length > 0) {
                        const latestBackup = path.join(backupDir, backups[0]);
                        const backupStat = fs.statSync(latestBackup);
                        console.log(`[save-project] 验证: .wep=${afterStat.size} bytes (mtime=${afterStat.mtime.toISOString()}), 最新备份=${backups[0]}=${backupStat.size} bytes (mtime=${backupStat.mtime.toISOString()})`);
                        if (Math.abs(afterStat.size - backupStat.size) > 1024) {
                            console.warn('[save-project] 警告: 备份与 .wep 大小不一致！');
                        }
                    }
                } catch (e) {
                    console.warn('[save-project] 备份验证失败:', e.message);
                }
                
                return { success: true };
            } else {
                return { success: false, error: '打包失败' };
            }
        } catch (e) { return { success: false, error: e.message }; }
    });
    
    // 读取文件（从解包目录）
    ipcMain.handle('read-file', async (event, folder, filename) => {
        try {
            const t0 = Date.now();
            let extractDir = getExtractDir(folder);
            let tempDirMissing = false;
            
            // 检查临时目录是否为空或损坏
            if (extractDir && fs.existsSync(extractDir)) {
                try {
                    const dirFiles = fs.readdirSync(extractDir);
                    // 如果临时目录只有 .extract_meta.json 或完全空，说明损坏
                    const visibleFiles = dirFiles.filter(f => f !== '.extract_meta.json');
                    if (visibleFiles.length === 0) {
                        console.warn(`[read-file] 临时目录为空: ${extractDir}, 强制重新解压`);
                        try { fs.rmSync(extractDir, { recursive: true, force: true }); } catch (e) {}
                        projectExtractMap.delete(folder);
                        extractDir = null;
                        tempDirMissing = true;
                    }
                } catch (dirErr) {
                    console.warn(`[read-file] 临时目录读取失败: ${dirErr.message}, 强制重新解压`);
                    try { fs.rmSync(extractDir, { recursive: true, force: true }); } catch (e) {}
                    projectExtractMap.delete(folder);
                    extractDir = null;
                    tempDirMissing = true;
                }
            }
            
            if (!extractDir) {
                console.warn(`[read-file] 未找到解包目录，尝试重新解压: ${folder}`);
                await extractProject(folder);
                extractDir = getExtractDir(folder);
                if (!extractDir) {
                    return { success: false, error: '项目未打开' };
                }
            }
            
            const localPath = zipPathToLocal(extractDir, filename);
            if (!fs.existsSync(localPath)) {
                console.warn(`[read-file] 文件不存在: ${filename}, localPath: ${localPath}`);
                
                // 尝试从 .wep 直接读取作为 fallback
                try {
                    console.log(`[read-file] 尝试从 .wep 直接读取: ${filename}`);
                    const wepContent = await readSingleFileContent(folder, filename);
                    if (wepContent && wepContent.length > 0) {
                        console.log(`[read-file] 从 .wep 读取成功: ${filename}, size=${wepContent.length}, 写入临时目录自愈`);
                        
                        // 自愈：将内容写回临时目录
                        try {
                            const dir = path.dirname(localPath);
                            if (!fs.existsSync(dir)) {
                                fs.mkdirSync(dir, { recursive: true });
                            }
                            fs.writeFileSync(localPath, wepContent, 'utf8');
                            console.log(`[read-file] 自愈成功: ${filename} 已写回临时目录`);
                        } catch (healErr) {
                            console.warn(`[read-file] 自愈写入失败: ${healErr.message}`);
                        }
                        
                        // 返回读取到的内容（继续走正常流程处理 data URL 等）
                        let content = wepContent;
                        
                        // 处理空文件
                        if (!content || content.trim() === '') {
                            console.log(`[read-file] 空文件: ${filename}`);
                            return { success: true, content: '' };
                        }
                        
                        // 检查是否是 data URL 格式
                        if (content.startsWith('data:')) {
                            console.log(`[read-file] 检测到 data URL 格式, 正在转换: ${filename}, contentLength=${content.length}`);
                            const commaIdx = content.indexOf(',');
                            if (commaIdx > 0) {
                                const metaPart = content.slice(0, commaIdx);
                                const base64Data = content.slice(commaIdx + 1);
                                
                                const mimeMatch = metaPart.match(/data:([^;]+)/);
                                const encodingMatch = metaPart.match(/;base64$/);
                                const mimeType = mimeMatch ? mimeMatch[1] : '';
                                const isBase64 = !!encodingMatch;
                                
                                console.log(`[read-file] data URL 元信息: mimeType=${mimeType}, isBase64=${isBase64}`);
                                
                                const isTextType = mimeType.startsWith('text/') || 
                                    mimeType === 'application/json' ||
                                    mimeType === 'application/xml' ||
                                    mimeType === 'application/javascript' ||
                                    mimeType === 'application/atom+xml' ||
                                    mimeType === 'application/x-javascript' ||
                                    filename.endsWith('.txt') || 
                                    filename.endsWith('.md') ||
                                    filename.endsWith('.json') ||
                                    filename.endsWith('.xml') ||
                                    filename.endsWith('.js') ||
                                    filename.endsWith('.ts') ||
                                    filename.endsWith('.html') ||
                                    filename.endsWith('.css') ||
                                    filename.endsWith('.log') ||
                                    filename.endsWith('.csv') ||
                                    filename.endsWith('.yml') ||
                                    filename.endsWith('.yaml');
                                
                                if (isTextType) {
                                    try {
                                        if (isBase64) {
                                            content = Buffer.from(base64Data, 'base64').toString('utf8');
                                        } else {
                                            content = decodeURIComponent(base64Data);
                                        }
                                        console.log(`[read-file] data URL 转换成功: ${filename}, newSize=${content.length}`);
                                    } catch (e) {
                                        console.warn(`[read-file] data URL 解码失败: ${e.message}`);
                                    }
                                } else {
                                    console.log(`[read-file] 非文本类型 data URL，保持原样: ${filename}, mimeType=${mimeType}`);
                                }
                            }
                        }
                        
                        const elapsed = Date.now() - t0;
                        console.log(`[read-file] 完成(.wep fallback): ${elapsed}ms, ${filename}, size=${content.length}`);
                        return { success: true, content };
                    }
                } catch (fallbackErr) {
                    console.warn(`[read-file] .wep fallback 也失败: ${fallbackErr.message}`);
                }
                
                return { success: false, error: '文件不存在' };
            }
            
            const stat = fs.statSync(localPath);
            console.log(`[read-file] 读取文件: ${filename}, size=${stat.size}`);
            
            // 如果文件太大，直接报错
            if (stat.size > 50 * 1024 * 1024) { // 50MB
                console.warn(`[read-file] 文件过大: ${filename}, size=${stat.size}`);
                return { success: false, error: '文件过大，无法加载' };
            }
            
            // 读取文件内容
            let content = fs.readFileSync(localPath, 'utf8');
            
            // 处理空文件
            if (!content || content.trim() === '') {
                console.log(`[read-file] 空文件: ${filename}`);
                return { success: true, content: '' };
            }
            
            // 检查是否是 data URL 格式的文件（旧格式存储方式）
            if (content.startsWith('data:')) {
                console.log(`[read-file] 检测到 data URL 格式, 正在转换: ${filename}, contentLength=${content.length}`);
                // data URL: data:mimeType;base64,base64Data
                const commaIdx = content.indexOf(',');
                if (commaIdx > 0) {
                    const metaPart = content.slice(0, commaIdx);
                    const base64Data = content.slice(commaIdx + 1);
                    
                    // 提取 MIME 类型和编码方式
                    const mimeMatch = metaPart.match(/data:([^;]+)/);
                    const encodingMatch = metaPart.match(/;base64$/);
                    const mimeType = mimeMatch ? mimeMatch[1] : '';
                    const isBase64 = !!encodingMatch;
                    
                    console.log(`[read-file] data URL 元信息: mimeType=${mimeType}, isBase64=${isBase64}`);
                    
                    // 判断是否为文本文件（通过 MIME 类型或文件扩展名）
                    const isTextType = mimeType.startsWith('text/') || 
                        mimeType === 'application/json' ||
                        mimeType === 'application/xml' ||
                        mimeType === 'application/javascript' ||
                        mimeType === 'application/atom+xml' ||
                        mimeType === 'application/x-javascript' ||
                        filename.endsWith('.txt') || 
                        filename.endsWith('.md') ||
                        filename.endsWith('.json') ||
                        filename.endsWith('.xml') ||
                        filename.endsWith('.js') ||
                        filename.endsWith('.ts') ||
                        filename.endsWith('.html') ||
                        filename.endsWith('.css') ||
                        filename.endsWith('.log') ||
                        filename.endsWith('.csv') ||
                        filename.endsWith('.yml') ||
                        filename.endsWith('.yaml');
                    
                    if (isTextType) {
                        try {
                            if (isBase64) {
                                content = Buffer.from(base64Data, 'base64').toString('utf8');
                            } else {
                                // 非 base64 编码的 data URL，直接解码
                                content = decodeURIComponent(base64Data);
                            }
                            console.log(`[read-file] data URL 转换成功: ${filename}, newSize=${content.length}`);
                        } catch (e) {
                            console.warn(`[read-file] data URL 解码失败: ${e.message}`);
                            // 返回原始内容，让前端处理
                        }
                    } else {
                        console.log(`[read-file] 非文本类型 data URL，保持原样: ${filename}, mimeType=${mimeType}`);
                    }
                }
            }
            
            const elapsed = Date.now() - t0;
            if (elapsed > 1000) {
                console.warn(`[read-file] 文件读取耗时较长: ${elapsed}ms, ${filename}`);
            } else {
                console.log(`[read-file] 完成: ${elapsed}ms, ${filename}, size=${content.length}`);
            }
            return { success: true, content };
        } catch (e) { 
            console.error('[read-file] 错误:', e.message);
            return { success: false, error: e.message }; 
        }
    });
    
    // 保存文件（到解包目录，不立即打包）
    ipcMain.handle('save-file', async (event, folder, filename, content) => {
        try {
            const extractDir = getExtractDir(folder);
            if (!extractDir) {
                return { success: false, error: '项目未打开' };
            }
            
            const localPath = zipPathToLocal(extractDir, filename);
            const dir = path.dirname(localPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            
            // 保存前检查：如果现有文件有内容，但新内容是空的，发出警告
            // 但仍然允许保存（可能用户确实想清空文件）
            if (fs.existsSync(localPath)) {
                const existingContent = fs.readFileSync(localPath, 'utf8');
                if (existingContent.length > 0 && (!content || content.trim() === '')) {
                    console.warn(`[save-file] 警告: 将用空内容覆盖有内容的文件: ${filename}, 原大小=${existingContent.length}`);
                }
            }
            
            // 处理 data URL 格式的媒体文件（图片、视频等）
            // 只有真正以 data: 开头的 base64 编码内容才转换
            let writeContent = content;
            if (typeof content === 'string' && 
                content.startsWith('data:') && 
                content.includes(';base64,')) {
                console.log(`[save-file] 检测到 data URL 格式, 正在转换: ${filename}`);
                const commaIdx = content.indexOf(',');
                if (commaIdx > 0) {
                    const metaPart = content.slice(0, commaIdx);
                    const base64Data = content.slice(commaIdx + 1);
                    
                    // 只有文本类型才解码
                    const mimeMatch = metaPart.match(/data:([^;]+)/);
                    const mimeType = mimeMatch ? mimeMatch[1] : '';
                    const isTextType = mimeType.startsWith('text/') || 
                        mimeType === 'application/json' ||
                        mimeType === 'application/xml' ||
                        mimeType === 'application/javascript';
                    
                    if (isTextType) {
                        try {
                            writeContent = Buffer.from(base64Data, 'base64').toString('utf8');
                            console.log(`[save-file] data URL 文本转换成功: ${filename}, newSize=${writeContent.length}`);
                        } catch (e) {
                            console.warn(`[save-file] data URL 解码失败, 使用原始内容`);
                        }
                    } else {
                        console.log(`[save-file] 非文本类型 data URL, 直接保存: ${filename}`);
                    }
                }
            }
            
            // 对于 HTML 内容（富文本编辑器输出），直接保存
            // HTML 内容会以 < 开头，不需要转换
            if (typeof content === 'string' && content.startsWith('<')) {
                writeContent = content; // 保持原样
            }
            
            fs.writeFileSync(localPath, writeContent, 'utf8');
            markProjectDirty(folder);
            
            console.log(`[save-file] 保存成功: ${filename}, size=${writeContent.length}`);
            
            // 返回更新后的文件列表
            const files = [];
            function scanDir(dirPath) {
                const entries = fs.readdirSync(dirPath, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(dirPath, entry.name);
                    const relativePath = path.relative(extractDir, fullPath).replace(/\\/g, '/');
                    
                    if (entry.isDirectory()) {
                        scanDir(fullPath);
                    } else {
                        if (!shouldFilterSystemFile(relativePath)) {
                            files.push(relativePath);
                        }
                    }
                }
            }
            scanDir(extractDir);
            
            return { success: true, fileList: files };
        } catch (e) { 
            console.error('[save-file] 保存失败:', e.message);
            return { success: false, error: e.message }; 
        }
    });
    
    // 创建新文件
    ipcMain.handle('add-file', async (event, folder, filename) => {
        try {
            const extractDir = getExtractDir(folder);
            if (!extractDir) {
                return { success: false, error: '项目未打开' };
            }
            
            const localPath = zipPathToLocal(extractDir, filename);
            if (fs.existsSync(localPath)) {
                return { success: false, error: '文件已存在' };
            }
            
            // 确保目录存在
            const dir = path.dirname(localPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            
            // 创建空文件
            fs.writeFileSync(localPath, '', 'utf8');
            markProjectDirty(folder);
            
            // 返回更新后的文件列表
            const files = [];
            function scanDir(dirPath) {
                const entries = fs.readdirSync(dirPath, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(dirPath, entry.name);
                    const relativePath = path.relative(extractDir, fullPath).replace(/\\/g, '/');
                    
                    if (entry.isDirectory()) {
                        scanDir(fullPath);
                    } else {
                        if (!shouldFilterSystemFile(relativePath)) {
                            files.push(relativePath);
                        }
                    }
                }
            }
            scanDir(extractDir);
            
            console.log(`[add-file] ${filename}, 共 ${files.length} 个文件`);
            return { success: true, fileList: files };
        } catch (e) { 
            console.error('[add-file] Error:', e.message);
            return { success: false, error: e.message }; 
        }
    });
    
    // 创建文件夹
    ipcMain.handle('add-folder', async (event, folder, folderPath) => {
        try {
            const extractDir = getExtractDir(folder);
            if (!extractDir) {
                return { success: false, error: '项目未打开' };
            }
            
            const localPath = zipPathToLocal(extractDir, folderPath);
            if (fs.existsSync(localPath)) {
                return { success: false, error: '已存在同名项' };
            }
            
            fs.mkdirSync(localPath, { recursive: true });
            // 创建 .keep 占位文件
            fs.writeFileSync(path.join(localPath, '.keep'), '', 'utf8');
            markProjectDirty(folder);
            
            // 返回更新后的文件列表
            const files = [];
            function scanDir(dirPath) {
                const entries = fs.readdirSync(dirPath, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(dirPath, entry.name);
                    const relativePath = path.relative(extractDir, fullPath).replace(/\\/g, '/');
                    
                    if (entry.isDirectory()) {
                        scanDir(fullPath);
                    } else {
                        if (!shouldFilterSystemFile(relativePath)) {
                            files.push(relativePath);
                        }
                    }
                }
            }
            scanDir(extractDir);
            
            console.log(`[add-folder] ${folderPath}, 共 ${files.length} 个文件`);
            return { success: true, fileList: files };
        } catch (e) { 
            console.error('[add-folder] Error:', e.message);
            return { success: false, error: e.message }; 
        }
    });
    
    // 重命名文件
    ipcMain.handle('rename-file', async (event, folder, oldPath, newPath) => {
        try {
            const extractDir = getExtractDir(folder);
            if (!extractDir) {
                return { success: false, error: '项目未打开' };
            }
            
            const oldLocalPath = zipPathToLocal(extractDir, oldPath);
            const newLocalPath = zipPathToLocal(extractDir, newPath);
            
            if (!fs.existsSync(oldLocalPath)) {
                return { success: false, error: '文件不存在' };
            }
            if (fs.existsSync(newLocalPath)) {
                return { success: false, error: '目标文件已存在' };
            }
            
            fs.renameSync(oldLocalPath, newLocalPath);
            markProjectDirty(folder);
            
            // 返回更新后的文件列表
            const files = [];
            function scanDir(dirPath) {
                const entries = fs.readdirSync(dirPath, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(dirPath, entry.name);
                    const relativePath = path.relative(extractDir, fullPath).replace(/\\/g, '/');
                    
                    if (entry.isDirectory()) {
                        scanDir(fullPath);
                    } else {
                        if (!shouldFilterSystemFile(relativePath)) {
                            files.push(relativePath);
                        }
                    }
                }
            }
            scanDir(extractDir);
            
            console.log(`[rename-file] ${oldPath} → ${newPath}, 共 ${files.length} 个文件`);
            return { success: true, fileList: files };
        } catch (e) { 
            console.error('[rename-file] Error:', e.message);
            return { success: false, error: e.message }; 
        }
    });
    
    // 重命名文件夹
    ipcMain.handle('rename-folder', async (event, folder, oldFolder, newFolder) => {
        try {
            const extractDir = getExtractDir(folder);
            if (!extractDir) {
                return { success: false, error: '项目未打开' };
            }
            
            const oldLocalPath = zipPathToLocal(extractDir, oldFolder);
            const newLocalPath = zipPathToLocal(extractDir, newFolder);
            
            if (!fs.existsSync(oldLocalPath)) {
                return { success: false, error: '文件夹不存在' };
            }
            if (fs.existsSync(newLocalPath)) {
                return { success: false, error: '目标已存在' };
            }
            
            fs.renameSync(oldLocalPath, newLocalPath);
            markProjectDirty(folder);
            
            // 返回更新后的文件列表
            const files = [];
            function scanDir(dirPath) {
                const entries = fs.readdirSync(dirPath, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(dirPath, entry.name);
                    const relativePath = path.relative(extractDir, fullPath).replace(/\\/g, '/');
                    
                    if (entry.isDirectory()) {
                        scanDir(fullPath);
                    } else {
                        if (!shouldFilterSystemFile(relativePath)) {
                            files.push(relativePath);
                        }
                    }
                }
            }
            scanDir(extractDir);
            
            console.log(`[rename-folder] ${oldFolder} → ${newFolder}, 共 ${files.length} 个文件`);
            return { success: true, fileList: files };
        } catch (e) { 
            console.error('[rename-folder] Error:', e.message);
            return { success: false, error: e.message }; 
        }
    });
    
    // 删除文件
    ipcMain.handle('delete-file', async (event, folder, filePath) => {
        try {
            const extractDir = getExtractDir(folder);
            if (!extractDir) {
                return { success: false, error: '项目未打开' };
            }
            
            const localPath = zipPathToLocal(extractDir, filePath);
            if (!fs.existsSync(localPath)) {
                return { success: false, error: '文件不存在' };
            }
            
            fs.unlinkSync(localPath);
            markProjectDirty(folder);
            
            // 返回更新后的文件列表
            const files = [];
            function scanDir(dir) {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);
                    const relativePath = path.relative(extractDir, fullPath).replace(/\\/g, '/');
                    
                    if (entry.isDirectory()) {
                        scanDir(fullPath);
                    } else {
                        if (!shouldFilterSystemFile(relativePath)) {
                            files.push(relativePath);
                        }
                    }
                }
            }
            scanDir(extractDir);
            
            console.log(`[delete-file] 已删除: ${filePath}, 剩余 ${files.length} 个文件`);
            return { success: true, fileList: files };
        } catch (e) { 
            console.error('[delete-file] Error:', e.message);
            return { success: false, error: e.message }; 
        }
    });
    
    // 删除文件夹
    ipcMain.handle('delete-folder', async (event, folder, folderPath) => {
        try {
            const extractDir = getExtractDir(folder);
            if (!extractDir) {
                return { success: false, error: '项目未打开' };
            }
            
            const localPath = zipPathToLocal(extractDir, folderPath);
            if (!fs.existsSync(localPath)) {
                return { success: false, error: '文件夹不存在' };
            }
            
            fs.rmSync(localPath, { recursive: true, force: true });
            markProjectDirty(folder);
            
            // 返回更新后的文件列表
            const files = [];
            function scanDir(dir) {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);
                    const relativePath = path.relative(extractDir, fullPath).replace(/\\/g, '/');
                    
                    if (entry.isDirectory()) {
                        scanDir(fullPath);
                    } else {
                        if (!shouldFilterSystemFile(relativePath)) {
                            files.push(relativePath);
                        }
                    }
                }
            }
            scanDir(extractDir);
            
            console.log(`[delete-folder] 已删除: ${folderPath}, 剩余 ${files.length} 个文件`);
            return { success: true, fileList: files };
        } catch (e) { 
            console.error('[delete-folder] Error:', e.message);
            return { success: false, error: e.message }; 
        }
    });
    
    // 读取图片文件
    ipcMain.handle('read-image-file', async (event, folder, filename) => {
        try {
            let extractDir = getExtractDir(folder);
            if (!extractDir) {
                console.warn(`[read-image-file] 未找到解包目录，尝试重新解压: ${folder}`);
                await extractProject(folder);
                extractDir = getExtractDir(folder);
                if (!extractDir) {
                    return { success: false, error: '项目未打开' };
                }
            }
            
            const localPath = zipPathToLocal(extractDir, filename);
            if (!fs.existsSync(localPath)) {
                return { success: false, error: '文件不存在' };
            }
            
            const stat = fs.statSync(localPath);
            
            // 从文件名提取实际扩展名（去除存储前缀）
            let baseName = path.basename(filename);
            if (baseName.startsWith('__img_')) baseName = baseName.slice(6);
            else if (baseName.startsWith('__media_')) baseName = baseName.slice(8);
            const ext = path.extname(baseName).toLowerCase();
            
            // 确定正确的 MIME 类型
            let mimeType = 'image/png';
            if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
            else if (ext === '.gif') mimeType = 'image/gif';
            else if (ext === '.webp') mimeType = 'image/webp';
            else if (ext === '.svg') mimeType = 'image/svg+xml';
            else if (ext === '.bmp') mimeType = 'image/bmp';
            else if (ext === '.ico') mimeType = 'image/x-icon';
            else if (ext === '.tiff' || ext === '.tif') mimeType = 'image/tiff';
            
            // 读取文件并转换为 base64（最稳定的方案）
            const base64 = fs.readFileSync(localPath).toString('base64');
            const dataUrl = `data:${mimeType};base64,${base64}`;
            
            console.log(`[read-image-file] ${filename}, size=${stat.size}, base64Len=${base64.length}`);
            
            return { 
                success: true, 
                filePath: localPath,
                dataUrl: dataUrl,
                mimeType: mimeType,
                size: stat.size
            };
        } catch (e) { 
            console.error('[read-image-file] Error:', e.message);
            return { success: false, error: e.message }; 
        }
    });
    
    // 清理临时图片文件（现在不需要，因为直接使用解包目录）
    ipcMain.handle('cleanup-image-temp', async (event, filePaths) => {
        return { success: true }; // 空操作
    });
    
    // 保存媒体文件
    ipcMain.handle('save-media-file', async (event, folder, filename, dataUrl, mimeType) => {
        try {
            const extractDir = getExtractDir(folder);
            if (!extractDir) {
                console.error('[save-media-file] 项目未打开, folder:', folder);
                return { success: false, error: '项目未打开' };
            }
            
            // dataUrl 是 "data:mimeType;base64,..." 格式
            let base64Data = dataUrl;
            if (dataUrl.startsWith('data:')) {
                const commaIdx = dataUrl.indexOf(',');
                base64Data = dataUrl.slice(commaIdx + 1);
            }
            
            const buffer = Buffer.from(base64Data, 'base64');
            const storedName = filename.startsWith('__media_') ? filename : `__media_${filename}`;
            const localPath = zipPathToLocal(extractDir, storedName);
            
            console.log(`[save-media-file] 保存: ${filename} -> ${localPath}, bufferSize=${buffer.length} bytes (${(buffer.length/1024/1024).toFixed(2)} MB), extractDir=${extractDir}`);
            
            // 确保目录存在
            const dir = path.dirname(localPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            
            fs.writeFileSync(localPath, buffer);
            
            // 验证写入是否成功
            const verifyStat = fs.statSync(localPath);
            console.log(`[save-media-file] 写入完成, 验证大小: ${verifyStat.size} bytes, 匹配: ${verifyStat.size === buffer.length}`);
            
            markProjectDirty(folder);
            
            return { success: true, size: buffer.length };
        } catch (e) {
            console.error('[save-media-file] Error:', e.message);
            return { success: false, error: e.message };
        }
    });
    
    // 读取媒体文件
    ipcMain.handle('read-media-file', async (event, folder, filename) => {
        try {
            let extractDir = getExtractDir(folder);
            if (!extractDir) {
                console.warn(`[read-media-file] 未找到解包目录，尝试重新解压: folder=${folder}`);
                await extractProject(folder);
                extractDir = getExtractDir(folder);
                if (!extractDir) {
                    return { success: false, error: '项目未打开' };
                }
            }
            
            // 诊断日志
            const localPath = zipPathToLocal(extractDir, filename);
            const exists = fs.existsSync(localPath);
            console.log(`[read-media-file] folder="${folder}", extractDir="${extractDir}", filename="${filename}", localPath="${localPath}", exists=${exists}`);
            
            if (!exists) {
                // 列出目录中所有文件以辅助诊断
                try {
                    const dirFiles = fs.readdirSync(extractDir);
                    console.error(`[read-media-file] 目录内容 (${dirFiles.length} 个文件):`, dirFiles);
                } catch (dirErr) {
                    console.error(`[read-media-file] 无法读取目录: ${dirErr.message}`);
                }
                return { success: false, error: '文件不存在' };
            }
            
            const stat = fs.statSync(localPath);
            
            // 从文件名提取实际扩展名（去除存储前缀）
            let baseName = path.basename(filename);
            if (baseName.startsWith('__media_')) baseName = baseName.slice(8);
            else if (baseName.startsWith('__img_')) baseName = baseName.slice(6);
            const ext = path.extname(baseName).toLowerCase();
            
            // 确定正确的 MIME 类型
            let mimeType = 'video/mp4';
            if (['.png','.jpg','.jpeg','.gif','.bmp','.webp','.ico','.tiff','.tif'].includes(ext)) {
                // 图片格式
                const mimeMap = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.bmp': 'image/bmp', '.webp': 'image/webp', '.ico': 'image/x-icon', '.tiff': 'image/tiff', '.tif': 'image/tiff' };
                mimeType = mimeMap[ext] || 'image/png';
            } else if (ext === '.mp3') mimeType = 'audio/mpeg';
            else if (ext === '.wav') mimeType = 'audio/wav';
            else if (ext === '.ogg') mimeType = 'audio/ogg';
            else if (ext === '.flac') mimeType = 'audio/flac';
            else if (ext === '.aac') mimeType = 'audio/aac';
            else if (ext === '.m4') mimeType = 'audio/mp4';
            else if (ext === '.mp4') mimeType = 'video/mp4';
            else if (ext === '.webm') mimeType = 'video/webm';
            else if (ext === '.mov') mimeType = 'video/quicktime';
            else if (ext === '.avi') mimeType = 'video/x-msvideo';
            
            // 对于小媒体文件（< 50MB），使用 base64 data URL
            if (stat.size <= 50 * 1024 * 1024) {
                const buffer = fs.readFileSync(localPath);
                const dataUrl = `data:${mimeType};base64,${buffer.toString('base64')}`;
                console.log(`[read-media-file] ${filename}, size=${stat.size}, 返回 data URL`);
                return { 
                    success: true, 
                    filePath: localPath,
                    dataUrl: dataUrl,
                    useFilePath: false,
                    mimeType: mimeType,
                    size: stat.size
                };
            } else if (stat.size <= 300 * 1024 * 1024) {
                // 对于大媒体文件（50MB-300MB），使用 we-file:// URL（自定义协议，避免 IPC 传输大数据）
                const fileUrl = registerTempFile(localPath, mimeType);
                console.log(`[read-media-file] ${filename}, size=${stat.size}, 使用 we-file URL`);
                return { 
                    success: true, 
                    filePath: localPath,
                    fileUrl: fileUrl,
                    useFilePath: true,
                    mimeType: mimeType,
                    size: stat.size
                };
            } else {
                // 对于超大文件（>300MB），返回错误提示
                console.warn(`[read-media-file] ${filename}, size=${stat.size}, 文件过大`);
                return { 
                    success: false, 
                    error: `媒体文件过大 (${(stat.size / 1024 / 1024).toFixed(1)}MB)，暂时无法加载` 
                };
            }
        } catch (e) {
            console.error('[read-media-file] Error:', e.message);
            return { success: false, error: e.message };
        }
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
            const extractDir = getExtractDir(folder);
            if (!extractDir) {
                return { success: false, error: '项目未打开' };
            }
            
            // 确定存储路径（使用 __img_ 前缀）
            const storedName = `__img_${imageName}`;
            const localPath = zipPathToLocal(extractDir, storedName);
            
            // 确保目录存在
            const dir = path.dirname(localPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            
            // imageData 是 base64 字符串（不含 data: 前缀）
            const buffer = Buffer.from(imageData, 'base64');
            fs.writeFileSync(localPath, buffer);
            markProjectDirty(folder);
            
            console.log(`[store-image] ${imageName} → ${storedName}, size=${buffer.length}`);
            return { success: true };
        } catch (e) { 
            console.error('[store-image] Error:', e.message);
            return { success: false, error: e.message }; 
        }
    });

    ipcMain.handle('delete-image', async (event, folder, imageName) => {
        try {
            const extractDir = getExtractDir(folder);
            if (!extractDir) {
                return { success: false, error: '项目未打开' };
            }
            
            // 确定存储路径（使用 __img_ 前缀）
            const storedName = `__img_${imageName}`;
            const localPath = zipPathToLocal(extractDir, storedName);
            
            if (!fs.existsSync(localPath)) {
                return { success: false, error: '文件不存在' };
            }
            
            fs.unlinkSync(localPath);
            markProjectDirty(folder);
            
            console.log(`[delete-image] 已删除: ${storedName}`);
            return { success: true };
        } catch (e) { 
            console.error('[delete-image] Error:', e.message);
            return { success: false, error: e.message }; 
        }
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

// 禁用 GPU cache 以避免 Windows 下的权限错误（cache_util_win.cc 错误）
app.commandLine.appendSwitch('disable-gpu-cache');
// 禁用 Autofill DevTools 协议（避免控制台错误）
app.commandLine.appendSwitch('disable-features', 'AutofillServerCommunication');

app.whenReady().then(() => {
    // 注册自定义文件协议（必须在 app.whenReady 后立即注册）
    registerFileProtocol();
    
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



// ========== 日志管理 IPC（设置页用） ==========
ipcMain.handle('get-log-content', (event, maxLines = 500) => {
    try {
        if (typeof _flushLogBuffer === 'function') _flushLogBuffer();
        if (!fs.existsSync(RENDERER_LOG_PATH)) return { success: true, content: '' };
        let content = fs.readFileSync(RENDERER_LOG_PATH, 'utf8');
        if (maxLines && maxLines > 0) {
            const lines = content.split('\n');
            if (lines.length > maxLines) content = lines.slice(-maxLines).join('\n');
        }
        return { success: true, content };
    } catch (e) { return { success: false, content: '', error: e.message }; }
});

ipcMain.handle('get-log-files', () => {
    try {
        if (!fs.existsSync(RENDERER_LOG_DIR)) return { success: true, files: [] };
        const files = fs.readdirSync(RENDERER_LOG_DIR)
            .filter(f => /^renderer-.*\.log$/.test(f))
            .map(name => {
                const stat = fs.statSync(path.join(RENDERER_LOG_DIR, name));
                return { name, size: stat.size, mtime: stat.mtime.toISOString() };
            })
            .sort((a, b) => (b.mtime || '').localeCompare(a.mtime || ''));
        return { success: true, files };
    } catch (e) { return { success: false, files: [], error: e.message }; }
});

ipcMain.handle('read-log-file', (event, filePath, maxLines = 500) => {
    try {
        const fullPath = path.resolve(filePath);
        if (!fullPath.startsWith(path.resolve(RENDERER_LOG_DIR))) return { success: false, error: '路径越权' };
        if (!fs.existsSync(fullPath)) return { success: false, error: '文件不存在' };
        let content = fs.readFileSync(fullPath, 'utf8');
        if (maxLines && maxLines > 0) {
            const lines = content.split('\n');
            if (lines.length > maxLines) content = lines.slice(-maxLines).join('\n');
        }
        return { success: true, content };
    } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('clear-logs', () => {
    try {
        if (!fs.existsSync(RENDERER_LOG_DIR)) return { success: true };
        const files = fs.readdirSync(RENDERER_LOG_DIR).filter(f => /^renderer-.*\.log$/.test(f));
        for (const file of files) {
            const fullPath = path.join(RENDERER_LOG_DIR, file);
            if (fullPath !== RENDERER_LOG_PATH) { try { fs.unlinkSync(fullPath); } catch (e) {} }
        }
        if (typeof _logBuffer !== 'undefined') _logBuffer = [];
        return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('export-logs', async (event, options = {}) => {
    try {
        if (typeof _flushLogBuffer === 'function') _flushLogBuffer();
        if (!fs.existsSync(RENDERER_LOG_PATH)) return { success: false, error: '日志文件不存在' };
        const content = fs.readFileSync(RENDERER_LOG_PATH, 'utf8');
        if (options.format === 'content') return { success: true, content };
        const defaultName = "we-log-" + new Date().toISOString().replace(/[:.]/g, '-') + '.txt';
        const result = await dialog.showSaveDialog({
            defaultPath: defaultName,
            filters: [{ name: '日志文件', extensions: ['txt', 'log'] }]
        });
        if (result.canceled || !result.filePath) return { success: false, canceled: true };
        fs.writeFileSync(result.filePath, content, 'utf8');
        return { success: true, filePath: result.filePath };
    } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('get-log-stats', () => {
    try {
        if (!fs.existsSync(RENDERER_LOG_DIR)) {
            return { success: true, fileCount: 0, totalSize: 0, totalSizeFormatted: '0 B', currentLogSize: 0 };
        }
        const files = fs.readdirSync(RENDERER_LOG_DIR).filter(f => /^renderer-.*\.log$/.test(f));
        let totalSize = 0, currentSize = 0;
        for (const file of files) {
            const stat = fs.statSync(path.join(RENDERER_LOG_DIR, file));
            totalSize += stat.size;
            if (path.join(RENDERER_LOG_DIR, file) === RENDERER_LOG_PATH) currentSize = stat.size;
        }
        return {
            success: true, fileCount: files.length, totalSize,
            totalSizeFormatted: _formatSize(totalSize), currentLogSize: currentSize
        };
    } catch (e) { return { success: false, error: e.message }; }
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

