import type { Category } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEV_USER_ID } from "../lib/dev-user";
import { NotFoundError } from "../lib/errors";

// getCurrentUserId now reads the Auth.js session; stub it so these stay
// true unit tests isolated from auth.
vi.mock("../lib/current-user", () => ({
  getCurrentUserId: vi.fn().mockResolvedValue("dev-user-000000000000000000000"),
}));

vi.mock("../repositories/category.repository", () => ({
  createCategory: vi.fn(),
  deleteCategoryWithCascade: vi.fn(),
  findOwnedCategory: vi.fn(),
  listActiveCategories: vi.fn(),
  updateCategory: vi.fn(),
}));

import {
  createCategory,
  deleteCategoryWithCascade,
  findOwnedCategory,
  listActiveCategories,
  updateCategory,
} from "../repositories/category.repository";
import {
  createCategoryForCurrentUser,
  deleteCategoryForCurrentUser,
  getCategoryForCurrentUser,
  listCategoriesForCurrentUser,
  updateCategoryForCurrentUser,
} from "./category.service";

const mockCreate = vi.mocked(createCategory);
const mockDeleteWithCascade = vi.mocked(deleteCategoryWithCascade);
const mockFindOwned = vi.mocked(findOwnedCategory);
const mockListActive = vi.mocked(listActiveCategories);
const mockUpdate = vi.mocked(updateCategory);

describe("createCategoryForCurrentUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves the current (stub) user and forwards defaults for omitted optional fields", async () => {
    const created = { id: "cat-1" } as Category;
    mockCreate.mockResolvedValue(created);

    const result = await createCategoryForCurrentUser({ name: "Work" });

    expect(mockCreate).toHaveBeenCalledWith({
      userId: DEV_USER_ID,
      name: "Work",
      color: null,
      icon: null,
      sortOrder: undefined,
    });
    expect(result).toBe(created);
  });

  it("forwards optional fields when provided", async () => {
    const created = { id: "cat-1" } as Category;
    mockCreate.mockResolvedValue(created);

    await createCategoryForCurrentUser({
      name: "Work",
      color: "#3B82F6",
      icon: "briefcase",
      sortOrder: 2,
    });

    expect(mockCreate).toHaveBeenCalledWith({
      userId: DEV_USER_ID,
      name: "Work",
      color: "#3B82F6",
      icon: "briefcase",
      sortOrder: 2,
    });
  });
});

describe("listCategoriesForCurrentUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("scopes the list to the current (stub) user", async () => {
    const categories = [{ id: "cat-1" }, { id: "cat-2" }] as Category[];
    mockListActive.mockResolvedValue(categories);

    const result = await listCategoriesForCurrentUser();

    expect(mockListActive).toHaveBeenCalledWith(DEV_USER_ID);
    expect(result).toBe(categories);
  });
});

describe("getCategoryForCurrentUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the category when owned by the current user", async () => {
    const category = { id: "cat-1" } as Category;
    mockFindOwned.mockResolvedValue(category);

    const result = await getCategoryForCurrentUser("cat-1");

    expect(mockFindOwned).toHaveBeenCalledWith(DEV_USER_ID, "cat-1");
    expect(result).toBe(category);
  });

  it("throws NotFoundError when the repository returns null (not found or not owned)", async () => {
    mockFindOwned.mockResolvedValue(null);

    await expect(getCategoryForCurrentUser("cat-1")).rejects.toThrow(
      NotFoundError,
    );
  });
});

describe("updateCategoryForCurrentUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws NotFoundError before attempting an update when the category is not owned", async () => {
    mockFindOwned.mockResolvedValue(null);

    await expect(
      updateCategoryForCurrentUser("cat-1", { sortOrder: 3 }),
    ).rejects.toThrow(NotFoundError);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("updates only the fields present in the input (sortOrder)", async () => {
    mockFindOwned.mockResolvedValue({ id: "cat-1" } as Category);
    const updated = { id: "cat-1", sortOrder: 3 } as Category;
    mockUpdate.mockResolvedValue(updated);

    const result = await updateCategoryForCurrentUser("cat-1", {
      sortOrder: 3,
    });

    expect(mockUpdate).toHaveBeenCalledWith("cat-1", { sortOrder: 3 });
    expect(result).toBe(updated);
  });
});

describe("deleteCategoryForCurrentUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delegates the cascade-archive to the repository, scoped to the current user", async () => {
    mockDeleteWithCascade.mockResolvedValue(undefined);

    await deleteCategoryForCurrentUser("cat-1");

    expect(mockDeleteWithCascade).toHaveBeenCalledWith(DEV_USER_ID, "cat-1");
  });

  it("propagates the NotFoundError the repository throws for a not-owned category", async () => {
    mockDeleteWithCascade.mockRejectedValue(
      new NotFoundError("category not found"),
    );

    await expect(deleteCategoryForCurrentUser("cat-1")).rejects.toThrow(
      NotFoundError,
    );
  });
});
