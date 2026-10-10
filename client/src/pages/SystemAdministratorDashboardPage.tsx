import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { authenticatedV2Fetch } from "../auth/authApi.js";
import { useAuth } from "../context/AuthContext.js";
import SystemAdministratorDashboardView from "./SystemAdministratorDashboardView.js";
import { parseTechnicalAccess, parseTechnicalStatus, type TechnicalAccess, type TechnicalStatus } from "../dashboard/systemAdministratorData.js";

export default function SystemAdministratorDashboardPage() {
  const auth=useAuth();
  const options=useMemo(()=>auth.providerSession?.accessToken && auth.apiBaseUrl
    ? {accessToken:auth.providerSession.accessToken,apiBaseUrl:auth.apiBaseUrl}:null,
    [auth.providerSession?.accessToken,auth.apiBaseUrl]);
  const [access,setAccess]=useState<TechnicalAccess|null>(null);
  const [status,setStatus]=useState<TechnicalStatus|null>(null);
  const [busy,setBusy]=useState(true);
  const [error,setError]=useState("");
  const [generation,setGeneration]=useState(0);
  useEffect(()=>{
    const refresh=()=>{if(document.visibilityState==="visible"){setAccess(null);setStatus(null);setGeneration(n=>n+1);}};
    window.addEventListener("focus",refresh);
    document.addEventListener("visibilitychange",refresh);
    return()=>{window.removeEventListener("focus",refresh);document.removeEventListener("visibilitychange",refresh);};
  },[]);
  useEffect(()=>{
    let active=true;
    setAccess(null);setStatus(null);setBusy(true);setError("");
    if(!options){setBusy(false);return()=>{active=false;};}
    void (async()=>{
      try {
        const context=await authenticatedV2Fetch("/dashboard/context",{cache:"no-store"},options);
        if(!context.ok)throw Error("Not authorized");
        const capabilities=parseTechnicalAccess(await context.json());
        if(!active)return;
        const response=await authenticatedV2Fetch("/technical/status",{cache:"no-store"},options);
        if(!response.ok)throw Error("Technical status unavailable");
        const snapshot=parseTechnicalStatus(await response.json());
        if(!active)return;
        setAccess(capabilities);
        setStatus(snapshot);
      }catch {
        if(active){setAccess(null);setStatus(null);setError("Technical status or current authorization could not be verified. Try again later.");}
      }finally {if(active)setBusy(false);}
    })();
    return()=>{active=false;};
  },[options,generation]);
  return <SystemAdministratorDashboardView access={access} status={status} busy={busy} error={error} />;
}
