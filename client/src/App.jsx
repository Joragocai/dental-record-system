import { Navigate, Route, Routes } from "react-router-dom";
import { useCloudAuth } from "./context/CloudAuthContext";
import CloudLoginPage from "./pages/CloudLoginPage";
import AppointmentFormPage from "./pages/AppointmentFormPage";
import DashboardPage from "./pages/DashboardPage";
import BalancesPage from "./pages/BalancesPage";
import PatientDetailPage from "./pages/PatientDetailPage";
import PatientFormPage from "./pages/PatientFormPage";
import PatientSearchPage from "./pages/PatientSearchPage";
import PatientTreatmentHistoryPage from "./pages/PatientTreatmentHistoryPage";
import PrintPatientHistoryPage from "./pages/PrintPatientHistoryPage";
import PrintPatientPage from "./pages/PrintPatientPage";
import PrintTreatmentPage from "./pages/PrintTreatmentPage";
import SettingsPage from "./pages/SettingsPage";
import TreatmentDetailPage from "./pages/TreatmentDetailPage";
import TreatmentFormPage from "./pages/TreatmentFormPage";

export default function App() {
  const { enabled, ready, authenticated } = useCloudAuth();
  if (enabled && !ready) return <main className="min-h-screen grid place-items-center">Verifying session…</main>;
  if (enabled && !authenticated) return <CloudLoginPage />;
  return (
    <Routes>
      <Route path="/" element={<DashboardPage />} />
      <Route path="/dashboard" element={<Navigate to="/" replace />} />
      <Route path="/balances" element={<BalancesPage />} />
      <Route path="/patients" element={<PatientSearchPage />} />
      <Route path="/patients/new" element={<PatientFormPage mode="create" />} />
      <Route path="/patients/:patientId" element={<PatientDetailPage />} />
      <Route path="/patients/:patientId/edit" element={<PatientFormPage mode="edit" />} />
      <Route path="/patients/:patientId/appointments/new" element={<AppointmentFormPage />} />
      <Route path="/patients/:patientId/appointments/:appointmentId/edit" element={<AppointmentFormPage mode="edit" />} />
      <Route path="/patients/:patientId/treatments" element={<PatientTreatmentHistoryPage />} />
      <Route path="/treatments/new" element={<TreatmentFormPage mode="create" />} />
      <Route path="/treatments/:treatmentId" element={<TreatmentDetailPage />} />
      <Route path="/treatments/:treatmentId/edit" element={<TreatmentFormPage mode="edit" />} />
      <Route path="/print/patients/:patientId" element={<PrintPatientPage />} />
      <Route path="/print/treatments/:treatmentId" element={<PrintTreatmentPage />} />
      <Route path="/print/patients/:patientId/treatments" element={<PrintPatientHistoryPage />} />
      <Route path="/settings" element={<SettingsPage />} />
    </Routes>
  );
}
