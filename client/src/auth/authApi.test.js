import assert from "node:assert/strict";
import test from "node:test";
import { activateBackendPatientAccount, activateBackendStaffAccount, authenticatedV2Fetch, verifyBackendSession } from "./authApi.ts";

test("authenticatedV2Fetch attaches bearer token only to the explicit V2 request", async () => {
  let capturedUrl = "";
  let capturedHeaders;
  const response = await authenticatedV2Fetch(
    "/auth/session",
    { method: "GET" },
    {
      accessToken: "fictional-access-token",
      apiBaseUrl: "http://127.0.0.1:3002/api/",
      fetchImpl: async (input, init) => {
        capturedUrl = String(input);
        capturedHeaders = new Headers(init?.headers);
        return new Response(JSON.stringify({ authenticated: true, user: { id: "user-id", email: null } }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
    }
  );

  assert.equal(response.status, 200);
  assert.equal(capturedUrl, "http://127.0.0.1:3002/api/auth/session");
  assert.equal(capturedHeaders.get("authorization"), "Bearer fictional-access-token");
});

test("activateBackendStaffAccount posts only to the protected activation endpoint", async () => {
  let capturedUrl = "";
  let capturedMethod = "";
  let capturedAuthorization = "";
  await activateBackendStaffAccount({
    accessToken: "fictional-invite-token",
    apiBaseUrl: "http://127.0.0.1:3002/api",
    fetchImpl: async (input, init) => {
      capturedUrl = String(input);
      capturedMethod = String(init?.method ?? "");
      capturedAuthorization = new Headers(init?.headers).get("authorization") ?? "";
      return new Response(JSON.stringify({ activated: true }), { status: 200, headers: { "content-type": "application/json" } });
    }
  });
  assert.equal(capturedUrl, "http://127.0.0.1:3002/api/staff-accounts/activate");
  assert.equal(capturedMethod, "POST");
  assert.equal(capturedAuthorization, "Bearer fictional-invite-token");
});

test("patient account activation sends only a bearer-authenticated backend request",async()=>{
 let url="";let token="";
 await activateBackendPatientAccount({
  accessToken:"fictional-patient-token",
  apiBaseUrl:"http://127.0.0.1:3002/api",
  fetchImpl:async(input,init)=>{
   url=String(input);token=new Headers(init?.headers).get("authorization")??"";
   return new Response(JSON.stringify({activated:true}),{status:200});
  }
 });
 assert.equal(url,"http://127.0.0.1:3002/api/patient-portal/activate");
 assert.equal(token,"Bearer fictional-patient-token");
});
test("verifyBackendSession maps only the minimal verified backend identity", async () => {
  const identity = await verifyBackendSession({
    accessToken: "fictional-access-token",
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          authenticated: true,
          user: { id: "22222222-2222-4222-8222-222222222222", email: "staff@example.test", role: "ignored" }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
  });

  assert.deepEqual(identity, {
    id: "22222222-2222-4222-8222-222222222222",
    email: "staff@example.test"
  });
});

test("verifyBackendSession rejects invalid sessions without exposing the bearer token", async () => {
  await assert.rejects(
    verifyBackendSession({
      accessToken: "super-secret-token",
      fetchImpl: async () => new Response(JSON.stringify({ message: "invalid super-secret-token" }), { status: 401 })
    }),
    (error) => {
      assert.match(error.message, /no longer valid/i);
      assert.doesNotMatch(error.message, /super-secret-token/);
      return true;
    }
  );
});
