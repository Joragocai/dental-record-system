import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { authenticatedV2Fetch } from "../auth/authApi.js";
import { useAuth } from "../context/AuthContext.js";
import { parseLandingContext, landingSections, type LandingContext } from "../dashboard/roleLandingSections.js";
import StagingDemoRoleSwitcher from "./StagingDemoRoleSwitcher.js";

export default function RoleDashboardPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [context, setContext] = useState<LandingContext | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "denied" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    let latestRequest = 0;
    const token = auth.providerSession?.accessToken;
    const apiBaseUrl = auth.apiBaseUrl;
    setContext(null);
    setState("loading");
    if (!token || !apiBaseUrl) {
      setState("denied");
      return;
    }
    const refresh = async () => {
      const request = ++latestRequest;
      const isCurrent = () => !cancelled && request === latestRequest;
      setContext(null);
      setState("loading");
      try {
        const response = await authenticatedV2Fetch("/dashboard/context", { cache: "no-store" }, { accessToken: token, apiBaseUrl });
        if (!response.ok) {
          if (isCurrent()) setState(response.status === 401 || response.status === 403 ? "denied" : "error");
          return;
        }
        const data: unknown = await response.json();
        const safe = parseLandingContext(data);
        if (isCurrent()) {
          setContext(safe);
          setState("ready");
        }
      } catch {
        if (isCurrent()) setState("error");
      }
    };
    const refreshOnFocus = () => { if (document.visibilityState === "visible") void refresh(); };
    void refresh();
    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", refreshOnFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", refreshOnFocus);
      document.removeEventListener("visibilitychange", refreshOnFocus);
    };
  }, [auth.apiBaseUrl, auth.providerSession?.accessToken]);

  async function logout() {
    await auth.logout();
    navigate("/login", { replace: true });
  }

  return <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-900">
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-sm font-medium text-slate-500">Dental Record System</p><h1 className="text-2xl font-bold">Secure dashboard</h1></div>
        <div className="flex gap-2"><Link className="button-secondary" to="/notifications">Notifications</Link><button className="button-secondary" onClick={() => void logout()}>Sign out</button></div>
      </header>
      {state === "loading" && <p role="status">Checking your current dashboard permissions...</p>}
      {state === "denied" && <p role="alert">Dashboard access is unavailable for this account. Contact the clinic administrator if your account is awaiting activation or assignment.</p>}
      {state === "error" && <p role="alert">Your dashboard could not be loaded securely. Please try again later.</p>}
      {state === "ready" && context && <section className="space-y-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-xl font-semibold">Welcome, {context.displayName}</h2>
          <p className="mt-2 text-sm text-slate-600">Assigned roles: {context.roles.map((role) => role.replaceAll("_", " ")).join(", ")}</p>
          {context.branchIds.length > 1 && <p className="mt-2 text-sm text-amber-700">You have access to multiple branches. Select the correct branch inside each clinical or operational module.</p>}
          {context.branchIds.length === 0 && context.roles.some((r) => r === "PERSONNEL" || r === "DENTIST") && <p className="mt-2 text-sm text-amber-700">No operational branch is currently assigned.</p>}
        </div>
        <StagingDemoRoleSwitcher />
        {landingSections(context).map((section) => <section key={section.title} className="space-y-3">
          <h3 className="font-semibold text-lg">{section.title}</h3>
          <div className="grid gap-3 sm:grid-cols-2">{section.links.map((link) => <Link key={link.key} to={link.path} className="rounded-xl border border-slate-200 bg-white p-5 font-medium shadow-sm hover:border-slate-400 focus-visible:outline-2 focus-visible:outline-blue-600">{link.label} →</Link>)}</div>
        </section>)}
        {context.links.length === 0 && <p className="rounded-xl border bg-white p-5 text-sm text-slate-600">No approved dashboard shortcuts are available for your role yet. This does not indicate that any clinical, financial, or technical data is missing.</p>}
      </section>}
    </div>
  </main>;
}
