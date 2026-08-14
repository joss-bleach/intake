import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  type PgColumn,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// Core data model (issue #41, per issue #8's shape decisions): foods,
// nutrient_values, diary_entries, logged_items, saved_meals,
// saved_meal_items, user_goals, user_profile. Schema is the source of truth
// — `pnpm db:generate` derives SQL migrations from it (see drizzle.config.ts
// and src/server/db/migrate.ts).

// betterauth's own tables (issue #87) — generated via `npx @better-auth/cli
// generate`, re-exported here so `db`'s single schema object covers both.
// Regenerate auth-schema.ts (don't hand-edit) if src/server/auth's config
// changes shape.
export * from "./auth-schema";

const quantityUnit = ["g", "ml", "serving"] as const;
const confidenceLevel = ["confident", "needs_review"] as const;

// `text({ enum: [...] })` below is TypeScript-only — drizzle-kit emits a
// plain `text` column with no DB-level guard. These helpers add back the
// `CHECK (col IN (...))` constraint the raw-SQL version had, so a bad value
// can't reach the table via anything other than this schema (e.g. a manual
// `psql` insert, or a future non-Drizzle client).
const inCheck = (column: PgColumn, values: readonly string[]) => {
  const literals = values.map((value) => `'${value}'`).join(", ");
  return sql`${column} in (${sql.raw(literals)})`;
};

// One unified, source-agnostic table normalized to per-100g/100ml (UK's
// legal labelling baseline). A food's origin — OFF, CoFID, an LLM-estimate
// fallback, or a verified label extraction — is distinguished only by
// `provenance`, not by separate tables. `servingSize` (same unit as
// `basisUnit`) is the conversion factor for logged_items/saved_meal_items
// rows quantified in "serving" rather than g/ml; null where no serving size
// is known.
export const foods = pgTable(
  "foods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    brand: text("brand"),
    provenance: text("provenance", {
      enum: ["off", "cofid", "llm_estimate_fallback", "label_extraction"],
    }).notNull(),
    externalId: text("external_id"),
    basisUnit: text("basis_unit", { enum: ["g", "ml"] }).notNull(),
    servingSize: numeric("serving_size"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("foods_provenance_idx").on(table.provenance),
    index("foods_external_id_idx")
      .on(table.externalId)
      .where(sql`${table.externalId} is not null`),
    // One canonical row per (provenance, external id) — the target the OFF
    // pre-warm/delta-refresh and CoFID ingestion upsert against, and the
    // live cache-miss fallback in resolveFood (issue #44) writes through the
    // same way, so a re-run or a repeated live lookup never duplicates a row.
    uniqueIndex("foods_provenance_external_id_idx")
      .on(table.provenance, table.externalId)
      .where(sql`${table.externalId} is not null`),
    check(
      "foods_provenance_check",
      inCheck(table.provenance, [
        "off",
        "cofid",
        "llm_estimate_fallback",
        "label_extraction",
      ]),
    ),
    check("foods_basis_unit_check", inCheck(table.basisUnit, ["g", "ml"])),
  ],
);

// Parent record per logging action (timestamp, entry method). Fans out to
// one-to-many logged_items — a multi-ingredient description produces several
// logged_items under one diary_entries row, never an ingredients array on
// one row, so each ingredient stays individually correctable.
export const diaryEntries = pgTable(
  "diary_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    loggedAt: timestamp("logged_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    entryMethod: text("entry_method", {
      enum: ["description", "label_photo", "saved_meal"],
    }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "diary_entries_entry_method_check",
      inCheck(table.entryMethod, ["description", "label_photo", "saved_meal"]),
    ),
  ],
);

// correctedFromId is the instance-level correction flow: it points at the
// original logged_items row, which is kept unmodified for audit. Food-level
// corrections instead edit the foods row directly — there is never a
// separate corrections table.
export const loggedItems = pgTable(
  "logged_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    diaryEntryId: uuid("diary_entry_id")
      .notNull()
      .references(() => diaryEntries.id, { onDelete: "cascade" }),
    foodId: uuid("food_id")
      .notNull()
      .references(() => foods.id),
    quantity: numeric("quantity").notNull(),
    quantityUnit: text("quantity_unit", { enum: quantityUnit }).notNull(),
    confidence: text("confidence", { enum: confidenceLevel }),
    // Self-reference, so lineage can't point at a row that was never there or
    // is already gone. Issue #50 decided a correction always shares its
    // original's diary_entry_id (one entry, corrected in place) rather than
    // landing in a different entry — so a diary_entries delete cascades to
    // both rows in the same statement, and Postgres checks this FK's default
    // NO ACTION at end-of-statement, not per-row. That lets lineage survive
    // the delete instead of being nulled out, unlike the `set null` this
    // replaced (see issue #50's PR #60 follow-up comment for the full
    // reasoning, including why RESTRICT would NOT be interchangeable here).
    correctedFromId: uuid("corrected_from_id").references(
      (): PgColumn => loggedItems.id,
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("logged_items_diary_entry_id_idx").on(table.diaryEntryId),
    index("logged_items_food_id_idx").on(table.foodId),
    index("logged_items_corrected_from_id_idx")
      .on(table.correctedFromId)
      .where(sql`${table.correctedFromId} is not null`),
    check("logged_items_quantity_positive", sql`${table.quantity} > 0`),
    check(
      "logged_items_quantity_unit_check",
      inCheck(table.quantityUnit, quantityUnit),
    ),
    check(
      "logged_items_confidence_check",
      inCheck(table.confidence, confidenceLevel),
    ),
  ],
);

// Narrow, generic value table (code, value, unit, provenance, confidence)
// rather than fixed columns — CoFID alone has ~150-185 possible nutrient
// fields, almost all NULL for any given record. Attaches to either a food or
// a logged_item, never both (see the exactly-one-parent check below).
export const nutrientValues = pgTable(
  "nutrient_values",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    foodId: uuid("food_id").references(() => foods.id, {
      onDelete: "cascade",
    }),
    loggedItemId: uuid("logged_item_id").references(() => loggedItems.id, {
      onDelete: "cascade",
    }),
    code: text("code").notNull(),
    value: numeric("value").notNull(),
    unit: text("unit").notNull(),
    provenance: text("provenance", {
      enum: [
        "database",
        "llm_estimate_fallback",
        "label_extraction",
        "user_corrected",
      ],
    }).notNull(),
    confidence: text("confidence", { enum: confidenceLevel }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("nutrient_values_food_id_idx")
      .on(table.foodId)
      .where(sql`${table.foodId} is not null`),
    index("nutrient_values_logged_item_id_idx")
      .on(table.loggedItemId)
      .where(sql`${table.loggedItemId} is not null`),
    uniqueIndex("nutrient_values_food_code_idx")
      .on(table.foodId, table.code)
      .where(sql`${table.foodId} is not null`),
    uniqueIndex("nutrient_values_logged_item_code_idx")
      .on(table.loggedItemId, table.code)
      .where(sql`${table.loggedItemId} is not null`),
    check(
      "nutrient_values_exactly_one_parent",
      sql`num_nonnulls(${table.foodId}, ${table.loggedItemId}) = 1`,
    ),
    check(
      "nutrient_values_provenance_check",
      inCheck(table.provenance, [
        "database",
        "llm_estimate_fallback",
        "label_extraction",
        "user_corrected",
      ]),
    ),
    check(
      "nutrient_values_confidence_check",
      inCheck(table.confidence, confidenceLevel),
    ),
  ],
);

// Reserved for deliberately named, multi-item bundles. A single re-logged
// food is *not* a saved_meal — it's a query over logged_items grouped by
// food_id, ranked by frequency/recency.
export const savedMeals = pgTable("saved_meals", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  timesLogged: integer("times_logged").notNull().default(0),
  lastLoggedAt: timestamp("last_logged_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const savedMealItems = pgTable(
  "saved_meal_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    savedMealId: uuid("saved_meal_id")
      .notNull()
      .references(() => savedMeals.id, { onDelete: "cascade" }),
    foodId: uuid("food_id")
      .notNull()
      .references(() => foods.id),
    quantity: numeric("quantity").notNull(),
    quantityUnit: text("quantity_unit", { enum: quantityUnit }).notNull(),
  },
  (table) => [
    index("saved_meal_items_saved_meal_id_idx").on(table.savedMealId),
    check("saved_meal_items_quantity_positive", sql`${table.quantity} > 0`),
    check(
      "saved_meal_items_quantity_unit_check",
      inCheck(table.quantityUnit, quantityUnit),
    ),
  ],
);

// user_goals and user_profile are each a single current-value row, no
// history. The `id boolean primary key ... check (id)` shape is a
// singleton-table pattern: the primary key forbids a second row, and the
// check forbids an id=false row, so at most one row can ever exist.
export const userGoals = pgTable(
  "user_goals",
  {
    id: boolean("id").primaryKey().default(true),
    calorieGoal: integer("calorie_goal").notNull(),
    macroRatio: jsonb("macro_ratio"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [check("user_goals_singleton", sql`${table.id}`)],
);

// Deliberately separate from user_goals — current/target weight, not a
// calorie/macro target.
export const userProfile = pgTable(
  "user_profile",
  {
    id: boolean("id").primaryKey().default(true),
    currentWeightKg: numeric("current_weight_kg"),
    targetWeightKg: numeric("target_weight_kg"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [check("user_profile_singleton", sql`${table.id}`)],
);

// Backs the food-resolution rate limiter (issue #44's Postgres-table-backed
// Effect service, not Effect's built-in `RateLimiter`, per the ticket's own
// choice — a shared, restart-durable limiter on the rare live OFF-lookup
// fallback path, rather than an in-memory one that resets per process). One
// row per fixed window; `resolveFood`'s live-miss path atomically upserts
// its own window row (insert-or-increment) and compares the returned count
// against the configured ceiling — see src/server/food/rate-limiter.ts.
export const foodLookupRateLimitWindows = pgTable("food_lookup_rate_limit_windows", {
  windowStart: timestamp("window_start", { withTimezone: true }).primaryKey(),
  count: integer("count").notNull().default(0),
});

// Exported (not local like the other enum arrays above) so it's the single
// source of truth for the outcome vocabulary — model-calls.ts's
// `ModelCallOutcome` and effect-ai-sdk.ts's `AiSdkError.reason` both derive
// from this rather than redeclaring the same three strings.
export const modelCallOutcome = ["success", "parse_failure", "call_failed"] as const;

// Observability (issue #49): one row per raw provider call made through
// src/ai/effect-ai-sdk.ts, dev/ops-facing only — not surfaced in GlitchTip,
// queried ad hoc via SQL. Kept indefinitely; a scheduled cron tripwire
// (src/server/observability/tripwire.ts) alerts via GlitchTip once the
// table passes a size threshold, rather than this table pruning itself.
// Production calls only — the (future) eval harness's own runs don't carry
// `tracking` metadata, so they never reach this table (see effect-ai-sdk.ts).
export const modelCalls = pgTable(
  "model_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Client-generated, so one logical request (e.g. a fallback retry) can
    // still be correlated across the rows it produces.
    correlationId: text("correlation_id").notNull(),
    pipelineStage: text("pipeline_stage").notNull(),
    model: text("model").notNull(),
    outcome: text("outcome", { enum: modelCallOutcome }).notNull(),
    latencyMs: integer("latency_ms").notNull(),
    promptTokens: integer("prompt_tokens"),
    completionTokens: integer("completion_tokens"),
    // Only populated when the provider returns usage-accounting data (e.g.
    // OpenRouter's optional cost field) — null otherwise, not estimated.
    costUsd: numeric("cost_usd"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("model_calls_created_at_idx").on(table.createdAt),
    index("model_calls_correlation_id_idx").on(table.correlationId),
    check(
      "model_calls_outcome_check",
      inCheck(table.outcome, modelCallOutcome),
    ),
  ],
);
