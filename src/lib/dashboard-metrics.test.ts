import type { Category, List, PlanningItem, Status } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { computeDashboard } from "./dashboard-metrics";

/**
 * Fixed reference instant: 2026-06-15 12:00:00 in the LOCAL timezone. Building
 * every `dueAt`/`startAt` relative to this keeps local-day math deterministic
 * regardless of where the suite runs.
 */
const NOW = new Date(2026, 5, 15, 12, 0, 0);

/** Local date helper: builds a Date within the local day math of the tests. */
function at(
  year: number,
  monthIndex: number,
  day: number,
  hour = 0,
  minute = 0,
): Date {
  return new Date(year, monthIndex, day, hour, minute, 0);
}

// --- Status fixtures (only id + key matter to the module) --------------------
const completado = { id: "st-completed", key: "completado" } as Status;
const cancelado = { id: "st-cancelled", key: "cancelado" } as Status;
const pendiente = { id: "st-pending", key: "pendiente" } as Status;
const enProgreso = { id: "st-inprogress", key: "en_progreso" } as Status;
const STATUSES: Status[] = [completado, cancelado, pendiente, enProgreso];

// --- Category / List fixtures ------------------------------------------------
const catA = { id: "cat-a" } as Category;
const catB = { id: "cat-b" } as Category;

const listA1 = { id: "list-a1", categoryId: "cat-a" } as List;
const listA2 = { id: "list-a2", categoryId: "cat-a" } as List;
const listB1 = { id: "list-b1", categoryId: "cat-b" } as List;

let taskSeq = 0;

/** Lightweight PlanningItem factory: only the fields the module reads. */
function task(overrides: Partial<PlanningItem>): PlanningItem {
  return {
    id: `task-${++taskSeq}`,
    listId: listA1.id,
    statusId: pendiente.id,
    dueAt: null,
    startAt: null,
    ...overrides,
  } as PlanningItem;
}

describe("computeDashboard — open/completed partition (4.1)", () => {
  it("counts completado as completed, not open", () => {
    const tasks = [task({ statusId: completado.id })];
    const { summary, categories } = computeDashboard(
      tasks,
      [catA],
      [listA1],
      STATUSES,
      NOW,
    );

    expect(summary.open).toBe(0);
    expect(categories[0].completed).toBe(1);
    expect(categories[0].open).toBe(0);
  });

  it("counts cancelado as neither open nor completed", () => {
    const tasks = [task({ statusId: cancelado.id })];
    const { summary, categories } = computeDashboard(
      tasks,
      [catA],
      [listA1],
      STATUSES,
      NOW,
    );

    expect(summary.open).toBe(0);
    expect(categories[0].completed).toBe(0);
    expect(categories[0].open).toBe(0);
    expect(categories[0].openByStatusId).toEqual({});
  });

  it("counts any other status (pendiente, en_progreso) as open", () => {
    const tasks = [
      task({ statusId: pendiente.id }),
      task({ statusId: enProgreso.id }),
    ];
    const { summary, categories } = computeDashboard(
      tasks,
      [catA],
      [listA1],
      STATUSES,
      NOW,
    );

    expect(summary.open).toBe(2);
    expect(categories[0].completed).toBe(0);
    expect(categories[0].openByStatusId).toEqual({
      [pendiente.id]: 1,
      [enProgreso.id]: 1,
    });
  });
});

describe("computeDashboard — overdue (2.1 / 4.2)", () => {
  it("counts an open task whose dueAt is before now as overdue", () => {
    const tasks = [task({ dueAt: at(2026, 5, 14, 9, 0) })]; // yesterday
    const { summary } = computeDashboard(
      tasks,
      [catA],
      [listA1],
      STATUSES,
      NOW,
    );

    expect(summary.overdue).toBe(1);
  });

  it("does not count a task whose dueAt is in the future", () => {
    const tasks = [task({ dueAt: at(2026, 5, 16, 9, 0) })]; // tomorrow
    const { summary } = computeDashboard(
      tasks,
      [catA],
      [listA1],
      STATUSES,
      NOW,
    );

    expect(summary.overdue).toBe(0);
  });

  it("does not count a task with a null dueAt as overdue", () => {
    const tasks = [task({ dueAt: null })];
    const { summary } = computeDashboard(
      tasks,
      [catA],
      [listA1],
      STATUSES,
      NOW,
    );

    expect(summary.overdue).toBe(0);
  });

  it("does NOT count a completed overdue task (only open tasks are overdue)", () => {
    const tasks = [
      task({ statusId: completado.id, dueAt: at(2026, 5, 10, 9, 0) }),
    ];
    const { summary, categories } = computeDashboard(
      tasks,
      [catA],
      [listA1],
      STATUSES,
      NOW,
    );

    expect(summary.overdue).toBe(0);
    expect(categories[0].completed).toBe(1);
  });
});

describe("computeDashboard — due today (2.2)", () => {
  it("counts an open task whose dueAt falls within the local day of now", () => {
    const tasks = [task({ dueAt: at(2026, 5, 15, 18, 0) })]; // later today
    const { summary } = computeDashboard(
      tasks,
      [catA],
      [listA1],
      STATUSES,
      NOW,
    );

    expect(summary.dueToday).toBe(1);
  });

  it("counts an open task whose startAt falls within the local day of now", () => {
    const tasks = [task({ startAt: at(2026, 5, 15, 8, 0) })]; // this morning
    const { summary } = computeDashboard(
      tasks,
      [catA],
      [listA1],
      STATUSES,
      NOW,
    );

    expect(summary.dueToday).toBe(1);
  });

  it("counts a task only once even when both dueAt and startAt fall today", () => {
    const tasks = [
      task({
        dueAt: at(2026, 5, 15, 20, 0),
        startAt: at(2026, 5, 15, 8, 0),
      }),
    ];
    const { summary } = computeDashboard(
      tasks,
      [catA],
      [listA1],
      STATUSES,
      NOW,
    );

    expect(summary.dueToday).toBe(1);
  });
});

describe("computeDashboard — upcoming (2.3)", () => {
  it("counts an open task whose dueAt falls within [startOfTomorrow, +7 days)", () => {
    const tasks = [task({ dueAt: at(2026, 5, 18, 10, 0) })]; // 3 days out
    const { summary } = computeDashboard(
      tasks,
      [catA],
      [listA1],
      STATUSES,
      NOW,
    );

    expect(summary.upcoming).toBe(1);
  });

  it("counts an open task whose startAt falls within the upcoming window", () => {
    const tasks = [task({ startAt: at(2026, 5, 16, 0, 0) })]; // start of tomorrow
    const { summary } = computeDashboard(
      tasks,
      [catA],
      [listA1],
      STATUSES,
      NOW,
    );

    expect(summary.upcoming).toBe(1);
  });

  it("excludes a task scheduled later than 7 days out", () => {
    // Window is [2026-06-16 00:00, 2026-06-23 00:00). This is exactly the end.
    const tasks = [task({ dueAt: at(2026, 5, 23, 0, 0) })];
    const { summary } = computeDashboard(
      tasks,
      [catA],
      [listA1],
      STATUSES,
      NOW,
    );

    expect(summary.upcoming).toBe(0);
  });

  it("does NOT count a task due today as upcoming", () => {
    const tasks = [task({ dueAt: at(2026, 5, 15, 20, 0) })];
    const { summary } = computeDashboard(
      tasks,
      [catA],
      [listA1],
      STATUSES,
      NOW,
    );

    expect(summary.dueToday).toBe(1);
    expect(summary.upcoming).toBe(0);
  });
});

describe("computeDashboard — deleted/absent lists excluded (6.2)", () => {
  it("excludes tasks whose listId is not present in lists", () => {
    const tasks = [
      task({ listId: "list-deleted", statusId: pendiente.id }),
      task({ listId: listA1.id, statusId: pendiente.id }),
    ];
    const { summary, categories } = computeDashboard(
      tasks,
      [catA],
      [listA1],
      STATUSES,
      NOW,
    );

    expect(summary.open).toBe(1);
    expect(categories[0].open).toBe(1);
  });
});

describe("computeDashboard — per-category grouping (3.2 / 3.3)", () => {
  it("maps tasks to their category via list.categoryId", () => {
    const tasks = [
      task({ listId: listA1.id, statusId: pendiente.id }),
      task({ listId: listB1.id, statusId: pendiente.id }),
    ];
    const { categories } = computeDashboard(
      tasks,
      [catA, catB],
      [listA1, listB1],
      STATUSES,
      NOW,
    );

    const a = categories.find((c) => c.categoryId === catA.id)!;
    const b = categories.find((c) => c.categoryId === catB.id)!;
    expect(a.open).toBe(1);
    expect(b.open).toBe(1);
  });

  it("accumulates open counts per status id in openByStatusId", () => {
    const tasks = [
      task({ statusId: pendiente.id }),
      task({ statusId: pendiente.id }),
      task({ statusId: enProgreso.id }),
      task({ statusId: completado.id }), // completed excluded from openByStatusId
    ];
    const { categories } = computeDashboard(
      tasks,
      [catA],
      [listA1],
      STATUSES,
      NOW,
    );

    expect(categories[0].openByStatusId).toEqual({
      [pendiente.id]: 2,
      [enProgreso.id]: 1,
    });
  });

  it("attaches each category's lists", () => {
    const { categories } = computeDashboard(
      [],
      [catA, catB],
      [listA1, listA2, listB1],
      STATUSES,
      NOW,
    );

    const a = categories.find((c) => c.categoryId === catA.id)!;
    const b = categories.find((c) => c.categoryId === catB.id)!;
    expect(a.lists).toEqual([listA1, listA2]);
    expect(b.lists).toEqual([listB1]);
  });

  it("yields zeroed stats for a category with no tasks but keeps it present", () => {
    const tasks = [task({ listId: listA1.id, statusId: pendiente.id })];
    const { categories } = computeDashboard(
      tasks,
      [catA, catB],
      [listA1, listB1],
      STATUSES,
      NOW,
    );

    const b = categories.find((c) => c.categoryId === catB.id)!;
    expect(b).toBeDefined();
    expect(b.open).toBe(0);
    expect(b.overdue).toBe(0);
    expect(b.dueToday).toBe(0);
    expect(b.upcoming).toBe(0);
    expect(b.completed).toBe(0);
    expect(b.openByStatusId).toEqual({});
  });
});

describe("computeDashboard — summary = sum of categories (4.3 / 2.5)", () => {
  it("each summary metric equals the sum across categories", () => {
    const tasks = [
      // Category A: overdue + due today (dueAt this morning is both)
      task({ listId: listA1.id, statusId: pendiente.id, dueAt: at(2026, 5, 15, 9, 0) }),
      // Category A: upcoming
      task({ listId: listA2.id, statusId: enProgreso.id, dueAt: at(2026, 5, 18, 9, 0) }),
      // Category B: upcoming
      task({ listId: listB1.id, statusId: pendiente.id, startAt: at(2026, 5, 17, 9, 0) }),
      // Category B: completed (does not affect open-based sums)
      task({ listId: listB1.id, statusId: completado.id }),
    ];
    const { summary, categories } = computeDashboard(
      tasks,
      [catA, catB],
      [listA1, listA2, listB1],
      STATUSES,
      NOW,
    );

    const sum = (pick: (c: (typeof categories)[number]) => number) =>
      categories.reduce((acc, c) => acc + pick(c), 0);

    expect(summary.open).toBe(sum((c) => c.open));
    expect(summary.overdue).toBe(sum((c) => c.overdue));
    expect(summary.dueToday).toBe(sum((c) => c.dueToday));
    expect(summary.upcoming).toBe(sum((c) => c.upcoming));

    // Sanity on the concrete totals for this fixture.
    expect(summary.open).toBe(3);
    expect(summary.overdue).toBe(1);
    expect(summary.dueToday).toBe(1);
    expect(summary.upcoming).toBe(2);
  });

  it("yields an all-zero summary for empty inputs", () => {
    const { summary, categories } = computeDashboard(
      [],
      [],
      [],
      STATUSES,
      NOW,
    );

    expect(summary).toEqual({ open: 0, overdue: 0, dueToday: 0, upcoming: 0 });
    expect(categories).toEqual([]);
  });
});

describe("computeDashboard — toDate coercion", () => {
  it("coerces an ISO string dueAt into a Date for bucketing", () => {
    // ISO string for later today in local time. Using an explicit local-time
    // string (no trailing Z) so it lands within the local day of NOW.
    const tasks = [
      task({ statusId: pendiente.id, dueAt: "2026-06-15T18:00:00" as unknown as Date }),
    ];
    const { summary } = computeDashboard(
      tasks,
      [catA],
      [listA1],
      STATUSES,
      NOW,
    );

    expect(summary.dueToday).toBe(1);
    expect(summary.overdue).toBe(0);
  });
});
