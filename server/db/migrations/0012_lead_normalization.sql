-- Migration 0012: add canonical salary/location/remote-scope/cross-key
-- columns to job_leads so the orchestrator can dedup the same role across
-- multiple boards (Greenhouse + LinkedIn + Indeed → one row).
--
-- salary_min/max: parsed from the raw `salary` string at insert time.
-- salary_ccy: 'INR' | 'USD' | 'EUR' | '' (best-effort detection).
-- salary_period: 'year' | 'month' | '' — multiply ×12 when comparing.
--
-- location_norm: alias-collapsed canonical city ('bangalore', 'mumbai', …)
-- remote_scope: 'office' | 'hybrid' | 'remote-in' | 'remote-global' | ''.
-- cross_key: sha1(companyNorm|titleNorm|locationNorm) for cross-board dedup.
--> statement-breakpoint
ALTER TABLE `job_leads` ADD COLUMN `salary_min` INTEGER;
--> statement-breakpoint
ALTER TABLE `job_leads` ADD COLUMN `salary_max` INTEGER;
--> statement-breakpoint
ALTER TABLE `job_leads` ADD COLUMN `salary_ccy` TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE `job_leads` ADD COLUMN `salary_period` TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE `job_leads` ADD COLUMN `location_norm` TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE `job_leads` ADD COLUMN `remote_scope` TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE `job_leads` ADD COLUMN `cross_key` TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `job_leads_cross_key_idx` ON `job_leads` (`user_id`, `cross_key`);
