# MVP build plan: execution blocks

Source: [Spec #39](https://github.com/joss-bleach/intake/issues/39), split into tickets by `/to-tickets` — see `docs/agents/issue-tracker.md` for tracker conventions.

17 tickets, grouped into 7 blocks by dependency level. Everything in a block can run in parallel (no ticket in a block blocks another ticket in the same block). **Finish and QA every ticket in a block before starting the next block** — that's the checkpoint. Within a block, order doesn't matter.

To check live status instead of trusting this table, use the frontier query from `docs/agents/issue-tracker.md`: `gh issue list --state open` on this repo, filtered to unassigned issues with `issue_dependencies_summary.blocked_by == 0`.

## Block A — solo

Nothing else can start until this merges.

- [ ] [#40 — Project scaffold & CI](https://github.com/joss-bleach/intake/issues/40)

## Block B — 2 in parallel

- [ ] [#41 — Core data model & migrations](https://github.com/joss-bleach/intake/issues/41)
- [ ] [#42 — Visual system baseline](https://github.com/joss-bleach/intake/issues/42)

## Block C — 3 in parallel

- [ ] [#43 — Shared LLM-output contract: schemas + AI SDK wrapper](https://github.com/joss-bleach/intake/issues/43)
- [ ] [#44 — Food database strategy](https://github.com/joss-bleach/intake/issues/44)
- [ ] [#45 — Onboarding & goals](https://github.com/joss-bleach/intake/issues/45)

## Block D — 4 in parallel

- [ ] [#46 — Log by description — happy path](https://github.com/joss-bleach/intake/issues/46)
- [ ] [#47 — Log by label photo — happy path](https://github.com/joss-bleach/intake/issues/47)
- [ ] [#48 — Eval harness](https://github.com/joss-bleach/intake/issues/48)
- [ ] [#49 — Observability](https://github.com/joss-bleach/intake/issues/49)

## Block E — 5 in parallel

- [ ] [#50 — Log by description — ambiguity & corrections](https://github.com/joss-bleach/intake/issues/50) *(needs #46)*
- [ ] [#51 — Log by label photo — corrections & incomplete-read handoff](https://github.com/joss-bleach/intake/issues/51) *(needs #46, #47)*
- [ ] [#52 — Saved meals & recently-logged](https://github.com/joss-bleach/intake/issues/52) *(needs #41, #46, #47)*
- [ ] [#53 — Dashboard](https://github.com/joss-bleach/intake/issues/53) *(needs #42, #45, #46, #47)*
- [ ] [#54 — Model-selection bake-off](https://github.com/joss-bleach/intake/issues/54) *(needs #48)*

## Block F — solo

- [ ] [#55 — Insights](https://github.com/joss-bleach/intake/issues/55) *(needs #53)*

## Block G — solo

- [ ] [#56 — Offline/PWA](https://github.com/joss-bleach/intake/issues/56) *(needs #53, #55)*

## How to use this

1. Check off a ticket's box here once its PR is merged **and** QA'd — not just merged. This file is a QA ledger, not a merge ledger.
2. Don't start a ticket in block N+1 until every box in block N is checked.
3. Within a block, tickets can run as separate PRs/sessions/agents concurrently — none of them touch each other's blockers.
4. If a ticket's scope changes enough to add or drop a blocking edge, update both the GitHub native dependency (`gh api --method POST repos/joss-bleach/intake/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`) and this file — GitHub's dependency graph is the source of truth if the two ever disagree.
