export type InAppNotificationErrorCode =
  | "NOTIFICATION_INPUT_INVALID"
  | "NOTIFICATION_NOT_FOUND"
  | "NOTIFICATION_PERSISTENCE_ERROR";

export class InAppNotificationError extends Error {
  readonly code: InAppNotificationErrorCode;

  constructor(code: InAppNotificationErrorCode) {
    super(code);
    this.name = "InAppNotificationError";
    this.code = code;
  }
}

export function toInAppNotificationPersistenceError(error: unknown): InAppNotificationError {
  if (error instanceof InAppNotificationError) return error;
  return new InAppNotificationError("NOTIFICATION_PERSISTENCE_ERROR");
}
