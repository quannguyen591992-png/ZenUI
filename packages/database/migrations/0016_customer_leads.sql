CREATE TYPE "public"."lead_binding_status" AS ENUM('active', 'disabled');
--> statement-breakpoint
CREATE TYPE "public"."lead_submission_status" AS ENUM('new', 'contacted');
--> statement-breakpoint
CREATE TABLE "lead_form_bindings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "project_id" uuid NOT NULL,
  "share_link_id" uuid NOT NULL,
  "revision_id" uuid NOT NULL,
  "form_node_id" text NOT NULL,
  "page_route" text NOT NULL,
  "form_title" text NOT NULL,
  "form_snapshot" jsonb NOT NULL,
  "status" "lead_binding_status" DEFAULT 'active' NOT NULL,
  "disabled_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "lead_form_bindings_share_form_unique" UNIQUE("share_link_id", "form_node_id")
);
--> statement-breakpoint
CREATE TABLE "lead_submissions" (
  "id" uuid PRIMARY KEY NOT NULL,
  "workspace_id" uuid NOT NULL,
  "project_id" uuid NOT NULL,
  "binding_id" uuid NOT NULL,
  "share_link_id" uuid NOT NULL,
  "revision_id" uuid NOT NULL,
  "request_id" uuid NOT NULL,
  "form_node_id" text NOT NULL,
  "form_title" text NOT NULL,
  "status" "lead_submission_status" DEFAULT 'new' NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "ciphertext" text NOT NULL,
  "iv" text NOT NULL,
  "auth_tag" text NOT NULL,
  "key_version" integer NOT NULL,
  "received_at" timestamp with time zone NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "contacted_at" timestamp with time zone,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "lead_submissions_binding_request_unique" UNIQUE("binding_id", "request_id")
);
--> statement-breakpoint
ALTER TABLE "lead_form_bindings" ADD CONSTRAINT "lead_form_bindings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "lead_form_bindings" ADD CONSTRAINT "lead_form_bindings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "lead_form_bindings" ADD CONSTRAINT "lead_form_bindings_share_link_id_share_links_id_fk" FOREIGN KEY ("share_link_id") REFERENCES "public"."share_links"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "lead_form_bindings" ADD CONSTRAINT "lead_form_bindings_revision_id_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."revisions"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "lead_submissions" ADD CONSTRAINT "lead_submissions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "lead_submissions" ADD CONSTRAINT "lead_submissions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "lead_submissions" ADD CONSTRAINT "lead_submissions_binding_id_lead_form_bindings_id_fk" FOREIGN KEY ("binding_id") REFERENCES "public"."lead_form_bindings"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "lead_submissions" ADD CONSTRAINT "lead_submissions_share_link_id_share_links_id_fk" FOREIGN KEY ("share_link_id") REFERENCES "public"."share_links"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "lead_submissions" ADD CONSTRAINT "lead_submissions_revision_id_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."revisions"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "lead_form_bindings_project_idx" ON "lead_form_bindings" USING btree ("project_id");
--> statement-breakpoint
CREATE INDEX "lead_form_bindings_share_idx" ON "lead_form_bindings" USING btree ("share_link_id");
--> statement-breakpoint
CREATE INDEX "lead_form_bindings_revision_idx" ON "lead_form_bindings" USING btree ("revision_id");
--> statement-breakpoint
CREATE INDEX "lead_submissions_project_status_received_idx" ON "lead_submissions" USING btree ("project_id", "status", "received_at");
--> statement-breakpoint
CREATE INDEX "lead_submissions_project_received_idx" ON "lead_submissions" USING btree ("project_id", "received_at");
--> statement-breakpoint
CREATE INDEX "lead_submissions_expiry_idx" ON "lead_submissions" USING btree ("expires_at");
