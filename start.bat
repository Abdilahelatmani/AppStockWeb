@echo off
REM ============================================================
REM  Lance un petit serveur local et ouvre l'application.
REM  Necessaire car les modules JavaScript ne se chargent pas
REM  en ouvrant index.html directement (protocole file://).
REM ============================================================
setlocal
set PORT=8123

echo Demarrage du serveur sur http://localhost:%PORT% ...

REM 1) Essayer Python (souvent deja installe)
where python >nul 2>nul
if %errorlevel%==0 (
  start "" http://localhost:%PORT%/
  python -m http.server %PORT%
  goto :eof
)

REM 2) Sinon essayer Node.js
where node >nul 2>nul
if %errorlevel%==0 (
  start "" http://localhost:%PORT%/
  node server.js
  goto :eof
)

echo.
echo  Ni Python ni Node.js n'ont ete trouves.
echo  Installez l'un des deux, ou utilisez l'extension "Live Server" de VS Code.
echo.
pause
