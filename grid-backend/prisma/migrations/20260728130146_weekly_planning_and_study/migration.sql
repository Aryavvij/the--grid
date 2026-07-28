-- CreateTable
CREATE TABLE "timetable_blocks" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "day_index" INTEGER NOT NULL,
    "start_hour" INTEGER NOT NULL,
    "end_hour" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timetable_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_tasks" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "day_index" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "done" BOOLEAN NOT NULL DEFAULT false,
    "deadline" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weekly_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "start_time" TEXT,
    "minutes" INTEGER NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "study_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "timetable_blocks_user_id_day_index_idx" ON "timetable_blocks"("user_id", "day_index");

-- CreateIndex
CREATE INDEX "weekly_tasks_user_id_day_index_idx" ON "weekly_tasks"("user_id", "day_index");

-- CreateIndex
CREATE INDEX "study_sessions_user_id_date_idx" ON "study_sessions"("user_id", "date");

-- CreateIndex
CREATE INDEX "study_sessions_user_id_category_idx" ON "study_sessions"("user_id", "category");

-- AddForeignKey
ALTER TABLE "timetable_blocks" ADD CONSTRAINT "timetable_blocks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_tasks" ADD CONSTRAINT "weekly_tasks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
