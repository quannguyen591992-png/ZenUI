CREATE TYPE "public"."export_status" AS ENUM('queued', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "export_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "project_id" uuid NOT NULL,
  "created_by" uuid NOT NULL,
  "request_id" uuid NOT NULL,
  "expected_version" integer NOT NULL,
  "document_version" integer NOT NULL,
  "document_snapshot" jsonb NOT NULL,
  "status" "export_status" DEFAULT 'queued' NOT NULL,
  "artifact_key" text,
  "artifact_checksum" text,
  "artifact_bytes" integer,
  "artifact_content_type" text,
  "error_code" text,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "export_runs_project_request_unique" UNIQUE("project_id","request_id")
);--> statement-breakpoint
ALTER TABLE "export_runs" ADD CONSTRAINT "export_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_runs" ADD CONSTRAINT "export_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_runs" ADD CONSTRAINT "export_runs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "export_runs_workspace_created_at_idx" ON "export_runs" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "export_runs_project_created_at_idx" ON "export_runs" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "export_runs_status_updated_at_idx" ON "export_runs" USING btree ("status","updated_at");
