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
let tabCloseConfirm = true;