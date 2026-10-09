import crypto from "node:crypto";
import type { PgQueryExecutor } from "../postgres/pool.js";
import {
  createNotificationRepository,
  type NotificationRepository
} from "../repositories/notificationRepository.js";

export type AppointmentNotificationEvent =
  | "APPOINTMENT_CONFIRMED"
  | "APPOINTMENT_RESCHEDULED"
  | "APPOINTMENT_CANCELLED_BY_CLINIC"
  | "APPOINTMENT_NO_SHOW";

export interface AppointmentNotificationIntentInput {
  patientId: string;
  appointmentId: string;
  branchId: string;
  requestId: string;
  event: AppointmentNotificationEvent;
  occurredAt: string;
}

export interface NotificationIntentServiceOptions {
  createId?: () => string;
  repositoryFactory?: (executor: PgQueryExecutor) => NotificationRepository;
}

interface AppointmentTemplate {
  templateKey: string;
}

const appointmentTemplates: Record<AppointmentNotificationEvent, AppointmentTemplate> = {
  APPOINTMENT_CONFIRMED: {
    templateKey: "appointment-confirmed"
  },
  APPOINTMENT_RESCHEDULED: {
    templateKey: "appointment-rescheduled"
  },
  APPOINTMENT_CANCELLED_BY_CLINIC: {
    templateKey: "appointment-cancelled-by-clinic"
  },
  APPOINTMENT_NO_SHOW: {
    templateKey: "appointment-no-show"
  }
};

export function createNotificationIntentService(
  executor: PgQueryExecutor,
  options: NotificationIntentServiceOptions = {}
) {
  const createId = options.createId ?? (() => crypto.randomUUID());
  const repository = (options.repositoryFactory ?? createNotificationRepository)(executor);

  return {
    async queuePatientAppointmentEmail(input: AppointmentNotificationIntentInput): Promise<boolean> {
      if (!(await repository.patientHasEmail(input.patientId))) return false;

      const template = appointmentTemplates[input.event];
      await repository.insertEmailDeliveryIntent({
        id: createId(),
        notificationId: null,
        recipientUserId: null,
        recipientPatientId: input.patientId,
        category: "appointment",
        eventType: input.event,
        templateKey: template.templateKey,
        sourceType: "appointment",
        sourceId: input.appointmentId,
        branchId: input.branchId,
        requestId: input.requestId,
        dedupeKey: [
          "email",
          "appointment",
          input.event.toLowerCase(),
          input.appointmentId,
          input.requestId,
          input.patientId
        ].join(":"),
        createdAt: input.occurredAt
      });
      return true;
    }
  };
}
