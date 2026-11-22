@echo off
rem Starts the Evra test hub (a stand-in for Home Assistant, for trying live
rem mode without the Raspberry Pi), opens its control panel, then starts Evra.
rem In Evra: Settings > Connection > Live, address http://localhost:8123.
rem Close the "Evra test hub" window to stop the hub.
setlocal EnableExtensions

set "HUB_PORT=8123"
set "APP_DIR=%~dp0"

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
"%PY%" -c "import aiohttp" >nul 2>&1
if errorlevel 1 (
  echo The test hub needs the aiohttp package. Install it with:  "%PY%" -m pip install aiohttp
  pause
  exit /b 1
)

rem ---- start the hub, unless it's already running ----------------------------
call :hub_up
if errorlevel 1 (
  echo Starting the Evra test hub on port %HUB_PORT%...
  start "Evra test hub - close this window to stop it" "%PY%" "%APP_DIR%tools\test_hub\hub.py" --port %HUB_PORT%
  for /l %%N in (1,1,15) do (
    call :hub_up && goto :hub_ready
    ping -n 2 127.0.0.1 >nul
  )
  echo The test hub hasn't answered yet; check its window for errors.
) else (
  echo The Evra test hub is already running.
)
:hub_ready
start "" "http://localhost:%HUB_PORT%/"

rem ---- then the app itself ---------------------------------------------------
call "%APP_DIR%Start Evra.bat"
exit /b 0

:hub_up
curl -sf -o nul --max-time 2 "http://127.0.0.1:%HUB_PORT%/panel/api/state"
exit /b %errorlevel%
