export interface TechnicalAccess {
  technicalAccountRead: boolean;
  roleDefinitionsConfigure: boolean;
}
export interface TechnicalStatus { api: "reachable"; readiness: "ready" | "unavailable" }
function record(value: unknown): Record<string,unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string,unknown> : null;
}
export function parseTechnicalAccess(value: unknown): TechnicalAccess {
  const data=record(value), roles=data?.roles, links=data?.links, permission=record(data?.systemAdministrator);
  if(!data || !Array.isArray(roles) || roles.length!==1 || roles[0]!=="SYSTEM_ADMINISTRATOR" ||
     !Array.isArray(links) || !links.some((link:unknown)=>{
       const row=record(link);return row?.key==="system-administrator-dashboard" && row.path==="/system-administrator-dashboard";
     }) || !permission || typeof permission.technicalAccountRead!=="boolean" ||
     typeof permission.roleDefinitionsConfigure!=="boolean" || permission.technicalAccountRead!==true) {
    throw new Error("Technical dashboard authorization unavailable.");
  }
  return {technicalAccountRead:true,roleDefinitionsConfigure:permission.roleDefinitionsConfigure===true};
}
export function parseTechnicalStatus(value:unknown): TechnicalStatus {
  const data=record(value);
  if(!data || Object.keys(data).length!==2 || data.api!=="reachable" ||
     (data.readiness!=="ready" && data.readiness!=="unavailable")) {
    throw new Error("Technical status response invalid.");
  }
  return {api:"reachable",readiness:data.readiness};
}
