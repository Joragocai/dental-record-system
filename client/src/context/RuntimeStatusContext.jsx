import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getRuntimeStatus } from "../lib/api";
import { useCloudAuth } from "./CloudAuthContext";

const fallback = {
  mode: "clean",
  isDemoMode: false,
  automaticBackupEnabled: false
};
const RuntimeStatusContext = createContext({
  ...fallback,
  loading: false,
  statusError: "",
  refreshRuntimeStatus: async () => {}
});

export function RuntimeStatusProvider({ children }) {
  const { enabled, ready, authenticated } = useCloudAuth();
  const [runtimeStatus, setRuntimeStatus] = useState(fallback);
  const [loading, setLoading] = useState(true);
  const [statusError, setStatusError] = useState("");

  const refreshRuntimeStatus = useCallback(async () => {
    if (enabled && (!ready || !authenticated)) {
      setRuntimeStatus(fallback);
      setStatusError("");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const status = await getRuntimeStatus();
      if (typeof status?.isDemoMode !== "boolean") {
        throw new Error("Unexpected runtime-status response");
      }
      setRuntimeStatus(status);
      setStatusError("");
    } catch (error) {
      setRuntimeStatus(fallback);
      setStatusError(error.response?.data?.message || error.message || "Unable to verify demo mode.");
    } finally {
      setLoading(false);
    }
  }, [enabled, ready, authenticated]);

  useEffect(() => {
    let active = true;
    if (!ready && enabled) return undefined;
    const run = () => {
      if (active && (!document.hidden)) refreshRuntimeStatus();
    };
    // Refresh after sign-in and when returning to an already-open tab.
    run();
    window.addEventListener("focus", run);
    document.addEventListener("visibilitychange", run);
    return () => {
      active = false;
      window.removeEventListener("focus", run);
      document.removeEventListener("visibilitychange", run);
    };
  }, [enabled, ready, authenticated, refreshRuntimeStatus]);

  const value = useMemo(() => ({
    ...runtimeStatus,
    loading,
    statusError,
    refreshRuntimeStatus
  }), [runtimeStatus, loading, statusError, refreshRuntimeStatus]);
  return <RuntimeStatusContext.Provider value={value}>{children}</RuntimeStatusContext.Provider>;
}

export function useRuntimeStatus() {
  return useContext(RuntimeStatusContext);
}
