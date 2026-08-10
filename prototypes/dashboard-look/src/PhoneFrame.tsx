import type { ReactNode } from "react";

// PROTOTYPE — mobile-only product (map issue #1, ticket #29). Every variant renders inside
// this fixed-width frame so it's judged at phone width, not stretched to the browser viewport.
export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh items-center justify-center p-4 sm:p-10">
      <div className="relative h-[844px] w-[390px] max-h-[92svh] overflow-hidden rounded-[2.75rem] border-[6px] border-neutral-900 bg-black shadow-2xl">
        <div className="h-full w-full overflow-y-auto rounded-[2.25rem] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {children}
        </div>
      </div>
    </div>
  );
}
