-- Read-only .ics subscription feed credential. iOS cannot present a cookie, so
-- the token in the URL is the credential; regenerating it revokes the old link.
-- Nullable + unique is safe: Postgres permits many NULLs under a unique index.
ALTER TABLE "users" ADD COLUMN "calendar_token" TEXT;
ALTER TABLE "users" ADD COLUMN "calendar_feed_opts" JSONB;
CREATE UNIQUE INDEX "users_calendar_token_key" ON "users"("calendar_token");
