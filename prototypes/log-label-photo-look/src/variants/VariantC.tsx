import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Sparkles } from "lucide-react";
import { BottomNav, panelClass, sheenClass, theme } from "../theme";
import { LABEL_ROW_POSITIONS, labelReading, needsReviewFields, scaledTotals, type Confidence } from "../data";
import { ConfidenceMark, ConfirmActions, ConfirmHeader, LabelPhoto, ServingsStepper, TotalsPanel } from "./shared";

const FIELD_LABELS: Record<string, string> = {
  calories: "Calories",
  protein: "Protein",
  carbs: "Carbs",
  sugars: "of which sugars",
  fat: "Fat",
  satFat: "of which saturates",
  fiber: "Fibre",
  salt: "Salt",
};
const FIELD_ORDER = ["calories", "fat", "satFat", "carbs", "sugars", "fiber", "protein", "salt"] as const;

// Variant C — the photo carries the correction UI: every extracted value
// gets a numbered pin sitting directly over the digits it was read from.
// Tapping a pin (or its matching list row) highlights both ends of the
// pair and opens the editor — makes the photo-to-value correspondence
// literal instead of implied, at the cost of a busier photo.
export function VariantC() {
  const [servings, setServings] = useState(1);
  const [activeField, setActiveField] = useState<string | null>(null);
  const reviewCount = needsReviewFields().length;

  const activate = (key: string) => {
    setActiveField(key);
    document.getElementById(`field-${key}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <div className={`relative isolate min-h-full overflow-hidden ${theme.pageBg} pb-24`}>
      <div className="relative flex flex-col gap-5 px-5 pb-8 pt-14">
        <ConfirmHeader />

        <LabelPhoto
          className="mx-auto w-[85%]"
          overlay={
            <>
              {FIELD_ORDER.map((key, i) => {
                const pos = LABEL_ROW_POSITIONS[key];
                const field = labelReading.perServing[key] as { confidence: Confidence };
                const isActive = activeField === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => activate(key)}
                    aria-label={`Check ${FIELD_LABELS[key]}`}
                    style={{ top: pos.top, left: pos.left }}
                    className={`absolute grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-[10px] font-bold ring-2 ring-white transition-transform active:scale-90 ${
                      isActive
                        ? "scale-125 bg-purple-600 text-white"
                        : field.confidence === "needs_review"
                          ? "bg-amber-400 text-amber-950"
                          : "bg-white/90 text-black/60"
                    }`}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </>
          }
        />

        <ServingsStepper value={servings} onChange={setServings} />
        <TotalsPanel
          totals={scaledTotals(servings)}
          amountLabel={`Logging ${servings} ${servings === 1 ? "serving" : "servings"}`}
          reviewCount={reviewCount}
        />

        <div className={`${panelClass} !p-0`}>
          <div className={sheenClass} aria-hidden="true" />
          <ul>
            {FIELD_ORDER.map((key, i) => (
              <FieldRow
                key={key}
                index={i}
                fieldKey={key}
                isLast={i === FIELD_ORDER.length - 1}
                isActive={activeField === key}
                onActivate={() => activate(key)}
              />
            ))}
          </ul>
        </div>

        <ConfirmActions />
      </div>

      <BottomNav />
    </div>
  );
}

function FieldRow({
  fieldKey,
  index,
  isLast,
  isActive,
  onActivate,
}: {
  fieldKey: keyof typeof labelReading.perServing;
  index: number;
  isLast: boolean;
  isActive: boolean;
  onActivate: () => void;
}) {
  const field = labelReading.perServing[fieldKey] as { value: number; confidence: Confidence };
  const nested = fieldKey === "satFat" || fieldKey === "sugars";

  return (
    <li id={`field-${fieldKey}`} className={!isLast && !isActive ? "border-b border-white/70" : ""}>
      <button
        type="button"
        onClick={onActivate}
        className={`flex w-full items-center justify-between gap-3 px-5 py-3 text-left transition-colors ${isActive ? "bg-purple-50/60" : ""}`}
      >
        <span className="flex items-center gap-2">
          <span
            className={`grid h-4 w-4 shrink-0 place-items-center rounded-full text-[9px] font-bold ${
              isActive ? "bg-purple-600 text-white" : "bg-black/[0.06] text-black/40"
            }`}
          >
            {index + 1}
          </span>
          <span
            className={`text-sm ${nested ? "pl-3" : ""}`}
            style={{ color: nested ? theme.text.faint : theme.text.foodName }}
          >
            {FIELD_LABELS[fieldKey]}
          </span>
          {field.confidence === "needs_review" && (
            <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-label="Estimated" />
          )}
        </span>
        <span className="text-sm tabular-nums" style={{ color: theme.text.body }}>
          {field.value}
          {fieldKey === "calories" ? " kcal" : "g"}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {isActive && (
          <motion.div
            key="editor"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ height: { duration: 0.3, ease: [0.16, 1, 0.3, 1] }, opacity: { duration: 0.2 } }}
            className="overflow-hidden"
          >
            <div className={`flex items-center justify-between gap-3 bg-purple-50/40 px-5 pb-4 pt-1 ${!isLast ? "border-b border-white/70" : ""}`}>
              <span className="flex items-center gap-1 text-xs" style={{ color: theme.text.mutedLabel }}>
                <ConfidenceMark confidence={field.confidence} />
                Pin {index + 1} on the photo above
              </span>
              <input
                defaultValue={field.value}
                className="w-24 rounded-lg bg-white px-2.5 py-1.5 text-right text-base tabular-nums ring-1 ring-inset ring-black/10"
                style={{ color: theme.text.body }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}
