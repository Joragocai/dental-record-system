import express from "express";
import { getPostgresPool } from "../db/postgres/pool.js";
import { createCloudWorkbook } from "../services/cloudExportService.js";

export function createCloudExportsRouter(pool = null) {
  const router=express.Router();
  const send=kind=>async(req,res,next)=>{
    try{
      const db=pool||await getPostgresPool();
      const {buffer,filename}=await createCloudWorkbook(db,{kind,patientId:req.params.patientId});
      res.set({
        "Cache-Control":"private, no-store",
        "X-Content-Type-Options":"nosniff",
        "Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition":`attachment; filename="${filename}"`
      });
      res.send(Buffer.from(buffer));
    }catch(error){next(error);}
  };
  router.get("/export/patients",send("patients"));
  router.get("/export/treatments",send("treatments"));
  router.get("/export/patients/:patientId/treatments",send("patient-treatments"));
  router.get("/export/patients/:patientId/full-record",send("full-record"));
  return router;
}
