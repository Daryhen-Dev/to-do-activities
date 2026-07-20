-- Enforce the mandatory Category -> List -> Task hierarchy at the database
-- level. Tasks previously allowed a null listId (loose tasks); this migration
-- removes any orphaned rows, makes listId required, and switches the foreign
-- key from ON DELETE SET NULL to ON DELETE CASCADE so a hard delete of a list
-- also removes its tasks. (Note: the app soft-deletes via deletedAt, so the
-- application-level cascade in softDeleteListWithTasks does the real work; this
-- FK cascade is a backstop for genuine hard deletes.)

-- 1. Remove orphaned tasks (dev-only data; the seed creates none).
DELETE FROM "planning_items" WHERE "listId" IS NULL;

-- 2. Enforce the mandatory hierarchy at the DB level.
ALTER TABLE "planning_items" ALTER COLUMN "listId" SET NOT NULL;

-- 3. Replace the SET NULL foreign key with ON DELETE CASCADE.
ALTER TABLE "planning_items" DROP CONSTRAINT "planning_items_listId_fkey";
ALTER TABLE "planning_items" ADD CONSTRAINT "planning_items_listId_fkey" FOREIGN KEY ("listId") REFERENCES "lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;
