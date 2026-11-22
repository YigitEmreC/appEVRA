@echo off
rem Tunnel test: Evra over https:// on a real phone, from this PC, without the Pi.
rem Starts three windows: the test hub (a stand-in for Home Assistant), the built
rem Evra app (only the app's own files, safe to share) and Cloudflare Tunnel,
rem which puts both on the two internet addresses below.
rem One-time setup and the full test: tools\tunnel_test\README.md
rem To stop: close the three windows.
setlocal EnableExtensions

rem ---- the two test addresses, as set up in the Cloudflare tunnel ---------------
set "EVRA_HOST=evra-test.evrasmarthome.com"
set "HA_HOST=ha-test.evrasmarthome.com"

set "APP_DIR=%~dp0"
set "TOKEN_FILE=%APP_DIR%tools\tunnel_test\token.txt"
set "APP_PORT=8090"
set "HUB_PORT=8123"

rem ---- find Python: Anaconda first, then whatever is on PATH ----------------------
set "PY="
if exist "%USERPROFILE%\anaconda3\python.exe" set "PY=%USERPROFILE%\anaconda3\python.exe"
if not defined PY if exist "%LOCALAPPDATA%\anaconda3\python.exe" set "PY=%LOCALAPPDATA%\anaconda3\python.exe"
if not defined PY python --version >nul 2>&1 && set "PY=python"
if not defined PY goto :no_python
"%PY%" -c "import aiohttp" >nul 2>&1
if errorlevel 1 goto :no_aiohttp
"%PY%" -c "import pywebpush" >nul 2>&1
if errorlevel 1 echo Note: phone notifications need pywebpush. Install it with:  "%PY%" -m pip install pywebpush
if errorlevel 1 echo Continuing without notifications.

rem ---- find cloudflared ------------------------------------------------------------
set "CF="
where cloudflared >nul 2>&1 && set "CF=cloudflared"
if not defined CF if exist "%ProgramFiles(x86)%\cloudflared\cloudflared.exe" set "CF=%ProgramFiles(x86)%\cloudflared\cloudflared.exe"
if not defined CF if exist "%ProgramFiles%\cloudflared\cloudflared.exe" set "CF=%ProgramFiles%\cloudflared\cloudflared.exe"
if not defined CF goto :no_cloudflared

rem ---- the tunnel's token (kept out of git) ---------------------------------------
if not exist "%TOKEN_FILE%" goto :no_token
set "TUNNEL_TOKEN="
set /p TUNNEL_TOKEN=<"%TOKEN_FILE%"
if not defined TUNNEL_TOKEN goto :no_token

rem ---- the ports must be free: this test starts its own hub, which accepts the phone
curl -s -o nul --max-time 2 "http://127.0.0.1:%HUB_PORT%/" && goto :hub_busy
curl -s -o nul --max-time 2 "http://127.0.0.1:%APP_PORT%/" && goto :app_busy

rem ---- build the app exactly like the add-on ----------------------------------------
"%PY%" "%APP_DIR%tools\build_addon.py"
if errorlevel 1 goto :failed

echo Starting the test hub, the app and the tunnel...
start "Evra tunnel test - test hub" cmd /k ""%PY%" "%APP_DIR%tools\test_hub\hub.py" --port %HUB_PORT% --origin https://%EVRA_HOST% --origin http://localhost:%APP_PORT% --origin http://127.0.0.1:%APP_PORT% --origin http://localhost:8010 --origin http://127.0.0.1:8010"
start "Evra tunnel test - app" cmd /k ""%PY%" -I "%APP_DIR%tools\tunnel_test\serve_app.py" --port %APP_PORT% --ha https://%HA_HOST%"
rem cloudflared reads the token from TUNNEL_TOKEN, so it isn't on the command line.
start "Evra tunnel test - Cloudflare Tunnel" cmd /k ""%CF%" tunnel --no-autoupdate run"

ping -n 4 127.0.0.1 >nul
start "" "http://localhost:%HUB_PORT%/"
echo.
echo  On this PC:     http://localhost:%APP_PORT%   (the test hub's panel is open too)
echo  On your phone:  https://%EVRA_HOST%   (switch Wi-Fi off, so it really goes through the internet)
echo  Test login for Home Assistant: on the test hub's panel.
echo.
echo The full test, step by step: tools\tunnel_test\README.md
pause
exit /b 0

:no_python
echo Python was not found. Install it from https://www.python.org and run this again.
goto :failed
:no_aiohttp
echo The test hub needs the aiohttp package. Install it with:  "%PY%" -m pip install aiohttp
goto :failed
:no_cloudflared
echo cloudflared is not installed. Install it with:  winget install --id Cloudflare.cloudflared
echo Then open a new window and run this again.
goto :failed
:no_token
echo The tunnel's token is missing. Put it, on one line, in:
echo   %TOKEN_FILE%
echo Where to find it: tools\tunnel_test\README.md, step 3.
goto :failed
:hub_busy
echo Something is already using port %HUB_PORT%, probably the normal test hub. Close it first:
echo this test starts its own hub, which accepts the phone's address.
goto :failed
:app_busy
echo Something is already using port %APP_PORT%. Close it and run this again.
goto :failed
:failed
pause
exit /b 1
