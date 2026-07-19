import type { ItemType, Priority, Status } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../repositories/catalog.repository", () => ({
  listActiveItemTypes: vi.fn(),
  listActivePriorities: vi.fn(),
  listActiveStatuses: vi.fn(),
}));

import {
  listActiveItemTypes,
  listActivePriorities,
  listActiveStatuses,
} from "../repositories/catalog.repository";
import {
  listItemTypes,
  listPriorities,
  listStatuses,
} from "./catalog.service";

const mockItemTypes = vi.mocked(listActiveItemTypes);
const mockPriorities = vi.mocked(listActivePriorities);
const mockStatuses = vi.mocked(listActiveStatuses);

describe("catalog.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("listItemTypes delegates to the repository", async () => {
    const rows = [{ id: "it-1" }] as ItemType[];
    mockItemTypes.mockResolvedValue(rows);

    const result = await listItemTypes();

    expect(mockItemTypes).toHaveBeenCalledOnce();
    expect(result).toBe(rows);
  });

  it("listPriorities delegates to the repository", async () => {
    const rows = [{ id: "p-1" }] as Priority[];
    mockPriorities.mockResolvedValue(rows);

    const result = await listPriorities();

    expect(mockPriorities).toHaveBeenCalledOnce();
    expect(result).toBe(rows);
  });

  it("listStatuses delegates to the repository", async () => {
    const rows = [{ id: "s-1" }] as Status[];
    mockStatuses.mockResolvedValue(rows);

    const result = await listStatuses();

    expect(mockStatuses).toHaveBeenCalledOnce();
    expect(result).toBe(rows);
  });
});
