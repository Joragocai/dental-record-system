import { useNavigate } from "react-router-dom";
import AuthPanel from "../components/AuthPanel.js";
import { useAuth } from "../context/AuthContext.js";

export default function AuthAccountPage() {
  const auth = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await auth.logout();
    navigate("/login", { replace: true });
  }

  return (
    <AuthPanel
      title="Secure session"
      subtitle="Your secure browser session was verified by the Express API. This staging page does not expose clinic records or your complete role permissions."
    >
      <dl className="space-y-4 text-sm">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <dt className="font-medium text-slate-500">Verified user ID</dt>
          <dd className="mt-1 break-all font-semibold text-slate-900">{auth.verifiedIdentity?.id}</dd>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <dt className="font-medium text-slate-500">Verified email</dt>
          <dd className="mt-1 font-semibold text-slate-900">{auth.verifiedIdentity?.email ?? "No verified email returned"}</dd>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-800">
          The backend enforces role and branch permissions on protected routes. This page confirms your identity only; full clinic workflows are not available in staging yet.
        </div>
      </dl>
      <button className="button-secondary mt-6 w-full" type="button" onClick={() => void handleLogout()}>
        Sign out
      </button>
    </AuthPanel>
  );
}
