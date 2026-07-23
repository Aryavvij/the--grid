-- CreateEnum
CREATE TYPE "MetricType" AS ENUM ('BINARY', 'QUANTITY', 'DURATION', 'SCALE', 'DERIVED');

-- CreateEnum
CREATE TYPE "LogSource" AS ENUM ('MANUAL', 'DERIVED', 'REPAIR');

-- AlterTable
ALTER TABLE "user_profiles" ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'UTC';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "is_sandbox" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sandbox_expires_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "metric_defs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "MetricType" NOT NULL,
    "unit" TEXT,
    "icon" TEXT,
    "color" TEXT,
    "target" DOUBLE PRECISION,
    "target_days" JSONB,
    "derived_source" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "metric_defs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metric_logs" (
    "id" TEXT NOT NULL,
    "def_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "logged_date" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "target_at_log" DOUBLE PRECISION,
    "score" DOUBLE PRECISION NOT NULL,
    "source" "LogSource" NOT NULL DEFAULT 'MANUAL',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "metric_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "metric_defs_user_id_archived_idx" ON "metric_defs"("user_id", "archived");

-- CreateIndex
CREATE INDEX "metric_logs_user_id_logged_date_idx" ON "metric_logs"("user_id", "logged_date");

-- CreateIndex
CREATE UNIQUE INDEX "metric_logs_def_id_logged_date_key" ON "metric_logs"("def_id", "logged_date");

-- AddForeignKey
ALTER TABLE "metric_defs" ADD CONSTRAINT "metric_defs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metric_logs" ADD CONSTRAINT "metric_logs_def_id_fkey" FOREIGN KEY ("def_id") REFERENCES "metric_defs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metric_logs" ADD CONSTRAINT "metric_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
