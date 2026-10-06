-- Work page projects: hand-set progress (0-100). Was sent by the app but had no column,
-- so every project edit failed and progress read 0% after a reload.
ALTER TABLE "projects" ADD COLUMN "progress" INTEGER NOT NULL DEFAULT 0;

-- Gym exercise registry (exercises per muscle group, typed-in PRs, muscle groups).
-- Lived only in the browser; now synced with the active split.
ALTER TABLE "gym_splits" ADD COLUMN "registry" JSONB;
