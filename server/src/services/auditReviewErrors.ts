export type AuditReviewErrorCode =
  | "AUDIT_REVIEW_INPUT_INVALID"
  | "AUDIT_REVIEW_NOT_FOUND"
  | "AUDIT_REVIEW_PERSISTENCE_ERROR";

const statusByCode: Record<AuditReviewErrorCode, number> = {
  AUDIT_REVIEW_INPUT_INVALID: 400,
  AUDIT_REVIEW_NOT_FOUND: 404,
  AUDIT_REVIEW_PERSISTENCE_ERROR: 503
};

const messageByCode: Record<AuditReviewErrorCode, string> = {
  AUDIT_REVIEW_INPUT_INVALID: "Audit review filters are invalid.",
  AUDIT_REVIEW_NOT_FOUND: "The audit event was not found.",
  AUDIT_REVIEW_PERSISTENCE_ERROR: "Audit information is temporarily unavailable."
};

export class AuditReviewError extends Error {
  readonly code: AuditReviewErrorCode;
  readonly status: number;

  constructor(code: AuditReviewErrorCode) {
    super(messageByCode[code]);
    this.name = "AuditReviewError";
    this.code = code;
    this.status = statusByCode[code];
  }
}
