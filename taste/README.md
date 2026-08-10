# Taste library

A running collection of design inspiration for Intake — screenshots and links, each described in enough
detail for `/prototype` to build from, and grouped into design directions as patterns emerge.

This is a living reference, not a decision to resolve. It has no "done."

## Adding an entry

There's no CLI. Paste a link or an image to whoever's driving the session (a human or an agent) and ask
for it to be added; they'll create the file by hand.

1. Save any screenshot to `taste/entries/images/<slug>.<ext>`.
2. Create `taste/entries/<slug>.md` with frontmatter:

   ```yaml
   ---
   link: https://example.com/some-design      # omit if screenshot-only
   image: images/<slug>.png                    # omit if link-only; relative to taste/entries/
   direction: null                             # a slug from taste/directions.md, or null if unsorted
   screens: [dashboard]                        # freeform, optional, zero or more
   added: 2026-08-10
   ---

   ## What it shows

   Layout, colour, iconography, type, motion — whatever's visible and useful, described concretely
   enough that /prototype can act on it without opening the link.

   ## Why it's here

   One or two lines on what specifically to take from it.
   ```

3. Run `node taste/build.mjs` to regenerate `taste/index.html`.

## Design directions

`taste/directions.md` is the index of named directions (a name + description each). Directions are
**never invented upfront** — they emerge once two or more entries clearly share a visual language.
Whoever's adding entries also owns grouping them: assign an entry to an existing direction, name a new
one when nothing fits, or leave `direction: null` until a pattern shows up. Split or merge directions as
the collection grows; entries just point at a direction slug, so regrouping is a metadata edit, not a
file move.

## Viewing it

Open `taste/index.html` in a browser — it's static, no server needed. Regenerate it with
`node taste/build.mjs` (no dependencies, plain Node) after adding or re-grouping entries.

## How `/prototype` uses this

`/prototype` reads `taste/entries/*.md` and `taste/directions.md` directly (not the HTML). For a
look-branch prototype of a given screen: filter entries tagged with that screen (or take the whole
library if none are tagged yet), group by direction, and build one UI variant per existing direction.
Each variant is executed with **impeccable's craft floor only** — its quality bar for execution, not its
own direction-selection ritual (`concept-seed`), since the direction already came from this library.
