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
  createHabitCompletion: vi.fn(),
  createPlanningItem: vi.fn(),
  deleteHabitCompletion: vi.fn(),
  findDefaultItemTypeId: vi.fn(),
  findDefaultStatusId: vi.fn(),
  findItemTypeKeyById: vi.fn(),
  findOverlappingTimedItem: vi.fn(),
  findOwnedHabit: vi.fn(),
  findOwnedPlanningItem: vi.fn(),
  listDueReminders: vi.fn(),
  listHabitsByUser: vi.fn(),
  listNotesByUser: vi.fn(),
  listObjectivesByUser: vi.fn(),
  listPlanningItemsByUser: vi.fn(),
  listRemindersForUser: vi.fn(),
  listScheduledItemsByCategory: vi.fn(),
  listScheduledItemsForUser: vi.fn(),
  markReminderSeen: vi.fn(),
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
  createHabitCompletion,
  createPlanningItem,
  deleteHabitCompletion,
  findDefaultItemTypeId,
  findDefaultStatusId,
  findItemTypeKeyById,
  findOverlappingTimedItem,
  findOwnedHabit,
  findOwnedPlanningItem,
  listDueReminders,
  listHabitsByUser,
  listNotesByUser,
  listObjectivesByUser,
  listPlanningItemsByUser,
  listRemindersForUser,
  listScheduledItemsByCategory,
  listScheduledItemsForUser,
  markReminderSeen,
  softDeletePlanningItem,
  updatePlanningItem,
} from "../repositories/planning-item.repository";
import {
  acknowledgeReminderForCurrentUser,
  createPlanningItemForCurrentUser,
  deletePlanningItemForCurrentUser,
  getPlanningItemForCurrentUser,
  listDueRemindersForCurrentUser,
  listHabitOccurrencesForCurrentUserRange,
  listHabitsForCurrentUser,
  listNotesForCurrentUser,
  listObjectivesForCurrentUser,
  listPlanningItemsForCurrentUser,
  listRemindersForCurrentUserRange,
  listScheduledItemsForCategory,
  listScheduledItemsForCurrentUserRange,
  setHabitCompletionForCurrentUser,
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
const mockListDueReminders = vi.mocked(listDueReminders);
const mockMarkReminderSeen = vi.mocked(markReminderSeen);
const mockListRemindersForUser = vi.mocked(listRemindersForUser);
const mockListNotesByUser = vi.mocked(listNotesByUser);
const mockListObjectivesByUser = vi.mocked(listObjectivesByUser);

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
      remindAt: null,
      objectiveStartAt: null,
      objectiveEndAt: null,
      progress: null,
      recurrenceDays: [],
      recurrenceTimeMinutes: null,
      recurrenceInterval: null,
      recurrenceAnchor: null,
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

  // Reminder: a provided remindAt is forwarded verbatim to the repository.
  it("forwards remindAt to the repository", async () => {
    mockFindDefaultStatusId.mockResolvedValue("status-default");
    mockFindDefaultItemTypeId.mockResolvedValue("item-type-default");
    mockFindOwnedList.mockResolvedValue(ownedList);
    mockCreate.mockResolvedValue({ id: "item-1" } as PlanningItem);

    const remindAt = new Date("2026-08-01T09:00:00.000Z");
    await createPlanningItemForCurrentUser({
      title: "Take pills",
      listId: "list-1",
      remindAt,
    });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ remindAt }),
    );
  });

  // Objective fields flow through to the repository.
  it("forwards objectiveStartAt/objectiveEndAt/progress to the repository", async () => {
    mockFindDefaultStatusId.mockResolvedValue("status-default");
    mockFindDefaultItemTypeId.mockResolvedValue("item-type-default");
    mockFindOwnedList.mockResolvedValue(ownedList);
    mockCreate.mockResolvedValue({ id: "item-1" } as PlanningItem);

    const objectiveStartAt = new Date("2026-08-01T00:00:00.000Z");
    const objectiveEndAt = new Date("2026-09-01T00:00:00.000Z");
    await createPlanningItemForCurrentUser({
      title: "Ship v2",
      listId: "list-1",
      objectiveStartAt,
      objectiveEndAt,
      progress: 25,
    });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ objectiveStartAt, objectiveEndAt, progress: 25 }),
    );
    // Objective dates never trigger the timed overlap check.
    expect(mockFindOverlap).not.toHaveBeenCalled();
  });

  // Objective timeframe must be consistent (end on/after start) before any write.
  it("throws ValidationError and never persists when objectiveEndAt precedes objectiveStartAt", async () => {
    mockFindDefaultStatusId.mockResolvedValue("status-default");
    mockFindDefaultItemTypeId.mockResolvedValue("item-type-default");
    mockFindOwnedList.mockResolvedValue(ownedList);

    await expect(
      createPlanningItemForCurrentUser({
        title: "Bad objective",
        listId: "list-1",
        objectiveStartAt: new Date("2026-09-01T00:00:00.000Z"),
        objectiveEndAt: new Date("2026-08-01T00:00:00.000Z"),
      }),
    ).rejects.toThrow(ValidationError);
    expect(mockCreate).not.toHaveBeenCalled();
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

describe("listRemindersForCurrentUserRange", () => {
  const from = new Date("2026-11-01T00:00:00.000Z");
  const to = new Date("2026-11-08T00:00:00.000Z");

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // The reminder layer is user-scoped across categories, so the service just
  // resolves the current user (stubbed) and delegates with the window.
  it("delegates to the repository with the resolved current user, from and to", async () => {
    const items = [
      { id: "r-1", categoryId: "cat-1" },
      { id: "r-2", categoryId: "cat-2" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any as ScheduledItemWithCategory[];
    mockListRemindersForUser.mockResolvedValue(items);

    const result = await listRemindersForCurrentUserRange(from, to);

    expect(mockListRemindersForUser).toHaveBeenCalledWith(DEV_USER_ID, from, to);
    expect(result).toBe(items);
  });

  it("does not consult the category ownership repository", async () => {
    mockListRemindersForUser.mockResolvedValue([]);

    await listRemindersForCurrentUserRange(from, to);

    expect(mockFindOwnedCategory).not.toHaveBeenCalled();
  });
});

describe("listNotesForCurrentUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delegates to the repository with the resolved current user", async () => {
    const notes = [
      { id: "n-1", categoryId: "cat-1" },
      { id: "n-2", categoryId: "cat-2" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any as Awaited<ReturnType<typeof listNotesByUser>>;
    mockListNotesByUser.mockResolvedValue(notes);

    const result = await listNotesForCurrentUser();

    expect(mockListNotesByUser).toHaveBeenCalledWith(DEV_USER_ID);
    expect(result).toBe(notes);
  });
});

describe("listObjectivesForCurrentUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delegates to the repository with the resolved current user", async () => {
    const objectives = [
      { id: "o-1", categoryId: "cat-1" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any as Awaited<ReturnType<typeof listObjectivesByUser>>;
    mockListObjectivesByUser.mockResolvedValue(objectives);

    const result = await listObjectivesForCurrentUser();

    expect(mockListObjectivesByUser).toHaveBeenCalledWith(DEV_USER_ID);
    expect(result).toBe(objectives);
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

  // Reminder re-arm: setting a NEW remindAt drops the prior acknowledgement so
  // the reminder can fire again (Req 1.4).
  it("re-arms the reminder (clears reminderSeenAt) when remindAt changes to a new time", async () => {
    mockFindOwned.mockResolvedValue({
      id: "item-1",
      remindAt: new Date("2026-08-01T09:00:00.000Z"),
      reminderSeenAt: new Date("2026-08-01T09:05:00.000Z"),
    } as PlanningItem);
    mockUpdate.mockResolvedValue({ id: "item-1" } as PlanningItem);

    const remindAt = new Date("2026-08-02T09:00:00.000Z");
    await updatePlanningItemForCurrentUser("item-1", { remindAt });

    expect(mockUpdate).toHaveBeenCalledWith("item-1", {
      remindAt,
      reminderSeenAt: null,
    });
  });

  // Reminder clear: setting remindAt to null clears the acknowledgement too.
  it("clears reminderSeenAt when remindAt is cleared to null", async () => {
    mockFindOwned.mockResolvedValue({
      id: "item-1",
      remindAt: new Date("2026-08-01T09:00:00.000Z"),
      reminderSeenAt: new Date("2026-08-01T09:05:00.000Z"),
    } as PlanningItem);
    mockUpdate.mockResolvedValue({ id: "item-1" } as PlanningItem);

    await updatePlanningItemForCurrentUser("item-1", { remindAt: null });

    expect(mockUpdate).toHaveBeenCalledWith("item-1", {
      remindAt: null,
      reminderSeenAt: null,
    });
  });

  // Idempotent save: echoing the SAME remindAt (dialog re-sends the current
  // value on an unrelated edit) must NOT resurrect a dismissed reminder.
  it("does not re-arm when remindAt is unchanged (preserves the acknowledgement)", async () => {
    const remindAt = new Date("2026-08-01T09:00:00.000Z");
    mockFindOwned.mockResolvedValue({
      id: "item-1",
      remindAt,
      reminderSeenAt: new Date("2026-08-01T09:05:00.000Z"),
    } as PlanningItem);
    mockUpdate.mockResolvedValue({ id: "item-1" } as PlanningItem);

    await updatePlanningItemForCurrentUser("item-1", {
      remindAt: new Date("2026-08-01T09:00:00.000Z"),
      title: "Unrelated edit",
    });

    expect(mockUpdate).toHaveBeenCalledWith("item-1", {
      title: "Unrelated edit",
      remindAt: new Date("2026-08-01T09:00:00.000Z"),
    });
    // reminderSeenAt must NOT be part of the patch.
    expect(mockUpdate).toHaveBeenCalledWith(
      "item-1",
      expect.not.objectContaining({ reminderSeenAt: expect.anything() }),
    );
  });

  // Reminder is orthogonal to the schedule: setting remindAt never triggers the
  // overlap check (Req 5.3).
  it("does not run the overlap check when only remindAt changes", async () => {
    mockFindOwned.mockResolvedValue({
      id: "item-1",
      startAt: null,
      endAt: null,
      remindAt: null,
      allDay: false,
    } as PlanningItem);
    mockUpdate.mockResolvedValue({ id: "item-1" } as PlanningItem);

    await updatePlanningItemForCurrentUser("item-1", {
      remindAt: new Date("2026-08-02T09:00:00.000Z"),
    });

    expect(mockFindOverlap).not.toHaveBeenCalled();
  });

  // Objective fields are forwarded on update.
  it("forwards objectiveStartAt/objectiveEndAt/progress on update", async () => {
    mockFindOwned.mockResolvedValue({
      id: "item-1",
      objectiveStartAt: null,
      objectiveEndAt: null,
    } as PlanningItem);
    mockUpdate.mockResolvedValue({ id: "item-1" } as PlanningItem);

    const objectiveStartAt = new Date("2026-08-01T00:00:00.000Z");
    const objectiveEndAt = new Date("2026-09-01T00:00:00.000Z");
    await updatePlanningItemForCurrentUser("item-1", {
      objectiveStartAt,
      objectiveEndAt,
      progress: 60,
    });

    expect(mockUpdate).toHaveBeenCalledWith("item-1", {
      objectiveStartAt,
      objectiveEndAt,
      progress: 60,
    });
    expect(mockFindOverlap).not.toHaveBeenCalled();
  });

  // The effective objective timeframe is validated against the stored start.
  it("throws ValidationError when the effective objectiveEndAt precedes the stored objectiveStartAt", async () => {
    mockFindOwned.mockResolvedValue({
      id: "item-1",
      objectiveStartAt: new Date("2026-09-01T00:00:00.000Z"),
      objectiveEndAt: null,
    } as PlanningItem);

    await expect(
      updatePlanningItemForCurrentUser("item-1", {
        objectiveEndAt: new Date("2026-08-01T00:00:00.000Z"),
      }),
    ).rejects.toThrow(ValidationError);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe("listDueRemindersForCurrentUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delegates to the repository with the resolved user and a now Date", async () => {
    const items = [{ id: "r-1" }, { id: "r-2" }] as PlanningItem[];
    mockListDueReminders.mockResolvedValue(items);

    const result = await listDueRemindersForCurrentUser();

    expect(mockListDueReminders).toHaveBeenCalledTimes(1);
    const [userId, now] = mockListDueReminders.mock.calls[0];
    expect(userId).toBe(DEV_USER_ID);
    expect(now).toBeInstanceOf(Date);
    expect(result).toBe(items);
  });
});

describe("acknowledgeReminderForCurrentUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("prechecks ownership then stamps reminderSeenAt via the repository", async () => {
    mockFindOwned.mockResolvedValue({ id: "item-1" } as PlanningItem);
    const acknowledged = { id: "item-1" } as PlanningItem;
    mockMarkReminderSeen.mockResolvedValue(acknowledged);

    const result = await acknowledgeReminderForCurrentUser("item-1");

    expect(mockFindOwned).toHaveBeenCalledWith(DEV_USER_ID, "item-1");
    expect(mockMarkReminderSeen).toHaveBeenCalledTimes(1);
    const [id, seenAt] = mockMarkReminderSeen.mock.calls[0];
    expect(id).toBe("item-1");
    expect(seenAt).toBeInstanceOf(Date);
    expect(result).toBe(acknowledged);
  });

  it("throws NotFoundError and never stamps when the reminder is not owned", async () => {
    mockFindOwned.mockResolvedValue(null);

    await expect(
      acknowledgeReminderForCurrentUser("missing"),
    ).rejects.toThrow(NotFoundError);
    expect(mockMarkReminderSeen).not.toHaveBeenCalled();
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

// ---------------------------------------------------------------------------
// Habits: adherence read + completion toggle + recurrence-rule validation.
// ---------------------------------------------------------------------------

import { toDbDate, type HabitWithCompletions } from "../lib/habits";

const mockListHabitsByUser = vi.mocked(listHabitsByUser);
const mockFindOwnedHabit = vi.mocked(findOwnedHabit);
const mockCreateHabitCompletion = vi.mocked(createHabitCompletion);
const mockDeleteHabitCompletion = vi.mocked(deleteHabitCompletion);
const mockFindItemTypeKeyById = vi.mocked(findItemTypeKeyById);

/** Minimal habit row shaped like the repository's `HabitWithCompletions`. */
function habitRow(
  overrides: Partial<HabitWithCompletions> = {},
): HabitWithCompletions {
  return {
    id: "habit-1",
    userId: DEV_USER_ID,
    title: "Meditate",
    description: null,
    createdAt: new Date(2026, 0, 1),
    recurrenceDays: [1, 2, 3, 4, 5, 6, 7],
    recurrenceInterval: null,
    recurrenceAnchor: null,
    recurrenceTimeMinutes: 480,
    categoryId: "cat-1",
    categoryName: "Salud",
    categoryColor: null,
    completions: [],
    ...overrides,
  } as unknown as HabitWithCompletions;
}

describe("listHabitsForCurrentUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("computes streak, weekly adherence, and scheduled/completed-today flags", async () => {
    const now = new Date(2026, 6, 20); // Mon Jul 20, 2026
    mockListHabitsByUser.mockResolvedValue([
      habitRow({ completions: [{ date: toDbDate(new Date(2026, 6, 20)) }] }),
    ]);

    const [habit] = await listHabitsForCurrentUser(now);

    expect(habit.scheduledToday).toBe(true);
    expect(habit.completedToday).toBe(true);
    expect(habit.streak).toBe(1);
    // A daily habit's current week (Mon..Sun) has 7 scheduled occurrences.
    expect(habit.weekly).toEqual({ completed: 1, total: 7 });
    // The `completions` array is not leaked in the view model.
    expect("completions" in habit).toBe(false);
  });

  it("reports zero adherence for a habit with no completions", async () => {
    const now = new Date(2026, 6, 20);
    mockListHabitsByUser.mockResolvedValue([habitRow()]);

    const [habit] = await listHabitsForCurrentUser(now);

    expect(habit.streak).toBe(0);
    expect(habit.completedToday).toBe(false);
    expect(habit.weekly).toEqual({ completed: 0, total: 7 });
  });
});

describe("setHabitCompletionForCurrentUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws NotFoundError when the habit is not owned (or not a habit)", async () => {
    mockFindOwnedHabit.mockResolvedValue(null);

    await expect(
      setHabitCompletionForCurrentUser("nope", "2026-07-20", true),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(mockCreateHabitCompletion).not.toHaveBeenCalled();
  });

  it("rejects a date the rule does not schedule with a ValidationError", async () => {
    // Monday-only habit; 2026-07-21 is a Tuesday.
    mockFindOwnedHabit.mockResolvedValue(
      habitRow({ recurrenceDays: [1] }) as unknown as PlanningItem,
    );

    await expect(
      setHabitCompletionForCurrentUser("habit-1", "2026-07-21", true),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(mockCreateHabitCompletion).not.toHaveBeenCalled();
  });

  it("records a completion for a scheduled date when done=true", async () => {
    mockFindOwnedHabit.mockResolvedValue(
      habitRow({ recurrenceDays: [1] }) as unknown as PlanningItem,
    );

    await setHabitCompletionForCurrentUser("habit-1", "2026-07-20", true); // Monday

    expect(mockCreateHabitCompletion).toHaveBeenCalledWith(
      "dev-user-000000000000000000000",
      "habit-1",
      toDbDate(new Date(2026, 6, 20)),
    );
    expect(mockDeleteHabitCompletion).not.toHaveBeenCalled();
  });

  it("removes a completion for a scheduled date when done=false", async () => {
    mockFindOwnedHabit.mockResolvedValue(
      habitRow({ recurrenceDays: [1] }) as unknown as PlanningItem,
    );

    await setHabitCompletionForCurrentUser("habit-1", "2026-07-20", false);

    expect(mockDeleteHabitCompletion).toHaveBeenCalledWith(
      "habit-1",
      toDbDate(new Date(2026, 6, 20)),
    );
    expect(mockCreateHabitCompletion).not.toHaveBeenCalled();
  });

  it("surfaces the error and writes no partial state when the completion write fails", async () => {
    mockFindOwnedHabit.mockResolvedValue(
      habitRow({ recurrenceDays: [1] }) as unknown as PlanningItem,
    );
    mockCreateHabitCompletion.mockRejectedValue(new Error("db down"));

    await expect(
      setHabitCompletionForCurrentUser("habit-1", "2026-07-20", true),
    ).rejects.toThrow("db down");
  });
});

describe("recurrence-rule validation on create/update", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects creating a habit with neither a weekday nor an interval", async () => {
    mockFindDefaultStatusId.mockResolvedValue("status-default");
    mockFindOwnedList.mockResolvedValue(ownedList);
    mockFindItemTypeKeyById.mockResolvedValue("habito");

    await expect(
      createPlanningItemForCurrentUser({
        title: "empty rule habit",
        listId: "list-1",
        itemTypeId: "habito-type",
        recurrenceDays: [],
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("accepts creating a habit with a valid weekday rule", async () => {
    mockFindDefaultStatusId.mockResolvedValue("status-default");
    mockFindOwnedList.mockResolvedValue(ownedList);
    mockFindItemTypeKeyById.mockResolvedValue("habito");
    mockCreate.mockResolvedValue({ id: "h1" } as PlanningItem);

    await createPlanningItemForCurrentUser({
      title: "valid habit",
      listId: "list-1",
      itemTypeId: "habito-type",
      recurrenceDays: [1, 3, 5],
      recurrenceTimeMinutes: 480,
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const arg = mockCreate.mock.calls[0][0];
    expect(arg.recurrenceDays).toEqual([1, 3, 5]);
  });

  it("leaves the prior rule unchanged when a PATCH would clear it to empty", async () => {
    // Existing habit is weekday-only; the patch clears the days to [] with no
    // interval → the effective rule is empty → reject, no update.
    mockFindOwned.mockResolvedValue(
      habitRow({ recurrenceDays: [1, 2, 3], recurrenceInterval: null }) as unknown as PlanningItem,
    );
    mockFindItemTypeKeyById.mockResolvedValue("habito");

    await expect(
      updatePlanningItemForCurrentUser("habit-1", { recurrenceDays: [] }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});


// ---------------------------------------------------------------------------
// Habit occurrences for the calendar layer (range expansion + completion).
// ---------------------------------------------------------------------------

describe("listHabitOccurrencesForCurrentUserRange", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("expands each habit's occurrences in the window and marks completion", () => {
    // Daily habit (all weekdays) at 08:00, one completion on Jul 21.
    mockListHabitsByUser.mockResolvedValue([
      habitRow({
        id: "h-1",
        title: "Meditate",
        recurrenceDays: [1, 2, 3, 4, 5, 6, 7],
        recurrenceTimeMinutes: 480,
        completions: [{ date: toDbDate(new Date(2026, 6, 21)) }],
      }),
    ]);

    return listHabitOccurrencesForCurrentUserRange(
      new Date(2026, 6, 20),
      new Date(2026, 6, 23), // [Mon Jul20, Thu Jul23) → 20, 21, 22
    ).then((occ) => {
      expect(occ.map((o) => o.date)).toEqual([
        "2026-07-20",
        "2026-07-21",
        "2026-07-22",
      ]);
      expect(occ.every((o) => o.habitId === "h-1")).toBe(true);
      expect(occ.every((o) => o.timeMinutes === 480)).toBe(true);
      expect(occ.find((o) => o.date === "2026-07-21")?.completed).toBe(true);
      expect(occ.find((o) => o.date === "2026-07-20")?.completed).toBe(false);
      expect(occ[0].categoryId).toBe("cat-1");
    });
  });

  it("matches generateOccurrences membership (model-based) for an interval habit", async () => {
    const rule = habitRow({
      id: "h-2",
      recurrenceDays: [],
      recurrenceInterval: 3,
      recurrenceAnchor: toDbDate(new Date(2026, 6, 20)),
      recurrenceTimeMinutes: null,
      createdAt: new Date(2026, 6, 20),
    });
    mockListHabitsByUser.mockResolvedValue([rule]);

    const from = new Date(2026, 6, 20);
    const to = new Date(2026, 6, 30);
    const occ = await listHabitOccurrencesForCurrentUserRange(from, to);

    // every-3-days from Jul 20: 20, 23, 26, 29
    expect(occ.map((o) => o.date)).toEqual([
      "2026-07-20",
      "2026-07-23",
      "2026-07-26",
      "2026-07-29",
    ]);
    // no time-of-day → all-day (null timeMinutes)
    expect(occ.every((o) => o.timeMinutes === null)).toBe(true);
  });

  it("yields no occurrences for a habit with none in the window", async () => {
    mockListHabitsByUser.mockResolvedValue([
      habitRow({ id: "h-3", recurrenceDays: [1] }), // Mondays only
    ]);

    // A window with no Monday: Tue Jul21 .. Thu Jul23
    const occ = await listHabitOccurrencesForCurrentUserRange(
      new Date(2026, 6, 21),
      new Date(2026, 6, 23),
    );
    expect(occ).toEqual([]);
  });
});
