@echo off
setlocal
cd /d "%~dp0\.."
set "DEST=C:\wamp64\www\Salaire_salfa"
if not exist "C:\wamp64\www" (echo WampServer introuvable dans C:\wamp64. Voir GUIDE-WAMP.md. & pause & exit /b 1)
where npm >nul 2>nul
if errorlevel 1 (echo Node.js et npm sont requis sur le serveur pour construire l'application. & pause & exit /b 1)
echo Preparation de la version WAMP...
call npm ci
if errorlevel 1 (echo Installation npm impossible. & pause & exit /b 1)
call npx vite build --mode wamp
if errorlevel 1 (echo Compilation impossible. & pause & exit /b 1)
if not exist "dist\index.html" (echo Compilation incomplete : dist\index.html introuvable. & pause & exit /b 1)
echo Installation de l'application dans %DEST% ...
if exist "%DEST%" rd /s /q "%DEST%"
mkdir "%DEST%"
xcopy /E /I /Y "dist\*" "%DEST%\" >nul
if errorlevel 1 (echo Copie du site impossible. & pause & exit /b 1)
xcopy /E /I /Y "wamp\api\*" "%DEST%\api\" >nul
if errorlevel 1 (echo Copie de l'API impossible. & pause & exit /b 1)
if not exist "%DEST%\index.html" (echo Echec : %DEST%\index.html introuvable. & pause & exit /b 1)
if not exist "%DEST%\api\index.php" (echo Echec : %DEST%\api\index.php introuvable. & pause & exit /b 1)
if not exist "C:\wamp64\salfa-config.php" (
  echo Creation automatique de C:\wamp64\salfa-config.php ^(MySQL WampServer par defaut^)...
  (
    echo ^<?php
    echo return [
    echo     'host' =^> '127.0.0.1',
    echo     'port' =^> 3306,
    echo     'database' =^> 'salfa_paie',
    echo     'user' =^> 'root',
    echo     'password' =^> '',
    echo ];
  ) > "C:\wamp64\salfa-config.php"
)
echo.
echo Application installee dans %DEST% (index.html, assets, api).
echo Ouvrir : http://127.0.0.1/Salaire_salfa/
echo Ne copiez pas le contenu du dossier wamp\ dans www : ce sont les fichiers
echo sources d'installation, pas l'application. Si un ancien dossier
echo C:\wamp64\www\salfa affiche une liste de fichiers dans le navigateur,
echo vous pouvez le supprimer : l'application est maintenant dans Salaire_salfa.
echo Configuration MySQL et initialisation encore necessaires : voir wamp\GUIDE-WAMP.md.
echo Option : importer les donnees Excel dans MySQL avec wamp\sql\salfa_donnees_excel_2022-2026.sql (phpMyAdmin, ne jamais copier ce fichier dans www).
pause
