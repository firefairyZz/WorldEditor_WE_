// window.cc — Win32 窗口样式实现
#include "window.h"

namespace we_window {

bool ForceFrameRefresh(HWND hwnd) {
    if (!hwnd) return false;
    // SWP_FRAMECHANGED 强制系统重绘非客户区（边框）
    return SetWindowPos(
        hwnd,
        nullptr,    // HWND_insertAfter
        0, 0, 0, 0, // x, y, cx, cy（0 表示不改变）
        SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER |
        SWP_FRAMECHANGED | SWP_NOACTIVATE
    ) == TRUE;
}

long GetStyle(HWND hwnd) {
    if (!hwnd) return 0;
    return GetWindowLongW(hwnd, GWL_STYLE);
}

bool EnableThickFrame(HWND hwnd) {
    if (!hwnd) return false;

    LONG_PTR style = GetWindowLongPtrW(hwnd, GWL_STYLE);
    if (style == 0) return false;

    // 添加厚边框 + 最大化框 + 最小化框
    // 注意：不能加 WS_CAPTION！transparent:true 下加 WS_CAPTION 会导致：
    //   1. DWM 合成策略冲突 → 黑色背景/渲染崩溃
    //   2. 自定义 -webkit-app-region:drag 和原生 caption 冲突 → 双击/拖动行为异常
    //   WS_THICKFRAME 已经足够提供边缘 resize + Aero Snap（DWM 靠 WM_MOVING 检测贴靠）
    style |= WS_THICKFRAME | WS_MAXIMIZEBOX | WS_MINIMIZEBOX;
    // 移除 WS_POPUP（与 WS_THICKFRAME 冲突）
    style &= ~WS_POPUP;

    if (!SetWindowLongPtrW(hwnd, GWL_STYLE, style)) {
        return false;
    }

    return ForceFrameRefresh(hwnd);
}

bool RemovePopupStyle(HWND hwnd) {
    if (!hwnd) return false;

    LONG_PTR style = GetWindowLongPtrW(hwnd, GWL_STYLE);
    style &= ~WS_POPUP;

    if (!SetWindowLongPtrW(hwnd, GWL_STYLE, style)) {
        return false;
    }

    return ForceFrameRefresh(hwnd);
}

bool EnableMaxMinBox(HWND hwnd) {
    if (!hwnd) return false;

    LONG_PTR style = GetWindowLongPtrW(hwnd, GWL_STYLE);
    style |= WS_MAXIMIZEBOX | WS_MINIMIZEBOX;

    if (!SetWindowLongPtrW(hwnd, GWL_STYLE, style)) {
        return false;
    }

    return ForceFrameRefresh(hwnd);
}

bool IsMaximized(HWND hwnd) {
    if (!hwnd) return false;
    return IsZoomed(hwnd) == TRUE;
}

bool IsMinimized(HWND hwnd) {
    if (!hwnd) return false;
    return IsIconic(hwnd) == TRUE;
}

bool ApplyStyle(HWND hwnd, bool thickFrame, bool maxMinBox) {
    if (!hwnd) return false;

    LONG_PTR style = GetWindowLongPtrW(hwnd, GWL_STYLE);
    if (style == 0) return false;

    if (thickFrame) {
        style |= WS_THICKFRAME;
        style &= ~WS_POPUP;
    }

    if (maxMinBox) {
        style |= WS_MAXIMIZEBOX | WS_MINIMIZEBOX;
    }

    if (!SetWindowLongPtrW(hwnd, GWL_STYLE, style)) {
        return false;
    }

    return ForceFrameRefresh(hwnd);
}

// ========== 原生窗口状态控制 ==========
// 用 ShowWindow 而不是 Chromium setBounds → DWM 动画生效

bool NativeShow(HWND hwnd, int swCmd) {
    if (!hwnd) return false;
    // ShowWindow 返回之前的可见状态（BOOL）
    BOOL prev = ShowWindow(hwnd, swCmd);
    // 如果 ShowWindow 返回 0，说明窗口之前是隐藏的；但这不算失败
    // 只要调用没被系统阻止就算成功
    return true;
}

bool NativeMaximize(HWND hwnd) {
    if (!hwnd) return false;
    // 已经最大化就不重复调（避免闪烁）
    if (IsZoomed(hwnd)) return true;
    return NativeShow(hwnd, SW_MAXIMIZE);
}

bool NativeRestore(HWND hwnd) {
    if (!hwnd) return false;
    // 已经还原状态就不重复调
    if (!IsZoomed(hwnd) && !IsIconic(hwnd)) return true;
    return NativeShow(hwnd, SW_RESTORE);
}

bool NativeMinimize(HWND hwnd) {
    if (!hwnd) return false;
    if (IsIconic(hwnd)) return true;
    return NativeShow(hwnd, SW_MINIMIZE);
}

// ========== 原生拖动循环 ==========
// 关键：不能用 PostMessage(WM_NCLBUTTONDOWN, HTCAPTION) ——
// mica-electron 的 removeCaption 已经移除了 WS_CAPTION，NC 区域不存在
// → 用 WM_SYSCOMMAND + SC_MOVE，直接告诉窗口"开始移动"
//
// 为什么用 PostMessage 而不是 SendMessage:
//   SendMessage 同步阻塞 — 会卡主进程消息循环 → resize/unmaximize 事件排不出去
//   PostMessage 异步进队列 — 主循环继续跑 → resize 事件正常派发 → 渲染端正常 reflow
//   队列里 WM_SYSCOMMAND 排到 Chromium 内部 resize/Layout 完成之后才处理
bool BeginCaptionDrag(HWND hwnd) {
    if (!hwnd) return false;
    // SetCapture 确保后续鼠标消息被这个窗口接住
    SetCapture(hwnd);
    // PostMessage（不阻塞！）— 消息进队列后 JS 继续往下走
    // 系统会在窗口消息循环里处理 WM_SYSCOMMAND, SC_MOVE → 进入 SC_MOVE 内部 GetMessage 循环
    PostMessageW(hwnd, WM_SYSCOMMAND, SC_MOVE, 0);
    return true;
}

} // namespace we_window
