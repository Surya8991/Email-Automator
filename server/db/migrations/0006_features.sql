-- 0006: feature tables for Company Research (B1), Email Identities, and
-- Campaign A/B testing. Three additive changes in one migration so they
-- ship together with the corresponding service / UI code.

-- ─── B1 Company Research ────────────────────────────────────────────
-- Per-user company enrichment. Linked to contacts.company via a
-- case-insensitive name match (no FK because contacts.company is
-- free-text user input). One row per (user, company-name).
CREATE TABLE `companies` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` text NOT NULL,
  `name` text NOT NULL,
  `industry` text NOT NULL DEFAULT '',
  `hq` text NOT NULL DEFAULT '',
  `size` text NOT NULL DEFAULT '',
  `funding` text NOT NULL DEFAULT '',
  `glassdoor` text NOT NULL DEFAULT '',
  `tech_stack` text NOT NULL DEFAULT '',
  `salary_range` text NOT NULL DEFAULT '',
  `hiring_freq` text NOT NULL DEFAULT '',
  `notes` text NOT NULL DEFAULT '',
  `source_url` text NOT NULL DEFAULT '',
  `updated_at` integer NOT NULL DEFAULT 0,
  `created_at` integer NOT NULL DEFAULT 0,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `companies_user_idx` ON `companies` (`user_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `companies_user_name_idx` ON `companies` (`user_id`, `name`);
--> statement-breakpoint

-- ─── Email Identities ──────────────────────────────────────────────
-- A user can have multiple "from:" addresses (personal vs work, or
-- separate role personas). One of them is the default; senders pick
-- the identity per template/draft if they want non-default.
-- SMTP credentials are encrypted at rest like settings.SMTP_PASS via
-- lib/crypto.ts. The legacy single per-user SMTP under settings.SMTP_*
-- is preserved as the "default" identity for back-compat; this table
-- holds additional identities and is read-empty for users who haven't
-- added a second one.
CREATE TABLE `email_identities` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` text NOT NULL,
  `label` text NOT NULL,                          -- short display name e.g. "Work"
  `from_name` text NOT NULL DEFAULT '',
  `from_email` text NOT NULL,
  `smtp_host` text NOT NULL,
  `smtp_port` integer NOT NULL DEFAULT 587,
  `smtp_user` text NOT NULL,
  `smtp_pass_enc` text NOT NULL DEFAULT '',       -- enc:v1:… via lib/crypto.ts
  `is_default` integer NOT NULL DEFAULT 0,        -- 0 or 1
  `created_at` integer NOT NULL DEFAULT 0,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `email_identities_user_idx` ON `email_identities` (`user_id`);
--> statement-breakpoint

-- ─── Campaign step variants (A/B testing) ─────────────────────────
-- A campaign step can have multiple template variants; the scheduler
-- splits enrollments across them by hash(contactId) % weight-sum so the
-- same contact always sees the same variant on every replay (no double
-- exposure). When no rows exist for a step, scheduler falls back to
-- campaignSteps.templateId (back-compat: existing campaigns work as-is).
CREATE TABLE `campaign_step_variants` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `step_id` integer NOT NULL,
  `template_id` integer,                         -- nullable so a deleted template doesn't cascade-nuke the variant row
  `weight` integer NOT NULL DEFAULT 1,           -- relative weight in the split
  `label` text NOT NULL DEFAULT '',              -- "A", "B", "Subject test 1", …
  FOREIGN KEY (`step_id`) REFERENCES `campaign_steps`(`id`) ON DELETE cascade,
  FOREIGN KEY (`template_id`) REFERENCES `templates`(`id`) ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `campaign_step_variants_step_idx` ON `campaign_step_variants` (`step_id`);
