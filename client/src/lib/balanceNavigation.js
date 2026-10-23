// All destinations are internal app routes. Never trust an arbitrary navigation
// state value as a URL (including strings beginning with //).
export function safeInternalLocation(candidate, fallback = "/") {
  if (!candidate || typeof candidate !== "object" ||
      typeof candidate.pathname !== "string" ||
      !/^\/(?!\/)[a-zA-Z0-9/_.%-]*$/.test(candidate.pathname)) {
    return { pathname: fallback };
  }
  return {
    pathname: candidate.pathname,
    search: typeof candidate.search === "string" && candidate.search.startsWith("?") ? candidate.search : "",
    hash: typeof candidate.hash === "string" && candidate.hash.startsWith("#") ? candidate.hash : ""
  };
}

export function patientBalancesPath(patientId) {
  return `/balances?patientId=${encodeURIComponent(patientId)}`;
}

export function balancesBackDestination(backTo, patientId = "") {
  return safeInternalLocation(backTo, patientId ? `/patients/${encodeURIComponent(patientId)}` : "/");
}

export function balanceSourceLabel(pathname) {
  if (pathname === "/") return "Home";
  if (/^\/patients\/[^/]+$/.test(pathname)) return "Patient Record";
  if (pathname === "/patients") return "Patient Search";
  if (pathname === "/treatments/new") return "Record Treatment";
  if (/^\/treatments\/[^/]+$/.test(pathname)) return "Treatment Record";
  if (pathname === "/settings") return "Maintenance";
  return "Previous Page";
}

export function balancesDetailState(location) {
  return {
    fromBalances: true,
    balancesReturnTo: { pathname: location.pathname, search: location.search, hash: location.hash },
    balancesOrigin: location.state?.backTo || null
  };
}

export function balanceViewFromSearchParams(params) {
  const patientId = params.get("patientId") || "";
  const query = params.get("q") || "";
  const status = ["Unpaid", "Partially Paid", "Settled"].includes(params.get("status")) ? params.get("status") : "Unpaid";
  const sort = ["balance", "recent", "patient"].includes(params.get("sort")) ? params.get("sort") : "balance";
  return { patientId, query, status, sort };
}
