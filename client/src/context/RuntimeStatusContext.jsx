import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { getRuntimeStatus } from "../lib/api";

const RuntimeStatusContext = createContext({
  mode: "clean",
  isDemoMode: false,
  automaticBackupEnabled: true
});

export function RuntimeStatusProvider({ children }) {
  const [runtimeStatus, setRuntimeStatus] = useState({
    mode: "clean",
    isDemoMode: false,
    automaticBackupEnabled: true
  });

  useEffect(() => {
    // The hosted application has no legacy SQLite runtime/status endpoint.
    if (import.meta.env.PROD) return undefined;

    let isMounted = true;

    async function loadRuntimeStatus() {
      try {
        const status = await getRuntimeStatus();
        if (isMounted && status && typeof status.isDemoMode === "boolean") {
          setRuntimeStatus(status);
        }
      } catch {
        // Keep the safe default clean-mode display when runtime status is unavailable.
      }
    }

    loadRuntimeStatus();

    return () => {
      isMounted = false;
    };
  }, []);

  const value = useMemo(() => runtimeStatus, [runtimeStatus]);

  return (
    <RuntimeStatusContext.Provider value={value}>
      {children}
    </RuntimeStatusContext.Provider>
  );
}

export function useRuntimeStatus() {
  return useContext(RuntimeStatusContext);
}
