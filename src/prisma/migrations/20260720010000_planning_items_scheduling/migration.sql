-- Add a scheduling model to planning items: a start instant, an optional end
-- instant, and an all-day flag. These are separate from the existing `due_at`
-- deadline. Additive and non-destructive — existing rows default to no schedule
-- (`start_at`/`end_at` NULL, `all_day` false).

ALTER TABLE "planning_items"
  ADD COLUMN "start_at" TIMESTAMP(3),
  ADD COLUMN "end_at"   TIMESTAMP(3),
  ADD COLUMN "all_day"  BOOLEAN NOT NULL DEFAULT false;

-- Supports the category calendar range query (filtering by start_at window).
CREATE INDEX "planning_items_start_at_idx" ON "planning_items" ("start_at");
