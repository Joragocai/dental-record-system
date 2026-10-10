import React, { useState } from "react";
import PersonnelDashboardView from "./PersonnelDashboardView.js";
import DentistDashboardView from "./DentistDashboardView.js";
import PatientPortalView from "./PatientPortalView.js";
import ClinicAdministratorDashboardView from "./ClinicAdministratorDashboardView.js";
import SystemAdministratorDashboardView from "./SystemAdministratorDashboardView.js";
import { clinicBusinessDate, validateExpenseDraft } from "../dashboard/personnelDashboardData.js";
import type { DemoRoleName } from "../dashboard/stagingDemoRoles.js";

const branch = "10000000-0000-4000-8000-000000000001";
const practitioner = "30000000-0000-4000-8000-000000000003";
const branches = [{ id: branch, branchCode: "DEMO", branchName: "Fictional Dental Clinic" }];
type Scenario = "normal" | "empty";
export default function StagingRoleWorkspacePreview({ role }: {role: DemoRoleName}) {
 const [day,setDay]=useState(clinicBusinessDate);
 const [selectedBranch,setSelectedBranch]=useState(branch);
 const [scenario,setScenario]=useState<Scenario>("normal");
 const [draft,setDraft]=useState({categoryCode:"",description:"",amount:""});
 const [message,setMessage]=useState("");
 const [patientPhone,setPatientPhone]=useState("0900 000 0000");
 const [patientAddress,setPatientAddress]=useState("Fictional Street, Antipolo City");
 const [requestDate,setRequestDate]=useState("");
 const [requestReason,setRequestReason]=useState("");
 const [simulatedRequests,setSimulatedRequests]=useState<string[]>([]);
 const [auditVisible,setAuditVisible]=useState(true);
 const header=<div className="rounded-xl border-2 border-indigo-600 bg-indigo-50 p-4">
  <p className="font-bold text-indigo-900">STAGING SIMULATION — NOT A LIVE ROLE SESSION</p>
  <p className="mt-1 text-sm text-indigo-900">Fictional data · Controls change this preview only · Nothing is saved, submitted, or sent to clinic APIs. Your real account permissions do not change.</p>
  <div className="mt-3 flex flex-wrap items-center gap-3">
   <label className="text-sm font-medium">Test scenario <select aria-label="Simulation scenario" className="ml-2 rounded border bg-white p-2" value={scenario} onChange={event=>{setScenario(event.target.value as Scenario);setMessage("");}}><option value="normal">Populated fictional records</option><option value="empty">Empty state</option></select></label>
   {message&&<span role="status" className="rounded bg-white px-3 py-2 text-sm">{message}</span>}
  </div>
 </div>;
 const simulatedLinks=<p className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm">Dashboard navigation here is contained inside the preview. Open approved live modules outside the switcher to test real API workflows with your assigned permissions.</p>;
 const value=scenario==="normal";
 let display;
 if(role==="Personnel"){
  display=<PersonnelDashboardView access={{branchIds:[branch],patientLookup:true,requestReview:true,dailyFinanceRead:true,receivablesRead:true,expenseCreate:true}} branches={branches} branchId={selectedBranch} businessDate={day}
   snapshot={selectedBranch===branch&&value?{appointments:{confirmed:4,checkedIn:1,unconfirmed:2},pending:{count:2,limitReached:false},finance:{cashCollected:"3500.00",digitalCollected:"1800.00",outstandingReceivables:"750.00"}}:null}
   verifying={false} refreshing={false} notice="" expenseDraft={draft} expenseSaving={false} expenseNotice={message}
   setBranch={setSelectedBranch} setBusinessDate={setDay} setExpenseDraft={setDraft}
   submitExpense={()=>setMessage(validateExpenseDraft(draft)?"Fictional pending expense created in preview only.":"Please enter a valid category, description and amount.")}/>;
 }else if(role==="Dentist"){
  display=<DentistDashboardView access={{selfUserId:practitioner,branchIds:[branch],patientLookup:true,requestReview:true,treatmentPublish:true,documentVisibility:true}} branches={branches} branchId={selectedBranch} businessDate={day}
   summary={selectedBranch===branch&&value?{confirmed:4,checkedIn:1,inProgress:2,completed:3,pendingConfirmation:1,nextSlot:{time:"10:30",status:"confirmed"},upcomingSlots:[{time:"10:30",status:"confirmed"},{time:"14:00",status:"checked_in"}]}:null}
   verifying={false} loading={false} notice="" setBranch={setSelectedBranch} setBusinessDate={setDay}/>;
 }else if(role==="Patient"){
  display=<>
   <PatientPortalView profile={value?{patientCode:"DEMO-2026-0001",firstName:"Daniel",lastName:"Cruz",mobileNumber:patientPhone,homeAddress:patientAddress}:null}
    treatments={value?[{code:"DEMO-T01",date:day,summary:"Fictional routine checkup"}]:[]}
    appointments={value?[{id:"demo-appointment-1",date:day,time:"10:00",status:"confirmed",branchName:"Fictional Dental Clinic"}]:[]}
    busy={false} error="" phone={patientPhone} address={patientAddress}
    setPhone={setPatientPhone} setAddress={setPatientAddress}
    save={()=>setMessage("Fictional contact update previewed. No patient record was changed.")}/>
   <section className="space-y-3 rounded-xl bg-white p-5"><h3 className="font-semibold">Simulate an appointment request</h3>
    <form className="space-y-3" onSubmit={e=>{e.preventDefault();setSimulatedRequests(items=>[...items,`${requestDate}: ${requestReason||"Checkup"}`]);setMessage("Fictional appointment request recorded in preview only.");}}>
     <label className="block">Preferred date<input required type="date" className="text-input" value={requestDate} onChange={e=>setRequestDate(e.target.value)}/></label>
     <label className="block">Reason<input maxLength={200} className="text-input" value={requestReason} onChange={e=>setRequestReason(e.target.value)}/></label>
     <button className="button-primary" type="submit">Simulate appointment request</button>
    </form>
    <ul>{simulatedRequests.map((request,index)=><li key={index} className="border-t py-2 text-sm">{request} · Simulated only</li>)}</ul>
   </section>
  </>;
 }else if(role==="Clinic Administrator"){
  display=<>
   <ClinicAdministratorDashboardView access={{auditRead:true,staffCreate:true,roleApprove:true,financialOversight:true,expenseApprove:true,payableApprove:true,closingApprove:true}}
    activity={auditVisible&&value?[{action:"FICTIONAL_APPOINTMENT_REVIEW",outcome:"SUCCESS",occurredAt:"2026-10-10T08:00:00.000Z"}]:[]}
    loading={false} message=""/>
   <button className="button-secondary" type="button" onClick={()=>setAuditVisible(v=>!v)}>{auditVisible?"Hide":"Show"} fictional audit entry</button>
  </>;
 }else if(role==="System Administrator"){
  display=<SystemAdministratorDashboardView access={{technicalAccountRead:true,roleDefinitionsConfigure:true}}
   status={{api:"reachable",readiness:value?"ready":"unavailable"}} busy={false} error=""/>;
 }else{
  display=<div className="space-y-5"><header className="rounded-xl bg-white p-5"><h2 className="text-2xl font-bold">Owner-Dentist dashboard</h2><p>One fictional identity, with independent clinical and business workspaces.</p></header>
   <DentistDashboardView access={{selfUserId:practitioner,branchIds:[branch],patientLookup:true,requestReview:true,treatmentPublish:true,documentVisibility:true}} branches={branches} branchId={selectedBranch} businessDate={day}
    summary={value?{confirmed:4,checkedIn:1,inProgress:2,completed:3,pendingConfirmation:1,nextSlot:{time:"10:30",status:"confirmed"},upcomingSlots:[{time:"10:30",status:"confirmed"}]}:null}
    verifying={false} loading={false} notice="" setBranch={setSelectedBranch} setBusinessDate={setDay}/>
   <ClinicAdministratorDashboardView access={{auditRead:true,staffCreate:true,roleApprove:true,financialOversight:true,expenseApprove:true,payableApprove:true,closingApprove:true}}
    activity={value?[{action:"FICTIONAL_APPOINTMENT_REVIEW",outcome:"SUCCESS",occurredAt:"2026-10-10T08:00:00.000Z"}]:[]}
    loading={false} message=""/>
  </div>;
 }
 return <section className="space-y-3">{header}<div className="overflow-hidden rounded-xl border border-slate-200" onClickCapture={event=>{const target=event.target;if(target instanceof Element&&target.closest("a")){event.preventDefault();event.stopPropagation();setMessage("Navigation is disabled within this fictional preview. Open live modules using your authorized dashboard shortcuts.");}}}>{display}</div>{simulatedLinks}</section>;
}
