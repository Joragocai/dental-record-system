import React from "react";
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import DentistDashboardView, { type DentistDashboardViewProps } from "../pages/DentistDashboardView.js";

const branch="10000000-0000-4000-8000-000000000001";
const defaults: DentistDashboardViewProps = {
  access: null, branches:[],branchId:"",businessDate:"2026-10-10",
  summary:null,verifying:false,loading:false,notice:"",
  setBranch(){},setBusinessDate(){}
};
const role: NonNullable<DentistDashboardViewProps["access"]> = {
  selfUserId:"30000000-0000-4000-8000-000000000003",
  branchIds:[branch],patientLookup:true,requestReview:true,
  treatmentPublish:true,documentVisibility:true
};
function html(props: Partial<DentistDashboardViewProps> = {}) {
  return renderToStaticMarkup(<MemoryRouter><DentistDashboardView {...defaults} {...props}/></MemoryRouter>);
}
test("unauthorized Dentist dashboard shows no patient or clinical workflow",()=>{
  const rendered=html();
  assert.match(rendered,/Dentist dashboard access is unavailable/);
  assert.doesNotMatch(rendered,/Review appointment change requests|Confirmed|Treatment summary publication requires/);
});
test("valid Dentist workspace renders explicit branch selection but no invented totals",()=>{
  const rendered=html({access:role,branches:[{id:branch,branchCode:"TEST",branchName:"Fictional Branch"}]});
  assert.match(rendered,/Fictional Branch/);
  assert.doesNotMatch(rendered,/Next timed appointment on selected date|Awaiting confirmation/);
  assert.match(rendered,/Treatment summary publication requires an approved V2 clinical-record editor/);
  assert.doesNotMatch(rendered,/medical-alert\:/i);
});
test("Dentist view only renders safe time and status, not patient data",()=>{
  const rendered=html({
    access:role,branchId:branch,
    branches:[{id:branch,branchCode:"TEST",branchName:"Fictional Branch"}],
    summary:{confirmed:2,checkedIn:1,inProgress:0,completed:0,pendingConfirmation:1,
      nextSlot:{time:"10:00",status:"confirmed"},upcomingSlots:[{time:"10:00",status:"confirmed"}]}
  });
  assert.match(rendered,/10:00/);
  assert.match(rendered,/Confirmed/);
  assert.doesNotMatch(rendered,/patientDisplayName|patientMobileNumber|clinical notes:/);
});
test("Dentist publication controls remain unavailable if no approved record workflow",()=>{
  const rendered=html({access:{...role,treatmentPublish:false,documentVisibility:false}});
  assert.doesNotMatch(rendered,/Treatment summary publication requires an approved/);
  assert.doesNotMatch(rendered,/Document visibility changes require an approved/);
});
