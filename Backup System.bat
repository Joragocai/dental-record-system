@echo off
setlocal
cd /d "%~dp0"

if not exist data\dental.db (
  echo Database file not found: data\dental.db
  pause
  exit /b 1
)

node -e "const fs=require('node:fs'); const path=require('node:path'); const root=process.cwd(); const timestamp=new Date().toISOString().slice(0,16).replace('T','_').replace(':',''); const backupName=`backup_${timestamp}`; const backupRoot=path.join(root,'backups',backupName); const copyDir=(source,destination,required=false)=>{ if(!fs.existsSync(source)){ if(required) throw new Error(`Required folder not found: ${path.relative(root,source)}`); return false; } fs.mkdirSync(path.dirname(destination),{recursive:true}); fs.cpSync(source,destination,{recursive:true}); return true; }; if(fs.existsSync(backupRoot)) throw new Error(`Backup folder already exists: ${path.relative(root,backupRoot)}`); fs.mkdirSync(backupRoot,{recursive:true}); copyDir(path.join(root,'data'),path.join(backupRoot,'data'),true); copyDir(path.join(root,'uploads'),path.join(backupRoot,'uploads'),true); const copiedExports=copyDir(path.join(root,'exports'),path.join(backupRoot,'exports'),false); console.log('Backup created:', path.join('backups',backupName)); console.log('Included: data/, uploads/' + (copiedExports ? ', exports/' : ''));"

if errorlevel 1 (
  echo Backup failed.
  pause
  exit /b 1
)

echo Backup completed successfully.
pause
endlocal
