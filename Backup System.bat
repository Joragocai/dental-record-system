@echo off
setlocal
cd /d "%~dp0"

if not exist data\dental.db (
  echo Database file not found: data\dental.db
  pause
  exit /b 1
)

npm run backup:create

if errorlevel 1 (
  echo Backup failed.
  pause
  exit /b 1
)

echo Backup completed successfully.
pause
endlocal
