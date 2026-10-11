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
