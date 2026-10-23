import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";

// Dedicated local PostgreSQL preview. Never reads from the remote DATABASE_URL
// for clinical data; keeps the SQLite demo on :3002/:5173 untouched.
const local = parseEnv(await readFile(new URL("../.env", import.meta.url), "utf8"));
const cloud = parseEnv(await readFile(new URL("../.env.local", import.meta.url), "utf8"));
const database = new URL(local.DATABASE_URL || "");
if (database.hostname !== "127.0.0.1" || database.pathname !== "/dental_presentation_test") {
  throw new Error("Local database credentials must originate from isolated dental_presentation_test.");
}
database.pathname = "/dental_presentation_local";
if (!cloud.SUPABASE_URL || !cloud.SUPABASE_ALLOWED_USER_ID) {
  throw new Error("Supabase Auth settings are missing from server/.env.local.");
}
const serverEnv = {
  ...process.env,
  ...cloud,
  DATABASE_URL: database.href,
  NODE_ENV: "development",
  PG_SSL_MODE: "disable",
  PORT: "3003",
  CLOUD_ALLOWED_ORIGINS: "http://127.0.0.1:5174,http://localhost:5174",
  CLOUD_DEMO_ENABLED: "true",
  CLOUD_DEMO_ENVIRONMENT: "dental-presentation-demo",
  CLOUD_DEMO_PROJECT_REF: "local-preview",
  CLOUD_LOCAL_PREVIEW: "true",
  CLOUD_DEMO_LOCAL_TEST: "false"
};
const frontendEnv = {
  ...process.env,
  VITE_API_BASE_URL: "http://127.0.0.1:3003/api"
};
const exec = process.platform === "win32" ? "npm.cmd" : "npm";
const processes = [];
function start(label,args,env){
  const child=spawn(exec,args,{env,stdio:"inherit"});
  processes.push(child);
  child.once("exit",(code)=>{
    if(!exiting){console.error(label+" stopped unexpectedly (code "+code+").");shutdown();}
  });
  return child;
}
let exiting=false;
function shutdown(){
  if(exiting)return;
  exiting=true;
  for(const child of processes)if(!child.killed)child.kill("SIGTERM");
}
process.on("SIGTERM",shutdown);
process.on("SIGINT",shutdown);
start("PostgreSQL API",["run","start:cloud","--workspace","server"],serverEnv);
start("PostgreSQL frontend",["run","dev","--workspace","client","--","--host","127.0.0.1","--port","5174","--strictPort"],frontendEnv);
