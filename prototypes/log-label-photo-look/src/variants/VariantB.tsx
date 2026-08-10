import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Sparkles, X, ZoomIn } from "lucide-react";
import { BottomNav, Blobs, panelClass, sheenClass, theme } from "../theme";
import { labelReading, needsReviewFields, scaledTotals, type Confidence } from "../data";
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

// Variant B — the photo never fully leaves. A small thumbnail rides in the
// corner of the header, always tappable, so the source is one tap away no
// matter how far you've scrolled into corrections — useful for the exact
// moment you're second-guessing a misread digit and want to re-check the
// photo without losing your place in the field you're editing.
export function VariantB() {
  const [servings, setServings] = useState(1);
  const [openField, setOpenField] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const reviewCount = needsReviewFields().length;

  return (
    <div className={`relative isolate min-h-full overflow-hidden ${theme.pageBg} pb-24`}>
      <Blobs />

      <div className="relative flex flex-col gap-5 px-5 pb-8 pt-14">
        <div className="flex items-start justify-between gap-4">
          <ConfirmHeader />
          <button
            type="button"
            onClick={() => setLightboxOpen(true)}
            aria-label="View photo"
            className="relative mt-1 shrink-0"
          >
            <LabelPhoto className="w-16 origin-top-right scale-100" />
            <span className="absolute -bottom-1.5 -right-1.5 grid h-5 w-5 place-items-center rounded-full bg-white text-black/70 ring-1 ring-black/10">
              <ZoomIn className="h-2.5 w-2.5" />
            </span>
          </button>
        </div>

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

      <AnimatePresence>
        {lightboxOpen && (
          <motion.div
            className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-8 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setLightboxOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
            >
              <LabelPhoto className="w-72" />
            </motion.div>
            <button
              type="button"
              aria-label="Close photo"
              onClick={() => setLightboxOpen(false)}
              className="absolute right-6 top-[max(1.5rem,env(safe-area-inset-top))] grid h-9 w-9 place-items-center rounded-full bg-white/15 text-white ring-1 ring-white/30"
            >
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
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
        <span className="text-sm tabular-nums" style={{ color: theme.text.body }}>
          {field.value}
          {fieldKey === "calories" ? " kcal" : "g"}
        </span>
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
