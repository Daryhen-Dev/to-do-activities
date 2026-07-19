import type { Category, List } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEV_USER_ID } from "../lib/current-user";
import { NotFoundError } from "../lib/errors";

vi.mock("../repositories/list.repository", () => ({
  createList: vi.fn(),
  findOwnedList: vi.fn(),
  listActiveListsByCategory: vi.fn(),
  softDeleteList: vi.fn(),
  updateList: vi.fn(),
}));

vi.mock("../repositories/category.repository", () => ({
  findOwnedCategory: vi.fn(),
}));

import { findOwnedCategory } from "../repositories/category.repository";
import {
  createList,
  findOwnedList,
  listActiveListsByCategory,
  softDeleteList,
  updateList,
} from "../repositories/list.repository";
import {
  createListForCurrentUser,
  deleteListForCurrentUser,
  getListForCurrentUser,
  listListsForCategory,
  updateListForCurrentUser,
} from "./list.service";

const mockFindOwnedCategory = vi.mocked(findOwnedCategory);
const mockCreate = vi.mocked(createList);
const mockFindOwnedList = vi.mocked(findOwnedList);
const mockListByCategory = vi.mocked(listActiveListsByCategory);
const mockSoftDelete = vi.mocked(softDeleteList);
const mockUpdate = vi.mocked(updateList);

const ownedCategory = { id: "cat-1", userId: DEV_USER_ID } as Category;

describe("createListForCurrentUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("verifies category ownership then creates the list", async () => {
    mockFindOwnedCategory.mockResolvedValue(ownedCategory);
    const created = { id: "list-1", name: "Groceries" } as List;
    mockCreate.mockResolvedValue(created);

    const result = await createListForCurrentUser({
      categoryId: "cat-1",
      name: "Groceries",
      sortOrder: 2,
    });

    expect(mockFindOwnedCategory).toHaveBeenCalledWith(DEV_USER_ID, "cat-1");
    expect(mockCreate).toHaveBeenCalledWith({
      categoryId: "cat-1",
      name: "Groceries",
      sortOrder: 2,
    });
    expect(result).toBe(created);
  });

  it("throws NotFoundError and never creates when the category is not owned", async () => {
    mockFindOwnedCategory.mockResolvedValue(null);

    await expect(
      createListForCurrentUser({ categoryId: "cat-x", name: "Groceries" }),
    ).rejects.toThrow(NotFoundError);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe("listListsForCategory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("verifies ownership then returns the category's lists", async () => {
    mockFindOwnedCategory.mockResolvedValue(ownedCategory);
    const lists = [{ id: "list-1" }, { id: "list-2" }] as List[];
    mockListByCategory.mockResolvedValue(lists);

    const result = await listListsForCategory("cat-1");

    expect(mockFindOwnedCategory).toHaveBeenCalledWith(DEV_USER_ID, "cat-1");
    expect(mockListByCategory).toHaveBeenCalledWith("cat-1");
    expect(result).toBe(lists);
  });

  it("throws NotFoundError when the category is not owned", async () => {
    mockFindOwnedCategory.mockResolvedValue(null);

    await expect(listListsForCategory("cat-x")).rejects.toThrow(NotFoundError);
    expect(mockListByCategory).not.toHaveBeenCalled();
  });
});

describe("getListForCurrentUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the owned list", async () => {
    const list = { id: "list-1" } as List;
    mockFindOwnedList.mockResolvedValue(list);

    const result = await getListForCurrentUser("list-1");

    expect(mockFindOwnedList).toHaveBeenCalledWith(DEV_USER_ID, "list-1");
    expect(result).toBe(list);
  });

  it("throws NotFoundError when the list is not found or not owned", async () => {
    mockFindOwnedList.mockResolvedValue(null);

    await expect(getListForCurrentUser("missing")).rejects.toThrow(
      NotFoundError,
    );
  });
});

describe("updateListForCurrentUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("prechecks ownership and forwards only the provided fields", async () => {
    mockFindOwnedList.mockResolvedValue({ id: "list-1" } as List);
    const updated = { id: "list-1", name: "Renamed" } as List;
    mockUpdate.mockResolvedValue(updated);

    const result = await updateListForCurrentUser("list-1", { name: "Renamed" });

    expect(mockFindOwnedList).toHaveBeenCalledWith(DEV_USER_ID, "list-1");
    expect(mockUpdate).toHaveBeenCalledWith("list-1", { name: "Renamed" });
    expect(result).toBe(updated);
  });

  it("throws NotFoundError and never updates when the list is not owned", async () => {
    mockFindOwnedList.mockResolvedValue(null);

    await expect(
      updateListForCurrentUser("missing", { name: "x" }),
    ).rejects.toThrow(NotFoundError);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe("deleteListForCurrentUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("prechecks ownership then soft-deletes", async () => {
    mockFindOwnedList.mockResolvedValue({ id: "list-1" } as List);
    mockSoftDelete.mockResolvedValue();

    await deleteListForCurrentUser("list-1");

    expect(mockFindOwnedList).toHaveBeenCalledWith(DEV_USER_ID, "list-1");
    expect(mockSoftDelete).toHaveBeenCalledWith("list-1");
  });

  it("throws NotFoundError and never deletes when the list is not owned", async () => {
    mockFindOwnedList.mockResolvedValue(null);

    await expect(deleteListForCurrentUser("missing")).rejects.toThrow(
      NotFoundError,
    );
    expect(mockSoftDelete).not.toHaveBeenCalled();
  });
});
