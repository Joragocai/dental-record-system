import { Link, NavLink, useLocation } from "react-router-dom";
import { useRuntimeStatus } from "../context/RuntimeStatusContext";

const navItems = [
  { to: "/", label: "Dashboard", isActive: (pathname) => pathname === "/" },
  { to: "/patients", label: "Patient Search", isActive: (pathname) => pathname === "/patients" || pathname === "/patients/search" },
  { to: "/patients/new", label: "New Patient", isActive: (pathname) => pathname === "/patients/new" },
  { to: "/treatments/new", label: "New Treatment", isActive: (pathname) => pathname === "/treatments/new" },
  { to: "/settings", label: "Backup", isActive: (pathname) => pathname === "/settings" || pathname === "/backup" }
];

export default function Layout({ children }) {
  const location = useLocation();
  const runtimeStatus = useRuntimeStatus();

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(60,122,115,0.15),_transparent_28%),linear-gradient(180deg,_#f8fbfb_0%,_#eef4f4_100%)]">
      <header className="no-print border-b border-slate-200 bg-white/85 backdrop-blur">
        <div className="page-shell flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <Link to="/" className="text-2xl font-bold text-clinic-900">
              Khurana Calilap Dental Record System
            </Link>
            <p className="text-sm text-slate-600">Local clinic record system for patient and treatment management</p>
          </div>
          <nav className="flex flex-wrap gap-2">
            {navItems.map((item) => {
              const isActive = item.isActive(location.pathname);

              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={`nav-link-ui rounded-xl px-3 py-2 text-sm font-medium ${isActive ? "bg-clinic-700 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"}`}
                >
                  {item.label}
                </NavLink>
              );
            })}
          </nav>
        </div>
      </header>
      {runtimeStatus.isDemoMode ? (
        <div className="no-print border-b border-amber-200 bg-amber-50/90">
          <div className="page-shell py-3">
            <div className="rounded-2xl border border-amber-200 bg-white/80 px-4 py-3 text-sm text-amber-900 shadow-sm">
              <p className="font-semibold tracking-wide">DEMO MODE - Fictional data only</p>
              <p className="mt-1 text-amber-800">Changes made here affect only the demo environment.</p>
            </div>
          </div>
        </div>
      ) : null}
      <main className="page-shell">{children}</main>
    </div>
  );
}
