@echo off
rem Starts a local web server for Brimstone Slingshot and opens the game.
rem Keep this window open while you play; close it to stop the server.
cd /d "%~dp0"
echo Brimstone Slingshot is running at http://localhost:8765
echo Card Maker:            http://localhost:8765/cardmaker.html
echo Close this window to stop the game server.
start "" http://localhost:8765
python serve.py 8765
if errorlevel 1 (
  echo.
  echo Could not start the server. Is Python installed, or is port 8765 already in use?
  pause
)
