-- AlterTable
ALTER TABLE "planning_items" ADD COLUMN     "objective_end_at" TIMESTAMP(3),
ADD COLUMN     "objective_start_at" TIMESTAMP(3),
ADD COLUMN     "progress" INTEGER;

-- CreateIndex
CREATE INDEX "planning_items_userId_objective_end_at_idx" ON "planning_items"("userId", "objective_end_at");
