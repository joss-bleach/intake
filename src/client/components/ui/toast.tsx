import { useEffect } from "react";

// Minimal, self-dismissing toast (issue #51's food-level correction
// feedback — "surfaced as a toast"). No repo dependency provides one yet
// (shadcn's sonner would pull in a new package for a single fixed-position
// banner); this is deliberately small rather than a general toast queue —
// the app only ever has one correction in flight at a time.
export function Toast({
  message,
  onDismiss,
  durationMs = 4000,
}: {
  message: string;
  onDismiss: () => void;
  durationMs?: number;
}) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(timer);
  }, [onDismiss, durationMs]);

  return (
    <div
      role="status"
      className="pointer-events-auto rounded-2xl bg-black/80 px-4 py-3 text-sm text-white shadow-lg backdrop-blur-xl"
      style={{ color: "white" }}
    >
      <span>{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="ml-3 font-medium underline decoration-white/40 underline-offset-2"
      >
        Dismiss
      </button>
    </div>
  );
}
