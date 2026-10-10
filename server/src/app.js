import cors from "cors";
import express from "express";
import attachmentsRouter from "./routes/attachments.js";
import { createAuthRouter } from "./routes/auth.js";
import { createStaffAccountsRouter } from "./routes/staffAccounts.js";
import { createAuditEventsRouter } from "./routes/auditEvents.js";
import { createRequestIdMiddleware } from "./middleware/requestId.js";
import { getAllowedCorsOrigins, isHostedEnvironment } from "./config/hostedSafety.js";

const app = express();
const isHosted = isHostedEnvironment();
const allowedOrigins = new Set(getAllowedCorsOrigins());
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
      const error = new Error("Origin not allowed.");
      error.status = 403;
      callback(error);
    },
    exposedHeaders: ["X-Request-ID"]
  })
);
app.use(express.json({ limit: "10mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/ready", async (_req, res) => {
  if (!isHosted) {
    res.json({ status: "ready" });
    return;
  }
  try {
    const { checkHostedReadiness } = await import("./config/hostedReadiness.js");
    if (await checkHostedReadiness()) {
      res.json({ status: "ready" });
      return;
    }
  } catch {
    // Readiness is intentionally fail-closed; never return connection details.
  }
  res.status(503).json({ status: "unavailable" });
});

app.use("/api/auth", authRouter);
app.use("/api/staff-accounts", staffAccountsRouter);
app.use("/api/audit-events", auditEventsRouter);
app.use("/api/attachments", attachmentsRouter);

if (isHosted) {
  const [
    { createAppointmentsRouter, createAppointmentCalendarRouter },
    { createNotificationsRouter },
    { createAccessBoundary },
    { createAppointmentRuntime },
    { createInAppNotificationRuntime },
    { createPatientEnrollmentRouter },
    { createPatientActivationRouter },
    { createPortalRecordsRouter },
    { createTreatmentPublicationRouter },
    { createPortalAppointmentRouter },
    { createPortalAppointmentReviewRouter },
    { createPortalPrivacyRouter },
    { createPortalDocumentPublicationRouter },
    { createInvoiceRouter },
    { createPaymentRouter, createRefundRouter },
    { createFinanceOperationsRouter },
    { createDailyFinanceRouter },
    { createPatientFinanceRouter },
    { createDashboardV2Router },
    { createTechnicalStatusRouter }
  ] = await Promise.all([
    import("./routes/appointmentsV2.js"),
    import("./routes/notifications.js"),
    import("./access/accessMiddleware.js"),
    import("./appointments/appointmentRuntime.ts"),
    import("./notifications/inAppNotificationRuntime.ts"),
    import("./routes/patientEnrollment.js"),
    import("./routes/patientActivation.js"),
    import("./routes/portalRecords.js"),
    import("./routes/treatmentPublication.js"),
    import("./routes/portalAppointments.js"),
    import("./routes/portalAppointmentReview.js"),
    import("./routes/portalPrivacy.js"),
    import("./routes/portalDocumentPublication.js"),
    import("./routes/invoices.js"),
    import("./routes/payments.js"),
    import("./routes/financeOperations.js"),
    import("./routes/dailyFinance.js"),
    import("./routes/patientFinance.js"),
    import("./routes/roleDashboardRouter.js"),
    import("./routes/technicalStatusRouter.js")
  ]);
  const hostedAccessBoundary = createAccessBoundary();
  const appointmentRuntime = createAppointmentRuntime();
  const notificationRuntime = createInAppNotificationRuntime();
  app.use("/api/appointments", createAppointmentsRouter(undefined, hostedAccessBoundary, appointmentRuntime));
  app.use("/api/calendar", createAppointmentCalendarRouter(undefined, hostedAccessBoundary, appointmentRuntime));
  app.use("/api/notifications", createNotificationsRouter(undefined, hostedAccessBoundary, notificationRuntime));
  app.use("/api/patient-enrollments", createPatientEnrollmentRouter(undefined, hostedAccessBoundary));
  app.use("/api/patient-portal", createPatientActivationRouter());
  app.use("/api/me", createPortalRecordsRouter(undefined, hostedAccessBoundary));
  app.use("/api/me", createPortalAppointmentRouter(undefined, hostedAccessBoundary));
  app.use("/api/me", createPortalPrivacyRouter(undefined, hostedAccessBoundary));
  app.use("/api/me", createPatientFinanceRouter(undefined, hostedAccessBoundary));
  app.use("/api/patient-appointment-reviews", createPortalAppointmentReviewRouter(undefined, hostedAccessBoundary));
  app.use("/api/portal-treatments", createTreatmentPublicationRouter(undefined, hostedAccessBoundary));
  app.use("/api/portal-documents", createPortalDocumentPublicationRouter(undefined, hostedAccessBoundary));
  app.use("/api/invoices", createInvoiceRouter(undefined, hostedAccessBoundary));
  app.use("/api/payments", createPaymentRouter(undefined, hostedAccessBoundary));
  app.use("/api/refunds", createRefundRouter(undefined, hostedAccessBoundary));
  app.use("/api/finance-operations", createFinanceOperationsRouter(undefined, hostedAccessBoundary));
  app.use("/api/finance", createDailyFinanceRouter(undefined, hostedAccessBoundary));
  app.use("/api/dashboard", createDashboardV2Router(undefined, hostedAccessBoundary));
  app.use("/api/technical", createTechnicalStatusRouter(undefined, hostedAccessBoundary));
}

// Never import legacy SQLite-backed routes in hosted environments. Merely importing
// their dependencies can create local database files and runtime directories.
if (!isHosted) {
  const [runtime, dashboard, patients, treatments, appointments, exports, backup] = await Promise.all([
    import("./routes/runtime.js"),
    import("./routes/dashboard.js"),
    import("./routes/patients.js"),
    import("./routes/treatments.js"),
    import("./routes/appointments.js"),
    import("./routes/exports.js"),
    import("./routes/backup.js")
  ]);
  app.use("/api/runtime", runtime.default);
  app.use("/api/dashboard", dashboard.default);
  app.use("/api/patients", patients.default);
  app.use("/api/treatments", treatments.default);
  app.use("/api/appointments", appointments.default);
  app.use("/api/export", exports.default);
  app.use("/api/backup", backup.default);
}

app.use(async (error, _req, res, _next) => {
  if (error?.status) {
    res.status(error.status).json({ message: error.message });
    return;
  }

  console.error(error);
  res.status(500).json({ message: "Internal server error." });
});

export default app;
