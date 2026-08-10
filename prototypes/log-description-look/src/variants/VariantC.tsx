import { useState } from "react";
import { Beef, Check, Droplet, Sparkles, Wheat, X } from "lucide-react";
import { Blobs, MACRO_CHIP, panelClass, sheenClass, theme } from "../theme";
import { needsReviewCount, parsedDescription, totals, type ParsedIngredient } from "../data";

// Variant C — the list stays ultra-compact (plain divider rows, echoing the
// dashboard's grouped food-log treatment) so the whole meal is scannable at
// a glance. Correction happens in a bottom sheet that slides up over the
// list, not inside it. Primary affordance: the sheet.
export function VariantC() {
  const { items } = parsedDescription;
  const t = totals(items);
  const reviewCount = needsReviewCount(items);
  const [editing, setEditing] = useState<ParsedIngredient | null>(null);

  return (
    <div className={`relative isolate min-h-full overflow-hidden ${theme.pageBg} pb-24`}>
      <Blobs />

      <div className="relative flex flex-col gap-5 px-5 pb-8 pt-14">
        <div>
          <h1
            className="font-display text-[2rem] leading-[1.05] tracking-[-0.02em]"
            style={{ color: theme.text.heading }}
          >
            Logged from your description
          </h1>
          <p className="mt-1.5 text-sm" style={{ color: theme.text.muted }}>
            "{parsedDescription.rawInput}"
          </p>
        </div>

        <div className={panelClass}>
          <div className={sheenClass} aria-hidden="true" />
          <p className="text-sm" style={{ color: theme.text.label }}>
            Total logged
          </p>
          <p className="mt-1 font-display text-6xl leading-none tracking-[-0.02em]" style={{ color: theme.text.heading }}>
            {t.calories}
            <span className="ml-2 font-sans text-xl font-normal" style={{ color: theme.text.suffixLight }}>
              kcal
            </span>
          </p>

          <div className="mt-4 grid grid-cols-3 gap-2.5">
            {(["protein", "carbs", "fat"] as const).map((key) => {
              const meta = MACRO_META[key];
              const chip = MACRO_CHIP[key];
              return (
                <div key={key} className="flex flex-col items-center gap-1.5 rounded-2xl bg-white/50 py-3 ring-1 ring-inset ring-white/70">
                  <span className={`flex h-7 w-7 items-center justify-center rounded-full ${chip.chip}`}>
                    <meta.icon className="h-3.5 w-3.5" strokeWidth={2.25} />
                  </span>
                  <span className="font-display text-lg tracking-[-0.01em]" style={{ color: theme.text.heading }}>
                    {t[key]}
                    <span className="ml-0.5 font-sans text-xs font-normal" style={{ color: theme.text.suffixLight }}>
                      g
                    </span>
                  </span>
                </div>
              );
            })}
          </div>

          {reviewCount > 0 && (
            <p className="mt-4 flex items-center gap-1.5 text-xs" style={{ color: theme.text.faint }}>
              <Sparkles className="h-3 w-3 text-amber-500" />
              {reviewCount} {reviewCount === 1 ? "item" : "items"} estimated — tap the sparkle to fix.
            </p>
          )}
        </div>

        <div className={`${panelClass} !p-0`}>
          <div className={sheenClass} aria-hidden="true" />
          <ul>
            {items.map((item, i) => (
              <CompactRow key={item.id} item={item} isLast={i === items.length - 1} onEdit={() => setEditing(item)} />
            ))}
          </ul>
        </div>
      </div>

      {editing && <CorrectionSheet item={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function CompactRow({
  item,
  isLast,
  onEdit,
}: {
  item: ParsedIngredient;
  isLast: boolean;
  onEdit: () => void;
}) {
  const flagged = [item.quantity, item.calories, item.protein, item.carbs, item.fat].some(
    (f) => f.confidence === "needs_review",
  );

  return (
    <li className={`flex items-center justify-between gap-3 px-5 py-3 ${!isLast ? "border-b border-white/70" : ""}`}>
      <div className="min-w-0">
        <span className="truncate text-sm font-medium" style={{ color: theme.text.foodName }}>
          {item.name}
        </span>
        <span className="ml-1.5 text-xs" style={{ color: theme.text.faint }}>
          {item.quantity.value}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-sm tabular-nums" style={{ color: theme.text.body }}>
          {item.calories.value} kcal
        </span>
        <button
          type="button"
          onClick={onEdit}
          aria-label={flagged ? `Review ${item.name}` : `Edit ${item.name}`}
          className={
            flagged
              ? "grid h-6 w-6 place-items-center rounded-full bg-amber-100/80 text-amber-600 ring-1 ring-inset ring-amber-200"
              : "grid h-6 w-6 place-items-center rounded-full text-transparent transition-colors hover:bg-white/60 hover:text-current"
          }
          style={!flagged ? { color: theme.text.faint } : undefined}
        >
          <Sparkles className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  );
}

const MACRO_META = {
  protein: { icon: Beef, label: "Protein" },
  carbs: { icon: Wheat, label: "Carbs" },
  fat: { icon: Droplet, label: "Fat" },
} as const;

function CorrectionSheet({ item, onClose }: { item: ParsedIngredient; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-indigo-950/30 backdrop-blur-[2px]" />
      <div
        className={`relative w-full max-w-[390px] rounded-t-[2rem] bg-white/90 p-5 pb-8 shadow-2xl ring-1 ring-inset ring-white/90 backdrop-blur-2xl`}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-indigo-950/15" />
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg" style={{ color: theme.text.heading }}>
            {item.name}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-7 w-7 place-items-center rounded-full hover:bg-black/5">
            <X className="h-4 w-4" style={{ color: theme.text.faint }} />
          </button>
        </div>
        <p className="mt-0.5 flex items-center gap-1 text-xs" style={{ color: theme.text.faint }}>
          <Sparkles className="h-3 w-3 text-amber-500" /> Estimated from your description — check and adjust below.
        </p>

        <label className="mt-4 flex items-center justify-between gap-3 text-sm" style={{ color: theme.text.mutedLabel }}>
          Quantity
          <input
            defaultValue={item.quantity.value}
            className="w-28 rounded-lg bg-white px-2.5 py-1.5 text-right ring-1 ring-inset ring-black/10"
            style={{ color: theme.text.body }}
          />
        </label>
        <label className="mt-2 flex items-center justify-between gap-3 text-sm" style={{ color: theme.text.mutedLabel }}>
          Calories
          <input
            defaultValue={item.calories.value}
            className="w-28 rounded-lg bg-white px-2.5 py-1.5 text-right tabular-nums ring-1 ring-inset ring-black/10"
            style={{ color: theme.text.body }}
          />
        </label>

        <div className="mt-3 grid grid-cols-3 gap-2">
          {(["protein", "carbs", "fat"] as const).map((key) => {
            const meta = MACRO_META[key];
            const field = item[key];
            return (
              <label key={key} className="rounded-xl bg-black/[0.03] px-2.5 py-2 text-center">
                <div className="flex items-center justify-center gap-1 text-[11px]" style={{ color: theme.text.mutedLabel }}>
                  <meta.icon className="h-3 w-3" /> {meta.label}
                </div>
                <input
                  defaultValue={field.value}
                  className="mt-0.5 w-full bg-transparent text-center text-sm font-semibold tabular-nums outline-none"
                  style={{ color: theme.text.body }}
                />
              </label>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onClose}
          className={`mt-5 flex w-full items-center justify-center gap-1.5 rounded-full bg-gradient-to-r ${theme.accentGradient} py-2.5 text-sm font-medium text-white`}
        >
          <Check className="h-4 w-4" /> Save correction
        </button>
      </div>
    </div>
  );
}
