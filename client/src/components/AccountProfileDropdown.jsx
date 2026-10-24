import { useEffect, useId, useRef, useState } from "react";
import { useCloudAuth } from "../context/CloudAuthContext";

function AccountAvatar({ small = false }) {
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full bg-clinic-100 text-clinic-700 ${small ? "h-9 w-9" : "h-12 w-12"}`}>
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={small ? "h-5 w-5" : "h-6 w-6"}>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 20c.4-4.1 2.9-6 7-6s6.6 1.9 7 6" />
      </svg>
    </span>
  );
}

export default function AccountProfileDropdown() {
  const { enabled, session, signOut } = useCloudAuth();
  const [open, setOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState("");
  const containerRef = useRef(null);
  const triggerRef = useRef(null);
  const detailsId = useId();

  useEffect(() => {
    if (!open) return undefined;
    function closeOutside(event) {
      if (!containerRef.current?.contains(event.target)) {
        setOpen(false);
        setDetailsOpen(false);
      }
    }
    function closeOnEscape(event) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      setDetailsOpen(false);
      triggerRef.current?.focus();
    }
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  if (!enabled) return null;
  const email = typeof session?.email === "string" && session.email.trim()
    ? session.email.trim() : "Email not available";

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    setError("");
    try {
      await signOut();
      setOpen(false);
      setDetailsOpen(false);
    } catch {
      setError("Unable to sign out. Please try again.");
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => { setOpen(value => !value); setDetailsOpen(false); setError(""); }}
        aria-label="Clinic Administrator account menu"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? detailsId : undefined}
        className={`flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-2 py-1.5 text-left text-clinic-900 shadow-sm transition hover:border-clinic-300 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clinic-700 sm:px-3 ${open ? "bg-clinic-50" : "bg-white"}`}
      >
        <AccountAvatar small />
        <span className="hidden min-w-0 flex-col sm:flex">
          <span className="text-xs font-semibold leading-tight">Clinic Administrator</span>
          <span className="text-[11px] leading-tight text-clinic-700">Clinic Account</span>
        </span>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`hidden h-4 w-4 transition-transform sm:block ${open ? "rotate-180" : ""}`}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open ? (
        <div id={detailsId} role="group" aria-label="Clinic account" className="absolute right-0 top-[calc(100%+0.55rem)] z-50 w-[min(19rem,calc(100vw-2rem))] rounded-2xl border border-clinic-100 bg-white p-3 shadow-[0_18px_45px_-16px_rgba(22,53,51,0.32)]">
          <div className="flex items-center gap-3 px-1 py-2">
            <AccountAvatar />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-clinic-900">Clinic Administrator</p>
              <p className="mt-1 text-xs text-slate-600">Khurana Calilap Dental</p>
            </div>
          </div>
          <div className="mt-1 rounded-lg bg-clinic-50 px-3 py-2">
            <p className="text-[11px] font-semibold text-clinic-700">Account email</p>
            <p className="mt-1 break-all text-xs text-slate-700">{email}</p>
          </div>
          <div className="my-3 border-t border-slate-200" />
          <button
            type="button"
            onClick={() => setDetailsOpen(value => !value)}
            aria-expanded={detailsOpen}
            className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-medium text-clinic-900 transition hover:bg-clinic-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-clinic-700"
          >
            <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8" r="3" /><path d="M5 20c0-4 3-6 7-6s7 2 7 6" />
            </svg>
            Account Information
            <svg aria-hidden="true" className={`ml-auto h-4 w-4 transition-transform ${detailsOpen ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
          </button>
          {detailsOpen ? (
            <div className="mx-2 mb-2 rounded-lg border border-clinic-100 bg-clinic-50 px-3 py-2 text-xs text-slate-700">
              <p><span className="font-semibold text-clinic-900">Role:</span> Clinic Administrator</p>
              <p className="mt-1 break-all"><span className="font-semibold text-clinic-900">Email:</span> {email}</p>
              <p className="mt-1"><span className="font-semibold text-clinic-900">Account type:</span> Authorized clinic account</p>
            </div>
          ) : null}
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            className="mt-1 flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-semibold text-rose-700 transition hover:bg-rose-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-600 disabled:opacity-60"
          >
            <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M10 17l5-5-5-5M15 12H3" /><path d="M12 3h6a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3h-6" /></svg>
            {signingOut ? "Signing out…" : "Sign Out"}
          </button>
          {error ? <p role="alert" className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
