ALTER TYPE "public"."lead_binding_status" ADD VALUE 'pending' BEFORE 'active';
--> statement-breakpoint
ALTER TABLE "lead_form_bindings" ALTER COLUMN "share_link_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "lead_form_bindings" ADD COLUMN "deployment_id" uuid;
--> statement-breakpoint
ALTER TABLE "lead_form_bindings" ADD COLUMN "public_binding_id" text;
--> statement-breakpoint
UPDATE "lead_form_bindings"
SET "public_binding_id" = replace(gen_random_uuid()::text, '-', '')
WHERE "public_binding_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "lead_form_bindings" ALTER COLUMN "public_binding_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "lead_form_bindings" ADD CONSTRAINT "lead_form_bindings_deployment_id_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."deployments"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "lead_form_bindings" ADD CONSTRAINT "lead_form_bindings_publication_exactly_one_check" CHECK (num_nonnulls("share_link_id", "deployment_id") = 1);
--> statement-breakpoint
ALTER TABLE "lead_form_bindings" ADD CONSTRAINT "lead_form_bindings_public_binding_unique" UNIQUE("public_binding_id");
--> statement-breakpoint
ALTER TABLE "lead_form_bindings" ADD CONSTRAINT "lead_form_bindings_deployment_form_unique" UNIQUE("deployment_id", "form_node_id");
--> statement-breakpoint
CREATE INDEX "lead_form_bindings_deployment_idx" ON "lead_form_bindings" USING btree ("deployment_id");
--> statement-breakpoint
ALTER TABLE "lead_submissions" ALTER COLUMN "share_link_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "lead_submissions" ADD COLUMN "deployment_id" uuid;
--> statement-breakpoint
ALTER TABLE "lead_submissions" ADD CONSTRAINT "lead_submissions_deployment_id_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."deployments"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "lead_submissions" ADD CONSTRAINT "lead_submissions_publication_exactly_one_check" CHECK (num_nonnulls("share_link_id", "deployment_id") = 1);
--> statement-breakpoint
CREATE INDEX "lead_submissions_deployment_idx" ON "lead_submissions" USING btree ("deployment_id");
