@echo off
setlocal enabledelayedexpansion
title HomeDash

echo ==================================================
echo    HomeDash  -  install ^& run
echo ==================================================
echo.

REM Work from the folder this script lives in (repo root).
cd /d "%~dp0"

REM --- Require Node.js ---
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found.
  echo Install the LTS version from https://nodejs.org/ then run this again.
  echo.
  pause
  exit /b 1
)
for /f "delims=" %%v in ('node --version') do set "NODE_VER=%%v"
echo Using Node !NODE_VER!
echo.

REM --- Install dependencies on first run (or after they were removed) ---
if not exist "node_modules" (
  echo Installing dependencies ^(first run, this can take a minute^)...
  call npm install
  if errorlevel 1 (
    echo.
    echo [ERROR] npm install failed. See the messages above.
    pause
    exit /b 1
  )
  echo.
) else (
  echo Dependencies already installed - skipping npm install.
  echo.
)

REM --- Build the app (picks up any changes after a git pull) ---
echo Building HomeDash...
call npm run build
if errorlevel 1 (
  echo.
  echo [ERROR] Build failed. See the messages above.
  pause
  exit /b 1
)
echo.

echo Starting HomeDash at http://localhost:8787
echo Your dashboard is saved in the "data" folder next to this script.
echo A browser tab will open shortly. Keep this window open while you use it.
echo Press Ctrl+C or close this window to stop.
echo.

REM Open the browser a couple of seconds after the server starts.
start "" cmd /c "timeout /t 3 >nul & start "" http://localhost:8787"

REM Run the HomeDash server (blocks until you stop it).
call npm run server

echo.
echo HomeDash stopped.
pause
