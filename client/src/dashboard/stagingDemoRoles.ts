/** Staging-only, fictional, read-only dashboard tour. Never an RBAC grant. */
export const demoRoleNames = ["Patient", "Personnel", "Dentist", "Clinic Administrator", "System Administrator", "Owner-Dentist"] as const;
export type DemoRoleName = (typeof demoRoleNames)[number];

export const demoRoleCards: Record<DemoRoleName, { description: string; tiles: readonly string[] }> = {
  Patient: { description: "My portal — fictional preview", tiles: ["My dental records", "My appointment requests", "Patient-visible documents", "My balance and payment history"] },
  Personnel: { description: "Front-desk workspace — fictional preview", tiles: ["Assigned clinic appointments", "Patient registration and lookup", "Appointment request review", "Daily collections and expenses"] },
  Dentist: { description: "Clinical workspace — fictional preview", tiles: ["Today's clinical schedule", "Patient lookup", "Treatment publication", "Clinical documents"] },
  "Clinic Administrator": { description: "Business governance — fictional preview", tiles: ["Staff account approval", "Audit activity", "Clinic finance oversight", "Expenses and cash closing"] },
  "System Administrator": { description: "Technical-only workspace — fictional preview", tiles: ["API readiness", "Account support", "System role definitions", "Technical maintenance"] },
  "Owner-Dentist": { description: "Combined clinical and business workspaces — fictional preview", tiles: ["Dentist workspace", "Clinic administration", "Appointment scheduling", "Business oversight"] }
};

export function isStagingDemoEnabled(environment: string | undefined, productionBuild: boolean): boolean {
  return environment === "staging" && productionBuild;
}

export function mayPreviewStagingRoles(roles: readonly string[]): boolean {
  return roles.length === 2 && roles.includes("DENTIST") && roles.includes("CLINIC_ADMINISTRATOR");
}

export function demoTiles(role: DemoRoleName): readonly string[] {
  return demoRoleCards[role].tiles;
}
