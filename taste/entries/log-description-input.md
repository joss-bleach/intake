---
image: images/log-description-input.jpeg
direction: cream-serif-log-flow
screens: [log-description]
added: 2026-08-10
---

## What it shows

Full-screen modal sheet (X close, top-left; "Guide" link, top-right) on a warm off-white background,
with an in-progress system Live Activity pill overlapping the status bar. The body is a single large
white card holding one open-ended textarea, placeholder text in light grey: `Describe your meal, e.g.
"grilled salmon with butter, potatoes and asparagus"` — quoted example doubling as the only instruction
on the screen, no labelled fields. Cursor sits at the top ready to type; the rest of the card is empty
white space, no visual pressure to fill it in a particular shape.

Below the card, left-aligned small-caps label "RECENT LOGS" over a horizontally-scrolling row of pill
chips (rounded-full, thin grey border, black text) reading past meal descriptions verbatim — "Coffee and
Toast", "Pitta, Halloumi and Dips", a clipped "Tu…" — offered as tap-to-reuse shortcuts rather than a
history list. Standard iOS keyboard docked at the bottom.

## Why it's here

The whole input surface is one freeform textarea with an example-as-instruction placeholder, not a
structured form — logging starts from a sentence, not fields. Recent Logs as reusable pill chips (not a
list) is a fast path back to a previous entry. Both are candidate patterns for Intake's log-by-description
entry point, upstream of the parse/correction view #30 covers.
