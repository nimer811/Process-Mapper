CREATE TYPE "public"."disagreement_status" AS ENUM('open', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."session_kind" AS ENUM('primary', 'contribution');--> statement-breakpoint
ALTER TYPE "public"."task_kind" ADD VALUE 'add_view';--> statement-breakpoint
ALTER TYPE "public"."task_kind" ADD VALUE 'resolve_disagreements';--> statement-breakpoint
CREATE TABLE "disagreements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"session_id" uuid,
	"message_id" uuid,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"field" text NOT NULL,
	"subject" text NOT NULL,
	"current_value" text NOT NULL,
	"current_user_id" uuid,
	"current_quote" text,
	"proposed_value" text NOT NULL,
	"proposed_user_id" uuid,
	"proposed_quote" text,
	"recommendation" jsonb,
	"status" "disagreement_status" DEFAULT 'open' NOT NULL,
	"resolution" text,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "interview_sessions" ADD COLUMN "kind" "session_kind" DEFAULT 'primary' NOT NULL;--> statement-breakpoint
ALTER TABLE "interview_sessions" ADD COLUMN "focus" text;--> statement-breakpoint
ALTER TABLE "interview_sessions" ADD COLUMN "invited_by" uuid;--> statement-breakpoint
ALTER TABLE "disagreements" ADD CONSTRAINT "disagreements_version_id_process_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."process_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disagreements" ADD CONSTRAINT "disagreements_session_id_interview_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."interview_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disagreements" ADD CONSTRAINT "disagreements_message_id_interview_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."interview_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disagreements" ADD CONSTRAINT "disagreements_current_user_id_users_id_fk" FOREIGN KEY ("current_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disagreements" ADD CONSTRAINT "disagreements_proposed_user_id_users_id_fk" FOREIGN KEY ("proposed_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disagreements" ADD CONSTRAINT "disagreements_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "disagreements_version_id_status_index" ON "disagreements" USING btree ("version_id","status");--> statement-breakpoint
ALTER TABLE "interview_sessions" ADD CONSTRAINT "interview_sessions_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;