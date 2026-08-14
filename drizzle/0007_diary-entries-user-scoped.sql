-- #89/ADR 0007: diaryEntries becomes user-scoped. Dev data has no owner to
-- backfill onto, so it's wiped rather than migrated — cascades to
-- logged_items/nutrient_values, which have no direct user_id of their own.
DELETE FROM "diary_entries";--> statement-breakpoint
ALTER TABLE "diary_entries" ADD COLUMN "user_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "diary_entries" ADD CONSTRAINT "diary_entries_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "diary_entries_user_id_idx" ON "diary_entries" USING btree ("user_id");