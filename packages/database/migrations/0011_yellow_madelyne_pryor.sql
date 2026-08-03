CREATE TYPE "public"."asset_scope" AS ENUM('project', 'workspace');
--> statement-breakpoint
CREATE TYPE "public"."asset_source" AS ENUM('upload', 'pexels', 'derivative');
--> statement-breakpoint
CREATE TYPE "public"."asset_status" AS ENUM('queued', 'importing', 'ready', 'failed');
--> statement-breakpoint
CREATE TABLE "assets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "project_id" uuid,
  "created_by" uuid NOT NULL,
  "request_id" uuid NOT NULL,
  "scope" "asset_scope" NOT NULL,
  "source" "asset_source" NOT NULL,
  "status" "asset_status" DEFAULT 'queued' NOT NULL,
  "parent_asset_id" uuid,
  "transform" jsonb,
  "source_object_key" text,
  "object_key" text,
  "content_type" text,
  "width" integer,
  "height" integer,
  "bytes" integer,
  "checksum" text,
  "default_alt" text DEFAULT '' NOT NULL,
  "attribution" jsonb,
  "provider_result_id" text,
  "error_code" text,
  "lease_expires_at" timestamp with time zone,
  "last_heartbeat_at" timestamp with time zone,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "archived_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "assets_workspace_request_unique" UNIQUE("workspace_id", "request_id"),
  CONSTRAINT "assets_scope_project_check" CHECK (
    ("scope" = 'project' AND "project_id" IS NOT NULL)
    OR ("scope" = 'workspace' AND "project_id" IS NULL)
  ),
  CONSTRAINT "assets_source_parent_check" CHECK (
    ("source" = 'derivative' AND "parent_asset_id" IS NOT NULL AND "transform" IS NOT NULL)
    OR ("source" <> 'derivative' AND "parent_asset_id" IS NULL AND "transform" IS NULL)
  ),
  CONSTRAINT "assets_ready_metadata_check" CHECK (
    ("status" = 'ready' AND "object_key" IS NOT NULL AND "content_type" = 'image/webp' AND "width" > 0 AND "height" > 0 AND "bytes" > 0 AND "checksum" IS NOT NULL AND "error_code" IS NULL)
    OR ("status" <> 'ready' AND "object_key" IS NULL AND "content_type" IS NULL AND "width" IS NULL AND "height" IS NULL AND "bytes" IS NULL AND "checksum" IS NULL)
  ),
  CONSTRAINT "assets_failed_error_check" CHECK (("status" = 'failed') = ("error_code" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "brand_kits" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "name" text NOT NULL,
  "logo_asset_id" uuid,
  "primary_color" text NOT NULL,
  "background_color" text NOT NULL,
  "text_color" text NOT NULL,
  "heading_font" text NOT NULL,
  "body_font" text NOT NULL,
  "updated_by" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "brand_kits_workspace_unique" UNIQUE("workspace_id"),
  CONSTRAINT "brand_kits_version_check" CHECK ("version" > 0)
);
--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_parent_asset_id_assets_id_fk" FOREIGN KEY ("parent_asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "brand_kits" ADD CONSTRAINT "brand_kits_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "brand_kits" ADD CONSTRAINT "brand_kits_logo_asset_id_assets_id_fk" FOREIGN KEY ("logo_asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "brand_kits" ADD CONSTRAINT "brand_kits_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "assets_workspace_created_at_idx" ON "assets" USING btree ("workspace_id", "created_at");
--> statement-breakpoint
CREATE INDEX "assets_project_created_at_idx" ON "assets" USING btree ("project_id", "created_at");
--> statement-breakpoint
CREATE INDEX "assets_status_lease_idx" ON "assets" USING btree ("status", "lease_expires_at");
--> statement-breakpoint
CREATE INDEX "brand_kits_workspace_updated_at_idx" ON "brand_kits" USING btree ("workspace_id", "updated_at");
