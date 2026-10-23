import { createContext, useContext, useEffect, useState } from "react";
import { cloudAuthEnabled, initializeCloudSession, subscribeToSession, getCloudAccessToken, signInCloud, signOutCloud } from "../lib/cloudAuth";

const CloudAuthContext = createContext({ enabled:false, ready:true, authenticated:true });
export function CloudAuthProvider({ children }) {
 const [session,setSession]=useState(null);
 const [ready,setReady]=useState(!cloudAuthEnabled);
 useEffect(()=>{
  if(!cloudAuthEnabled)return;
  const unsubscribe=subscribeToSession(setSession);
  const saved=initializeCloudSession();
  Promise.resolve(saved ? getCloudAccessToken() : null).catch(()=>null).finally(()=>setReady(true));
  return unsubscribe;
 },[]);
 return <CloudAuthContext.Provider value={{enabled:cloudAuthEnabled,ready,authenticated:!cloudAuthEnabled||Boolean(session),session,signIn:signInCloud,signOut:signOutCloud}}>{children}</CloudAuthContext.Provider>;
}
export function useCloudAuth(){return useContext(CloudAuthContext);}
