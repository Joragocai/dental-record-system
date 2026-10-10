export interface ClinicAdministratorAccess {
  auditRead: boolean;
  staffCreate: boolean;
  roleApprove: boolean;
  financialOversight: boolean;
  expenseApprove: boolean;
  payableApprove: boolean;
  closingApprove: boolean;
}
export interface SafeAuditActivity { action: string; occurredAt: string; outcome: string }
function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}
export function parseClinicAdministratorAccess(value: unknown): ClinicAdministratorAccess {
  const data=record(value), roles=data?.roles, links=data?.links, capabilities=record(data?.clinicAdministrator);
  if(!data || !Array.isArray(roles) || !roles.includes("CLINIC_ADMINISTRATOR") ||
    roles.includes("SYSTEM_ADMINISTRATOR") || !Array.isArray(links) ||
    !links.some((link:unknown) => { const item=record(link); return item?.key==="clinic-administrator-dashboard" && item.path==="/clinic-administrator-dashboard"; }) ||
    !capabilities) throw new Error("Clinic administrator access unavailable.");
  const keys=["auditRead","staffCreate","roleApprove","financialOversight","expenseApprove","payableApprove","closingApprove"] as const;
  if(!keys.every((key)=>typeof capabilities[key]==="boolean")) throw new Error("Invalid administrator capabilities.");
  return Object.fromEntries(keys.map((key)=>[key,capabilities[key]])) as unknown as ClinicAdministratorAccess;
}
export function parseSafeAuditActivity(payload: unknown): SafeAuditActivity[] {
  const data=record(payload), items=data?.items;
  if(!data || data.limit!==10 || data.offset!==0 || !Array.isArray(items) || items.length>10) throw new Error("Audit list unavailable.");
  return items.map((raw:unknown) => {
    const item=record(raw);
    if(!item || typeof item.action!=="string" || !/^[A-Z][A-Z0-9_]{1,99}$/.test(item.action) ||
      typeof item.occurredAt!=="string" || !Number.isFinite(Date.parse(item.occurredAt)) ||
      typeof item.outcome!=="string" || !["SUCCESS","DENIED","FAILED"].includes(item.outcome))
      throw new Error("Audit item invalid.");
    return {action:item.action,occurredAt:item.occurredAt,outcome:item.outcome};
  });
}
