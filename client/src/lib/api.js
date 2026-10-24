import axios from "axios";
import { cloudAuthEnabled, getCloudAccessToken } from "./cloudAuth";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:3002/api",
});

api.interceptors.request.use(async (config) => {
  if (cloudAuthEnabled) {
    const token = await getCloudAccessToken();
    if (!token) throw new Error("Sign in to access the dental system.");
    config.headers.set("Authorization", `Bearer ${token}`);
  }
  return config;
});

export async function getBalancesReport() {
  const { data } = await api.get("/balances");
  return data;
}

export async function getPatientFinancialSummary(patientId) {
  const { data } = await api.get(`/balances/patients/${patientId}`);
  return data;
}

export async function getTreatmentPayments(treatmentId) {
  const { data } = await api.get(`/treatments/${treatmentId}/payments`);
  return data;
}

export async function recordTreatmentPayment(treatmentId, payload) {
  const { data } = await api.post(`/treatments/${treatmentId}/payments`, payload);
  return data;
}

export async function reverseTreatmentPayment(treatmentId, paymentId, payload) {
  const { data } = await api.post(`/treatments/${treatmentId}/payments/${paymentId}/reverse`, payload);
  return data;
}

export async function getDashboardSummary() {
  const { data } = await api.get("/dashboard/summary");
  return data;
}

export async function getDashboardTodaySummary() {
  const { data } = await api.get("/dashboard/today-summary");
  return data;
}

export async function getDashboardSchedule() {
  const { data } = await api.get("/dashboard/schedule");
  return data;
}

export async function getDashboardScheduleByDate(date, expanded = false) {
  const { data } = await api.get("/dashboard/schedule-by-date", { params: { date, ...(expanded ? { expanded: "true" } : {}) } });
  return data;
}

export async function searchPatients(query) {
  const { data } = await api.get("/patients/search", { params: { q: query } });
  return data;
}

export async function listPatients() {
  const { data } = await api.get("/patients");
  return data;
}

export async function getNextPatientId() {
  const { data } = await api.get("/patients/next-id");
  return data;
}

export async function getPatient(patientId) {
  const { data } = await api.get(`/patients/${patientId}`);
  return data;
}

export async function createPatient(payload) {
  const { data } = await api.post("/patients", payload);
  return data;
}

export async function updatePatient(patientId, payload) {
  const { data } = await api.put(`/patients/${patientId}`, payload);
  return data;
}

export async function getTreatmentFollowup(treatmentId) {
  const { data } = await api.get(`/treatments/${encodeURIComponent(treatmentId)}/follow-up`);
  return data;
}

export async function getTreatment(treatmentId) {
  const { data } = await api.get(`/treatments/${treatmentId}`);
  return data;
}

export async function getNextTreatmentId() {
  const { data } = await api.get("/treatments/next-id");
  return data;
}

export async function createTreatment(payload) {
  const { data } = await api.post("/treatments", payload);
  return data;
}

export async function updateTreatment(treatmentId, payload) {
  const { data } = await api.put(`/treatments/${treatmentId}`, payload);
  return data;
}

export async function getTreatmentsByPatient(patientId) {
  const { data } = await api.get(`/patients/${patientId}/treatments`);
  return data;
}

export async function getPatientAttachments(patientId) {
  const { data } = await api.get(`/patients/${patientId}/attachments`);
  return data;
}

export async function getTreatmentAttachments(treatmentId) {
  const { data } = await api.get(`/treatments/${treatmentId}/attachments`);
  return data;
}

export async function getPatientAppointments(patientId) {
  const { data } = await api.get(`/patients/${patientId}/appointments`);
  return data;
}

export async function createPatientAppointment(patientId, payload) {
  const { data } = await api.post(`/patients/${patientId}/appointments`, payload);
  return data;
}

export async function getAppointment(appointmentId) {
  const { data } = await api.get(`/appointments/${appointmentId}`);
  return data;
}

export async function updateAppointment(appointmentId, payload) {
  const { data } = await api.patch(`/appointments/${appointmentId}`, payload);
  return data;
}

export async function updateAppointmentStatus(appointmentId, status) {
  const { data } = await api.patch(`/appointments/${appointmentId}/status`, { status });
  return data;
}

export async function uploadAttachment(formData) {
  const { data } = await api.post("/attachments", formData, {
    headers: {
      "Content-Type": "multipart/form-data"
    }
  });
  return data;
}

export async function uploadTreatmentAttachment(treatmentId, formData) {
  const { data } = await api.post(`/treatments/${treatmentId}/attachments`, formData, {
    headers: {
      "Content-Type": "multipart/form-data"
    }
  });
  return data;
}

export async function deleteAttachment(attachmentId) {
  const { data } = await api.delete(`/attachments/${attachmentId}`);
  return data;
}

// Cloud files are never exposed as public URLs. The request interceptor supplies
// the verified Supabase access token, including for image previews and downloads.
export async function getPrivateAttachmentPreview(attachmentId, { signal } = {}) {
  if (!cloudAuthEnabled) throw new Error("Private attachment previews require cloud mode.");
  const { data } = await api.get(`/attachments/${attachmentId}/preview`, {
    responseType: "blob", signal
  });
  return data;
}

export async function downloadPrivateAttachmentFile(attachment) {
  if (!cloudAuthEnabled) throw new Error("Private downloads require cloud mode.");
  const { data } = await api.get(`/attachments/${attachment.id}/download`, { responseType: "blob" });
  const objectUrl = URL.createObjectURL(data);
  try {
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = String(attachment.original_filename || "attachment")
      .replaceAll("\\", "/").split("/").pop();
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    // Allow the browser to initiate the download before releasing the blob URL.
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }
}

export async function createBackup() {
  const { data } = await api.post("/backup");
  return data;
}

export async function getBackupStatus() {
  const { data } = await api.get("/backup/status");
  return data;
}

export async function getRuntimeStatus() {
  // The server sets Cache-Control: no-store on the response. A request-side
  // Cache-Control header is unnecessary and triggers a rejected CORS preflight.
  const { data } = await api.get("/runtime/status");
  return data;
}

export async function getDemoDataStatus() {
  const { data } = await api.get("/runtime/demo-data");
  return data;
}

export async function loadDemoRecords() {
  const { data } = await api.post("/runtime/demo-data/load", { confirmation: "LOAD DEMO DATA" });
  return data;
}

export async function clearDemoRecords() {
  const { data } = await api.post("/runtime/demo-data/clear", { confirmation: "CLEAR DEMO DATA" });
  return data;
}

export async function downloadProtectedExport(path) {
  if (!cloudAuthEnabled) throw new Error("Cloud export requires sign-in.");
  if (!/^\/api\/export\/(patients|treatments)(\/P-[0-9]{4}-[0-9]{4}\/(full-record|treatments))?$/.test(path) &&
      !/^\/api\/export\/patients\/P-[0-9]{4}-[0-9]{4}\/(full-record|treatments)$/.test(path)) {
    throw new Error("Invalid export request.");
  }
  const { data, headers } = await api.get(path.replace(/^\/api/, ""), { responseType:"blob" });
  const suggested = headers["content-disposition"]?.match(/filename="([^"]+)"/)?.[1] || "dental_export.xlsx";
  const objectUrl = URL.createObjectURL(data);
  const element = document.createElement("a");
  element.href = objectUrl;
  element.download = suggested;
  document.body.appendChild(element);
  element.click();
  element.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

export function getExportUrl(path) {
  return `http://127.0.0.1:3002${path}`;
}

export function getUploadUrl(filePath) {
  if (cloudAuthEnabled) throw new Error("Cloud attachments must use authenticated private previews.");
  return `http://127.0.0.1:3002${filePath}`;
}

export function getAttachmentDownloadUrl(attachmentId) {
  if (cloudAuthEnabled) throw new Error("Cloud attachments must use authenticated private downloads.");
  return `http://127.0.0.1:3002/api/attachments/${attachmentId}/download`;
}

export default api;
