@echo off
where tailscale >nul 2>nul
if errorlevel 1 (
  echo ERRO: o Tailscale nao esta instalado neste computador. Instale em tailscale.com/download e entre na sua conta.
  pause
  exit /b 1
)
powershell -NoProfile -Command "try { $h=(tailscale status --json | ConvertFrom-Json).Self.DNSName.TrimEnd('.'); $t=(Get-Content -Raw '%~dp0data\web\auth.json' | ConvertFrom-Json).token; $u='https://'+$h+':4400/login?t='+$t; Set-Clipboard -Value $u; Write-Host ''; Write-Host ('Endereco do seu PC: https://'+$h+':4400'); Write-Host 'O link completo (com a sua chave de acesso) foi COPIADO para a area de transferencia.'; Write-Host 'Cole no iPhone (por exemplo, enviando para voce mesmo no Notas/iCloud ou AirDrop) e abra no Safari.'; Write-Host 'Nao envie esse link a mais ninguem: quem tiver ele controla os seus bots.' } catch { Write-Host 'Nao consegui montar o link. O Tailscale esta ligado e voce rodou o ligar-tailscale.bat?' }"
echo.
pause
