import { ArrowLeft, Beef, Droplet, Sparkles, Wheat } from "lucide-react";
import { MACRO_CHIP, panelClass, sheenClass, theme } from "../theme";
import { parsedDescription, totals, type ParsedIngredient, needsReviewCount } from "../data";

// Shared between VariantC and VariantC2 — same C6-B1 hero treatment (kcal
// display type, macro bento chips), same back arrow + description-as-header.
// Only the ingredient list below it differs between the two.

export const MACRO_META = {
  protein: { icon: Beef, label: "Protein" },
  carbs: { icon: Wheat, label: "Carbs" },
  fat: { icon: Droplet, label: "Fat" },
} as const;

export function ResultHeader() {
  return (
    <div>
      <button
        type="button"
        aria-label="Back to description"
        className="mb-3 grid h-9 w-9 place-items-center rounded-full bg-white/50 ring-1 ring-inset ring-white/70 backdrop-blur-xl transition-transform active:scale-95"
      >
        <ArrowLeft className="h-4 w-4" style={{ color: theme.text.body }} strokeWidth={2.25} />
      </button>
      <p className="font-display text-2xl leading-[1.2] tracking-[-0.01em]" style={{ color: theme.text.heading }}>
        "{parsedDescription.rawInput}"
      </p>
    </div>
  );
}

export function TotalsPanel({ items }: { items: ParsedIngredient[] }) {
  const t = totals(items);
  const reviewCount = needsReviewCount(items);

  return (
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
          {reviewCount} {reviewCount === 1 ? "item" : "items"} estimated.
        </p>
      )}
    </div>
  );
}
