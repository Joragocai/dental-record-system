process.env.DENTAL_APP_MODE = "demo";

try {
  const { prepareDemoEnvironment, getDemoRuntimeSummary } = await import("../src/demo/demoEnvironment.js");
  const summary = getDemoRuntimeSummary();
  const result = await prepareDemoEnvironment();

  console.log(`Demo environment ${result.status === "created" ? "created" : "verified"} successfully.`);
  console.log("Database:", summary.database);
  console.log("Uploads:", summary.uploads);
  console.log("Exports:", summary.exports);
  console.log("Backups:", summary.backups);
  console.log("Anchor date:", result.anchorDate);
  console.log("Patients:", result.counts.patients);
  console.log("Treatments:", result.counts.treatments);
  console.log("Appointments:", result.counts.appointments);
  console.log("Attachments:", result.counts.attachments);
  console.log("Physical attachment files:", result.attachmentFiles);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
