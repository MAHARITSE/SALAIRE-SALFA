@echo off
setlocal
cd /d "%~dp0\.."
if not exist "C:\wamp64\www" (echo WampServer introuvable dans C:\wamp64. Voir GUIDE-WAMP.md. & pause & exit /b 1)
where npm >nul 2>nul
if errorlevel 1 (echo Node.js et npm sont requis sur le serveur pour construire l'application. & pause & exit /b 1)
echo Preparation de la version WAMP...
call npm ci
if errorlevel 1 (echo Installation npm impossible. & pause & exit /b 1)
call npx vite build --mode wamp
if errorlevel 1 (echo Compilation impossible. & pause & exit /b 1)
if not exist "C:\wamp64\www\salfa" mkdir "C:\wamp64\www\salfa"
xcopy /E /I /Y "dist\*" "C:\wamp64\www\salfa\" >nul
if errorlevel 1 (echo Copie du site impossible. & pause & exit /b 1)
xcopy /E /I /Y "wamp\api\*" "C:\wamp64\www\salfa\api\" >nul
if errorlevel 1 (echo Copie de l'API impossible. & pause & exit /b 1)
echo Site copie. Configuration MySQL et initialisation encore necessaires : voir wamp\GUIDE-WAMP.md.
echo Option : importer les donnees Excel dans MySQL avec wamp\sql\salfa_donnees_excel_2022-2026.sql (phpMyAdmin, ne jamais copier ce fichier dans www).
pause
