CREATE TABLE "process_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"level" integer NOT NULL,
	"parent_id" uuid,
	"department_id" uuid,
	"description" text,
	"source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "process_categories_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "process_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_process_id" uuid NOT NULL,
	"to_process_id" uuid NOT NULL,
	"from_step_key" text,
	"label" text,
	"provenance" "provenance" DEFAULT 'confirmed' NOT NULL,
	"reasoning" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "process_links_fromProcessId_toProcessId_unique" UNIQUE("from_process_id","to_process_id")
);
--> statement-breakpoint
ALTER TABLE "processes" ADD COLUMN "category_id" uuid;--> statement-breakpoint
ALTER TABLE "process_categories" ADD CONSTRAINT "process_categories_parent_id_process_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."process_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "process_categories" ADD CONSTRAINT "process_categories_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "process_links" ADD CONSTRAINT "process_links_from_process_id_processes_id_fk" FOREIGN KEY ("from_process_id") REFERENCES "public"."processes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "process_links" ADD CONSTRAINT "process_links_to_process_id_processes_id_fk" FOREIGN KEY ("to_process_id") REFERENCES "public"."processes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "process_links" ADD CONSTRAINT "process_links_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "process_categories_parent_id_index" ON "process_categories" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "process_links_to_process_id_index" ON "process_links" USING btree ("to_process_id");--> statement-breakpoint
ALTER TABLE "processes" ADD CONSTRAINT "processes_category_id_process_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."process_categories"("id") ON DELETE set null ON UPDATE no action;