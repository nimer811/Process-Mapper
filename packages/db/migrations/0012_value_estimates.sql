CREATE TYPE "public"."estimate_source" AS ENUM('owner', 'ai');--> statement-breakpoint
CREATE TABLE "value_estimates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"step_id" uuid,
	"source" "estimate_source" NOT NULL,
	"effort_minutes" integer,
	"duration_minutes" integer,
	"volume_per_month" real,
	"reasoning" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "value_estimates" ADD CONSTRAINT "value_estimates_version_id_process_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."process_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "value_estimates" ADD CONSTRAINT "value_estimates_step_id_process_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."process_steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "value_estimates_unique" ON "value_estimates" USING btree ("version_id","step_id","source") NULLS NOT DISTINCT;