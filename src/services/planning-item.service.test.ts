import type { PlanningItem } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEV_USER_ID } from "../lib/current-user";
import { NotFoundError } from "../lib/errors";

vi.mock("../repositories/planning-item.repository", () => ({
  createPlanningItem: vi.fn(),
  findDefaultItemTypeId: vi.fn(),
  findDefaultStatusId: vi.fn(),
  listPlanningItemsByUser: vi.fn(),
}));

import {
  createPlanningItem,
  findDefaultItemTypeId,
  findDefaultStatusId,
  listPlanningItemsByUser,
} from "../repositories/planning-item.repository";
import {
  createPlanningItemForCurrentUser,
  listPlanningItemsForCurrentUser,
} from "./planning-item.service";

const mockCreate = vi.mocked(createPlanningItem);
const mockFindDefaultItemTypeId = vi.mocked(findDefaultItemTypeId);
const mockFindDefaultStatusId = vi.mocked(findDefaultStatusId);
const mockListByUser = vi.mocked(listPlanningItemsByUser);

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
