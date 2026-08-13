import { useEffect, useState } from "react";

// True while the browser reports a network connection. Drives the plain
// "offline" indicator (AppShell) and gates both logging entry points
// (ADR 0003) — no queue/retry, so a write attempt just stays blocked until
// this flips back to true.
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return online;
}

// Shared copy for both logging entry points (ADR 0003) — one place so the
// description and label-photo screens can't drift on wording.
export const OFFLINE_LOG_MESSAGE = "No internet — you can log again once you're back online.";
