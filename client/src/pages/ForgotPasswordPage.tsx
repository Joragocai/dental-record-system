import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import AuthPanel from "../components/AuthPanel.js";
import { useAuth } from "../context/AuthContext.js";

const genericRecoveryMessage =
  "If an eligible account exists for that email, password recovery instructions have been sent.";

export default function ForgotPasswordPage() {
  const auth = useAuth();
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      if (auth.configured) {
        await auth.requestPasswordRecovery(email);
      }
    } catch {
      // Do not reveal provider/account-existence details in recovery UI.
    } finally {
      setSubmitted(true);
      setSubmitting(false);
    }
  }

  return (
    <AuthPanel
      title="Recover account"
      subtitle="Enter the verified email address associated with your account."
      footer={
        <>
          Remembered your password? <Link className="font-semibold text-clinic-700" to="/login">Return to sign in</Link>
        </>
      }
    >
      {submitted ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          {genericRecoveryMessage}
        </div>
      ) : (
        <form className="space-y-4" onSubmit={handleSubmit}>
          {!auth.configured ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              {auth.configurationMessage ?? "Authentication is not configured yet."}
            </div>
          ) : null}
          <label className="block">
            <span className="label-text">Email address</span>
            <input
              className="text-input"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <button className="button-primary w-full" type="submit" disabled={!auth.configured || submitting}>
            {submitting ? "Sending..." : "Send recovery instructions"}
          </button>
        </form>
      )}
    </AuthPanel>
  );
}
