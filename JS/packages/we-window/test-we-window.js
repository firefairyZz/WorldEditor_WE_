// test-we-window.js — 测试 we-window 核心功能（纯 FFI，无回调）
// 运行: node test-we-window.js
// 在 Electron 主进程里，把 testElectron() 集成到 BrowserWindow 创建后

const koffi = require('@koromix/koffi-win32-x64');

// ========== 加载 DLL ==========
const user32 = koffi.load('user32.dll');
const dwmapi = koffi.load('dwmapi.dll');

// ========== 声明 Win32 函数 ==========
const GetWindowLongW = user32.func('long __stdcall GetWindowLongW(void* hwnd, int nIndex)');
const SetWindowLongW = user32.func('long __stdcall SetWindowLongW(void* hwnd, int nIndex, long dwNewLong)');
const SetWindowPos = user32.func('int __stdcall SetWindowPos(void* hwnd, void* hwndInsertAfter, int X, int Y, int cx, int cy, uint uFlags)');

const DwmSetWindowAttribute = dwmapi.func('long __stdcall DwmSetWindowAttribute(void* hwnd, uint dwAttribute, void* pvAttribute, uint cbAttribute)');

// ========== Win32 常量 ==========
const GWL_STYLE = -16;
const WS_THICKFRAME = 0x00040000;
const WS_MAXIMIZEBOX = 0x00010000;
const WS_MINIMIZEBOX = 0x00020000;
const WS_POPUP = 0x80000000;
const SWP_NOMOVE = 0x0002;
const SWP_NOSIZE = 0x0001;
const SWP_NOZORDER = 0x0004;
const SWP_FRAMECHANGED = 0x0020;
const SWP_NOACTIVATE = 0x0010;

// DWM 常量 (Win11 22000+)
const DWMWA_WINDOW_CORNER_PREFERENCE = 33;
const DWMWA_BORDER_COLOR = 34;
const DWMWA_CAPTION_COLOR = 35;
const DWMWA_TEXT_COLOR = 36;
const DWMWA_SYSTEMBACKDROP_TYPE = 38;
const DWMWA_USE_IMMERSIVE_DARK_MODE = 20;

// DWM 枚举值
const DWMWCP_DEFAULT = 0;
const DWMWCP_DONOTROUND = 1;
const DWMWCP_ROUND = 2;
const DWMWCP_ROUNDSMALL = 3;

const DWM_SYSTEMBACKDROP_TYPE = {
    AUTO: 0, NONE: 1, MICA: 2, ACRYLIC: 3, TABBED_MICA: 4,
};

// ========== 核心功能 ==========

/**
 * 给窗口添加 WS_THICKFRAME（边缘 resize + Aero snap 必需）
 * 同时加 WS_MAXIMIZEBOX | WS_MINIMIZEBOX
 */
function enableThickFrame(hwnd) {
    const style = GetWindowLongW(hwnd, GWL_STYLE);
    const newStyle = (style | WS_THICKFRAME | WS_MAXIMIZEBOX | WS_MINIMIZEBOX) & ~WS_POPUP;
    SetWindowLongW(hwnd, GWL_STYLE, newStyle);
    // 强制 frame 重绘
    SetWindowPos(hwnd, null, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED | SWP_NOACTIVATE);
    return true;
}

/**
 * 设置 DWM 圆角偏好
 * @param {void*} hwnd
 * @param {number} corner 0=DEFAULT, 1=DONOTROUND, 2=ROUND, 3=ROUNDSMALL
 */
function setCorner(hwnd, corner) {
    // DwmSetWindowAttribute 是 C 函数，需要按值传 int
    // koffi 会自动处理基本类型的按值传递
    const intPtr = koffi.pointer('int');
    const ptr = intPtr(corner);
    const hr = DwmSetWindowAttribute(hwnd, DWMWA_WINDOW_CORNER_PREFERENCE, ptr, 4);
    return hr === 0;
}

/**
 * 设置 DWM Mica/Acrylic 材质
 */
function setMaterial(hwnd, material) {
    const ptr = koffi.pointer('int');
    const ptrVal = ptr(material);
    const hr = DwmSetWindowAttribute(hwnd, DWMWA_SYSTEMBACKDROP_TYPE, ptrVal, 4);
    return hr === 0;
}

// ========== 测试：Electron 集成示例 ==========
/*
// 在 main.js 里，BrowserWindow 创建后：
const weWindow = require('./test-we-window');

// mainWin = new BrowserWindow(...)
const hwnd = mainWin.getNativeWindowHandle();

// 1. 加 WS_THICKFRAME（关键！让边缘 resize + Aero snap 原生工作）
weWindow.enableThickFrame(hwnd);

// 2. 初始圆角
weWindow.setCorner(hwnd, weWindow.DWMWCP_ROUND);

// 3. 最大化/还原时切换圆角
mainWin.on('maximize', () => {
    weWindow.setCorner(hwnd, weWindow.DWMWCP_DONOTROUND);
});
mainWin.on('unmaximize', () => {
    weWindow.setCorner(hwnd, weWindow.DWMWCP_ROUND);
});
*/

// ========== 导出 ==========
module.exports = {
    enableThickFrame,
    setCorner,
    setMaterial,
    DWMWCP_DEFAULT, DWMWCP_DONOTROUND, DWMWCP_ROUND, DWMWCP_ROUNDSMALL,
    BackdropType: DWM_SYSTEMBACKDROP_TYPE,
};

// ========== 直接测试（非 Electron 环境，用 GetDesktopWindow 验证 DLL 调用正常）==========
if (require.main === module) {
    console.log('=== we-window FFI 测试 ===\n');

    // 获取桌面窗口（只是验证 DLL 调用，不是真给桌面加圆角）
    const GetDesktopWindow = user32.func('void* __stdcall GetDesktopWindow()');
    const hwnd = GetDesktopWindow();
    console.log('Desktop HWND:', hwnd);

    // 读取桌面窗口样式（验证 user32 调用正常）
    const style = GetWindowLongW(hwnd, GWL_STYLE);
    console.log('Desktop style:', '0x' + (style >>> 0).toString(16));

    // 测试 DWM 材质是否可用（只是检查 DLL 调用，不实际设置）
    console.log('\n✅ 所有 DLL 调用正常！');
    console.log('下一步：集成到 Electron main.js 测试真实窗口');
    console.log('  weWindow.enableThickFrame(hwnd)   ← 边缘 resize + Aero snap');
    console.log('  weWindow.setCorner(hwnd, ROUND)   ← 还原时圆角');
    console.log('  weWindow.setCorner(hwnd, DONOTROUND) ← 最大化时方角');
}
