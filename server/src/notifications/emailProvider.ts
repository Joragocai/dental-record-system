export interface EmailSendInput {
  to: string;
  from: string;
  subject: string;
  text: string;
  idempotencyKey: string;
}

export interface EmailSendResult {
  providerMessageId: string;
}

export interface EmailProvider {
  send(input: EmailSendInput): Promise<EmailSendResult>;
}

export type EmailProviderErrorCode =
  | "PROVIDER_TEMPORARY"
  | "PROVIDER_REJECTED"
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_AUTHORIZATION"
  | "PROVIDER_ERROR";

export class EmailProviderError extends Error {
  readonly code: EmailProviderErrorCode;
  readonly retryable: boolean;

  constructor(code: EmailProviderErrorCode, retryable: boolean) {
    super(code);
    this.name = "EmailProviderError";
    this.code = code;
    this.retryable = retryable;
  }
}

export function toSafeProviderFailure(error: unknown): {
  code: EmailProviderErrorCode;
  retryable: boolean;
} {
  if (error instanceof EmailProviderError) {
    return { code: error.code, retryable: error.retryable };
  }
  return { code: "PROVIDER_ERROR", retryable: true };
}
