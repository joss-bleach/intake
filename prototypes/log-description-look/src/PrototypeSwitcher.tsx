import { useEffect } from "react";

export type VariantKey = "A" | "B" | "C" | "C2";

export const VARIANTS: { key: VariantKey; name: string }[] = [
  { key: "A", name: "inline edit-in-place" },
  { key: "B", name: "expanding ingredient cards" },
  { key: "C", name: "compact list + bottom sheet" },
  { key: "C2", name: "compact list, expands in place (no sheet)" },
];

// PROTOTYPE — floating variant switcher. Not for production; nothing here ships.
export function PrototypeSwitcher({
  current,
  onChange,
}: {
  current: VariantKey;
  onChange: (key: VariantKey) => void;
}) {
  const idx = VARIANTS.findIndex((v) => v.key === current);
  const cycle = (dir: 1 | -1) => {
    const next = (idx + dir + VARIANTS.length) % VARIANTS.length;
    onChange(VARIANTS[next].key);
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      if (e.key === "ArrowLeft") cycle(-1);
      if (e.key === "ArrowRight") cycle(1);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  return (
    <div className="fixed top-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full bg-neutral-900 px-3 py-2 text-white shadow-[0_8px_30px_rgba(0,0,0,0.35)] ring-1 ring-white/10">
      <button
        type="button"
        aria-label="Previous variant"
        onClick={() => cycle(-1)}
        className="grid h-8 w-8 place-items-center rounded-full text-lg hover:bg-white/10"
      >
        ←
      </button>
      <span className="min-w-[15rem] text-center font-mono text-xs tracking-wide">
        {current} — {VARIANTS[idx].name}
      </span>
      <button
        type="button"
        aria-label="Next variant"
        onClick={() => cycle(1)}
        className="grid h-8 w-8 place-items-center rounded-full text-lg hover:bg-white/10"
      >
        →
      </button>
    </div>
  );
}
