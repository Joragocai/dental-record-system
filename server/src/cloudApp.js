import cors from "cors";
import express from "express";
import { createPostgresClinicalRouter } from "./routes/postgresClinical.js";
import { createCloudAttachmentsRouter } from "./routes/cloudAttachments.js";
import { createCloudDemoRouter } from "./routes/cloudDemo.js";
import { createCloudExportsRouter } from "./routes/cloudExports.js";
import { createCloudBackupRouter } from "./routes/cloudBackup.js";
import { createSupabaseAuthMiddleware, getSupabaseAuthConfig } from "./auth/supabaseAuth.js";

// A separate PostgreSQL-only HTTP application. Never mount the old SQLite
// routes, public /uploads, or unprotected demo/reset and backup routes here.
export function createCloudApp({ config = getSupabaseAuthConfig(), verifier, pool, origins } = {}) {
  const app = express();
  const allowed = new Set(origins || String(process.env.CLOUD_ALLOWED_ORIGINS || "")
    .split(",").map(x => x.trim()).filter(Boolean));
  if (!allowed.size) throw new Error("CLOUD_ALLOWED_ORIGINS must identify the trusted frontend.");
  const requireAuth = createSupabaseAuthMiddleware(config, verifier);
  app.disable("x-powered-by");
  app.use(cors({
    origin(origin, cb) {
      if (!origin || allowed.has(origin)) return cb(null, true);
      return cb(new Error("Origin is not allowed."));
    },
    allowedHeaders: ["Content-Type", "Authorization"],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"]
  }));
  app.use(express.json({ limit: "1mb" }));
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  // Clinical and authentication-dependent responses must not be stored by
  // browsers or shared intermediary caches, including denied requests.
  app.use("/api", (_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
  app.use("/api", requireAuth);
  app.use("/api", createPostgresClinicalRouter(pool));
  app.use("/api", createCloudAttachmentsRouter(pool));
  app.use("/api", createCloudDemoRouter(pool));
  app.use("/api", createCloudExportsRouter(pool));
  app.use("/api", createCloudBackupRouter());
  app.use("/api", (_req, res) => res.status(404).json({ message: "Endpoint not available in cloud mode." }));
  app.use((error, _req, res, _next) => {
    if (error?.status) return res.status(error.status).json({ message: error.message });
    console.error("[cloud] Request failed", error?.message);
    return res.status(500).json({ message: "Internal server error." });
  });
  return app;
}
