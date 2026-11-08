# compile.ps1 — 编译 we-window-native（修复 VS 2025 + 沙箱问题）
# 在外部 PowerShell（非 TRAE 沙箱）里运行：cd we-window-native; .\compile.ps1
$ErrorActionPreference = "Continue"

$projectDir = Split-Path -Parent $PSScriptRoot
$nativeDir  = $PSScriptRoot

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  we-window-native 编译脚本" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. 找 VS 安装路径
$vsWhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
if (!(Test-Path $vsWhere)) {
    Write-Host "❌ vswhere 没找到，VS 可能没装" -ForegroundColor Red
    exit 1
}
$vsPath = & $vsWhere -latest -property installationPath 2>$null
$vsVersion = & $vsWhere -latest -property installationVersion 2>$null
Write-Host "📦 VS: $vsPath (v$vsVersion)" -ForegroundColor Green

# 2. VS 2025 内部 MSBuild 目录是 v170（不是 v180）
$vcTargetsPath = Join-Path $vsPath "MSBuild\Microsoft\VC\v170\"
if (!(Test-Path $vcTargetsPath)) {
    Write-Host "❌ VCTargetsPath 不存在: $vcTargetsPath" -ForegroundColor Red
    exit 1
}
$env:VCTargetsPath = $vcTargetsPath
Write-Host "🔧 VCTargetsPath = $vcTargetsPath" -ForegroundColor Green

# 3. 清理旧 build
Set-Location $nativeDir
Write-Host "🧹 清理旧 build..." -ForegroundColor Yellow
Remove-Item -Recurse -Force build -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force .electron-gyp -ErrorAction SilentlyContinue
# 清 node-gyp 缓存里的 Electron headers（如果存在）
$electronHeaderDir = "$env:LOCALAPPDATA\node-gyp\Cache"
if (Test-Path $electronHeaderDir) {
    Write-Host "  清理 node-gyp Electron headers..." -ForegroundColor Gray
    Get-ChildItem $electronHeaderDir -Directory | ForEach-Object {
        Remove-Item -Recurse -Force $_.FullName -ErrorAction SilentlyContinue
    }
}

# 4. electron-rebuild（用 Electron 的 headers，不是系统 Node）
Write-Host "🔨 electron-rebuild..." -ForegroundColor Yellow
npx electron-rebuild --force 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "❌ electron-rebuild 失败！试试用 node-gyp..." -ForegroundColor Red
    npx node-gyp rebuild 2>&1 | ForEach-Object { Write-Host $_ }
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ 编译彻底失败" -ForegroundColor Red
        exit 1
    }
}

# 5. 复制到 prebuilds
$srcNode = Join-Path $nativeDir "build\Release\we_window.node"
if (!(Test-Path $srcNode)) {
    Write-Host "❌ 编译产物没找到: $srcNode" -ForegroundColor Red
    exit 1
}
$dstDir = Join-Path $nativeDir "prebuilds\win32-x64"
New-Item -ItemType Directory -Path $dstDir -Force | Out-Null
$dstNode = Join-Path $dstDir "we_window.node"
Copy-Item $srcNode $dstNode -Force

$f = Get-Item $dstNode
Write-Host ""
Write-Host "✅ 编译成功！" -ForegroundColor Green
Write-Host "   产物: $dstNode" -ForegroundColor Gray
Write-Host "   时间: $($f.LastWriteTime)" -ForegroundColor Gray
Write-Host "   大小: $([math]::Round($f.Length/1KB, 1)) KB" -ForegroundColor Gray

# 6. 验证导出的函数有没有 removeLayeredStyle
Write-Host ""
Write-Host "🔍 验证导出函数..." -ForegroundColor Yellow
Set-Location $projectDir
$exports = node -e "try{const n=require('./we-window-native/prebuilds/win32-x64/we_window.node');console.log(Object.keys(n).sort().join(','));}catch(e){console.log('ERR:'+e.message);}"
if ($exports -match "removeLayeredStyle") {
    Write-Host "   ✅ removeLayeredStyle 已导出" -ForegroundColor Green
} else {
    Write-Host "   ❌ removeLayeredStyle 缺失！" -ForegroundColor Red
    Write-Host "   当前导出: $exports" -ForegroundColor Red
}

Write-Host ""
Write-Host "📝 现在可以在 JS/ 目录下运行 npm start 测试了" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
