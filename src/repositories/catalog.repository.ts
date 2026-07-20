import type { ItemType, Priority, Status } from "@prisma/client";
import { prisma } from "../lib/prisma";

/**
 * Sole Prisma import boundary for the read-only catalog (lookup) tables:
 * item types, priorities, and statuses. These are global reference data
 * (not user-scoped) — every query returns only `active` rows, ordered for
 * display so the client can populate selects directly.
 */

/** Active item types, display-ordered. */
export async function listActiveItemTypes(): Promise<ItemType[]> {
  return prisma.itemType.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

/** Active priorities, display-ordered. */
export async function listActivePriorities(): Promise<Priority[]> {
  return prisma.priority.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

/** Active statuses, display-ordered. */
export async function listActiveStatuses(): Promise<Status[]> {
  return prisma.status.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}
