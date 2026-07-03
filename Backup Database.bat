@echo off
setlocal
cd /d "%~dp0"

if not exist data\dental.db (
  echo Database file not found: data\dental.db
  pause
  exit /b 1
)

node -e "const fs=require('node:fs'); const path=require('node:path'); const { DatabaseSync } = require('node:sqlite'); const root=process.cwd(); const source=path.join(root,'data','dental.db'); const timestamp=new Date().toISOString().slice(0,16).replace('T','_').replace(':',''); const destination=path.join(root,'backups',`dental_backup_${timestamp}.db`); fs.mkdirSync(path.dirname(destination),{recursive:true}); const db=new DatabaseSync(source); const safe=destination.replace(/\\/g,'\\\\').replace(/'/g,`''`); db.exec(`VACUUM INTO '${safe}'`); db.close(); console.log('Backup created:', destination);"

if errorlevel 1 (
  echo Backup failed.
  pause
  exit /b 1
)

echo Backup completed successfully.
pause
endlocal
