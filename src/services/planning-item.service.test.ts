import type { PlanningItem } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEV_USER_ID } from "../lib/current-user";
import { NotFoundError } from "../lib/errors";

vi.mock("../repositories/planning-item.repository", () => ({
  createPlanningItem: vi.fn(),
  findDefaultItemTypeId: vi.fn(),
  findDefaultStatusId: vi.fn(),
  findOwnedPlanningItem: vi.fn(),
  listPlanningItemsByUser: vi.fn(),
  softDeletePlanningItem: vi.fn(),
  updatePlanningItem: vi.fn(),
}));

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

describe("createPlanningItemForCurrentUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves default statusId and itemTypeId when the payload omits them", async () => {
    mockFindDefaultStatusId.mockResolvedValue("status-default");
    mockFindDefaultItemTypeId.mockResolvedValue("item-type-default");
    const created = { id: "item-1" } as PlanningItem;
    mockCreate.mockResolvedValue(created);

    const result = await createPlanningItemForCurrentUser({ title: "Buy milk" });

    expect(mockCreate).toHaveBeenCalledWith({
      userId: DEV_USER_ID,
      title: "Buy milk",
      description: null,
      listId: null,
      itemTypeId: "item-type-default",
      priorityId: null,
      statusId: "status-default",
      dueAt: null,
    });
    expect(result).toBe(created);
  });

  it("uses explicit statusId/itemTypeId from the payload instead of resolving defaults", async () => {
    const created = { id: "item-1" } as PlanningItem;
    mockCreate.mockResolvedValue(created);

    await createPlanningItemForCurrentUser({
      title: "Buy milk",
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
      createPlanningItemForCurrentUser({ title: "Buy milk" }),
    ).rejects.toThrow(NotFoundError);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("throws NotFoundError when no default item type is seeded", async () => {
    mockFindDefaultStatusId.mockResolvedValue("status-default");
    mockFindDefaultItemTypeId.mockResolvedValue(null);

    await expect(
      createPlanningItemForCurrentUser({ title: "Buy milk" }),
    ).rejects.toThrow(NotFoundError);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("propagates the NotFoundError the repository throws for an unknown FK reference", async () => {
    mockFindDefaultStatusId.mockResolvedValue("status-default");
    mockFindDefaultItemTypeId.mockResolvedValue("item-type-default");
    mockCreate.mockRejectedValue(
      new NotFoundError(
        "One or more referenced ids (listId, itemTypeId, priorityId, statusId) do not exist.",
      ),
    );

    await expect(
      createPlanningItemForCurrentUser({
        title: "Buy milk",
        priorityId: "does-not-exist",
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it("passes a null listId through for quick capture (no list provided)", async () => {
    mockFindDefaultStatusId.mockResolvedValue("status-default");
    mockFindDefaultItemTypeId.mockResolvedValue("item-type-default");
    mockCreate.mockResolvedValue({ id: "item-2", listId: null } as PlanningItem);

    await createPlanningItemForCurrentUser({ title: "Quick capture" });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ listId: null }),
    );
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

  it("passes an explicit null through to clear a nullable field", async () => {
    mockFindOwned.mockResolvedValue({ id: "item-1" } as PlanningItem);
    mockUpdate.mockResolvedValue({ id: "item-1" } as PlanningItem);

    await updatePlanningItemForCurrentUser("item-1", {
      dueAt: null,
      listId: null,
    });

    expect(mockUpdate).toHaveBeenCalledWith("item-1", {
      dueAt: null,
      listId: null,
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
