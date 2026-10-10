import assert from "node:assert/strict";
import test from "node:test";
import {buildPgFoundationConfig,summarizeDatabaseUrl} from "../config.js";
import {runPendingMigrations,migrationTableName} from "../migrations.js";
import {createPgPoolManager} from "../pool.js";
import {assertSafeTestDatabaseTarget,getPgIntegrationReadiness} from "../testSafety.js";
import {createPatientAccountRepository} from "../../repositories/patientAccountRepository.js";

// Only on the independently guarded, disposable local TEST_DATABASE_URL.
// Discover every public test table because future migrations add more tables.
function safeTestConfig(){
 const config=buildPgFoundationConfig(process.env);
 if(!config.testDatabaseUrl)throw new Error("TEST_DATABASE_URL is required");
 assertSafeTestDatabaseTarget(config.testDatabaseUrl,config.databaseUrl,config.appEnv);
 return {...config,...summarizeDatabaseUrl(config.testDatabaseUrl,config.sslMode,config.appEnv),
  databaseUrl:config.testDatabaseUrl};
}
test("Phase 14 isolated PostgreSQL migration enforces patient ownership, publication and request constraints",async t=>{
 const readiness=getPgIntegrationReadiness(process.env);
 if(!readiness.ready){t.skip(readiness.reason??"Only an isolated TEST_DATABASE_URL may run this suite.");return}
 const pool=createPgPoolManager(safeTestConfig());
 const branch="11111111-1111-4111-8111-111111111111";
 const staff="22222222-2222-4222-8222-222222222222";
 const patientA="33333333-3333-4333-8333-333333333333";
 const patientB="44444444-4444-4444-8444-444444444444";
 const userA="55555555-5555-4555-8555-555555555555";
 const userB="66666666-6666-4666-8666-666666666666";
 const authA="77777777-7777-4777-8777-777777777777";
 const authB="88888888-8888-4888-8888-888888888888";
 const appt="99999999-9999-4999-8999-999999999999";
 const first="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
 const second="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
 async function clear(){
  const found=await pool.query<{tablename:string}>("SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname=$1",["public"]);
  for(const {tablename} of found.rows){
   if(!/^[a-z_][a-z0-9_]*$/.test(tablename))throw Error("Unsafe test table name");
   await pool.query(`DROP TABLE IF EXISTS "${tablename}" CASCADE`);
  }
 }
 try{
  await clear();
  const migrations=await runPendingMigrations(pool);
  assert.ok(migrations.applied.includes("0013_patient_portal_ownership.sql"));
  assert.ok(migrations.applied.includes("0014_patient_portal_publication.sql"));
  assert.ok(migrations.applied.includes("0015_patient_appointment_requests.sql"));
  await pool.query("INSERT INTO branches(id,branch_code,branch_name,created_at,updated_at) VALUES($1,'PORTAL','Fictional Clinic',NOW(),NOW())",[branch]);
  await pool.query(`INSERT INTO app_users(id,auth_user_id,email,display_name,status,created_at,updated_at) VALUES
   ($1,NULL,'staff@example.test','Fictional Dentist','active',NOW(),NOW()),
   ($2,$4,'a@example.test','Fictional Patient A','active',NOW(),NOW()),
   ($3,$5,'b@example.test','Fictional Patient B','active',NOW(),NOW())`,[staff,userA,userB,authA,authB]);
  await pool.query(`INSERT INTO user_roles(user_id,role_id,assigned_at)
   SELECT x.user_id,r.id,NOW() FROM (VALUES($1::uuid,'DENTIST'),($2::uuid,'PATIENT'),($3::uuid,'PATIENT'))
   AS x(user_id,role_code) JOIN roles r ON r.code=x.role_code`,[staff,userA,userB]);
  await pool.query("INSERT INTO user_branches(user_id,branch_id,assigned_at) VALUES($1,$2,NOW())",[staff,branch]);
  for(const [id,code,email] of [[patientA,"P-2026-8001","a@example.test"],[patientB,"P-2026-8002","b@example.test"]]){
   await pool.query(`INSERT INTO patients(id,patient_code,branch_id,date_registered,last_name,first_name,birthday,gender,
     mobile_number,email_address,created_at,updated_at)
     VALUES($1,$2,$3,'2026-10-10','Fictional','Patient','1990-03-01','Other','09000000000',$4,NOW(),NOW())`,
     [id,code,branch,email]);
  }
  for(const [appUser,patientId] of [[userA,patientA],[userB,patientB]]){
   await pool.query(`INSERT INTO patient_accounts(app_user_id,patient_id,status,approved_by_user_id,approved_at,activated_at,
    invitation_state,invitation_started_at,invited_at,created_at,updated_at)
    VALUES($1,$2,'active',$3,NOW(),NOW(),'sent',NOW(),NOW(),NOW(),NOW())`,[appUser,patientId,staff]);
  }
  assert.equal((await createPatientAccountRepository(pool).getByUserId(userA))?.patientId,patientA);
  assert.equal((await createPatientAccountRepository(pool).getByUserId(userB))?.patientId,patientB);
  await assert.rejects(pool.query(`UPDATE patient_accounts SET patient_id=$1 WHERE app_user_id=$2`,[patientA,userB]));
  const grants=await pool.query<{role:string;code:string}>(`SELECT r.code AS role,p.code FROM role_permissions rp
    JOIN roles r ON r.id=rp.role_id JOIN permissions p ON p.id=rp.permission_id
    WHERE p.code IN ('portal.profile.update','treatment.publish') ORDER BY r.code,p.code`);
  assert.deepEqual(grants.rows,[{role:"DENTIST",code:"treatment.publish"},{role:"PATIENT",code:"portal.profile.update"}]);
  const rls=await pool.query<{relname:string;relrowsecurity:boolean}>(`SELECT relname,relrowsecurity FROM pg_class
   WHERE relname IN ('patient_accounts','patient_appointment_requests','patient_appointment_creation_keys') ORDER BY relname`);
  assert.equal(rls.rows.length,3);
  assert.ok(rls.rows.every(row=>row.relrowsecurity));
  const cols=await pool.query<{column_default:string|null}>(`SELECT column_default FROM information_schema.columns
    WHERE table_name='treatments' AND column_name='patient_visible'`);
  assert.equal(cols.rows.length,1);
  assert.match(cols.rows[0]?.column_default??"",/false/i);
  await pool.query(`INSERT INTO appointments(id,patient_id,branch_id,appointment_date,appointment_time,
    status,created_at,updated_at) VALUES($1,$2,$3,'2099-06-01','11:00','confirmed',NOW(),NOW())`,[appt,patientA,branch]);
  await pool.query(`INSERT INTO patient_appointment_requests(id,patient_id,appointment_id,requested_by_user_id,
   request_type,status,idempotency_key,request_fingerprint,created_at)
   VALUES($1,$2,$3,$4,'cancel','pending',$5,'hash-test',NOW())`,[first,patientA,appt,userA,authA]);
  await assert.rejects(pool.query(`INSERT INTO patient_appointment_requests(id,patient_id,appointment_id,requested_by_user_id,
   request_type,status,idempotency_key,request_fingerprint,created_at)
   VALUES($1,$2,$3,$4,'cancel','pending',$5,'hash-test-2',NOW())`,[second,patientA,appt,userA,authB]));
  const changes=await pool.query<{status:string}>("SELECT status FROM appointments WHERE id=$1",[appt]);
  assert.equal(changes.rows[0]?.status,"confirmed");
 }finally{
  await clear();
  await pool.shutdown();
 }
});
