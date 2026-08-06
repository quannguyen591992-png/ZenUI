ALTER TABLE "generation_runs" ADD COLUMN "proposal_media_review" jsonb;
ALTER TABLE "generation_runs" ADD COLUMN "original_request" text;
UPDATE "generation_runs" SET "original_request" = "prompt" WHERE "delivery" = 'proposal' AND "prompt" IS NOT NULL;
