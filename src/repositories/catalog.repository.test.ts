import { describe, expect, it } from "vitest";
import { prisma } from "../lib/prisma";
import {
  listActiveItemTypes,
  listActivePriorities,
  listActiveStatuses,
} from "./catalog.repository";

/**
 * Integration tests against the real, seeded Postgres instance (see
 * `docker-compose.yml` / `pnpm db:seed`). Read-only — this suite creates no
 * rows and relies on the seeded catalog data.
 */
describe("catalog repository (integration)", () => {
  it("returns the seeded active item types, display-ordered", async () => {
    const itemTypes = await listActiveItemTypes();

    expect(itemTypes.length).toBeGreaterThan(0);
    expect(itemTypes.every((it) => it.active)).toBe(true);

    const sortOrders = itemTypes.map((it) => it.sortOrder);
    expect(sortOrders).toEqual([...sortOrders].sort((a, b) => a - b));
  });

  it("returns the seeded active priorities, display-ordered", async () => {
    const priorities = await listActivePriorities();

    expect(priorities.length).toBeGreaterThan(0);
    expect(priorities.every((p) => p.active)).toBe(true);

    const sortOrders = priorities.map((p) => p.sortOrder);
    expect(sortOrders).toEqual([...sortOrders].sort((a, b) => a - b));
  });

  it("returns the seeded active statuses, display-ordered", async () => {
    const statuses = await listActiveStatuses();

    expect(statuses.length).toBeGreaterThan(0);
    expect(statuses.every((s) => s.active)).toBe(true);

    const sortOrders = statuses.map((s) => s.sortOrder);
    expect(sortOrders).toEqual([...sortOrders].sort((a, b) => a - b));
  });

  it("gives every active item type a color and an icon", async () => {
    const itemTypes = await listActiveItemTypes();

    expect(itemTypes.length).toBeGreaterThan(0);
    expect(
      itemTypes.every((it) => typeof it.color === "string" && it.color.length > 0),
    ).toBe(true);
    expect(
      itemTypes.every((it) => typeof it.icon === "string" && it.icon.length > 0),
    ).toBe(true);
  });

  it("assigns a distinct color to each active item type", async () => {
    const itemTypes = await listActiveItemTypes();

    const colors = itemTypes.map((it) => it.color);
    expect(new Set(colors).size).toBe(colors.length);
  });

  it("gives the default item type its known icon", async () => {
    const itemTypes = await listActiveItemTypes();

    const defaultType = itemTypes.find((it) => it.isDefault);
    expect(defaultType?.key).toBe("tarea");
    expect(defaultType?.icon).toBe("ListChecks");
  });

  it("excludes inactive rows from the item type listing", async () => {
    const inactive = await prisma.itemType.create({
      data: {
        key: `inactive-${Date.now()}`,
        name: "Inactive type",
        active: false,
      },
    });

    try {
      const itemTypes = await listActiveItemTypes();
      expect(itemTypes.map((it) => it.id)).not.toContain(inactive.id);
    } finally {
      await prisma.itemType.delete({ where: { id: inactive.id } });
    }
  });
});
