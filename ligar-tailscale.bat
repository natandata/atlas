@echo off
echo Publicando a Central de Bots na sua rede privada do Tailscale (HTTPS)...
where tailscale >nul 2>nul
if errorlevel 1 (
  echo ERRO: o Tailscale nao esta instalado ou nao esta no PATH. Instale em tailscale.com/download e entre na sua conta.
  pause
  exit /b 1
)
tailscale serve --bg --https=4400 127.0.0.1:4400
echo.
tailscale serve status
echo.
echo Abra no celular (com o Tailscale ligado) o endereco https mostrado acima, com :4400 no final,
echo e depois use o link com token: o mesmo que o abrir-central.bat usa, trocando http://127.0.0.1:4400 pelo endereco https.
pause
