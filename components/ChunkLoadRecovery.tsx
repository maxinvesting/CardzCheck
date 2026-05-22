"use client";

import { useEffect } from "react";

const RELOAD_KEY = "cardzcheck:chunk-reload";

function isChunkLoadFailure(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("chunkloaderror") ||
    normalized.includes("loading chunk") ||
    normalized.includes("failed to fetch dynamically imported module")
  );
}

/**
 * After a dev-server restart, the browser can keep stale chunk URLs and fail
 * with ChunkLoadError. Reload once to pick up the new build manifest.
 */
export function ChunkLoadRecovery() {
  useEffect(() => {
    const reloadOnce = (reason: string) => {
      if (typeof window === "undefined") return;
      if (sessionStorage.getItem(RELOAD_KEY) === "1") return;
      sessionStorage.setItem(RELOAD_KEY, "1");
      console.warn("[chunk-recovery] Reloading after chunk load failure:", reason);
      window.location.reload();
    };

    const onError = (event: ErrorEvent) => {
      const message = event.message || String(event.error ?? "");
      if (isChunkLoadFailure(message)) {
        reloadOnce(message);
      }
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message =
        reason instanceof Error
          ? reason.message
          : typeof reason === "string"
            ? reason
            : "";
      if (isChunkLoadFailure(message)) {
        reloadOnce(message);
      }
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

  return null;
}
