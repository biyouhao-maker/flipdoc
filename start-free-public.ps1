# 一键启动 FlipDoc 本地生产服务 + 免费 Cloudflare 公网 HTTPS 隧道
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

Write-Host "===============================================" -ForegroundColor Cyan
Write-Host "  FlipDoc 轻翻 · 免费公网一键启动" -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan

# 后台启动 Next.js 服务
$serverProc = Start-Process -FilePath "npm.cmd" -ArgumentList "run", "start" -WorkingDirectory $Root -PassThru -WindowStyle Minimized
Start-Sleep -Seconds 2

$cf = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
if (!(Test-Path $cf)) {
    Write-Host "未检测到 cloudflared，服务已在局域网运行：http://localhost:3000" -ForegroundColor Yellow
    exit 0
}

Write-Host "正在开启免费 Cloudflare HTTPS 公网隧道..." -ForegroundColor Green
Write-Host "提示：把下方出现的 https://xxx.trycloudflare.com 发给安卓/微信好友即可直接打开！" -ForegroundColor Yellow
Write-Host "按 Ctrl+C 停止服务。" -ForegroundColor DarkGray

try {
    & $cf tunnel --url http://127.0.0.1:3000 --no-autoupdate
} finally {
    if ($serverProc -and !$serverProc.HasExited) {
        Stop-Process -Id $serverProc.Id -Force -ErrorAction SilentlyContinue
    }
}
