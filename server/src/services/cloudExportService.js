import ExcelJS from "exceljs";
import { listPostgresPatients, getPostgresPatient } from "../db/postgres/patients.js";
import { listPostgresTreatments } from "../db/postgres/treatments.js";
import { listPostgresAttachments } from "../db/postgres/attachments.js";

const columns = {
  patients: [
    ["Patient ID","patient_id"],["Date Registered","date_registered"],["Last Name","last_name"],
    ["First Name","first_name"],["Middle Name","middle_name"],["Birthday","birthday"],
    ["Gender","gender"],["Mobile Number","mobile_number"],["Branch","branch_location"],
    ["Medical Alert","medical_alert_summary"]
  ],
  treatments: [
    ["Treatment ID","treatment_id"],["Patient ID","patient_id"],["Treatment Date","treatment_date"],
    ["Procedure","procedure"],["Dentist","dentists"],["Amount Charged","amount_charged"],
    ["Net Amount Due","net_amount_due"],["Amount Paid","amount_paid"],["Balance","balance"],
    ["Remarks","remarks"]
  ],
  attachments: [
    ["Patient ID","patient_id"],["Treatment ID","treatment_id"],["Category","attachment_type"],
    ["Filename","original_filename"],["Content Type","mime_type"],["Uploaded At","uploaded_at"]
  ]
};
function addSheet(workbook, name, records, fields) {
  const sheet = workbook.addWorksheet(name);
  sheet.columns = fields.map(([header,key])=>({header,key,width:Math.min(45,Math.max(16,header.length+5))}));
  sheet.getRow(1).font={bold:true};
  sheet.views=[{state:"frozen",ySplit:1}];
  for(const record of records)sheet.addRow(Object.fromEntries(fields.map(([,key])=>[key,record[key]??""])));
  sheet.autoFilter={from:"A1",to:sheet.getRow(1).getCell(fields.length).address};
}
export async function createCloudWorkbook(client, {kind,patientId}={}){
  if(!["patients","treatments","patient-treatments","full-record"].includes(kind)) {
    throw Object.assign(new Error("Unsupported export type."),{status:400});
  }
  let patients=[],treatments=[],attachments=[];
  if(patientId){
    const patient=await getPostgresPatient(client,patientId);
    if(!patient)throw Object.assign(new Error("Patient not found."),{status:404});
    patients=[patient];
    treatments=await listPostgresTreatments(client,patientId);
    attachments=await listPostgresAttachments(client,{patientId});
  } else {
    patients=await listPostgresPatients(client);
    treatments=await listPostgresTreatments(client);
  }
  const workbook=new ExcelJS.Workbook();
  workbook.creator="Dental Presentation";
  workbook.created=new Date();
  if(kind==="patients"||kind==="full-record")addSheet(workbook,"Patients",patients,columns.patients);
  if(kind!=="patients")addSheet(workbook,"Treatments",treatments,columns.treatments);
  if(kind==="full-record")addSheet(workbook,"Attachment Index",attachments,columns.attachments);
  const buffer=await workbook.xlsx.writeBuffer();
  const name=patientId?patientId.replace(/[^a-zA-Z0-9-]/g,"")+"_":"";
  return {buffer,filename:"dental_"+name+kind+"_"+new Date().toISOString().slice(0,10)+".xlsx"};
}
