CREATE TYPE "public"."actor_kind" AS ENUM('role', 'team', 'external');--> statement-breakpoint
CREATE TYPE "public"."edge_type" AS ENUM('sequence', 'branch', 'exception', 'alternate', 'loop_back');--> statement-breakpoint
CREATE TYPE "public"."evidence_source" AS ENUM('user_statement', 'document', 'ai_inference', 'user_validation', 'manual_edit');--> statement-breakpoint
CREATE TYPE "public"."execution_mode" AS ENUM('manual', 'automated', 'semi_automated', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."provenance" AS ENUM('stated', 'documented', 'inferred', 'confirmed', 'disputed');--> statement-breakpoint
CREATE TYPE "public"."rule_type" AS ENUM('threshold', 'approval', 'compliance', 'sla', 'control', 'other');--> statement-breakpoint
CREATE TYPE "public"."step_type" AS ENUM('start', 'task', 'decision', 'approval', 'end', 'subprocess');--> statement-breakpoint
CREATE TYPE "public"."validation_action" AS ENUM('summary_confirmed', 'correction', 'submitted', 'validated', 'approved', 'returned', 'archived', 'reopened');--> statement-breakpoint
CREATE TYPE "public"."version_kind" AS ENUM('as_is', 'to_be');--> statement-breakpoint
CREATE TYPE "public"."version_status" AS ENUM('draft', 'under_validation', 'validated', 'approved', 'archived');--> statement-breakpoint
CREATE TABLE "actors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"kind" "actor_kind" DEFAULT 'role' NOT NULL,
	"department_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "actors_normalizedName_unique" UNIQUE("normalized_name")
);
--> statement-breakpoint
CREATE TABLE "business_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"step_id" uuid,
	"rule_type" "rule_type" DEFAULT 'other' NOT NULL,
	"statement" text NOT NULL,
	"provenance" "provenance" DEFAULT 'stated' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"field" text,
	"source_type" "evidence_source" NOT NULL,
	"quote" text,
	"provided_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "process_edges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"from_step_id" uuid NOT NULL,
	"to_step_id" uuid NOT NULL,
	"type" "edge_type" DEFAULT 'sequence' NOT NULL,
	"condition_label" text,
	"provenance" "provenance" DEFAULT 'stated' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "process_edges_versionId_fromStepId_toStepId_type_unique" UNIQUE("version_id","from_step_id","to_step_id","type")
);
--> statement-breakpoint
CREATE TABLE "process_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"step_key" text NOT NULL,
	"sequence" integer,
	"type" "step_type" DEFAULT 'task' NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"actor_id" uuid,
	"inputs" text[] DEFAULT '{}' NOT NULL,
	"outputs" text[] DEFAULT '{}' NOT NULL,
	"execution" "execution_mode" DEFAULT 'unknown' NOT NULL,
	"expected_duration" text,
	"sla" text,
	"approval_authority" text,
	"pain_points" text[] DEFAULT '{}' NOT NULL,
	"provenance" "provenance" DEFAULT 'stated' NOT NULL,
	"confidence" numeric(3, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "process_steps_versionId_stepKey_unique" UNIQUE("version_id","step_key")
);
--> statement-breakpoint
CREATE TABLE "process_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"process_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"kind" "version_kind" DEFAULT 'as_is' NOT NULL,
	"status" "version_status" DEFAULT 'draft' NOT NULL,
	"based_on_version_id" uuid,
	"description" text,
	"purpose" text,
	"trigger" text,
	"end_condition" text,
	"frequency" text,
	"volume" text,
	"scope_notes" text,
	"completeness_score" numeric(5, 2),
	"change_summary" text,
	"created_by" uuid,
	"submitted_at" timestamp with time zone,
	"validated_by" uuid,
	"validated_at" timestamp with time zone,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "process_versions_processId_kind_versionNumber_unique" UNIQUE("process_id","kind","version_number")
);
--> statement-breakpoint
CREATE TABLE "processes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"department_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"owner_user_id" uuid,
	"current_version_id" uuid,
	"created_by" uuid,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "processes_departmentId_slug_unique" UNIQUE("department_id","slug")
);
--> statement-breakpoint
CREATE TABLE "step_dependencies" (
	"step_id" uuid NOT NULL,
	"depends_on_step_id" uuid NOT NULL,
	CONSTRAINT "step_dependencies_step_id_depends_on_step_id_pk" PRIMARY KEY("step_id","depends_on_step_id")
);
--> statement-breakpoint
CREATE TABLE "step_systems" (
	"step_id" uuid NOT NULL,
	"system_id" uuid NOT NULL,
	CONSTRAINT "step_systems_step_id_system_id_pk" PRIMARY KEY("step_id","system_id")
);
--> statement-breakpoint
CREATE TABLE "systems" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "systems_normalizedName_unique" UNIQUE("normalized_name")
);
--> statement-breakpoint
CREATE TABLE "validation_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"action" "validation_action" NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "actors" ADD CONSTRAINT "actors_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_rules" ADD CONSTRAINT "business_rules_version_id_process_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."process_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_rules" ADD CONSTRAINT "business_rules_step_id_process_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."process_steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_version_id_process_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."process_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_provided_by_users_id_fk" FOREIGN KEY ("provided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "process_edges" ADD CONSTRAINT "process_edges_version_id_process_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."process_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "process_edges" ADD CONSTRAINT "process_edges_from_step_id_process_steps_id_fk" FOREIGN KEY ("from_step_id") REFERENCES "public"."process_steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "process_edges" ADD CONSTRAINT "process_edges_to_step_id_process_steps_id_fk" FOREIGN KEY ("to_step_id") REFERENCES "public"."process_steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "process_steps" ADD CONSTRAINT "process_steps_version_id_process_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."process_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "process_steps" ADD CONSTRAINT "process_steps_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "process_versions" ADD CONSTRAINT "process_versions_process_id_processes_id_fk" FOREIGN KEY ("process_id") REFERENCES "public"."processes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "process_versions" ADD CONSTRAINT "process_versions_based_on_version_id_process_versions_id_fk" FOREIGN KEY ("based_on_version_id") REFERENCES "public"."process_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "process_versions" ADD CONSTRAINT "process_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "process_versions" ADD CONSTRAINT "process_versions_validated_by_users_id_fk" FOREIGN KEY ("validated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "process_versions" ADD CONSTRAINT "process_versions_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processes" ADD CONSTRAINT "processes_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processes" ADD CONSTRAINT "processes_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processes" ADD CONSTRAINT "processes_current_version_id_process_versions_id_fk" FOREIGN KEY ("current_version_id") REFERENCES "public"."process_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processes" ADD CONSTRAINT "processes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "step_dependencies" ADD CONSTRAINT "step_dependencies_step_id_process_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."process_steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "step_dependencies" ADD CONSTRAINT "step_dependencies_depends_on_step_id_process_steps_id_fk" FOREIGN KEY ("depends_on_step_id") REFERENCES "public"."process_steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "step_systems" ADD CONSTRAINT "step_systems_step_id_process_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."process_steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "step_systems" ADD CONSTRAINT "step_systems_system_id_systems_id_fk" FOREIGN KEY ("system_id") REFERENCES "public"."systems"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validation_events" ADD CONSTRAINT "validation_events_version_id_process_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."process_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validation_events" ADD CONSTRAINT "validation_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "business_rules_version_id_index" ON "business_rules" USING btree ("version_id");--> statement-breakpoint
CREATE INDEX "evidence_entity_type_entity_id_index" ON "evidence" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "evidence_version_id_index" ON "evidence" USING btree ("version_id");--> statement-breakpoint
CREATE INDEX "process_edges_version_id_index" ON "process_edges" USING btree ("version_id");--> statement-breakpoint
CREATE INDEX "process_steps_version_id_index" ON "process_steps" USING btree ("version_id");--> statement-breakpoint
CREATE INDEX "process_versions_process_id_index" ON "process_versions" USING btree ("process_id");--> statement-breakpoint
CREATE INDEX "validation_events_version_id_index" ON "validation_events" USING btree ("version_id");