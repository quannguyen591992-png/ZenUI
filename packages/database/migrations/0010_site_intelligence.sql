ALTER TABLE "generation_runs" ADD COLUMN "proposal_intent" text;
--> statement-breakpoint
ALTER TABLE "generation_runs" ADD COLUMN "proposal_constraints" jsonb;
--> statement-breakpoint
CREATE TABLE "site_intelligence_reviews" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "project_id" uuid NOT NULL,
  "created_by" uuid NOT NULL,
  "request_id" uuid NOT NULL,
  "document_version" integer NOT NULL,
  "policy_version" text NOT NULL,
  "document_fingerprint" text NOT NULL,
  "brief_fingerprint" text NOT NULL,
  "analysis_snapshot" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "site_intelligence_reviews_project_request_unique" UNIQUE("project_id","request_id")
);
--> statement-breakpoint
CREATE TABLE "site_intelligence_dismissals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "project_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "finding_fingerprint" text NOT NULL,
  "evidence_fingerprint" text NOT NULL,
  "policy_version" text NOT NULL,
  "dismissed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "restored_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "site_intelligence_dismissals_actor_finding_unique" UNIQUE("project_id","user_id","finding_fingerprint")
);
--> statement-breakpoint
ALTER TABLE "site_intelligence_reviews" ADD CONSTRAINT "site_intelligence_reviews_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "site_intelligence_reviews" ADD CONSTRAINT "site_intelligence_reviews_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "site_intelligence_reviews" ADD CONSTRAINT "site_intelligence_reviews_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "site_intelligence_dismissals" ADD CONSTRAINT "site_intelligence_dismissals_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "site_intelligence_dismissals" ADD CONSTRAINT "site_intelligence_dismissals_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "site_intelligence_dismissals" ADD CONSTRAINT "site_intelligence_dismissals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "site_intelligence_reviews_project_version_created_idx" ON "site_intelligence_reviews" USING btree ("project_id","document_version","created_at");
--> statement-breakpoint
CREATE INDEX "site_intelligence_reviews_workspace_created_idx" ON "site_intelligence_reviews" USING btree ("workspace_id","created_at");
--> statement-breakpoint
CREATE INDEX "site_intelligence_dismissals_actor_active_idx" ON "site_intelligence_dismissals" USING btree ("project_id","user_id","restored_at");
