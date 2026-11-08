// we_window.cpp — Window subclassing + WM_NCHITTEST for native drag/resize/Aero snap
//
// Strategy:
//   1. SetWindowLong(GWL_STYLE) with WS_THICKFRAME → Windows adds resize borders
//   2. SetWindowSubclass → intercept WM_NCHITTEST
//   3. WM_NCHITTEST: For areas Chromium missed, return proper HTCAPTION/HTLEFT/etc.
//      For areas with -webkit-app-region: drag, Chromium already returns HTCAPTION,
//      so we pass through. The KEY fix is returning HTCAPTION for the TITLE BAR
//      region during MAXIMIZED state, which lets Windows handle drag-to-restore
//      natively (with proper animation!).
//   4. Track maximized state via WM_SIZE → SIZE_MAXIMIZED / SIZE_RESTORED

#include "we_window.h"
#include <shlwapi.h>
#pragma comment(lib, "shlwapi.lib")

namespace we_window {

// Static member
std::unordered_map<HWND, WindowData*> WeWindow::s_windows;

// Hit test border width (Windows default is 8, we use 6 for frameless feel)
static const int BORDER_WIDTH = 6;

// ========== WM_NCHITTEST handler ==========
//
// When Chromium has -webkit-app-region: drag, it returns HTCAPTION from its
// own WM_NCHITTEST handling, which IS correct for dragging. The problem is:
//
//   a) In MAXIMIZED state, Chromium's drag region doesn't trigger proper
//      native unmaximize animation — it does a fake "just resize" behavior.
//   b) Edge resize might not work if WS_THICKFRAME wasn't properly applied.
//   c) Frameless windows sometimes return HTCLIENT even on title bar areas.
//
// Our subclass wraps Chromium's result and improves specific cases.
LRESULT CALLBACK WeWindow::SubclassProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam,
                                         UINT_PTR uIdSubclass, DWORD_PTR dwRefData) {
    WindowData* data = (WindowData*)dwRefData;

    switch (msg) {
        case WM_NCHITTEST: {
            // Let Chromium process first via DefSubclassProc (which chains to
            // the original proc). Chromium returns HTCAPTION for drag regions.
            LRESULT result = DefSubclassProc(hwnd, msg, wParam, lParam);

            // Chromium already handled it (returns something other than HTCLIENT
            // that looks intentional — like HTCAPTION for drag region, or HTNOWHERE
            // for non-interactive areas).
            // Actually, we need to be smarter: Chromium handles its own layout
            // and returns correct values for most areas. What we need to fix:
            //   - Maximized title bar drag → need HTCLIENT→HTCAPTION override?
            //     No! HTCAPTION IS correct. The issue is Chromium doesn't set
            //     WS_EX_TOOLWINDOW / doesn't have proper NC handling.
            //     Actually for maximized drag-to-restore, Windows handles it
            //     if the hit test returns HTCAPTION and WS_THICKFRAME is set.

            // Let's just pass Chromium's result through for now.
            // The WS_THICKFRAME we added in SetMaterial will enable native
            // edge resize + Aero snap automatically.
            //
            // One fix: if Chromium returns HTCLIENT for a clear title bar area
            // (top 32px of the window), override to HTCAPTION so that
            // double-click → maximize/restore works natively.
            if (result == HTCLIENT && data) {
                POINT pt = { GET_X_LPARAM(lParam), GET_Y_LPARAM(lParam) };
                // Convert to screen coords
                ScreenToClient(hwnd, &pt); // wait, lParam is screen coords!
                // Actually WM_NCHITTEST lParam is screen coordinates (x low, y high)
                pt = { GET_X_LPARAM(lParam), GET_Y_LPARAM(lParam) };
                RECT rc;
                GetWindowRect(hwnd, &rc);
                int localY = pt.y - rc.top;
                int localX = pt.x - rc.left;

                // Title bar area: top 40px (Electron default title bar height)
                // and not over any window controls (right side)
                if (localY >= 0 && localY < 40 && localX < (rc.right - rc.left) - 120) {
                    return HTCAPTION;
                }

                // Window edges for resize (only when NOT maximized)
                if (!data->maximized) {
                    int w = rc.right - rc.left;
                    int h = rc.bottom - rc.top;
                    if (localX < BORDER_WIDTH && localY < BORDER_WIDTH) return HTTOPLEFT;
                    if (localX > w - BORDER_WIDTH && localY < BORDER_WIDTH) return HTTOPRIGHT;
                    if (localX < BORDER_WIDTH && localY > h - BORDER_WIDTH) return HTBOTTOMLEFT;
                    if (localX > w - BORDER_WIDTH && localY > h - BORDER_WIDTH) return HTBOTTOMRIGHT;
                    if (localX < BORDER_WIDTH) return HTLEFT;
                    if (localX > w - BORDER_WIDTH) return HTRIGHT;
                    if (localY < BORDER_WIDTH) return HTTOP;
                    if (localY > h - BORDER_WIDTH) return HTBOTTOM;
                }
            }
            return result;
        }

        case WM_SIZE: {
            // SIZE_MAXIMIZED = 1, SIZE_RESTORED = 0, SIZE_MINIMIZED = 2
            UINT sizeType = wParam;
            if (data) {
                if (sizeType == SIZE_MAXIMIZED) {
                    data->maximized = TRUE;
                    // Auto-switch corner to DONOTROUND when maximized
                    // (DWM should do this automatically, but we force it)
                    SetCorner(hwnd, Corner::DONOTROUND);
                } else if (sizeType == SIZE_RESTORED) {
                    data->maximized = FALSE;
                    SetCorner(hwnd, Corner::ROUND);
                }
            }
            break;
        }

        case WM_NCCALCSIZE: {
            // Tell Windows our window has NO non-client area — all NC is client.
            // This prevents WS_THICKFRAME from adding a visible border.
            if (wParam == TRUE) {
                NCCALCSIZE_PARAMS* params = (NCCALCSIZE_PARAMS*)lParam;
                // params->rgrc[0] contains the proposed window rect
                // Return 0 (WVR_VALIDRECTS) with rgrc[1] = rgrc[0] (no NC adjustment)
                params->rgrc[1] = params->rgrc[0];
                return 0; // WVR_VALIDRECTS
            }
            return 0; // No padding needed
        }

        case WM_DESTROY: {
            // Cleanup
            if (data) {
                RemoveWindowSubclass(hwnd, SubclassProc, 1);
                s_windows.erase(hwnd);
                delete data;
            }
            break;
        }
    }

    return DefSubclassProc(hwnd, msg, wParam, lParam);
}

// ========== Public attach/detach ==========

bool WeWindow::Attach(HWND hwnd) {
    if (!hwnd) return false;

    // Already attached?
    if (s_windows.count(hwnd)) return true;

    WindowData* data = new WindowData();
    data->hwnd = hwnd;
    data->maximized = IsZoomed(hwnd);
    data->current_corner = Corner::ROUND;
    data->current_material = Material::NONE;
    data->native_controls_enabled = false;

    // Subclass
    if (!SetWindowSubclass(hwnd, SubclassProc, 1, (DWORD_PTR)data)) {
        delete data;
        return false;
    }

    // Initial corner
    SetCorner(hwnd, data->maximized ? Corner::DONOTROUND : Corner::ROUND);

    s_windows[hwnd] = data;
    return true;
}

void WeWindow::Detach(HWND hwnd) {
    auto it = s_windows.find(hwnd);
    if (it != s_windows.end()) {
        RemoveWindowSubclass(hwnd, SubclassProc, 1);
        delete it->second;
        s_windows.erase(it);
    }
}

bool WeWindow::EnableNativeControls(HWND hwnd) {
    if (!s_windows.count(hwnd)) return false;
    auto* data = s_windows[hwnd];

    // Add WS_THICKFRAME | WS_MAXIMIZEBOX | WS_MINIMIZEBOX
    LONG style = GetWindowLongW(hwnd, GWL_STYLE);
    style |= WS_THICKFRAME | WS_MAXIMIZEBOX | WS_MINIMIZEBOX;
    style &= ~WS_POPUP;
    SetWindowLongW(hwnd, GWL_STYLE, style);
    SetWindowPos(hwnd, NULL, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED);

    data->native_controls_enabled = true;
    return true;
}

void WeWindow::OnMaximized(HWND hwnd) {
    auto it = s_windows.find(hwnd);
    if (it != s_windows.end()) {
        it->second->maximized = TRUE;
        SetCorner(hwnd, Corner::DONOTROUND);
    }
}

void WeWindow::OnRestored(HWND hwnd) {
    auto it = s_windows.find(hwnd);
    if (it != s_windows.end()) {
        it->second->maximized = FALSE;
        SetCorner(hwnd, Corner::ROUND);
    }
}

bool WeWindow::IsMaximized(HWND hwnd) {
    auto it = s_windows.find(hwnd);
    if (it != s_windows.end()) return it->second->maximized;
    return IsZoomed(hwnd);
}

} // namespace we_window
