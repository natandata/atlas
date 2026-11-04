@echo off
echo Reiniciando a Central de Bots...
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like '*web*server.mjs*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
ping -n 3 127.0.0.1 >nul
set "TARGET=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\CentralDeBots.vbs"
if exist "%TARGET%" goto ligar
powershell -NoProfile -Command "(Get-Content -Raw '%~dp0central-oculta.vbs').Replace('__DIR__','%~dp0') | Set-Content -Encoding ASCII '%TEMP%\CentralDeBots.vbs'"
set "TARGET=%TEMP%\CentralDeBots.vbs"
:ligar
wscript.exe "%TARGET%"
echo Ligando... aguarde alguns segundos.
if defined ATLAS_NO_OPEN goto fim
ping -n 7 127.0.0.1 >nul
call "%~dp0abrir-central.bat"
:fim
