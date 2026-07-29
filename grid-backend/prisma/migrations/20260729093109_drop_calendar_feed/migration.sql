-- Calendar subscription feed removed. These columns only ever held feed tokens
-- and layer toggles, which are meaningless without the feature; no user content
-- is lost by dropping them.
DROP INDEX IF EXISTS "users_calendar_token_key";
ALTER TABLE "users" DROP COLUMN IF EXISTS "calendar_token";
ALTER TABLE "users" DROP COLUMN IF EXISTS "calendar_feed_opts";
