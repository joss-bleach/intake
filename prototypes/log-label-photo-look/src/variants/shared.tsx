import { useState, type ReactNode } from "react";
import { ArrowLeft, Beef, Check, Droplet, Minus, Plus, Sparkles, Wheat } from "lucide-react";
import { MACRO_CHIP, confidentDotClass, panelClass, sheenClass, theme } from "../theme";
import { SERVING_GRAMS, labelReading, type Confidence, type scaledTotals } from "../data";

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
    </div>
  );
}

// A compact row of "shield" tiles echoing a UK front-of-pack nutrition
// label's Energy/Fat/Saturates/Sugars/Salt strip — rendered in our own
// bento/glass language rather than faking a photo of the real thing.
// Overlapping rounded-top tiles read as one connected strip, same as the
// printed original. Values are the as-read per-serving readings (same
// source as the correction list below), independent of Variant A's unit
// toggle further down the page.
const LABEL_BENTO_FIELDS: { key: keyof typeof labelReading.perServing; label: string; suffix: string }[] = [
  { key: "calories", label: "Energy", suffix: "kcal" },
  { key: "fat", label: "Fat", suffix: "g" },
  { key: "satFat", label: "Saturates", suffix: "g" },
  { key: "sugars", label: "Sugars", suffix: "g" },
  { key: "salt", label: "Salt", suffix: "g" },
];

export function LabelBento({ className = "" }: { className?: string }) {
  return (
    <div className={`flex ${className}`}>
      {LABEL_BENTO_FIELDS.map((f, i) => {
        const field = labelReading.perServing[f.key] as { value: number; confidence: Confidence };
        return (
          <div
            key={f.key}
            style={{ zIndex: LABEL_BENTO_FIELDS.length - i }}
            className={`relative flex-1 rounded-t-[1.4rem] rounded-b-lg bg-white/55 px-1.5 pb-2.5 pt-3 text-center ring-1 ring-inset ring-white/70 backdrop-blur-xl ${
              i > 0 ? "-ml-2" : ""
            }`}
          >
            <p className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: theme.text.faint }}>
              {f.label}
            </p>
            <p className="mt-1 font-display text-base leading-tight tracking-[-0.01em]" style={{ color: theme.text.heading }}>
              {field.value}
              <span className="ml-0.5 font-sans text-[10px] font-normal" style={{ color: theme.text.suffixLight }}>
                {f.suffix}
              </span>
            </p>
            {field.confidence === "needs_review" && (
              <Sparkles className="mx-auto mt-1 h-2.5 w-2.5 text-amber-500" aria-label="Estimated" />
            )}
          </div>
        );
      })}
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

// Variant A's amount control switches what it's measuring in — the
// serving as printed, a flat 100g reference, or a free gram amount — each
// with its own step size, floor and display format, but sharing one
// stepper shell (AmountStepper) and one totals source (data.ts'
// totalsForGrams), so the numbers below never drift out of sync with
// whichever unit is selected.
export type Unit = "serving" | "100g" | "grams";

export interface UnitConfig {
  label: string;
  step: number;
  min: number;
  default: number;
  toGrams: (value: number) => number;
  format: (value: number) => string;
  // Click-to-edit support: editValue turns the internal value into the
  // plain number the typed input shows (e.g. "250" while in 100g mode,
  // not "2.5"); parse turns whatever the user typed back into that
  // internal value.
  editValue: (value: number) => number;
  parse: (input: number) => number;
}

export const UNIT_CONFIG: Record<Unit, UnitConfig> = {
  serving: {
    label: `Serving (${SERVING_GRAMS}g)`,
    step: 0.5,
    min: 0.5,
    default: 1,
    toGrams: (v) => v * SERVING_GRAMS,
    format: (v) => String(v),
    editValue: (v) => v,
    parse: (n) => n,
  },
  "100g": {
    label: "Amount",
    step: 0.5,
    min: 0.5,
    default: 1,
    toGrams: (v) => v * 100,
    format: (v) => `${Math.round(v * 100)}g`,
    editValue: (v) => Math.round(v * 100),
    parse: (n) => n / 100,
  },
  grams: {
    label: "Amount",
    step: 10,
    min: 10,
    default: SERVING_GRAMS,
    toGrams: (v) => v,
    format: (v) => `${v}g`,
    editValue: (v) => v,
    parse: (n) => n,
  },
};

export function UnitToggle({ value, onChange }: { value: Unit; onChange: (unit: Unit) => void }) {
  const options: { key: Unit; label: string }[] = [
    { key: "serving", label: "Serving" },
    { key: "100g", label: "100g" },
    { key: "grams", label: "Grams" },
  ];
  return (
    <div className="flex gap-1 rounded-full bg-white/50 p-1 ring-1 ring-inset ring-white/70">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={`flex-1 rounded-full py-1.5 text-xs font-medium transition-colors ${
            value === o.key ? "bg-white shadow-sm" : ""
          }`}
          style={{ color: value === o.key ? theme.text.heading : theme.text.faint }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function AmountStepper({
  config,
  value,
  onChange,
}: {
  config: UnitConfig;
  value: number;
  onChange: (n: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const startEdit = () => {
    setDraft(String(config.editValue(value)));
    setEditing(true);
  };

  const commit = () => {
    const n = Number(draft);
    if (Number.isFinite(n) && n > 0) {
      onChange(Math.max(config.min, Math.round(config.parse(n) * 10) / 10));
    }
    setEditing(false);
  };

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-white/50 px-4 py-2.5 ring-1 ring-inset ring-white/70">
      <span className="text-sm" style={{ color: theme.text.label }}>
        {config.label}
      </span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Decrease amount"
          onClick={() => onChange(Math.max(config.min, Math.round((value - config.step) * 10) / 10))}
          className="grid h-7 w-7 place-items-center rounded-full bg-white ring-1 ring-inset ring-black/10 active:scale-95"
        >
          <Minus className="h-3.5 w-3.5" style={{ color: theme.text.body }} />
        </button>
        {editing ? (
          <input
            type="number"
            inputMode="decimal"
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") setEditing(false);
            }}
            className="w-14 rounded-lg bg-white text-center font-display text-lg tabular-nums ring-1 ring-inset ring-black/10 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            style={{ color: theme.text.heading }}
          />
        ) : (
          <button
            type="button"
            onClick={startEdit}
            aria-label="Edit amount"
            className="w-14 rounded-lg text-center font-display text-lg tabular-nums transition-colors hover:bg-white/60"
            style={{ color: theme.text.heading }}
          >
            {config.format(value)}
          </button>
        )}
        <button
          type="button"
          aria-label="Increase amount"
          onClick={() => onChange(Math.round((value + config.step) * 10) / 10)}
          className="grid h-7 w-7 place-items-center rounded-full bg-white ring-1 ring-inset ring-black/10 active:scale-95"
        >
          <Plus className="h-3.5 w-3.5" style={{ color: theme.text.body }} />
        </button>
      </div>
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

export function TotalsPanel({
  totals: t,
  amountLabel,
  reviewCount,
}: {
  totals: ReturnType<typeof scaledTotals>;
  amountLabel: string;
  reviewCount: number;
}) {
  return (
    <div className={panelClass}>
      <div className={sheenClass} aria-hidden="true" />
      <p className="text-sm" style={{ color: theme.text.label }}>
        {amountLabel}
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
