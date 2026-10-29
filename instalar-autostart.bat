@echo off
setlocal
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "TARGET=%STARTUP%\CentralDeBots.vbs"
echo Instalando a Central de Bots para iniciar com o Windows...
powershell -NoProfile -Command "(Get-Content -Raw '%~dp0central-oculta.vbs').Replace('__DIR__','%~dp0') | Set-Content -Encoding ASCII '%TARGET%'"
if not exist "%TARGET%" (
  echo ERRO: nao consegui criar o arquivo de inicio automatico.
  pause
  exit /b 1
)
echo Pronto. A central vai ligar sozinha, sem janela, quando o Windows iniciar.
echo Ligando agora...
wscript.exe "%TARGET%"
timeout /t 6 /nobreak >nul
call "%~dp0abrir-central.bat"
