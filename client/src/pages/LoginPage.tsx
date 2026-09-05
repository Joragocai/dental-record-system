import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import AuthPanel from "../components/AuthPanel.js";
import { useAuth } from "../context/AuthContext.js";

export default function LoginPage() {
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (auth.authenticated) return <Navigate to="/auth/account" replace />;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await auth.login(email, password);
      const destination = (location.state as { from?: string } | null)?.from ?? "/auth/account";
      navigate(destination, { replace: true });
    } catch {
      // AuthContext exposes a safe user-facing message.
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthPanel
      title="Sign in"
      subtitle="Staff and approved users sign in with an account provisioned for them. Public self-registration is disabled."
      footer={
        <>
          Forgot your password? <Link className="font-semibold text-clinic-700" to="/forgot-password">Recover access</Link>
        </>
      }
    >
      {!auth.configured ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {auth.configurationMessage ?? "Authentication is not configured yet."}
        </div>
      ) : null}
      {auth.error ? (
        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{auth.error}</div>
      ) : null}
      <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
        <label className="block">
          <span className="label-text">Email address</span>
          <input
            className="text-input"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label className="block">
          <span className="label-text">Password</span>
          <input
            className="text-input"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <button className="button-primary w-full" type="submit" disabled={!auth.configured || submitting || auth.loading}>
          {submitting || auth.loading ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </AuthPanel>
  );
}
