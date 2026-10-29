@echo off
if not exist "%~dp0data\web\auth.json" (
  echo A central ainda nao foi ligada. Rode instalar-autostart.bat ou "npm.cmd run web" primeiro.
  pause
  exit /b 1
)
powershell -NoProfile -Command "$t=(Get-Content -Raw '%~dp0data\web\auth.json' | ConvertFrom-Json).token; $u='http://localhost:4400/login?t='+$t; try { Start-Process chrome -ArgumentList $u -ErrorAction Stop } catch { Start-Process $u }"
