import type { ReactNode } from "react";
import { ArrowLeft, Beef, Check, Droplet, Minus, Plus, Sparkles, Wheat } from "lucide-react";
import { MACRO_CHIP, confidentDotClass, panelClass, sheenClass, theme } from "../theme";
import { labelReading, scaledTotals, type Confidence } from "../data";

// Shared across all three variants — same back arrow + product-name header,
// same servings stepper + hero totals treatment (ported from the
// description screen's ResultHeader/TotalsPanel, #30). Only how the photo
// sits alongside all this differs between variants.

export const MACRO_META = {
  protein: { icon: Beef, label: "Protein" },
  carbs: { icon: Wheat, label: "Carbs" },
  fat: { icon: Droplet, label: "Fat" },
} as const;

export function ConfirmHeader() {
  return (
    <div>
      <button
        type="button"
        aria-label="Back to camera"
        className="mb-3 grid h-9 w-9 place-items-center rounded-full bg-white/50 ring-1 ring-inset ring-white/70 backdrop-blur-xl transition-transform active:scale-95"
      >
        <ArrowLeft className="h-4 w-4" style={{ color: theme.text.body }} strokeWidth={2.25} />
      </button>
      <p className="font-display text-2xl leading-[1.2] tracking-[-0.01em]" style={{ color: theme.text.heading }}>
        {labelReading.productName.value}
      </p>
      <p className="mt-0.5 text-sm" style={{ color: theme.text.faint }}>
        Label says {labelReading.servingLabel.value} per serving
      </p>
    </div>
  );
}

// A photographed nutrition-facts panel, mocked with CSS rather than a real
// image — a slight rotation, drop shadow and paper-grain wash sell "photo",
// while the printed rows stay real text so Variant C can pin exact
// positions over them. Passing `overlay` renders tap-pins on top.
export function LabelPhoto({ overlay, className = "" }: { overlay?: ReactNode; className?: string }) {
  const p = labelReading.per100g;
  const rows: { label: string; value: string }[] = [
    { label: "Energy", value: `${Math.round(p.calories * 4.184)}kJ / ${p.calories}kcal` },
    { label: "Fat", value: `${p.fat}g` },
    { label: "of which saturates", value: `${p.satFat}g` },
    { label: "Carbohydrate", value: `${p.carbs}g` },
    { label: "of which sugars", value: `${p.sugars}g` },
    { label: "Fibre", value: `${p.fiber}g` },
    { label: "Protein", value: `${p.protein}g` },
    { label: "Salt", value: `${p.salt}g` },
  ];

  return (
    <div className={`relative ${className}`}>
      <div className="relative rotate-[-1.2deg] rounded-xl bg-[#f4f0e6] p-4 shadow-[0_18px_40px_-12px_rgba(30,27,75,0.45)] ring-1 ring-black/10">
        <p className="border-b-2 border-black/80 pb-1 text-[13px] font-bold tracking-tight text-black">
          Nutrition Information
        </p>
        <div className="mt-1.5 flex justify-between text-[10px] font-semibold text-black/70">
          <span>Typical values</span>
          <span>Per 100g</span>
        </div>
        <div className="mt-1 divide-y divide-black/10 font-mono">
          {rows.map((r) => (
            <div key={r.label} className="flex justify-between py-1 text-[11px] text-black/85">
              <span className={r.label.startsWith("of which") ? "pl-3 text-black/60" : ""}>{r.label}</span>
              <span className="tabular-nums">{r.value}</span>
            </div>
          ))}
        </div>
        {/* Vignette + glare — sells "photographed", not "rendered". */}
        <div className="pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-br from-white/40 via-transparent to-black/10" />
        <div className="pointer-events-none absolute -top-4 right-6 h-16 w-24 rotate-12 bg-white/30 blur-xl" />
      </div>
      {overlay}
    </div>
  );
}

export function ServingsStepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-white/50 px-4 py-2.5 ring-1 ring-inset ring-white/70">
      <span className="text-sm" style={{ color: theme.text.label }}>
        Servings eaten
      </span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Fewer servings"
          onClick={() => onChange(Math.max(0.5, Math.round((value - 0.5) * 10) / 10))}
          className="grid h-7 w-7 place-items-center rounded-full bg-white ring-1 ring-inset ring-black/10 active:scale-95"
        >
          <Minus className="h-3.5 w-3.5" style={{ color: theme.text.body }} />
        </button>
        <span
          className="w-10 text-center font-display text-lg tabular-nums"
          style={{ color: theme.text.heading }}
        >
          {value}
        </span>
        <button
          type="button"
          aria-label="More servings"
          onClick={() => onChange(Math.round((value + 0.5) * 10) / 10)}
          className="grid h-7 w-7 place-items-center rounded-full bg-white ring-1 ring-inset ring-black/10 active:scale-95"
        >
          <Plus className="h-3.5 w-3.5" style={{ color: theme.text.body }} />
        </button>
      </div>
    </div>
  );
}

export function TotalsPanel({ servings, reviewCount }: { servings: number; reviewCount: number }) {
  const t = scaledTotals(servings);

  return (
    <div className={panelClass}>
      <div className={sheenClass} aria-hidden="true" />
      <p className="text-sm" style={{ color: theme.text.label }}>
        Logging {servings} {servings === 1 ? "serving" : "servings"}
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
          {reviewCount} {reviewCount === 1 ? "field was" : "fields were"} hard to read on the photo — check
          {reviewCount === 1 ? " it" : " them"} below.
        </p>
      )}
    </div>
  );
}

export function ConfidenceMark({ confidence }: { confidence: Confidence }) {
  return confidence === "confident" ? (
    <Check className={`h-2.5 w-2.5 ${confidentDotClass}`} />
  ) : (
    <Sparkles className="h-2.5 w-2.5 text-amber-500" />
  );
}
