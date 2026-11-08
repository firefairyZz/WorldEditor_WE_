// window.cc — Win32 窗口样式实现
// 方案 B：原生 Win32 窗口（transparent:false，DWM 完全接管）
#include "window.h"
#include <dwmapi.h>

#pragma comment(lib, "dwmapi.lib")

namespace we_window {

bool ForceFrameRefresh(HWND hwnd) {
    if (!hwnd) return false;
    return SetWindowPos(
        hwnd, nullptr, 0, 0, 0, 0,
        SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER |
        SWP_FRAMECHANGED | SWP_NOACTIVATE
    ) == TRUE;
}

long GetStyle(HWND hwnd) {
    if (!hwnd) return 0;
    return GetWindowLongW(hwnd, GWL_STYLE);
}

// ╔══════════════════════════════════════════════════════════════════╗
//  ⚠️  方案 B：WS_CAPTION 是必须的！
//
//  之前（transparent:true）：
//    WS_CAPTION + layered window = 💥 黑色背景/渲染崩溃（合成策略冲突）
//
//  现在（transparent:false）：
//    WS_CAPTION + 标准 Win32 窗口 = DWM 完全接管 ✅
//    · -webkit-app-region:drag 的 hit-test 正确返回 HTCAPTION
//    · DWM 原生处理拖动循环 SC_MOVE → Aero Snap 自动生效
//    · Edge resize / Max/Min / ShowWindow 动画 全部 DWM 原生
// ╚══════════════════════════════════════════════════════════════════╝
bool EnableThickFrame(HWND hwnd) {
    if (!hwnd) return false;

    LONG_PTR style = GetWindowLongPtrW(hwnd, GWL_STYLE);
    if (style == 0) return false;

    // 完整功能集：Caption + ThickFrame + Max/Min + 去掉 POPUP
    style |= WS_CAPTION | WS_THICKFRAME | WS_MAXIMIZEBOX | WS_MINIMIZEBOX;
    style &= ~WS_POPUP;

    if (!SetWindowLongPtrW(hwnd, GWL_STYLE, style)) {
        return false;
    }

    return ForceFrameRefresh(hwnd);
}

// ╔══════════════════════════════════════════════════════════════════╗
//  ⚠️  去掉 WS_EX_LAYERED（关键！）
//
//  Electron transparent:true 会自动加 WS_EX_LAYERED 扩展样式
//  DWM 对 layered window 禁用 Aero Snap / 边缘 resize（因为 layered window
//  自己做合成，DWM 不知道怎么贴靠）
//
//  但 Chromium transparent:true 会渲染 alpha 通道，这样 html/body
//  background: transparent 才能让 DWM Mica 透出来
//
//  所以：加 LAYERED 让 Chromium 能渲染透明，然后去掉 LAYERED 让 DWM
//  能接管 Aero Snap + 边缘 resize + 原生拖动
// ╚══════════════════════════════════════════════════════════════════╝
bool RemoveLayeredStyle(HWND hwnd) {
    if (!hwnd) return false;
    LONG_PTR exStyle = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
    if (exStyle == 0) {
        OutputDebugStringW(L"[we-window-native] RemoveLayeredStyle: GetWindowLongPtrW returned 0\n");
        return false;
    }
    
    wchar_t buf[256];
    swprintf_s(buf, L"[we-window-native] RemoveLayeredStyle: exStyle before=0x%llX\n", (unsigned long long)exStyle);
    OutputDebugStringW(buf);
    
    exStyle &= ~WS_EX_LAYERED;
    
    LONG_PTR newStyle = SetWindowLongPtrW(hwnd, GWL_EXSTYLE, exStyle);
    if (newStyle == 0) {
        OutputDebugStringW(L"[we-window-native] RemoveLayeredStyle: SetWindowLongPtrW failed\n");
        return false;
    }
    
    swprintf_s(buf, L"[we-window-native] RemoveLayeredStyle: SetWindowLongPtrW succeeded, new exStyle=0x%llX\n", (unsigned long long)exStyle);
    OutputDebugStringW(buf);
    
    bool refreshOk = ForceFrameRefresh(hwnd);
    swprintf_s(buf, L"[we-window-native] RemoveLayeredStyle: ForceFrameRefresh=%d\n", refreshOk);
    OutputDebugStringW(buf);
    
    return refreshOk;
}

bool RemovePopupStyle(HWND hwnd) {
    if (!hwnd) return false;
    LONG_PTR style = GetWindowLongPtrW(hwnd, GWL_STYLE);
    style &= ~WS_POPUP;
    if (!SetWindowLongPtrW(hwnd, GWL_STYLE, style)) return false;
    return ForceFrameRefresh(hwnd);
}

bool EnableMaxMinBox(HWND hwnd) {
    if (!hwnd) return false;
    LONG_PTR style = GetWindowLongPtrW(hwnd, GWL_STYLE);
    style |= WS_MAXIMIZEBOX | WS_MINIMIZEBOX;
    if (!SetWindowLongPtrW(hwnd, GWL_STYLE, style)) return false;
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
        style |= WS_CAPTION | WS_THICKFRAME;
        style &= ~WS_POPUP;
    }
    if (maxMinBox) {
        style |= WS_MAXIMIZEBOX | WS_MINIMIZEBOX;
    }
    if (!SetWindowLongPtrW(hwnd, GWL_STYLE, style)) return false;
    return ForceFrameRefresh(hwnd);
}

// ╔══════════════════════════════════════════════════════════════════╗
//  ⚠️  方案 B 核心：DwmExtendFrameIntoClientArea
//
//  transparent:false + WS_CAPTION 时，窗口有原生非客户区（NC 区域）
//  调用 DwmExtendFrameIntoClientArea(-1,-1,-1,-1) 让 Chromium 画整个窗口
//  包括原生标题栏位置（Chromium -webkit-app-region:drag 在此生效）
//
//  同时：Chromium 渲染透明背景 → DWM 在背后画 Mica 材质 → 透出来 ✅
// ╚══════════════════════════════════════════════════════════════════╝
bool ExtendFrame(HWND hwnd) {
    if (!hwnd) return false;
    MARGINS margins = { -1, -1, -1, -1 }; // -1 = 扩展到整个窗口
    return DwmExtendFrameIntoClientArea(hwnd, &margins) == S_OK;
}

// ========== 原生窗口状态控制 ==========

bool NativeShow(HWND hwnd, int swCmd) {
    if (!hwnd) return false;
    ShowWindow(hwnd, swCmd);
    return true;
}

bool NativeMaximize(HWND hwnd) {
    if (!hwnd) return false;
    if (IsZoomed(hwnd)) return true;
    return NativeShow(hwnd, SW_MAXIMIZE);
}

bool NativeRestore(HWND hwnd) {
    if (!hwnd) return false;
    if (!IsZoomed(hwnd) && !IsIconic(hwnd)) return true;
    return NativeShow(hwnd, SW_RESTORE);
}

bool NativeMinimize(HWND hwnd) {
    if (!hwnd) return false;
    if (IsIconic(hwnd)) return true;
    return NativeShow(hwnd, SW_MINIMIZE);
}

// ========== 原生拖动循环（备选）==========
// 方案 B 主路径：transparent:false + WS_CAPTION + -webkit-app-region:drag
// → DWM 自动处理拖动循环（无需手动调此函数）
// 保留作为需要强制原生接管时的备选
bool BeginCaptionDrag(HWND hwnd) {
    if (!hwnd) return false;
    SetCapture(hwnd);
    PostMessageW(hwnd, WM_SYSCOMMAND, SC_MOVE, 0);
    return true;
}

} // namespace we_window
