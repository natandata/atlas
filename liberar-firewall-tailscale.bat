@echo off
echo Este arquivo cria UMA regra no Firewall do Windows: permite conexoes de ENTRADA na porta 4400
echo vindas somente da rede privada do Tailscale (100.64.0.0/10). Nada fica aberto para a internet.
echo.
net session >nul 2>&1
if errorlevel 1 (
  echo Pedindo permissao de administrador...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
powershell -NoProfile -Command "Remove-NetFirewallRule -DisplayName 'Data House (Tailscale 4400)','Atlas (Tailscale 4400)' -ErrorAction SilentlyContinue; New-NetFirewallRule -DisplayName 'Atlas (Tailscale 4400)' -Direction Inbound -Protocol TCP -LocalPort 4400 -RemoteAddress 100.64.0.0/10 -Action Allow -Profile Any | Out-Null; Write-Host 'Regra criada.'"
pause
