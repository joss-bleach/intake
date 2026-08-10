import { useState } from "react";
import { Check, ChevronDown, Pencil, Sparkles } from "lucide-react";
import {
  Blobs,
  confidentDotClass,
  panelClass,
  reviewBadgeClass,
  sheenClass,
  theme,
} from "../theme";
import {
  needsReviewCount,
  parsedDescription,
  totals,
  type ParsedIngredient,
} from "../data";

// Variant A — inline edit-in-place. Every row is tappable; tapping opens a
// compact edit form directly inside that row (no navigation, no overlay).
// Primary affordance: the row itself IS the editor once expanded.
export function VariantA() {
  const { items } = parsedDescription;
  const t = totals(items);
  const reviewCount = needsReviewCount(items);
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className={`relative min-h-full ${theme.pageBg} px-5 pt-14 pb-28`}>
      <Blobs />

      <h1 className="font-display text-2xl" style={{ color: theme.text.heading }}>
        Here's what we heard
      </h1>
      <p className="mt-1 text-sm" style={{ color: theme.text.muted }}>
        "{parsedDescription.rawInput}"
      </p>

      <div className={`mt-5 ${panelClass}`}>
        <div className={sheenClass} aria-hidden="true" />
        <div className="flex items-baseline justify-between">
          <span className="text-4xl font-semibold tabular-nums" style={{ color: theme.text.emphasisStrong }}>
            {t.calories}
            <span className="ml-1 text-base font-normal" style={{ color: theme.text.suffixLight }}>
              kcal
            </span>
          </span>
          {reviewCount > 0 && (
            <span className={reviewBadgeClass}>
              <Sparkles className="h-3 w-3" /> {reviewCount} estimated
            </span>
          )}
        </div>
        <p className="mt-1 text-xs" style={{ color: theme.text.faint }}>
          Estimated fields are flagged below — tap any row to check or fix it.
        </p>
      </div>

      <div className={`mt-4 ${panelClass} !p-0`}>
        <div className={sheenClass} aria-hidden="true" />
        <ul>
          {items.map((item, i) => (
            <IngredientRow
              key={item.id}
              item={item}
              isLast={i === items.length - 1}
              isOpen={openId === item.id}
              onToggle={() => setOpenId(openId === item.id ? null : item.id)}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}

function IngredientRow({
  item,
  isLast,
  isOpen,
  onToggle,
}: {
  item: ParsedIngredient;
  isLast: boolean;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const flagged = [item.quantity, item.calories, item.protein, item.carbs, item.fat].some(
    (f) => f.confidence === "needs_review",
  );

  return (
    <li className={!isLast ? "border-b border-white/70" : ""}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-medium" style={{ color: theme.text.foodName }}>
              {item.name}
            </span>
            {flagged && (
              <span className={reviewBadgeClass}>
                <Sparkles className="h-2.5 w-2.5" /> estimated
              </span>
            )}
          </div>
          <span className="text-xs" style={{ color: theme.text.faint }}>
            {item.quantity.value}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-sm tabular-nums" style={{ color: theme.text.body }}>
            {item.calories.value} kcal
          </span>
          <ChevronDown
            className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
            style={{ color: theme.text.faint }}
          />
        </div>
      </button>

      {isOpen && (
        <div className="space-y-2.5 border-t border-white/70 bg-white/40 px-5 py-4">
          <FieldEditor label="Quantity" field={item.quantity} suffix="" />
          <FieldEditor label="Calories" field={item.calories} suffix="kcal" />
          <FieldEditor label="Protein" field={item.protein} suffix="g" />
          <FieldEditor label="Carbs" field={item.carbs} suffix="g" />
          <FieldEditor label="Fat" field={item.fat} suffix="g" />
          <button
            type="button"
            onClick={onToggle}
            className={`mt-1 flex w-full items-center justify-center gap-1.5 rounded-full bg-gradient-to-r ${theme.accentGradient} py-2 text-sm font-medium text-white`}
          >
            <Check className="h-4 w-4" /> Save
          </button>
        </div>
      )}
    </li>
  );
}

function FieldEditor({
  label,
  field,
  suffix,
}: {
  label: string;
  field: { value: string | number; confidence: "confident" | "needs_review" };
  suffix: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-1.5 text-sm" style={{ color: theme.text.mutedLabel }}>
        {label}
        {field.confidence === "confident" ? (
          <Check className={`h-3.5 w-3.5 ${confidentDotClass}`} />
        ) : (
          <Sparkles className="h-3.5 w-3.5 text-amber-500" />
        )}
      </span>
      <label className="flex items-center gap-1 rounded-lg bg-white/80 px-2.5 py-1 ring-1 ring-inset ring-white/90">
        <input
          defaultValue={field.value}
          className="w-16 bg-transparent text-right text-sm tabular-nums outline-none"
          style={{ color: theme.text.body }}
        />
        <Pencil className="h-3 w-3 shrink-0" style={{ color: theme.text.faint }} />
        {suffix && (
          <span className="text-xs" style={{ color: theme.text.faint }}>
            {suffix}
          </span>
        )}
      </label>
    </div>
  );
}
