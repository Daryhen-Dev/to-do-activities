import type { ItemType, Priority, Status } from "@prisma/client";
import {
  listActiveItemTypes,
  listActivePriorities,
  listActiveStatuses,
} from "../repositories/catalog.repository";

/**
 * Read-only catalog vertical. These lookup tables carry no per-user
 * business rules, so the service is a thin passthrough — it exists to keep
 * the route -> service -> repository boundary intact (routes never import a
 * repository or Prisma directly) and to give future rules a home.
 */

export async function listItemTypes(): Promise<ItemType[]> {
  return listActiveItemTypes();
}

export async function listPriorities(): Promise<Priority[]> {
  return listActivePriorities();
}

export async function listStatuses(): Promise<Status[]> {
  return listActiveStatuses();
}
