import type {PgQueryExecutor} from "../postgres/pool.js";

export interface EnrollmentPatient {
 id:string; birthday:string; email:string|null; firstName:string; lastName:string; registrationBranchId:string;
}
export interface EnrollmentRepository {
 getPatientForUpdate(patientId:string):Promise<EnrollmentPatient|null>;
 hasPatientLink(patientId:string):Promise<boolean>;
 hasEmail(email:string):Promise<boolean>;
 createPendingUser(userId:string,email:string,displayName:string):Promise<void>;
 assignPatientRole(userId:string):Promise<void>;
 createPendingLink(patientId:string,userId:string,approvedBy:string,at:string):Promise<void>;
}
export function createPatientEnrollmentRepository(db:PgQueryExecutor):EnrollmentRepository {
 return {
  async getPatientForUpdate(patientId){
   const result=await db.query<{id:string;birthday:Date|string;email_address:string|null;first_name:string;last_name:string;branch_id:string}>(
     "SELECT id,birthday,email_address,first_name,last_name,branch_id FROM patients WHERE id=$1 FOR UPDATE",[patientId]);
   const p=result.rows[0];if(!p)return null;
   const birthday=p.birthday instanceof Date?p.birthday.toISOString().slice(0,10):p.birthday;
   return {id:p.id,birthday,email:p.email_address,firstName:p.first_name,lastName:p.last_name,registrationBranchId:p.branch_id};
  },
  async hasPatientLink(patientId){const r=await db.query<{linked:boolean}>("SELECT EXISTS(SELECT 1 FROM patient_accounts WHERE patient_id=$1) AS linked",[patientId]);return r.rows[0]?.linked===true},
  async hasEmail(email){const r=await db.query<{taken:boolean}>("SELECT EXISTS(SELECT 1 FROM app_users WHERE lower(trim(email))=$1) AS taken",[email]);return r.rows[0]?.taken===true},
  async createPendingUser(id,email,name){await db.query("INSERT INTO app_users(id,auth_user_id,email,display_name,status,created_at,updated_at) VALUES($1,NULL,$2,$3,'pending',NOW(),NOW())",[id,email,name])},
  async assignPatientRole(id){const r=await db.query("INSERT INTO user_roles(user_id,role_id,assigned_at) SELECT $1,id,NOW() FROM roles WHERE code='PATIENT'",[id]);if(r.rowCount!==1)throw new Error("PATIENT role unavailable")},
  async createPendingLink(patientId,userId,approvedBy,at){await db.query(
    "INSERT INTO patient_accounts(app_user_id,patient_id,status,approved_by_user_id,approved_at,created_at,updated_at) VALUES($1,$2,'pending',$3,$4,$4,$4)",[userId,patientId,approvedBy,at])}
 };
}
