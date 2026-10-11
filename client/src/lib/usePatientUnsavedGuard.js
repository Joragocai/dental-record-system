import { useCallback, useEffect } from "react";
import { useBeforeUnload, useBlocker } from "react-router-dom";

export function usePatientUnsavedGuard(shouldBlock, subject = "patient") {
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    shouldBlock && (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search)
  );

  useBeforeUnload(useCallback((event) => {
    if (!shouldBlock) return;
    event.preventDefault();
    event.returnValue = "";
  }, [shouldBlock]));

  useEffect(() => {
    if (blocker.state !== "blocked") return;
    const leave = window.confirm(`You have unsaved ${subject} information. Leave this page and discard your changes?`);
    if (leave) blocker.proceed();
    else blocker.reset();
  }, [blocker]);
}
