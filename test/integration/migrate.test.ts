import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "../../src/server/db";
import {
  diaryEntries,
  foods,
  loggedItems,
  nutrientValues,
  userGoals,
} from "../../src/server/db/schema";
import { migrate } from "../../src/server/db/migrate";

// Exercises the Drizzle-managed schema/migrations against a real Postgres
// (DATABASE_URL — docker-compose.yml locally, the workflow's postgres
// service in CI). Proves the acceptance criterion "migrations run cleanly
// against a fresh Postgres instance in CI" and the schema shapes decided in
// issue #8.
describe("migrate", () => {
  beforeAll(async () => {
    await migrate();
  });

  afterAll(async () => {
    await pool.end();
  });

  it("is idempotent — re-running doesn't error", async () => {
    await expect(migrate()).resolves.toBeUndefined();
  });

  it("creates every table the data model requires", async () => {
    const { rows } = await pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name !~ '^__drizzle'
       ORDER BY table_name`,
    );

    expect(rows.map((row) => row.table_name)).toEqual([
      "diary_entries",
      "food_lookup_rate_limit_windows",
      "foods",
      "logged_items",
      "nutrient_values",
      "saved_meal_items",
      "saved_meals",
      "user_goals",
      "user_profile",
    ]);
  });

  it("enforces user_goals as a single current-value row", async () => {
    await db.insert(userGoals).values({ calorieGoal: 2000 });

    await expect(
      db.insert(userGoals).values({ id: false, calorieGoal: 1800 }),
    ).rejects.toThrow();

    await db.delete(userGoals);
  });

  it("rejects an out-of-enum provenance", async () => {
    // Deliberately bypasses Drizzle's typed insert (which would reject
    // "bogus" at compile time) via a raw query, to prove the DB-level check
    // constraint — not just the TS enum type — is what's actually guarding
    // this column.
    await expect(
      pool.query(
        "INSERT INTO foods (name, provenance, basis_unit) VALUES ('Bad food', 'bogus', 'g')",
      ),
    ).rejects.toThrow();
  });

  it("requires nutrient_values to attach to exactly one parent", async () => {
    await expect(
      db.insert(nutrientValues).values({
        code: "energy_kcal",
        value: "100",
        unit: "kcal",
        provenance: "database",
      }),
    ).rejects.toThrow();
  });

  it("tracks instance-level corrections via logged_items.correctedFromId", async () => {
    const [food] = await db
      .insert(foods)
      .values({ name: "Test food", provenance: "off", basisUnit: "g" })
      .returning();
    const [entry] = await db
      .insert(diaryEntries)
      .values({ entryMethod: "description" })
      .returning();
    const [original] = await db
      .insert(loggedItems)
      .values({
        diaryEntryId: entry.id,
        foodId: food.id,
        quantity: "100",
        quantityUnit: "g",
      })
      .returning();
    const [corrected] = await db
      .insert(loggedItems)
      .values({
        diaryEntryId: entry.id,
        foodId: food.id,
        quantity: "120",
        quantityUnit: "g",
        correctedFromId: original.id,
      })
      .returning();

    expect(corrected.correctedFromId).toBe(original.id);

    // diary_entries -> logged_items cascades; foods doesn't, so drop it last.
    await db.delete(diaryEntries).where(eq(diaryEntries.id, entry.id));
    await db.delete(foods).where(eq(foods.id, food.id));
  });
});
