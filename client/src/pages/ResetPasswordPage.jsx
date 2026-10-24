import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { readRecoveryCallback, validateNewPassword } from "../lib/passwordRecovery";
import { setRecoveredPassword, verifyPasswordRecoveryToken, clearCloudSession } from "../lib/cloudAuth";
import { ToothIcon, inputStyles } from "./CloudLoginPage";

export default function ResetPasswordPage() {
  const callbackRef=useRef(null);
  const verifyRef=useRef(null);
  const [accessToken,setAccessToken]=useState("");
  const [state,setState]=useState("checking");
  const [password,setPassword]=useState("");
  const [confirmation,setConfirmation]=useState("");
  const [showPassword,setShowPassword]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  useEffect(()=>{
    let active=true;
    if(!callbackRef.current) callbackRef.current=readRecoveryCallback(window.location);
    const data=callbackRef.current;
    // Erase sensitive URL tokens and error details from the address bar.
    window.history.replaceState(window.history.state,"",window.location.pathname);
    if(data.kind==="session") {setAccessToken(data.accessToken);setState("ready");}
    else if(data.kind==="token"){
      if(!verifyRef.current) verifyRef.current=verifyPasswordRecoveryToken(data.tokenHash);
      verifyRef.current.then(token=>{if(active){setAccessToken(token);setState("ready");}})
        .catch(()=>{if(active){setError("This recovery link is invalid or expired. Please request a new one.");setState("invalid");}});
    } else {
      setError(data.kind==="error"?"This recovery link is invalid or expired. Please request a new one.":"No valid recovery link was found. Request a fresh one.");
      setState("invalid");
    }
    return ()=>{active=false;};
  },[]);
  async function submit(event){
    event.preventDefault();
    if(busy || state!=="ready")return;
    const message=validateNewPassword(password,confirmation);
    if(message){setError(message);return;}
    setError("");setBusy(true);
    try {
      await setRecoveredPassword(accessToken,password);
      clearCloudSession();
      setAccessToken("");setPassword("");setConfirmation("");setState("success");
    } catch(err) {setError(err.message||"Password update failed. Request a fresh recovery link.");}
    finally {setBusy(false);}
  }
  return <main className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_top_left,_rgba(60,122,115,0.15),_transparent_28%),linear-gradient(180deg,_#f8fbfb_0%,_#eef4f4_100%)] px-4 py-8 sm:py-12">
    <form onSubmit={submit} aria-label="Set new password" className="w-full max-w-[420px] space-y-6 rounded-2xl border border-clinic-100 bg-white px-6 py-8 shadow-[0_20px_55px_-25px_rgba(22,53,51,0.30)] sm:px-9 sm:py-9">
      <header className="text-center">
        <div className="mx-auto mb-4 flex h-[72px] w-[72px] items-center justify-center rounded-2xl bg-clinic-100"><ToothIcon/></div>
        <h1 className="text-[22px] font-bold leading-tight tracking-tight text-clinic-900 sm:text-2xl">Khurana Calilap Dental</h1>
        <p className="mt-1 text-sm font-semibold text-clinic-700">Record System</p>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">Create a new password</p>
      </header>
      {state==="checking"?<p role="status" className="text-center text-sm text-slate-600">Verifying recovery link…</p>:null}
      {state==="ready"?<>
        <div><label htmlFor="new-password" className="block text-sm font-semibold text-clinic-900">New password</label>
          <input id="new-password" type={showPassword?"text":"password"} autoComplete="new-password" required minLength={8} maxLength={72} placeholder="At least 8 characters" value={password} onChange={e=>setPassword(e.target.value)} className={inputStyles}/></div>
        <div><label htmlFor="confirm-new-password" className="block text-sm font-semibold text-clinic-900">Confirm new password</label>
          <input id="confirm-new-password" type={showPassword?"text":"password"} autoComplete="new-password" required minLength={8} maxLength={72} placeholder="Re-enter your new password" value={confirmation} onChange={e=>setConfirmation(e.target.value)} className={inputStyles}/></div>
        <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={showPassword} onChange={e=>setShowPassword(e.target.checked)} className="accent-clinic-700"/>Show passwords</label>
        <button type="submit" disabled={busy} className="flex min-h-12 w-full items-center justify-center rounded-lg bg-clinic-700 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-clinic-500 disabled:opacity-60">{busy?"Updating…":"Update password"}</button>
      </>:null}
      {state==="success"?<p role="status" className="rounded-lg bg-clinic-50 px-3 py-3 text-sm text-clinic-900">Your password has been updated. You can now sign in using the same email and your new password.</p>:null}
      {error?<p role="alert" className="rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700">{error}</p>:null}
      <p className="text-center text-sm">{state==="invalid"?<Link to="/forgot-password" className="font-semibold text-clinic-700 underline-offset-4 hover:underline">Request another recovery link</Link>:<Link to="/" className="font-semibold text-clinic-700 underline-offset-4 hover:underline">Back to sign in</Link>}</p>
    </form>
  </main>;
}
