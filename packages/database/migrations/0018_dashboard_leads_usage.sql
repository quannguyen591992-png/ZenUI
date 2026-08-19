CREATE INDEX "lead_submissions_workspace_status_received_idx" ON "lead_submissions" USING btree ("workspace_id", "status", "received_at");
--> statement-breakpoint
ALTER TABLE "usage_records" ADD COLUMN "pricing_version" text;
--> statement-breakpoint
ALTER TABLE "usage_records" ADD COLUMN "input_rate_micro_usd_per_million" integer;
--> statement-breakpoint
ALTER TABLE "usage_records" ADD COLUMN "output_rate_micro_usd_per_million" integer;
--> statement-breakpoint
ALTER TABLE "usage_records" ADD COLUMN "input_estimated_micro_usd" integer;
--> statement-breakpoint
ALTER TABLE "usage_records" ADD COLUMN "output_estimated_micro_usd" integer;
--> statement-breakpoint
ALTER TABLE "usage_records" ADD COLUMN "total_estimated_micro_usd" integer;
--> statement-breakpoint
ALTER TABLE "usage_records" ADD COLUMN "currency" text;
--> statement-breakpoint
CREATE INDEX "usage_records_workspace_user_created_at_idx" ON "usage_records" USING btree ("workspace_id", "user_id", "created_at");
