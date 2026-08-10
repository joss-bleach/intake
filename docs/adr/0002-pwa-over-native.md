# PWA over native

**Status:** accepted

**Context:** The brief lists the product as installable, app-like on mobile, with camera access — and rules native apps out as a non-goal ("Native apps. The PWA is the product."). This ADR records the reasoning behind that call rather than reopening it, since the offline-caching design (ADR 0003) and the app-shell service worker both depend on the PWA path being settled.

**Decision:** Ship as an installable PWA, not a native app, for the MVP and for the foreseeable roadmap.

- **Single codebase.** One React app covers web and "installed" mobile use, rather than maintaining a native client alongside it.
- **Camera access is sufficient via the web platform.** Label-photo logging only needs `getUserMedia`/`<input capture>`, both of which work in an installed PWA on the target platforms (iOS Safari, Android Chrome) — there's no camera capability native would unlock that this product needs.
- **No app-store distribution friction.** No review process, no store approval latency, no platform cut — install is a browser-native "Add to Home Screen" flow driven by the web app manifest.
- **Matches the product's actual install surface.** "Home screen" installability (the brief's stated bar) is exactly what a PWA manifest provides; nothing about the MVP's feature set needs deeper OS integration.

**Traded-off capabilities:** Native would more easily support push notifications (e.g. meal-logging reminders) and background sync. Neither is needed for MVP — there's no reminders feature in the brief, and offline writes are explicitly a non-goal (see ADR 0003) — so neither capability is being given up against an actual requirement.

## Considered options

- **Native app (iOS/Android)** — rejected: the brief rules it out directly, and none of the traded-off capabilities (push, background sync, deeper camera APIs) are needed by the MVP feature set. Would also mean maintaining two clients instead of one for no offsetting benefit at this stage.
- **PWA** — accepted, per above.

## Consequences

- Push notifications and background sync are unavailable; if a future reminders or offline-write feature needs them, that's a new decision, not a default.
- Distribution stays entirely web-based — no App Store/Play Store presence, no store review to plan around.
- The install/offline story rests on standard web APIs (Web App Manifest, Service Worker), which is what ADR 0003 builds on directly.
