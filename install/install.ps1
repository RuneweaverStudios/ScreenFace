# ScreenFace one-liner installer for Windows (PowerShell)
# Usage: irm https://raw.githubusercontent.com/RuneweaverStudios/ScreenFace/main/install/install.ps1 | iex
# Or:    irm https://raw.githubusercontent.com/RuneweaverStudios/ScreenFace/main/install/install.ps1 | iex -ArgumentList "v1.0.0"

param([string]$Version = "latest")

$ErrorActionPreference = "Stop"
$repo = if ($env:GITHUB_REPO) { $env:GITHUB_REPO } else { "RuneweaverStudios/ScreenFace" }
$api = "https://api.github.com/repos/$repo/releases"
if ($Version -eq "latest") {
  $release = Invoke-RestMethod -Uri "$api/latest" -Method Get
} else {
  $release = Invoke-RestMethod -Uri "$api/tags/$Version" -Method Get
}
$asset = $release.assets | Where-Object { $_.name -match "\.exe$" -and $_.name -notmatch "portable" } | Select-Object -First 1
if (-not $asset) {
  Write-Error "No Windows installer (.exe) found for version: $Version"
  exit 1
}
$exePath = Join-Path $env:TEMP $asset.name
Write-Host "Downloading ScreenFace..."
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $exePath -UseBasicParsing
Write-Host "Running installer (follow the wizard)..."
Start-Process -FilePath $exePath -Wait
Remove-Item $exePath -Force -ErrorAction SilentlyContinue
Write-Host "ScreenFace installer finished. You can start ScreenFace from the Start menu or desktop shortcut."
