import { useState } from "react";
import { Check, ChevronDown, Sparkles } from "lucide-react";
import { BottomNav, Blobs, confidentDotClass, panelClass, sheenClass, theme } from "../theme";
import { parsedDescription, type ParsedIngredient } from "../data";
import { MACRO_META, ResultHeader, TotalsPanel } from "./shared";

// Variant C2 — same hero/totals treatment as C, but correction never leaves
// the glass panel: tapping a row expands it in place, right there in the
// list, instead of opening a bottom sheet. All the info stays inside "the
// blob" the user's already looking at.
export function VariantC2() {
  const { items } = parsedDescription;
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className={`relative isolate min-h-full overflow-hidden ${theme.pageBg} pb-24`}>
      <Blobs />

      <div className="relative flex flex-col gap-5 px-5 pb-8 pt-14">
        <ResultHeader />
        <TotalsPanel items={items} />

        <div className={`${panelClass} !p-0`}>
          <div className={sheenClass} aria-hidden="true" />
          <ul>
            {items.map((item, i) => (
              <ExpandableRow
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

      <BottomNav />
    </div>
  );
}

function ExpandableRow({
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
    <li className={!isLast && !isOpen ? "border-b border-white/70" : ""}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium" style={{ color: theme.text.foodName }}>
              {item.name}
            </span>
            {flagged && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100/80 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
                estimated
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
        <div className={`space-y-3 bg-white/40 px-5 py-4 ${!isLast ? "border-b border-white/70" : ""}`}>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm" style={{ color: theme.text.mutedLabel }}>
              Quantity
            </span>
            {/* text-base (16px) — smaller triggers iOS Safari's zoom-on-focus. */}
            <input
              defaultValue={item.quantity.value}
              className="w-28 rounded-lg bg-white px-2.5 py-1.5 text-right text-base ring-1 ring-inset ring-black/10"
              style={{ color: theme.text.body }}
            />
          </div>

          <div className="grid grid-cols-4 gap-2">
            <FieldBox label="Cal" field={item.calories} />
            {(["protein", "carbs", "fat"] as const).map((key) => {
              const meta = MACRO_META[key];
              return <FieldBox key={key} label={meta.label} field={item[key]} icon={meta.icon} />;
            })}
          </div>

          <button
            type="button"
            onClick={onToggle}
            className={`flex w-full items-center justify-center gap-1.5 rounded-full bg-gradient-to-r ${theme.accentGradient} py-2 text-sm font-medium text-white`}
          >
            <Check className="h-4 w-4" /> Save
          </button>
        </div>
      )}
    </li>
  );
}

function FieldBox({
  label,
  field,
  icon: Icon,
}: {
  label: string;
  field: { value: string | number; confidence: "confident" | "needs_review" };
  icon?: typeof Sparkles;
}) {
  return (
    <label className="rounded-xl bg-black/[0.03] px-2 py-2 text-center">
      <div className="flex items-center justify-center gap-1 text-[10px]" style={{ color: theme.text.mutedLabel }}>
        {Icon && <Icon className="h-3 w-3" />}
        {label}
        {field.confidence === "confident" ? (
          <Check className={`h-2.5 w-2.5 ${confidentDotClass}`} />
        ) : (
          <Sparkles className="h-2.5 w-2.5 text-amber-500" />
        )}
      </div>
      <input
        defaultValue={field.value}
        className="mt-0.5 w-full bg-transparent text-center text-base font-semibold tabular-nums outline-none"
        style={{ color: theme.text.body }}
      />
    </label>
  );
}
