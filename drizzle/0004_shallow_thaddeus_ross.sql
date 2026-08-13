ALTER TABLE "logged_items" DROP CONSTRAINT "logged_items_corrected_from_id_logged_items_id_fk";
--> statement-breakpoint
ALTER TABLE "logged_items" ADD CONSTRAINT "logged_items_corrected_from_id_logged_items_id_fk" FOREIGN KEY ("corrected_from_id") REFERENCES "public"."logged_items"("id") ON DELETE no action ON UPDATE no action;