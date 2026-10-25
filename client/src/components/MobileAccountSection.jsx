import { useId, useState } from "react";
import { Link } from "react-router-dom";
import { useCloudAuth } from "../context/CloudAuthContext";

// Mobile and tablet share account controls inside the compact navigation menu.
// Only desktop screens (1440px and wider) use the header profile dropdown.
export default function MobileAccountSection({ onSignedOut }) {
  const { enabled, session, signOut } = useCloudAuth();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState("");
  const detailsId = useId();

  if (!enabled) return null;

  const email = typeof session?.email === "string" && session.email.trim()
    ? session.email.trim()
    : "Email not available";

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    setError("");
    try {
      await signOut();
      onSignedOut?.();
    } catch {
      setError("Unable to sign out. Please try again.");
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <section aria-label="Clinic account" className="mt-3 border-t border-slate-200 pt-3">
      <div className="flex items-center gap-3 px-3 py-2">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-clinic-100 text-clinic-700">
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="8" r="3.5" />
            <path d="M5 20c.4-4.1 2.9-6 7-6s6.6 1.9 7 6" />
          </svg>
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-clinic-900">Clinic Administrator</p>
          <p className="text-xs text-slate-500">Clinic Account</p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setDetailsOpen((value) => !value)}
        aria-expanded={detailsOpen}
        aria-controls={detailsId}
        className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium text-clinic-900 transition-colors hover:bg-clinic-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-clinic-700"
      >
        <svg aria-hidden="true" className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="8" r="3" />
          <path d="M5 20c0-4 3-6 7-6s7 2 7 6" />
        </svg>
        Account Information
        <svg aria-hidden="true" className={`ml-auto h-4 w-4 transition-transform ${detailsOpen ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {detailsOpen && (
        <div id={detailsId} className="mx-2 mb-2 space-y-1 rounded-lg border border-clinic-100 bg-clinic-50 px-3 py-2 text-xs text-slate-700">
          <p><span className="font-semibold text-clinic-900">Role:</span> Clinic Administrator</p>
          <p className="break-all"><span className="font-semibold text-clinic-900">Email:</span> {email}</p>
          <p><span className="font-semibold text-clinic-900">Account type:</span> Authorized clinic account</p>
        </div>
      )}

      <Link
        to="/settings"
        onClick={() => onSignedOut?.()}
        className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium text-clinic-900 transition-colors hover:bg-clinic-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-clinic-700"
      >
        <svg aria-hidden="true" className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 8V5h14v3M5 13V8h14v5M4 13h16v7H4z" />
          <path d="M9 16h6" />
        </svg>
        Backup &amp; Recovery
      </Link>
      <button
        type="button"
        disabled={signingOut}
        onClick={handleSignOut}
        className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-700 disabled:opacity-60"
      >
        <svg aria-hidden="true" className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="m10 17 5-5-5-5M15 12H3" />
          <path d="M12 3h6a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3h-6" />
        </svg>
        {signingOut ? "Signing out…" : "Sign Out"}
      </button>
      {error && <p role="alert" className="mx-2 mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
    </section>
  );
}
