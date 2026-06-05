-- 0005: dedicated table for ephemeral SSE/poll progress events.
--
-- Before this, the latest progress event per user was upserted into the
-- `settings` table under key='PROGRESS_LATEST'. That mixed transient
-- real-time state with persistent user config: settings grew with stale
-- rows forever, the table was hit on every emit (~hundreds per import),
-- and config reads contended with high-frequency progress writes.
--
-- The new shape: one row per user holding only the most recent event
-- payload + timestamp. emit() writes a single row per user; readLatest()
-- reads that row directly. No journal, no TTL purge needed — the table
-- grows to (#users) rows max.
CREATE TABLE `progress_events` (
  `user_id` text PRIMARY KEY NOT NULL,
  `at` integer NOT NULL,
  `payload` text NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade
);
--> statement-breakpoint
-- Backfill from existing settings rows so users in the middle of an
-- import don't lose their progress bar on deploy. Safe to run repeatedly
-- because PRIMARY KEY enforces idempotency.
INSERT OR IGNORE INTO `progress_events` (`user_id`, `at`, `payload`)
SELECT
  `user_id`,
  CAST(json_extract(`value`, '$.at') AS INTEGER) AS `at`,
  `value` AS `payload`
FROM `settings`
WHERE `key` = 'PROGRESS_LATEST'
  AND json_valid(`value`) = 1
  AND CAST(json_extract(`value`, '$.at') AS INTEGER) IS NOT NULL;
--> statement-breakpoint
-- Drop the old settings rows. Idempotent — fine if there's nothing to delete.
DELETE FROM `settings` WHERE `key` = 'PROGRESS_LATEST';
