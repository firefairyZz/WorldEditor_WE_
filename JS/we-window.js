// we-window.js — 原生窗口控制（FFI 实现，不需要编译）
// 提供：WS_THICKFRAME（边缘 resize/Aero snap）+ DWM 圆角切换
// 运行时依赖：@koromix/koffi（项目已安装）

const koffi = require('@koromix/koffi-win32-x64');

// ========== DLL + 函数声明（惰性加载）==========
let _user32 = null, _dwmapi = null;
let _funcs = null;

function ensureFuncs() {
    if (_funcs) return _funcs;

    _user32 = koffi.load('user32.dll');
    _dwmapi = koffi.load('dwmapi.dll');

    _funcs = {
        GetWindowLongW: _user32.func('long __stdcall GetWindowLongW(void*, int)'),
        SetWindowLongW: _user32.func('long __stdcall SetWindowLongW(void*, int, long)'),
        SetWindowPos: _user32.func('int __stdcall SetWindowPos(void*, void*, int, int, int, int, uint)'),
        DwmSetWindowAttribute: _dwmapi.func('long __stdcall DwmSetWindowAttribute(void*, uint, void*, uint)'),
        IsZoomed: _user32.func('int __stdcall IsZoomed(void*)'),
    };
    return _funcs;
}

// ========== 常量 ==========
const GWL_STYLE = -16;
const WS_THICKFRAME = 0x00040000;
const WS_MAXIMIZEBOX = 0x00010000;
const WS_MINIMIZEBOX = 0x00020000;
const WS_POPUP = 0x80000000;
const SWP_NOMOVE = 0x0002, SWP_NOSIZE = 0x0001, SWP_NOZORDER = 0x0004;
const SWP_FRAMECHANGED = 0x0020, SWP_NOACTIVATE = 0x0010;

const DWMWA_WINDOW_CORNER_PREFERENCE = 33;
const DWMWA_USE_IMMERSIVE_DARK_MODE = 20;
const DWMWA_SYSTEMBACKDROP_TYPE = 38;

const CORNER = { DEFAULT: 0, DONOTROUND: 1, ROUND: 2, ROUNDSMALL: 3 };
const MATERIAL = { AUTO: 0, NONE: 1, MICA: 2, ACRYLIC: 3, TABBED_MICA: 4 };

// ========== 核心 API ==========

/**
 * BrowserWindow → HWND（兼容 Electron 不同版本）
 */
function getHwnd(win) {
    const h = win.getNativeWindowHandle();
    // h 是 Buffer（x64: 8 字节 LE）
    if (Buffer.isBuffer(h)) {
        return koffi.as(h, 'void*');
    }
    // 旧版 Electron 返回带 readInt32LE 的对象
    if (h && typeof h === 'object' && typeof h.readInt32LE === 'function') {
        // 先尝试 readInt64LE (x64)
        if (typeof h.readBigInt64LE === 'function') {
            const big = h.readBigInt64LE();
            return big; // BigInt 可直接传给 koffi
        }
        return h.readInt32LE();
    }
    return h;
}

/**
 * 添加 WS_THICKFRAME | WS_MAXIMIZEBOX | WS_MINIMIZEBOX
 * 关键！frameless 窗口需要 WS_THICKFRAME 才能原生边缘 resize + Aero snap
 */
function enableThickFrame(win) {
    const f = ensureFuncs();
    const hwnd = getHwnd(win);
    const style = f.GetWindowLongW(hwnd, GWL_STYLE);
    const newStyle = (style | WS_THICKFRAME | WS_MAXIMIZEBOX | WS_MINIMIZEBOX) & ~WS_POPUP;
    f.SetWindowLongW(hwnd, GWL_STYLE, newStyle);
    f.SetWindowPos(hwnd, null, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED | SWP_NOACTIVATE);
}

/**
 * 设置 DWM 圆角偏好（最大化时 DONOTROUND，还原时 ROUND）
 */
function setCorner(win, corner) {
    const f = ensureFuncs();
    const hwnd = getHwnd(win);
    const valPtr = koffi.pointer('int');
    const p = valPtr(corner);
    const hr = f.DwmSetWindowAttribute(hwnd, DWMWA_WINDOW_CORNER_PREFERENCE, p, 4);
    return hr === 0;
}

/**
 * 设置 DWM Mica/Acrylic 材质
 */
function setMaterial(win, material) {
    const f = ensureFuncs();
    const hwnd = getHwnd(win);
    const p = koffi.pointer('int')(material);
    const hr = f.DwmSetWindowAttribute(hwnd, DWMWA_SYSTEMBACKDROP_TYPE, p, 4);
    return hr === 0;
}

/**
 * 是否最大化
 */
function isMaximized(win) {
    const f = ensureFuncs();
    return f.IsZoomed(getHwnd(win)) !== 0;
}

/**
 * 一键初始化：给 BrowserWindow 加 WS_THICKFRAME + 初始圆角
 * 监听 maximize/unmaximize 自动切换圆角
 */
function attach(win, options = {}) {
    const {
        initialCorner = CORNER.ROUND,
        enableThick = true,
        autoCornerSwitch = true,
    } = options;

    if (enableThick) {
        enableThickFrame(win);
        console.log('[we-window] WS_THICKFRAME enabled ✅');
    }

    // 初始圆角
    setTimeout(() => {
        if (isMaximized(win)) setCorner(win, CORNER.DONOTROUND);
        else setCorner(win, initialCorner);
    }, 100);

    // 自动圆角切换
    if (autoCornerSwitch) {
        win.on('maximize', () => {
            setCorner(win, CORNER.DONOTROUND);
        });
        win.on('unmaximize', () => {
            setCorner(win, CORNER.ROUND);
        });
        // Aero snap 也触发 maximize 事件，自动处理
    }
}

module.exports = {
    attach,
    enableThickFrame,
    setCorner,
    setMaterial,
    isMaximized,
    getHwnd,
    CORNER,
    MATERIAL,
};
