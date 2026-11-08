// dwm.cpp — DWM API wrappers: material, corner, theme, border

#include "we_window.h"

namespace we_window {

// DWM function pointers (dynamically loaded from dwmapi.dll)
typedef HRESULT(WINAPI* DwmSetWindowAttribute_t)(HWND, DWORD, LPCVOID, DWORD);
typedef HRESULT(WINAPI* DwmExtendFrameIntoClientArea_t)(HWND, const MARGINS*);

static HMODULE g_dwmapi = nullptr;
static DwmSetWindowAttribute_t g_DwmSetWindowAttribute = nullptr;

static bool EnsureDWM() {
    if (g_DwmSetWindowAttribute) return true;
    g_dwmapi = LoadLibraryW(L"dwmapi.dll");
    if (!g_dwmapi) return false;
    g_DwmSetWindowAttribute = (DwmSetWindowAttribute_t)
        GetProcAddress(g_dwmapi, "DwmSetWindowAttribute");
    return g_DwmSetWindowAttribute != nullptr;
}

// Win11 22621+ DWMWA values
static constexpr DWORD DWMWA_SYSTEMBACKDROP_TYPE    = 38; // Win11 22621
static constexpr DWORD DWMWA_WINDOW_CORNER_PREFERENCE = 33; // Win11 22000
static constexpr DWORD DWMWA_USE_IMMERSIVE_DARK_MODE = 20;
static constexpr DWORD DWMWA_BORDER_COLOR            = 34;
static constexpr DWORD DWMWA_CAPTION_COLOR           = 35;
static constexpr DWORD DWMWA_TEXT_COLOR              = 36;

// Enable WS_THICKFRAME for resize borders + Aero snap + minimize/maximize animation
static void EnableThickFrame(HWND hwnd) {
    // Get current style
    LONG style = GetWindowLongW(hwnd, GWL_STYLE);
    // Add WS_THICKFRAME | WS_MAXIMIZEBOX | WS_MINIMIZEBOX
    style |= WS_THICKFRAME | WS_MAXIMIZEBOX | WS_MINIMIZEBOX;
    // Remove WS_POPUP if present (interferes with resize borders)
    style &= ~WS_POPUP;
    SetWindowLongW(hwnd, GWL_STYLE, style);
    // Force frame refresh
    SetWindowPos(hwnd, NULL, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED);
}

// ========== Public DWM functions ==========

bool WeWindow::SetMaterial(HWND hwnd, Material material) {
    if (!EnsureDWM()) return false;

    // Enable thick frame first (needed for maximize/minimize animation + Aero snap)
    EnableThickFrame(hwnd);

    int backdrop = static_cast<int>(material);
    HRESULT hr = g_DwmSetWindowAttribute(hwnd, DWMWA_SYSTEMBACKDROP_TYPE, &backdrop, sizeof(backdrop));
    if (SUCCEEDED(hr)) {
        // Track current material
        auto it = s_windows.find(hwnd);
        if (it != s_windows.end()) it->second->current_material = material;
        return true;
    }
    return false;
}

bool WeWindow::SetCorner(HWND hwnd, Corner corner) {
    if (!EnsureDWM()) return false;
    int val = static_cast<int>(corner);
    HRESULT hr = g_DwmSetWindowAttribute(hwnd, DWMWA_WINDOW_CORNER_PREFERENCE, &val, sizeof(val));
    if (SUCCEEDED(hr)) {
        auto it = s_windows.find(hwnd);
        if (it != s_windows.end()) it->second->current_corner = corner;
        return true;
    }
    return false;
}

bool WeWindow::SetTheme(HWND hwnd, Theme theme) {
    if (!EnsureDWM()) return false;

    bool dark = false;
    switch (theme) {
        case Theme::DARK: dark = true; break;
        case Theme::LIGHT: dark = false; break;
        case Theme::AUTO: {
            // Check system dark mode via registry
            HKEY hk;
            if (RegOpenKeyExW(HKEY_CURRENT_USER, L"Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize", 0, KEY_READ, &hk) == ERROR_SUCCESS) {
                DWORD val = 1, size = sizeof(val);
                RegQueryValueExW(hk, L"AppsUseLightTheme", NULL, NULL, (LPBYTE)&val, &size);
                RegCloseKey(hk);
                dark = (val == 0); // 0 = dark, 1 = light
            }
            break;
        }
    }
    HRESULT hr = g_DwmSetWindowAttribute(hwnd, DWMWA_USE_IMMERSIVE_DARK_MODE, &dark, sizeof(dark));
    return SUCCEEDED(hr);
}

} // namespace we_window
