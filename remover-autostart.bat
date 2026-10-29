@echo off
call "%~dp0parar-central.bat"
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\CentralDeBots.vbs" 2>nul
echo Inicio automatico removido.
pause
