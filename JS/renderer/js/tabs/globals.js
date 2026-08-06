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

// 编辑器主题颜色预设
const THEME_PRESETS = {
    // === 亮色主题 ===
    'we-light': { name: 'WE Exclusive', colors: {
        '--bg-main': '#E8FBF9', '--bg-sidebar': '#D4F7F3', '--bg-toolbar': '#E8FBF9',
        '--border': '#A5E8DF', '--text': '#0B2A2E', '--text-secondary': '#2F585E',
        '--accent': '#00897B', '--accent-hover': '#00B5A8', '--gap-color': '#B8EEE6',
        '--scrollbar-thumb': 'rgba(0,137,123,0.25)', '--scrollbar-thumb-hover': 'rgba(0,137,123,0.45)'
    }},
    'default-light': { name: '默认亮色', colors: {
        '--bg-main': '#ffffff', '--bg-sidebar': '#f5f5f5', '--bg-toolbar': '#fafafa',
        '--border': '#e0e0e0', '--text': '#1e1e1e', '--text-secondary': '#666666',
        '--accent': '#0078d4', '--accent-hover': '#106ebe', '--gap-color': '#e8e8e8',
        '--scrollbar-thumb': 'rgba(0,0,0,0.2)', '--scrollbar-thumb-hover': 'rgba(0,0,0,0.35)'
    }},
    'github-light': { name: 'GitHub Light', colors: {
        '--bg-main': '#ffffff', '--bg-sidebar': '#f6f8fa', '--bg-toolbar': '#f6f8fa',
        '--border': '#d0d7de', '--text': '#1f2328', '--text-secondary': '#656d76',
        '--accent': '#0969da', '--accent-hover': '#0860c4', '--gap-color': '#eaeef2',
        '--scrollbar-thumb': 'rgba(0,0,0,0.2)', '--scrollbar-thumb-hover': 'rgba(0,0,0,0.35)'
    }},
    'solarized-light': { name: 'Solarized Light', colors: {
        '--bg-main': '#fdf6e3', '--bg-sidebar': '#eee8d5', '--bg-toolbar': '#eee8d5',
        '--border': '#93a1a1', '--text': '#586e75', '--text-secondary': '#657b83',
        '--accent': '#268bd2', '--accent-hover': '#3a9be2', '--gap-color': '#e6e0c9',
        '--scrollbar-thumb': 'rgba(88,110,117,0.3)', '--scrollbar-thumb-hover': 'rgba(88,110,117,0.5)'
    }},
    'nord-light': { name: 'Nord Light', colors: {
        '--bg-main': '#f5f7fa', '--bg-sidebar': '#eceff4', '--bg-toolbar': '#eceff4',
        '--border': '#d8dee9', '--text': '#2e3440', '--text-secondary': '#4c566a',
        '--accent': '#5e81ac', '--accent-hover': '#6e91bc', '--gap-color': '#e5e9f0',
        '--scrollbar-thumb': 'rgba(76,86,106,0.25)', '--scrollbar-thumb-hover': 'rgba(76,86,106,0.45)'
    }},
    // === 暗色主题 ===
    'default-dark': { name: '默认暗色', colors: {
        '--bg-main': '#1e1e1e', '--bg-sidebar': '#252526', '--bg-toolbar': '#252526',
        '--border': '#3c3c3c', '--text': '#cccccc', '--text-secondary': '#999999',
        '--accent': '#0078d4', '--accent-hover': '#1a8ad4', '--gap-color': '#2a2a2a',
        '--scrollbar-thumb': 'rgba(255,255,255,0.2)', '--scrollbar-thumb-hover': 'rgba(255,255,255,0.35)'
    }},
    'dracula': { name: 'Dracula', colors: {
        '--bg-main': '#282a36', '--bg-sidebar': '#21222c', '--bg-toolbar': '#21222c',
        '--border': '#44475a', '--text': '#f8f8f2', '--text-secondary': '#6272a4',
        '--accent': '#bd93f9', '--accent-hover': '#caa9fa', '--gap-color': '#191a21',
        '--scrollbar-thumb': 'rgba(189,147,249,0.3)', '--scrollbar-thumb-hover': 'rgba(189,147,249,0.5)'
    }},
    'monokai': { name: 'Monokai', colors: {
        '--bg-main': '#272822', '--bg-sidebar': '#1e1f1c', '--bg-toolbar': '#1e1f1c',
        '--border': '#3e3d32', '--text': '#f8f8f2', '--text-secondary': '#75715e',
        '--accent': '#a6e22e', '--accent-hover': '#b6f23e', '--gap-color': '#1e1f1c',
        '--scrollbar-thumb': 'rgba(166,226,46,0.3)', '--scrollbar-thumb-hover': 'rgba(166,226,46,0.5)'
    }},
    'solarized-dark': { name: 'Solarized Dark', colors: {
        '--bg-main': '#002b36', '--bg-sidebar': '#073642', '--bg-toolbar': '#073642',
        '--border': '#586e75', '--text': '#93a1a1', '--text-secondary': '#657b83',
        '--accent': '#268bd2', '--accent-hover': '#3a9be2', '--gap-color': '#003540',
        '--scrollbar-thumb': 'rgba(147,161,161,0.3)', '--scrollbar-thumb-hover': 'rgba(147,161,161,0.5)'
    }},
    'nord': { name: 'Nord', colors: {
        '--bg-main': '#2e3440', '--bg-sidebar': '#272c36', '--bg-toolbar': '#272c36',
        '--border': '#3b4252', '--text': '#d8dee9', '--text-secondary': '#81a1c1',
        '--accent': '#88c0d0', '--accent-hover': '#98d0e0', '--gap-color': '#242933',
        '--scrollbar-thumb': 'rgba(216,222,233,0.2)', '--scrollbar-thumb-hover': 'rgba(216,222,233,0.35)'
    }},
    'github-dark': { name: 'GitHub Dark', colors: {
        '--bg-main': '#0d1117', '--bg-sidebar': '#161b22', '--bg-toolbar': '#161b22',
        '--border': '#30363d', '--text': '#c9d1d9', '--text-secondary': '#8b949e',
        '--accent': '#58a6ff', '--accent-hover': '#6cb6ff', '--gap-color': '#010409',
        '--scrollbar-thumb': 'rgba(201,209,217,0.2)', '--scrollbar-thumb-hover': 'rgba(201,209,217,0.35)'
    }},
    'one-dark': { name: 'One Dark', colors: {
        '--bg-main': '#282c34', '--bg-sidebar': '#21252b', '--bg-toolbar': '#21252b',
        '--border': '#3b4048', '--text': '#abb2bf', '--text-secondary': '#5c6370',
        '--accent': '#61afef', '--accent-hover': '#71bfff', '--gap-color': '#1b1d23',
        '--scrollbar-thumb': 'rgba(171,178,191,0.25)', '--scrollbar-thumb-hover': 'rgba(171,178,191,0.4)'
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