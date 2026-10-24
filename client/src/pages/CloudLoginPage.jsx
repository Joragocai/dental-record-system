import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useCloudAuth } from "../context/CloudAuthContext";

export function ToothIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 48 48"
      fill="none"
      className="h-9 w-9 text-clinic-700"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M24 11.6c-3.5-2.9-8-3.7-11.4-1.8-4.8 2.8-5.7 8.1-3 14.7 1.9 4.7 3 14.8 7 14.8 3.4 0 3.2-9.5 7.4-9.5s4 9.5 7.4 9.5c4 0 5.1-10.1 7-14.8 2.7-6.6 1.8-11.9-3-14.7-3.4-1.9-7.9-1.1-11.4 1.8Z" />
    </svg>
  );
}

function PasswordVisibilityIcon({ visible }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      {visible ? (
        <>
          <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
          <circle cx="12" cy="12" r="3" />
        </>
      ) : (
        <>
          <path d="m3 3 18 18" />
          <path d="M10.6 6.1A11 11 0 0 1 12 6c6 0 9.5 6 9.5 6a15 15 0 0 1-3.2 3.8M6.3 6.8C3.7 8.6 2.5 12 2.5 12s3.5 6 9.5 6c1.5 0 2.9-.4 4.1-1" />
          <path d="M10.5 10.5a2.1 2.1 0 0 0 3 3" />
        </>
      )}
    </svg>
  );
}

export const inputStyles =
  "mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm outline-none transition-colors duration-200 hover:border-clinic-500 focus:border-clinic-700 focus:ring-2 focus:ring-clinic-100";

export default function CloudLoginPage() {
  const { authenticated, signIn, ready } = useCloudAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!ready) {
    return (
      <main className="grid min-h-screen place-items-center bg-clinic-50 text-clinic-700">
        Verifying session…
      </main>
    );
  }

  if (authenticated) return <Navigate to="/" replace />;

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      await signIn(email, password);
    } catch (err) {
      setError(err.message || "Sign-in failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_top_left,_rgba(60,122,115,0.15),_transparent_28%),linear-gradient(180deg,_#f8fbfb_0%,_#eef4f4_100%)] px-4 py-8 sm:py-12">
      <form
        onSubmit={submit}
        aria-label="Dental Record System sign in"
        className="w-full max-w-[420px] space-y-6 rounded-2xl border border-clinic-100 bg-white px-6 py-8 shadow-[0_20px_55px_-25px_rgba(22,53,51,0.30)] sm:px-9 sm:py-9"
      >
        <header className="text-center">
          <div className="mx-auto mb-4 flex h-[72px] w-[72px] items-center justify-center rounded-2xl bg-clinic-100">
            <ToothIcon />
          </div>
          <h1 className="text-[22px] font-bold leading-tight tracking-tight text-clinic-900 sm:text-2xl">
            Khurana Calilap Dental
          </h1>
          <p className="mt-1 text-sm font-semibold text-clinic-700">
            Record System
          </p>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            Sign in to access your clinic workspace.
          </p>
        </header>

        <div className="space-y-4">
          <div>
            <label htmlFor="cloud-login-email" className="block text-sm font-semibold text-clinic-900">
              Email
            </label>
            <input
              id="cloud-login-email"
              name="email"
              type="email"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="Enter your email"
              required
              value={email}
              onChange={(event) => { setEmail(event.target.value); if (error) setError(""); }}
              className={inputStyles}
            />
          </div>

          <div>
            <label htmlFor="cloud-login-password" className="block text-sm font-semibold text-clinic-900">
              Password
            </label>
            <div className="relative">
              <input
                id="cloud-login-password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Enter your password"
                required
                value={password}
                onChange={(event) => { setPassword(event.target.value); if (error) setError(""); }}
                className={`${inputStyles} pr-12`}
              />
              <button
                type="button"
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                title={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((current) => !current)}
                className="absolute inset-y-0 right-1 mt-2 flex w-10 items-center justify-center rounded-md text-slate-500 transition-colors hover:text-clinic-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-clinic-700"
              >
                <PasswordVisibilityIcon visible={showPassword} />
              </button>
            </div>
          </div>
        </div>

        {error ? (
          <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={busy}
          className="flex min-h-12 w-full items-center justify-center rounded-lg bg-clinic-700 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors duration-200 hover:bg-clinic-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clinic-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Signing in…" : "Sign In"}
        </button>
        <p className="text-center text-sm"><Link to="/forgot-password" className="font-semibold text-clinic-700 underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-clinic-700">Forgot password?</Link></p>
      </form>
    </main>
  );
}
