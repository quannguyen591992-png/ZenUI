ALTER TABLE "generation_runs"
  ADD COLUMN "proposal_feedback_codes" jsonb;
--> statement-breakpoint
ALTER TABLE "generation_runs"
  ADD COLUMN "proposal_lineage" jsonb;
