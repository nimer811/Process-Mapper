CREATE TYPE "public"."finding_source" AS ENUM('user', 'heuristic', 'ai', 'manual');--> statement-breakpoint
CREATE TYPE "public"."finding_status" AS ENUM('proposed', 'accepted', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."issue_category" AS ENUM('manual_work', 'duplicate_entry', 'unnecessary_approval', 'rework', 'handoff_delay', 'unclear_ownership', 'missing_sla', 'control_gap', 'other');--> statement-breakpoint
CREATE TYPE "public"."level" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."opportunity_kind" AS ENUM('workflow', 'integration', 'rpa', 'ai', 'self_service', 'elimination', 'other');--> statement-breakpoint
CREATE TABLE "automation_opportunities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"step_id" uuid,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"source" "finding_source" NOT NULL,
	"status" "finding_status" DEFAULT 'proposed' NOT NULL,
	"finding_key" text,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"kind" "opportunity_kind" NOT NULL,
	"expected_benefit" text,
	"impact" "level" DEFAULT 'medium' NOT NULL,
	"effort" "level" DEFAULT 'medium' NOT NULL,
	CONSTRAINT "automation_opportunities_versionId_findingKey_unique" UNIQUE("version_id","finding_key")
);
--> statement-breakpoint
CREATE TABLE "issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"step_id" uuid,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"source" "finding_source" NOT NULL,
	"status" "finding_status" DEFAULT 'proposed' NOT NULL,
	"finding_key" text,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"category" "issue_category" NOT NULL,
	"severity" "level" DEFAULT 'medium' NOT NULL,
	CONSTRAINT "issues_versionId_findingKey_unique" UNIQUE("version_id","finding_key")
);
--> statement-breakpoint
ALTER TABLE "automation_opportunities" ADD CONSTRAINT "automation_opportunities_version_id_process_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."process_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_opportunities" ADD CONSTRAINT "automation_opportunities_step_id_process_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."process_steps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_opportunities" ADD CONSTRAINT "automation_opportunities_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_opportunities" ADD CONSTRAINT "automation_opportunities_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_version_id_process_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."process_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_step_id_process_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."process_steps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "automation_opportunities_version_id_index" ON "automation_opportunities" USING btree ("version_id");--> statement-breakpoint
CREATE INDEX "issues_version_id_index" ON "issues" USING btree ("version_id");