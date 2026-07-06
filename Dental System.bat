@echo off
setlocal

set "PROJECT_DIR="

cd /d "%PROJECT_DIR%"

if not exist package.json (
    echo ERROR: package.json not found in:
    echo %PROJECT_DIR%
    pause
    exit /b 1
)

if not exist node_modules (
    echo Dependencies are not installed.
    echo Running npm install...
    npm install
    if errorlevel 1 (
        echo npm install failed.
        pause
        exit /b 1
    )
)

start "Dental Backend" cmd /k "title Dental Backend && cd /d ""%PROJECT_DIR%"" && npm run dev:server"

start "Dental Frontend" cmd /k "title Dental Frontend && cd /d ""%PROJECT_DIR%"" && npm run dev:client"

echo Waiting for servers to start...
timeout /t 10 /nobreak >nul

start "" "http://localhost:5173/"

endlocal