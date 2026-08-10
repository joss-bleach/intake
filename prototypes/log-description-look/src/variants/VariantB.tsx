import { useState } from "react";
import { Beef, Droplet, Sparkles, Wheat } from "lucide-react";
import { Blobs, panelClass, reviewBadgeClass, sheenClass, theme, tileClass } from "../theme";
import { needsReviewCount, parsedDescription, totals, type ParsedIngredient } from "../data";

// Variant B — one frosted-glass card per ingredient (echoes the dashboard's
// macro bento tiles). Collapsed: name/qty/kcal + a review badge. Tapping a
// card expands its own macro breakdown with edit fields inline — the card
// itself grows, nothing floats above it. Primary affordance: the card.
export function VariantB() {
  const { items } = parsedDescription;
  const t = totals(items);
  const reviewCount = needsReviewCount(items);
  const [expanded, setExpanded] = useState<string | null>(items[1]?.id ?? null);

  return (
    <div className={`relative min-h-full ${theme.pageBg} px-5 pt-14 pb-28`}>
      <Blobs />

      <h1 className="font-display text-2xl" style={{ color: theme.text.heading }}>
        Your meal, parsed
      </h1>
      <p className="mt-1 text-sm" style={{ color: theme.text.muted }}>
        "{parsedDescription.rawInput}"
      </p>

      <div className={`mt-5 flex items-center justify-between ${panelClass}`}>
        <div className={sheenClass} aria-hidden="true" />
        <span className="text-3xl font-semibold tabular-nums" style={{ color: theme.text.emphasisStrong }}>
          {t.calories}
          <span className="ml-1 text-sm font-normal" style={{ color: theme.text.suffixLight }}>
            kcal total
          </span>
        </span>
        {reviewCount > 0 && (
          <span className={reviewBadgeClass}>
            <Sparkles className="h-3 w-3" /> {reviewCount} to check
          </span>
        )}
      </div>

      <div className="mt-4 space-y-3">
        {items.map((item) => (
          <IngredientCard
            key={item.id}
            item={item}
            isOpen={expanded === item.id}
            onToggle={() => setExpanded(expanded === item.id ? null : item.id)}
          />
        ))}
      </div>
    </div>
  );
}

const MACRO_META = {
  protein: { icon: Beef, label: "Protein", chip: "bg-rose-50 text-rose-600" },
  carbs: { icon: Wheat, label: "Carbs", chip: "bg-amber-50 text-amber-600" },
  fat: { icon: Droplet, label: "Fat", chip: "bg-violet-50 text-violet-600" },
} as const;

function IngredientCard({
  item,
  isOpen,
  onToggle,
}: {
  item: ParsedIngredient;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const flagged = [item.quantity, item.calories, item.protein, item.carbs, item.fat].some(
    (f) => f.confidence === "needs_review",
  );

  return (
    <div className={tileClass}>
      <div className={sheenClass} aria-hidden="true" />
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between gap-3 text-left">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-medium" style={{ color: theme.text.foodName }}>
              {item.name}
            </span>
            {flagged && <span className={reviewBadgeClass}>estimated</span>}
          </div>
          <span className="text-xs" style={{ color: theme.text.faint }}>
            {item.quantity.value}
          </span>
        </div>
        <span className="shrink-0 text-sm font-medium tabular-nums" style={{ color: theme.text.body }}>
          {item.calories.value} kcal
        </span>
      </button>

      {isOpen && (
        <div className="mt-4 space-y-3 border-t border-white/70 pt-4">
          <div className="grid grid-cols-3 gap-2">
            {(["protein", "carbs", "fat"] as const).map((key) => {
              const meta = MACRO_META[key];
              const field = item[key];
              return (
                <div key={key} className={`rounded-xl px-2.5 py-2 ${meta.chip}`}>
                  <div className="flex items-center gap-1 text-[11px] font-medium">
                    <meta.icon className="h-3 w-3" /> {meta.label}
                    {field.confidence === "needs_review" && <Sparkles className="h-2.5 w-2.5" />}
                  </div>
                  <input
                    defaultValue={field.value}
                    className="mt-0.5 w-full bg-transparent text-sm font-semibold tabular-nums outline-none"
                  />
                </div>
              );
            })}
          </div>
          <label className="flex items-center justify-between gap-2 text-sm" style={{ color: theme.text.mutedLabel }}>
            Quantity
            <input
              defaultValue={item.quantity.value}
              className="w-24 rounded-lg bg-white/80 px-2 py-1 text-right text-sm outline-none ring-1 ring-inset ring-white/90"
              style={{ color: theme.text.body }}
            />
          </label>
          <button
            type="button"
            onClick={onToggle}
            className={`w-full rounded-full bg-gradient-to-r ${theme.accentGradient} py-2 text-sm font-medium text-white`}
          >
            Looks right
          </button>
        </div>
      )}
    </div>
  );
}
