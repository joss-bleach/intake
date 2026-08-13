import { desc, eq, isNotNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, pool } from "../server/db";
import { foods, loggedItems } from "../server/db/schema";

// Acceptance criterion (issue #48): corrections feed a periodic manual-review
// queue, not automatic dataset promotion — a human decides whether a real
// user correction is worth turning into a new/updated fixture, this never
// writes to test/fixtures/eval itself. A correction is a logged_item whose
// correctedFromId points at the original (schema.ts's instance-level
// correction flow); food-level corrections have no audit trail to query,
// per that same comment — this queue only ever surfaces the former.
export interface CorrectionForReview {
  readonly correctedItemId: string;
  readonly originalItemId: string;
  readonly diaryEntryId: string;
  readonly foodName: string;
  readonly quantity: string;
  readonly quantityUnit: string;
  readonly correctedAt: Date;
}

const original = alias(loggedItems, "original");

export const listCorrectionsForReview = async (): Promise<
  readonly CorrectionForReview[]
> => {
  const rows = await db
    .select({
      correctedItemId: loggedItems.id,
      originalItemId: original.id,
      diaryEntryId: loggedItems.diaryEntryId,
      foodName: foods.name,
      quantity: loggedItems.quantity,
      quantityUnit: loggedItems.quantityUnit,
      correctedAt: loggedItems.createdAt,
    })
    .from(loggedItems)
    .innerJoin(original, eq(original.id, loggedItems.correctedFromId))
    .innerJoin(foods, eq(foods.id, loggedItems.foodId))
    .where(isNotNull(loggedItems.correctedFromId))
    .orderBy(desc(loggedItems.createdAt));

  return rows;
};

const runFromCli = async (): Promise<void> => {
  const corrections = await listCorrectionsForReview();
  if (corrections.length === 0) {
    console.log("No corrections pending manual review.");
  } else {
    console.log(
      `${corrections.length} correction(s) pending manual review:\n`,
    );
    for (const c of corrections) {
      console.log(
        `  ${c.correctedAt.toISOString()}  ${c.foodName}  ${c.quantity}${c.quantityUnit}  ` +
          `(diary_entry ${c.diaryEntryId}, corrected_item ${c.correctedItemId} <- ${c.originalItemId})`,
      );
    }
  }
  await pool.end();
};

if (import.meta.url === `file://${process.argv[1]}`) {
  runFromCli().catch(async (error) => {
    console.error(error);
    await pool.end();
    process.exit(1);
  });
}
