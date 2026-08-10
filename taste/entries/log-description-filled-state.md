---
image: images/log-description-filled-state.png
direction: null
screens: [log-description]
added: 2026-08-10
---

## What it shows

Same free-text meal-description modal as the empty-placeholder version (warm off-white background,
Live Activity pill over the status bar, X close top-left, "Guide" link top-right, single large white
textarea card) but now filled with real user text in black: `I had the Costco chicken tenders (5 of
them), a packet of cheese and onion walkers baked, and a packet of mr beast beef jerky` — a long,
casual, brand-name-heavy run-on sentence, exactly the kind of messy real input the design has to parse.
Once text is present, a pill-shaped "Log entry" button in dark green with white bold text appears
centred above the keyboard, roughly mid-screen — it wasn't there on the empty state, so its appearance
is conditional on having typed something. The "Recent logs" chip row from the empty state is gone,
replaced by the CTA. Standard iOS keyboard with predictive-text bar ("jerky" / jerky's) docked at the
bottom.

## Why it's here

Documents the state transition the empty-textarea entry (see log-description-input) doesn't show: a
primary CTA button appears once there's typed content, floating above the keyboard rather than pinned to
the very bottom or the nav bar. Also useful as a sample of realistic messy input Intake's parser should
be able to handle (brand names, quantities in parentheses, casual phrasing, multiple items in one
sentence).
