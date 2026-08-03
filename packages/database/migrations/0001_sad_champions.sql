CREATE TYPE "public"."generation_mode" AS ENUM('generate', 'edit-page', 'edit-selection');--> statement-breakpoint
CREATE TYPE "public"."generation_status" AS ENUM('queued', 'running', 'repairing', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "generation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"mode" "generation_mode" NOT NULL,
	"selected_node_id" text,
	"prompt" text NOT NULL,
	"expected_version" integer NOT NULL,
	"status" "generation_status" DEFAULT 'queued' NOT NULL,
	"provider" text,
	"model" text,
	"prompt_version" text,
	"repair_count" integer DEFAULT 0 NOT NULL,
	"error_code" text,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"document_version" integer,
	"revision_id" uuid,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "generation_runs_project_request_unique" UNIQUE("project_id","request_id")
);
--> statement-breakpoint
CREATE TABLE "usage_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"generation_run_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"total_tokens" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usage_records_generation_run_unique" UNIQUE("generation_run_id")
);
--> statement-breakpoint
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_generation_run_id_generation_runs_id_fk" FOREIGN KEY ("generation_run_id") REFERENCES "public"."generation_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "generation_runs_workspace_created_at_idx" ON "generation_runs" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "generation_runs_project_created_at_idx" ON "generation_runs" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "generation_runs_status_updated_at_idx" ON "generation_runs" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "usage_records_workspace_created_at_idx" ON "usage_records" USING btree ("workspace_id","created_at");--> statement-breakpoint
ALTER TABLE "revisions" ADD CONSTRAINT "revisions_generation_run_id_generation_runs_id_fk" FOREIGN KEY ("generation_run_id") REFERENCES "public"."generation_runs"("id") ON DELETE set null ON UPDATE no action;