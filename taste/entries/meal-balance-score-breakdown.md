---
image: images/meal-balance-score-breakdown.png
direction: null
screens: [meal-detail, log-confirmation]
added: 2026-08-10
---

## What it shows

A scrolling results screen on a soft peach/pink background, presented as two stacked white rounded
cards. The first card: small-caps label "CALORIES" with a pill-shaped "Edit calories" button top-right;
below it a huge serif-leaning number "913" with a small grey "kcals" unit beside it. Under that, a
single horizontal bar split into four coloured segments sized proportionally to grams (green/protein,
lavender/fats, orange/carbs, a sliver of yellow/fibre), with a legend row underneath — coloured dot,
small-caps label, and value in bold ("57 g PROTEIN", "44 g FATS", "73 g CARBS", "6 g FIBRE").

The second card: small-caps label "MEAL BALANCE SCORE", then a dark-green rounded-square badge with a
bold digit "8" next to a plain-language verdict in large serif type, "You've got this down!". Below that
a three-segment horizontential score bar (red, yellow, green) spanning 0-10 with a downward-pointing
triangle marker and a vertical tick sitting near the top of the green segment showing where this meal
scored. A short paragraph of plain-English feedback follows ("This meal provides an impressive protein
intake for muscle recovery, though adding fresh vegetables would better support long-term digestion."),
then a divider and a collapsible "See meal breakdown" row (chevron, currently expanded) revealing a
per-nutrient list with small food-emoji icons, a label, a value + qualitative tag ("44g | Healthy
amount"), and a mini two-tone progress bar per row. A dark rounded "Done" pill button is pinned centred
near the bottom, overlapping the list content below it.

## Why it's here

The single 0-10 "meal balance score" with a plain-language verdict and a short generated-feedback
paragraph is a strong pattern for Intake's post-log confirmation screen — turns a nutrient breakdown into
one digestible judgement instead of just numbers. The proportional single-bar macro split (rather than
four separate rings) is a more compact alternative worth considering for a calorie/macro summary card.
