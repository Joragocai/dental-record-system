import {useEffect,useMemo,useState} from "react";
import {Link} from "react-router-dom";
import {useAuth} from "../context/AuthContext.js";
import {authenticatedV2Fetch} from "../auth/authApi.js";
import PatientPortalView, {type PortalProfile,type PortalTreatment,type PortalAppointment} from "./PatientPortalView.js";
type Profile=PortalProfile;
type Treatment=PortalTreatment;
type Appointment=PortalAppointment;
export default function PatientPortalPage(){
 const auth=useAuth();
 const [profile,setProfile]=useState<Profile|null>(null);
 const [treatments,setTreatments]=useState<Treatment[]>([]);
 const [appointments,setAppointments]=useState<Appointment[]>([]);
 const [error,setError]=useState("");const [busy,setBusy]=useState(true);
 const [phone,setPhone]=useState("");const [address,setAddress]=useState("");
 const options=useMemo(()=>auth.providerSession?.accessToken&&auth.apiBaseUrl?{accessToken:auth.providerSession.accessToken,apiBaseUrl:auth.apiBaseUrl}:null,[auth.providerSession?.accessToken,auth.apiBaseUrl]);
 useEffect(()=>{
  setProfile(null);setTreatments([]);setAppointments([]);
  setPhone("");setAddress("");setError("");setBusy(true);
  if(!options){setBusy(false);return}
  let active=true;
  async function load(){
   try{
    const paths=["/me/patient-profile","/me/treatments","/me/appointments"];
    const responses=await Promise.all(paths.map(path=>authenticatedV2Fetch(path,{},options!)));
    if(responses.some(r=>!r.ok))throw new Error("The patient portal could not verify your account.");
    const [p,t,a]=await Promise.all(responses.map(r=>r.json()));
    if(active){setProfile(p);setPhone(p.mobileNumber);setAddress(p.homeAddress??"");setTreatments(t);setAppointments(a)}
   }catch{if(active)setError("Your patient records are unavailable. Contact the clinic if your account should be active.")}
   finally{if(active)setBusy(false)}
  }
  void load();return()=>{active=false};
 },[options]);
 async function save(){
  if(!options)return;
  const response=await authenticatedV2Fetch("/me/patient-profile",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({mobileNumber:phone,homeAddress:address})},options);
  if(response.ok)setProfile(await response.json());
  else setError("Unable to save contact information.");
 }
 return <PatientPortalView profile={profile} treatments={treatments} appointments={appointments} error={error} busy={busy} phone={phone} address={address} setPhone={setPhone} setAddress={setAddress} save={()=>void save()} />;
}
