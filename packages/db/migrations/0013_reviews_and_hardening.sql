ALTER TYPE "public"."validation_action" ADD VALUE 'reviewed';--> statement-breakpoint
ALTER TYPE "public"."task_kind" ADD VALUE 'review_due';--> statement-breakpoint
ALTER TYPE "public"."task_kind" ADD VALUE 'check_change';--> statement-breakpoint
CREATE TABLE "process_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"process_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"document_id" uuid,
	"document_title" text NOT NULL,
	"change" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"resolution" text,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "erased_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "process_versions" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "process_versions" ADD COLUMN "reviewed_by" uuid;--> statement-breakpoint
ALTER TABLE "interview_sessions" ADD COLUMN "transcript_purged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "llm_calls" ADD COLUMN "process_id" uuid;--> statement-breakpoint
ALTER TABLE "llm_calls" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "process_alerts" ADD CONSTRAINT "process_alerts_process_id_processes_id_fk" FOREIGN KEY ("process_id") REFERENCES "public"."processes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "process_alerts" ADD CONSTRAINT "process_alerts_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "process_alerts_process_id_status_index" ON "process_alerts" USING btree ("process_id","status");--> statement-breakpoint
ALTER TABLE "process_versions" ADD CONSTRAINT "process_versions_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_calls" ADD CONSTRAINT "llm_calls_process_id_processes_id_fk" FOREIGN KEY ("process_id") REFERENCES "public"."processes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_calls" ADD CONSTRAINT "llm_calls_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;