CREATE TYPE "public"."design_direction_status" AS ENUM('queued', 'running', 'completed', 'failed', 'cancelled', 'superseded', 'accepted');--> statement-breakpoint
CREATE TYPE "public"."project_creation_state" AS ENUM('onboarding', 'accepted');--> statement-breakpoint
CREATE TABLE "design_direction_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"expected_version" integer NOT NULL,
	"round" integer DEFAULT 0 NOT NULL,
	"brief_snapshot" jsonb NOT NULL,
	"status" "design_direction_status" DEFAULT 'queued' NOT NULL,
	"provider" text,
	"model" text,
	"prompt_version" text,
	"error_code" text,
	"content_blueprint" jsonb,
	"direction_snapshots" jsonb,
	"selected_direction_id" text,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"document_version" integer,
	"revision_id" uuid,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"lease_expires_at" timestamp with time zone,
	"last_heartbeat_at" timestamp with time zone,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"retained_cleanup_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "design_direction_runs_project_request_unique" UNIQUE("project_id","request_id")
);
--> statement-breakpoint
CREATE TABLE "project_briefs" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brief_json" jsonb NOT NULL,
	"updated_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "usage_records" ALTER COLUMN "generation_run_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "creation_state" "project_creation_state" DEFAULT 'accepted' NOT NULL;--> statement-breakpoint
ALTER TABLE "revisions" ADD COLUMN "design_direction_run_id" uuid;--> statement-breakpoint
ALTER TABLE "usage_records" ADD COLUMN "design_direction_run_id" uuid;--> statement-breakpoint
ALTER TABLE "design_direction_runs" ADD CONSTRAINT "design_direction_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_direction_runs" ADD CONSTRAINT "design_direction_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_direction_runs" ADD CONSTRAINT "design_direction_runs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_briefs" ADD CONSTRAINT "project_briefs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_briefs" ADD CONSTRAINT "project_briefs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_briefs" ADD CONSTRAINT "project_briefs_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "design_direction_runs_workspace_created_at_idx" ON "design_direction_runs" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "design_direction_runs_project_created_at_idx" ON "design_direction_runs" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "design_direction_runs_status_lease_idx" ON "design_direction_runs" USING btree ("status","lease_expires_at");--> statement-breakpoint
CREATE INDEX "project_briefs_workspace_updated_at_idx" ON "project_briefs" USING btree ("workspace_id","updated_at");--> statement-breakpoint
ALTER TABLE "revisions" ADD CONSTRAINT "revisions_design_direction_run_id_design_direction_runs_id_fk" FOREIGN KEY ("design_direction_run_id") REFERENCES "public"."design_direction_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_design_direction_run_id_design_direction_runs_id_fk" FOREIGN KEY ("design_direction_run_id") REFERENCES "public"."design_direction_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_design_direction_run_unique" UNIQUE("design_direction_run_id");