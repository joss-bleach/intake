# Cached-reads-only offline

**Status:** accepted

**Context:** The brief requires "recently viewed data readable offline" as part of the PWA feature (see ADR 0002), and separately rules out offline writes as a non-goal for MVP ("Reading cached data offline is in; offline writes are a v2 problem"). This ADR pins down what "recently viewed" actually covers, the caching/invalidation mechanism, and how the app behaves when a write is attempted offline.

**Decision:**

**Scope.** "Recently viewed" means whatever the TanStack Query cache already holds from normal use this session/recent sessions — dashboard, diary entries, saved meals, insights, whatever the user happened to load. There is no deliberate background sync of a fixed window (e.g. "always keep the last 7 days"); offline reads are a side effect of the app's existing query cache, not a separate synced dataset. Anything never fetched while online simply isn't available offline.

**Storage mechanism.** The TanStack Query cache is persisted to IndexedDB using `@tanstack/query-persist-client-core` + `@tanstack/query-async-storage-persister`, backed by `idb-keyval`. This reuses the app's existing query-key/staleness model instead of building a second, parallel cache at the HTTP layer (a service worker proxying tRPC responses was considered and rejected — see below).

**Expiry.** Persisted query data is valid for **24 hours**. Past that, it's treated as gone (not silently served) and the query refetches on next connection — keeps "recently viewed" honest and bounds how stale the numbers shown can get, which matters for a nutrition app (see the brief's accuracy-trust risk).

**Offline indicator.** When offline, the UI shows a plain **"offline"** indicator — no extra copy about cached data. Reasoning: enough to explain why network-dependent actions are unavailable, without adding UI noise beyond what the brief calls for.

**Offline writes.** Logging a meal (either path) is disabled while offline: entry points show a **"no internet"** message rather than accepting a submit that would fail or need to be queued. No queue-and-retry or background-sync design is part of this decision — building one would contradict the brief's stated non-goal, and is explicitly deferred to a v2 effort if offline writes are ever taken on.

**App-shell precaching.** Separately from data, the app itself (JS/CSS/icons) must be precached by a service worker so it can boot at all while offline — a baseline requirement of any installable PWA, not a data-caching concern. The tool for this is **Workbox**, but the exact integration is bundler-specific and this project hasn't chosen a bundler yet, so it's deferred to the build phase rather than named further here.

## Considered options

- **Service worker caching raw tRPC/HTTP responses (Cache Storage API)** — rejected: duplicates caching logic the app already has via TanStack Query's `staleTime`/`gcTime`/query keys, and decouples "what's cached" from "what the UI actually renders from," making the two easy to drift out of sync.
- **Deliberately synced offline window (e.g. always keep last 7 days)** — rejected for MVP: adds a background-sync mechanism and a policy for what to prefetch, neither of which the brief asks for ("recently viewed" reads literally as "recently loaded"). Revisit if usage shows people expect more than session-cached data offline.
- **Let offline log attempts fail with an error instead of disabling the entry point** — rejected: a proactive disabled state with a clear message is simpler to build and avoids a confusing failed-request state; a queue-and-retry alternative was also considered and rejected as explicitly out of scope for this ADR.

## Consequences

- Offline coverage is inherently unpredictable from the user's point of view — a screen never opened this session won't be there offline. Acceptable for MVP; a synced-window approach is the natural next step if this proves confusing in practice.
- A 24-hour persisted cache means a user who goes offline for more than a day sees nothing until they reconnect, rather than very stale data — an intentional trade favoring correctness over availability.
- Offline write support (queueing, background sync, conflict resolution) is unscoped work, not a rejected design — deferred whole to any future v2 effort that takes it on.
- The app-shell service worker (Workbox) and the data-cache persister are two independent mechanisms serving two different jobs (boot vs. data) — worth keeping distinct rather than merging them into one "the service worker handles offline" mental model.
