import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import DemoDataDock from "./DemoDataDock";
import AccountProfileDropdown from "./AccountProfileDropdown";
import ClinicBrandMark from "./ClinicBrandMark";
import MobileAccountSection from "./MobileAccountSection";
import { useCloudAuth } from "../context/CloudAuthContext";
import { primaryNavigationItems } from "../lib/navigation";
import { isDashboardScheduleOrigin } from "../lib/dashboardSchedule";

function isCurrentSection(item, location) {
  const returningToEntry = location.state?.fromTreatmentEntry && /^\/treatments\/[^/]+$/.test(location.pathname);
  const dashboardRoute = /^\/patients\/[^/]+\/appointments\/[^/]+\/edit$/.test(location.pathname) ||
    /^\/treatments\/(?!new$)[^/]+(?:\/edit)?$/.test(location.pathname);
  const fromDashboard = dashboardRoute && isDashboardScheduleOrigin(location.state);
  const fromBalances = dashboardRoute && Boolean(location.state?.fromBalances);
  return fromBalances ? item.to === "/balances" :
    fromDashboard ? item.to === "/" :
    returningToEntry ? item.to === "/treatments/new" : item.isActive(location.pathname);
}

function NavigationLinks({ location, mobile = false, onNavigate }) {
  return primaryNavigationItems.map((item) => {
    const isActive = isCurrentSection(item, location);
    return (
      <NavLink
        key={item.to}
        to={item.to}
        onClick={onNavigate}
        aria-current={isActive ? "page" : undefined}
        className={`nav-link-ui relative flex min-h-11 items-center rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clinic-700 ${mobile ? "w-full justify-start px-3 text-left text-sm" : "min-w-[118px] shrink-0 justify-center whitespace-nowrap px-3.5 text-center text-[15px] min-[1600px]:min-w-[122px] min-[1920px]:min-w-[132px] min-[1920px]:text-base"} ${isActive ? "bg-clinic-100/70 font-semibold text-clinic-900" : "font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`}
      >
        {item.label}
        {isActive ? <span aria-hidden="true" className={mobile ? "absolute bottom-2 left-0 top-2 w-[3px] rounded-full bg-clinic-500" : "absolute bottom-0 left-4 right-4 h-[3px] rounded-full bg-clinic-500"} /> : null}
      </NavLink>
    );
  });
}

export default function Layout({ children, contentClassName = "" }) {
  const { enabled: isCloud } = useCloudAuth();
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

    const desktopQuery = window.matchMedia("(min-width: 1440px)");
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
      <header className="no-print relative z-40 border-b border-slate-200 bg-white/85 backdrop-blur">
        <div className="site-header-shell mx-auto flex w-full flex-col gap-3 px-4 py-3 sm:px-6 lg:px-8 min-[1440px]:grid min-[1440px]:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] min-[1440px]:items-center min-[1440px]:gap-4">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <Link
              to="/"
              aria-label="Khurana Calilap Dental Record System — Home"
              className="flex min-w-0 items-center gap-2.5 rounded-lg text-clinic-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clinic-700 sm:gap-3"
            >
              <ClinicBrandMark />
              <span aria-hidden="true" className="hidden h-9 w-px shrink-0 bg-clinic-100 sm:block" />
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="text-sm font-bold sm:text-lg min-[1440px]:whitespace-nowrap min-[1440px]:text-base min-[1800px]:text-lg">
                  Khurana Calilap
                </span>
                <span className="mt-1 text-[9px] font-semibold uppercase tracking-[0.13em] text-slate-500 sm:text-[10px] min-[1440px]:whitespace-nowrap min-[1800px]:text-[11px]">
                  Dental Record System
                </span>
              </span>
            </Link>
            <div className="flex shrink-0 items-center gap-2 min-[1440px]:hidden">
              <button
                ref={toggleRef}
                type="button"
                aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
                aria-controls="compact-primary-navigation"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((open) => !open)}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-clinic-900 transition-colors hover:border-clinic-700 hover:bg-clinic-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clinic-700 min-[1440px]:hidden"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  {menuOpen ? <path d="M5 5l14 14M19 5L5 19" /> : <path d="M4 6h16M4 12h16M4 18h16" />}
                </svg>
              </button>
            </div>
          </div>
          <nav aria-label="Main navigation" className="hidden min-w-0 items-center justify-center gap-2 min-[1440px]:flex min-[1600px]:gap-5 min-[1920px]:gap-7">
            <NavigationLinks location={location} />
          </nav>
          {isCloud ? <div className="hidden min-[1440px]:flex min-[1440px]:min-w-0 min-[1440px]:justify-end"><AccountProfileDropdown /></div> : null}
          <nav
            ref={menuRef}
            id="compact-primary-navigation"
            aria-label="Navigation and account menu"
            className={`${menuOpen ? "block" : "hidden"} absolute right-4 top-[calc(100%-0.35rem)] z-50 w-[calc(100%-2rem)] max-h-[min(75vh,calc(100dvh-6rem))] overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-white p-2 shadow-[0_18px_45px_-20px_rgba(22,53,51,0.35)] sm:right-6 sm:w-[min(22.5rem,calc(100%-3rem))] lg:right-8 min-[1440px]:hidden`}
          >
            <div className="grid grid-cols-1 gap-1">
              <NavigationLinks location={location} mobile onNavigate={() => setMenuOpen(false)} />
            </div>
            {isCloud ? <MobileAccountSection onSignedOut={() => setMenuOpen(false)} /> : null}
          </nav>
        </div>
      </header>

      <main className={`page-shell min-w-0 ${contentClassName}`}>{children}</main>
      <DemoDataDock />
    </div>
  );
}
