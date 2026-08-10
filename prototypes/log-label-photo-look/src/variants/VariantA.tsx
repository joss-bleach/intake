import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, Sparkles } from "lucide-react";
import { BottomNav, Blobs, panelClass, sheenClass, theme } from "../theme";
import { labelReading, needsReviewFields, type Confidence } from "../data";
import { ConfidenceMark, ConfirmHeader, LabelPhoto, ServingsStepper, TotalsPanel } from "./shared";

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

// Variant A — the photo is just the first thing in the page: a static
// snapshot pinned above the fold, then confirmation scrolls normally below
// it. No persistent link back to the photo once you've scrolled past it —
// the baseline, cheapest-to-build shape, direct continuation of the
// description screen's C2 pattern (#30).
export function VariantA() {
  const [servings, setServings] = useState(1);
  const [openField, setOpenField] = useState<string | null>(null);
  const reviewCount = needsReviewFields().length;

  return (
    <div className={`relative isolate min-h-full overflow-hidden ${theme.pageBg} pb-24`}>
      <Blobs />

      <div className="relative flex flex-col gap-5 px-5 pb-8 pt-14">
        <ConfirmHeader />

        <LabelPhoto className="mx-auto w-[85%]" />

        <ServingsStepper value={servings} onChange={setServings} />
        <TotalsPanel servings={servings} reviewCount={reviewCount} />

        <div className={`${panelClass} !p-0`}>
          <div className={sheenClass} aria-hidden="true" />
          <ul>
            {FIELD_ORDER.map((key, i) => (
              <FieldRow
                key={key}
                fieldKey={key}
                isLast={i === FIELD_ORDER.length - 1}
                isOpen={openField === key}
                onToggle={() => setOpenField(openField === key ? null : key)}
              />
            ))}
          </ul>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}

function FieldRow({
  fieldKey,
  isLast,
  isOpen,
  onToggle,
}: {
  fieldKey: keyof typeof labelReading.perServing;
  isLast: boolean;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const field = labelReading.perServing[fieldKey] as { value: number; confidence: Confidence };
  const nested = fieldKey === "satFat" || fieldKey === "sugars";

  return (
    <li className={!isLast && !isOpen ? "border-b border-white/70" : ""}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left"
      >
        <span
          className={`flex items-center gap-1.5 text-sm ${nested ? "pl-3" : ""}`}
          style={{ color: nested ? theme.text.faint : theme.text.foodName }}
        >
          {FIELD_LABELS[fieldKey]}
          {field.confidence === "needs_review" && (
            <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-label="Estimated" />
          )}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-sm tabular-nums" style={{ color: theme.text.body }}>
            {field.value}
            {fieldKey === "calories" ? " kcal" : "g"}
          </span>
          <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}>
            <ChevronDown className="h-4 w-4" style={{ color: theme.text.faint }} />
          </motion.div>
        </div>
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="editor"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ height: { duration: 0.3, ease: [0.16, 1, 0.3, 1] }, opacity: { duration: 0.2 } }}
            className="overflow-hidden"
          >
            <div className={`flex items-center justify-between gap-3 bg-white/40 px-5 pb-4 pt-1 ${!isLast ? "border-b border-white/70" : ""}`}>
              <span className="flex items-center gap-1 text-xs" style={{ color: theme.text.mutedLabel }}>
                <ConfidenceMark confidence={field.confidence} />
                Read from photo
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
