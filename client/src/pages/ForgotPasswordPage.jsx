import { useState } from "react";
import { Link } from "react-router-dom";
import { requestPasswordRecovery } from "../lib/cloudAuth";
import { inputStyles } from "./CloudLoginPage";
import ClinicBrandMark from "../components/ClinicBrandMark";

export default function ForgotPasswordPage() {
  const [email,setEmail]=useState("");
  const [busy,setBusy]=useState(false);
  const [sent,setSent]=useState(false);
  const [error,setError]=useState("");
  async function submit(event) {
    event.preventDefault();
    if(busy)return;
    setError("");setBusy(true);
    try {await requestPasswordRecovery(email);setSent(true);}
    catch (err) {setError(err.message || "Unable to send recovery instructions.");}
    finally {setBusy(false);}
  }
  return <main className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_top_left,_rgba(60,122,115,0.15),_transparent_28%),linear-gradient(180deg,_#f8fbfb_0%,_#eef4f4_100%)] px-4 py-8 sm:py-12">
    <form onSubmit={submit} aria-label="Request password reset" className="w-full max-w-[420px] space-y-6 rounded-2xl border border-clinic-100 bg-white px-6 py-8 shadow-[0_20px_55px_-25px_rgba(22,53,51,0.30)] sm:px-9 sm:py-9">
      <header className="text-center">
        <div className="mx-auto mb-4 flex h-[72px] w-[72px] items-center justify-center rounded-2xl bg-clinic-100"><ClinicBrandMark/></div>
        <h1 className="text-[22px] font-bold leading-tight tracking-tight text-clinic-900 sm:text-2xl">Khurana Calilap Dental</h1>
        <p className="mt-1 text-sm font-semibold text-clinic-700">Record System</p>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">Reset your password</p>
      </header>
      {sent ? <p role="status" className="rounded-lg bg-clinic-50 px-3 py-3 text-sm text-clinic-900">If that email has an account, password recovery instructions will arrive shortly. Check your inbox and spam folder.</p> : <>
        <div><label htmlFor="recovery-email" className="block text-sm font-semibold text-clinic-900">Account email</label>
          <input id="recovery-email" type="email" autoComplete="email" required autoCapitalize="none" spellCheck={false} placeholder="Enter your account email" value={email} onChange={e=>setEmail(e.target.value)} className={inputStyles}/>
        </div>
        {error ? <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700">{error}</p>:null}
        <button type="submit" disabled={busy} className="flex min-h-12 w-full items-center justify-center rounded-lg bg-clinic-700 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-clinic-500 disabled:opacity-60">{busy?"Sending…":"Send recovery email"}</button>
      </>}
      <p className="text-center text-sm"><Link to="/" className="font-semibold text-clinic-700 underline-offset-4 hover:underline">Back to sign in</Link></p>
    </form>
  </main>;
}
