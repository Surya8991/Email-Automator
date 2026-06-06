-- Migration 0010: add missing indices for common filter columns
--
-- contacts.status and contacts.email_status are filtered on every
-- /contacts page load; without an index the scheduler and list queries
-- do full-table scans.
--
-- job_sources.active is filtered by tickAll() on every cron tick.
-- job_leads.source_id is queried when deleting a source's leads.
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `contacts_status_idx` ON `contacts` (`user_id`, `status`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `contacts_email_status_idx` ON `contacts` (`user_id`, `email_status`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `job_sources_active_idx` ON `job_sources` (`active`, `user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `job_leads_source_idx` ON `job_leads` (`source_id`);
