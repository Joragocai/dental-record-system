import cors from "cors";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import patientsRouter from "./routes/patients.js";
import treatmentsRouter from "./routes/treatments.js";
import attachmentsRouter from "./routes/attachments.js";
import exportRouter from "./routes/exports.js";
import backupRouter from "./routes/backup.js";
import dashboardRouter from "./routes/dashboard.js";

const app = express();
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(currentDir, "../..");
const allowedOrigins = new Set(["http://127.0.0.1:5173", "http://localhost:5173"]);

app.use(
  cors({
    origin(origin, callback) {
      // Allow same-machine browser access from either localhost or 127.0.0.1.
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`CORS blocked for origin: ${origin}`));
    }
  })
);
app.use(express.json({ limit: "10mb" }));
app.use("/uploads", express.static(path.join(rootDir, "uploads")));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/dashboard", dashboardRouter);
app.use("/api/patients", patientsRouter);
app.use("/api/treatments", treatmentsRouter);
app.use("/api/attachments", attachmentsRouter);
app.use("/api/export", exportRouter);
app.use("/api/backup", backupRouter);

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ message: "Internal server error." });
});

export default app;
