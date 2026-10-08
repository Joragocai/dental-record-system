// Hosted deployments may never silently fall back to the local SQLite runtime.
const environment = (process.env.DENTAL_SERVER_ENV || "").trim().toLowerCase();
if (environment !== "staging" && environment !== "production") {
  throw new Error("Hosted startup requires DENTAL_SERVER_ENV=staging or production.");
}
await import("./index.js");
