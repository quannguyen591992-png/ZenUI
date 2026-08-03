CREATE INDEX "deployments_status_lease_idx" ON "deployments" USING btree ("status","lease_expires_at");--> statement-breakpoint
CREATE INDEX "export_runs_status_lease_idx" ON "export_runs" USING btree ("status","lease_expires_at");--> statement-breakpoint
CREATE INDEX "generation_runs_status_lease_idx" ON "generation_runs" USING btree ("status","lease_expires_at");