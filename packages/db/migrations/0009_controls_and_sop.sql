CREATE TYPE "public"."control_mode" AS ENUM('manual', 'automated', 'it_dependent');--> statement-breakpoint
CREATE TYPE "public"."control_type" AS ENUM('preventive', 'detective');--> statement-breakpoint
CREATE TYPE "public"."doc_classification" AS ENUM('public', 'internal', 'confidential', 'restricted');--> statement-breakpoint
CREATE TYPE "public"."sop_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TABLE "controls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"control_key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"control_type" "control_type" DEFAULT 'preventive' NOT NULL,
	"mode" "control_mode" DEFAULT 'manual' NOT NULL,
	"frequency" text,
	"owner_role" text,
	"evidence" text,
	"is_key" boolean DEFAULT false NOT NULL,
	"risk" text,
	"rule_id" uuid,
	"step_ids" uuid[] DEFAULT '{}' NOT NULL,
	"provenance" "provenance" DEFAULT 'stated' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "controls_versionId_controlKey_unique" UNIQUE("version_id","control_key")
);
--> statement-breakpoint
CREATE TABLE "sop_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"doc_id" text NOT NULL,
	"doc_version" text NOT NULL,
	"status" "sop_status" DEFAULT 'draft' NOT NULL,
	"wording" jsonb NOT NULL,
	"ai_drafted" boolean DEFAULT true NOT NULL,
	"generated_by" uuid,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_by" uuid,
	"published_at" timestamp with time zone,
	"knowledge_document_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sop_documents_versionId_unique" UNIQUE("version_id")
);
--> statement-breakpoint
ALTER TABLE "processes" ADD COLUMN "sop_number" integer;--> statement-breakpoint
ALTER TABLE "processes" ADD COLUMN "classification" "doc_classification" DEFAULT 'internal' NOT NULL;--> statement-breakpoint
ALTER TABLE "processes" ADD COLUMN "review_cycle_months" integer DEFAULT 12 NOT NULL;--> statement-breakpoint
ALTER TABLE "controls" ADD CONSTRAINT "controls_version_id_process_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."process_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "controls" ADD CONSTRAINT "controls_rule_id_business_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."business_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sop_documents" ADD CONSTRAINT "sop_documents_version_id_process_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."process_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sop_documents" ADD CONSTRAINT "sop_documents_generated_by_users_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sop_documents" ADD CONSTRAINT "sop_documents_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sop_documents" ADD CONSTRAINT "sop_documents_knowledge_document_id_documents_id_fk" FOREIGN KEY ("knowledge_document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "controls_version_id_index" ON "controls" USING btree ("version_id");