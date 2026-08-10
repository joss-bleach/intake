# Design directions

Named design directions, each backed by two or more taste-library entries that clearly share a visual
language. Nothing is listed here speculatively — see `taste/README.md` for how directions emerge.

Format: an `## <slug>` heading (kebab-case, matches the `direction:` value entries point at) followed by
one short paragraph describing the direction. `taste/build.mjs` parses headings at this level, so keep
new directions in that shape.

## cream-serif-log-flow

A single real product's own screenshots (not a mockup template) walking the log-a-meal-by-text flow end to
end: warm off-white/cream/peach backgrounds, a system Live Activity pill overlapping the status bar on
every screen, plain X-close and text-link chrome (no drag handles), serif-leaning headings and numerals,
and a dark-green rounded-pill primary CTA ("Log entry", "Done") that only appears once there's something to
act on. Cards are white with thin grey borders rather than shadows, and AI-thinking states get an
illustrated placeholder plus a plain-language present-participle status line ("Identifying foods…") instead
of a spinner. Members: `log-description-input`, `log-description-filled-state`,
`log-description-processing`, `log-food-entry-method-picker`, `meal-balance-score-breakdown`,
`meal-summary-item-list`.

## lavender-indigo-docked-fab

A pale lavender/periwinkle dashboard with a purple-to-indigo gradient hero surface (a calorie ring or a
stacked-pill macro chart), white rounded stat cards below, and — the specific tell — a docked white
rounded-top tab bar reading Home / Analytics / My Diet / Account with a raised indigo circular FAB
(stacked-lines icon) overlapping its top edge. Members: `purple-gradient-calorie-progress-home`,
`lavender-plans-weekly-macro-chart`.

## dark-purple-ring-gauge

Dark-mode fitness dashboards on a near-black background with a vivid purple/violet gradient accent, built
around a large circular progress-ring hero card (percentage or fraction centred inside the ring) and a dark
rounded/pill bottom tab bar. Members: `daily-goal-ring-community-leaderboard`, `workout-plan-calories-dark`.

## frosted-glass-over-photo

Glassmorphic UI laid directly over a full-bleed photographic background rather than a flat colour canvas —
translucent frosted-glass cards and buttons, photo visible through the panels, serif or editorial type
choices, and a warm/moody colour-graded backdrop (rock-and-flowers teal light, blurred floral/mossy tones).
Members: `smart-ring-skin-protection-dashboard`, `sisterly-community-support-app`.

## pastel-sparkline-raised-fab

Light-mode health dashboards built from the same skeleton: a greeting header with avatar, one hero metric
card (big bold reading plus a small inline sparkline or ring), two square pastel-tinted stat tiles side by
side each carrying its own mini sparkline, and a floating pill-shaped bottom nav bar broken by a raised
circular FAB. Members: `blood-sugar-health-tracker`, `wellness-health-overview-purple`.

## template-gradient-macro-dashboard

Vibe: cheerful, colourful, non-clinical calorie-tracking dashboard "template" mood — friendly rounded white
cards on a light backdrop, a single saturated-gradient hero card (indigo-blue, violet-lilac, or sage) that
carries the day's calorie number, three equal macro sub-cards below it, a meal list, and a floating pill
bottom nav. The three members clearly share one underlying skeleton re-skinned in different accent colours,
but what unifies them as a *direction* is the mood, not just the layout: warm and welcoming "friendly
stats" rather than clinical. Members: `nutrition-dashboard-blue-indigo`, `nutrition-dashboard-purple-gradient`,
`nutrition-dashboard-sage-green`.

## soft-cream-icon-dashboard

Vibe: gentle, muted, icon-driven warmth — pale peach/cream backgrounds, soft two-tone flat-colour cards (no
photography), amber/gold gauge or slider accents, and a quiet "cosy morning" mood rather than a punchy or
data-dense one. Members: `nutrition-dashboard-peach-gradient`, `warm-cream-energy-gauge-dashboard`.

## warm-peach-photographic

Vibe: warm peach-to-coral gradient fields paired with real food/beauty photography (not icons or
illustration) over clean white rounded cards — an appetising, editorial, glowing warmth, distinct from the
flatter icon-driven pastel dashboards elsewhere in the library. Members: `peach-recipe-library-scan-meal`,
`skincare-routine-checklist-insights`.

## pastel-gradient-blob-backdrop

Vibe: dreamy, premium, cool-pastel marketing-mockup presentation — one or more device frames with bezels
visible, floating on a soft blurred gradient-blob backdrop (lavender, pink-purple, or pink-to-blue) rather
than a flat canvas, giving a calm, high-end, slightly ethereal feel regardless of what's on the actual app
screens underneath. Members: `health-dashboard-profile-cards`, `health-report-fullness-slider`,
`serene-meditation-onboarding-dashboard`, `voice-journal-entries-list`.

## photographic-sporty-fitness-dashboard

Vibe: clean, energetic, light-grey fitness-app mood built around real action photography (running shoes,
workouts) plus blue/black/orange accent stat cards, icon-in-circle metric rows, and a confident
"keep moving" tone rather than a soft or clinical one. Members: `fitness-activity-dashboard-flow`,
`fitness-activity-plan-composite`.

## navy-ring-badge-coach-journal

Vibe: two screens of the same real coaching app (matching Coach/Journal/Profile bottom nav and identical
92g/208g/264g/27g macro goals), spanning a calm illustrated-pastel mood on one screen and a bold
saturated-orange mood on the other, unified by dark-navy serif-leaning headings, dark-navy pill CTAs,
plain-language mood copy ("Today is going to be a good day", "your day is orange, there are too many foods
to limit"), and an identical four-ring Fat/Protein/Carbs/Fiber macro-badge component. Members:
`coach-winter-illustration-goal-home`, `orange-journal-macro-rating`.
