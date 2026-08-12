CREATE TABLE "food_lookup_rate_limit_windows" (
	"window_start" timestamp with time zone PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "foods_provenance_external_id_idx" ON "foods" USING btree ("provenance","external_id") WHERE "foods"."external_id" is not null;