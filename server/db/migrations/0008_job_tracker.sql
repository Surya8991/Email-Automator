-- 0008: job-tracker tables. Per-user tracked URLs + the leads we
-- extracted from them. Fingerprint uniqueness scoped by source so the
-- same title across different sources isn't deduped away.

CREATE TABLE `job_sources` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` text NOT NULL,
  `label` text NOT NULL,
  `url` text NOT NULL,
  `keywords` text NOT NULL DEFAULT '',
  `last_fetched_at` integer,
  `last_status` text NOT NULL DEFAULT '',
  `last_error` text NOT NULL DEFAULT '',
  `active` integer NOT NULL DEFAULT 1,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `job_sources_user_idx` ON `job_sources` (`user_id`);
--> statement-breakpoint
CREATE TABLE `job_leads` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` text NOT NULL,
  `source_id` integer NOT NULL,
  `fingerprint` text NOT NULL,
  `title` text NOT NULL,
  `company` text NOT NULL DEFAULT '',
  `link` text NOT NULL DEFAULT '',
  `location` text NOT NULL DEFAULT '',
  `status` text NOT NULL DEFAULT 'new',
  `notes` text NOT NULL DEFAULT '',
  `seen_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade,
  FOREIGN KEY (`source_id`) REFERENCES `job_sources`(`id`) ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `job_leads_user_idx` ON `job_leads` (`user_id`, `status`, `seen_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `job_leads_fingerprint_idx` ON `job_leads` (`source_id`, `fingerprint`);
