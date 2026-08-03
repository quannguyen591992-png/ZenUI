ALTER TABLE "generation_runs" ALTER COLUMN "prompt" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "retained_cleanup_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "export_runs" ADD COLUMN "retained_cleanup_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "generation_runs" ADD COLUMN "retained_cleanup_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "share_links" ADD COLUMN "retained_cleanup_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "deployments_retention_idx" ON "deployments" USING btree ("status","completed_at","retained_cleanup_at");--> statement-breakpoint
CREATE INDEX "export_runs_retention_idx" ON "export_runs" USING btree ("status","completed_at","retained_cleanup_at");--> statement-breakpoint
CREATE INDEX "generation_runs_retention_idx" ON "generation_runs" USING btree ("status","completed_at","retained_cleanup_at");--> statement-breakpoint
CREATE INDEX "share_links_retention_idx" ON "share_links" USING btree ("status","disabled_at","retained_cleanup_at");