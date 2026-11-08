// index.js — JS 封装层
// 自动加载 .node 二进制，提供浏览器友好的 API
// 支持三种加载方式：
//   1. 我们自己编译的 we-window-native .node
//   2. 预编译二进制 prebuilds/
//   3. mica-electron 的 .node 作为 fallback（API 适配）

'use strict';

const os = require('os');
const path = require('path');
const fs = require('fs');

// ========== 加载原生模块 ==========
let native = null;      // 我们自己的模块
let micaNative = null;  // mica-electron fallback
let loadError = null;
let useMicaFallback = false;

/**
 * 尝试加载我们自己编译的 we-window-native .node
 */
function tryLoadOwn() {
    // 方式 1：node-gyp-build 编译后
    try {
        // node-gyp-build 在没有安装时会抛异常
        const buildPath = path.join(__dirname, 'build', 'Release', 'we_window.node');
        if (fs.existsSync(buildPath)) {
            native = require(buildPath);
            return true;
        }
    } catch (e) { /* ignore */ }

    // 方式 2：预编译二进制（prebuilds/<platform>-<arch>/we_window.node）
    const platform = process.platform;
    const arch = process.arch;
    const prebuilt = path.join(__dirname, 'prebuilds', `${platform}-${arch}`, 'we_window.node');
    if (fs.existsSync(prebuilt)) {
        try {
            native = require(prebuilt);
            return true;
        } catch (e) {
            loadError = e;
        }
    }

    // 方式 3：Debug 构建
    const debugPath = path.join(__dirname, 'build', 'Debug', 'we_window.node');
    if (fs.existsSync(debugPath)) {
        try {
            native = require(debugPath);
            return true;
        } catch (e) {
            loadError = e;
        }
    }

    return false;
}

/**
 * 尝试加载 mica-electron 的 .node 作为 fallback
 * 位置：node_modules/mica-electron/src/micaElectron_<arch>.node
 */
function tryLoadMicaFallback() {
    const arch = process.arch === 'x64' ? 'x64'
               : process.arch === 'ia32' ? 'ia32'
               : process.arch === 'arm64' ? 'arm64'
               : null;
    if (!arch) return false;

    const searchPaths = [
        // 相对于我们的模块目录
        path.join(__dirname, '..', 'node_modules', 'mica-electron', 'src', `micaElectron_${arch}.node`),
        // 相对于 JS 根目录
        path.join(__dirname, '..', '..', 'node_modules', 'mica-electron', 'src', `micaElectron_${arch}.node`),
    ];

    for (const p of searchPaths) {
        const resolved = path.resolve(p);
        if (fs.existsSync(resolved)) {
            try {
                micaNative = require(resolved);
                return true;
            } catch (e) {
                loadError = e;
            }
        }
    }
    return false;
}

const loaded = tryLoadOwn() || (tryLoadMicaFallback() && (useMicaFallback = true));

if (useMicaFallback) {
    console.log('[we-window-native] ⚠️ Using mica-electron fallback');
} else if (!loaded) {
    console.warn('[we-window-native] ❌ No native module found:', loadError?.message || 'try mica-electron');
}

// ========== 常量 ==========
const CORNER = {
    DEFAULT: 0,
    DONOTROUND: 1,
    ROUND: 2,
    ROUNDSMALL: 3,
};

const MATERIAL = {
    AUTO: 0,
    NONE: 1,
    MICA: 2,
    ACRYLIC: 3,
    TABBED_MICA: 4,
};

// mica-electron 的 PARAMS 枚举（用于 executeDwm 第一个参数）
const MICA_PARAMS = {
    BACKGROUND: 0,      // 材质
    CORNER: 5,          // 圆角
    BORDER_COLOR: 6,
    CAPTION_COLOR: 7,
    TEXT_COLOR: 8,
    FRAME: 9,           // WINDOW_EDIT
};

// mica-electron 的 WINDOW_EDIT 值
const MICA_FRAME_VALUE = {
    ENABLE_MAXIMIZE: 1,    // 启用 WS_SIZEBOX | WS_THICKFRAME | WS_MAXIMIZEBOX
    INTERCEPT_MSG: 2,      // 拦截消息
    DISABLE_CAPTION: 4,    // 移除 WS_CAPTION
};

// ========== 辅助：BrowserWindow → HWND ==========
function getHwnd(win) {
    if (!win) return null;
    let h;
    try {
        h = typeof win.getNativeWindowHandle === 'function'
            ? win.getNativeWindowHandle()
            : win;
    } catch (e) {
        return null;
    }

    if (!h) return null;

    // Electron getNativeWindowHandle() 返回 Buffer
    if (Buffer.isBuffer(h)) {
        if (h.length >= 8) {
            // x64: HWND 实际上只有低 32 位有效（高 32 位是 sign-extend）
            // 用 BigInt 读完再转 Number（HWND 值远 < 2^53，无精度损失）
            const big = h.readBigUInt64LE();
            const num = Number(big);
            if (!Number.isFinite(num)) return null;
            return num;
        }
        return h.readUInt32LE() || null;
    }

    // mica-electron 可能直接返回数字
    if (typeof h === 'number') return h;
    if (typeof h === 'bigint') return Number(h);

    return null;
}

// ========== 核心 API（统一适配层）==========

/**
 * 兼容的 executeDwm：同时支持我们的 native 和 micaNative
 */
function _execDwm(hwnd, params, value) {
    if (native && typeof native.executeDwm === 'function') {
        // 我们自己的模块也可以用统一入口
        return native.executeDwm(hwnd, params, value);
    }
    if (micaNative && typeof micaNative.executeDwm === 'function') {
        // mica-electron 用 int32 HWND（注意：x64 上可能截断！但 mica 内部有自己处理）
        return micaNative.executeDwm(hwnd, params, value);
    }
    return false;
}

function _execUser32(hwnd, params, value) {
    if (micaNative && typeof micaNative.executeUser32 === 'function') {
        return micaNative.executeUser32(hwnd, params, value);
    }
    if (native && typeof native.executeUser32 === 'function') {
        return native.executeUser32(hwnd, params, value);
    }
    return false;
}

/**
 * 初始化（加载 DWM DLL）
 */
function init() {
    if (!loaded) return false;
    if (native && typeof native.init === 'function') {
        try { native.init(); } catch (e) { /* ignore */ }
    }
    return true;
}

/**
 * 启用 WS_THICKFRAME | WS_MAXIMIZEBOX | WS_MINIMIZEBOX
 * 关键！frameless 窗口必须有这个才能原生边缘 resize + Aero Snap
 */
function enableThickFrame(win) {
    if (!loaded) return false;
    const hwnd = getHwnd(win);
    if (!hwnd) return false;

    // 我们自己的模块
    if (native && typeof native.enableThickFrame === 'function') {
        return native.enableThickFrame(hwnd);
    }

    // mica-electron fallback：executeDwm(hwnd, WINDOW_EDIT(9), ENABLE_MAXIMIZE(1))
    if (useMicaFallback) {
        _execDwm(hwnd, MICA_PARAMS.FRAME, MICA_FRAME_VALUE.ENABLE_MAXIMIZE);
        return true; // mica 不返回布尔值
    }

    return false;
}

/**
 * 设置 DWM 圆角
 */
function setCorner(win, corner) {
    if (!loaded) return false;
    const hwnd = getHwnd(win);
    if (!hwnd) return false;

    if (native && typeof native.setCorner === 'function') {
        return native.setCorner(hwnd, corner);
    }
    if (useMicaFallback) {
        _execDwm(hwnd, MICA_PARAMS.CORNER, corner);
        return true;
    }
    return false;
}

/**
 * 设置 DWM 材质（Win11 22523+）
 */
function setMaterial(win, material) {
    if (!loaded) return false;
    const hwnd = getHwnd(win);
    if (!hwnd) return false;

    if (native && typeof native.setMaterial === 'function') {
        return native.setMaterial(hwnd, material);
    }
    if (useMicaFallback) {
        _execDwm(hwnd, MICA_PARAMS.BACKGROUND, material);
        return true;
    }
    return false;
}

/**
 * 设置边框颜色
 */
function setBorderColor(win, color) {
    if (!loaded) return false;
    const hwnd = getHwnd(win);
    if (!hwnd) return false;

    if (native && typeof native.setBorderColor === 'function') {
        return native.setBorderColor(hwnd, color);
    }
    if (useMicaFallback) {
        _execDwm(hwnd, MICA_PARAMS.BORDER_COLOR, color);
        return true;
    }
    return false;
}

/**
 * 设置标题栏颜色
 */
function setCaptionColor(win, color) {
    if (!loaded) return false;
    const hwnd = getHwnd(win);
    if (!hwnd) return false;

    if (native && typeof native.setCaptionColor === 'function') {
        return native.setCaptionColor(hwnd, color);
    }
    if (useMicaFallback) {
        _execDwm(hwnd, MICA_PARAMS.CAPTION_COLOR, color);
        return true;
    }
    return false;
}

/**
 * 设置标题文字颜色
 */
function setTextColor(win, color) {
    if (!loaded) return false;
    const hwnd = getHwnd(win);
    if (!hwnd) return false;

    if (native && typeof native.setTextColor === 'function') {
        return native.setTextColor(hwnd, color);
    }
    if (useMicaFallback) {
        _execDwm(hwnd, MICA_PARAMS.TEXT_COLOR, color);
        return true;
    }
    return false;
}

/**
 * 深色模式（DWMWA_USE_IMMERSIVE_DARK_MODE）
 * 注意：mica-electron 不直接暴露这个，它通过 executeDwm(hwnd, BACKGROUND, theme) 处理
 *       我们自己的模块用独立 API
 */
function setDarkMode(win, enable) {
    if (!loaded) return false;
    const hwnd = getHwnd(win);
    if (!hwnd) return false;

    if (native && typeof native.setDarkMode === 'function') {
        return native.setDarkMode(hwnd, !!enable);
    }
    if (useMicaFallback) {
        // mica-electron 通过 theme 值间接处理：5=AUTO, 1=DARK, 2=LIGHT
        _execDwm(hwnd, MICA_PARAMS.BACKGROUND, enable ? 1 : 2);
        return true;
    }
    return false;
}

/** 是否最大化（我们自己的模块才有；mica fallback 时返回 undefined） */
function isMaximized(win) {
    if (!native) return undefined;
    const hwnd = getHwnd(win);
    if (!hwnd) return undefined;
    if (typeof native.isMaximized === 'function') {
        return native.isMaximized(hwnd);
    }
    return undefined;
}

/** 是否最小化 */
function isMinimized(win) {
    if (!native) return undefined;
    const hwnd = getHwnd(win);
    if (!hwnd) return undefined;
    if (typeof native.isMinimized === 'function') {
        return native.isMinimized(hwnd);
    }
    return undefined;
}

/** 获取窗口样式位（调试用） */
function getStyle(win) {
    if (!native) return 0;
    const hwnd = getHwnd(win);
    if (!hwnd) return 0;
    if (typeof native.getStyle === 'function') {
        return native.getStyle(hwnd);
    }
    return 0;
}

/** 是否 Win11 */
function isWin11() {
    if (native && typeof native.isWin11 === 'function') {
        return !!native.isWin11();
    }
    // mica fallback：也没有 isWin11，我们自己判断
    const release = os.release();
    const parts = release.split('.');
    if (parts.length >= 3) return parseInt(parts[2]) >= 22000;
    return false;
}

/** 获取 Windows build 号 */
function getBuild() {
    if (native && typeof native.getBuild === 'function') {
        return native.getBuild();
    }
    const release = os.release();
    const parts = release.split('.');
    return parts.length >= 3 ? parseInt(parts[2]) : 0;
}

// ========== 高级 API ==========

/**
 * SW_* 常量（ShowWindow 命令）
 */
const SW = {
    HIDE: 0,
    SHOWNORMAL: 1,
    SHOWMINIMIZED: 2,
    SHOWMAXIMIZED: 3,   // SW_MAXIMIZE
    SHOWNOACTIVATE: 4,
    SHOW: 5,
    MINIMIZE: 6,
    SHOWMINNOACTIVE: 7,
    SHOWNA: 8,
    RESTORE: 9,         // SW_RESTORE
    SHOWDEFAULT: 10,
    FORCEMINIMIZE: 11,
};

/**
 * 原生最大化（用 ShowWindow(SW_MAXIMIZE) 带 DWM 动画）
 * 替代 Electron 的 win.maximize()（无动画）
 */
function nativeMaximize(win) {
    if (!native || typeof native.nativeMaximize !== 'function') {
        // fallback：退回 Electron API（无动画）
        if (win && typeof win.maximize === 'function') win.maximize();
        return false;
    }
    const hwnd = getHwnd(win);
    if (!hwnd) return false;
    return native.nativeMaximize(hwnd);
}

/**
 * 原生还原（用 ShowWindow(SW_RESTORE) 带 DWM 动画）
 * 替代 Electron 的 win.unmaximize()（无动画）
 */
function nativeRestore(win) {
    if (!native || typeof native.nativeRestore !== 'function') {
        if (win && typeof win.unmaximize === 'function') win.unmaximize();
        return false;
    }
    const hwnd = getHwnd(win);
    if (!hwnd) return false;
    return native.nativeRestore(hwnd);
}

/**
 * 原生最小化（用 ShowWindow(SW_MINIMIZE) 带 DWM 动画）
 */
function nativeMinimize(win) {
    if (!native || typeof native.nativeMinimize !== 'function') {
        if (win && typeof win.minimize === 'function') win.minimize();
        return false;
    }
    const hwnd = getHwnd(win);
    if (!hwnd) return false;
    return native.nativeMinimize(hwnd);
}

/**
 * 方案 B 核心：DwmExtendFrameIntoClientArea(-1,-1,-1,-1)
 * 让 Chromium 能画到原生标题栏区域 + DWM Mica 能在背后透出
 * transparent:false + WS_CAPTION 时必须调
 */
function extendFrame(win) {
    if (!native || typeof native.extendFrame !== 'function') return false;
    const hwnd = getHwnd(win);
    if (!hwnd) return false;
    return native.extendFrame(hwnd);
}

/**
 * 开始原生标题栏拖动（备选，方案 B 主路径不需要）
 */
function beginCaptionDrag(win) {
    if (!native || typeof native.beginCaptionDrag !== 'function') return false;
    const hwnd = getHwnd(win);
    if (!hwnd) return false;
    return native.beginCaptionDrag(hwnd);
}

/**
 * 一键初始化：添加 WS_THICKFRAME + 初始圆角
 * 监听 maximize/unmaximize 自动切换圆角
 *
 * 用法：
 *   const weWindow = require('./we-window-native');
 *   weWindow.attach(mainWin);
 */
function attach(win, options = {}) {
    const {
        initialCorner = CORNER.ROUND,
        enableThick = true,
        autoCornerSwitch = true,
        material = null,
        darkMode = null,
    } = options;

    if (!loaded) {
        console.warn('[we-window-native] Native module not loaded:', loadError?.message || 'unknown');
        return false;
    }

    // 1. 启用 ThickFrame（边缘 resize + Aero Snap）
    if (enableThick) {
        const ok = enableThickFrame(win);
        console.log('[we-window-native] enableThickFrame:', ok ? '✅' : '❌');
    }

    // 2. 材质（如果指定）
    if (material !== null) {
        setMaterial(win, material);
    }

    // 3. 深色模式
    if (darkMode !== null) {
        setDarkMode(win, darkMode);
    }

    // 4. 初始圆角（延迟等待窗口真正显示）
    // 用 Electron 自带的 win.isMaximized()，不依赖 native
    setTimeout(() => {
        const max = typeof win.isMaximized === 'function' ? win.isMaximized() : false;
        setCorner(win, max ? CORNER.DONOTROUND : initialCorner);
    }, 100);

    // 5. 自动圆角切换（maximize → 无圆角，restore → 有圆角）
    if (autoCornerSwitch) {
        // 先移除可能存在的旧 listener（防止 attach 被调用多次）
        win.removeAllListeners('maximize');
        win.removeAllListeners('unmaximize');

        win.on('maximize', () => {
            setCorner(win, CORNER.DONOTROUND);
        });
        win.on('unmaximize', () => {
            setCorner(win, CORNER.ROUND);
        });
        win.on('enter-full-screen', () => {
            setCorner(win, CORNER.DONOTROUND);
        });
        win.on('leave-full-screen', () => {
            const max = typeof win.isMaximized === 'function' ? win.isMaximized() : false;
            setCorner(win, max ? CORNER.DONOTROUND : CORNER.ROUND);
        });
    }

    return true;
}

/**
 * 检查原生模块是否成功加载
 */
function isLoaded() {
    return loaded;
}

/**
 * 获取加载错误信息（调试用）
 */
function getLoadError() {
    return loadError;
}

// ========== 导出 ==========
module.exports = {
    // 状态
    isLoaded,
    getLoadError,

    // 核心函数
    init,
    attach,
    enableThickFrame,
    setCorner,
    setMaterial,
    setBorderColor,
    setCaptionColor,
    setTextColor,
    setDarkMode,
    isMaximized,
    isMinimized,
    getStyle,
    isWin11,
    getBuild,

    // 原生窗口控制（带 DWM 动画）
    nativeMaximize,
    nativeRestore,
    nativeMinimize,
    nativeShow,

    // 方案 B 核心
    extendFrame,
    beginCaptionDrag,

    // 常量
    CORNER,
    MATERIAL,
    SW,
};
