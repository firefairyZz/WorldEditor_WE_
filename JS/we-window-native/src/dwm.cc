// dwm.cc — DWM 实现
#include "dwm.h"
#include <dwmapi.h>
#include <windows.h>

namespace we_window {

// ========== 动态加载 ==========
static HMODULE g_dwmapi = nullptr;
static DwmSetWindowAttribute_t g_pDwmSetWindowAttribute = nullptr;
static DwmExtendFrameIntoClientArea_t g_pDwmExtendFrame = nullptr;
static DwmIsCompositionEnabled_t g_pDwmIsCompositionEnabled = nullptr;
static bool g_initialized = false;

bool DwmInit() {
    if (g_initialized) return true;

    g_dwmapi = LoadLibraryW(L"dwmapi.dll");
    if (!g_dwmapi) {
        return false;
    }

    g_pDwmSetWindowAttribute = (DwmSetWindowAttribute_t)
        GetProcAddress(g_dwmapi, "DwmSetWindowAttribute");
    g_pDwmExtendFrame = (DwmExtendFrameIntoClientArea_t)
        GetProcAddress(g_dwmapi, "DwmExtendFrameIntoClientArea");
    g_pDwmIsCompositionEnabled = (DwmIsCompositionEnabled_t)
        GetProcAddress(g_dwmapi, "DwmIsCompositionEnabled");

    g_initialized = (g_pDwmSetWindowAttribute != nullptr);
    return g_initialized;
}

void DwmShutdown() {
    if (g_dwmapi) {
        FreeLibrary(g_dwmapi);
        g_dwmapi = nullptr;
    }
    g_pDwmSetWindowAttribute = nullptr;
    g_pDwmExtendFrame = nullptr;
    g_pDwmIsCompositionEnabled = nullptr;
    g_initialized = false;
}

// ========== 核心 ==========

bool SetWindowAttr(HWND hwnd, DWORD attr, const void* pValue, DWORD cbValue) {
    if (!g_pDwmSetWindowAttribute) return false;
    HRESULT hr = g_pDwmSetWindowAttribute(hwnd, attr, pValue, cbValue);
    return SUCCEEDED(hr);
}

bool SetCorner(HWND hwnd, int corner) {
    return SetWindowAttr(hwnd, DWMWA_WINDOW_CORNER_PREFERENCE, &corner, sizeof(corner));
}

bool SetMaterial(HWND hwnd, int material) {
    return SetWindowAttr(hwnd, DWMWA_SYSTEMBACKDROP_TYPE, &material, sizeof(material));
}

bool SetBorderColor(HWND hwnd, int color) {
    return SetWindowAttr(hwnd, DWMWA_BORDER_COLOR, &color, sizeof(color));
}

bool SetCaptionColor(HWND hwnd, int color) {
    return SetWindowAttr(hwnd, DWMWA_CAPTION_COLOR, &color, sizeof(color));
}

bool SetTextColor(HWND hwnd, int color) {
    return SetWindowAttr(hwnd, DWMWA_TEXT_COLOR, &color, sizeof(color));
}

bool SetDarkMode(HWND hwnd, bool enable) {
    int val = enable ? 1 : 0;
    return SetWindowAttr(hwnd, DWMWA_USE_IMMERSIVE_DARK_MODE, &val, sizeof(val));
}

// ========== 系统信息 ==========

static DWORD GetWinBuild() {
    DWORD build = 0;
    HMODULE hNtdll = GetModuleHandleW(L"ntdll.dll");
    if (hNtdll) {
        // 用 RtlGetVersion（更可靠）
        typedef NTSTATUS(NTAPI* RtlGetVersion_t)(PRTL_OSVERSIONINFOW);
        RtlGetVersion_t fn = (RtlGetVersion_t)GetProcAddress(hNtdll, "RtlGetVersion");
        if (fn) {
            RTL_OSVERSIONINFOW vi = { sizeof(vi), 0, 0, 0 };
            if (fn(&vi) == 0) {
                build = vi.dwBuildNumber;
            }
        }
    }
    return build;
}

bool IsWin11() {
    return GetWinBuild() >= 22000;
}

bool IsDwmCompositionEnabled() {
    BOOL enabled = TRUE;
    if (g_pDwmIsCompositionEnabled) {
        g_pDwmIsCompositionEnabled(&enabled);
    }
    return enabled == TRUE;
}

} // namespace we_window
