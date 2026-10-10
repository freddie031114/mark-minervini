@echo off
rem Double-click (or make a desktop shortcut to this file) to start the journal.
cd /d "%~dp0"
title Trading Journal - close this window or press Ctrl+C to stop
rem Open the browser once the server has had time to build and start.
start "" /b powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 10; Start-Process http://localhost:3000"
call npm.cmd start
echo.
echo The journal has stopped. If you see an error above, copy it and ask for help.
pause
