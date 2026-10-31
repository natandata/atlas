@echo off
chcp 65001 >nul
title Conectar o Google Drive ao Atlas
echo.
echo  Este passo e feito UMA vez. Vai abrir o navegador: entre na sua conta Google e clique em Permitir.
echo.
set "PATH=%PATH%;%LOCALAPPDATA%\Microsoft\WinGet\Links"
where rclone >nul 2>nul
if errorlevel 1 (
  echo Instalando o rclone...
  winget install -e --id Rclone.Rclone --accept-source-agreements --accept-package-agreements
  set "PATH=%PATH%;%LOCALAPPDATA%\Microsoft\WinGet\Links"
)
where rclone >nul 2>nul
if errorlevel 1 (
  echo.
  echo Nao consegui instalar o rclone. Feche esta janela, abra uma nova e rode este arquivo de novo.
  pause
  exit /b 1
)
rclone config create gdrive drive scope=drive
echo.
echo Conferindo a conexao:
rclone lsd gdrive: --max-depth 1
echo.
echo Pronto. Se apareceu a lista de pastas acima, esta tudo conectado. Nao precisa reiniciar a Central.
pause
