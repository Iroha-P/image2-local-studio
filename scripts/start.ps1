$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "未找到 Node.js。请先安装 Node.js 18.17 或更新版本。"
  exit 1
}

if (-not (Test-Path (Join-Path $root "node_modules\sharp"))) {
  Write-Host "首次启动正在准备本地超分依赖..."
  npm install
}

$env:PORT = if ($env:PORT) { $env:PORT } else { "8787" }
Write-Host "正在启动 Image2 Local Studio..."
Write-Host "浏览器地址: http://localhost:$env:PORT"
npm start
