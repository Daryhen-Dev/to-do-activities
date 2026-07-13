-- Enforce the single-default invariant at the database level. Prisma's
-- schema DSL cannot express a partial unique index, so this is hand-written
-- rather than generated. At most one row per table may have is_default = true.
CREATE UNIQUE INDEX "item_types_single_default" ON "item_types" ("is_default") WHERE "is_default" = true;
CREATE UNIQUE INDEX "statuses_single_default" ON "statuses" ("is_default") WHERE "is_default" = true;
