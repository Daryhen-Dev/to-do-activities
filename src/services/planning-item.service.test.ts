import type { List, PlanningItem } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEV_USER_ID } from "../lib/dev-user";
import { NotFoundError } from "../lib/errors";

// getCurrentUserId now reads the Auth.js session; stub it so these stay
// true unit tests isolated from auth.
vi.mock("../lib/current-user", () => ({
  getCurrentUserId: vi.fn().mockResolvedValue("dev-user-000000000000000000000"),
}));

vi.mock("../repositories/planning-item.repository", () => ({
  createPlanningItem: vi.fn(),
  findDefaultItemTypeId: vi.fn(),
  findDefaultStatusId: vi.fn(),
  findOwnedPlanningItem: vi.fn(),
  listPlanningItemsByUser: vi.fn(),
  softDeletePlanningItem: vi.fn(),
  updatePlanningItem: vi.fn(),
}));

// The service prechecks list ownership through the list repository before
// creating a task (mandatory hierarchy) — mock it here.
vi.mock("../repositories/list.repository", () => ({
  findOwnedList: vi.fn(),
}));

import { findOwnedList } from "../repositories/list.repository";
import {
  createPlanningItem,
  findDefaultItemTypeId,
  findDefaultStatusId,
  findOwnedPlanningItem,
  listPlanningItemsByUser,
  softDeletePlanningItem,
  updatePlanningItem,
} from "../repositories/planning-item.repository";
import {
  createPlanningItemForCurrentUser,
  deletePlanningItemForCurrentUser,
  getPlanningItemForCurrentUser,
  listPlanningItemsForCurrentUser,
  updatePlanningItemForCurrentUser,
} from "./planning-item.service";

const mockCreate = vi.mocked(createPlanningItem);
const mockFindDefaultItemTypeId = vi.mocked(findDefaultItemTypeId);
const mockFindDefaultStatusId = vi.mocked(findDefaultStatusId);
const mockFindOwned = vi.mocked(findOwnedPlanningItem);
const mockListByUser = vi.mocked(listPlanningItemsByUser);
const mockSoftDelete = vi.mocked(softDeletePlanningItem);
const mockUpdate = vi.mocked(updatePlanningItem);
const mockFindOwnedList = vi.mocked(findOwnedList);

const ownedList = { id: "list-1" } as List;

describe("createPlanningItemForCurrentUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves default statusId and itemTypeId when the payload omits them", async () => {
    mockFindDefaultStatusId.mockResolvedValue("status-default");
    mockFindDefaultItemTypeId.mockResolvedValue("item-type-default");
    mockFindOwnedList.mockResolvedValue(ownedList);
    const created = { id: "item-1" } as PlanningItem;
    mockCreate.mockResolvedValue(created);

    const result = await createPlanningItemForCurrentUser({
      title: "Buy milk",
      listId: "list-1",
    });

    expect(mockCreate).toHaveBeenCalledWith({
      userId: DEV_USER_ID,
      title: "Buy milk",
      description: null,
      listId: "list-1",
      itemTypeId: "item-type-default",
      priorityId: null,
      statusId: "status-default",
      dueAt: null,
    });
    expect(result).toBe(created);
  });

  it("uses explicit statusId/itemTypeId from the payload instead of resolving defaults", async () => {
    mockFindOwnedList.mockResolvedValue(ownedList);
    const created = { id: "item-1" } as PlanningItem;
    mockCreate.mockResolvedValue(created);

    await createPlanningItemForCurrentUser({
      title: "Buy milk",
      listId: "list-1",
      statusId: "status-explicit",
      itemTypeId: "item-type-explicit",
    });

    expect(mockFindDefaultStatusId).not.toHaveBeenCalled();
    expect(mockFindDefaultItemTypeId).not.toHaveBeenCalled();
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        statusId: "status-explicit",
        itemTypeId: "item-type-explicit",
      }),
    );
  });

  it("throws NotFoundError when no default status is seeded", async () => {
    mockFindDefaultStatusId.mockResolvedValue(null);

    await expect(
      createPlanningItemForCurrentUser({ title: "Buy milk", listId: "list-1" }),
    ).rejects.toThrow(NotFoundError);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("throws NotFoundError when no default item type is seeded", async () => {
    mockFindDefaultStatusId.mockResolvedValue("status-default");
    mockFindDefaultItemTypeId.mockResolvedValue(null);

    await expect(
      createPlanningItemForCurrentUser({ title: "Buy milk", listId: "list-1" }),
    ).rejects.toThrow(NotFoundError);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  // Requirement 1.2: creating a task under a list the caller does not own (or
  // that does not exist) yields a precise not-found and never persists.
  it("throws NotFoundError when the target list is absent or not owned", async () => {
    mockFindDefaultStatusId.mockResolvedValue("status-default");
    mockFindDefaultItemTypeId.mockResolvedValue("item-type-default");
    mockFindOwnedList.mockResolvedValue(null);

    await expect(
      createPlanningItemForCurrentUser({
        title: "Buy milk",
        listId: "not-owned",
      }),
    ).rejects.toThrow(NotFoundError);
    expect(mockFindOwnedList).toHaveBeenCalledWith(DEV_USER_ID, "not-owned");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  // Requirement 1.3: a valid owned list is persisted with the created task.
  it("persists the task with the provided owned listId", async () => {
    mockFindDefaultStatusId.mockResolvedValue("status-default");
    mockFindDefaultItemTypeId.mockResolvedValue("item-type-default");
    mockFindOwnedList.mockResolvedValue(ownedList);
    mockCreate.mockResolvedValue({ id: "item-1", listId: "list-1" } as PlanningItem);

    await createPlanningItemForCurrentUser({
      title: "Buy milk",
      listId: "list-1",
    });

    expect(mockFindOwnedList).toHaveBeenCalledWith(DEV_USER_ID, "list-1");
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ listId: "list-1" }),
    );
  });

  it("propagates the NotFoundError the repository throws for an unknown FK reference", async () => {
    mockFindDefaultStatusId.mockResolvedValue("status-default");
    mockFindDefaultItemTypeId.mockResolvedValue("item-type-default");
    mockFindOwnedList.mockResolvedValue(ownedList);
    mockCreate.mockRejectedValue(
      new NotFoundError(
        "One or more referenced ids (listId, itemTypeId, priorityId, statusId) do not exist.",
      ),
    );

    await expect(
      createPlanningItemForCurrentUser({
        title: "Buy milk",
        listId: "list-1",
        priorityId: "does-not-exist",
      }),
    ).rejects.toThrow(NotFoundError);
  });
});

describe("listPlanningItemsForCurrentUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("scopes the list to the current (stub) user", async () => {
    const items = [{ id: "item-1" }, { id: "item-2" }] as PlanningItem[];
    mockListByUser.mockResolvedValue(items);

    const result = await listPlanningItemsForCurrentUser();

    expect(mockListByUser).toHaveBeenCalledWith(DEV_USER_ID);
    expect(result).toBe(items);
  });
});

describe("getPlanningItemForCurrentUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the owned item scoped to the current user", async () => {
    const item = { id: "item-1" } as PlanningItem;
    mockFindOwned.mockResolvedValue(item);

    const result = await getPlanningItemForCurrentUser("item-1");

    expect(mockFindOwned).toHaveBeenCalledWith(DEV_USER_ID, "item-1");
    expect(result).toBe(item);
  });

  it("throws NotFoundError when the item is not found or not owned", async () => {
    mockFindOwned.mockResolvedValue(null);

    await expect(
      getPlanningItemForCurrentUser("missing"),
    ).rejects.toThrow(NotFoundError);
  });
});

describe("updatePlanningItemForCurrentUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("prechecks ownership and forwards only the provided fields", async () => {
    mockFindOwned.mockResolvedValue({ id: "item-1" } as PlanningItem);
    const updated = { id: "item-1", title: "New title" } as PlanningItem;
    mockUpdate.mockResolvedValue(updated);

    const result = await updatePlanningItemForCurrentUser("item-1", {
      title: "New title",
      statusId: "status-2",
    });

    expect(mockFindOwned).toHaveBeenCalledWith(DEV_USER_ID, "item-1");
    expect(mockUpdate).toHaveBeenCalledWith("item-1", {
      title: "New title",
      statusId: "status-2",
    });
    expect(result).toBe(updated);
  });

  it("moves a task to another list by forwarding the new listId", async () => {
    mockFindOwned.mockResolvedValue({ id: "item-1" } as PlanningItem);
    mockUpdate.mockResolvedValue({ id: "item-1", listId: "list-2" } as PlanningItem);

    await updatePlanningItemForCurrentUser("item-1", { listId: "list-2" });

    expect(mockUpdate).toHaveBeenCalledWith("item-1", { listId: "list-2" });
  });

  it("passes an explicit null through to clear a nullable field", async () => {
    mockFindOwned.mockResolvedValue({ id: "item-1" } as PlanningItem);
    mockUpdate.mockResolvedValue({ id: "item-1" } as PlanningItem);

    await updatePlanningItemForCurrentUser("item-1", {
      dueAt: null,
    });

    expect(mockUpdate).toHaveBeenCalledWith("item-1", {
      dueAt: null,
    });
  });

  it("throws NotFoundError and never updates when the item is not owned", async () => {
    mockFindOwned.mockResolvedValue(null);

    await expect(
      updatePlanningItemForCurrentUser("missing", { title: "x" }),
    ).rejects.toThrow(NotFoundError);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("propagates the NotFoundError the repository throws for an unknown FK reference", async () => {
    mockFindOwned.mockResolvedValue({ id: "item-1" } as PlanningItem);
    mockUpdate.mockRejectedValue(
      new NotFoundError(
        "One or more referenced ids (listId, itemTypeId, priorityId, statusId) do not exist.",
      ),
    );

    await expect(
      updatePlanningItemForCurrentUser("item-1", { priorityId: "nope" }),
    ).rejects.toThrow(NotFoundError);
  });
});

describe("deletePlanningItemForCurrentUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("prechecks ownership then soft-deletes", async () => {
    mockFindOwned.mockResolvedValue({ id: "item-1" } as PlanningItem);
    mockSoftDelete.mockResolvedValue();

    await deletePlanningItemForCurrentUser("item-1");

    expect(mockFindOwned).toHaveBeenCalledWith(DEV_USER_ID, "item-1");
    expect(mockSoftDelete).toHaveBeenCalledWith("item-1");
  });

  it("throws NotFoundError and never deletes when the item is not owned", async () => {
    mockFindOwned.mockResolvedValue(null);

    await expect(
      deletePlanningItemForCurrentUser("missing"),
    ).rejects.toThrow(NotFoundError);
    expect(mockSoftDelete).not.toHaveBeenCalled();
  });
});
