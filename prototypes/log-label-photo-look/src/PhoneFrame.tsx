import type { ReactNode } from "react";

// PROTOTYPE — mobile-only product (map issue #1, ticket #31). On an actual phone viewport
// (real device, no room to shrink further) this renders edge-to-edge so it feels like the
// live app, not a mockup. On anything wider (a desktop browser previewing it) it shows a
// decorative phone bezel instead, since there's no other way to judge phone-width content
// on a wide screen.
export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh items-center justify-center max-[500px]:block max-[500px]:min-h-0">
      <div
        className="relative h-svh w-full overflow-hidden bg-black
          min-[501px]:h-[844px] min-[501px]:w-[390px] min-[501px]:max-h-[92svh]
          min-[501px]:rounded-[2.75rem] min-[501px]:border-[6px] min-[501px]:border-neutral-900 min-[501px]:shadow-2xl"
      >
        <div className="h-full w-full overflow-y-auto [scrollbar-width:none] min-[501px]:rounded-[2.25rem] [&::-webkit-scrollbar]:hidden">
          {children}
        </div>
      </div>
    </div>
  );
}
