-- AlterTable: additive recurrence columns (all nullable except the scalar-list
-- array, which defaults to an empty array so existing rows are unaffected).
ALTER TABLE "planning_items" ADD COLUMN     "recurrence_days" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "recurrence_time_minutes" INTEGER,
ADD COLUMN     "recurrence_interval" INTEGER,
ADD COLUMN     "recurrence_anchor" DATE;

-- CreateIndex
CREATE INDEX "planning_items_userId_itemTypeId_idx" ON "planning_items"("userId", "itemTypeId");

-- CreateTable
CREATE TABLE "habit_completions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planning_item_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "completed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "habit_completions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "habit_completions_userId_idx" ON "habit_completions"("userId");

-- CreateIndex
CREATE INDEX "habit_completions_planning_item_id_date_idx" ON "habit_completions"("planning_item_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "habit_completions_planning_item_id_date_key" ON "habit_completions"("planning_item_id", "date");

-- AddForeignKey
ALTER TABLE "habit_completions" ADD CONSTRAINT "habit_completions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "habit_completions" ADD CONSTRAINT "habit_completions_planning_item_id_fkey" FOREIGN KEY ("planning_item_id") REFERENCES "planning_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
