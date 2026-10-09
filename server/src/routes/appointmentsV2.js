import express from "express";
import { createAuthenticateMiddleware } from "../auth/authMiddleware.js";
import { createAccessBoundary } from "../access/accessMiddleware.js";
import { createAppointmentRuntime } from "../appointments/appointmentRuntime.js";
import { requireAppointmentUuid } from "../services/appointmentValidation.js";
import { toAppointmentHttpError } from "../services/appointmentHttpErrors.js";

function actorFromResponse(res) {
  const authorization = res.locals.authorization;
  const requestId = res.locals.requestId;
  if (
    !authorization?.userId ||
    !authorization?.authUserId ||
    !Array.isArray(authorization.branchIds) ||
    !Array.isArray(authorization.permissions) ||
    !requestId
  ) {
    const error = new Error("Appointment access context is unavailable.");
    error.status = 500;
    throw error;
  }

  return {
    userId: authorization.userId,
    authUserId: authorization.authUserId,
    requestId,
    branchIds: authorization.branchIds,
    permissions: authorization.permissions.map((grant) => grant.code)
  };
}

function validateUuidValue(getValue, assign) {
  return (req, _res, next) => {
    try {
      const id = requireAppointmentUuid(getValue(req));
      assign(req, id);
      next();
    } catch (error) {
      next(toAppointmentHttpError(error));
    }
  };
}

function loadAppointmentAccess(runtime) {
  return async (req, _res, next) => {
    try {
      req.appointmentAccess = await runtime.getService().getAccessContext(req.params.appointmentId);
      next();
    } catch (error) {
      next(toAppointmentHttpError(error));
    }
  };
}

function requireSchedulingContextAccess(accessBoundary) {
  const requireAnyBranch = accessBoundary.requireAnyBranchPermission("appointment.list");
  const requireBranch = accessBoundary.requireBranchPermission(
    "appointment.list",
    (req) => req.appointmentBranchId
  );

  return async (req, res, next) => {
    const rawBranchId = req.query?.branchId;
    if (rawBranchId === undefined || rawBranchId === null || rawBranchId === "") {
      await requireAnyBranch(req, res, next);
      return;
    }

    try {
      req.appointmentBranchId = requireAppointmentUuid(rawBranchId);
    } catch (error) {
      next(toAppointmentHttpError(error));
      return;
    }
    await requireBranch(req, res, next);
  };
}

function requireConfirmForConfirmedCreate(accessBoundary) {
  const requireConfirm = accessBoundary.requireBranchPermission(
    "appointment.confirm",
    (req) => req.appointmentBranchId
  );
  return async (req, res, next) => {
    const status = req.body?.status;
    if (status === "requested" || status === "pending_confirmation") {
      next();
      return;
    }
    if (status !== undefined && status !== null && status !== "" && status !== "confirmed") {
      next();
      return;
    }
    await requireConfirm(req, res, next);
  };
}

function handleDomain(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res);
    } catch (error) {
      next(toAppointmentHttpError(error));
    }
  };
}

export function createAppointmentsRouter(
  authenticationService,
  accessBoundary = createAccessBoundary(),
  appointmentRuntime = createAppointmentRuntime()
) {
  const router = express.Router();
  const authenticate = createAuthenticateMiddleware(authenticationService);
  const resolveAccess = [
    authenticate,
    accessBoundary.resolveApplicationUser,
    accessBoundary.resolveAuthorization
  ];

  router.get(
    "/",
    ...resolveAccess,
    validateUuidValue((req) => req.query?.branchId, (req, id) => { req.appointmentBranchId = id; }),
    accessBoundary.requireBranchPermission("appointment.list", (req) => req.appointmentBranchId),
    handleDomain(async (req, res) => {
      const result = await appointmentRuntime.getService().listAppointments({
        branchId: req.appointmentBranchId,
        date: req.query?.date ?? null,
        dentistUserId: req.query?.dentistUserId ?? null,
        status: req.query?.status ?? null
      }, actorFromResponse(res));
      res.json(result);
    })
  );

  router.get(
    "/scheduling-context",
    ...resolveAccess,
    requireSchedulingContextAccess(accessBoundary),
    handleDomain(async (req, res) => {
      const actor = actorFromResponse(res);
      const result = req.appointmentBranchId
        ? await appointmentRuntime.getService().getSchedulingContext(req.appointmentBranchId, actor)
        : await appointmentRuntime.getService().getSchedulingBootstrap(actor);
      res.json(result);
    })
  );

  router.get(
    "/patient-search",
    ...resolveAccess,
    validateUuidValue((req) => req.query?.branchId, (req, id) => { req.appointmentBranchId = id; }),
    accessBoundary.requireBranchPermission("appointment.patient_lookup", (req) => req.appointmentBranchId),
    handleDomain(async (req, res) => {
      const result = await appointmentRuntime.getService().searchPatients(
        req.query?.q,
        req.appointmentBranchId,
        actorFromResponse(res)
      );
      res.json(result);
    })
  );

  router.get(
    "/availability",
    ...resolveAccess,
    validateUuidValue((req) => req.query?.branchId, (req, id) => { req.appointmentBranchId = id; }),
    accessBoundary.requireBranchPermission("appointment.list", (req) => req.appointmentBranchId),
    handleDomain(async (req, res) => {
      const result = await appointmentRuntime.getService().checkAvailability({
        branchId: req.appointmentBranchId,
        dentistUserId: req.query?.dentistUserId,
        appointmentDate: req.query?.date,
        appointmentTime: req.query?.time,
        durationMinutes:
          typeof req.query?.durationMinutes === "string" ? Number(req.query.durationMinutes) : req.query?.durationMinutes,
        excludeAppointmentId: req.query?.excludeAppointmentId
      }, actorFromResponse(res));
      res.json(result);
    })
  );

  router.post(
    "/",
    ...resolveAccess,
    validateUuidValue((req) => req.body?.branchId, (req, id) => { req.appointmentBranchId = id; }),
    accessBoundary.requireBranchPermission("appointment.create", (req) => req.appointmentBranchId),
    requireConfirmForConfirmedCreate(accessBoundary),
    handleDomain(async (req, res) => {
      const created = await appointmentRuntime.getService().createAppointment(
        { ...(req.body ?? {}), branchId: req.appointmentBranchId },
        actorFromResponse(res)
      );
      res.status(201).json(created);
    })
  );

  router.get(
    "/:appointmentId",
    ...resolveAccess,
    validateUuidValue((req) => req.params.appointmentId, (req, id) => { req.params.appointmentId = id; }),
    loadAppointmentAccess(appointmentRuntime),
    accessBoundary.requireBranchPermission("appointment.read", (req) => req.appointmentAccess.branchId),
    handleDomain(async (req, res) => {
      const result = await appointmentRuntime.getService().getAppointment(
        req.params.appointmentId,
        actorFromResponse(res)
      );
      res.json(result);
    })
  );

  router.patch(
    "/:appointmentId",
    ...resolveAccess,
    validateUuidValue((req) => req.params.appointmentId, (req, id) => { req.params.appointmentId = id; }),
    loadAppointmentAccess(appointmentRuntime),
    accessBoundary.requireBranchPermission("appointment.update", (req) => req.appointmentAccess.branchId),
    handleDomain(async (req, res) => {
      const result = await appointmentRuntime.getService().updateAppointment(
        req.params.appointmentId,
        req.body ?? {},
        actorFromResponse(res)
      );
      res.json(result);
    })
  );

  router.post(
    "/:appointmentId/confirm",
    ...resolveAccess,
    validateUuidValue((req) => req.params.appointmentId, (req, id) => { req.params.appointmentId = id; }),
    loadAppointmentAccess(appointmentRuntime),
    accessBoundary.requireBranchPermission("appointment.confirm", (req) => req.appointmentAccess.branchId),
    handleDomain(async (req, res) => {
      const result = await appointmentRuntime.getService().confirmAppointment(
        req.params.appointmentId,
        req.body ?? {},
        actorFromResponse(res)
      );
      res.json(result);
    })
  );

  router.post(
    "/:appointmentId/reschedule",
    ...resolveAccess,
    validateUuidValue((req) => req.params.appointmentId, (req, id) => { req.params.appointmentId = id; }),
    loadAppointmentAccess(appointmentRuntime),
    accessBoundary.requireBranchPermission("appointment.reschedule", (req) => req.appointmentAccess.branchId),
    validateUuidValue((req) => req.body?.branchId, (req, id) => { req.appointmentTargetBranchId = id; }),
    accessBoundary.requireBranchPermission("appointment.reschedule", (req) => req.appointmentTargetBranchId),
    handleDomain(async (req, res) => {
      const result = await appointmentRuntime.getService().rescheduleAppointment(
        req.params.appointmentId,
        { ...(req.body ?? {}), branchId: req.appointmentTargetBranchId },
        actorFromResponse(res)
      );
      res.json(result);
    })
  );

  const actions = [
    ["cancel", "appointment.cancel", "cancelAppointment"],
    ["check-in", "appointment.check_in", "checkInAppointment"],
    ["start", "appointment.start", "startAppointment"],
    ["complete", "appointment.complete", "completeAppointment"],
    ["no-show", "appointment.no_show", "markNoShow"]
  ];

  for (const [path, permission, method] of actions) {
    router.post(
      `/:appointmentId/${path}`,
      ...resolveAccess,
      validateUuidValue((req) => req.params.appointmentId, (req, id) => { req.params.appointmentId = id; }),
      loadAppointmentAccess(appointmentRuntime),
      accessBoundary.requireBranchPermission(permission, (req) => req.appointmentAccess.branchId),
      handleDomain(async (req, res) => {
        const service = appointmentRuntime.getService();
        const result = method === "cancelAppointment"
          ? await service[method](req.params.appointmentId, req.body ?? {}, actorFromResponse(res))
          : await service[method](req.params.appointmentId, actorFromResponse(res));
        res.json(result);
      })
    );
  }

  return router;
}

export function createAppointmentCalendarRouter(
  authenticationService,
  accessBoundary = createAccessBoundary(),
  appointmentRuntime = createAppointmentRuntime()
) {
  const router = express.Router();
  const authenticate = createAuthenticateMiddleware(authenticationService);

  router.get(
    "/",
    authenticate,
    accessBoundary.resolveApplicationUser,
    accessBoundary.resolveAuthorization,
    validateUuidValue((req) => req.query?.branchId, (req, id) => { req.appointmentBranchId = id; }),
    accessBoundary.requireBranchPermission("appointment.list", (req) => req.appointmentBranchId),
    handleDomain(async (req, res) => {
      const result = await appointmentRuntime.getService().listAppointments({
        branchId: req.appointmentBranchId,
        date: req.query?.date ?? null,
        dentistUserId: req.query?.dentistUserId ?? null,
        status: req.query?.status ?? null
      }, actorFromResponse(res));
      res.json(result);
    })
  );

  return router;
}

export default createAppointmentsRouter;
