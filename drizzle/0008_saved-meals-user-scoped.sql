-- #90/ADR 0007: savedMeals/savedMealItems become user-scoped. Dev data has
-- no owner to backfill onto, so it's wiped rather than migrated.
DELETE FROM "saved_meal_items";--> statement-breakpoint
DELETE FROM "saved_meals";--> statement-breakpoint
ALTER TABLE "saved_meal_items" ADD COLUMN "user_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "saved_meals" ADD COLUMN "user_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "saved_meal_items" ADD CONSTRAINT "saved_meal_items_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_meals" ADD CONSTRAINT "saved_meals_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "saved_meal_items_user_id_idx" ON "saved_meal_items" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "saved_meals_user_id_idx" ON "saved_meals" USING btree ("user_id");