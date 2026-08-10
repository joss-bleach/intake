import { useEffect, useState } from "react";

export type VariantKey = "C6A" | "C6B" | "C6C" | "C6D";

export const VARIANTS: { key: VariantKey; name: string }[] = [
  { key: "C6A", name: "lavender — film grain" },
  { key: "C6B", name: "cool indigo — frosted glass cards" },
  { key: "C6C", name: "fresh teal — mesh blobs + grain" },
  { key: "C6D", name: "warm sunrise — untextured control" },
];

type FontKey = "dm" | "newsreader";
const FONT_LABEL: Record<FontKey, string> = { dm: "DM Serif", newsreader: "Newsreader" };

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

  // PROTOTYPE — while we're comparing display faces, flip `data-font` on <html> so
  // every variant's `font-display` token swaps live, no redeploy needed.
  const [font, setFont] = useState<FontKey>(
    () => (document.documentElement.dataset.font as FontKey) || "dm",
  );
  useEffect(() => {
    document.documentElement.dataset.font = font === "dm" ? "" : font;
  }, [font]);

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
      <span className="h-5 w-px bg-white/15" aria-hidden="true" />
      <button
        type="button"
        onClick={() => setFont((f) => (f === "dm" ? "newsreader" : "dm"))}
        className="rounded-full bg-white/10 px-2.5 py-1 font-mono text-[11px] tracking-wide hover:bg-white/20"
      >
        font: {FONT_LABEL[font]}
      </button>
    </div>
  );
}
