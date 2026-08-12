import { motion } from "motion/react";
import { theme } from "@/lib/theme";

// Pastel-gradient-blob backdrop — ported verbatim from c6-base.tsx
// (prototype/dashboard-look). Same blob geometry, animation, and white
// gradient wash on every screen; only the fill colours vary per theme, and
// C6-B1 is the one settled colourway.
export function Blobs() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <motion.div
        className={`absolute -left-24 -top-16 h-72 w-72 rounded-full ${theme.blobs[0]} blur-3xl`}
        animate={{ x: [0, 18, 0], y: [0, 14, 0], scale: [1, 1.08, 1] }}
        transition={{ duration: 26, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className={`absolute -right-28 top-40 h-80 w-80 rounded-full ${theme.blobs[1]} blur-3xl`}
        animate={{ x: [0, -16, 0], y: [0, 20, 0], scale: [1, 1.1, 1] }}
        transition={{ duration: 32, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className={`absolute bottom-0 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full ${theme.blobs[2]} blur-3xl`}
        animate={{ x: [0, 14, 0], y: [0, -12, 0], scale: [1, 1.06, 1] }}
        transition={{ duration: 30, repeat: Infinity, ease: "easeInOut" }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-white/10 via-transparent to-white/40" />
    </div>
  );
}
