import cors from "cors";
import express from "express";
import patientsRouter from "./routes/patients.js";
import treatmentsRouter from "./routes/treatments.js";
import attachmentsRouter from "./routes/attachments.js";
import exportRouter from "./routes/exports.js";
import backupRouter from "./routes/backup.js";
import dashboardRouter from "./routes/dashboard.js";
import appointmentsRouter from "./routes/appointments.js";
import runtimeRouter from "./routes/runtime.js";
import { createAuthRouter } from "./routes/auth.js";
import { createStaffAccountsRouter } from "./routes/staffAccounts.js";
import { createAuditEventsRouter } from "./routes/auditEvents.js";
import { createRequestIdMiddleware } from "./middleware/requestId.js";

const app = express();
const allowedOrigins = new Set(["http://127.0.0.1:5173", "http://localhost:5173"]);
const authRouter = createAuthRouter();
const staffAccountsRouter = createStaffAccountsRouter();
const auditEventsRouter = createAuditEventsRouter();

app.use(createRequestIdMiddleware());
app.use(
  cors({
    origin(origin, callback) {
      // Allow same-machine browser access from either localhost or 127.0.0.1.
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    exposedHeaders: ["X-Request-ID"]
  })
);
app.use(express.json({ limit: "10mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/runtime", runtimeRouter);
app.use("/api/auth", authRouter);
app.use("/api/staff-accounts", staffAccountsRouter);
app.use("/api/audit-events", auditEventsRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/patients", patientsRouter);
app.use("/api/treatments", treatmentsRouter);
app.use("/api/appointments", appointmentsRouter);
app.use("/api/attachments", attachmentsRouter);
app.use("/api/export", exportRouter);
app.use("/api/backup", backupRouter);

app.use(async (error, _req, res, _next) => {
  if (error?.status) {
    res.status(error.status).json({ message: error.message });
    return;
  }

  console.error(error);
  res.status(500).json({ message: "Internal server error." });
});

export default app;
