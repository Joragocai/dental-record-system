import { Link } from "react-router-dom";
import { useLiveNotifications } from "./NotificationLiveProvider.js";

export default function NotificationNavLink({ className = "button-secondary" }: { className?: string }) {
  const { unreadCount } = useLiveNotifications();

  return (
    <Link className={`${className} inline-flex items-center gap-2`} to="/notifications">
      <svg
        aria-hidden="true"
        className="h-4 w-4 shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" />
        <path d="M10 20a2 2 0 0 0 4 0" />
      </svg>
      <span>Notifications</span>
      {unreadCount !== null && unreadCount > 0 ? (
        <span
          className="inline-flex min-w-5 items-center justify-center rounded-full bg-clinic-700 px-1.5 py-0.5 text-xs font-bold text-white"
          aria-label={`${unreadCount} unread notifications`}
        >
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      ) : null}
    </Link>
  );
}
