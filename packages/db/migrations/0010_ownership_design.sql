CREATE TYPE "public"."practice_category" AS ENUM('ownership', 'segregation_of_duties', 'delegation_of_authority', 'control', 'compliance', 'efficiency');--> statement-breakpoint
ALTER TYPE "public"."design_change_type" ADD VALUE 'ownership';--> statement-breakpoint
CREATE TABLE "best_practices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"statement" text NOT NULL,
	"category" "practice_category" NOT NULL,
	"keywords" text[] DEFAULT '{}' NOT NULL,
	"department_id" uuid,
	"source" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "design_changes" ALTER COLUMN "created_at" SET DEFAULT clock_timestamp();--> statement-breakpoint
ALTER TABLE "process_steps" ADD COLUMN "accountable_role" text;--> statement-breakpoint
ALTER TABLE "process_steps" ADD COLUMN "consulted_roles" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "process_steps" ADD COLUMN "informed_roles" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "design_changes" ADD COLUMN "sources" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "best_practices" ADD CONSTRAINT "best_practices_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE cascade ON UPDATE no action;