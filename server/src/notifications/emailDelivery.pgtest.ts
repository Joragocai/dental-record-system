import assert from "node:assert/strict";
import test from "node:test";
import type { PgPoolManager } from "../postgres/pool.js";
import type {
  ClaimedEmailDelivery,
  EmailDeliveryRepository
} from "../repositories/emailDeliveryRepository.js";
import {
  computeRetryDelaySeconds,
  createEmailDeliveryService
} from "../services/emailDeliveryService.js";
import {
  EmailProviderError,
  type EmailProvider,
  type EmailSendInput
} from "./emailProvider.js";
import { startEmailDeliveryWorker } from "./emailDeliveryWorker.js";
import { renderEmailTemplate } from "./emailTemplates.js";

const delivery: ClaimedEmailDelivery = {
  id: "11111111-1111-4111-8111-111111111111",
  recipientUserId: null,
  recipientPatientId: "22222222-2222-4222-8222-222222222222",
  category: "appointment",
  eventType: "APPOINTMENT_CONFIRMED",
  templateKey: "appointment-confirmed",
  sourceType: "appointment",
  sourceId: "33333333-3333-4333-8333-333333333333",
  branchId: "44444444-4444-4444-8444-444444444444",
  requestId: "55555555-5555-4555-8555-555555555555",
  dedupeKey: "email:appointment:test",
  attemptCount: 1,
  claimedAt: "2026-10-09T16:00:00.000Z",
  createdAt: "2026-10-09T15:59:00.000Z"
};

function fakePool(): PgPoolManager {
  return {
    describeTarget() {
      return {
        appEnv: "test",
        host: "127.0.0.1",
        port: 5432,
        database: "test",
        username: "test",
        sslMode: "disable"
      };
    },
    isStarted() {
      return false;
    },
    async query() {
      throw new Error("Unexpected pool query.");
    },
    async withTransaction() {
      throw new Error("Unexpected pool transaction.");
    },
    async shutdown() {}
  };
}

function buildRepository(overrides: Partial<EmailDeliveryRepository> = {}): EmailDeliveryRepository {
  return {
    async abandonExhausted() {
      return 0;
    },
    async claimNext() {
      return delivery;
    },
    async resolveRecipientEmail() {
      return "PATIENT@example.test";
    },
    async markSent() {
      return true;
    },
    async markFailure() {
      return true;
    },
    ...overrides
  };
}

const config = {
  from: "clinic@example.test",
  leaseSeconds: 120,
  maxAttempts: 4,
  retryBaseSeconds: 60,
  retryMaxSeconds: 3600
};

test("email templates contain only generic appointment status content", () => {
  for (const key of [
    "appointment-confirmed",
    "appointment-rescheduled",
    "appointment-cancelled-by-clinic",
    "appointment-no-show"
  ]) {
    const template = renderEmailTemplate(key);
    assert.ok(template);
    assert.doesNotMatch(template.subject + template.text, /procedure|diagnosis|treatment|notes/i);
  }
  assert.equal(renderEmailTemplate("unknown-template"), null);
});

test("retry delay uses bounded exponential backoff", () => {
  assert.equal(computeRetryDelaySeconds(1, 60, 3600), 60);
  assert.equal(computeRetryDelaySeconds(2, 60, 3600), 120);
  assert.equal(computeRetryDelaySeconds(4, 60, 3600), 480);
  assert.equal(computeRetryDelaySeconds(10, 60, 3600), 3600);
});

test("delivery service sends a safe template and marks the current lease sent", async () => {
  const sentInputs: EmailSendInput[] = [];
  const provider: EmailProvider = {
    async send(value) {
      sentInputs.push(value);
      return { providerMessageId: "provider-1" };
    }
  };
  let sentMessageId = "";
  const repository = buildRepository({
    async markSent(_delivery, _at, providerMessageId) {
      sentMessageId = providerMessageId;
      return true;
    }
  });
  const service = createEmailDeliveryService(fakePool(), provider, config, {
    now: () => new Date("2026-10-09T16:01:00.000Z"),
    repositoryFactory: () => repository
  });

  assert.deepEqual(await service.processNext(), {
    outcome: "sent",
    deliveryId: delivery.id
  });
  assert.equal(sentInputs.length, 1);
  assert.equal(sentInputs[0]?.to, "patient@example.test");
  assert.equal(sentInputs[0]?.from, "clinic@example.test");
  assert.equal(sentInputs[0]?.idempotencyKey, delivery.dedupeKey);
  assert.equal(sentMessageId, "provider-1");
});

test("retryable provider failure records only a safe code and retry timestamp", async () => {
  const provider: EmailProvider = {
    async send() {
      throw new EmailProviderError("PROVIDER_TEMPORARY", true);
    }
  };
  let failure:
    | { status: string; code: string; nextAttemptAt: string | null }
    | null = null;
  const repository = buildRepository({
    async markFailure(_delivery, _at, status, code, nextAttemptAt) {
      failure = { status, code, nextAttemptAt };
      return true;
    }
  });
  const service = createEmailDeliveryService(fakePool(), provider, config, {
    now: () => new Date("2026-10-09T16:01:00.000Z"),
    repositoryFactory: () => repository
  });

  const result = await service.processNext();
  assert.equal(result.outcome, "failed");
  assert.deepEqual(failure, {
    status: "failed",
    code: "PROVIDER_TEMPORARY",
    nextAttemptAt: "2026-10-09T16:02:00.000Z"
  });
});

test("permanent provider failure and missing recipient are abandoned without retry", async () => {
  const provider: EmailProvider = {
    async send() {
      throw new EmailProviderError("PROVIDER_REJECTED", false);
    }
  };
  let providerCalls = 0;
  const missingRecipientProvider: EmailProvider = {
    async send() {
      providerCalls += 1;
      return { providerMessageId: "unexpected" };
    }
  };

  const permanentService = createEmailDeliveryService(fakePool(), provider, config, {
    repositoryFactory: () => buildRepository()
  });
  const permanent = await permanentService.processNext();
  assert.equal(permanent.outcome, "abandoned");
  if (permanent.outcome === "abandoned") assert.equal(permanent.errorCode, "PROVIDER_REJECTED");

  const missingRecipientService = createEmailDeliveryService(fakePool(), missingRecipientProvider, config, {
    repositoryFactory: () => buildRepository({
      async resolveRecipientEmail() {
        return null;
      }
    })
  });
  const missing = await missingRecipientService.processNext();
  assert.equal(missing.outcome, "abandoned");
  if (missing.outcome === "abandoned") assert.equal(missing.errorCode, "RECIPIENT_EMAIL_UNAVAILABLE");
  assert.equal(providerCalls, 0);
});

test("email worker bounds each cycle and suppresses overlapping runs", async () => {
  let calls = 0;
  let releaseFirst!: () => void;
  const firstWait = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const processor = {
    async processNext() {
      calls += 1;
      if (calls === 1) await firstWait;
      return calls >= 3
        ? ({ outcome: "idle" } as const)
        : ({ outcome: "sent", deliveryId: String(calls) } as const);
    }
  };
  const messages: string[] = [];
  const worker = startEmailDeliveryWorker(
    processor,
    { intervalMs: 60_000, maxJobsPerTick: 5 },
    {
      info(message) {
        messages.push(message);
      },
      error(message) {
        messages.push(message);
      }
    }
  );

  const first = worker.runOnce();
  await Promise.resolve();
  await worker.runOnce();
  assert.equal(calls, 1);
  releaseFirst();
  await first;
  assert.equal(calls, 3);
  assert.equal(messages.length, 1);
  worker.stop();
});
