import express from "express";

// Cloud PostgreSQL backups are managed through Supabase/provider recovery and
// a separately verified export/restore procedure, never the old SQLite snapshot.
export function createCloudBackupRouter(){
 const router=express.Router();
 router.get("/backup/status",(_req,res)=>res.set("Cache-Control","no-store").json({
  mode:"cloud", managedExternally:true, backupInProgress:false,
  lastBackupStatus:"unverified", backupDestination:"Managed database backup — verify in hosting dashboard",
  lastAutomaticBackupAt:null,lastManualBackupAt:null, automaticBackupEnabled:false,
  retainedWeeklyCount:0,retainedMonthlyCount:0, isBackupOverdue:false,
  message:"Cloud backups and restore capability have not yet been verified. Database exports are not backups."
 }));
 router.post("/backup",(_req,res)=>res.status(501).json({
  message:"Cloud manual backup is not available. Configure and verify database backups and restore before enabling this action."
 }));
 return router;
}
