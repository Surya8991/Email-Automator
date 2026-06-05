-- 0007: saved filter combos for /contacts.
--
-- A "view" is a named JSON snapshot of the filter URLSearchParams the
-- contacts page reads. Per-user, scoped (currently 'contacts'; the
-- column lets us reuse the table for other list pages later).

CREATE TABLE `saved_views` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` text NOT NULL,
  `scope` text NOT NULL,
  `name` text NOT NULL,
  `filters` text NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `saved_views_user_scope_idx` ON `saved_views` (`user_id`, `scope`);
