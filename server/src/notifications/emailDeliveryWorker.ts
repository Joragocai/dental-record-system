import type { EmailDeliveryProcessResult } from "../services/emailDeliveryService.js";

export interface EmailDeliveryProcessor {
  processNext(): Promise<EmailDeliveryProcessResult>;
}

export interface EmailDeliveryWorkerConfig {
  intervalMs: number;
  maxJobsPerTick: number;
}

export interface EmailDeliveryWorkerLogger {
  info(message: string): void;
  error(message: string): void;
}

export interface EmailDeliveryWorker {
  runOnce(): Promise<void>;
  stop(): void;
}

function requirePositiveInteger(value: number, fieldName: string, max: number): number {
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw new Error(`${fieldName} must be an integer between 1 and ${max}.`);
  }
  return value;
}

export function startEmailDeliveryWorker(
  processor: EmailDeliveryProcessor,
  configValue: EmailDeliveryWorkerConfig,
  logger: EmailDeliveryWorkerLogger = console
): EmailDeliveryWorker {
  const intervalMs = requirePositiveInteger(configValue.intervalMs, "intervalMs", 3_600_000);
  const maxJobsPerTick = requirePositiveInteger(configValue.maxJobsPerTick, "maxJobsPerTick", 100);
  let running = false;
  let stopped = false;

  async function runOnce(): Promise<void> {
    if (running || stopped) return;
    running = true;
    const counts = {
      sent: 0,
      failed: 0,
      abandoned: 0,
      leaseLost: 0
    };

    try {
      for (let index = 0; index < maxJobsPerTick; index += 1) {
        const result = await processor.processNext();
        if (result.outcome === "idle") break;
        if (result.outcome === "sent") counts.sent += 1;
        if (result.outcome === "failed") counts.failed += 1;
        if (result.outcome === "abandoned") counts.abandoned += 1;
        if (result.outcome === "lease_lost") counts.leaseLost += 1;
      }

      if (counts.sent + counts.failed + counts.abandoned + counts.leaseLost > 0) {
        logger.info(
          `[email] delivery cycle sent=${counts.sent} failed=${counts.failed} abandoned=${counts.abandoned} lease_lost=${counts.leaseLost}`
        );
      }
    } catch {
      logger.error("[email] delivery cycle failed.");
    } finally {
      running = false;
    }
  }

  const timer = setInterval(() => {
    void runOnce();
  }, intervalMs);
  timer.unref?.();

  return {
    runOnce,
    stop() {
      stopped = true;
      clearInterval(timer);
    }
  };
}
