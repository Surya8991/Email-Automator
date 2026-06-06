-- Migration 0011: add covering indices for hot paths added in 2026-06.
--
-- job_leads_user_source_idx: leadCount aggregation per source in the
--   /jobs UI was hitting bySource alone, missing the userId tenancy
--   filter. The compound index covers the common (userId, sourceId)
--   filter exactly.
--
-- job_leads_status_seen_idx: pruneOldLeads() scans every tick for
--   status IN ('new','ignored') AND seen_at < cutoff. Without this index
--   the prune does a full table scan as the leads table grows.
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `job_leads_user_source_idx` ON `job_leads` (`user_id`, `source_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `job_leads_status_seen_idx` ON `job_leads` (`status`, `seen_at`);
