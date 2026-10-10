import {useState,type FormEvent} from "react";
import {useNavigate} from "react-router-dom";
import {useAuth} from "../context/AuthContext.js";
export default function ActivatePatientAccountPage(){
 const auth=useAuth(),navigate=useNavigate();
 const [password,setPassword]=useState(""),[confirmation,setConfirmation]=useState("");
 const [message,setMessage]=useState(""),[working,setWorking]=useState(false);
 async function submit(e:FormEvent){
  e.preventDefault();setMessage("");
  if(password.length<12 || password!==confirmation){setMessage("Use matching passwords of at least 12 characters.");return}
  setWorking(true);
  try{await auth.completeInvitedPatientAccount(password);navigate("/login",{replace:true,state:{activationComplete:true}})}
  catch{setMessage("Unable to activate your patient account. Contact the clinic.");}
  finally{setWorking(false)}
 }
 return <main className="mx-auto max-w-md p-8"><h1 className="text-2xl font-semibold">Activate patient account</h1>
  <p className="mt-2">Open the invitation sent by the clinic before choosing your password.</p>
  {message?<p role="alert">{message}</p>:null}
  <form onSubmit={submit} className="mt-6 space-y-4">
   <label className="block">New password<input className="text-input" type="password" autoComplete="new-password" required minLength={12} value={password} onChange={e=>setPassword(e.target.value)}/></label>
   <label className="block">Confirm password<input className="text-input" type="password" autoComplete="new-password" required minLength={12} value={confirmation} onChange={e=>setConfirmation(e.target.value)}/></label>
   <button className="button-primary" type="submit" disabled={!auth.configured||!auth.providerSession||working}>{working?"Activating...":"Activate account"}</button>
  </form>
 </main>
}
