import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthPanel from "../components/AuthPanel.js";
import { useAuth } from "../context/AuthContext.js";

export default function ResetPasswordPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    if (password.length < 8) {
      setMessage("Use at least 8 characters for the new password.");
      return;
    }
    if (password !== confirmPassword) {
      setMessage("The passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      await auth.updateRecoveredPassword(password);
      navigate("/login", {
        replace: true,
        state: { recoveryComplete: true }
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update the password.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthPanel
      title="Set a new password"
      subtitle="This page only accepts a password change after a valid provider recovery session has been established."
      footer={
        <Link className="font-semibold text-clinic-700" to="/login">Return to sign in</Link>
      }
    >
      {!auth.configured ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {auth.configurationMessage ?? "Authentication is not configured yet."}
        </div>
      ) : null}
      {!auth.recoveringPassword ? (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          Open the secure password-recovery link sent to your email before setting a new password.
        </div>
      ) : null}
      {message ? (
        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{message}</div>
      ) : null}
      <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
        <label className="block">
          <span className="label-text">New password</span>
          <input
            className="text-input"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <label className="block">
          <span className="label-text">Confirm new password</span>
          <input
            className="text-input"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
        </label>
        <button
          className="button-primary w-full"
          type="submit"
          disabled={!auth.configured || !auth.recoveringPassword || submitting}
        >
          {submitting ? "Updating..." : "Update password"}
        </button>
      </form>
    </AuthPanel>
  );
}
