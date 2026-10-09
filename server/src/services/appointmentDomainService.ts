import crypto from "node:crypto";
import type { PgPoolManager, PgQueryExecutor } from "../postgres/pool.js";
import type { AppointmentStatus } from "../postgres/batchC/appointments.js";
import {
  createAppointmentRepository,
  type AppointmentHistoryRecord,
  type AppointmentListFilter,
  type AppointmentRecord,
  type AppointmentRepository,
  type MinimalAppointmentPatient,
  type SchedulingBranch,
  type SchedulingDentist
} from "../repositories/appointmentRepository.js";
import type { PermissionCode } from "../repositories/authorizationRepository.js";
import { createAuditEventRepository } from "../repositories/auditEventRepository.js";
import {
  createAuditEventService,
  type AppointmentAuditAction
} from "./auditEventService.js";
import { AppointmentDomainError, toAppointmentPersistenceError } from "./appointmentDomainErrors.js";
import {
  assertNotPastSchedule,
  assertSlotShape,
  normalizeDate,
  normalizeDentistId,
  normalizeDuration,
  normalizeOptionalText,
  normalizeReason,
  normalizeSearchQuery,
  normalizeTime,
  requireAppointmentUuid,
  slotReservingStatuses,
  type NormalizedSchedule
} from "./appointmentValidation.js";

export interface AppointmentActor {
  userId: string;
  authUserId: string;
  requestId: string;
  branchIds: readonly string[];
  permissions: readonly PermissionCode[];
}

export interface CreateAppointmentInput {
  patientId: unknown;
  branchId: unknown;
  dentistUserId?: unknown;
  appointmentDate: unknown;
  appointmentTime?: unknown;
  durationMinutes?: unknown;
  plannedProcedure?: unknown;
  notes?: unknown;
  status?: unknown;
}

export interface UpdateAppointmentInput {
  plannedProcedure?: unknown;
  notes?: unknown;
}

export interface ConfirmAppointmentInput {
  appointmentDate?: unknown;
  appointmentTime?: unknown;
  durationMinutes?: unknown;
  dentistUserId?: unknown;
}

export interface RescheduleAppointmentInput {
  branchId: unknown;
  appointmentDate: unknown;
  appointmentTime: unknown;
  durationMinutes: unknown;
  dentistUserId: unknown;
  plannedProcedure?: unknown;
  notes?: unknown;
  reason?: unknown;
}

export interface CancelAppointmentInput {
  reason?: unknown;
}

export interface AvailabilityInput {
  branchId: unknown;
  dentistUserId: unknown;
  appointmentDate: unknown;
  appointmentTime: unknown;
  durationMinutes: unknown;
  excludeAppointmentId?: unknown;
}

export interface AppointmentSchedulingContext {
  branch: SchedulingBranch;
  dentists: SchedulingDentist[];
}

export interface AppointmentAvailability {
  available: boolean;
}

export interface AppointmentDomainService {
  listAppointments(filter: AppointmentListFilter, actor: AppointmentActor): Promise<AppointmentRecord[]>;
  getAppointment(appointmentId: unknown, actor: AppointmentActor): Promise<AppointmentRecord>;
  getSchedulingContext(branchId: unknown, actor: AppointmentActor): Promise<AppointmentSchedulingContext>;
  searchPatients(query: unknown, branchId: unknown, actor: AppointmentActor): Promise<MinimalAppointmentPatient[]>;
  checkAvailability(input: AvailabilityInput, actor: AppointmentActor): Promise<AppointmentAvailability>;
  createAppointment(input: CreateAppointmentInput, actor: AppointmentActor): Promise<AppointmentRecord>;
  updateAppointment(appointmentId: unknown, input: UpdateAppointmentInput, actor: AppointmentActor): Promise<AppointmentRecord>;
  confirmAppointment(appointmentId: unknown, input: ConfirmAppointmentInput, actor: AppointmentActor): Promise<AppointmentRecord>;
  rescheduleAppointment(appointmentId: unknown, input: RescheduleAppointmentInput, actor: AppointmentActor): Promise<AppointmentRecord>;
  cancelAppointment(appointmentId: unknown, input: CancelAppointmentInput, actor: AppointmentActor): Promise<AppointmentRecord>;
  checkInAppointment(appointmentId: unknown, actor: AppointmentActor): Promise<AppointmentRecord>;
  startAppointment(appointmentId: unknown, actor: AppointmentActor): Promise<AppointmentRecord>;
  completeAppointment(appointmentId: unknown, actor: AppointmentActor): Promise<AppointmentRecord>;
  markNoShow(appointmentId: unknown, actor: AppointmentActor): Promise<AppointmentRecord>;
}

export interface AppointmentDomainServiceOptions {
  createId?: () => string;
  createHistoryId?: () => string;
  createAuditId?: () => string;
  now?: () => Date;
  repositoryFactory?: (executor: PgQueryExecutor) => AppointmentRepository;
}

const mutableStatuses = new Set<AppointmentStatus>(["requested", "pending_confirmation", "confirmed"]);
const createStatuses = new Set<AppointmentStatus>(["requested", "pending_confirmation", "confirmed"]);

function normalizeActor(actor: AppointmentActor): AppointmentActor {
  return {
    userId: requireAppointmentUuid(actor.userId),
    authUserId: requireAppointmentUuid(actor.authUserId),
    requestId: requireAppointmentUuid(actor.requestId),
    branchIds: actor.branchIds.map(requireAppointmentUuid),
    permissions: [...actor.permissions]
  };
}

function requireBranchPermission(actor: AppointmentActor, permission: PermissionCode, branchId: string): void {
  if (!actor.permissions.includes(permission) || !actor.branchIds.includes(branchId)) {
    throw new AppointmentDomainError("APPOINTMENT_PERMISSION_DENIED");
  }
}

function requireAnyBranchPermission(
  actor: AppointmentActor,
  permissions: readonly PermissionCode[],
  branchId: string
): void {
  if (!actor.branchIds.includes(branchId) || !permissions.some((permission) => actor.permissions.includes(permission))) {
    throw new AppointmentDomainError("APPOINTMENT_PERMISSION_DENIED");
  }
}

function normalizeCreateStatus(value: unknown): AppointmentStatus {
  if (value === undefined || value === null || value === "") return "confirmed";
  if (typeof value !== "string" || !createStatuses.has(value as AppointmentStatus)) {
    throw new AppointmentDomainError("APPOINTMENT_INPUT_INVALID");
  }
  return value as AppointmentStatus;
}

function scheduleOf(record: AppointmentRecord): NormalizedSchedule {
  return {
    appointmentDate: record.appointmentDate,
    appointmentTime: record.appointmentTime,
    durationMinutes: record.durationMinutes,
    dentistUserId: record.dentistUserId
  };
}

async function validateReferences(
  repository: AppointmentRepository,
  patientId: string,
  branchId: string,
  dentistUserId: string | null
): Promise<void> {
  if (!(await repository.branchExists(branchId))) {
    throw new AppointmentDomainError("APPOINTMENT_BRANCH_NOT_FOUND");
  }
  if (!(await repository.patientExists(patientId))) {
    throw new AppointmentDomainError("APPOINTMENT_PATIENT_NOT_FOUND");
  }
  if (dentistUserId && !(await repository.dentistIsActiveAndAssigned(dentistUserId, branchId))) {
    throw new AppointmentDomainError("APPOINTMENT_DENTIST_INVALID");
  }
}

async function validateDentist(
  repository: AppointmentRepository,
  dentistUserId: string | null,
  branchId: string
): Promise<void> {
  if (!dentistUserId || !(await repository.dentistIsActiveAndAssigned(dentistUserId, branchId))) {
    throw new AppointmentDomainError("APPOINTMENT_DENTIST_INVALID");
  }
}

async function reserveSlot(
  repository: AppointmentRepository,
  schedule: NormalizedSchedule,
  branchId: string,
  now: Date,
  excludeAppointmentId?: string | null
): Promise<void> {
  assertSlotShape(schedule);
  assertNotPastSchedule(schedule.appointmentDate, schedule.appointmentTime, now);
  await validateDentist(repository, schedule.dentistUserId, branchId);
  await repository.lockDentistDate(schedule.dentistUserId!, schedule.appointmentDate);
  const conflict = await repository.hasOverlappingReservation({
    dentistUserId: schedule.dentistUserId!,
    appointmentDate: schedule.appointmentDate,
    appointmentTime: schedule.appointmentTime!,
    durationMinutes: schedule.durationMinutes!,
    excludeAppointmentId: excludeAppointmentId ?? null
  });
  if (conflict) throw new AppointmentDomainError("APPOINTMENT_SLOT_CONFLICT");
}

function buildHistory(
  id: string,
  action: string,
  previous: AppointmentRecord | null,
  current: AppointmentRecord,
  actor: AppointmentActor,
  occurredAt: string,
  reason: string | null = null,
  relatedAppointmentId: string | null = null
): AppointmentHistoryRecord {
  return {
    id,
    appointmentId: current.id,
    action,
    previousStatus: previous?.status ?? null,
    newStatus: current.status,
    previousBranchId: previous?.branchId ?? null,
    newBranchId: current.branchId,
    previousDentistUserId: previous?.dentistUserId ?? null,
    newDentistUserId: current.dentistUserId,
    previousAppointmentDate: previous?.appointmentDate ?? null,
    newAppointmentDate: current.appointmentDate,
    previousAppointmentTime: previous?.appointmentTime ?? null,
    newAppointmentTime: current.appointmentTime,
    previousDurationMinutes: previous?.durationMinutes ?? null,
    newDurationMinutes: current.durationMinutes,
    reason,
    relatedAppointmentId,
    actorUserId: actor.userId,
    requestId: actor.requestId,
    occurredAt
  };
}

async function writeAudit(
  executor: PgQueryExecutor,
  actor: AppointmentActor,
  appointment: AppointmentRecord,
  action: AppointmentAuditAction,
  createAuditId: (() => string) | undefined,
  now: (() => Date) | undefined,
  relatedAppointmentId: string | null = null
): Promise<void> {
  await createAuditEventService(createAuditEventRepository(executor), {
    createId: createAuditId,
    now
  }).recordAppointmentAction({
    actorUserId: actor.userId,
    actorAuthUserId: actor.authUserId,
    requestId: actor.requestId,
    appointmentId: appointment.id,
    branchId: appointment.branchId,
    action,
    status: appointment.status,
    relatedAppointmentId
  });
}

async function requireExistingForMutation(
  repository: AppointmentRepository,
  appointmentId: string,
  actor: AppointmentActor,
  permission: PermissionCode
): Promise<AppointmentRecord> {
  const existing = await repository.getByIdForUpdate(appointmentId);
  if (!existing) throw new AppointmentDomainError("APPOINTMENT_NOT_FOUND");
  requireBranchPermission(actor, permission, existing.branchId);
  return existing;
}

export function createAppointmentDomainService(
  pool: PgPoolManager,
  options: AppointmentDomainServiceOptions = {}
): AppointmentDomainService {
  const createId = options.createId ?? (() => crypto.randomUUID());
  const createHistoryId = options.createHistoryId ?? (() => crypto.randomUUID());
  const now = options.now ?? (() => new Date());
  const repositoryFactory = options.repositoryFactory ?? createAppointmentRepository;

  async function transition(
    appointmentIdValue: unknown,
    actorValue: AppointmentActor,
    permission: PermissionCode,
    allowedFrom: ReadonlySet<AppointmentStatus>,
    nextStatus: AppointmentStatus,
    action: string,
    auditAction: AppointmentAuditAction,
    reason: string | null = null,
    requireActiveDentist = false
  ): Promise<AppointmentRecord> {
    const appointmentId = requireAppointmentUuid(appointmentIdValue);
    const actor = normalizeActor(actorValue);
    const timestamp = now().toISOString();

    try {
      return await pool.withTransaction(async (executor) => {
        const repository = repositoryFactory(executor);
        const existing = await requireExistingForMutation(repository, appointmentId, actor, permission);
        if (!allowedFrom.has(existing.status)) throw new AppointmentDomainError("APPOINTMENT_STATE_INVALID");
        if (requireActiveDentist) {
          await validateDentist(repository, existing.dentistUserId, existing.branchId);
        }

        const updated: AppointmentRecord = { ...existing, status: nextStatus, updatedAt: timestamp };
        const persisted = await repository.update(updated);
        if (!persisted) throw new AppointmentDomainError("APPOINTMENT_NOT_FOUND");

        await repository.insertHistory(
          buildHistory(
            requireAppointmentUuid(createHistoryId()),
            action,
            existing,
            persisted,
            actor,
            timestamp,
            reason
          )
        );
        await writeAudit(executor, actor, persisted, auditAction, options.createAuditId, options.now);
        return persisted;
      });
    } catch (error) {
      throw toAppointmentPersistenceError(error);
    }
  }

  return {
    async listAppointments(filter, actorValue) {
      const actor = normalizeActor(actorValue);
      const branchId = requireAppointmentUuid(filter.branchId);
      requireBranchPermission(actor, "appointment.list", branchId);
      const normalized: AppointmentListFilter = {
        branchId,
        date: filter.date ? normalizeDate(filter.date) : null,
        dentistUserId: filter.dentistUserId ? requireAppointmentUuid(filter.dentistUserId) : null,
        status: filter.status ?? null
      };
      try {
        const repository = repositoryFactory(pool);
        if (!(await repository.branchExists(branchId))) throw new AppointmentDomainError("APPOINTMENT_BRANCH_NOT_FOUND");
        return await repository.list(normalized);
      } catch (error) {
        throw toAppointmentPersistenceError(error);
      }
    },

    async getAppointment(appointmentIdValue, actorValue) {
      const actor = normalizeActor(actorValue);
      const appointmentId = requireAppointmentUuid(appointmentIdValue);
      try {
        const record = await repositoryFactory(pool).getById(appointmentId);
        if (!record) throw new AppointmentDomainError("APPOINTMENT_NOT_FOUND");
        requireBranchPermission(actor, "appointment.read", record.branchId);
        return record;
      } catch (error) {
        throw toAppointmentPersistenceError(error);
      }
    },

    async getSchedulingContext(branchIdValue, actorValue) {
      const actor = normalizeActor(actorValue);
      const branchId = requireAppointmentUuid(branchIdValue);
      requireAnyBranchPermission(actor, ["appointment.list", "appointment.create", "appointment.reschedule"], branchId);
      try {
        const repository = repositoryFactory(pool);
        const branch = await repository.getBranch(branchId);
        if (!branch) throw new AppointmentDomainError("APPOINTMENT_BRANCH_NOT_FOUND");
        return { branch, dentists: await repository.listActiveDentistsForBranch(branchId) };
      } catch (error) {
        throw toAppointmentPersistenceError(error);
      }
    },

    async searchPatients(queryValue, branchIdValue, actorValue) {
      const actor = normalizeActor(actorValue);
      const branchId = requireAppointmentUuid(branchIdValue);
      requireBranchPermission(actor, "appointment.patient_lookup", branchId);
      const query = normalizeSearchQuery(queryValue);
      try {
        const repository = repositoryFactory(pool);
        if (!(await repository.branchExists(branchId))) throw new AppointmentDomainError("APPOINTMENT_BRANCH_NOT_FOUND");
        return await repository.searchPatients(query, 20);
      } catch (error) {
        throw toAppointmentPersistenceError(error);
      }
    },

    async checkAvailability(input, actorValue) {
      const actor = normalizeActor(actorValue);
      const branchId = requireAppointmentUuid(input.branchId);
      requireAnyBranchPermission(actor, ["appointment.create", "appointment.confirm", "appointment.reschedule"], branchId);
      const schedule: NormalizedSchedule = {
        appointmentDate: normalizeDate(input.appointmentDate),
        appointmentTime: normalizeTime(input.appointmentTime, false),
        durationMinutes: normalizeDuration(input.durationMinutes, false),
        dentistUserId: normalizeDentistId(input.dentistUserId, false)
      };
      assertSlotShape(schedule);
      assertNotPastSchedule(schedule.appointmentDate, schedule.appointmentTime, now());
      const excludeAppointmentId =
        input.excludeAppointmentId === undefined || input.excludeAppointmentId === null || input.excludeAppointmentId === ""
          ? null
          : requireAppointmentUuid(input.excludeAppointmentId);

      try {
        const repository = repositoryFactory(pool);
        if (!(await repository.branchExists(branchId))) throw new AppointmentDomainError("APPOINTMENT_BRANCH_NOT_FOUND");
        await validateDentist(repository, schedule.dentistUserId, branchId);
        const conflict = await repository.hasOverlappingReservation({
          dentistUserId: schedule.dentistUserId!,
          appointmentDate: schedule.appointmentDate,
          appointmentTime: schedule.appointmentTime!,
          durationMinutes: schedule.durationMinutes!,
          excludeAppointmentId
        });
        return { available: !conflict };
      } catch (error) {
        throw toAppointmentPersistenceError(error);
      }
    },

    async createAppointment(input, actorValue) {
      const actor = normalizeActor(actorValue);
      const patientId = requireAppointmentUuid(input.patientId);
      const branchId = requireAppointmentUuid(input.branchId);
      requireBranchPermission(actor, "appointment.create", branchId);
      const status = normalizeCreateStatus(input.status);
      const schedule: NormalizedSchedule = {
        appointmentDate: normalizeDate(input.appointmentDate),
        appointmentTime: normalizeTime(input.appointmentTime),
        durationMinutes: normalizeDuration(input.durationMinutes),
        dentistUserId: normalizeDentistId(input.dentistUserId)
      };
      assertNotPastSchedule(schedule.appointmentDate, schedule.appointmentTime, now());
      const plannedProcedure = normalizeOptionalText(input.plannedProcedure, 500);
      const notes = normalizeOptionalText(input.notes, 2000);
      const timestamp = now().toISOString();

      try {
        return await pool.withTransaction(async (executor) => {
          const repository = repositoryFactory(executor);
          await validateReferences(repository, patientId, branchId, schedule.dentistUserId);
          if (slotReservingStatuses.has(status)) {
            await reserveSlot(repository, schedule, branchId, now());
          }

          const record: AppointmentRecord = {
            id: requireAppointmentUuid(createId()),
            patientId,
            branchId,
            dentistUserId: schedule.dentistUserId,
            appointmentDate: schedule.appointmentDate,
            appointmentTime: schedule.appointmentTime,
            durationMinutes: schedule.durationMinutes,
            plannedProcedure,
            notes,
            status,
            rescheduledFromAppointmentId: null,
            createdAt: timestamp,
            updatedAt: timestamp
          };
          const persisted = await repository.insert(record);
          await repository.insertHistory(
            buildHistory(requireAppointmentUuid(createHistoryId()), "CREATED", null, persisted, actor, timestamp)
          );
          await writeAudit(executor, actor, persisted, "APPOINTMENT_CREATED", options.createAuditId, options.now);
          return persisted;
        });
      } catch (error) {
        throw toAppointmentPersistenceError(error);
      }
    },

    async updateAppointment(appointmentIdValue, input, actorValue) {
      const appointmentId = requireAppointmentUuid(appointmentIdValue);
      const actor = normalizeActor(actorValue);
      const timestamp = now().toISOString();

      try {
        return await pool.withTransaction(async (executor) => {
          const repository = repositoryFactory(executor);
          const existing = await requireExistingForMutation(repository, appointmentId, actor, "appointment.update");
          if (!mutableStatuses.has(existing.status)) throw new AppointmentDomainError("APPOINTMENT_STATE_INVALID");

          const updated: AppointmentRecord = {
            ...existing,
            plannedProcedure:
              input.plannedProcedure === undefined
                ? existing.plannedProcedure
                : normalizeOptionalText(input.plannedProcedure, 500),
            notes: input.notes === undefined ? existing.notes : normalizeOptionalText(input.notes, 2000),
            updatedAt: timestamp
          };
          const persisted = await repository.update(updated);
          if (!persisted) throw new AppointmentDomainError("APPOINTMENT_NOT_FOUND");
          await repository.insertHistory(
            buildHistory(requireAppointmentUuid(createHistoryId()), "UPDATED", existing, persisted, actor, timestamp)
          );
          await writeAudit(executor, actor, persisted, "APPOINTMENT_UPDATED", options.createAuditId, options.now);
          return persisted;
        });
      } catch (error) {
        throw toAppointmentPersistenceError(error);
      }
    },

    async confirmAppointment(appointmentIdValue, input, actorValue) {
      const appointmentId = requireAppointmentUuid(appointmentIdValue);
      const actor = normalizeActor(actorValue);
      const timestamp = now().toISOString();

      try {
        return await pool.withTransaction(async (executor) => {
          const repository = repositoryFactory(executor);
          const existing = await requireExistingForMutation(repository, appointmentId, actor, "appointment.confirm");
          if (!new Set<AppointmentStatus>(["requested", "pending_confirmation"]).has(existing.status)) {
            throw new AppointmentDomainError("APPOINTMENT_STATE_INVALID");
          }

          const schedule: NormalizedSchedule = {
            appointmentDate:
              input.appointmentDate === undefined ? existing.appointmentDate : normalizeDate(input.appointmentDate),
            appointmentTime:
              input.appointmentTime === undefined ? existing.appointmentTime : normalizeTime(input.appointmentTime, false),
            durationMinutes:
              input.durationMinutes === undefined ? existing.durationMinutes : normalizeDuration(input.durationMinutes, false),
            dentistUserId:
              input.dentistUserId === undefined ? existing.dentistUserId : normalizeDentistId(input.dentistUserId, false)
          };
          await reserveSlot(repository, schedule, existing.branchId, now(), existing.id);

          const updated: AppointmentRecord = { ...existing, ...schedule, status: "confirmed", updatedAt: timestamp };
          const persisted = await repository.update(updated);
          if (!persisted) throw new AppointmentDomainError("APPOINTMENT_NOT_FOUND");
          await repository.insertHistory(
            buildHistory(requireAppointmentUuid(createHistoryId()), "CONFIRMED", existing, persisted, actor, timestamp)
          );
          await writeAudit(executor, actor, persisted, "APPOINTMENT_CONFIRMED", options.createAuditId, options.now);
          return persisted;
        });
      } catch (error) {
        throw toAppointmentPersistenceError(error);
      }
    },

    async rescheduleAppointment(appointmentIdValue, input, actorValue) {
      const appointmentId = requireAppointmentUuid(appointmentIdValue);
      const actor = normalizeActor(actorValue);
      const targetBranchId = requireAppointmentUuid(input.branchId);
      const schedule: NormalizedSchedule = {
        appointmentDate: normalizeDate(input.appointmentDate),
        appointmentTime: normalizeTime(input.appointmentTime, false),
        durationMinutes: normalizeDuration(input.durationMinutes, false),
        dentistUserId: normalizeDentistId(input.dentistUserId, false)
      };
      const reason = normalizeReason(input.reason);
      const timestamp = now().toISOString();

      try {
        return await pool.withTransaction(async (executor) => {
          const repository = repositoryFactory(executor);
          const existing = await requireExistingForMutation(repository, appointmentId, actor, "appointment.reschedule");
          if (!mutableStatuses.has(existing.status)) throw new AppointmentDomainError("APPOINTMENT_STATE_INVALID");
          requireBranchPermission(actor, "appointment.reschedule", targetBranchId);
          if (!(await repository.branchExists(targetBranchId))) {
            throw new AppointmentDomainError("APPOINTMENT_BRANCH_NOT_FOUND");
          }
          await validateDentist(repository, schedule.dentistUserId, targetBranchId);
          await reserveSlot(repository, schedule, targetBranchId, now(), existing.id);

          const replacement: AppointmentRecord = {
            id: requireAppointmentUuid(createId()),
            patientId: existing.patientId,
            branchId: targetBranchId,
            dentistUserId: schedule.dentistUserId,
            appointmentDate: schedule.appointmentDate,
            appointmentTime: schedule.appointmentTime,
            durationMinutes: schedule.durationMinutes,
            plannedProcedure:
              input.plannedProcedure === undefined
                ? existing.plannedProcedure
                : normalizeOptionalText(input.plannedProcedure, 500),
            notes: input.notes === undefined ? existing.notes : normalizeOptionalText(input.notes, 2000),
            status: "confirmed",
            rescheduledFromAppointmentId: existing.id,
            createdAt: timestamp,
            updatedAt: timestamp
          };

          const originalUpdated = await repository.update({ ...existing, status: "rescheduled", updatedAt: timestamp });
          if (!originalUpdated) throw new AppointmentDomainError("APPOINTMENT_NOT_FOUND");
          const replacementPersisted = await repository.insert(replacement);

          await repository.insertHistory(
            buildHistory(
              requireAppointmentUuid(createHistoryId()),
              "RESCHEDULED",
              existing,
              originalUpdated,
              actor,
              timestamp,
              reason,
              replacementPersisted.id
            )
          );
          await repository.insertHistory(
            buildHistory(
              requireAppointmentUuid(createHistoryId()),
              "CREATED_BY_RESCHEDULE",
              null,
              replacementPersisted,
              actor,
              timestamp,
              reason,
              originalUpdated.id
            )
          );
          await writeAudit(
            executor,
            actor,
            originalUpdated,
            "APPOINTMENT_RESCHEDULED",
            options.createAuditId,
            options.now,
            replacementPersisted.id
          );
          return replacementPersisted;
        });
      } catch (error) {
        throw toAppointmentPersistenceError(error);
      }
    },

    async cancelAppointment(appointmentId, input, actor) {
      return transition(
        appointmentId,
        actor,
        "appointment.cancel",
        new Set<AppointmentStatus>(["requested", "pending_confirmation", "confirmed"]),
        "cancelled_by_clinic",
        "CANCELLED",
        "APPOINTMENT_CANCELLED",
        normalizeReason(input.reason)
      );
    },

    async checkInAppointment(appointmentId, actor) {
      return transition(
        appointmentId,
        actor,
        "appointment.check_in",
        new Set<AppointmentStatus>(["confirmed"]),
        "checked_in",
        "CHECKED_IN",
        "APPOINTMENT_CHECKED_IN",
        null,
        true
      );
    },

    async startAppointment(appointmentId, actor) {
      return transition(
        appointmentId,
        actor,
        "appointment.start",
        new Set<AppointmentStatus>(["checked_in"]),
        "in_progress",
        "STARTED",
        "APPOINTMENT_STARTED",
        null,
        true
      );
    },

    async completeAppointment(appointmentId, actor) {
      return transition(
        appointmentId,
        actor,
        "appointment.complete",
        new Set<AppointmentStatus>(["checked_in", "in_progress"]),
        "completed",
        "COMPLETED",
        "APPOINTMENT_COMPLETED"
      );
    },

    async markNoShow(appointmentId, actor) {
      return transition(
        appointmentId,
        actor,
        "appointment.no_show",
        new Set<AppointmentStatus>(["confirmed"]),
        "no_show",
        "NO_SHOW",
        "APPOINTMENT_NO_SHOW"
      );
    }
  };
}
