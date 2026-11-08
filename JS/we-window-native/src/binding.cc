// binding.cc — Node-API (N-API) 入口
// 所有 JS 可调用的函数在这里导出

#pragma warning(disable: 4312) // long → HWND size mismatch on x64
#pragma warning(disable: 4996) // GetVersion deprecated

#include <node_api.h>
#include <windows.h>

#include "dwm.h"
#include "window.h"

using namespace we_window;

// ========== 辅助宏 ==========
// 从 JS 参数中提取 int64 作为 HWND
#define EXTRACT_HWND(env, arg, out_hwnd)                              \
    do {                                                               \
        int64_t _val;                                                  \
        napi_status _s = napi_get_value_int64((env), (arg), &_val);    \
        if (_s != napi_ok) {                                           \
            napi_throw_error((env), nullptr, "HWND must be a number"); \
            return nullptr;                                            \
        }                                                              \
        (out_hwnd) = (HWND)(intptr_t)_val;                             \
    } while (0)

// 创建一个 bool 返回值
#define RETURN_BOOL(env, b)                                             \
    do {                                                                \
        napi_value _result;                                             \
        napi_get_boolean((env), (b), &_result);                         \
        return _result;                                                 \
    } while (0)

// ========== 函数实现 ==========

// init() — 初始化 DWM 库
static napi_value Init(napi_env env, napi_callback_info args) {
    DwmInit();
    RETURN_BOOL(env, true);
}

// enableThickFrame(hwnd)
static napi_value EnableThickFrame(napi_env env, napi_callback_info args) {
    size_t argc = 1;
    napi_value argv[1];
    napi_get_cb_info(env, args, &argc, argv, nullptr, nullptr);

    if (argc < 1) {
        napi_throw_error(env, nullptr, "Missing hwnd argument");
        return nullptr;
    }

    HWND hwnd;
    EXTRACT_HWND(env, argv[0], hwnd);

    DwmInit(); // 确保已初始化
    RETURN_BOOL(env, we_window::EnableThickFrame(hwnd));
}

// removeLayeredStyle(hwnd) — 去掉 WS_EX_LAYERED
static napi_value RemoveLayeredStyle(napi_env env, napi_callback_info args) {
    size_t argc = 1;
    napi_value argv[1];
    napi_get_cb_info(env, args, &argc, argv, nullptr, nullptr);

    if (argc < 1) {
        napi_throw_error(env, nullptr, "Missing hwnd argument");
        return nullptr;
    }

    HWND hwnd;
    EXTRACT_HWND(env, argv[0], hwnd);

    DwmInit();
    RETURN_BOOL(env, we_window::RemoveLayeredStyle(hwnd));
}

// setCorner(hwnd, corner) — corner: 0=DEFAULT, 1=DONOTROUND, 2=ROUND, 3=ROUNDSMALL
static napi_value SetCorner(napi_env env, napi_callback_info args) {
    size_t argc = 2;
    napi_value argv[2];
    napi_get_cb_info(env, args, &argc, argv, nullptr, nullptr);

    if (argc < 2) {
        napi_throw_error(env, nullptr, "Usage: setCorner(hwnd, corner)");
        return nullptr;
    }

    HWND hwnd;
    EXTRACT_HWND(env, argv[0], hwnd);

    int32_t corner;
    napi_get_value_int32(env, argv[1], &corner);

    DwmInit();
    RETURN_BOOL(env, we_window::SetCorner(hwnd, corner));
}

// setMaterial(hwnd, material) — material: 0=AUTO, 1=NONE, 2=MICA, 3=ACRYLIC, 4=TABBED_MICA
static napi_value SetMaterial(napi_env env, napi_callback_info args) {
    size_t argc = 2;
    napi_value argv[2];
    napi_get_cb_info(env, args, &argc, argv, nullptr, nullptr);

    if (argc < 2) {
        napi_throw_error(env, nullptr, "Usage: setMaterial(hwnd, material)");
        return nullptr;
    }

    HWND hwnd;
    EXTRACT_HWND(env, argv[0], hwnd);

    int32_t material;
    napi_get_value_int32(env, argv[1], &material);

    DwmInit();
    RETURN_BOOL(env, we_window::SetMaterial(hwnd, material));
}

// setBorderColor(hwnd, color) — color: 0xAABBGGRR (int)
static napi_value SetBorderColor(napi_env env, napi_callback_info args) {
    size_t argc = 2;
    napi_value argv[2];
    napi_get_cb_info(env, args, &argc, argv, nullptr, nullptr);

    if (argc < 2) {
        napi_throw_error(env, nullptr, "Usage: setBorderColor(hwnd, color)");
        return nullptr;
    }

    HWND hwnd;
    EXTRACT_HWND(env, argv[0], hwnd);

    int32_t color;
    napi_get_value_int32(env, argv[1], &color);

    DwmInit();
    RETURN_BOOL(env, we_window::SetBorderColor(hwnd, color));
}

// setCaptionColor(hwnd, color)
static napi_value SetCaptionColor(napi_env env, napi_callback_info args) {
    size_t argc = 2;
    napi_value argv[2];
    napi_get_cb_info(env, args, &argc, argv, nullptr, nullptr);

    if (argc < 2) {
        napi_throw_error(env, nullptr, "Usage: setCaptionColor(hwnd, color)");
        return nullptr;
    }

    HWND hwnd;
    EXTRACT_HWND(env, argv[0], hwnd);

    int32_t color;
    napi_get_value_int32(env, argv[1], &color);

    DwmInit();
    RETURN_BOOL(env, we_window::SetCaptionColor(hwnd, color));
}

// setTextColor(hwnd, color)
static napi_value SetTextColor(napi_env env, napi_callback_info args) {
    size_t argc = 2;
    napi_value argv[2];
    napi_get_cb_info(env, args, &argc, argv, nullptr, nullptr);

    if (argc < 2) {
        napi_throw_error(env, nullptr, "Usage: setTextColor(hwnd, color)");
        return nullptr;
    }

    HWND hwnd;
    EXTRACT_HWND(env, argv[0], hwnd);

    int32_t color;
    napi_get_value_int32(env, argv[1], &color);

    DwmInit();
    RETURN_BOOL(env, we_window::SetTextColor(hwnd, color));
}

// setDarkMode(hwnd, enable)
static napi_value SetDarkMode(napi_env env, napi_callback_info args) {
    size_t argc = 2;
    napi_value argv[2];
    napi_get_cb_info(env, args, &argc, argv, nullptr, nullptr);

    if (argc < 2) {
        napi_throw_error(env, nullptr, "Usage: setDarkMode(hwnd, enable)");
        return nullptr;
    }

    HWND hwnd;
    EXTRACT_HWND(env, argv[0], hwnd);

    bool enable;
    napi_get_value_bool(env, argv[1], &enable);

    DwmInit();
    RETURN_BOOL(env, we_window::SetDarkMode(hwnd, enable));
}

// isMaximized(hwnd)
static napi_value IsMaximized(napi_env env, napi_callback_info args) {
    size_t argc = 1;
    napi_value argv[1];
    napi_get_cb_info(env, args, &argc, argv, nullptr, nullptr);

    if (argc < 1) {
        napi_throw_error(env, nullptr, "Missing hwnd argument");
        return nullptr;
    }

    HWND hwnd;
    EXTRACT_HWND(env, argv[0], hwnd);
    RETURN_BOOL(env, we_window::IsMaximized(hwnd));
}

// isMinimized(hwnd)
static napi_value IsMinimized(napi_env env, napi_callback_info args) {
    size_t argc = 1;
    napi_value argv[1];
    napi_get_cb_info(env, args, &argc, argv, nullptr, nullptr);

    if (argc < 1) {
        napi_throw_error(env, nullptr, "Missing hwnd argument");
        return nullptr;
    }

    HWND hwnd;
    EXTRACT_HWND(env, argv[0], hwnd);
    RETURN_BOOL(env, we_window::IsMinimized(hwnd));
}

// getStyle(hwnd) — 调试用
static napi_value GetStyle(napi_env env, napi_callback_info args) {
    size_t argc = 1;
    napi_value argv[1];
    napi_get_cb_info(env, args, &argc, argv, nullptr, nullptr);

    if (argc < 1) {
        napi_throw_error(env, nullptr, "Missing hwnd argument");
        return nullptr;
    }

    HWND hwnd;
    EXTRACT_HWND(env, argv[0], hwnd);

    napi_value result;
    napi_create_int64(env, we_window::GetStyle(hwnd), &result);
    return result;
}

// isWin11()
static napi_value IsWin11(napi_env env, napi_callback_info args) {
    RETURN_BOOL(env, we_window::IsWin11());
}

// getBuild()
static napi_value GetBuild(napi_env env, napi_callback_info args) {
    HMODULE hNtdll = GetModuleHandleW(L"ntdll.dll");
    DWORD build = 0;
    if (hNtdll) {
        typedef NTSTATUS(NTAPI* RtlGetVersion_t)(PRTL_OSVERSIONINFOW);
        RtlGetVersion_t fn = (RtlGetVersion_t)GetProcAddress(hNtdll, "RtlGetVersion");
        if (fn) {
            RTL_OSVERSIONINFOW vi = { sizeof(vi), 0, 0, 0 };
            if (fn(&vi) == 0) {
                build = vi.dwBuildNumber;
            }
        }
    }
    napi_value result;
    napi_create_int32(env, (int32_t)build, &result);
    return result;
}

// ========== 原生窗口状态控制（带 DWM 动画）==========

// nativeMaximize(hwnd) — 用 ShowWindow(SW_MAXIMIZE) 带动画
static napi_value NativeMaximize(napi_env env, napi_callback_info args) {
    size_t argc = 1;
    napi_value argv[1];
    napi_get_cb_info(env, args, &argc, argv, nullptr, nullptr);
    HWND hwnd;
    EXTRACT_HWND(env, argv[0], hwnd);
    RETURN_BOOL(env, we_window::NativeMaximize(hwnd));
}

// nativeRestore(hwnd) — 用 ShowWindow(SW_RESTORE) 带动画
static napi_value NativeRestore(napi_env env, napi_callback_info args) {
    size_t argc = 1;
    napi_value argv[1];
    napi_get_cb_info(env, args, &argc, argv, nullptr, nullptr);
    HWND hwnd;
    EXTRACT_HWND(env, argv[0], hwnd);
    RETURN_BOOL(env, we_window::NativeRestore(hwnd));
}

// nativeMinimize(hwnd) — 用 ShowWindow(SW_MINIMIZE) 带动画
static napi_value NativeMinimize(napi_env env, napi_callback_info args) {
    size_t argc = 1;
    napi_value argv[1];
    napi_get_cb_info(env, args, &argc, argv, nullptr, nullptr);
    HWND hwnd;
    EXTRACT_HWND(env, argv[0], hwnd);
    RETURN_BOOL(env, we_window::NativeMinimize(hwnd));
}

// nativeShow(hwnd, swCmd) — 通用 ShowWindow
static napi_value NativeShow(napi_env env, napi_callback_info args) {
    size_t argc = 2;
    napi_value argv[2];
    napi_get_cb_info(env, args, &argc, argv, nullptr, nullptr);

    HWND hwnd;
    EXTRACT_HWND(env, argv[0], hwnd);

    int32_t swCmd;
    napi_get_value_int32(env, argv[1], &swCmd);

    RETURN_BOOL(env, we_window::NativeShow(hwnd, swCmd));
}

// ========== 方案 B 核心：让 Chromium 画整个窗口 ==========
// DwmExtendFrameIntoClientArea(hwnd, {-1,-1,-1,-1})
// transparent:false + WS_CAPTION 时必须调这个，让 Chromium 画到原生标题栏区域
static napi_value ExtendFrame(napi_env env, napi_callback_info args) {
    size_t argc = 1;
    napi_value argv[1];
    napi_get_cb_info(env, args, &argc, argv, nullptr, nullptr);
    if (argc < 1) {
        napi_throw_error(env, nullptr, "Missing hwnd argument");
        return nullptr;
    }
    HWND hwnd;
    EXTRACT_HWND(env, argv[0], hwnd);
    RETURN_BOOL(env, we_window::ExtendFrame(hwnd));
}

// ========== 原生拖动（备选）==========
static napi_value BeginCaptionDrag(napi_env env, napi_callback_info args) {
    size_t argc = 1;
    napi_value argv[1];
    napi_get_cb_info(env, args, &argc, argv, nullptr, nullptr);
    HWND hwnd;
    EXTRACT_HWND(env, argv[0], hwnd);
    RETURN_BOOL(env, we_window::BeginCaptionDrag(hwnd));
}

// ========== 模块初始化 ==========

// 辅助：快速设置导出函数
#define EXPORT_FN(env, exports, name, fn)                    \
    do {                                                     \
        napi_value _fn;                                      \
        napi_create_function((env), nullptr, 0, (fn), nullptr, &_fn); \
        napi_set_named_property((env), (exports), (name), _fn); \
    } while (0)

static napi_value init(napi_env env, napi_value exports) {
    // 导出函数
    EXPORT_FN(env, exports, "init", Init);
    EXPORT_FN(env, exports, "enableThickFrame", EnableThickFrame);
    EXPORT_FN(env, exports, "removeLayeredStyle", RemoveLayeredStyle);
    EXPORT_FN(env, exports, "setCorner", SetCorner);
    EXPORT_FN(env, exports, "setMaterial", SetMaterial);
    EXPORT_FN(env, exports, "setBorderColor", SetBorderColor);
    EXPORT_FN(env, exports, "setCaptionColor", SetCaptionColor);
    EXPORT_FN(env, exports, "setTextColor", SetTextColor);
    EXPORT_FN(env, exports, "setDarkMode", SetDarkMode);
    EXPORT_FN(env, exports, "isMaximized", IsMaximized);
    EXPORT_FN(env, exports, "isMinimized", IsMinimized);
    EXPORT_FN(env, exports, "getStyle", GetStyle);
    EXPORT_FN(env, exports, "isWin11", IsWin11);
    EXPORT_FN(env, exports, "getBuild", GetBuild);

    // 原生窗口状态控制（带 DWM 动画）
    EXPORT_FN(env, exports, "nativeMaximize", NativeMaximize);
    EXPORT_FN(env, exports, "nativeRestore", NativeRestore);
    EXPORT_FN(env, exports, "nativeMinimize", NativeMinimize);
    EXPORT_FN(env, exports, "nativeShow", NativeShow);

    // 方案 B：核心扩展（让 Chromium 画整个窗口）
    EXPORT_FN(env, exports, "extendFrame", ExtendFrame);

    // 原生拖动（备选）
    EXPORT_FN(env, exports, "beginCaptionDrag", BeginCaptionDrag);

    // 导出常量对象
    napi_value corner, material, style;
    napi_create_object(env, &corner);
    napi_create_object(env, &material);
    napi_create_object(env, &style);

    // CORNER 常量
    napi_value v0, v1, v2, v3;
    napi_create_int32(env, DWMWCP_DEFAULT, &v0);       // 0
    napi_create_int32(env, DWMWCP_DONOTROUND, &v1);    // 1
    napi_create_int32(env, DWMWCP_ROUND, &v2);         // 2
    napi_create_int32(env, DWMWCP_ROUNDSMALL, &v3);    // 3
    napi_set_named_property(env, corner, "DEFAULT", v0);
    napi_set_named_property(env, corner, "DONOTROUND", v1);
    napi_set_named_property(env, corner, "ROUND", v2);
    napi_set_named_property(env, corner, "ROUNDSMALL", v3);

    // MATERIAL 常量
    napi_value m0, m1, m2, m3, m4;
    napi_create_int32(env, DWMSBT_AUTO, &m0);
    napi_create_int32(env, DWMSBT_NONE, &m1);
    napi_create_int32(env, DWMSBT_MAINWINDOW, &m2);
    napi_create_int32(env, DWMSBT_TRANSIENTWINDOW, &m3);
    napi_create_int32(env, DWMSBT_TABBEDWINDOW, &m4);
    napi_set_named_property(env, material, "AUTO", m0);
    napi_set_named_property(env, material, "NONE", m1);
    napi_set_named_property(env, material, "MICA", m2);
    napi_set_named_property(env, material, "ACRYLIC", m3);
    napi_set_named_property(env, material, "TABBED_MICA", m4);

    // STYLE 常量（WS_*）
    napi_value sThick, sMax, sMin, sPopup, sCaption;
    napi_create_int32(env, (int32_t)WS_THICKFRAME, &sThick);
    napi_create_int32(env, (int32_t)WS_MAXIMIZEBOX, &sMax);
    napi_create_int32(env, (int32_t)WS_MINIMIZEBOX, &sMin);
    napi_create_int32(env, (int32_t)WS_POPUP, &sPopup);
    napi_create_int32(env, (int32_t)WS_CAPTION, &sCaption);
    napi_set_named_property(env, style, "WS_THICKFRAME", sThick);
    napi_set_named_property(env, style, "WS_MAXIMIZEBOX", sMax);
    napi_set_named_property(env, style, "WS_MINIMIZEBOX", sMin);
    napi_set_named_property(env, style, "WS_POPUP", sPopup);
    napi_set_named_property(env, style, "WS_CAPTION", sCaption);

    // 挂载到 exports
    napi_set_named_property(env, exports, "CORNER", corner);
    napi_set_named_property(env, exports, "MATERIAL", material);
    napi_set_named_property(env, exports, "STYLE", style);

    return exports;
}

// N-API 模块宏（必须放在全局命名空间）
NAPI_MODULE(NODE_GYP_MODULE_NAME, init)
