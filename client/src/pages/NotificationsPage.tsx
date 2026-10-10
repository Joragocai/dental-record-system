import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.js";
import { useLiveNotifications } from "../notifications/NotificationLiveProvider.js";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type InAppNotification
} from "../notifications/notificationApi.js";

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "Unknown time";
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

export default function NotificationsPage() {
  const auth = useAuth();
  const { refresh: refreshNotificationCount, afterRead } = useLiveNotifications();
  const recipientId = auth.verifiedIdentity?.id ?? null;
  const requestOptions = useMemo(() => {
    const accessToken = auth.providerSession?.accessToken;
    if (!accessToken || !auth.apiBaseUrl) return null;
    return { accessToken, apiBaseUrl: auth.apiBaseUrl };
  }, [auth.providerSession?.accessToken, auth.apiBaseUrl]);
  const [items, setItems] = useState<InAppNotification[]>([]);
  const [itemsRecipientId, setItemsRecipientId] = useState<string | null>(null);
  const recipientRef = useRef(recipientId);
  recipientRef.current = recipientId;
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState("");
  const requestVersion = useRef(0);

  const load = useCallback(async () => {
    if (!requestOptions || !recipientId) return;
    const scopedRecipient = recipientId;
    const version = ++requestVersion.current;
    setLoading(true);
    setFeedback("");
    try {
      const nextItems = await listNotifications(requestOptions);
      if (version !== requestVersion.current || recipientRef.current !== scopedRecipient) return;
      setItemsRecipientId(scopedRecipient);
      setItems(nextItems);
      refreshNotificationCount();
    } catch (error) {
      if (version === requestVersion.current && recipientRef.current === scopedRecipient) {
        setFeedback(error instanceof Error ? error.message : "Unable to load notifications.");
      }
    } finally {
      if (version === requestVersion.current && recipientRef.current === scopedRecipient) setLoading(false);
    }
  }, [requestOptions, recipientId, refreshNotificationCount]);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleItems = recipientId !== null && recipientId === itemsRecipientId ? items : [];
  const scopeLoading = loading || itemsRecipientId !== recipientId;
  const unreadCount = visibleItems.filter((item) => item.readAt === null).length;

  async function markRead(item: InAppNotification) {
    if (!requestOptions || !recipientId || item.readAt || scopeLoading || submitting) return;
    const scopedRecipient = recipientId;
    requestVersion.current += 1;
    setSubmitting(true);
    setFeedback("");
    try {
      await markNotificationRead(item.id, requestOptions);
      if (recipientRef.current !== scopedRecipient) return;
      const now = new Date().toISOString();
      setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, readAt: now } : entry));
      afterRead();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Unable to mark the notification as read.");
    } finally {
      setSubmitting(false);
    }
  }

  async function markAllRead() {
    if (!requestOptions || !recipientId || unreadCount === 0 || scopeLoading || submitting) return;
    const scopedRecipient = recipientId;
    requestVersion.current += 1;
    setSubmitting(true);
    setFeedback("");
    try {
      await markAllNotificationsRead(requestOptions);
      if (recipientRef.current !== scopedRecipient) return;
      const now = new Date().toISOString();
      setItems((current) => current.map((entry) => entry.readAt ? entry : { ...entry, readAt: now }));
      afterRead();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Unable to mark notifications as read.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-4 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-clinic-700">Dental Clinic Operations</p>
            <h1 className="mt-1 text-2xl font-bold text-slate-950">Notifications</h1>
            <p className="mt-1 text-sm text-slate-500">Only notifications assigned to your signed-in account are shown.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link className="button-secondary" to="/appointments">Appointments</Link>
            <Link className="button-secondary" to="/auth/account">Account</Link>
            <button
              className="button-primary"
              type="button"
              disabled={unreadCount === 0 || scopeLoading || submitting}
              onClick={() => void markAllRead()}
            >
              Mark all read
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl space-y-4 px-4 py-6 sm:px-6">
        {feedback ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {feedback}
          </div>
        ) : null}

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Notification history</h2>
              <p className="mt-1 text-sm text-slate-500">{unreadCount} unread · showing up to 50 most recent notifications</p>
            </div>
            <button className="button-secondary" type="button" disabled={loading || submitting} onClick={() => void load()}>
              Refresh
            </button>
          </div>

          {scopeLoading ? (
            <p className="mt-6 text-sm text-slate-500">Loading notifications...</p>
          ) : items.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
              No in-app notifications yet.
            </div>
          ) : (
            <ul className="mt-5 space-y-3">
              {visibleItems.map((item) => (
                <li
                  key={item.id}
                  className={`rounded-2xl border p-4 ${item.readAt ? "border-slate-200 bg-white" : "border-clinic-200 bg-clinic-50"}`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold text-slate-900">{item.title}</h3>
                        {!item.readAt ? (
                          <span className="rounded-full bg-clinic-700 px-2 py-0.5 text-xs font-bold text-white">Unread</span>
                        ) : null}
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-700">{item.body}</p>
                      <p className="mt-2 text-xs text-slate-500">{formatTimestamp(item.createdAt)}</p>
                    </div>
                    {!item.readAt ? (
                      <button
                        type="button"
                        className="button-secondary shrink-0"
                        disabled={submitting || scopeLoading}
                        onClick={() => void markRead(item)}
                      >
                        Mark read
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
