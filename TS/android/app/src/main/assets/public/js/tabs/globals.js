// 全局状态（所有模块共享）
const tabs = {};
let activeTabId = null;
let quill = null;
let currentQuillProjectId = null;
let pendingQuillSave = null;
let currentTheme = 'dark';
let autoSaveTimer = null;
let savedFontFamily = 'Microsoft YaHei';
let savedFontSize = '16';
let toolbarShow = true;
let wordCountShow = true;
let markdownRender = true;
let smartBracketsEnabled = false;
let tabCloseConfirm = true;

// 锁定桌面端布局（is-desktop 类移除后激活手机端 UI）
// 如果启动时带 --mobile 参数，则默认进入手机模式
// 注意：移动端检测在 main.html 中已完成，这里不再强制添加 is-desktop
(function initLayoutMode() {
    // 检查是否已被 main.html 设置过
    if (document.body && (document.body.classList.contains('is-mobile') || document.body.classList.contains('is-desktop'))) {
        // 已由 main.html 的内联脚本设置，不再覆盖
        return;
    }
    // 兜底：检测移动端
    var isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) 
                  || window.Capacitor !== undefined
                  || window.Ionic !== undefined
                  || (window.innerWidth < 768 && 'ontouchstart' in window);
    
    if (document.body) {
        if (isMobile) {
            document.body.classList.add('is-mobile');
        } else {
            document.body.classList.add('is-desktop');
        }
    } else {
        document.addEventListener('DOMContentLoaded', function() {
            if (isMobile) {
                document.body.classList.add('is-mobile');
            } else {
                document.body.classList.add('is-desktop');
            }
        });
    }
})();
// 检查是否以手机模式启动
(async function checkMobileStartup() {
    try {
        const isMobile = await weAPI.isMobileMode();
        if (isMobile) {
            document.body.classList.remove('is-desktop');
            document.body.classList.add('is-mobile');
            if (typeof checkMobileLayout === 'function') setTimeout(checkMobileLayout, 100);
        }
    } catch (e) {
        // 忽略
    }
})();
// 当 DevTools 打开时自动解锁手机布局（Ctrl+Shift+I 触发）
document.addEventListener('keydown', function(e) {
    if (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.code === 'KeyI')) {
        // 触发 IPC 重启进入手机模式（禁用 mica-electron）
        if (typeof weAPI.enterMobileMode === 'function') {
            weAPI.enterMobileMode();
        } else {
            // 降级：直接切换（无 IPC 时）
            document.body.classList.remove('is-desktop');
            document.body.classList.add('is-mobile');
            if (typeof checkMobileLayout === 'function') setTimeout(checkMobileLayout, 100);
        }
    }
});

// 编辑器主题颜色预设
const THEME_PRESETS = {
    // === 亮色主题 ===
    'we-light': { name: 'WE Exclusive', colors: {
        '--bg-main': '#E8FBF9', '--bg-sidebar': '#D4F7F3', '--bg-toolbar': '#E8FBF9',
        '--border': '#A5E8DF', '--border-solid': '#A5E8DF',
        '--text': '#0B2A2E', '--text-secondary': '#2F585E', '--disabled-text': 'rgba(11,42,46,0.4)',
        '--accent': '#00897B', '--accent-hover': '#00B5A8', '--gap-color': '#B8EEE6',
        '--content-tint': '#D4F7F3', '--overlay-tint': 'transparent', '--title-bar-tint': '#D4F7F3',
        '--scrollbar-thumb': 'rgba(0,137,123,0.25)', '--scrollbar-thumb-hover': 'rgba(0,137,123,0.45)',
        '--hover-bg': 'rgba(0,137,123,0.08)', '--selection-bg': 'rgba(0,137,123,0.25)'
    }},
    'default-light': { name: '默认亮色', colors: {
        '--bg-main': '#ffffff', '--bg-sidebar': '#f5f5f5', '--bg-toolbar': '#fafafa',
        '--border': '#e0e0e0', '--border-solid': '#e0e0e0',
        '--text': '#1e1e1e', '--text-secondary': '#666666', '--disabled-text': 'rgba(30,30,30,0.4)',
        '--accent': '#0078d4', '--accent-hover': '#106ebe', '--gap-color': '#e8e8e8',
        '--content-tint': '#f5f5f5', '--overlay-tint': 'transparent', '--title-bar-tint': '#f5f5f5',
        '--scrollbar-thumb': 'rgba(0,0,0,0.2)', '--scrollbar-thumb-hover': 'rgba(0,0,0,0.35)',
        '--hover-bg': 'rgba(0,120,212,0.08)', '--selection-bg': 'rgba(0,120,212,0.25)'
    }},
    'github-light': { name: 'GitHub Light', colors: {
        '--bg-main': '#ffffff', '--bg-sidebar': '#f6f8fa', '--bg-toolbar': '#f6f8fa',
        '--border': '#d0d7de', '--border-solid': '#d0d7de',
        '--text': '#1f2328', '--text-secondary': '#656d76', '--disabled-text': 'rgba(31,35,40,0.4)',
        '--accent': '#0969da', '--accent-hover': '#0860c4', '--gap-color': '#eaeef2',
        '--content-tint': '#f6f8fa', '--overlay-tint': 'transparent', '--title-bar-tint': '#f6f8fa',
        '--scrollbar-thumb': 'rgba(0,0,0,0.2)', '--scrollbar-thumb-hover': 'rgba(0,0,0,0.35)',
        '--hover-bg': 'rgba(9,105,218,0.08)', '--selection-bg': 'rgba(9,105,218,0.25)'
    }},
    'solarized-light': { name: 'Solarized Light', colors: {
        '--bg-main': '#fdf6e3', '--bg-sidebar': '#eee8d5', '--bg-toolbar': '#eee8d5',
        '--border': '#93a1a1', '--border-solid': '#93a1a1',
        '--text': '#586e75', '--text-secondary': '#657b83', '--disabled-text': 'rgba(88,110,117,0.4)',
        '--accent': '#268bd2', '--accent-hover': '#3a9be2', '--gap-color': '#e6e0c9',
        '--content-tint': '#eee8d5', '--overlay-tint': 'transparent', '--title-bar-tint': '#eee8d5',
        '--scrollbar-thumb': 'rgba(88,110,117,0.3)', '--scrollbar-thumb-hover': 'rgba(88,110,117,0.5)',
        '--hover-bg': 'rgba(38,139,210,0.08)', '--selection-bg': 'rgba(38,139,210,0.25)'
    }},
    'nord-light': { name: 'Nord Light', colors: {
        '--bg-main': '#f5f7fa', '--bg-sidebar': '#eceff4', '--bg-toolbar': '#eceff4',
        '--border': '#d8dee9', '--border-solid': '#d8dee9',
        '--text': '#2e3440', '--text-secondary': '#4c566a', '--disabled-text': 'rgba(46,52,64,0.4)',
        '--accent': '#5e81ac', '--accent-hover': '#6e91bc', '--gap-color': '#e5e9f0',
        '--content-tint': '#eceff4', '--overlay-tint': 'transparent', '--title-bar-tint': '#eceff4',
        '--scrollbar-thumb': 'rgba(76,86,106,0.25)', '--scrollbar-thumb-hover': 'rgba(76,86,106,0.45)',
        '--hover-bg': 'rgba(94,129,172,0.08)', '--selection-bg': 'rgba(94,129,172,0.25)'
    }},
    // === 暗色主题 ===
    'default-dark': { name: '默认暗色', colors: {
        '--bg-main': '#1e1e1e', '--bg-sidebar': '#252526', '--bg-toolbar': '#252526',
        '--border': '#3c3c3c', '--border-solid': '#3c3c3c',
        '--text': '#cccccc', '--text-secondary': '#999999', '--disabled-text': 'rgba(204,204,204,0.4)',
        '--accent': '#0078d4', '--accent-hover': '#1a8ad4', '--gap-color': '#2a2a2a',
        '--content-tint': '#252526', '--overlay-tint': 'transparent', '--title-bar-tint': '#252526',
        '--scrollbar-thumb': 'rgba(255,255,255,0.2)', '--scrollbar-thumb-hover': 'rgba(255,255,255,0.35)',
        '--hover-bg': 'rgba(0,120,212,0.15)', '--selection-bg': 'rgba(0,120,212,0.35)'
    }},
    'dracula': { name: 'Dracula', colors: {
        '--bg-main': '#282a36', '--bg-sidebar': '#21222c', '--bg-toolbar': '#21222c',
        '--border': '#44475a', '--border-solid': '#44475a',
        '--text': '#f8f8f2', '--text-secondary': '#6272a4', '--disabled-text': 'rgba(248,248,242,0.4)',
        '--accent': '#bd93f9', '--accent-hover': '#caa9fa', '--gap-color': '#191a21',
        '--content-tint': '#21222c', '--overlay-tint': 'transparent', '--title-bar-tint': '#21222c',
        '--scrollbar-thumb': 'rgba(189,147,249,0.3)', '--scrollbar-thumb-hover': 'rgba(189,147,249,0.5)',
        '--hover-bg': 'rgba(189,147,249,0.12)', '--selection-bg': 'rgba(189,147,249,0.3)'
    }},
    'monokai': { name: 'Monokai', colors: {
        '--bg-main': '#272822', '--bg-sidebar': '#1e1f1c', '--bg-toolbar': '#1e1f1c',
        '--border': '#3e3d32', '--border-solid': '#3e3d32',
        '--text': '#f8f8f2', '--text-secondary': '#75715e', '--disabled-text': 'rgba(248,248,242,0.4)',
        '--accent': '#a6e22e', '--accent-hover': '#b6f23e', '--gap-color': '#1e1f1c',
        '--content-tint': '#1e1f1c', '--overlay-tint': 'transparent', '--title-bar-tint': '#1e1f1c',
        '--scrollbar-thumb': 'rgba(166,226,46,0.3)', '--scrollbar-thumb-hover': 'rgba(166,226,46,0.5)',
        '--hover-bg': 'rgba(166,226,46,0.12)', '--selection-bg': 'rgba(166,226,46,0.3)'
    }},
    'solarized-dark': { name: 'Solarized Dark', colors: {
        '--bg-main': '#002b36', '--bg-sidebar': '#073642', '--bg-toolbar': '#073642',
        '--border': '#586e75', '--border-solid': '#586e75',
        '--text': '#93a1a1', '--text-secondary': '#657b83', '--disabled-text': 'rgba(147,161,161,0.4)',
        '--accent': '#268bd2', '--accent-hover': '#3a9be2', '--gap-color': '#003540',
        '--content-tint': '#073642', '--overlay-tint': 'transparent', '--title-bar-tint': '#073642',
        '--scrollbar-thumb': 'rgba(147,161,161,0.3)', '--scrollbar-thumb-hover': 'rgba(147,161,161,0.5)',
        '--hover-bg': 'rgba(38,139,210,0.12)', '--selection-bg': 'rgba(38,139,210,0.3)'
    }},
    'nord': { name: 'Nord', colors: {
        '--bg-main': '#2e3440', '--bg-sidebar': '#272c36', '--bg-toolbar': '#272c36',
        '--border': '#3b4252', '--border-solid': '#3b4252',
        '--text': '#d8dee9', '--text-secondary': '#81a1c1', '--disabled-text': 'rgba(216,222,233,0.4)',
        '--accent': '#88c0d0', '--accent-hover': '#98d0e0', '--gap-color': '#242933',
        '--content-tint': '#272c36', '--overlay-tint': 'transparent', '--title-bar-tint': '#272c36',
        '--scrollbar-thumb': 'rgba(216,222,233,0.2)', '--scrollbar-thumb-hover': 'rgba(216,222,233,0.35)',
        '--hover-bg': 'rgba(136,192,208,0.12)', '--selection-bg': 'rgba(136,192,208,0.3)'
    }},
    'github-dark': { name: 'GitHub Dark', colors: {
        '--bg-main': '#0d1117', '--bg-sidebar': '#161b22', '--bg-toolbar': '#161b22',
        '--border': '#30363d', '--border-solid': '#30363d',
        '--text': '#c9d1d9', '--text-secondary': '#8b949e', '--disabled-text': 'rgba(201,209,217,0.4)',
        '--accent': '#58a6ff', '--accent-hover': '#6cb6ff', '--gap-color': '#010409',
        '--content-tint': '#161b22', '--overlay-tint': 'transparent', '--title-bar-tint': '#161b22',
        '--scrollbar-thumb': 'rgba(201,209,217,0.2)', '--scrollbar-thumb-hover': 'rgba(201,209,217,0.35)',
        '--hover-bg': 'rgba(88,166,255,0.12)', '--selection-bg': 'rgba(88,166,255,0.3)'
    }},
    'one-dark': { name: 'One Dark', colors: {
        '--bg-main': '#282c34', '--bg-sidebar': '#21252b', '--bg-toolbar': '#21252b',
        '--border': '#3b4048', '--border-solid': '#3b4048',
        '--text': '#abb2bf', '--text-secondary': '#5c6370', '--disabled-text': 'rgba(171,178,191,0.4)',
        '--accent': '#61afef', '--accent-hover': '#71bfff', '--gap-color': '#1b1d23',
        '--content-tint': '#21252b', '--overlay-tint': 'transparent', '--title-bar-tint': '#21252b',
        '--scrollbar-thumb': 'rgba(171,178,191,0.25)', '--scrollbar-thumb-hover': 'rgba(171,178,191,0.4)',
        '--hover-bg': 'rgba(97,175,239,0.12)', '--selection-bg': 'rgba(97,175,239,0.3)'
    }}
};
let currentColorPreset = 'default-dark';

// globals.js 加载完成日志（logger.js 已在 globals.js 之前加载）
if (typeof weLog !== 'undefined') {
    weLog.info('globals', '全局状态模块已加载', {
        currentTheme: currentTheme,
        currentColorPreset: currentColorPreset,
        toolbarShow: toolbarShow,
        wordCountShow: wordCountShow,
        markdownRender: markdownRender
    });
}