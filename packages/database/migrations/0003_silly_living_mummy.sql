CREATE TYPE "public"."share_link_status" AS ENUM('active', 'disabled');--> statement-breakpoint
CREATE TABLE "share_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"revision_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"status" "share_link_status" DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone,
	"disabled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "share_links_slug_unique" UNIQUE("slug"),
	CONSTRAINT "share_links_project_request_unique" UNIQUE("project_id","request_id")
);
--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_revision_id_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "share_links_workspace_created_at_idx" ON "share_links" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "share_links_project_created_at_idx" ON "share_links" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "share_links_revision_id_idx" ON "share_links" USING btree ("revision_id");--> statement-breakpoint
CREATE INDEX "share_links_status_updated_at_idx" ON "share_links" USING btree ("status","updated_at");