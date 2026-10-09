import type { PgPoolManager } from "../postgres/pool.js";
import {
  createEmailDeliveryRepository,
  type ClaimedEmailDelivery,
  type EmailDeliveryRepository
} from "../repositories/emailDeliveryRepository.js";
import {
  toSafeProviderFailure,
  type EmailProvider
} from "../notifications/emailProvider.js";
import { renderEmailTemplate } from "../notifications/emailTemplates.js";

export interface EmailDeliveryServiceConfig {
  from: string;
  leaseSeconds: number;
  maxAttempts: number;
  retryBaseSeconds: number;
  retryMaxSeconds: number;
}

export type EmailDeliveryProcessResult =
  | { outcome: "idle" }
  | { outcome: "sent"; deliveryId: string }
  | { outcome: "failed"; deliveryId: string; errorCode: string; nextAttemptAt: string }
  | { outcome: "abandoned"; deliveryId: string; errorCode: string }
  | { outcome: "lease_lost"; deliveryId: string };

export interface EmailDeliveryServiceOptions {
  now?: () => Date;
  repositoryFactory?: (pool: PgPoolManager) => EmailDeliveryRepository;
}

const simpleEmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(value: string | null): string | null {
  if (value === null) return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized.length > 254 || !simpleEmailPattern.test(normalized)) return null;
  return normalized;
}

function requirePositiveInteger(value: number, fieldName: string, max: number): number {
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw new Error(`${fieldName} must be an integer between 1 and ${max}.`);
  }
  return value;
}

function normalizeConfig(config: EmailDeliveryServiceConfig): EmailDeliveryServiceConfig {
  const from = config.from.trim();
  if (!from || from.length > 320) throw new Error("Email delivery from address is invalid.");
  return {
    from,
    leaseSeconds: requirePositiveInteger(config.leaseSeconds, "leaseSeconds", 3600),
    maxAttempts: requirePositiveInteger(config.maxAttempts, "maxAttempts", 20),
    retryBaseSeconds: requirePositiveInteger(config.retryBaseSeconds, "retryBaseSeconds", 86400),
    retryMaxSeconds: requirePositiveInteger(config.retryMaxSeconds, "retryMaxSeconds", 604800)
  };
}

function addSeconds(timestamp: string, seconds: number): string {
  const millis = Date.parse(timestamp);
  if (Number.isNaN(millis)) throw new Error("Invalid email delivery timestamp.");
  return new Date(millis + seconds * 1000).toISOString();
}

export function computeRetryDelaySeconds(
  attemptCount: number,
  baseSeconds: number,
  maxSeconds: number
): number {
  const exponent = Math.max(0, attemptCount - 1);
  return Math.min(maxSeconds, baseSeconds * (2 ** exponent));
}

function normalizeProviderMessageId(value: string): string | null {
  const normalized = value.trim();
  return normalized && normalized.length <= 255 ? normalized : null;
}

async function abandon(
  repository: EmailDeliveryRepository,
  delivery: ClaimedEmailDelivery,
  at: string,
  errorCode: string
): Promise<EmailDeliveryProcessResult> {
  const updated = await repository.markFailure(delivery, at, "abandoned", errorCode, null);
  return updated
    ? { outcome: "abandoned", deliveryId: delivery.id, errorCode }
    : { outcome: "lease_lost", deliveryId: delivery.id };
}

export function createEmailDeliveryService(
  pool: PgPoolManager,
  provider: EmailProvider,
  configValue: EmailDeliveryServiceConfig,
  options: EmailDeliveryServiceOptions = {}
) {
  const config = normalizeConfig(configValue);
  const repository = (options.repositoryFactory ?? createEmailDeliveryRepository)(pool);
  const now = options.now ?? (() => new Date());

  return {
    async processNext(): Promise<EmailDeliveryProcessResult> {
      const claimAt = now().toISOString();
      await repository.abandonExhausted(claimAt, config.maxAttempts);
      const delivery = await repository.claimNext(claimAt, config.leaseSeconds, config.maxAttempts);
      if (!delivery) return { outcome: "idle" };

      const recipient = normalizeEmail(await repository.resolveRecipientEmail(delivery));
      if (!recipient) {
        return abandon(repository, delivery, now().toISOString(), "RECIPIENT_EMAIL_UNAVAILABLE");
      }

      const template = renderEmailTemplate(delivery.templateKey);
      if (!template) {
        return abandon(repository, delivery, now().toISOString(), "TEMPLATE_UNSUPPORTED");
      }

      try {
        const result = await provider.send({
          to: recipient,
          from: config.from,
          subject: template.subject,
          text: template.text,
          idempotencyKey: delivery.dedupeKey
        });
        const providerMessageId = normalizeProviderMessageId(result.providerMessageId);
        if (!providerMessageId) {
          return abandon(repository, delivery, now().toISOString(), "PROVIDER_MESSAGE_ID_INVALID");
        }

        const sentAt = now().toISOString();
        const updated = await repository.markSent(delivery, sentAt, providerMessageId);
        return updated
          ? { outcome: "sent", deliveryId: delivery.id }
          : { outcome: "lease_lost", deliveryId: delivery.id };
      } catch (error) {
        const failure = toSafeProviderFailure(error);
        const failedAt = now().toISOString();
        if (!failure.retryable || delivery.attemptCount >= config.maxAttempts) {
          return abandon(repository, delivery, failedAt, failure.code);
        }

        const delaySeconds = computeRetryDelaySeconds(
          delivery.attemptCount,
          config.retryBaseSeconds,
          config.retryMaxSeconds
        );
        const nextAttemptAt = addSeconds(failedAt, delaySeconds);
        const updated = await repository.markFailure(
          delivery,
          failedAt,
          "failed",
          failure.code,
          nextAttemptAt
        );
        return updated
          ? {
              outcome: "failed",
              deliveryId: delivery.id,
              errorCode: failure.code,
              nextAttemptAt
            }
          : { outcome: "lease_lost", deliveryId: delivery.id };
      }
    }
  };
}
