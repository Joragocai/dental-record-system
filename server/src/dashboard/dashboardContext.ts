import type { AuthorizationContext } from "../services/authorizationService.js";

export interface DashboardLink {
  key: string;
  label: string;
  path: string;
}

export interface PersonnelDashboardCapabilities {
  patientLookup: boolean;
  requestReview: boolean;
  dailyFinanceRead: boolean;
  receivablesRead: boolean;
  expenseCreate: boolean;
}

export interface DentistDashboardCapabilities {
  userId: string;
  patientLookup: boolean;
  requestReview: boolean;
  treatmentPublish: boolean;
  documentVisibility: boolean;
}

export interface ClinicAdministratorCapabilities {
  auditRead: boolean;
  staffCreate: boolean;
  roleApprove: boolean;
  financialOversight: boolean;
  expenseApprove: boolean;
  payableApprove: boolean;
  closingApprove: boolean;
}

export interface SystemAdministratorCapabilities {
  technicalAccountRead: boolean;
  roleDefinitionsConfigure: boolean;
}

export interface DashboardContext {
  systemAdministrator?: SystemAdministratorCapabilities;
  clinicAdministrator?: ClinicAdministratorCapabilities;
  personnel?: PersonnelDashboardCapabilities;
  dentist?: DentistDashboardCapabilities;
  displayName: string;
  roles: AuthorizationContext["roles"];
  branchIds: string[];
  links: DashboardLink[];
}

const links = [
  { key: "system-administrator-dashboard", label: "System administration", path: "/system-administrator-dashboard", permission: "user.read", scope: "GLOBAL" },
  { key: "clinic-administrator-dashboard", label: "Clinic administration", path: "/clinic-administrator-dashboard", permission: "audit.read", scope: "GLOBAL" },
  { key: "dentist-dashboard", label: "Dentist workspace", path: "/dentist-dashboard", permission: "appointment.list", scope: "BRANCH" },
  { key: "personnel-dashboard", label: "Personnel workspace", path: "/personnel-dashboard", permission: "appointment.list", scope: "BRANCH" },
  { key: "patient-portal", label: "My dental records", path: "/patient-portal", permission: "portal.profile.read", scope: "OWN" },
  { key: "patient-appointments", label: "My appointment requests", path: "/patient-appointments", permission: "portal.appointments.request", scope: "OWN" },
  { key: "patient-documents", label: "My documents and privacy", path: "/patient-documents", permission: "portal.documents.read", scope: "OWN" },
  { key: "patient-finance", label: "My payments and balance", path: "/patient-finance", permission: "portal.balance.read", scope: "OWN" },
  { key: "appointments", label: "Clinic appointments", path: "/appointments", permission: "appointment.list", scope: "BRANCH" },
  { key: "clinic-finance", label: "Clinic finance", path: "/clinic-finance", permission: "finance.daily.read", scope: "BRANCH" },
  { key: "clinic-patient-requests", label: "Review patient requests", path: "/clinic-patient-requests", permission: "appointment.reschedule", scope: "BRANCH" }
] as const;

export function projectDashboardContext(context: AuthorizationContext): DashboardContext {
  if (context.status !== "active" || context.roles.length === 0) {
    throw new Error("Dashboard context requires an active user with an assigned role.");
  }
  const validRoles = new Set(["PATIENT", "PERSONNEL", "DENTIST", "CLINIC_ADMINISTRATOR", "SYSTEM_ADMINISTRATOR"]);
  if (context.roles.some((role) => !validRoles.has(role))) throw new Error("Unrecognized dashboard role.");
  const branchIds = context.roles.includes("SYSTEM_ADMINISTRATOR")
    ? []
    : [...new Set(context.branchIds)].sort();
  const hasPersonnelGrant = (code: string) =>
    branchIds.length > 0 && context.permissions.some((grant) => grant.code === code && grant.scope === "BRANCH");
  const personnel: PersonnelDashboardCapabilities | undefined = context.roles.includes("PERSONNEL") && !context.roles.includes("SYSTEM_ADMINISTRATOR")
    ? {
        patientLookup: hasPersonnelGrant("appointment.patient_lookup"),
        requestReview: hasPersonnelGrant("appointment.cancel") || hasPersonnelGrant("appointment.reschedule"),
        dailyFinanceRead: hasPersonnelGrant("finance.daily.read"),
        receivablesRead: hasPersonnelGrant("finance.receivables.read"),
        expenseCreate: hasPersonnelGrant("finance.expense.create")
      }
    : undefined;
  const dentist: DentistDashboardCapabilities | undefined =
    context.roles.includes("DENTIST") && !context.roles.includes("SYSTEM_ADMINISTRATOR")
      ? {
          userId: context.userId,
          patientLookup: hasPersonnelGrant("appointment.patient_lookup"),
          requestReview: hasPersonnelGrant("appointment.cancel") || hasPersonnelGrant("appointment.reschedule"),
          treatmentPublish: hasPersonnelGrant("treatment.publish"),
          documentVisibility: hasPersonnelGrant("attachment.update")
        }
      : undefined;
  const admin = context.roles.includes("CLINIC_ADMINISTRATOR") && !context.roles.includes("SYSTEM_ADMINISTRATOR");
  const hasAdminGrant = (code: string) => admin &&
    context.permissions.some((grant) => grant.code === code && grant.scope === "GLOBAL");
  const clinicAdministrator: ClinicAdministratorCapabilities | undefined = admin
    ? {
        auditRead: hasAdminGrant("audit.read"),
        staffCreate: hasAdminGrant("staff_account.create"),
        roleApprove: hasAdminGrant("role_assignment.approve"),
        financialOversight: hasAdminGrant("finance.admin.read"),
        expenseApprove: hasAdminGrant("finance.expense.approve"),
        payableApprove: hasAdminGrant("finance.payable.approve"),
        closingApprove: hasAdminGrant("finance.closing.approve")
      } : undefined;
  const technicalOnly = context.roles.length === 1 && context.roles[0] === "SYSTEM_ADMINISTRATOR";
  const systemAdministrator: SystemAdministratorCapabilities | undefined = technicalOnly ? {
    technicalAccountRead: context.permissions.some((grant) => grant.code === "user.read" && grant.scope === "GLOBAL"),
    roleDefinitionsConfigure: context.permissions.some((grant) => grant.code === "role_definition.configure" && grant.scope === "GLOBAL")
  } : undefined;
  return {
    ...(systemAdministrator ? { systemAdministrator } : {}),
    ...(clinicAdministrator ? { clinicAdministrator } : {}),
    ...(personnel ? { personnel } : {}),
    ...(dentist ? { dentist } : {}),
    displayName: context.displayName,
    roles: [...new Set(context.roles)].sort(),
    branchIds,
    links: links.filter((link) => {
      if (link.key === "system-administrator-dashboard") return Boolean(systemAdministrator && Object.values(systemAdministrator).some(Boolean));
      if (context.roles.includes("SYSTEM_ADMINISTRATOR")) return false;
      const operational = context.roles.includes("PERSONNEL") || context.roles.includes("DENTIST");
      if ((link.key === "appointments" || link.key === "clinic-finance") && !operational) return false;
      const isRequestReview = link.key === "clinic-patient-requests";
      if (isRequestReview && !context.roles.some((role) => role === "PERSONNEL" || role === "DENTIST")) return false;
      if (link.key === "personnel-dashboard" && !context.roles.includes("PERSONNEL")) return false;
      if (link.key === "dentist-dashboard" && !context.roles.includes("DENTIST")) return false;
      if (link.key === "clinic-administrator-dashboard") return Boolean(clinicAdministrator && Object.values(clinicAdministrator).some(Boolean));
      return context.permissions.some((grant) =>
        (grant.code === link.permission || (isRequestReview && grant.code === "appointment.cancel")) &&
        grant.scope === link.scope &&
        (grant.scope !== "BRANCH" || branchIds.length > 0)
      );
    }).map(({ key, label, path }) => ({ key, label, path }))
  };
}
