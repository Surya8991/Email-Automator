-- 0009: extra fields on job_leads — posted_at (job board posting date),
-- salary (text from board / AI), description (snippet for triage context).
-- All nullable / defaulted so existing rows get sensible values.

ALTER TABLE `job_leads` ADD COLUMN `posted_at` integer;
--> statement-breakpoint
ALTER TABLE `job_leads` ADD COLUMN `salary` text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE `job_leads` ADD COLUMN `description` text NOT NULL DEFAULT '';
