@echo off
setlocal
cd /d "%~dp0"

if not exist node_modules (
  echo Dependencies are not installed yet.
  echo Run npm install first, then run this file again.
  pause
  exit /b 1
)

start "Dental Backend - Keep Open While Using System" cmd /k "title Dental Backend - Keep This Window Open && echo Dental Backend is starting... && echo Do not close this window while using the system. && echo. && cd /d ""%~dp0"" && npm run dev:server"
start "Dental Frontend - Keep Open While Using System" cmd /k "title Dental Frontend - Keep This Window Open && echo Dental Frontend is starting... && echo Do not close this window while using the system. && echo. && cd /d ""%~dp0"" && npm run dev:client"

echo Waiting for backend and frontend to start...
timeout /t 10 /nobreak >nul

start "" "http://localhost:5173/"

endlocal
