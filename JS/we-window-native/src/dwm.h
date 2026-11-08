// dwm.h — DWM (Desktop Window Manager) 封装
#pragma once

#include "common.h"

namespace we_window {

// 初始化 DWM 函数指针（LoadLibrary + GetProcAddress）
// 必须在调用任何 DWM 函数之前调用一次
bool DwmInit();

// 释放 DWM 模块
void DwmShutdown();

// DwmSetWindowAttribute 封装
// 设置 DWM 属性。返回 true 表示成功
bool SetWindowAttr(HWND hwnd, DWORD attr, const void* pValue, DWORD cbValue);

// 便捷方法
bool SetCorner(HWND hwnd, int corner);          // DWMWA_WINDOW_CORNER_PREFERENCE
bool SetMaterial(HWND hwnd, int material);      // DWMWA_SYSTEMBACKDROP_TYPE
bool SetBorderColor(HWND hwnd, int color);       // DWMWA_BORDER_COLOR  (0xAABBGGRR)
bool SetCaptionColor(HWND hwnd, int color);      // DWMWA_CAPTION_COLOR
bool SetTextColor(HWND hwnd, int color);         // DWMWA_TEXT_COLOR
bool SetDarkMode(HWND hwnd, bool enable);        // DWMWA_USE_IMMERSIVE_DARK_MODE

// 系统信息
bool IsWin11();  // build >= 22000
bool IsDwmCompositionEnabled();

} // namespace we_window
