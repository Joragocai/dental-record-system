import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { authenticatedV2Fetch } from "../auth/authApi.js";
import { useAuth } from "../context/AuthContext.js";
import ClinicAdministratorDashboardView from "./ClinicAdministratorDashboardView.js";
import { parseClinicAdministratorAccess, parseSafeAuditActivity, type ClinicAdministratorAccess, type SafeAuditActivity } from "../dashboard/clinicAdministratorDashboardData.js";

export default function ClinicAdministratorDashboardPage() {
  const auth=useAuth();
  const options=useMemo(()=>auth.providerSession?.accessToken&&auth.apiBaseUrl?
    {accessToken:auth.providerSession.accessToken,apiBaseUrl:auth.apiBaseUrl}:null,
    [auth.providerSession?.accessToken,auth.apiBaseUrl]);
  const [access,setAccess]=useState<ClinicAdministratorAccess|null>(null);
  const [activity,setActivity]=useState<SafeAuditActivity[]|null>(null);
  const [loading,setLoading]=useState(true);
  const [message,setMessage]=useState("");
  const [generation,setGeneration]=useState(0);
  useEffect(()=>{
    const refresh=()=>{if(document.visibilityState==="visible"){setAccess(null);setActivity(null);setGeneration(n=>n+1);}};
    window.addEventListener("focus",refresh);
    document.addEventListener("visibilitychange",refresh);
    return ()=>{window.removeEventListener("focus",refresh);document.removeEventListener("visibilitychange",refresh);};
  },[]);
  useEffect(()=>{
    let active=true;
    setAccess(null);setActivity(null);setLoading(true);setMessage("");
    if(!options){setLoading(false);return()=>{active=false;};}
    void (async()=>{
      try{
        const context=await authenticatedV2Fetch("/dashboard/context",{cache:"no-store"},options);
        if(!context.ok)throw Error("Unauthorized");
        const capabilities=parseClinicAdministratorAccess(await context.json());
        if(!active)return;
        setAccess(capabilities);
        if(capabilities.auditRead){
          const response=await authenticatedV2Fetch("/audit-events?limit=10&offset=0",{cache:"no-store"},options);
          if(!response.ok)throw Error("Audit unavailable");
          const safe=parseSafeAuditActivity(await response.json());
          if(active)setActivity(safe);
        }
      }catch{
        if(active)setMessage("Administrative authorization or recent activity could not be verified. No privileged data are displayed from an unsuccessful request.");
      }finally{if(active)setLoading(false);}
    })();
    return()=>{active=false;};
  },[options,generation]);
  return <ClinicAdministratorDashboardView access={access} activity={activity} loading={loading} message={message} />;
}
