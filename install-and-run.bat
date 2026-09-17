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

echo Starting HomeDash at http://localhost:5173
echo A browser tab will open shortly. Keep this window open while you use it.
echo Press Ctrl+C or close this window to stop.
echo.

REM Open the browser a few seconds after the dev server starts booting.
start "" cmd /c "timeout /t 4 >nul & start "" http://localhost:5173"

REM Run the dev server (blocks until you stop it).
call npm run dev

echo.
echo HomeDash stopped.
pause
