CREATE TYPE "public"."deployment_status" AS ENUM('queued', 'uploading', 'building', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."deployment_target" AS ENUM('preview', 'production');--> statement-breakpoint
CREATE TYPE "public"."provider_connection_status" AS ENUM('connected', 'disconnected', 'disabled');--> statement-breakpoint
CREATE TABLE "deployments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"revision_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"target" "deployment_target" NOT NULL,
	"status" "deployment_status" DEFAULT 'queued' NOT NULL,
	"artifact_key" text,
	"artifact_checksum" text,
	"artifact_bytes" integer,
	"artifact_content_type" text,
	"provider_project_name" text,
	"provider_deployment_id" text,
	"url" text,
	"error_code" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deployments_provider_deployment_id_unique" UNIQUE("provider_deployment_id"),
	CONSTRAINT "deployments_project_request_unique" UNIQUE("project_id","request_id")
);
--> statement-breakpoint
CREATE TABLE "provider_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"provider" text NOT NULL,
	"configuration_id" text NOT NULL,
	"team_id" text,
	"scopes" jsonb NOT NULL,
	"status" "provider_connection_status" DEFAULT 'connected' NOT NULL,
	"credential_ciphertext" text,
	"credential_iv" text,
	"credential_auth_tag" text,
	"credential_key_version" integer,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"disconnected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_connections_configuration_id_unique" UNIQUE("configuration_id"),
	CONSTRAINT "provider_connections_workspace_provider_unique" UNIQUE("workspace_id","provider")
);
--> statement-breakpoint
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_revision_id_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_connection_id_provider_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."provider_connections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_connections" ADD CONSTRAINT "provider_connections_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_connections" ADD CONSTRAINT "provider_connections_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deployments_workspace_created_at_idx" ON "deployments" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "deployments_project_created_at_idx" ON "deployments" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "deployments_revision_id_idx" ON "deployments" USING btree ("revision_id");--> statement-breakpoint
CREATE INDEX "deployments_status_updated_at_idx" ON "deployments" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "provider_connections_workspace_status_idx" ON "provider_connections" USING btree ("workspace_id","status");