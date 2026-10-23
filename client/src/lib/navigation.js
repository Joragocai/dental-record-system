// Keep the everyday clinic navigation limited to operational workflows.
// Technical backup controls stay available through /settings, but not in this menu.
export const primaryNavigationItems = [
  { to: "/", label: "Home", isActive: (pathname) => pathname === "/" },
  { to: "/patients", label: "Patient Search", isActive: isPatientsNavigationActive },
  { to: "/patients/new", label: "Register Patient", isActive: (pathname) => pathname === "/patients/new" },
  { to: "/treatments/new", label: "Record Treatment", isActive: (pathname) => pathname === "/treatments/new" },
  { to: "/balances", label: "Balances", isActive: (pathname) => pathname === "/balances" }
];

// Patient-specific treatment detail/edit workflows belong under Patient Search.
// The new treatment form and patient registration keep their own navigation tabs.
export function isPatientsNavigationActive(pathname) {
  const path = String(pathname || "").replace(/\/+$/, "") || "/";
  if (path === "/patients") return true;
  if (path.startsWith("/patients/")) return path !== "/patients/new";
  if (/^\/print\/patients\/[^/]+(?:\/treatments)?$/.test(path)) return true;
  if (/^\/print\/treatments\/[^/]+$/.test(path)) return true;
  return /^\/treatments\/(?!new$)[^/]+(?:\/edit)?$/.test(path);
}
