import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// The frosted-glass card primitive — C6-B1's "glass" texture (higher-opacity
// fill + stronger blur/ring than the dashboard's base glass). Identical
// panelClass/tileClass/sheenClass markup was duplicated verbatim across
// prototype/log-description-look and prototype/log-label-photo-look
// (both read it from their own theme.tsx); this extracts it into the one
// shared component every screen renders instead of redefining the recipe.
const glassPanelVariants = cva(
  "relative overflow-hidden bg-white/60 ring-1 ring-inset ring-white/85 backdrop-blur-2xl",
  {
    variants: {
      variant: {
        panel: "rounded-[2rem] p-5",
        tile: "rounded-[1.5rem] p-4",
      },
    },
    defaultVariants: {
      variant: "panel",
    },
  },
);

export interface GlassPanelProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof glassPanelVariants> {}

function GlassPanel({ className, variant, children, ...props }: GlassPanelProps) {
  return (
    <div className={cn(glassPanelVariants({ variant, className }))} {...props}>
      <div
        className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br from-white/60 via-white/10 to-transparent"
        aria-hidden="true"
      />
      {children}
    </div>
  );
}

export { GlassPanel, glassPanelVariants };
