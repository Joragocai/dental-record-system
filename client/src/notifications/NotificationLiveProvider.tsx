import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.js";
import { getUnreadNotificationCount, listNotifications } from "./notificationApi.js";
import {
  createLiveNotificationController,
  type LiveNotificationController,
  type LiveNotificationEnvironment,
  type LiveNotificationState
} from "./notificationLiveController.js";

interface NotificationLiveContextValue {
  unreadCount: number | null;
  refresh(): void;
  afterRead(): void;
}

const NotificationLiveContext = createContext<NotificationLiveContextValue | null>(null);
const noNotifications: LiveNotificationState = { unreadCount: null, toastCount: 0 };

export function useLiveNotifications(): NotificationLiveContextValue {
  const context = useContext(NotificationLiveContext);
  if (!context) throw new Error("NotificationLiveProvider is required.");
  return context;
}

function browserEnvironment(): LiveNotificationEnvironment {
  return {
    visible: () => document.visibilityState !== "hidden",
    now: () => Date.now(),
    setInterval: (callback, milliseconds) => window.setInterval(callback, milliseconds),
    clearInterval: (handle) => window.clearInterval(handle as number),
    setTimeout: (callback, milliseconds) => window.setTimeout(callback, milliseconds),
    clearTimeout: (handle) => window.clearTimeout(handle as number),
    onFocus: (callback) => {
      window.addEventListener("focus", callback);
      return () => window.removeEventListener("focus", callback);
    },
    onVisibilityChange: (callback) => {
      document.addEventListener("visibilitychange", callback);
      return () => document.removeEventListener("visibilitychange", callback);
    }
  };
}

/**
 * Only active, verified sessions can see their own notification state.
 * State is labeled by recipient so even a render before effect cleanup
 * cannot briefly expose the previous user's badge or toast.
 */
export default function NotificationLiveProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const requestOptions = useMemo(() => {
    if (!auth.authenticated || !auth.providerSession?.accessToken || !auth.apiBaseUrl) return null;
    return { accessToken: auth.providerSession.accessToken, apiBaseUrl: auth.apiBaseUrl };
  }, [auth.authenticated, auth.providerSession?.accessToken, auth.apiBaseUrl]);
  const recipientId = requestOptions ? auth.verifiedIdentity?.id ?? null : null;

  const currentSession = useRef({ recipientId, requestOptions });
  currentSession.current = { recipientId, requestOptions };
  const controllerRef = useRef<LiveNotificationController | null>(null);
  const [scopedState, setScopedState] = useState<{
    recipientId: string | null;
    state: LiveNotificationState;
  }>({ recipientId: null, state: noNotifications });

  useEffect(() => {
    if (!recipientId) return;

    const controller = createLiveNotificationController({
      environment: browserEnvironment(),
      currentRecipient: () =>
        currentSession.current.recipientId === recipientId &&
        currentSession.current.requestOptions !== null,
      credentials: () => currentSession.current.requestOptions,
      list: listNotifications,
      unreadCount: getUnreadNotificationCount,
      onState: (state) => setScopedState({ recipientId, state })
    });
    controllerRef.current = controller;
    controller.start();

    return () => {
      controller.stop();
      if (controllerRef.current === controller) controllerRef.current = null;
    };
  }, [recipientId]);

  const refresh = useCallback(() => controllerRef.current?.refresh(), []);
  const afterRead = useCallback(() => controllerRef.current?.afterRead(), []);
  const dismiss = useCallback(() => controllerRef.current?.dismiss(), []);

  const visibleState = scopedState.recipientId === recipientId && recipientId
    ? scopedState.state
    : noNotifications;

  const value = useMemo<NotificationLiveContextValue>(
    () => ({ unreadCount: visibleState.unreadCount, refresh, afterRead }),
    [visibleState.unreadCount, refresh, afterRead]
  );

  return (
    <NotificationLiveContext.Provider value={value}>
      {children}
      {recipientId && visibleState.toastCount > 0 ? (
        <aside
          className="fixed inset-x-4 top-4 z-40 rounded-2xl border border-clinic-200 bg-white p-4 shadow-xl sm:left-auto sm:right-5 sm:w-80"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-bold text-slate-900">New notification</p>
              <p className="mt-1 text-sm text-slate-600">
                {visibleState.toastCount === 1
                  ? "You have a new notification."
                  : `You have ${visibleState.toastCount} new notifications.`}
              </p>
              <Link
                to="/notifications"
                className="mt-3 inline-block text-sm font-semibold text-clinic-700 underline"
                onClick={dismiss}
              >
                View notifications
              </Link>
            </div>
            <button
              type="button"
              aria-label="Dismiss notification alert"
              className="rounded-lg px-2 py-1 text-slate-600 hover:bg-slate-100"
              onClick={dismiss}
            >
              ×
            </button>
          </div>
        </aside>
      ) : null}
    </NotificationLiveContext.Provider>
  );
}
