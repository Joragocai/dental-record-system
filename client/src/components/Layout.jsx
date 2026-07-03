import { Link, NavLink } from "react-router-dom";

const navItems = [
  { to: "/", label: "Dashboard" },
  { to: "/patients", label: "Patient Search" },
  { to: "/patients/new", label: "New Patient" },
  { to: "/treatments/new", label: "New Treatment" },
  { to: "/settings", label: "Backup" }
];

export default function Layout({ children }) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(60,122,115,0.15),_transparent_28%),linear-gradient(180deg,_#f8fbfb_0%,_#eef4f4_100%)]">
      <header className="no-print border-b border-slate-200 bg-white/85 backdrop-blur">
        <div className="page-shell flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <Link to="/" className="text-2xl font-bold text-clinic-900">
              Electronic Dental Record System
            </Link>
            <p className="text-sm text-slate-600">Local clinic record system for patient and treatment management</p>
          </div>
          <nav className="flex flex-wrap gap-2">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `rounded-xl px-3 py-2 text-sm font-medium ${isActive ? "bg-clinic-700 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"}`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="page-shell">{children}</main>
    </div>
  );
}
