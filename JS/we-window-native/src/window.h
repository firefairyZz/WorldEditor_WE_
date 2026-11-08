// window.h — Win32 窗口样式操作
// 方案 B：原生 Win32 窗口（transparent:false，DWM 完全接管）
#pragma once

#include "common.h"

namespace we_window {

// ========== 核心：完整原生窗口样式 ==========
// 加 WS_CAPTION + WS_THICKFRAME + WS_MAXIMIZEBOX + WS_MINIMIZEBOX
// 同时移除 WS_POPUP
// 配合 transparent:false 使用，DWM 完全接管：
//   · 边缘 resize ✅  Aero Snap ✅  最大化还原动画 ✅  圆角自动切换 ✅
bool EnableThickFrame(HWND hwnd);

// 去掉 WS_EX_LAYERED 扩展样式
// Electron transparent:true 会加 WS_EX_LAYERED，但这会让 DWM 禁用 Aero Snap/边缘 resize
// 所以需要去掉 LAYERED，让窗口回归标准 Win32 窗口，DWM 完全接管
bool RemoveLayeredStyle(HWND hwnd);

// 移除 WS_POPUP
bool RemovePopupStyle(HWND hwnd);

// 启用最大化/最小化框
bool EnableMaxMinBox(HWND hwnd);

// 是否最大化/最小化
bool IsMaximized(HWND hwnd);
bool IsMinimized(HWND hwnd);

// 强制刷新窗口帧（修改样式后必须调用）
bool ForceFrameRefresh(HWND hwnd);

// 获取当前样式（调试用）
long GetStyle(HWND hwnd);

// 应用样式并刷新（一步到位）
bool ApplyStyle(HWND hwnd, bool thickFrame, bool maxMinBox);

// ========== 核心：让 Chromium 画整个窗口 ==========
// DwmExtendFrameIntoClientArea(-1,-1,-1,-1)
// 让 Chromium 能画到原生标题栏区域 + 让 DWM Mica 能在背后透出
bool ExtendFrame(HWND hwnd);

// ========== 原生窗口状态控制（带 DWM 动画）==========
#define SW_MAXIMIZE_N 3
#define SW_MINIMIZE_N 6
#define SW_RESTORE_N  9

bool NativeMaximize(HWND hwnd);
bool NativeRestore(HWND hwnd);
bool NativeMinimize(HWND hwnd);
bool NativeShow(HWND hwnd, int swCmd);

// ========== 原生拖动循环 ==========
// transparent:false + WS_CAPTION 存在时，Electron 的 -webkit-app-region:drag
// 已经能让 DWM 处理原生拖动循环（SC_MOVE + Aero Snap）
// 这个函数保留作为手动触发原生拖动的备选
bool BeginCaptionDrag(HWND hwnd);

} // namespace we_window
