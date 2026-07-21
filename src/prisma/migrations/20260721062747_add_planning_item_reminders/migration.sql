-- AlterTable
ALTER TABLE "planning_items" ADD COLUMN     "remind_at" TIMESTAMP(3),
ADD COLUMN     "reminder_seen_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "planning_items_userId_remind_at_idx" ON "planning_items"("userId", "remind_at");
