@echo off
REM build.bat — 编译 we-window-native Native Addon
REM 装完 VS C++ workload 后双击运行

setlocal

cd /d "%~dp0"

echo ============================================
echo  we-window-native — Native Addon 编译
echo ============================================
echo.

REM 检查 node-gyp
where npx >nul 2>&1 || (
    echo [ERROR] 找不到 npx
    goto :fail
)

REM 检查 cl.exe
where cl >nul 2>&1
if errorlevel 1 (
    echo [WARN] 找不到 cl.exe，尝试用 VS Installer 发现的路径...
    for /f "delims=" %%i in ('"%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe" -latest -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2^>nul') do (
        echo 发现 VS: %%i
        call "%%i\VC\Auxiliary\Build\vcvarsall.bat" x64 >nul 2>&1
    )
)

echo [1/3] 清理旧编译...
if exist build rmdir /s /q build

echo [2/3] node-gyp rebuild...
call npx node-gyp rebuild
if errorlevel 1 (
    echo.
    echo [ERROR] 编译失败！
    echo 确认已在 VS Installer 里安装 "使用 C++ 的桌面开发" workload
    goto :fail
)

echo.
echo [3/3] 检查产物...
if not exist build\Release\we_window.node (
    echo [ERROR] 产物不存在！
    goto :fail
)

echo.
echo ============================================
echo  ✅ 编译成功！
echo  产物: build\Release\we_window.node
echo ============================================
echo.
echo 复制到 prebuilds 目录...
if not exist prebuilds\win32-x64 mkdir prebuilds\win32-x64
copy /y build\Release\we_window.node prebuilds\win32-x64\

echo.
echo [OK] 完成！现在可以启动 Electron 了。
pause
exit /b 0

:fail
echo.
echo ============================================
echo  ❌ 编译失败
echo ============================================
pause
exit /b 1
