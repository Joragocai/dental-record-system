import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import ActivateAccountPage from "./pages/ActivateAccountPage";
import AuthAccountPage from "./pages/AuthAccountPage";
import AppointmentSchedulerPage from "./pages/AppointmentSchedulerPage";
import ProtectedAuthRoute from "./components/ProtectedAuthRoute";

// Legacy clinical screens are only loaded in a local-development build.
// Production/staging builds cannot bundle their unprotected SQLite-backed UI.
const localLegacyMode =
  import.meta.env.DEV &&
  (!import.meta.env.VITE_APP_ENV || import.meta.env.VITE_APP_ENV === "local");
const LegacyApp = localLegacyMode ? lazy(() => import("./LegacyApp.jsx")) : null;

export default function App() {
  if (localLegacyMode && LegacyApp) {
    return (
      <Suspense fallback={<main className="p-8">Loading local clinic workspace...</main>}>
        <LegacyApp />
      </Suspense>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/activate-account" element={<ActivateAccountPage />} />
      <Route path="/auth/account" element={<ProtectedAuthRoute><AuthAccountPage /></ProtectedAuthRoute>} />
      <Route path="/appointments" element={<ProtectedAuthRoute><AppointmentSchedulerPage /></ProtectedAuthRoute>} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
