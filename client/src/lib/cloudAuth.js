// Supabase Auth REST client for the single-account hosted demonstration.
// This intentionally uses only public browser configuration; backend secrets
// never appear in this module or Vite environment variables.
const configuredUrl = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, "") || "";
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
export const cloudAuthEnabled = Boolean(configuredUrl && publishableKey);
const storageKey = "dental-cloud-session-v1";
let session = null;
let refreshPromise = null;
const listeners = new Set();
function notify() { for (const listener of listeners) listener(session); }
export function subscribeToSession(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function getCloudSession() { return session; }
export function initializeCloudSession() {
  if (!cloudAuthEnabled) return null;
  try {
    const saved = sessionStorage.getItem(storageKey);
    session = saved ? JSON.parse(saved) : null;
    if (!session?.refresh_token || !session?.access_token || !Number.isFinite(session.expires_at)) session = null;
  } catch { session = null; }
  notify();
  return session;
}
function saveSession(result) {
  if (!result?.access_token || !result?.refresh_token || !Number.isFinite(Number(result.expires_in))) {
    throw new Error("Authentication service returned an invalid session.");
  }
  session = {
    access_token: result.access_token,
    refresh_token: result.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + Number(result.expires_in),
    email: typeof result.user?.email === "string" ? result.user.email : session?.email || ""
  };
  sessionStorage.setItem(storageKey, JSON.stringify(session));
  notify();
  return session;
}
async function authRequest(grantType, payload) {
  if (!cloudAuthEnabled) throw new Error("Supabase Auth is not configured.");
  const response = await fetch(`${configuredUrl}/auth/v1/token?grant_type=${grantType}`, {
    method: "POST",
    headers: { apikey: publishableKey, "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    if (response.status === 400 || response.status === 401 || response.status === 422) {
      throw new Error("Unable to sign in. Check your credentials or account confirmation.");
    }
    throw new Error("Authentication service is currently unavailable.");
  }
  return response.json();
}
export async function signInCloud(email, password) {
  if (!email?.trim() || !password) throw new Error("Email and password are required.");
  return saveSession(await authRequest("password", { email: email.trim(), password }));
}
export async function getCloudAccessToken() {
  if (!cloudAuthEnabled) return null;
  if (!session) return null;
  if (session.expires_at > Math.floor(Date.now() / 1000) + 60) return session.access_token;
  if (!refreshPromise) {
    refreshPromise = authRequest("refresh_token", { refresh_token: session.refresh_token })
      .then(saveSession)
      .catch(error => { clearCloudSession(); throw error; })
      .finally(() => { refreshPromise = null; });
  }
  return (await refreshPromise).access_token;
}
export function clearCloudSession() {
  session = null;
  sessionStorage.removeItem(storageKey);
  notify();
}
export async function signOutCloud() {
  const token = session?.access_token;
  clearCloudSession();
  if (!token) return;
  try {
    await fetch(`${configuredUrl}/auth/v1/logout`, {
      method:"POST",
      headers: {apikey:publishableKey,Authorization:`Bearer ${token}`}
    });
  } catch {
    // Local session is cleared even when the remote sign-out endpoint is unreachable.
  }
}
