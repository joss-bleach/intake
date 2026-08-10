---
image: images/meal-summary-item-list.png
direction: cream-serif-log-flow
screens: [meal-detail, log-confirmation]
added: 2026-08-10
---

## What it shows

A plain white full-screen page, warm off-white nav bar with a back chevron in a white circle, centred
title "Summary". Below, the meal name as a large bold heading, "Coffee and Toast", with a small pencil
(edit) icon at the far right of the same row. A "Serving(s)" row follows: label on the left, a bordered
rounded input box on the right showing "1". A thin divider, then a left-aligned "Items" heading with a
grey helper line underneath: "Based on typical servings. Adjust only if you want to" — explicitly telling
the user the defaults are fine as-is.

Below that, a vertical stack of rounded white cards with thin grey borders, one per parsed ingredient:
bold item name ("bean to cup coffee", "oat milk", "Jason's sourdough", "butter", "jam"), a lighter kcal
value underneath (e.g. "140 kcal"), and a pill-outlined "Edit" button on the right of each card. Item
names are casual/specific rather than generic ("Jason's sourdough" not "sourdough bread"), implying the
text-description input was parsed close to verbatim. A dark rounded "Log entry" pill button floats
centred over the list partway down, and a plain "+ Add new item" row with a plus icon sits below the last
card as the list's own affordance for adding more.

## Why it's here

This is the confirmation/edit step after free-text parsing — each parsed item gets its own editable card
with an inline kcal estimate rather than a monolithic edit form, and the explicit "adjust only if you
want to" copy sets the expectation that the AI's parse is trustworthy by default. Directly relevant to
Intake's own parse-then-confirm flow after a text or photo log.
