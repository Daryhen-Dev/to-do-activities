import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEV_USER_ID } from "../lib/dev-user";
import { prisma } from "../lib/prisma";
import {
  createPlanningItem,
  findDefaultItemTypeId,
  findDefaultStatusId,
  findOverlappingTimedItem,
  findOwnedPlanningItem,
  listDueReminders,
  listNotesByUser,
  listPlanningItemsByUser,
  listRemindersForUser,
  listScheduledItemsByCategory,
  listScheduledItemsForUser,
  markReminderSeen,
  softDeletePlanningItem,
  updatePlanningItem,
} from "./planning-item.repository";

/**
 * Integration tests against the real, seeded Postgres instance (see
 * `docker-compose.yml` / `pnpm db:seed`). Exercises the sole Prisma
 * boundary for the planning-item slice — every row this suite creates is
 * removed in `afterAll` so reruns stay green.
 *
 * Every task now belongs to a list (mandatory hierarchy), so the suite
 * provisions a throwaway list under a seeded category in `beforeAll` and
 * references it on every insert.
 */
describe("planning-item repository (integration)", () => {
  let itemTypeId: string;
  let statusId: string;
  let listId: string;
  const createdItemIds: string[] = [];
  let otherUserId: string | null = null;
  const throwawayUserIds: string[] = [];

  beforeAll(async () => {
    const itemType = await prisma.itemType.findFirstOrThrow({
      where: { isDefault: true },
    });
    const status = await prisma.status.findFirstOrThrow({
      where: { isDefault: true },
    });
    itemTypeId = itemType.id;
    statusId = status.id;

    // A list owned by the seeded dev user (via a seeded category) so inserts
    // satisfy the now-required listId FK.
    const category = await prisma.category.findFirstOrThrow({
      where: { userId: DEV_USER_ID, deletedAt: null },
    });
    const list = await prisma.list.create({
      data: {
        categoryId: category.id,
        name: `repo-test-list-${Date.now()}`,
      },
    });
    listId = list.id;
  });

  afterAll(async () => {
    if (createdItemIds.length > 0) {
      await prisma.planningItem.deleteMany({
        where: { id: { in: createdItemIds } },
      });
    }
    // Idempotent cleanup (`deleteMany`, not `delete`) so a row already removed
    // — e.g. by a cascade from parallel integration files sharing this DB —
    // does not crash the suite with "No record found for a delete".
    const userIds = [otherUserId, ...throwawayUserIds].filter(
      (id): id is string => id !== null,
    );
    if (userIds.length > 0) {
      // Cascades and removes any planning items owned by these throwaway users.
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    if (listId) {
      await prisma.list.deleteMany({ where: { id: listId } });
    }
  });

  it("persists a planning item associated with its list", async () => {
    const item = await createPlanningItem({
      userId: DEV_USER_ID,
      title: "Integration test: persists item",
      description: null,
      listId,
      itemTypeId,
      priorityId: null,
      statusId,
      dueAt: null,
    });
    createdItemIds.push(item.id);

    expect(item.id).toBeDefined();
    expect(item.title).toBe("Integration test: persists item");
    expect(item.listId).toBe(listId);
    expect(item.userId).toBe(DEV_USER_ID);
  });

  it("rejects an unknown itemTypeId with a NotFoundError, translating the FK violation", async () => {
    await expect(
      createPlanningItem({
        userId: DEV_USER_ID,
        title: "Should not be created",
        description: null,
        listId,
        itemTypeId: "does-not-exist",
        priorityId: null,
        statusId,
        dueAt: null,
      }),
    ).rejects.toThrow(/do not exist/);
  });

  it("rejects an unknown listId with a NotFoundError, translating the FK violation", async () => {
    await expect(
      createPlanningItem({
        userId: DEV_USER_ID,
        title: "Should not be created",
        description: null,
        listId: "does-not-exist",
        itemTypeId,
        priorityId: null,
        statusId,
        dueAt: null,
      }),
    ).rejects.toThrow(/do not exist/);
  });

  it("lists non-deleted items and excludes soft-deleted rows", async () => {
    const visible = await createPlanningItem({
      userId: DEV_USER_ID,
      title: "Integration test: visible item",
      description: null,
      listId,
      itemTypeId,
      priorityId: null,
      statusId,
      dueAt: null,
    });
    createdItemIds.push(visible.id);

    const softDeleted = await createPlanningItem({
      userId: DEV_USER_ID,
      title: "Integration test: soft-deleted item",
      description: null,
      listId,
      itemTypeId,
      priorityId: null,
      statusId,
      dueAt: null,
    });
    createdItemIds.push(softDeleted.id);
    await prisma.planningItem.update({
      where: { id: softDeleted.id },
      data: { deletedAt: new Date() },
    });

    const items = await listPlanningItemsByUser(DEV_USER_ID);
    const ids = items.map((item) => item.id);

    expect(ids).toContain(visible.id);
    expect(ids).not.toContain(softDeleted.id);
  });

  it("scopes results to the requested user only", async () => {
    const otherUser = await prisma.user.create({
      data: { email: `other-user-${Date.now()}@test.local` },
    });
    otherUserId = otherUser.id;

    const otherUsersItem = await prisma.planningItem.create({
      data: {
        userId: otherUser.id,
        title: "Integration test: another user's item",
        listId,
        itemTypeId,
        statusId,
      },
    });

    const items = await listPlanningItemsByUser(DEV_USER_ID);
    const ids = items.map((item) => item.id);

    expect(ids).not.toContain(otherUsersItem.id);
  });

  it("resolves the seeded default item type id (key: tarea), exercising the real Prisma query", async () => {
    const seededDefault = await prisma.itemType.findUniqueOrThrow({
      where: { key: "tarea" },
    });

    const resolvedId = await findDefaultItemTypeId();

    expect(resolvedId).toBe(seededDefault.id);
  });

  it("resolves the seeded default status id (isDefault: true), exercising the real Prisma query", async () => {
    const seededDefault = await prisma.status.findFirstOrThrow({
      where: { isDefault: true },
    });

    const resolvedId = await findDefaultStatusId();

    expect(resolvedId).toBe(seededDefault.id);
  });

  it("returns an empty list for a freshly created user with zero items", async () => {
    const freshUser = await prisma.user.create({
      data: { email: `empty-list-${Date.now()}@test.local` },
    });
    throwawayUserIds.push(freshUser.id);

    const items = await listPlanningItemsByUser(freshUser.id);

    expect(items).toEqual([]);
  });

  it("finds an owned, non-deleted item and returns null for a soft-deleted one", async () => {
    const item = await createPlanningItem({
      userId: DEV_USER_ID,
      title: "Integration test: findOwned",
      description: null,
      listId,
      itemTypeId,
      priorityId: null,
      statusId,
      dueAt: null,
    });
    createdItemIds.push(item.id);

    const found = await findOwnedPlanningItem(DEV_USER_ID, item.id);
    expect(found?.id).toBe(item.id);

    await softDeletePlanningItem(item.id);
    const afterDelete = await findOwnedPlanningItem(DEV_USER_ID, item.id);
    expect(afterDelete).toBeNull();
  });

  it("does not find an item owned by another user", async () => {
    const stranger = await prisma.user.create({
      data: { email: `stranger-${Date.now()}@test.local` },
    });
    throwawayUserIds.push(stranger.id);

    const item = await createPlanningItem({
      userId: DEV_USER_ID,
      title: "Integration test: not yours",
      description: null,
      listId,
      itemTypeId,
      priorityId: null,
      statusId,
      dueAt: null,
    });
    createdItemIds.push(item.id);

    const found = await findOwnedPlanningItem(stranger.id, item.id);
    expect(found).toBeNull();
  });

  it("updates provided fields and clears a nullable field with null", async () => {
    const dueAt = new Date("2026-09-01T12:00:00.000Z");
    const item = await createPlanningItem({
      userId: DEV_USER_ID,
      title: "Integration test: update me",
      description: "before",
      listId,
      itemTypeId,
      priorityId: null,
      statusId,
      dueAt,
    });
    createdItemIds.push(item.id);

    const updated = await updatePlanningItem(item.id, {
      title: "after",
      description: null,
      archived: true,
    });

    expect(updated.title).toBe("after");
    expect(updated.description).toBeNull();
    expect(updated.archived).toBe(true);
    expect(updated.dueAt?.toISOString()).toBe(dueAt.toISOString());
  });

  it("rejects an update with an unknown statusId, translating the FK violation", async () => {
    const item = await createPlanningItem({
      userId: DEV_USER_ID,
      title: "Integration test: bad update",
      description: null,
      listId,
      itemTypeId,
      priorityId: null,
      statusId,
      dueAt: null,
    });
    createdItemIds.push(item.id);

    await expect(
      updatePlanningItem(item.id, { statusId: "does-not-exist" }),
    ).rejects.toThrow(/do not exist/);
  });

  it("listDueReminders returns only live, due, un-acknowledged reminders ordered by remindAt", async () => {
    const now = new Date("2026-10-01T12:00:00.000Z");
    const base = {
      userId: DEV_USER_ID,
      description: null,
      listId,
      itemTypeId,
      priorityId: null,
      statusId,
      dueAt: null,
    };

    // DUE: remindAt in the past, not acknowledged. Two of them to assert order.
    const dueLater = await createPlanningItem({
      ...base,
      title: "reminder due later",
      remindAt: new Date("2026-10-01T11:30:00.000Z"),
    });
    createdItemIds.push(dueLater.id);
    const dueEarlier = await createPlanningItem({
      ...base,
      title: "reminder due earlier",
      remindAt: new Date("2026-10-01T10:00:00.000Z"),
    });
    createdItemIds.push(dueEarlier.id);

    // EXCLUDED: future remindAt.
    const future = await createPlanningItem({
      ...base,
      title: "reminder in the future",
      remindAt: new Date("2026-10-01T13:00:00.000Z"),
    });
    createdItemIds.push(future.id);

    // EXCLUDED: already acknowledged.
    const acknowledged = await createPlanningItem({
      ...base,
      title: "reminder acknowledged",
      remindAt: new Date("2026-10-01T09:00:00.000Z"),
    });
    createdItemIds.push(acknowledged.id);
    await markReminderSeen(acknowledged.id, new Date("2026-10-01T09:05:00.000Z"));

    // EXCLUDED: no remindAt at all.
    const noReminder = await createPlanningItem({
      ...base,
      title: "no reminder",
    });
    createdItemIds.push(noReminder.id);

    // EXCLUDED: soft-deleted despite a due remindAt.
    const deleted = await createPlanningItem({
      ...base,
      title: "deleted reminder",
      remindAt: new Date("2026-10-01T08:00:00.000Z"),
    });
    createdItemIds.push(deleted.id);
    await softDeletePlanningItem(deleted.id);

    // EXCLUDED: archived despite a due remindAt.
    const archived = await createPlanningItem({
      ...base,
      title: "archived reminder",
      remindAt: new Date("2026-10-01T08:30:00.000Z"),
    });
    createdItemIds.push(archived.id);
    await updatePlanningItem(archived.id, { archived: true });

    const due = await listDueReminders(DEV_USER_ID, now);
    const ids = due.map((item) => item.id);

    expect(ids).toContain(dueEarlier.id);
    expect(ids).toContain(dueLater.id);
    expect(ids).not.toContain(future.id);
    expect(ids).not.toContain(acknowledged.id);
    expect(ids).not.toContain(noReminder.id);
    expect(ids).not.toContain(deleted.id);
    expect(ids).not.toContain(archived.id);

    // Ordered by remindAt ascending: the earlier one precedes the later one.
    expect(ids.indexOf(dueEarlier.id)).toBeLessThan(ids.indexOf(dueLater.id));
  });

  it("listDueReminders excludes another user's due reminders", async () => {
    const stranger = await prisma.user.create({
      data: { email: `reminder-stranger-${Date.now()}@test.local` },
    });
    throwawayUserIds.push(stranger.id);

    const strangersReminder = await prisma.planningItem.create({
      data: {
        userId: stranger.id,
        title: "stranger's due reminder",
        listId,
        itemTypeId,
        statusId,
        remindAt: new Date("2026-10-01T10:00:00.000Z"),
      },
    });

    const due = await listDueReminders(DEV_USER_ID, new Date("2026-10-01T12:00:00.000Z"));
    const ids = due.map((item) => item.id);

    expect(ids).not.toContain(strangersReminder.id);
  });

  it("markReminderSeen stamps reminderSeenAt on the row", async () => {
    const item = await createPlanningItem({
      userId: DEV_USER_ID,
      title: "reminder to acknowledge",
      description: null,
      listId,
      itemTypeId,
      priorityId: null,
      statusId,
      dueAt: null,
      remindAt: new Date("2026-10-01T10:00:00.000Z"),
    });
    createdItemIds.push(item.id);
    expect(item.reminderSeenAt).toBeNull();

    const seenAt = new Date("2026-10-01T10:05:00.000Z");
    const updated = await markReminderSeen(item.id, seenAt);

    expect(updated.reminderSeenAt?.toISOString()).toBe(seenAt.toISOString());
  });

  it("listRemindersForUser returns in-window reminders (incl. acknowledged) with category, ordered by remindAt", async () => {
    const from = new Date("2026-11-01T00:00:00.000Z");
    const to = new Date("2026-11-08T00:00:00.000Z");
    const base = {
      userId: DEV_USER_ID,
      description: null,
      listId,
      itemTypeId,
      priorityId: null,
      statusId,
      dueAt: null,
    };

    // INCLUDED: two in-window reminders (assert ascending order).
    const late = await createPlanningItem({
      ...base,
      title: "reminder in-window late",
      remindAt: new Date("2026-11-05T10:00:00.000Z"),
    });
    createdItemIds.push(late.id);
    const early = await createPlanningItem({
      ...base,
      title: "reminder in-window early",
      remindAt: new Date("2026-11-02T10:00:00.000Z"),
    });
    createdItemIds.push(early.id);

    // INCLUDED: acknowledged reminder in window (calendar shows all).
    const acknowledged = await createPlanningItem({
      ...base,
      title: "reminder acknowledged in-window",
      remindAt: new Date("2026-11-03T10:00:00.000Z"),
    });
    createdItemIds.push(acknowledged.id);
    await markReminderSeen(acknowledged.id, new Date("2026-11-03T10:05:00.000Z"));

    // EXCLUDED: before / after the window.
    const before = await createPlanningItem({
      ...base,
      title: "reminder before window",
      remindAt: new Date("2026-10-30T10:00:00.000Z"),
    });
    createdItemIds.push(before.id);
    const after = await createPlanningItem({
      ...base,
      title: "reminder after window",
      remindAt: new Date("2026-11-10T10:00:00.000Z"),
    });
    createdItemIds.push(after.id);

    // EXCLUDED: no remindAt.
    const noRemind = await createPlanningItem({
      ...base,
      title: "no reminder in-window",
    });
    createdItemIds.push(noRemind.id);

    // EXCLUDED: soft-deleted / archived despite an in-window remindAt.
    const deleted = await createPlanningItem({
      ...base,
      title: "deleted reminder in-window",
      remindAt: new Date("2026-11-04T10:00:00.000Z"),
    });
    createdItemIds.push(deleted.id);
    await softDeletePlanningItem(deleted.id);

    const archived = await createPlanningItem({
      ...base,
      title: "archived reminder in-window",
      remindAt: new Date("2026-11-04T11:00:00.000Z"),
    });
    createdItemIds.push(archived.id);
    await updatePlanningItem(archived.id, { archived: true });

    const reminders = await listRemindersForUser(DEV_USER_ID, from, to);
    const ids = reminders.map((item) => item.id);

    expect(ids).toContain(early.id);
    expect(ids).toContain(late.id);
    expect(ids).toContain(acknowledged.id);
    expect(ids).not.toContain(before.id);
    expect(ids).not.toContain(after.id);
    expect(ids).not.toContain(noRemind.id);
    expect(ids).not.toContain(deleted.id);
    expect(ids).not.toContain(archived.id);

    // Ordered by remindAt ascending.
    expect(ids.indexOf(early.id)).toBeLessThan(ids.indexOf(late.id));

    // Enriched with the owning category.
    const earlyRow = reminders.find((item) => item.id === early.id);
    expect(earlyRow?.categoryId).toBeDefined();
    expect(typeof earlyRow?.categoryName).toBe("string");
  });

  it("listRemindersForUser excludes another user's in-window reminder", async () => {
    const stranger = await prisma.user.create({
      data: { email: `cal-reminder-stranger-${Date.now()}@test.local` },
    });
    throwawayUserIds.push(stranger.id);

    const strangersReminder = await prisma.planningItem.create({
      data: {
        userId: stranger.id,
        title: "stranger's in-window reminder",
        listId,
        itemTypeId,
        statusId,
        remindAt: new Date("2026-11-05T10:00:00.000Z"),
      },
    });

    const reminders = await listRemindersForUser(
      DEV_USER_ID,
      new Date("2026-11-01T00:00:00.000Z"),
      new Date("2026-11-08T00:00:00.000Z"),
    );

    expect(reminders.map((item) => item.id)).not.toContain(
      strangersReminder.id,
    );
  });

  it("listNotesByUser returns only live nota-type items with category, excluding tasks/deleted/archived/other users", async () => {
    const notaType = await prisma.itemType.findUniqueOrThrow({
      where: { key: "nota" },
    });

    // INCLUDED: two notes (assert newest-first ordering by updatedAt).
    const olderNote = await createPlanningItem({
      userId: DEV_USER_ID,
      title: "older note",
      description: "first",
      listId,
      itemTypeId: notaType.id,
      priorityId: null,
      statusId,
      dueAt: null,
    });
    createdItemIds.push(olderNote.id);
    const newerNote = await createPlanningItem({
      userId: DEV_USER_ID,
      title: "newer note",
      description: "second",
      listId,
      itemTypeId: notaType.id,
      priorityId: null,
      statusId,
      dueAt: null,
    });
    createdItemIds.push(newerNote.id);
    // Bump the older note's updatedAt so the newer-created one is not trivially
    // first; then re-touch the newer so it is the most recent.
    await updatePlanningItem(olderNote.id, { title: "older note" });
    await updatePlanningItem(newerNote.id, { title: "newer note" });

    // EXCLUDED: a task (non-nota) under the same list.
    const task = await createPlanningItem({
      userId: DEV_USER_ID,
      title: "a task, not a note",
      description: null,
      listId,
      itemTypeId,
      priorityId: null,
      statusId,
      dueAt: null,
    });
    createdItemIds.push(task.id);

    // EXCLUDED: a deleted note.
    const deletedNote = await createPlanningItem({
      userId: DEV_USER_ID,
      title: "deleted note",
      description: null,
      listId,
      itemTypeId: notaType.id,
      priorityId: null,
      statusId,
      dueAt: null,
    });
    createdItemIds.push(deletedNote.id);
    await softDeletePlanningItem(deletedNote.id);

    // EXCLUDED: an archived note.
    const archivedNote = await createPlanningItem({
      userId: DEV_USER_ID,
      title: "archived note",
      description: null,
      listId,
      itemTypeId: notaType.id,
      priorityId: null,
      statusId,
      dueAt: null,
    });
    createdItemIds.push(archivedNote.id);
    await updatePlanningItem(archivedNote.id, { archived: true });

    // EXCLUDED: another user's note.
    const stranger = await prisma.user.create({
      data: { email: `note-stranger-${Date.now()}@test.local` },
    });
    throwawayUserIds.push(stranger.id);
    const strangersNote = await prisma.planningItem.create({
      data: {
        userId: stranger.id,
        title: "stranger's note",
        listId,
        itemTypeId: notaType.id,
        statusId,
      },
    });

    const notes = await listNotesByUser(DEV_USER_ID);
    const ids = notes.map((note) => note.id);

    expect(ids).toContain(olderNote.id);
    expect(ids).toContain(newerNote.id);
    expect(ids).not.toContain(task.id);
    expect(ids).not.toContain(deletedNote.id);
    expect(ids).not.toContain(archivedNote.id);
    expect(ids).not.toContain(strangersNote.id);

    // Newest-first: newerNote (touched last) precedes olderNote.
    expect(ids.indexOf(newerNote.id)).toBeLessThan(ids.indexOf(olderNote.id));

    // Enriched with the owning category.
    const row = notes.find((note) => note.id === newerNote.id);
    expect(row?.categoryId).toBeDefined();
    expect(typeof row?.categoryName).toBe("string");
  });
});

/**
 * Integration tests for the calendar range query. Provisions two lists under
 * two owned categories in `beforeAll` (one is the "other" category used to
 * prove category scoping) and seeds items whose schedules straddle a fixed
 * `[from, to)` window. Every row created here is removed in `afterAll`.
 */
describe("listScheduledItemsByCategory (integration)", () => {
  let itemTypeId: string;
  let statusId: string;
  let listId: string;
  let otherListId: string;
  const createdItemIds: string[] = [];

  // Two STABLE seeded categories (fixed ids from `seed.ts`) — the category
  // under test and a second one used to prove category scoping. We deliberately
  // do NOT create/delete a category here: a freshly-created DEV-owned category
  // can be picked by a parallel integration file's `findFirst` and then
  // cascade-deleted when we clean up, corrupting that file's data. Referencing
  // stable seeded categories and only managing our own lists/items keeps the
  // suite deterministic under parallel file execution.
  const categoryId = "dev-cat-trabajo";
  const otherCategoryId = "dev-cat-personal";

  // Fixed window: [from, to). Chosen far in the future to avoid colliding
  // with any seeded scheduling data.
  const from = new Date("2026-06-10T00:00:00.000Z");
  const to = new Date("2026-06-17T00:00:00.000Z");

  beforeAll(async () => {
    const itemType = await prisma.itemType.findFirstOrThrow({
      where: { isDefault: true },
    });
    const status = await prisma.status.findFirstOrThrow({
      where: { isDefault: true },
    });
    itemTypeId = itemType.id;
    statusId = status.id;

    const list = await prisma.list.create({
      data: { categoryId, name: `cal-test-list-${Date.now()}` },
    });
    listId = list.id;

    // A list under the second seeded category, used to prove the query is
    // scoped to a single category (its scheduled item must be excluded).
    const otherList = await prisma.list.create({
      data: { categoryId: otherCategoryId, name: `cal-test-other-list-${Date.now()}` },
    });
    otherListId = otherList.id;
  });

  afterAll(async () => {
    if (createdItemIds.length > 0) {
      await prisma.planningItem.deleteMany({
        where: { id: { in: createdItemIds } },
      });
    }
    // Idempotent: only our own throwaway lists are removed; the seeded
    // categories are left intact.
    const listIds = [listId, otherListId].filter(
      (id): id is string => Boolean(id),
    );
    if (listIds.length > 0) {
      await prisma.list.deleteMany({ where: { id: { in: listIds } } });
    }
  });

  async function seedItem(data: {
    title: string;
    listId: string;
    startAt: Date | null;
    endAt?: Date | null;
    dueAt?: Date | null;
    deletedAt?: Date | null;
  }) {
    const item = await prisma.planningItem.create({
      data: {
        userId: DEV_USER_ID,
        title: data.title,
        listId: data.listId,
        itemTypeId,
        statusId,
        startAt: data.startAt,
        endAt: data.endAt ?? null,
        dueAt: data.dueAt ?? null,
        deletedAt: data.deletedAt ?? null,
      },
    });
    createdItemIds.push(item.id);
    return item;
  }

  it("returns only scheduled, in-range, same-category items and orders them by startAt", async () => {
    // INCLUDED: a point item whose start falls inside the window.
    const inRange = await seedItem({
      title: "cal: in-range point item",
      listId,
      startAt: new Date("2026-06-12T10:00:00.000Z"),
    });

    // INCLUDED: a ranged event that starts BEFORE the window but ends inside
    // it — overlap crossing the `from` boundary.
    const crossingBoundary = await seedItem({
      title: "cal: multi-day crossing the from boundary",
      listId,
      startAt: new Date("2026-06-08T09:00:00.000Z"),
      endAt: new Date("2026-06-11T09:00:00.000Z"),
    });

    // EXCLUDED: unscheduled item (no startAt, deadline only).
    const unscheduled = await seedItem({
      title: "cal: unscheduled (dueAt only)",
      listId,
      startAt: null,
      dueAt: new Date("2026-06-12T10:00:00.000Z"),
    });

    // EXCLUDED: soft-deleted, otherwise in-range.
    const softDeleted = await seedItem({
      title: "cal: soft-deleted in-range",
      listId,
      startAt: new Date("2026-06-13T10:00:00.000Z"),
      deletedAt: new Date(),
    });

    // EXCLUDED: scheduled and in-range but under a different category.
    const otherCategoryItem = await seedItem({
      title: "cal: other category in-range",
      listId: otherListId,
      startAt: new Date("2026-06-12T10:00:00.000Z"),
    });

    // EXCLUDED: starts on/after the `to` boundary (outside the window).
    const afterWindow = await seedItem({
      title: "cal: starts after the to boundary",
      listId,
      startAt: new Date("2026-06-20T10:00:00.000Z"),
    });

    const items = await listScheduledItemsByCategory(
      DEV_USER_ID,
      categoryId,
      from,
      to,
    );
    const ids = items.map((item) => item.id);

    expect(ids).toContain(inRange.id);
    expect(ids).toContain(crossingBoundary.id);
    expect(ids).not.toContain(unscheduled.id);
    expect(ids).not.toContain(softDeleted.id);
    expect(ids).not.toContain(otherCategoryItem.id);
    expect(ids).not.toContain(afterWindow.id);

    // Ordered by startAt asc: the boundary-crossing event (starts 06-08)
    // precedes the in-range point item (starts 06-12).
    expect(ids.indexOf(crossingBoundary.id)).toBeLessThan(
      ids.indexOf(inRange.id),
    );
  });
});

/**
 * Integration tests for the "no double-booking" overlap query. Provisions a
 * throwaway list under a STABLE seeded category owned by the dev user in
 * `beforeAll` (mirrors the calendar suite: referencing a fixed seeded category
 * — never creating/deleting one — keeps the shared DB deterministic). Each
 * scenario seeds its timed items in a DISTINCT time slot so accumulated rows
 * from earlier assertions never cross-contaminate later ones (the query is
 * scoped to the whole user across categories). Every row created here is
 * removed in `afterAll`.
 */
describe("findOverlappingTimedItem (integration)", () => {
  let itemTypeId: string;
  let statusId: string;
  let listId: string;
  const createdItemIds: string[] = [];

  // Stable seeded category (fixed id from `seed.ts`) — see the calendar suite's
  // note on why we reference a seeded category instead of creating one.
  const categoryId = "dev-cat-trabajo";

  beforeAll(async () => {
    const itemType = await prisma.itemType.findFirstOrThrow({
      where: { isDefault: true },
    });
    const status = await prisma.status.findFirstOrThrow({
      where: { isDefault: true },
    });
    itemTypeId = itemType.id;
    statusId = status.id;

    const list = await prisma.list.create({
      data: { categoryId, name: `overlap-test-list-${Date.now()}` },
    });
    listId = list.id;
  });

  afterAll(async () => {
    if (createdItemIds.length > 0) {
      await prisma.planningItem.deleteMany({
        where: { id: { in: createdItemIds } },
      });
    }
    if (listId) {
      await prisma.list.deleteMany({ where: { id: listId } });
    }
  });

  async function seedTimedItem(data: {
    title: string;
    startAt: Date | null;
    endAt?: Date | null;
    allDay?: boolean;
    deletedAt?: Date | null;
  }) {
    const item = await prisma.planningItem.create({
      data: {
        userId: DEV_USER_ID,
        title: data.title,
        listId,
        itemTypeId,
        statusId,
        startAt: data.startAt,
        endAt: data.endAt ?? null,
        allDay: data.allDay ?? false,
        deletedAt: data.deletedAt ?? null,
      },
    });
    createdItemIds.push(item.id);
    return item;
  }

  it("returns the existing item when the query interval overlaps it", async () => {
    const existing = await seedTimedItem({
      title: "overlap: existing 10:00-11:00",
      startAt: new Date("2026-06-15T10:00:00Z"),
      endAt: new Date("2026-06-15T11:00:00Z"),
    });

    const conflict = await findOverlappingTimedItem(
      DEV_USER_ID,
      new Date("2026-06-15T10:30:00Z"),
      new Date("2026-06-15T11:30:00Z"),
    );

    expect(conflict?.id).toBe(existing.id);
  });

  it("returns null when the query only touches an existing item's boundary", async () => {
    await seedTimedItem({
      title: "overlap: existing 14:00-15:00 (boundary)",
      startAt: new Date("2026-06-15T14:00:00Z"),
      endAt: new Date("2026-06-15T15:00:00Z"),
    });

    const conflict = await findOverlappingTimedItem(
      DEV_USER_ID,
      new Date("2026-06-15T15:00:00Z"),
      new Date("2026-06-15T16:00:00Z"),
    );

    expect(conflict).toBeNull();
  });

  it("ignores an all-day item that would otherwise overlap the query", async () => {
    await seedTimedItem({
      title: "overlap: all-day on 2026-06-16",
      startAt: new Date("2026-06-16T00:00:00Z"),
      endAt: new Date("2026-06-17T00:00:00Z"),
      allDay: true,
    });

    const conflict = await findOverlappingTimedItem(
      DEV_USER_ID,
      new Date("2026-06-16T08:00:00Z"),
      new Date("2026-06-16T09:00:00Z"),
    );

    expect(conflict).toBeNull();
  });

  it("skips the item named by excludeId so it never conflicts with itself", async () => {
    const self = await seedTimedItem({
      title: "overlap: excludeId self 2026-06-17 09:00-10:00",
      startAt: new Date("2026-06-17T09:00:00Z"),
      endAt: new Date("2026-06-17T10:00:00Z"),
    });

    const conflict = await findOverlappingTimedItem(
      DEV_USER_ID,
      new Date("2026-06-17T09:15:00Z"),
      new Date("2026-06-17T09:45:00Z"),
      self.id,
    );

    expect(conflict).toBeNull();
  });

  it("ignores a soft-deleted item that would otherwise overlap the query", async () => {
    await seedTimedItem({
      title: "overlap: soft-deleted 2026-06-18 09:00-10:00",
      startAt: new Date("2026-06-18T09:00:00Z"),
      endAt: new Date("2026-06-18T10:00:00Z"),
      deletedAt: new Date(),
    });

    const conflict = await findOverlappingTimedItem(
      DEV_USER_ID,
      new Date("2026-06-18T09:30:00Z"),
      new Date("2026-06-18T10:30:00Z"),
    );

    expect(conflict).toBeNull();
  });
});

/**
 * Integration tests for the combined-calendar range query
 * (`listScheduledItemsForUser`). Unlike `listScheduledItemsByCategory`, this
 * query is scoped to the WHOLE user across ALL categories and flattens each
 * row with its owning category's id/name/color. Provisions two lists under two
 * STABLE seeded categories in `beforeAll` (both owned by the dev user) plus a
 * fully separate "other user" (own category + list) to prove user scoping.
 * Seeds items whose schedules straddle a fixed `[from, to)` window. Every row
 * created here is removed in `afterAll` so reruns stay green.
 */
describe("listScheduledItemsForUser (integration)", () => {
  let itemTypeId: string;
  let statusId: string;
  let trabajoListId: string;
  let personalListId: string;
  const createdItemIds: string[] = [];
  let otherUserId: string | null = null;

  // Two STABLE seeded categories (fixed ids from `seed.ts`), both owned by the
  // dev user. We reference them rather than creating ad-hoc ones so a parallel
  // integration file's `findFirst` can't collide with — and cascade-delete —
  // our data. We only manage our own throwaway lists/items (and one throwaway
  // user), leaving the seeded categories intact.
  const trabajoCategoryId = "dev-cat-trabajo";
  const personalCategoryId = "dev-cat-personal";

  // Fixed window: [from, to). Chosen far in the future to avoid colliding with
  // any seeded scheduling data.
  const from = new Date("2026-07-10T00:00:00.000Z");
  const to = new Date("2026-07-17T00:00:00.000Z");

  beforeAll(async () => {
    const itemType = await prisma.itemType.findFirstOrThrow({
      where: { isDefault: true },
    });
    const status = await prisma.status.findFirstOrThrow({
      where: { isDefault: true },
    });
    itemTypeId = itemType.id;
    statusId = status.id;

    const trabajoList = await prisma.list.create({
      data: { categoryId: trabajoCategoryId, name: `combined-cal-trabajo-${Date.now()}` },
    });
    trabajoListId = trabajoList.id;

    const personalList = await prisma.list.create({
      data: { categoryId: personalCategoryId, name: `combined-cal-personal-${Date.now()}` },
    });
    personalListId = personalList.id;
  });

  afterAll(async () => {
    if (createdItemIds.length > 0) {
      await prisma.planningItem.deleteMany({
        where: { id: { in: createdItemIds } },
      });
    }
    // Idempotent: only our own throwaway lists are removed; the seeded
    // categories are left intact.
    const listIds = [trabajoListId, personalListId].filter(
      (id): id is string => Boolean(id),
    );
    if (listIds.length > 0) {
      await prisma.list.deleteMany({ where: { id: { in: listIds } } });
    }
    // Cascades and removes the throwaway user's category, list, and item.
    if (otherUserId) {
      await prisma.user.deleteMany({ where: { id: otherUserId } });
    }
  });

  async function seedItem(data: {
    title: string;
    listId: string;
    userId?: string;
    startAt: Date | null;
    endAt?: Date | null;
    dueAt?: Date | null;
    deletedAt?: Date | null;
  }) {
    const item = await prisma.planningItem.create({
      data: {
        userId: data.userId ?? DEV_USER_ID,
        title: data.title,
        listId: data.listId,
        itemTypeId,
        statusId,
        startAt: data.startAt,
        endAt: data.endAt ?? null,
        dueAt: data.dueAt ?? null,
        deletedAt: data.deletedAt ?? null,
      },
    });
    createdItemIds.push(item.id);
    return item;
  }

  it("returns the user's scheduled, in-range items ACROSS multiple categories", async () => {
    // INCLUDED: an in-range point item under the "trabajo" category.
    const trabajoItem = await seedItem({
      title: "combined: trabajo in-range point item",
      listId: trabajoListId,
      startAt: new Date("2026-07-12T10:00:00.000Z"),
    });

    // INCLUDED: an in-range point item under the "personal" category — proving
    // the query spans categories rather than being scoped to a single one.
    const personalItem = await seedItem({
      title: "combined: personal in-range point item",
      listId: personalListId,
      startAt: new Date("2026-07-13T10:00:00.000Z"),
    });

    const items = await listScheduledItemsForUser(DEV_USER_ID, from, to);
    const ids = items.map((item) => item.id);

    expect(ids).toContain(trabajoItem.id);
    expect(ids).toContain(personalItem.id);
  });

  it("respects the [from, to) overlap, including a multi-day event crossing the from boundary", async () => {
    // INCLUDED: a ranged event that starts BEFORE the window but ends inside
    // it — overlap crossing the `from` boundary.
    const crossingBoundary = await seedItem({
      title: "combined: multi-day crossing the from boundary",
      listId: trabajoListId,
      startAt: new Date("2026-07-08T09:00:00.000Z"),
      endAt: new Date("2026-07-11T09:00:00.000Z"),
    });

    // INCLUDED: a point item whose start falls inside the window.
    const inRange = await seedItem({
      title: "combined: in-range point item",
      listId: personalListId,
      startAt: new Date("2026-07-12T10:00:00.000Z"),
    });

    // EXCLUDED: unscheduled item (no startAt, deadline only).
    const unscheduled = await seedItem({
      title: "combined: unscheduled (dueAt only)",
      listId: trabajoListId,
      startAt: null,
      dueAt: new Date("2026-07-12T10:00:00.000Z"),
    });

    // EXCLUDED: starts on/after the `to` boundary (outside the window).
    const afterWindow = await seedItem({
      title: "combined: starts after the to boundary",
      listId: personalListId,
      startAt: new Date("2026-07-20T10:00:00.000Z"),
    });

    const items = await listScheduledItemsForUser(DEV_USER_ID, from, to);
    const ids = items.map((item) => item.id);

    expect(ids).toContain(crossingBoundary.id);
    expect(ids).toContain(inRange.id);
    expect(ids).not.toContain(unscheduled.id);
    expect(ids).not.toContain(afterWindow.id);

    // Ordered by startAt asc: the boundary-crossing event (starts 07-08)
    // precedes the in-range point item (starts 07-12).
    expect(ids.indexOf(crossingBoundary.id)).toBeLessThan(
      ids.indexOf(inRange.id),
    );
  });

  it("flattens each item with its owning category's id, name, and color from the join", async () => {
    const trabajoCategory = await prisma.category.findUniqueOrThrow({
      where: { id: trabajoCategoryId },
    });

    const item = await seedItem({
      title: "combined: carries its category fields",
      listId: trabajoListId,
      startAt: new Date("2026-07-14T10:00:00.000Z"),
    });

    const items = await listScheduledItemsForUser(DEV_USER_ID, from, to);
    const found = items.find((row) => row.id === item.id);

    expect(found).toBeDefined();
    expect(found?.categoryId).toBe(trabajoCategoryId);
    expect(found?.categoryName).toBe(trabajoCategory.name);
    expect(found?.categoryColor).toBe(trabajoCategory.color);
  });

  it("excludes soft-deleted items and items owned by other users", async () => {
    // EXCLUDED: soft-deleted, otherwise in-range.
    const softDeleted = await seedItem({
      title: "combined: soft-deleted in-range",
      listId: trabajoListId,
      startAt: new Date("2026-07-15T10:00:00.000Z"),
      deletedAt: new Date(),
    });

    // EXCLUDED: an in-range item owned by a fully separate user (own category
    // + list). Proves user scoping across the whole account.
    const otherUser = await prisma.user.create({
      data: { email: `combined-other-${Date.now()}@test.local` },
    });
    otherUserId = otherUser.id;
    const otherCategory = await prisma.category.create({
      data: {
        userId: otherUser.id,
        name: `combined-other-cat-${Date.now()}`,
      },
    });
    const otherList = await prisma.list.create({
      data: { categoryId: otherCategory.id, name: `combined-other-list-${Date.now()}` },
    });
    const otherUsersItem = await seedItem({
      title: "combined: other user's in-range item",
      listId: otherList.id,
      userId: otherUser.id,
      startAt: new Date("2026-07-13T10:00:00.000Z"),
    });

    const items = await listScheduledItemsForUser(DEV_USER_ID, from, to);
    const ids = items.map((item) => item.id);

    expect(ids).not.toContain(softDeleted.id);
    expect(ids).not.toContain(otherUsersItem.id);
  });
});
