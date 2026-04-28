import { useEffect, useRef } from "react";

/**
 * Calls `onRefresh` whenever the browser tab becomes visible again.
 * Used by data-heavy pages so a user returning from another tab/app
 * always sees the latest server state without manually refreshing.
 *
 * Implementation note: the callback is stored in a ref so the
 * `visibilitychange` listener is attached once per component mount,
 * but always invokes the latest closure (state, search query, etc.).
 */
export function useRefreshOnTabFocus(onRefresh, enabled = true) {
  const cbRef = useRef(onRefresh);
  cbRef.current = onRefresh;

  useEffect(() => {
    if (!enabled) return;
    const handler = () => {
      if (document.visibilityState === "visible" && typeof cbRef.current === "function") {
        cbRef.current();
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [enabled]);
}

export default useRefreshOnTabFocus;
