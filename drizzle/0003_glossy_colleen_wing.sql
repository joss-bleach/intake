CREATE TABLE "model_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"correlation_id" text NOT NULL,
	"pipeline_stage" text NOT NULL,
	"model" text NOT NULL,
	"outcome" text NOT NULL,
	"latency_ms" integer NOT NULL,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"cost_usd" numeric,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "model_calls_outcome_check" CHECK ("model_calls"."outcome" in ('success', 'parse_failure', 'call_failed'))
);
--> statement-breakpoint
CREATE INDEX "model_calls_created_at_idx" ON "model_calls" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "model_calls_correlation_id_idx" ON "model_calls" USING btree ("correlation_id");