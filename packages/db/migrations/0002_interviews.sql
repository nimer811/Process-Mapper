CREATE TYPE "public"."channel" AS ENUM('web', 'teams');--> statement-breakpoint
CREATE TYPE "public"."interview_stage" AS ENUM('scoping', 'happy_path', 'step_detail', 'branches_exceptions', 'rules_controls_pain', 'summary', 'completed');--> statement-breakpoint
CREATE TYPE "public"."interview_status" AS ENUM('active', 'paused', 'completed', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."open_item_status" AS ENUM('open', 'asked', 'resolved', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."open_item_type" AS ENUM('missing_info', 'question', 'ambiguity', 'contradiction', 'assumption');--> statement-breakpoint
CREATE TABLE "interview_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"author_user_id" uuid,
	"channel" "channel" DEFAULT 'web' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interview_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"process_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"channel" "channel" DEFAULT 'web' NOT NULL,
	"stage" "interview_stage" DEFAULT 'scoping' NOT NULL,
	"status" "interview_status" DEFAULT 'active' NOT NULL,
	"focus_step_id" uuid,
	"running_summary" text,
	"summarized_turns" integer DEFAULT 0 NOT NULL,
	"turn_count" integer DEFAULT 0 NOT NULL,
	"stage_entered_turn" integer DEFAULT 0 NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "llm_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid,
	"purpose" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"latency_ms" integer NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "open_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"type" "open_item_type" NOT NULL,
	"gap_key" text,
	"source" text NOT NULL,
	"entity_type" text,
	"entity_id" uuid,
	"field" text,
	"description" text NOT NULL,
	"priority" integer DEFAULT 50 NOT NULL,
	"status" "open_item_status" DEFAULT 'open' NOT NULL,
	"times_asked" integer DEFAULT 0 NOT NULL,
	"last_asked_turn" integer,
	"resolution" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "open_items_sessionId_gapKey_unique" UNIQUE("session_id","gap_key")
);
--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "message_id" uuid;--> statement-breakpoint
ALTER TABLE "process_steps" ADD COLUMN "no_system" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "process_versions" ADD COLUMN "owner_role" text;--> statement-breakpoint
ALTER TABLE "interview_messages" ADD CONSTRAINT "interview_messages_session_id_interview_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."interview_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_messages" ADD CONSTRAINT "interview_messages_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_sessions" ADD CONSTRAINT "interview_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_sessions" ADD CONSTRAINT "interview_sessions_process_id_processes_id_fk" FOREIGN KEY ("process_id") REFERENCES "public"."processes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_sessions" ADD CONSTRAINT "interview_sessions_version_id_process_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."process_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_sessions" ADD CONSTRAINT "interview_sessions_focus_step_id_process_steps_id_fk" FOREIGN KEY ("focus_step_id") REFERENCES "public"."process_steps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_calls" ADD CONSTRAINT "llm_calls_session_id_interview_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."interview_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_items" ADD CONSTRAINT "open_items_session_id_interview_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."interview_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_items" ADD CONSTRAINT "open_items_version_id_process_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."process_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "interview_messages_session_id_created_at_index" ON "interview_messages" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "interview_sessions_user_id_index" ON "interview_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "interview_sessions_process_id_index" ON "interview_sessions" USING btree ("process_id");--> statement-breakpoint
CREATE INDEX "llm_calls_session_id_index" ON "llm_calls" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "llm_calls_created_at_index" ON "llm_calls" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "open_items_session_id_status_index" ON "open_items" USING btree ("session_id","status");--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_message_id_interview_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."interview_messages"("id") ON DELETE set null ON UPDATE no action;
