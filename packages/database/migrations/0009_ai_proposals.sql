CREATE TYPE "public"."generation_delivery" AS ENUM('apply', 'proposal');--> statement-breakpoint
CREATE TYPE "public"."proposal_action" AS ENUM('request', 'refine', 'try-another');--> statement-breakpoint
CREATE TYPE "public"."proposal_status" AS ENUM('preparing', 'ready', 'accepted', 'discarded', 'superseded', 'cancelled', 'stale', 'invalid-scope', 'failed');--> statement-breakpoint
ALTER TABLE "generation_runs" ADD COLUMN "delivery" "generation_delivery" DEFAULT 'apply' NOT NULL;--> statement-breakpoint
ALTER TABLE "generation_runs" ADD COLUMN "proposal_action" "proposal_action";--> statement-breakpoint
ALTER TABLE "generation_runs" ADD COLUMN "proposal_status" "proposal_status";--> statement-breakpoint
ALTER TABLE "generation_runs" ADD COLUMN "previous_proposal_id" uuid;--> statement-breakpoint
ALTER TABLE "generation_runs" ADD COLUMN "proposal_scope" jsonb;--> statement-breakpoint
ALTER TABLE "generation_runs" ADD COLUMN "proposal_commands" jsonb;--> statement-breakpoint
ALTER TABLE "generation_runs" ADD COLUMN "proposed_document" jsonb;--> statement-breakpoint
ALTER TABLE "generation_runs" ADD COLUMN "proposal_summary" text;--> statement-breakpoint
ALTER TABLE "generation_runs" ADD COLUMN "proposal_accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "generation_runs" ADD COLUMN "proposal_discarded_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "generation_runs_project_proposal_status_idx" ON "generation_runs" USING btree ("project_id","proposal_status","updated_at");
