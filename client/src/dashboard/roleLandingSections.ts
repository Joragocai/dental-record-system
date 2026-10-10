export interface LandingLink { key: string; label: string; path: string }
export interface LandingContext { displayName: string; roles: string[]; branchIds: string[]; links: LandingLink[] }
const allowedPaths = new Map([
 ["patient-portal","/patient-portal"],["patient-appointments","/patient-appointments"],
 ["patient-documents","/patient-documents"],["patient-finance","/patient-finance"],
 ["dentist-dashboard","/dentist-dashboard"],["clinic-administrator-dashboard","/clinic-administrator-dashboard"],
 ["personnel-dashboard","/personnel-dashboard"],["system-administrator-dashboard","/system-administrator-dashboard"],
 ["appointments","/appointments"],["clinic-finance","/clinic-finance"],
 ["clinic-patient-requests","/clinic-patient-requests"]
]);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function rec(value:unknown):Record<string,unknown>|null{return value && typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:null;}
export function parseLandingContext(value:unknown):LandingContext{
 const v=rec(value);
 if(!v||typeof v.displayName!=="string"||!Array.isArray(v.roles)||!Array.isArray(v.branchIds)||!Array.isArray(v.links)||
  !v.roles.length||!v.roles.every((r:unknown)=>typeof r==="string"&&["PATIENT","PERSONNEL","DENTIST","CLINIC_ADMINISTRATOR","SYSTEM_ADMINISTRATOR"].includes(r))||
  !v.branchIds.every((b:unknown)=>typeof b==="string"&&uuid.test(b))||
  !v.links.every((item:unknown)=>{const l=rec(item);return l&&typeof l.key==="string"&&allowedPaths.get(l.key)===l.path&&typeof l.label==="string"&&l.label.length<=100;}))
  throw Error("Invalid role navigation.");
 const roles=[...new Set(v.roles as string[])], links=v.links as LandingLink[];
 if(roles.includes("PATIENT") && (roles.length!==1||v.branchIds.length!==0||links.some(l=>!l.key.startsWith("patient-"))))throw Error("Invalid patient role navigation.");
 if(roles.includes("SYSTEM_ADMINISTRATOR")&&(roles.length!==1||v.branchIds.length!==0||links.some(l=>l.key!=="system-administrator-dashboard")))throw Error("Invalid technical navigation.");
 if(!roles.includes("PATIENT") && links.some(l=>l.key.startsWith("patient-")))throw Error("Invalid OWN navigation.");
 return {displayName:v.displayName,roles,branchIds:v.branchIds as string[],links};
}
export function landingSections(c:LandingContext){
 const keys=(items:string[])=>c.links.filter(l=>items.includes(l.key));
 if(c.roles.length===1&&c.roles[0]==="PATIENT")return [{title:"My patient portal",links:keys(["patient-portal","patient-appointments","patient-documents","patient-finance"])}];
 if(c.roles.includes("DENTIST")&&c.roles.includes("CLINIC_ADMINISTRATOR"))return [
  {title:"Clinical workspace",links:keys(["dentist-dashboard","appointments","clinic-patient-requests"])},
  {title:"Clinic management",links:keys(["clinic-administrator-dashboard","clinic-finance"])},
  {title:"Other authorized links",links:c.links.filter(l=>!["dentist-dashboard","appointments","clinic-patient-requests","clinic-administrator-dashboard","clinic-finance"].includes(l.key))}
 ].filter(s=>s.links.length>0);
 return [{title:"Authorized workspaces",links:c.links}];
}
