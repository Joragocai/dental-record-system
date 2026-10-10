import assert from "node:assert/strict";
import test from "node:test";
import { projectDashboardContext } from "./dashboardContext.js";
import type { AuthorizationContext } from "../services/authorizationService.js";

function context(overrides: Partial<AuthorizationContext> = {}): AuthorizationContext {
  return {
    userId: "10000000-0000-4000-8000-000000000001",
    authUserId: "10000000-0000-4000-8000-000000000002",
    email: "fictional@example.test",
    displayName: "Fictional User",
    status: "active",
    roles: ["PERSONNEL"],
    branchIds: ["10000000-0000-4000-8000-000000000003"],
    permissions: [{ code: "appointment.list", scope: "BRANCH" }],
    ...overrides
  };
}

test("branch access requires assigned branch and exact permitted grant", () => {
  assert.deepEqual(projectDashboardContext(context()).links.map((l) => l.key), ["personnel-dashboard", "appointments"]);
  assert.deepEqual(projectDashboardContext(context({ branchIds: [] })).links, []);
  assert.deepEqual(projectDashboardContext(context({ permissions: [] })).links, []);
  assert.deepEqual(projectDashboardContext(context({ permissions: [{ code: "appointment.list", scope: "OWN" }] })).links, []);
});

test("patient-request review shortcut matches actual cancel/reschedule authorization", () => {
  const cancellation = context({ permissions: [{ code: "appointment.cancel", scope: "BRANCH" }] });
  assert.deepEqual(projectDashboardContext(cancellation).links.map((link) => link.key), ["clinic-patient-requests"]);
  const reschedule = context({ permissions: [{ code: "appointment.reschedule", scope: "BRANCH" }] });
  assert.deepEqual(projectDashboardContext(reschedule).links.map((link) => link.key), ["clinic-patient-requests"]);
  assert.deepEqual(projectDashboardContext(context({ permissions: [{ code: "appointment.confirm", scope: "BRANCH" }] })).links, []);
  assert.deepEqual(projectDashboardContext(context({ branchIds: [], permissions: cancellation.permissions })).links, []);
  assert.deepEqual(projectDashboardContext(context({ roles: ["CLINIC_ADMINISTRATOR"], permissions: cancellation.permissions })).links, []);
  assert.deepEqual(projectDashboardContext(context({ permissions: [{ code: "appointment.cancel", scope: "GLOBAL" }] })).links, []);
});

test("Personnel finance/action capabilities require exact branch grants", () => {
  const branchGrants = context({ permissions: [
    { code: "appointment.list", scope: "BRANCH" },
    { code: "appointment.patient_lookup", scope: "BRANCH" },
    { code: "appointment.cancel", scope: "BRANCH" },
    { code: "finance.daily.read", scope: "BRANCH" },
    { code: "finance.receivables.read", scope: "BRANCH" },
    { code: "finance.expense.create", scope: "BRANCH" }
  ] });
  assert.deepEqual(projectDashboardContext(branchGrants).personnel, {
    patientLookup: true, requestReview: true, dailyFinanceRead: true,
    receivablesRead: true, expenseCreate: true
  });
  assert.deepEqual(projectDashboardContext(context({ ...branchGrants, branchIds: [] })).personnel, {
    patientLookup: false, requestReview: false, dailyFinanceRead: false,
    receivablesRead: false, expenseCreate: false
  });
  const globalOnly = context({ permissions: [
    { code: "appointment.patient_lookup", scope: "GLOBAL" },
    { code: "finance.daily.read", scope: "GLOBAL" },
    { code: "finance.receivables.read", scope: "GLOBAL" },
    { code: "finance.expense.create", scope: "GLOBAL" }
  ] });
  assert.deepEqual(projectDashboardContext(globalOnly).personnel, {
    patientLookup: false, requestReview: false, dailyFinanceRead: false,
    receivablesRead: false, expenseCreate: false
  });
  assert.equal(projectDashboardContext(context({
    ...branchGrants, roles: ["SYSTEM_ADMINISTRATOR"]
  })).personnel, undefined);
  assert.equal(projectDashboardContext(context({
    ...branchGrants, roles: ["CLINIC_ADMINISTRATOR"]
  })).personnel, undefined);
});

test("patient OWN projection does not expose clinic shortcuts", () => {
  const projected = projectDashboardContext(context({
    roles: ["PATIENT"], branchIds: [],
    permissions: [{ code: "portal.profile.read", scope: "OWN" }, { code: "portal.balance.read", scope: "OWN" }]
  }));
  assert.deepEqual(projected.links.map((l) => l.key), ["patient-portal", "patient-finance"]);
  assert.deepEqual(projected.branchIds, []);
});

test("Patient dashboard never projects OWN navigation to mixed-role accounts", () => {
 const granted: AuthorizationContext["permissions"] = [
  { code:"portal.profile.read", scope:"OWN" },
  { code:"portal.balance.read", scope:"OWN" },
  { code:"appointment.list", scope:"BRANCH" }
 ];
 const safe=projectDashboardContext(context({roles:["PATIENT"],branchIds:[],permissions:granted}));
 assert.deepEqual(safe.links.map(x=>x.key),["patient-portal","patient-finance"]);
 for(const roles of [["PATIENT","DENTIST"],["PATIENT","CLINIC_ADMINISTRATOR"]] as AuthorizationContext["roles"][]){
  assert.throws(()=>projectDashboardContext(context({roles,branchIds:["10000000-0000-4000-8000-000000000003"],permissions:granted})));
 }
});
test("admin does not inherit dentist authority and technical-only role has no clinic links", () => {
  const administrator = projectDashboardContext(context({
    roles: ["CLINIC_ADMINISTRATOR"], branchIds: [],
    permissions: [{ code: "finance.admin.read", scope: "GLOBAL" }]
  }));
  assert.deepEqual(administrator.links.map(link=>link.key), ["clinic-administrator-dashboard"]);
  assert.equal(administrator.dentist, undefined);
  assert.equal(administrator.personnel, undefined);
  assert.deepEqual(projectDashboardContext(context({
    roles: ["SYSTEM_ADMINISTRATOR"], branchIds: [],
    permissions: [{ code: "user.read", scope: "GLOBAL" }, { code: "role_definition.configure", scope: "GLOBAL" }]
  })).links.map(link=>link.key), ["system-administrator-dashboard"]);
});

test("owner-dentist union honors each explicitly granted permission", () => {
  const projected = projectDashboardContext(context({
    roles: ["DENTIST", "CLINIC_ADMINISTRATOR"],
    permissions: [{ code: "appointment.list", scope: "BRANCH" }, { code: "finance.daily.read", scope: "BRANCH" }]
  }));
  assert.deepEqual(projected.links.map((l) => l.key), ["dentist-dashboard", "appointments", "clinic-finance"]);
  assert.deepEqual(projected.roles, ["CLINIC_ADMINISTRATOR", "DENTIST"]);
});

test("admin-only and technical roles never receive clinic shortcuts via unrelated grants", () => {
  const overGranted = context({ permissions: [
    { code: "appointment.list", scope: "BRANCH" },
    { code: "finance.daily.read", scope: "BRANCH" },
    { code: "finance.daily.read", scope: "GLOBAL" }
  ] });
  assert.deepEqual(projectDashboardContext(context({
    ...overGranted, roles: ["CLINIC_ADMINISTRATOR"]
  })).links, []);
  assert.deepEqual(projectDashboardContext(context({
    ...overGranted, roles: ["SYSTEM_ADMINISTRATOR", "PERSONNEL"]
  })).links, []);
  assert.equal(projectDashboardContext(context({
    ...overGranted, roles: ["SYSTEM_ADMINISTRATOR", "PERSONNEL"]
  })).personnel, undefined);
  assert.deepEqual(projectDashboardContext(context({
    roles: ["DENTIST", "CLINIC_ADMINISTRATOR"],
    permissions: [{ code: "finance.daily.read", scope: "GLOBAL" }]
  })).links, []);
});

test("Dentist workspace and publication capabilities require exact dentist role and branch grants", () => {
  const permissions: AuthorizationContext["permissions"] = [
    { code: "appointment.list", scope: "BRANCH" },
    { code: "appointment.patient_lookup", scope: "BRANCH" },
    { code: "treatment.publish", scope: "BRANCH" },
    { code: "attachment.update", scope: "BRANCH" },
    { code: "appointment.reschedule", scope: "BRANCH" }
  ];
  const dentist = projectDashboardContext(context({roles:["DENTIST"],permissions}));
  assert.deepEqual(dentist.dentist, {
    userId: context().userId,
    patientLookup: true,
    requestReview: true,
    treatmentPublish: true,
    documentVisibility: true
  });
  assert.equal(dentist.links.some((item) => item.key === "dentist-dashboard"), true);
  assert.equal(dentist.personnel, undefined);
  assert.equal(projectDashboardContext(context({roles:["DENTIST"], branchIds:[], permissions})).links.some((item)=>item.key === "dentist-dashboard"), false);
  assert.equal(projectDashboardContext(context({roles:["DENTIST"],permissions:[
    {code:"appointment.list",scope:"GLOBAL"}]})).links.some((item)=>item.key === "dentist-dashboard"), false);
  assert.equal(projectDashboardContext(context({roles:["PERSONNEL"],permissions})).dentist, undefined);
  assert.equal(projectDashboardContext(context({roles:["CLINIC_ADMINISTRATOR"],permissions})).dentist, undefined);
  const technical = projectDashboardContext(context({roles:["SYSTEM_ADMINISTRATOR","DENTIST"],permissions}));
  assert.equal(technical.dentist, undefined);
  assert.deepEqual(technical.links, []);
});
test("Dentist and Clinic Administrator union never becomes a sixth role", () => {
  const union = projectDashboardContext(context({roles:["DENTIST","CLINIC_ADMINISTRATOR"],permissions:[
    {code:"appointment.list",scope:"BRANCH"},
    {code:"treatment.publish",scope:"BRANCH"},
    {code:"finance.admin.read",scope:"GLOBAL"}
  ]}));
  assert.deepEqual(union.roles, ["CLINIC_ADMINISTRATOR","DENTIST"]);
  assert.equal(union.dentist?.treatmentPublish, true);
  assert.equal(union.dentist?.userId, context().userId);
  assert.equal(union.links.some((item) => item.key === "dentist-dashboard"), true);
  assert.equal(union.links.some((item) => item.key === "personnel-dashboard"), false);
});
test("Clinic Administrator dashboard grants are GLOBAL and never imply Dentist clinical privileges", () => {
  const grants: AuthorizationContext["permissions"] = [
    {code:"audit.read",scope:"GLOBAL"},
    {code:"staff_account.create",scope:"GLOBAL"},
    {code:"role_assignment.approve",scope:"GLOBAL"},
    {code:"finance.admin.read",scope:"GLOBAL"},
    {code:"finance.expense.approve",scope:"GLOBAL"},
    {code:"finance.payable.approve",scope:"GLOBAL"},
    {code:"finance.closing.approve",scope:"GLOBAL"}
  ];
  const onlyAdmin=projectDashboardContext(context({roles:["CLINIC_ADMINISTRATOR"],branchIds:[],permissions:grants}));
  assert.deepEqual(onlyAdmin.links.map(link=>link.key),["clinic-administrator-dashboard"]);
  assert.deepEqual(onlyAdmin.clinicAdministrator,{
    auditRead:true,staffCreate:true,roleApprove:true,financialOversight:true,
    expenseApprove:true,payableApprove:true,closingApprove:true
  });
  assert.equal(onlyAdmin.dentist,undefined);
  const limited=projectDashboardContext(context({roles:["CLINIC_ADMINISTRATOR"],permissions:[
    {code:"finance.expense.approve",scope:"GLOBAL"}]}));
  assert.deepEqual(limited.links.map(link=>link.key),["clinic-administrator-dashboard"]);
  assert.equal(limited.clinicAdministrator?.auditRead,false);
  const wrongScope=projectDashboardContext(context({roles:["CLINIC_ADMINISTRATOR"],permissions:[
    {code:"audit.read",scope:"BRANCH"}]}));
  assert.deepEqual(wrongScope.links,[]);
  const technical=projectDashboardContext(context({roles:["SYSTEM_ADMINISTRATOR","CLINIC_ADMINISTRATOR"],permissions:grants}));
  assert.deepEqual(technical.links,[]);
  assert.equal(technical.clinicAdministrator,undefined);
  const combined=projectDashboardContext(context({roles:["DENTIST","CLINIC_ADMINISTRATOR"],permissions:[
    ...grants,{code:"appointment.list",scope:"BRANCH"}]}));
  assert.equal(combined.links.some(link=>link.key==="clinic-administrator-dashboard"),true);
  assert.equal(combined.links.some(link=>link.key==="dentist-dashboard"),true);
  assert.deepEqual(combined.roles,["CLINIC_ADMINISTRATOR","DENTIST"]);
});
test("technical-only dashboard projection never inherits clinical or financial privileges", () => {
  const technical = projectDashboardContext(context({
    roles: ["SYSTEM_ADMINISTRATOR"], branchIds: [],
    permissions: [
      {code:"user.read",scope:"GLOBAL"},
      {code:"role_definition.configure",scope:"GLOBAL"},
      {code:"appointment.list",scope:"BRANCH"},
      {code:"finance.daily.read",scope:"BRANCH"}
    ]
  }));
  assert.deepEqual(technical.links.map(link=>link.key), ["system-administrator-dashboard"]);
  assert.deepEqual(technical.systemAdministrator,{technicalAccountRead:true,roleDefinitionsConfigure:true});
  assert.equal(technical.personnel,undefined);
  assert.equal(technical.dentist,undefined);
  assert.equal(technical.clinicAdministrator,undefined);
  const accidentallyAssigned=projectDashboardContext(context({
    roles:["SYSTEM_ADMINISTRATOR"],
    branchIds:["10000000-0000-4000-8000-000000000003"],
    permissions:[{code:"user.read",scope:"GLOBAL"}]
  }));
  assert.deepEqual(accidentallyAssigned.branchIds,[]);
  assert.deepEqual(accidentallyAssigned.links.map(link=>link.key),["system-administrator-dashboard"]);
  assert.deepEqual(projectDashboardContext(context({
    roles:["SYSTEM_ADMINISTRATOR"],permissions:[{code:"user.read",scope:"BRANCH"}]
  })).links,[]);
  assert.equal(projectDashboardContext(context({
    roles:["SYSTEM_ADMINISTRATOR","DENTIST"],
    permissions:[{code:"user.read",scope:"GLOBAL"},{code:"appointment.list",scope:"BRANCH"}]
  })).systemAdministrator,undefined);
});
test("inactive, unassigned and unexpected roles fail closed", () => {
  assert.throws(() => projectDashboardContext(context({ status: "deactivated" })));
  assert.throws(() => projectDashboardContext(context({ roles: [] })));
  assert.throws(() => projectDashboardContext(context({ roles: ["INVENTED" as AuthorizationContext["roles"][number]] })));
});
