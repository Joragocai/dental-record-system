import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import DemoDataDock from "./DemoDataDock";
import { isPatientsNavigationActive } from "../lib/navigation";
import { isDashboardScheduleOrigin } from "../lib/dashboardSchedule";

const navItems = [
  { to: "/", label: "Home", isActive: (pathname) => pathname === "/" },
  { to: "/patients", label: "Patient Search", isActive: isPatientsNavigationActive },
  { to: "/patients/new", label: "Register Patient", isActive: (pathname) => pathname === "/patients/new" },
  { to: "/treatments/new", label: "Record Treatment", isActive: (pathname) => pathname === "/treatments/new" },
  { to: "/settings", label: "Maintenance", isActive: (pathname) => pathname === "/settings" || pathname === "/backup" }
];

function isCurrentSection(item, location) {
  const returningToEntry = location.state?.fromTreatmentEntry && /^\/treatments\/[^/]+$/.test(location.pathname);
  const dashboardRoute = /^\/patients\/[^/]+\/appointments\/[^/]+\/edit$/.test(location.pathname) ||
    /^\/treatments\/(?!new$)[^/]+(?:\/edit)?$/.test(location.pathname);
  const fromDashboard = dashboardRoute && isDashboardScheduleOrigin(location.state);
  return fromDashboard ? item.to === "/" :
    returningToEntry ? item.to === "/treatments/new" : item.isActive(location.pathname);
}

function NavigationLinks({ location, mobile = false, onNavigate }) {
  return navItems.map((item) => {
    const isActive = isCurrentSection(item, location);
    return (
      <NavLink
        key={item.to}
        to={item.to}
        onClick={onNavigate}
        aria-current={isActive ? "page" : undefined}
        className={`nav-link-ui relative flex min-h-11 items-center rounded-lg px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clinic-700 ${mobile ? "w-full justify-start text-left" : "w-[136px] shrink-0 justify-center whitespace-nowrap text-center"} ${isActive ? "bg-clinic-100/70 font-semibold text-clinic-900" : "font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`}
      >
        {item.label}
        {isActive ? <span aria-hidden="true" className={mobile ? "absolute bottom-2 left-0 top-2 w-[3px] rounded-full bg-clinic-500" : "absolute bottom-0 left-4 right-4 h-[3px] rounded-full bg-clinic-500"} /> : null}
      </NavLink>
    );
  });
}

export default function Layout({ children, contentClassName = "" }) {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const toggleRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname, location.search, location.hash]);

  useEffect(() => {
    if (!menuOpen) return undefined;

    function handleOutsideClick(event) {
      if (!menuRef.current?.contains(event.target) && !toggleRef.current?.contains(event.target)) {
        setMenuOpen(false);
      }
    }

    function handleEscape(event) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setMenuOpen(false);
      toggleRef.current?.focus();
    }

    const desktopQuery = window.matchMedia("(min-width: 1280px)");
    function handleDesktopTransition(event) {
      if (event.matches) setMenuOpen(false);
    }

    document.addEventListener("pointerdown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);
    desktopQuery.addEventListener?.("change", handleDesktopTransition);
    return () => {
      document.removeEventListener("pointerdown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
      desktopQuery.removeEventListener?.("change", handleDesktopTransition);
    };
  }, [menuOpen]);

  return (
    <div className="min-h-screen min-w-0 bg-[radial-gradient(circle_at_top_left,_rgba(60,122,115,0.15),_transparent_28%),linear-gradient(180deg,_#f8fbfb_0%,_#eef4f4_100%)]">
      <header className="no-print border-b border-slate-200 bg-white/85 backdrop-blur">
        <div className="page-shell flex flex-col gap-3 py-3 sm:py-4 xl:flex-row xl:items-center xl:justify-between xl:gap-4">
          <div className="flex min-w-0 items-center justify-between gap-3 xl:shrink-0">
            <div className="min-w-0">
              <Link to="/" className="block text-base font-bold leading-tight text-clinic-900 sm:text-xl xl:text-xl 2xl:text-2xl">
                Khurana Calilap Dental <span className="block sm:inline">Record System</span>
              </Link>
              <p className="mt-1 hidden text-sm text-slate-600 sm:block">Local clinic record system for patient and treatment management</p>
            </div>
            <button
              ref={toggleRef}
              type="button"
              aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
              aria-controls="mobile-primary-navigation"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-clinic-900 transition-colors hover:border-clinic-700 hover:bg-clinic-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clinic-700 xl:hidden"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                {menuOpen ? <path d="M5 5l14 14M19 5L5 19" /> : <path d="M4 6h16M4 12h16M4 18h16" />}
              </svg>
            </button>
          </div>
          <nav aria-label="Main navigation" className="hidden shrink-0 items-center gap-1 xl:flex">
            <NavigationLinks location={location} />
          </nav>
          <nav
            ref={menuRef}
            id="mobile-primary-navigation"
            aria-label="Mobile navigation"
            className={`${menuOpen ? "grid" : "hidden"} grid-cols-1 gap-1 rounded-xl border border-slate-200 bg-white p-2 shadow-sm sm:grid-cols-2 xl:hidden`}
          >
            <NavigationLinks location={location} mobile onNavigate={() => setMenuOpen(false)} />
          </nav>
        </div>
      </header>

      <main className={`page-shell min-w-0 ${contentClassName}`}>{children}</main>
      <DemoDataDock />
    </div>
  );
}
