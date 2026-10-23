// No patient, payment, or treatment details are transmitted through Socket.IO.
// Events only indicate that clients should refetch their authoritative API data.
export const FINANCE_CHANGED_EVENT = "finance:changed";

let broadcastFinanceChange = null;

export function registerFinanceBroadcaster(broadcast) {
  if (typeof broadcast !== "function") throw new TypeError("Finance broadcaster must be a function.");
  broadcastFinanceChange = broadcast;
  return () => {
    if (broadcastFinanceChange === broadcast) broadcastFinanceChange = null;
  };
}

export function publishFinanceChange() {
  broadcastFinanceChange?.({ changedAt: new Date().toISOString() });
}
