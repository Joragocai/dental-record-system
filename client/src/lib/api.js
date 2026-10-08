import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? "http://127.0.0.1:3002/api" : "/api"),
});

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

export async function getDashboardScheduleByDate(date) {
  const { data } = await api.get("/dashboard/schedule-by-date", { params: { date } });
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

export async function getPatientAttachments(_patientId) {
  throw new Error("Secure V2 attachment listing is not available from the legacy patient route.");
}

export async function getTreatmentAttachments(_treatmentId) {
  throw new Error("Secure V2 attachment listing is not available from the legacy treatment route.");
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

export async function uploadAttachment(_formData) {
  throw new Error("Legacy local attachment upload is retired on the V2 branch.");
}

export async function uploadTreatmentAttachment(_treatmentId, _formData) {
  throw new Error("Legacy local treatment attachment upload is retired on the V2 branch.");
}

export async function deleteAttachment(_attachmentId) {
  throw new Error("Secure V2 attachment deletion requires an authenticated V2 record context.");
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
  const { data } = await api.get("/runtime/status", {
    headers: {
      "Cache-Control": "no-store"
    }
  });
  return data;
}

export function getExportUrl(path) {
  return `${api.defaults.baseURL.replace(/\/api\/?$/, "")}${path}`;
}

export function getUploadUrl(_filePath) {
  return "";
}

export function getAttachmentDownloadUrl(_attachmentId) {
  return "";
}

export default api;
