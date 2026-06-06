$ErrorActionPreference = "Stop"

$gh = "C:\Program Files\GitHub CLI\gh.exe"
$proxy = "http://127.0.0.1:7890"
$env:HTTP_PROXY = $proxy
$env:HTTPS_PROXY = $proxy
$env:ALL_PROXY = $proxy
$env:http_proxy = $proxy
$env:https_proxy = $proxy
$env:all_proxy = $proxy

Clear-Host
Write-Host "GitHub CLI auth login"
Write-Host "Proxy: $proxy"
Write-Host "Open https://github.com/login/device if the browser does not open."
Write-Host "Enter the one-time code shown below, then approve GitHub CLI."
Write-Host ""

if (Test-Path -LiteralPath $gh) {
  & $gh auth login --hostname github.com --git-protocol https --web --scopes repo
  Write-Host ""
  & $gh auth status
} else {
  Write-Host "GitHub CLI not found at:"
  Write-Host $gh
}

Write-Host ""
Read-Host "Press Enter to close"
