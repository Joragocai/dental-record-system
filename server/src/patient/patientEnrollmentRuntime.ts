import {buildPgFoundationConfig} from "../postgres/config.js";
import {createPgPoolManager,type PgPoolManager} from "../postgres/pool.js";
import {createPatientEnrollmentService} from "../services/patientEnrollmentService.js";

export function createPatientEnrollmentRuntime(){
 let pool:PgPoolManager|null=null;
 return {
  getService(){
   if(!pool)pool=createPgPoolManager(buildPgFoundationConfig());
   return createPatientEnrollmentService(pool);
  },
  async shutdown(){if(pool){const p=pool;pool=null;await p.shutdown()}}
 };
}
