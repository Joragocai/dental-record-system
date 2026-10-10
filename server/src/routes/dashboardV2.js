// Compatibility re-export for plain JavaScript consumers. The hosted runtime
// imports roleDashboardRouter.js directly to avoid the same-basename TS resolver.
export { createDashboardV2Router } from "./roleDashboardRouter.js";
