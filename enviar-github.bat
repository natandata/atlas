@echo off
setlocal
chcp 65001 >nul
rem Envia a pasta grokbot para https://github.com/natandata/data-house (sem .env, data e workdir/*)
set SRC=%~dp0
set TMP_REPO=%TEMP%\data-house-push
if exist "%TMP_REPO%" rmdir /s /q "%TMP_REPO%"
git clone https://github.com/natandata/data-house "%TMP_REPO%" || goto erro
robocopy "%SRC%." "%TMP_REPO%" /MIR /XD .git data node_modules workdir /XF .env *.log *.antigo.* office3d.js three.min.js >nul
if not exist "%TMP_REPO%\workdir" mkdir "%TMP_REPO%\workdir"
git -C "%TMP_REPO%" checkout -- workdir 2>nul
cd /d "%TMP_REPO%"
rem identidade do autor: so define se o git deste PC ainda nao tiver uma
for /f "delims=" %%i in ('git config user.email') do set GITMAIL=%%i
if not defined GITMAIL git config user.email "natandata@users.noreply.github.com"
for /f "delims=" %%i in ('git config user.name') do set GITNAME=%%i
if not defined GITNAME git config user.name "natandata"
git add -A
git diff --cached --quiet && goto semnovidade
git commit -m "Atlas 0.3.0: audio, fala informal, calendario de entregas, idioma PT/EN e correcoes" || goto erro
git push origin main || goto erro
echo.
echo Pronto: enviado ao GitHub.
pause
exit /b 0
:semnovidade
echo.
echo O GitHub ja esta igual a esta pasta. Nada novo para enviar.
pause
exit /b 0
:erro
echo.
echo Falhou. Veja a mensagem acima. Se for login, entre no GitHub (git) neste PC e rode de novo.
pause
exit /b 1
