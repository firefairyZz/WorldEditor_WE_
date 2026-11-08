// addon.cpp — N-API entry point, exposes WeWindow C++ API to JS
// Uses node-addon-api (Napi::Object) for clean bindings

#include <napi.h>
#include "we_window.h"
#include <windows.h>

using namespace Napi;
using namespace we_window;

// Get HWND from Electron's BrowserWindow.getNativeWindowHandle()
// JS passes Buffer or {readInt32LE} object
HWND HwndFromJs(const Napi::Value& val) {
    if (val.IsObject()) {
        // Electron returns Buffer with handle data
        Napi::Object obj = val.As<Napi::Object>();
        if (obj.Has("readInt32LE")) {
            Napi::Function fn = obj.Get("readInt32LE").As<Napi::Function>();
            int32_t handle = fn.Call(obj, {}).As<Napi::Number>().Int32Value();
            return (HWND)(intptr_t)handle;
        }
    }
    if (val.IsNumber()) {
        return (HWND)(intptr_t)val.As<Napi::Number>().Int64Value();
    }
    return nullptr;
}

// Attach(hwnd) → bool
Napi::Value Attach(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1) return Napi::Boolean::New(env, false);
    HWND hwnd = HwndFromJs(info[0]);
    bool ok = WeWindow::Attach(hwnd);
    return Napi::Boolean::New(env, ok);
}

// Detach(hwnd) → undefined
Napi::Value Detach(const Napi::CallbackInfo& info) {
    if (info.Length() >= 1) {
        HWND hwnd = HwndFromJs(info[0]);
        WeWindow::Detach(hwnd);
    }
    return info.Env().Undefined();
}

// SetMaterial(hwnd, material) → bool
Napi::Value SetMaterial(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 2) return Napi::Boolean::New(env, false);
    HWND hwnd = HwndFromJs(info[0]);
    int mat = info[1].As<Napi::Number>().Int32Value();
    bool ok = WeWindow::SetMaterial(hwnd, static_cast<Material>(mat));
    return Napi::Boolean::New(env, ok);
}

// SetCorner(hwnd, corner) → bool
Napi::Value SetCorner(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 2) return Napi::Boolean::New(env, false);
    HWND hwnd = HwndFromJs(info[0]);
    int c = info[1].As<Napi::Number>().Int32Value();
    bool ok = WeWindow::SetCorner(hwnd, static_cast<Corner>(c));
    return Napi::Boolean::New(env, ok);
}

// SetTheme(hwnd, theme) → bool
Napi::Value SetTheme(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 2) return Napi::Boolean::New(env, false);
    HWND hwnd = HwndFromJs(info[0]);
    int t = info[1].As<Napi::Number>().Int32Value();
    bool ok = WeWindow::SetTheme(hwnd, static_cast<Theme>(t));
    return Napi::Boolean::New(env, ok);
}

// EnableNativeControls(hwnd) → bool
Napi::Value EnableNativeControls(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1) return Napi::Boolean::New(env, false);
    HWND hwnd = HwndFromJs(info[0]);
    bool ok = WeWindow::EnableNativeControls(hwnd);
    return Napi::Boolean::New(env, ok);
}

// OnMaximized(hwnd) / OnRestored(hwnd) → undefined
Napi::Value OnMaximized(const Napi::CallbackInfo& info) {
    if (info.Length() >= 1) WeWindow::OnMaximized(HwndFromJs(info[0]));
    return info.Env().Undefined();
}
Napi::Value OnRestored(const Napi::CallbackInfo& info) {
    if (info.Length() >= 1) WeWindow::OnRestored(HwndFromJs(info[0]));
    return info.Env().Undefined();
}

// IsMaximized(hwnd) → bool
Napi::Value IsMaximized(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1) return Napi::Boolean::New(env, false);
    HWND hwnd = HwndFromJs(info[0]);
    return Napi::Boolean::New(env, WeWindow::IsMaximized(hwnd));
}

// ========== Init ==========
Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("attach", Napi::Function::New(env, Attach));
    exports.Set("detach", Napi::Function::New(env, Detach));
    exports.Set("setMaterial", Napi::Function::New(env, SetMaterial));
    exports.Set("setCorner", Napi::Function::New(env, SetCorner));
    exports.Set("setTheme", Napi::Function::New(env, SetTheme));
    exports.Set("enableNativeControls", Napi::Function::New(env, EnableNativeControls));
    exports.Set("onMaximized", Napi::Function::New(env, OnMaximized));
    exports.Set("onRestored", Napi::Function::New(env, OnRestored));
    exports.Set("isMaximized", Napi::Function::New(env, IsMaximized));

    // Enum values
    auto mat = Napi::Object::New(env);
    mat.Set("AUTO", 0);
    mat.Set("NONE", 1);
    mat.Set("MICA", 2);
    mat.Set("ACRYLIC", 3);
    mat.Set("TABBED_MICA", 4);
    exports.Set("Material", mat);

    auto corner = Napi::Object::New(env);
    corner.Set("DEFAULT", 0);
    corner.Set("DONOTROUND", 1);
    corner.Set("ROUND", 2);
    corner.Set("ROUNDSMALL", 3);
    exports.Set("Corner", corner);

    auto theme = Napi::Object::New(env);
    theme.Set("AUTO", 0);
    theme.Set("LIGHT", 1);
    theme.Set("DARK", 2);
    exports.Set("Theme", theme);

    return exports;
}

NODE_API_MODULE(we_window, Init)
