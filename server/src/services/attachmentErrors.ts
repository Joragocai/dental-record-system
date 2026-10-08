export type AttachmentErrorCode =
  | "ATTACHMENT_INPUT_INVALID"
  | "ATTACHMENT_NOT_FOUND"
  | "ATTACHMENT_PARENT_NOT_FOUND"
  | "ATTACHMENT_PARENT_MISMATCH"
  | "ATTACHMENT_STATE_INVALID"
  | "ATTACHMENT_FILE_INVALID"
  | "ATTACHMENT_STORAGE_UNAVAILABLE"
  | "ATTACHMENT_PERSISTENCE_ERROR"
  | "ATTACHMENT_RECONCILIATION_REQUIRED";

const statusByCode: Record<AttachmentErrorCode, number> = {
  ATTACHMENT_INPUT_INVALID: 400,
  ATTACHMENT_NOT_FOUND: 404,
  ATTACHMENT_PARENT_NOT_FOUND: 404,
  ATTACHMENT_PARENT_MISMATCH: 400,
  ATTACHMENT_STATE_INVALID: 409,
  ATTACHMENT_FILE_INVALID: 400,
  ATTACHMENT_STORAGE_UNAVAILABLE: 503,
  ATTACHMENT_PERSISTENCE_ERROR: 503,
  ATTACHMENT_RECONCILIATION_REQUIRED: 503
};

const messageByCode: Record<AttachmentErrorCode, string> = {
  ATTACHMENT_INPUT_INVALID: "Attachment information is invalid.",
  ATTACHMENT_NOT_FOUND: "The attachment was not found.",
  ATTACHMENT_PARENT_NOT_FOUND: "The attachment patient or treatment was not found.",
  ATTACHMENT_PARENT_MISMATCH: "The attachment patient, treatment, and branch do not match.",
  ATTACHMENT_STATE_INVALID: "The attachment is not in a valid state for this action.",
  ATTACHMENT_FILE_INVALID: "The uploaded file did not pass attachment validation.",
  ATTACHMENT_STORAGE_UNAVAILABLE: "Private attachment storage is temporarily unavailable.",
  ATTACHMENT_PERSISTENCE_ERROR: "Attachment information is temporarily unavailable.",
  ATTACHMENT_RECONCILIATION_REQUIRED: "Attachment storage requires reconciliation before this action can finish."
};

export class AttachmentError extends Error {
  readonly code: AttachmentErrorCode;
  readonly status: number;

  constructor(code: AttachmentErrorCode) {
    super(messageByCode[code]);
    this.name = "AttachmentError";
    this.code = code;
    this.status = statusByCode[code];
  }
}
