import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { theme } from "@/lib/theme";

// Click-to-edit amount control (issue #47's acceptance criteria) — tap the
// number to type an exact amount, or use the +/- steppers. Ported from the
// mechanics of prototype/log-label-photo-look's AmountStepper (settled
// Variant A), simplified to one fixed step size per screen instance rather
// than a per-unit config object.
export function AmountStepper({
  label,
  value,
  step,
  min,
  format,
  onChange,
}: {
  label: string;
  value: number;
  step: number;
  min: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const round = (n: number) => Math.round(n * 100) / 100;

  const startEdit = () => {
    setDraft(String(value));
    setEditing(true);
  };

  const commit = () => {
    const parsed = Number(draft);
    if (Number.isFinite(parsed) && parsed > 0) {
      onChange(Math.max(min, round(parsed)));
    }
    setEditing(false);
  };

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-white/50 px-4 py-2.5 ring-1 ring-inset ring-white/70">
      <span className="text-sm" style={{ color: theme.text.label }}>
        {label}
      </span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Decrease amount"
          onClick={() => onChange(Math.max(min, round(value - step)))}
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
            className="w-16 rounded-lg bg-white text-center font-display text-lg tabular-nums ring-1 ring-inset ring-black/10 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            style={{ color: theme.text.heading }}
          />
        ) : (
          <button
            type="button"
            onClick={startEdit}
            aria-label="Edit amount"
            className="w-16 rounded-lg text-center font-display text-lg tabular-nums transition-colors hover:bg-white/60"
            style={{ color: theme.text.heading }}
          >
            {format(value)}
          </button>
        )}
        <button
          type="button"
          aria-label="Increase amount"
          onClick={() => onChange(round(value + step))}
          className="grid h-7 w-7 place-items-center rounded-full bg-white ring-1 ring-inset ring-black/10 active:scale-95"
        >
          <Plus className="h-3.5 w-3.5" style={{ color: theme.text.body }} />
        </button>
      </div>
    </div>
  );
}
