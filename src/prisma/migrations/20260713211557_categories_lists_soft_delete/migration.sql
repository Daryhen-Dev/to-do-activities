-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "deleted_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "lists" ADD COLUMN     "deleted_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "categories_userId_deleted_at_idx" ON "categories"("userId", "deleted_at");

-- CreateIndex
CREATE INDEX "lists_categoryId_deleted_at_idx" ON "lists"("categoryId", "deleted_at");

-- Enforce name uniqueness scoped to ACTIVE (non-deleted) rows only. Prisma's
-- schema DSL cannot express a partial unique index, so this is hand-written
-- rather than generated — same technique as
-- `migrations/20260713005908_single_default_partial_unique`. A plain
-- `@@unique` would let an archived row block re-creating the same name.
CREATE UNIQUE INDEX "categories_user_name_active" ON "categories" ("userId", "name") WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "lists_category_name_active" ON "lists" ("categoryId", "name") WHERE "deleted_at" IS NULL;
