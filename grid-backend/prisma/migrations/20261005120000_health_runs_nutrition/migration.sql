-- CreateTable
CREATE TABLE "health_daily" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "resting_hr" INTEGER,
    "hrv_ms" DOUBLE PRECISION,
    "spo2_avg" DOUBLE PRECISION,
    "spo2_min" DOUBLE PRECISION,
    "skin_temp_delta" DOUBLE PRECISION,
    "breathing_rate" DOUBLE PRECISION,
    "steps" INTEGER,
    "distance_m" DOUBLE PRECISION,
    "calories_total" INTEGER,
    "calories_active" INTEGER,
    "azm_minutes" INTEGER,
    "sedentary_min" INTEGER,
    "cardio_load" DOUBLE PRECISION,
    "readiness" INTEGER,
    "hr_zones" JSONB,
    "intraday" JSONB,
    "source" TEXT NOT NULL DEFAULT 'google_health',
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "health_daily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "health_sleep" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "minutes_asleep" INTEGER NOT NULL,
    "minutes_awake" INTEGER,
    "light_min" INTEGER,
    "deep_min" INTEGER,
    "rem_min" INTEGER,
    "efficiency" DOUBLE PRECISION,
    "score" INTEGER,
    "sleeping_hr" INTEGER,
    "stages" JSONB,
    "source" TEXT NOT NULL DEFAULT 'google_health',

    CONSTRAINT "health_sleep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "health_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "refresh_token_enc" TEXT NOT NULL,
    "scopes" TEXT,
    "last_sync_at" TIMESTAMP(3),
    "last_sync_status" TEXT,
    "last_sync_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "health_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "run_activities" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "name" TEXT,
    "distance_m" DOUBLE PRECISION NOT NULL,
    "moving_sec" INTEGER NOT NULL,
    "elapsed_sec" INTEGER,
    "avg_hr" INTEGER,
    "max_hr" INTEGER,
    "cadence" INTEGER,
    "elev_gain_m" DOUBLE PRECISION,
    "calories" INTEGER,
    "gear" TEXT,
    "splits" JSONB,
    "hr_zones" JSONB,
    "route" JSONB,
    "streams" JSONB,
    "file_hash" TEXT NOT NULL,
    "source_format" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "run_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meal_presets" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "serving" TEXT,
    "calories" INTEGER NOT NULL,
    "protein" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "carbs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fat" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "default_slot" TEXT,
    "color" TEXT,
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "use_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meal_presets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "slot" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "serving" TEXT,
    "qty" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "calories" INTEGER NOT NULL,
    "protein" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "carbs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fat" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "preset_id" TEXT,
    "preset_code" TEXT,
    "confidence" TEXT NOT NULL DEFAULT 'exact',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "food_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "water_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "ml" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "water_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nutrition_targets" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "calories" INTEGER NOT NULL,
    "protein" INTEGER NOT NULL,
    "carbs" INTEGER NOT NULL,
    "fat" INTEGER NOT NULL,
    "water_ml" INTEGER NOT NULL DEFAULT 3000,
    "plan" JSONB,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nutrition_targets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "health_daily_user_id_date_idx" ON "health_daily"("user_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "health_daily_user_id_date_key" ON "health_daily"("user_id", "date");

-- CreateIndex
CREATE INDEX "health_sleep_user_id_date_idx" ON "health_sleep"("user_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "health_sleep_user_id_start_time_key" ON "health_sleep"("user_id", "start_time");

-- CreateIndex
CREATE UNIQUE INDEX "health_tokens_user_id_key" ON "health_tokens"("user_id");

-- CreateIndex
CREATE INDEX "run_activities_user_id_date_idx" ON "run_activities"("user_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "run_activities_user_id_file_hash_key" ON "run_activities"("user_id", "file_hash");

-- CreateIndex
CREATE UNIQUE INDEX "meal_presets_user_id_code_key" ON "meal_presets"("user_id", "code");

-- CreateIndex
CREATE INDEX "food_logs_user_id_date_idx" ON "food_logs"("user_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "water_logs_user_id_date_key" ON "water_logs"("user_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "nutrition_targets_user_id_key" ON "nutrition_targets"("user_id");

-- AddForeignKey
ALTER TABLE "health_daily" ADD CONSTRAINT "health_daily_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "health_sleep" ADD CONSTRAINT "health_sleep_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "health_tokens" ADD CONSTRAINT "health_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run_activities" ADD CONSTRAINT "run_activities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_presets" ADD CONSTRAINT "meal_presets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_logs" ADD CONSTRAINT "food_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_logs" ADD CONSTRAINT "food_logs_preset_id_fkey" FOREIGN KEY ("preset_id") REFERENCES "meal_presets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "water_logs" ADD CONSTRAINT "water_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nutrition_targets" ADD CONSTRAINT "nutrition_targets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

