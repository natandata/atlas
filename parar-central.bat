@echo off
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like '*web*server.mjs*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
echo Central de Bots parada.
