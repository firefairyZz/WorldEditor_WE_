// common.h — 共享常量和类型定义
#pragma once

#include <windows.h>
#include <dwmapi.h>   // DWM enum values (DWMWA_*, DWMWCP_*, DWMSBT_*)
#include <uxtheme.h>  // MARGINS struct

// ===== 窗口样式（Win32）=====
// 这些 <windows.h> 其实也有，放心放这里方便查阅
#ifndef GWL_STYLE
#define GWL_STYLE       (-16)
#endif

// ===== SetWindowPos 标志 =====
#ifndef SWP_NOMOVE
#define SWP_NOMOVE          0x0002
#endif
#ifndef SWP_NOSIZE
#define SWP_NOSIZE          0x0001
#endif
#ifndef SWP_NOZORDER
#define SWP_NOZORDER        0x0004
#endif
#ifndef SWP_FRAMECHANGED
#define SWP_FRAMECHANGED    0x0020
#endif
#ifndef SWP_NOACTIVATE
#define SWP_NOACTIVATE      0x0010
#endif

// ===== 动态加载的函数指针类型 =====
// (dwmapi.h 里没有这些 typedef，自己定义)
typedef HRESULT (WINAPI* DwmSetWindowAttribute_t)(HWND, DWORD, LPCVOID, DWORD);
typedef BOOL   (WINAPI* DwmExtendFrameIntoClientArea_t)(HWND, const MARGINS*);
typedef BOOL   (WINAPI* DwmIsCompositionEnabled_t)(BOOL*);
