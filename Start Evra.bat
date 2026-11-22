@echo off
rem Starts the Evra app: runs the local server (unless it is already running)
rem and opens the app in its own window. Close the "Evra server" window to stop it.
rem Double-click it, or run  "Start Evra.bat" 8020  to use another port.
setlocal EnableExtensions

set "PORT=%~1"
if not defined PORT set "PORT=8010"
set "APP_DIR=%~dp0"
for %%I in ("%APP_DIR%.") do set "APP_NAME=%%~nxI"
set "URL=http://localhost:%PORT%/%APP_NAME%/"

rem ---- find Python: Anaconda first, then whatever is on PATH ----------------
set "PY="
if exist "%USERPROFILE%\anaconda3\python.exe" set "PY=%USERPROFILE%\anaconda3\python.exe"
if not defined PY if exist "%LOCALAPPDATA%\anaconda3\python.exe" set "PY=%LOCALAPPDATA%\anaconda3\python.exe"
if not defined PY (
  python --version >nul 2>&1 && set "PY=python"
)
if not defined PY (
  echo Python was not found. Install it from https://www.python.org and run this again.
  pause
  exit /b 1
)

rem ---- start the server, unless the app is already being served -----------
call :serving
if errorlevel 1 (
  echo Starting the Evra server on port %PORT%...
  start "Evra server - close this window to stop it" /min "%PY%" "%APP_DIR%tools\dev_server.py" %PORT%
  call :wait_for_server
) else (
  echo The Evra server is already running on port %PORT%.
)

rem ---- Evra accounts stand-in, for working without the website (the app uses evrasmarthome.com unless Settings says This computer)
curl -sf -o nul --max-time 2 "http://127.0.0.1:8770/api/status"
if errorlevel 1 (
  "%PY%" -c "import aiohttp" >nul 2>&1
  if errorlevel 1 (
    echo Evra accounts needs the aiohttp package:  "%PY%" -m pip install aiohttp
  ) else (
    start "Evra accounts - close this window to stop it" /min "%PY%" "%APP_DIR%tools\accounts\server.py"
  )
)

rem ---- the Evra assistant, when it's set up next to the app (EvrAI folder) -------
set "ASSISTANT_DIR=%APP_DIR%..\EvrAI\gemini_home_starter\"
if exist "%ASSISTANT_DIR%.env" if exist "%ASSISTANT_DIR%Start assistant.bat" call "%ASSISTANT_DIR%Start assistant.bat"

rem ---- open the app in its own window (Edge or Chrome), else the default browser
set "BROWSER="
for %%K in (msedge.exe chrome.exe) do (
  for %%R in (HKLM HKCU) do (
    if not defined BROWSER (
      for /f "tokens=2,*" %%A in ('reg query "%%R\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\%%K" /ve 2^>nul ^| findstr /i "REG_SZ"') do set "BROWSER=%%B"
    )
  )
)
if defined BROWSER (
  start "" "%BROWSER%" --app=%URL%
) else (
  start "" "%URL%"
)
exit /b 0

rem ---- helpers ---------------------------------------------------------------

rem Succeeds when the server answers with the app's start page.
:serving
curl -sf -o nul --max-time 2 "http://127.0.0.1:%PORT%/%APP_NAME%/index.html"
exit /b %errorlevel%

rem Waits up to about 15 seconds for the server to come up.
:wait_for_server
for /l %%N in (1,1,15) do (
  call :serving && exit /b 0
  ping -n 2 127.0.0.1 >nul
)
echo The server hasn't answered yet; opening the app anyway.
exit /b 0
