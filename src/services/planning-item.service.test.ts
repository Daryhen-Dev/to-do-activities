import type { Category, List, PlanningItem } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ScheduledItemWithCategory } from "../lib/calendar";
import { DEV_USER_ID } from "../lib/dev-user";
import { NotFoundError, ValidationError } from "../lib/errors";

// getCurrentUserId now reads the Auth.js session; stub it so these stay
// true unit tests isolated from auth.
vi.mock("../lib/current-user", () => ({
  getCurrentUserId: vi.fn().mockResolvedValue("dev-user-000000000000000000000"),
}));

vi.mock("../repositories/planning-item.repository", () => ({
  createPlanningItem: vi.fn(),
  findDefaultItemTypeId: vi.fn(),
  findDefaultStatusId: vi.fn(),
  findOverlappingTimedItem: vi.fn(),
  findOwnedPlanningItem: vi.fn(),
  listPlanningItemsByUser: vi.fn(),
  listScheduledItemsByCategory: vi.fn(),
  listScheduledItemsForUser: vi.fn(),
  softDeletePlanningItem: vi.fn(),
  updatePlanningItem: vi.fn(),
}));

// The service prechecks list ownership through the list repository before
// creating a task (mandatory hierarchy) — mock it here.
vi.mock("../repositories/list.repository", () => ({
  findOwnedList: vi.fn(),
}));

// The calendar range query prechecks category ownership through the category
// repository before delegating to the planning-item repo — mock it here.
vi.mock("../repositories/category.repository", () => ({
  findOwnedCategory: vi.fn(),
}));

import { findOwnedCategory } from "../repositories/category.repository";
import { findOwnedList } from "../repositories/list.repository";
import {
  createPlanningItem,
  findDefaultItemTypeId,
  findDefaultStatusId,
  findOverlappingTimedItem,
  findOwnedPlanningItem,
  listPlanningItemsByUser,
  listScheduledItemsByCategory,
  listScheduledItemsForUser,
  softDeletePlanningItem,
  updatePlanningItem,
} from "../repositories/planning-item.repository";
import {
  createPlanningItemForCurrentUser,
  deletePlanningItemForCurrentUser,
  getPlanningItemForCurrentUser,
  listPlanningItemsForCurrentUser,
  listScheduledItemsForCategory,
  listScheduledItemsForCurrentUserRange,
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
const mockListScheduledByCategory = vi.mocked(listScheduledItemsByCategory);
const mockListScheduledForUser = vi.mocked(listScheduledItemsForUser);
const mockFindOwnedCategory = vi.mocked(findOwnedCategory);
const mockFindOverlap = vi.mocked(findOverlappingTimedItem);

const ownedList = { id: "list-1" } as List;

// The "no double-booking" precheck runs on every create/update of a TIMED
// item. Default it to "no conflict" here so the existing schedule tests (which
// don't care about overlap) keep passing; individual tests override it when
// they exercise the overlap rule. This runs BEFORE each describe's
// `vi.clearAllMocks()` (outer hooks fire first), and clearAllMocks only clears
// call history — not the implementation — so the default survives.
beforeEach(() => {
  vi.mocked(findOverlappingTimedItem).mockResolvedValue(null);
});

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
      startAt: null,
      endAt: null,
      allDay: false,
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

  // Requirement 2.1/2.2/2.3: a valid schedule is forwarded verbatim to the repo.
  it("forwards startAt/endAt/allDay to the repository on a valid schedule", async () => {
    mockFindDefaultStatusId.mockResolvedValue("status-default");
    mockFindDefaultItemTypeId.mockResolvedValue("item-type-default");
    mockFindOwnedList.mockResolvedValue(ownedList);
    mockCreate.mockResolvedValue({ id: "item-1" } as PlanningItem);

    const startAt = new Date("2026-08-01T10:00:00.000Z");
    const endAt = new Date("2026-08-01T11:00:00.000Z");

    await createPlanningItemForCurrentUser({
      title: "Meeting",
      listId: "list-1",
      startAt,
      endAt,
      allDay: true,
    });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ startAt, endAt, allDay: true }),
    );
  });

  // Requirement 2.2: an inconsistent schedule fails before any write.
  it("throws ValidationError and never persists when endAt precedes startAt", async () => {
    mockFindDefaultStatusId.mockResolvedValue("status-default");
    mockFindDefaultItemTypeId.mockResolvedValue("item-type-default");
    mockFindOwnedList.mockResolvedValue(ownedList);

    await expect(
      createPlanningItemForCurrentUser({
        title: "Meeting",
        listId: "list-1",
        startAt: new Date("2026-08-01T11:00:00.000Z"),
        endAt: new Date("2026-08-01T10:00:00.000Z"),
      }),
    ).rejects.toThrow(ValidationError);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  // No double-booking: a valid, well-formed TIMED schedule that overlaps an
  // existing timed item is rejected before any write.
  it("throws ValidationError and never persists when the timed schedule overlaps another item", async () => {
    mockFindDefaultStatusId.mockResolvedValue("status-default");
    mockFindDefaultItemTypeId.mockResolvedValue("item-type-default");
    mockFindOwnedList.mockResolvedValue(ownedList);
    mockFindOverlap.mockResolvedValue({ id: "conflicting-item" } as PlanningItem);

    await expect(
      createPlanningItemForCurrentUser({
        title: "Meeting",
        listId: "list-1",
        startAt: new Date("2026-08-01T10:00:00.000Z"),
        endAt: new Date("2026-08-01T11:00:00.000Z"),
        allDay: false,
      }),
    ).rejects.toThrow(ValidationError);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  // No double-booking exempts all-day items: even with a startAt and an
  // existing timed item, the overlap check is skipped and the create proceeds.
  it("does not run the overlap check for an all-day item and persists it", async () => {
    mockFindDefaultStatusId.mockResolvedValue("status-default");
    mockFindDefaultItemTypeId.mockResolvedValue("item-type-default");
    mockFindOwnedList.mockResolvedValue(ownedList);
    const created = { id: "item-1" } as PlanningItem;
    mockCreate.mockResolvedValue(created);

    const result = await createPlanningItemForCurrentUser({
      title: "All-day off-site",
      listId: "list-1",
      startAt: new Date("2026-08-01T00:00:00.000Z"),
      allDay: true,
    });

    expect(mockFindOverlap).not.toHaveBeenCalled();
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ allDay: true }),
    );
    expect(result).toBe(created);
  });

  // No double-booking exempts unscheduled items: with no startAt there is no
  // interval to conflict, so the overlap check is skipped entirely.
  it("does not run the overlap check when the item has no schedule", async () => {
    mockFindDefaultStatusId.mockResolvedValue("status-default");
    mockFindDefaultItemTypeId.mockResolvedValue("item-type-default");
    mockFindOwnedList.mockResolvedValue(ownedList);
    mockCreate.mockResolvedValue({ id: "item-1" } as PlanningItem);

    await createPlanningItemForCurrentUser({
      title: "Buy milk",
      listId: "list-1",
    });

    expect(mockFindOverlap).not.toHaveBeenCalled();
    expect(mockCreate).toHaveBeenCalled();
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

describe("listScheduledItemsForCategory", () => {
  const from = new Date("2026-06-10T00:00:00.000Z");
  const to = new Date("2026-06-17T00:00:00.000Z");

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Requirement 4.5: a category that is absent or owned by someone else yields
  // a precise NotFoundError and never reaches the range query.
  it("throws NotFoundError and never queries when the category is not owned or absent", async () => {
    mockFindOwnedCategory.mockResolvedValue(null);

    await expect(
      listScheduledItemsForCategory("cat-missing", from, to),
    ).rejects.toThrow(NotFoundError);
    expect(mockFindOwnedCategory).toHaveBeenCalledWith(DEV_USER_ID, "cat-missing");
    expect(mockListScheduledByCategory).not.toHaveBeenCalled();
  });

  // Requirement 4.1/4.2/4.3/4.4: an owned category delegates to the repo with
  // the resolved user, category, and window, returning the items verbatim.
  it("delegates to the repository with userId, categoryId, from and to for an owned category", async () => {
    mockFindOwnedCategory.mockResolvedValue({ id: "cat-1" } as Category);
    const items = [{ id: "item-1" }, { id: "item-2" }] as PlanningItem[];
    mockListScheduledByCategory.mockResolvedValue(items);

    const result = await listScheduledItemsForCategory("cat-1", from, to);

    expect(mockFindOwnedCategory).toHaveBeenCalledWith(DEV_USER_ID, "cat-1");
    expect(mockListScheduledByCategory).toHaveBeenCalledWith(
      DEV_USER_ID,
      "cat-1",
      from,
      to,
    );
    expect(result).toBe(items);
  });
});

describe("listScheduledItemsForCurrentUserRange", () => {
  const from = new Date("2026-07-10T00:00:00.000Z");
  const to = new Date("2026-07-17T00:00:00.000Z");

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // The combined range is scoped by the server-resolved user across ALL
  // categories, so there is no per-category ownership precheck: the service
  // simply resolves the current user (stubbed getCurrentUserId) and delegates
  // to the repo with that user and the window, returning the rows verbatim.
  it("delegates to the repository with the resolved current user, from and to", async () => {
    const items = [
      { id: "item-1", categoryId: "cat-1" },
      { id: "item-2", categoryId: "cat-2" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any as ScheduledItemWithCategory[];
    mockListScheduledForUser.mockResolvedValue(items);

    const result = await listScheduledItemsForCurrentUserRange(from, to);

    expect(mockListScheduledForUser).toHaveBeenCalledWith(
      DEV_USER_ID,
      from,
      to,
    );
    expect(result).toBe(items);
  });

  // No category ownership repository is consulted for the combined range —
  // ownership is enforced entirely by the userId-scoped query.
  it("does not consult the category ownership repository", async () => {
    mockListScheduledForUser.mockResolvedValue([]);

    await listScheduledItemsForCurrentUserRange(from, to);

    expect(mockFindOwnedCategory).not.toHaveBeenCalled();
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

  // Requirement 2.2: adding an endAt to an item that already has a stored
  // startAt is valid against the EFFECTIVE (merged) schedule.
  it("adds an endAt to an item with a stored startAt (effective schedule valid)", async () => {
    const storedStartAt = new Date("2026-08-01T10:00:00.000Z");
    mockFindOwned.mockResolvedValue({
      id: "item-1",
      startAt: storedStartAt,
      endAt: null,
    } as PlanningItem);
    mockUpdate.mockResolvedValue({ id: "item-1" } as PlanningItem);

    const endAt = new Date("2026-08-01T11:00:00.000Z");
    await updatePlanningItemForCurrentUser("item-1", { endAt });

    expect(mockUpdate).toHaveBeenCalledWith("item-1", { endAt });
  });

  // Requirement 2.2: the effective-schedule check compares the incoming endAt
  // against the STORED startAt even when the payload omits startAt.
  it("throws ValidationError when endAt precedes the stored startAt (payload omits startAt)", async () => {
    mockFindOwned.mockResolvedValue({
      id: "item-1",
      startAt: new Date("2026-08-01T10:00:00.000Z"),
      endAt: null,
    } as PlanningItem);

    await expect(
      updatePlanningItemForCurrentUser("item-1", {
        endAt: new Date("2026-08-01T09:00:00.000Z"),
      }),
    ).rejects.toThrow(ValidationError);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  // Requirement 2.1: clearing startAt unschedules the item, so a stored endAt
  // is cleared too even when the payload does not mention endAt.
  it("clears a stored endAt when startAt is set to null (payload omits endAt)", async () => {
    mockFindOwned.mockResolvedValue({
      id: "item-1",
      startAt: new Date("2026-08-01T10:00:00.000Z"),
      endAt: new Date("2026-08-01T11:00:00.000Z"),
    } as PlanningItem);
    mockUpdate.mockResolvedValue({ id: "item-1" } as PlanningItem);

    await updatePlanningItemForCurrentUser("item-1", { startAt: null });

    expect(mockUpdate).toHaveBeenCalledWith("item-1", {
      startAt: null,
      endAt: null,
    });
  });

  // Requirement 2.1: a schedule-only patch must not touch the separate dueAt.
  it("does not touch dueAt when only schedule fields change", async () => {
    mockFindOwned.mockResolvedValue({
      id: "item-1",
      startAt: null,
      endAt: null,
    } as PlanningItem);
    mockUpdate.mockResolvedValue({ id: "item-1" } as PlanningItem);

    const startAt = new Date("2026-08-01T10:00:00.000Z");
    await updatePlanningItemForCurrentUser("item-1", { startAt });

    expect(mockUpdate).toHaveBeenCalledWith("item-1", { startAt });
    expect(mockUpdate).toHaveBeenCalledWith(
      "item-1",
      expect.not.objectContaining({ dueAt: expect.anything() }),
    );
  });

  // No double-booking on update: a new timed schedule that overlaps another
  // item is rejected, and the overlap check must exclude the item being
  // updated (so it never conflicts with itself).
  it("throws ValidationError and never updates when the new schedule overlaps another item, excluding self", async () => {
    mockFindOwned.mockResolvedValue({
      id: "item-1",
      startAt: new Date("2026-08-01T08:00:00.000Z"),
      endAt: null,
      allDay: false,
    } as PlanningItem);
    mockFindOverlap.mockResolvedValue({ id: "conflicting-item" } as PlanningItem);

    const startAt = new Date("2026-08-01T10:00:00.000Z");
    const endAt = new Date("2026-08-01T11:00:00.000Z");

    await expect(
      updatePlanningItemForCurrentUser("item-1", { startAt, endAt }),
    ).rejects.toThrow(ValidationError);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockFindOverlap).toHaveBeenCalledWith(
      DEV_USER_ID,
      startAt,
      endAt,
      "item-1",
    );
  });

  // No double-booking on update: when the effective schedule does not overlap
  // (repo returns null) the update proceeds normally.
  it("proceeds with the update when the new schedule does not overlap another item", async () => {
    mockFindOwned.mockResolvedValue({
      id: "item-1",
      startAt: new Date("2026-08-01T08:00:00.000Z"),
      endAt: null,
      allDay: false,
    } as PlanningItem);
    mockFindOverlap.mockResolvedValue(null);
    mockUpdate.mockResolvedValue({ id: "item-1" } as PlanningItem);

    const startAt = new Date("2026-08-01T10:00:00.000Z");
    const endAt = new Date("2026-08-01T11:00:00.000Z");

    await updatePlanningItemForCurrentUser("item-1", { startAt, endAt });

    expect(mockFindOverlap).toHaveBeenCalledWith(
      DEV_USER_ID,
      startAt,
      endAt,
      "item-1",
    );
    expect(mockUpdate).toHaveBeenCalledWith("item-1", { startAt, endAt });
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
