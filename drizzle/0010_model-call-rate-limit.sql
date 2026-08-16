CREATE TABLE "model_call_rate_limit_windows" (
	"subject" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "model_call_rate_limit_windows_subject_window_start_pk" PRIMARY KEY("subject","window_start")
);
