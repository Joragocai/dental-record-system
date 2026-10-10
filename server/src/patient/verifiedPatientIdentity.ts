import type {AuthenticationConfig} from "../auth/authConfig.js";
import {getAuthenticationConfig} from "../auth/authConfig.js";
import {PatientEnrollmentError} from "../services/patientEnrollmentErrors.js";

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Only server-to-Supabase verified-user response, never a browser flag, can establish verified email. */
export function createVerifiedPatientIdentityService(
 config:AuthenticationConfig=getAuthenticationConfig(), fetchImpl:typeof fetch=fetch
){
 return {
  async requireConfirmedEmail(accessToken:string,expectedAuthId:string):Promise<{authUserId:string;email:string}>{
   if(!uuid.test(expectedAuthId)||!accessToken||!accessToken.trim())throw new PatientEnrollmentError("IDENTITY_UNVERIFIED");
   const controller=new AbortController();
   const timeout=setTimeout(()=>controller.abort(),config.requestTimeoutMs);
   try{
    const response=await fetchImpl(config.supabaseUrl+"/auth/v1/user",{
     method:"GET",headers:{apikey:config.publishableKey,Authorization:"Bearer "+accessToken,Accept:"application/json"},
     signal:controller.signal
    });
    if(!response.ok)throw new PatientEnrollmentError("IDENTITY_UNVERIFIED");
    const body:unknown=await response.json();
    if(!body||typeof body!=="object")throw new PatientEnrollmentError("IDENTITY_UNVERIFIED");
    const user=body as Record<string,unknown>;
    const normalizedEmail=typeof user.email==="string"?user.email.trim().toLowerCase():"";
    // Supabase reports email_confirmed_at on /auth/v1/user only after email verification.
    if(user.id!==expectedAuthId||!normalizedEmail||typeof user.email_confirmed_at!=="string"||
       !Number.isFinite(Date.parse(user.email_confirmed_at)))throw new PatientEnrollmentError("IDENTITY_UNVERIFIED");
    return {authUserId:expectedAuthId,email:normalizedEmail};
   }catch{
    throw new PatientEnrollmentError("IDENTITY_UNVERIFIED");
   }finally{clearTimeout(timeout)}
  }
 };
}
