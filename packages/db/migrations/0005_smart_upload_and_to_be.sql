CREATE TYPE "public"."classification_source" AS ENUM('user', 'ai', 'rule');--> statement-breakpoint
CREATE TYPE "public"."design_change_type" AS ENUM('added', 'removed', 'modified', 'reconnected', 'rule_added', 'rule_removed');--> statement-breakpoint
CREATE TABLE "design_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"change_type" "design_change_type" NOT NULL,
	"step_key" text,
	"description" text NOT NULL,
	"rationale" text NOT NULL,
	"opportunity_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "knowledge_base_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "process_versions" ADD COLUMN "design_goals" text;--> statement-breakpoint
ALTER TABLE "process_versions" ADD COLUMN "design_summary" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "category_source" "classification_source" DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "classification_confidence" numeric(3, 2);--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "classification_reason" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "needs_review" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "design_changes" ADD CONSTRAINT "design_changes_version_id_process_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."process_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_changes" ADD CONSTRAINT "design_changes_opportunity_id_automation_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."automation_opportunities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "design_changes_version_id_index" ON "design_changes" USING btree ("version_id");