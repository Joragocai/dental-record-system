import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.js";
import { getUnreadNotificationCount } from "./notificationApi.js";

export default function NotificationNavLink({ className = "button-secondary" }: { className?: string }) {
  const auth = useAuth();
  const requestOptions = useMemo(() => {
    const accessToken = auth.providerSession?.accessToken;
    if (!accessToken || !auth.apiBaseUrl) return null;
    return { accessToken, apiBaseUrl: auth.apiBaseUrl };
  }, [auth.providerSession?.accessToken, auth.apiBaseUrl]);
  const [unread, setUnread] = useState<number | null>(null);

  useEffect(() => {
    if (!requestOptions) return;
    let active = true;
    void getUnreadNotificationCount(requestOptions)
      .then((count) => {
        if (active) setUnread(count);
      })
      .catch(() => {
        if (active) setUnread(null);
      });
    return () => {
      active = false;
    };
  }, [requestOptions]);

  return (
    <Link className={`${className} inline-flex items-center gap-2`} to="/notifications">
      <span>Notifications</span>
      {unread !== null && unread > 0 ? (
        <span
          className="inline-flex min-w-5 items-center justify-center rounded-full bg-clinic-700 px-1.5 py-0.5 text-xs font-bold text-white"
          aria-label={`${unread} unread notifications`}
        >
          {unread > 99 ? "99+" : unread}
        </span>
      ) : null}
    </Link>
  );
}
