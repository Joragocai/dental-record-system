// Recovery links can carry either a Supabase implicit-flow session in the
// fragment or a one-time token_hash query parameter. Never log these values.
export function readRecoveryCallback({ search = "", hash = "" } = {}) {
  const query = new URLSearchParams(search);
  const fragment = new URLSearchParams(hash.replace(/^#/, ""));
  const error = fragment.get("error_description") || query.get("error_description");
  if (error) return { kind:"error" };
  if (fragment.get("type") === "recovery" && fragment.get("access_token")) {
    return { kind:"session", accessToken:fragment.get("access_token") };
  }
  const tokenHash = query.get("token_hash");
  if (tokenHash && query.get("type") === "recovery") return { kind:"token", tokenHash };
  return { kind:"missing" };
}
export function validateNewPassword(password, confirmation) {
  if (password.length < 8) return "Use at least 8 characters for your new password.";
  if (password.length > 72) return "Use no more than 72 characters.";
  if (password !== confirmation) return "The passwords do not match.";
  return "";
}
