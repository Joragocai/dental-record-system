import { createServer } from "node:http";
import { createCloudApp } from "./cloudApp.js";
import { getPostgresPool } from "./db/postgres/pool.js";
import { verifyPostgresMigrations } from "./db/postgres/verifyMigrations.js";
import { getSupabaseAuthConfig } from "./auth/supabaseAuth.js";

// Separate entry point; does not initialize SQLite, legacy backups, uploads,
// or unauthenticated Socket.IO. Hosted deployment must use this entry point.
const config=getSupabaseAuthConfig();
const origins=String(process.env.CLOUD_ALLOWED_ORIGINS||"").split(",").map(s=>s.trim()).filter(Boolean);
const port=Number(process.env.PORT||3002);
if(!Number.isInteger(port)||port<1||port>65535)throw new Error("Invalid PORT.");
const pool=await getPostgresPool();
await pool.query("SELECT 1");
await verifyPostgresMigrations(pool);
const app=createCloudApp({config,pool,origins});
const server=createServer(app);
server.listen(port,"0.0.0.0",()=>console.log(`Cloud dental API listening on port ${port}`));
for(const signal of ["SIGTERM","SIGINT"])process.once(signal,()=>{
 server.close(()=>pool.end().finally(()=>process.exit(0)));
});
