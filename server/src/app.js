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
import runtimeConfig from "./config/runtimeConfig.js";
import { ATTACHMENT_FILE_SIZE_ERROR_MESSAGE, deleteUploadedFileByAbsolutePath } from "./utils/attachmentUtils.js";

const app = express();
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
app.use("/uploads", express.static(runtimeConfig.uploadRoot));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/runtime", runtimeRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/patients", patientsRouter);
app.use("/api/treatments", treatmentsRouter);
app.use("/api/appointments", appointmentsRouter);
app.use("/api/attachments", attachmentsRouter);
app.use("/api/export", exportRouter);
app.use("/api/backup", backupRouter);

app.use(async (error, req, res, _next) => {
  if (error?.code === "LIMIT_FILE_SIZE" || error?.name === "MulterError" && error?.code === "LIMIT_FILE_SIZE") {
    await deleteUploadedFileByAbsolutePath(req.file?.path);
    res.status(400).json({ message: ATTACHMENT_FILE_SIZE_ERROR_MESSAGE });
    return;
  }

  if (error?.status) {
    res.status(error.status).json({ message: error.message });
    return;
  }

  console.error(error);
  res.status(500).json({ message: "Internal server error." });
});

export default app;
