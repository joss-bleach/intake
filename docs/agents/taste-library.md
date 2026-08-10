# Taste library

Design inspiration for Intake lives in `taste/` at the repo root — see `taste/README.md` for the entry
format and full workflow. This file covers the agent-facing conventions.

## Adding an entry

A human pastes a link or screenshot; you create the file.

1. Screenshot (if any) → `taste/entries/images/<slug>.<ext>`.
2. `taste/entries/<slug>.md` with the frontmatter + body shape documented in `taste/README.md`: a
   concrete description of what the UI shows (layout, colour, iconography — whatever's visible) and a
   short note on why it's here.
3. Regenerate the viewer: `node taste/build.mjs`.

## Assigning directions

Directions (`taste/directions.md`) are never invented ahead of real inspiration. Leave `direction: null`
until an entry clearly shares a visual language with an existing one or with another unsorted entry —
then either point it at the matching direction slug, or name a new direction (an `## <slug>` heading +
one-paragraph description in `taste/directions.md`) if nothing existing fits. Re-grouping is just editing
the `direction:` field — entries never need to move.

## How `/prototype` should use this

For a look-branch prototype of a given screen:

1. Read `taste/entries/*.md`; filter to entries tagged with that screen in `screens:` (fall back to the
   whole library if none are tagged yet).
2. Group the filtered entries by `direction`.
3. Build one UI variant per distinct direction found — this is the "several radically different
   variations on one route" the prototype skill asks for; the taste library is what supplies the
   different-ness, not invented-from-scratch variation.
4. Execute each variant using **impeccable's craft floor only** (its execution quality bar). Do not run
   impeccable's own direction-selection ritual (`concept-seed`, catalog challengers, `new-work.md`) —
   the direction already came from the taste library, so that ritual would just relitigate a settled
   choice.
5. Normal `/prototype` rules apply from there: real data/density where possible, switchable via URL
   param + bottom bar, committed to a `prototype/<name>` branch, never merged.

## Ticket conventions for look-prototypes

Screen-level "what should this look like" tickets are filed as standalone GitHub issues labelled
`wayfinder:prototype` (see `docs/agents/issue-tracker.md` for the general issue-tracker conventions) —
**not** attached to the architecture wayfinder map, which is explicitly out of scope for taste. A ticket
does not pin a direction at filing time; that's resolved when the ticket is claimed, per the workflow
above.
