import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import express from "express";
import { createDashboardV2Router } from "./roleDashboardRouter.js";
import { AuthenticationError } from "../auth/authErrors.ts";

const auth = {
  async authenticateAuthorizationHeader(header) {
    if (header !== "Bearer valid-token") throw new AuthenticationError("CREDENTIALS_MISSING");
    return { subject: "10000000-0000-4000-8000-000000000001", email: "user@example.test", provider: "supabase", audience: "authenticated" };
  }
};
function boundary({ roles = ["PERSONNEL"], branchIds = ["10000000-0000-4000-8000-000000000002"], permissions = [{ code: "appointment.list", scope: "BRANCH" }], status = "active" } = {}) {
  return {
    async resolveApplicationUser(_req, res, next) {
      if (status !== "active") return next(Object.assign(new Error("Access denied."), { status: 403 }));
      res.locals.applicationUser = { userId: "user", roles, branchIds, status, displayName: "Fictional Staff" };
      next();
    },
    async resolveAuthorization(_req, res, next) {
      res.locals.authorization = { ...res.locals.applicationUser, permissions };
      next();
    }
  };
}
async function requestWithBoundary(access, header = "Bearer valid-token", patientRepository = null) {
  const app = express();
  app.use("/api/dashboard", createDashboardV2Router(auth, access, patientRepository));
  app.use((error, _req, res, _next) => res.status(error?.status ?? 500).json({ message: "Access unavailable." }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const response = await fetch(`http://127.0.0.1:${address.port}/api/dashboard/context`, {
      headers: header ? { Authorization: header } : {}
    });
    return { status: response.status, cache: response.headers.get("cache-control"), body: await response.json() };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}
test("dashboard requires authentication and active application account", async () => {
  assert.equal((await requestWithBoundary(boundary(), "")).status, 401);
  assert.equal((await requestWithBoundary(boundary({ status: "deactivated" }))).status, 403);
});
test("dashboard returns only minimal branch-scoped navigation with no cache", async () => {
  const response = await requestWithBoundary(boundary());
  assert.equal(response.status, 200);
  assert.equal(response.cache, "no-store");
  assert.deepEqual(response.body.links, [
    { key: "personnel-dashboard", label: "Personnel workspace", path: "/personnel-dashboard" },
    { key: "appointments", label: "Clinic appointments", path: "/appointments" }
  ]);
  assert.equal(JSON.stringify(response.body).includes("email"), false);
  assert.equal(JSON.stringify(response.body).includes("permissions"), false);
});
test("technical admin has no clinical or finance navigation", async () => {
  const response = await requestWithBoundary(boundary({
    roles: ["SYSTEM_ADMINISTRATOR"], branchIds: [],
    permissions: [{ code: "user.read", scope: "GLOBAL" }]
  }));
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.links, [{key:"system-administrator-dashboard",label:"System administration",path:"/system-administrator-dashboard"}]);
  assert.equal(JSON.stringify(response.body).includes("patient"),false);
});
test("Patient dashboard links require active verified OWN identity and omit raw patient data", async () => {
 const settings={roles:["PATIENT"],branchIds:[],permissions:[
  {code:"portal.profile.read",scope:"OWN"},
  {code:"portal.appointments.request",scope:"OWN"},
  {code:"portal.balance.read",scope:"OWN"}
 ]};
 const patient={async getByUserId(){return {appUserId:"user",patientId:"10000000-0000-4000-8000-000000000003",status:"active"};}};
 const allowed=await requestWithBoundary(boundary(settings),"Bearer valid-token",patient);
 assert.equal(allowed.status,200);
 assert.deepEqual(allowed.body.links.map(x=>x.key),["patient-portal","patient-appointments","patient-finance"]);
 assert.equal(JSON.stringify(allowed.body).includes("patientId"),false);
 assert.deepEqual(allowed.body.branchIds,[]);
 for(const state of ["pending","revoked"]){
  const denied=await requestWithBoundary(boundary(settings),"Bearer valid-token",{
   async getByUserId(){return {appUserId:"user",patientId:"10000000-0000-4000-8000-000000000003",status:state};}
  });
  assert.equal(denied.status,403);
 }
});
test("Owner-Dentist HTTP context retains separate clinical and administrative links", async () => {
 const result=await requestWithBoundary(boundary({
  roles:["DENTIST","CLINIC_ADMINISTRATOR"],permissions:[
    {code:"appointment.list",scope:"BRANCH"},
    {code:"audit.read",scope:"GLOBAL"}
  ]
 }));
 assert.equal(result.status,200);
 assert.deepEqual(result.body.roles,["CLINIC_ADMINISTRATOR","DENTIST"]);
 assert.deepEqual(result.body.links.map(x=>x.key),["clinic-administrator-dashboard","dentist-dashboard","appointments"]);
 assert.equal(result.body.links.some(x=>x.key.startsWith("patient-")),false);
});
test("branch and permission revocation are reflected on the next request", async () => {
  assert.deepEqual((await requestWithBoundary(boundary({ branchIds: [] }))).body.links, []);
  assert.deepEqual((await requestWithBoundary(boundary({ permissions: [] }))).body.links, []);
});
