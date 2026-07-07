import axios from "axios";

const api = axios.create({
  baseURL: "http://127.0.0.1:3002/api",
});

export async function getDashboardSummary() {
  const { data } = await api.get("/dashboard/summary");
  return data;
}

export async function getDashboardSchedule() {
  const { data } = await api.get("/dashboard/schedule");
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

export async function createBackup() {
  const { data } = await api.post("/backup");
  return data;
}

export function getExportUrl(path) {
  return `http://127.0.0.1:3002${path}`;
}

export function getUploadUrl(filePath) {
  return `http://127.0.0.1:3002${filePath}`;
}

export function getAttachmentDownloadUrl(attachmentId) {
  return `http://127.0.0.1:3002/api/attachments/${attachmentId}/download`;
}

export default api;
