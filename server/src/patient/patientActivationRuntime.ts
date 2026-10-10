import {buildPgFoundationConfig} from "../postgres/config.js";
import {createPgPoolManager,type PgPoolManager} from "../postgres/pool.js";
import {createPatientProvisioningService} from "../services/patientProvisioningService.js";
import {buildStaffProvisioningConfig} from "../staff/staffProvisioningConfig.js";
import {createSupabaseStaffProvisioningProvider} from "../staff/supabaseStaffProvisioningProvider.js";
import {createVerifiedPatientIdentityService} from "./verifiedPatientIdentity.js";

export function createPatientActivationRuntime(){
 let pool:PgPoolManager|null=null;
 function getPool(){if(!pool)pool=createPgPoolManager(buildPgFoundationConfig());return pool}
 return {
  getServices(){
   const cfg=buildStaffProvisioningConfig();
   const redirect=new URL(cfg.inviteRedirectUrl);
   redirect.pathname="/activate-patient-account";
   redirect.search="";redirect.hash="";
   return {
    identity:createVerifiedPatientIdentityService(),
    provisioning:createPatientProvisioningService(
     getPool(),createSupabaseStaffProvisioningProvider(cfg),redirect.toString()
    )
   };
  },
  async shutdown(){if(pool){const p=pool;pool=null;await p.shutdown()}}
 };
}
