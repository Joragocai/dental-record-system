process.env.DENTAL_APP_MODE = "demo";

try {
  const { cleanupDemoEnvironment } = await import("../src/demo/demoCleanup.js");
  const result = await cleanupDemoEnvironment();

  if (result.removedPaths.length) {
    console.log("Removed demo artifacts:");
    result.removedPaths.forEach((entry) => console.log(`- ${entry}`));
  } else {
    console.log("No generated demo artifacts were present.");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
