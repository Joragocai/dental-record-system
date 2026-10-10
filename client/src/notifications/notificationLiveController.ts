import type { AuthenticatedFetchOptions } from "../auth/authApi.js";
import type { InAppNotification } from "./notificationApi.js";
import { countNewUnreadNotifications } from "./liveNotificationState.js";

export const LIVE_POLL_INTERVAL_MS = 30_000;
export const LIVE_TOAST_DURATION_MS = 7_000;

export interface LiveNotificationState {
  unreadCount: number | null;
  toastCount: number;
}

export interface LiveNotificationEnvironment {
  visible(): boolean;
  now(): number;
  setInterval(callback: () => void, milliseconds: number): unknown;
  clearInterval(handle: unknown): void;
  setTimeout(callback: () => void, milliseconds: number): unknown;
  clearTimeout(handle: unknown): void;
  onFocus(callback: () => void): () => void;
  onVisibilityChange(callback: () => void): () => void;
}

export interface LiveNotificationDependencies {
  environment: LiveNotificationEnvironment;
  currentRecipient(): boolean;
  credentials(): AuthenticatedFetchOptions | null;
  list(options: AuthenticatedFetchOptions): Promise<InAppNotification[]>;
  unreadCount(options: AuthenticatedFetchOptions): Promise<number>;
  onState(state: LiveNotificationState): void;
}

export interface LiveNotificationController {
  start(): void;
  stop(): void;
  refresh(): void;
  afterRead(): void;
  dismiss(): void;
}

const initialState: LiveNotificationState = { unreadCount: null, toastCount: 0 };

/**
 * Client-only notification monitoring: each instance belongs to one verified
 * application user. Requests and callbacks from retired instances are ignored.
 * Rotation of that user's access token does not reset the observed ID baseline.
 */
export function createLiveNotificationController({
  environment,
  currentRecipient,
  credentials,
  list,
  unreadCount,
  onState
}: LiveNotificationDependencies): LiveNotificationController {
  let running = false;
  let fetching = false;
  let refreshQueued = false;
  let revision = 0;
  let lastResumeAt = Number.NEGATIVE_INFINITY;
  let observed: InAppNotification[] | null = null;
  let state: LiveNotificationState = { ...initialState };
  let interval: unknown = null;
  let toastTimeout: unknown = null;
  let removeFocus: (() => void) | null = null;
  let removeVisibility: (() => void) | null = null;

  const allowed = () => running && currentRecipient();

  function publish(next: LiveNotificationState) {
    if (!allowed()) return;
    state = next;
    onState({ ...next });
  }

  function clearToastTimeout() {
    if (toastTimeout !== null) {
      environment.clearTimeout(toastTimeout);
      toastTimeout = null;
    }
  }

  function dismiss() {
    clearToastTimeout();
    if (allowed() && state.toastCount !== 0) publish({ ...state, toastCount: 0 });
  }

  function showToast(count: number) {
    if (count <= 0) return;
    clearToastTimeout();
    publish({ ...state, toastCount: state.toastCount + count });
    toastTimeout = environment.setTimeout(() => {
      toastTimeout = null;
      dismiss();
    }, LIVE_TOAST_DURATION_MS);
  }

  async function poll() {
    if (!allowed() || !environment.visible()) return;
    if (fetching) {
      refreshQueued = true;
      return;
    }

    const options = credentials();
    if (!options) return;

    fetching = true;
    const requestRevision = revision;
    try {
      // Sequential reads avoid increasing hosted PostgreSQL connection pressure.
      const notifications = await list(options);
      if (!allowed() || requestRevision !== revision) return;
      const count = await unreadCount(options);
      if (!allowed() || requestRevision !== revision) return;

      // A count lower than the list's unread entries indicates a concurrent
      // read between requests. Do not consume unseen IDs on an inconsistent
      // snapshot: retry later instead of permanently dropping their toast.
      const listUnread = notifications.filter((row) => row.readAt === null).length;
      if (count < listUnread) {
        // Another tab may have read the notification already. Never keep a
        // stale alert visible for a non-atomic list/count snapshot.
        clearToastTimeout();
        publish({ unreadCount: count, toastCount: 0 });
        // Avoid an immediate infinite retry while another tab is mutating.
        // The next scheduled or user-triggered refresh retries the baseline.
        return;
      }
      const newUnread = countNewUnreadNotifications(observed, notifications);
      observed = notifications;
      publish({ ...state, unreadCount: count });
      if (count === 0) {
        dismiss();
      } else if (newUnread > 0) {
        showToast(Math.min(newUnread, count));
      }
    } catch {
      // Fail closed: do not report a stale count as authoritative.
      if (allowed() && requestRevision === revision) {
        clearToastTimeout();
        publish({ unreadCount: null, toastCount: 0 });
      }
    } finally {
      fetching = false;
      if (allowed() && refreshQueued) {
        refreshQueued = false;
        void poll();
      }
    }
  }

  function refresh() {
    if (allowed()) void poll();
  }

  function afterRead() {
    if (!allowed()) return;
    revision += 1;
    dismiss();
    // A previous poll may have captured an unread state before the mutation.
    // Discard its response and perform a fresh read after it finishes.
    if (fetching) refreshQueued = true;
    else void poll();
  }

  function onResume() {
    if (!allowed() || !environment.visible()) return;
    const timestamp = environment.now();
    if (timestamp - lastResumeAt < 1000) return;
    lastResumeAt = timestamp;
    refresh();
  }

  function start() {
    if (running) return;
    running = true;
    state = { ...initialState };
    observed = null;
    revision += 1;
    publish(state);
    interval = environment.setInterval(refresh, LIVE_POLL_INTERVAL_MS);
    removeFocus = environment.onFocus(onResume);
    removeVisibility = environment.onVisibilityChange(onResume);
    refresh();
  }

  function stop() {
    if (!running) return;
    running = false;
    revision += 1;
    refreshQueued = false;
    clearToastTimeout();
    if (interval !== null) {
      environment.clearInterval(interval);
      interval = null;
    }
    removeFocus?.();
    removeVisibility?.();
    removeFocus = null;
    removeVisibility = null;
  }

  return { start, stop, refresh, afterRead, dismiss };
}
