import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import ActivateAccountPage from "./pages/ActivateAccountPage";
import ActivatePatientAccountPage from "./pages/ActivatePatientAccountPage";
import AuthAccountPage from "./pages/AuthAccountPage";
import AppointmentSchedulerPage from "./pages/AppointmentSchedulerPage";
import NotificationsPage from "./pages/NotificationsPage";
import NotificationLiveProvider from "./notifications/NotificationLiveProvider";
import ProtectedAuthRoute from "./components/ProtectedAuthRoute";

// Legacy clinical screens are only loaded in a local-development build.
// Production/staging builds cannot bundle their unprotected SQLite-backed UI.
const localLegacyMode =
  import.meta.env.DEV &&
  (!import.meta.env.VITE_APP_ENV || import.meta.env.VITE_APP_ENV === "local");
const LegacyApp = localLegacyMode ? lazy(() => import("./LegacyApp.jsx")) : null;
const PatientPortalPage=lazy(()=>import("./pages/PatientPortalPage"));
const PatientAppointmentRequestsPage=lazy(()=>import("./pages/PatientAppointmentRequestsPage"));
const ClinicPatientRequestReviewPage=lazy(()=>import("./pages/ClinicPatientRequestReviewPage"));
const PatientDocumentsPrivacyPage=lazy(()=>import("./pages/PatientDocumentsPrivacyPage"));
const PatientFinancePage=lazy(()=>import("./pages/PatientFinancePage"));
const ClinicFinanceDailyPage=lazy(()=>import("./pages/ClinicFinanceDailyPage"));

export default function App() {
  if (localLegacyMode && LegacyApp) {
    return (
      <Suspense fallback={<main className="p-8">Loading local clinic workspace...</main>}>
        <LegacyApp />
      </Suspense>
    );
  }

  return (
    <NotificationLiveProvider>
      <Suspense fallback={<main className="p-8">Loading secure page...</main>}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/activate-account" element={<ActivateAccountPage />} />
        <Route path="/activate-patient-account" element={<ActivatePatientAccountPage />} />
        <Route path="/patient-portal" element={<ProtectedAuthRoute><PatientPortalPage /></ProtectedAuthRoute>} />
        <Route path="/patient-appointments" element={<ProtectedAuthRoute><PatientAppointmentRequestsPage /></ProtectedAuthRoute>} />
        <Route path="/patient-documents" element={<ProtectedAuthRoute><PatientDocumentsPrivacyPage /></ProtectedAuthRoute>} />
        <Route path="/patient-finance" element={<ProtectedAuthRoute><PatientFinancePage /></ProtectedAuthRoute>} />
        <Route path="/clinic-finance" element={<ProtectedAuthRoute><ClinicFinanceDailyPage /></ProtectedAuthRoute>} />
        <Route path="/clinic-patient-requests" element={<ProtectedAuthRoute><ClinicPatientRequestReviewPage /></ProtectedAuthRoute>} />
        <Route path="/auth/account" element={<ProtectedAuthRoute><AuthAccountPage /></ProtectedAuthRoute>} />
        <Route path="/appointments" element={<ProtectedAuthRoute><AppointmentSchedulerPage /></ProtectedAuthRoute>} />
        <Route path="/notifications" element={<ProtectedAuthRoute><NotificationsPage /></ProtectedAuthRoute>} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
      </Suspense>
    </NotificationLiveProvider>
  );
}
