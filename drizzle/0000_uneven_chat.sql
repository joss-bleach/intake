CREATE TABLE "diary_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"logged_at" timestamp with time zone DEFAULT now() NOT NULL,
	"entry_method" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "diary_entries_entry_method_check" CHECK ("diary_entries"."entry_method" in ('description', 'label_photo', 'saved_meal'))
);
--> statement-breakpoint
CREATE TABLE "foods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"brand" text,
	"provenance" text NOT NULL,
	"external_id" text,
	"basis_unit" text NOT NULL,
	"serving_size" numeric,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "foods_provenance_check" CHECK ("foods"."provenance" in ('off', 'cofid', 'llm_estimate_fallback', 'label_extraction')),
	CONSTRAINT "foods_basis_unit_check" CHECK ("foods"."basis_unit" in ('g', 'ml'))
);
--> statement-breakpoint
CREATE TABLE "logged_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"diary_entry_id" uuid NOT NULL,
	"food_id" uuid NOT NULL,
	"quantity" numeric NOT NULL,
	"quantity_unit" text NOT NULL,
	"confidence" text,
	"corrected_from_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "logged_items_quantity_positive" CHECK ("logged_items"."quantity" > 0),
	CONSTRAINT "logged_items_quantity_unit_check" CHECK ("logged_items"."quantity_unit" in ('g', 'ml', 'serving')),
	CONSTRAINT "logged_items_confidence_check" CHECK ("logged_items"."confidence" in ('confident', 'needs_review'))
);
--> statement-breakpoint
CREATE TABLE "nutrient_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"food_id" uuid,
	"logged_item_id" uuid,
	"code" text NOT NULL,
	"value" numeric NOT NULL,
	"unit" text NOT NULL,
	"provenance" text NOT NULL,
	"confidence" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nutrient_values_exactly_one_parent" CHECK (num_nonnulls("nutrient_values"."food_id", "nutrient_values"."logged_item_id") = 1),
	CONSTRAINT "nutrient_values_provenance_check" CHECK ("nutrient_values"."provenance" in ('database', 'llm_estimate_fallback', 'label_extraction', 'user_corrected')),
	CONSTRAINT "nutrient_values_confidence_check" CHECK ("nutrient_values"."confidence" in ('confident', 'needs_review'))
);
--> statement-breakpoint
CREATE TABLE "saved_meal_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"saved_meal_id" uuid NOT NULL,
	"food_id" uuid NOT NULL,
	"quantity" numeric NOT NULL,
	"quantity_unit" text NOT NULL,
	CONSTRAINT "saved_meal_items_quantity_positive" CHECK ("saved_meal_items"."quantity" > 0),
	CONSTRAINT "saved_meal_items_quantity_unit_check" CHECK ("saved_meal_items"."quantity_unit" in ('g', 'ml', 'serving'))
);
--> statement-breakpoint
CREATE TABLE "saved_meals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"times_logged" integer DEFAULT 0 NOT NULL,
	"last_logged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_goals" (
	"id" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"calorie_goal" integer NOT NULL,
	"macro_ratio" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_goals_singleton" CHECK ("user_goals"."id")
);
--> statement-breakpoint
CREATE TABLE "user_profile" (
	"id" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"current_weight_kg" numeric,
	"target_weight_kg" numeric,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_profile_singleton" CHECK ("user_profile"."id")
);
--> statement-breakpoint
ALTER TABLE "logged_items" ADD CONSTRAINT "logged_items_diary_entry_id_diary_entries_id_fk" FOREIGN KEY ("diary_entry_id") REFERENCES "public"."diary_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logged_items" ADD CONSTRAINT "logged_items_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nutrient_values" ADD CONSTRAINT "nutrient_values_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nutrient_values" ADD CONSTRAINT "nutrient_values_logged_item_id_logged_items_id_fk" FOREIGN KEY ("logged_item_id") REFERENCES "public"."logged_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_meal_items" ADD CONSTRAINT "saved_meal_items_saved_meal_id_saved_meals_id_fk" FOREIGN KEY ("saved_meal_id") REFERENCES "public"."saved_meals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_meal_items" ADD CONSTRAINT "saved_meal_items_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "foods_provenance_idx" ON "foods" USING btree ("provenance");--> statement-breakpoint
CREATE INDEX "foods_external_id_idx" ON "foods" USING btree ("external_id") WHERE "foods"."external_id" is not null;--> statement-breakpoint
CREATE INDEX "logged_items_diary_entry_id_idx" ON "logged_items" USING btree ("diary_entry_id");--> statement-breakpoint
CREATE INDEX "logged_items_food_id_idx" ON "logged_items" USING btree ("food_id");--> statement-breakpoint
CREATE INDEX "logged_items_corrected_from_id_idx" ON "logged_items" USING btree ("corrected_from_id") WHERE "logged_items"."corrected_from_id" is not null;--> statement-breakpoint
CREATE INDEX "nutrient_values_food_id_idx" ON "nutrient_values" USING btree ("food_id") WHERE "nutrient_values"."food_id" is not null;--> statement-breakpoint
CREATE INDEX "nutrient_values_logged_item_id_idx" ON "nutrient_values" USING btree ("logged_item_id") WHERE "nutrient_values"."logged_item_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "nutrient_values_food_code_idx" ON "nutrient_values" USING btree ("food_id","code") WHERE "nutrient_values"."food_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "nutrient_values_logged_item_code_idx" ON "nutrient_values" USING btree ("logged_item_id","code") WHERE "nutrient_values"."logged_item_id" is not null;--> statement-breakpoint
CREATE INDEX "saved_meal_items_saved_meal_id_idx" ON "saved_meal_items" USING btree ("saved_meal_id");