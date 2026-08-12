import * as React from "react";
import { cn } from "@/lib/utils";

// Bare input primitive, styled to sit inside a GlassPanel — a lighter
// translucent fill than the panel itself, distinct from Button's solid
// variants since a text field's chrome needs to read as "field", not
// "action".
function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-11 w-full rounded-xl border border-white/70 bg-white/50 px-3.5 text-base text-[var(--shell-text-body)] outline-none ring-0 transition-colors placeholder:text-[var(--shell-text-faint)] focus-visible:border-purple-400 focus-visible:bg-white/80 disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
