import { defineConfig, loadEnv } from "vite";
import { assertStagingBuildEnvironment } from "./stagingBuildGuard.js";
import react from "@vitejs/plugin-react";

export default defineConfig(({ command, mode }) => {
  if (command === "build") {
    assertStagingBuildEnvironment(loadEnv(mode, process.cwd(), ""));
  }
  return {
  plugins: [react()],
  server: {
    port: 5173,
  },
  };
});
