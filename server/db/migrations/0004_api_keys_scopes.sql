-- 0004: add scopes column to api_keys
-- Empty string = "all scopes" so existing pre-0004 keys keep working
-- unchanged. New keys created via the UI default to read+write contacts.
ALTER TABLE `api_keys` ADD `scopes` text DEFAULT '' NOT NULL;
