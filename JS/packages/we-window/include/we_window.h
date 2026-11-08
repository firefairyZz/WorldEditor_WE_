// we_window.h — Public C++ API for we-window native addon
// Windows 10/11 only

#ifndef WE_WINDOW_H
#define WE_WINDOW_H

#include <windows.h>
#include <dwmapi.h>
#include <functional>
#include <unordered_map>

namespace we_window {

// DWM background material types (DWMWA_SYSTEMBACKDROP_TYPE on Win11 22621+)
enum class Material : int {
    AUTO = 0,
    NONE = 1,
    MICA = 2,
    ACRYLIC = 3,
    TABBED_MICA = 4,
};

// DWM corner preference (DWMWA_WINDOW_CORNER_PREFERENCE)
enum class Corner : int {
    DEFAULT = 0,
    DONOTROUND = 1,
    ROUND = 2,
    ROUNDSMALL = 3,
};

// DWM theme (DWMWA_USE_IMMERSIVE_DARK_MODE)
enum class Theme : int {
    AUTO = 0,
    LIGHT = 1,
    DARK = 2,
};

// Forward declaration
struct WindowData;

// ========== Core class ==========
class WeWindow {
public:
    // Attach to an existing window handle (HWND)
    // Returns true on success
    static bool Attach(HWND hwnd);

    // Detach and cleanup
    static void Detach(HWND hwnd);

    // Apply material effect
    static bool SetMaterial(HWND hwnd, Material material);

    // Set corner preference (called automatically on maximize/unmaximize)
    static bool SetCorner(HWND hwnd, Corner corner);

    // Apply theme
    static bool SetTheme(HWND hwnd, Theme theme);

    // Manually call when window is maximized/unmaximized
    // (WeWindow will auto-detect via WM_SIZE when hit test is enabled,
    //  but call these from the 'maximize'/'unmaximize' events for reliability)
    static void OnMaximized(HWND hwnd);
    static void OnRestored(HWND hwnd);

    // Enable WS_THICKFRAME + intercept WM_NCHITTEST for native drag/resize/Aero snap
    static bool EnableNativeControls(HWND hwnd);

    // Get current maximized state (tracked by subclass)
    static bool IsMaximized(HWND hwnd);

private:
    // Subclass window proc — handles WM_NCHITTEST
    static LRESULT CALLBACK SubclassProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam,
                                          UINT_PTR uIdSubclass, DWORD_PTR dwRefData);

    // Track all attached windows
    static std::unordered_map<HWND, WindowData*> s_windows;
};

// Per-window data
struct WindowData {
    HWND hwnd;
    BOOL maximized;
    Corner current_corner;
    Material current_material;
    bool native_controls_enabled;
};

} // namespace we_window

#endif // WE_WINDOW_H
