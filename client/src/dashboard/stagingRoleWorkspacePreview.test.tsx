import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import StagingRoleWorkspacePreview from "../pages/StagingRoleWorkspacePreview.js";
import { demoRoleNames } from "./stagingDemoRoles.js";

for (const role of demoRoleNames) {
 test(`staging preview renders actual ${role} workspace controls without transmitting any backend request`, () => {
  const html=renderToStaticMarkup(<MemoryRouter><StagingRoleWorkspacePreview role={role}/></MemoryRouter>);
  assert.match(html,/STAGING SIMULATION/);
  assert.match(html,/Fictional data/);
  assert.match(html,/not a live role session|NOT A LIVE ROLE SESSION/i);
  assert.doesNotMatch(html,/johnraven.fourth@gmail.com|SUPABASE_SECRET_KEY|Bearer /i);
  assert.doesNotMatch(html,/<script/i);
  if (role==="Personnel"||role==="Dentist") assert.match(html,/Fictional Dental Clinic/);
  if (role==="Patient") assert.match(html,/Simulate an appointment request/);
  if (role==="System Administrator") assert.match(html,/Technical-only monitoring/);
 }
 );
}
