import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Category, List } from "@prisma/client";
import { useWorkspaceStore } from "./workspace-store";

/**
 * Unit tests for the shared workspace Zustand store.
 *
 * The store is a module-level singleton, so each test resets it to a clean
 * "idle" state in beforeEach and restores the mocked global fetch afterwards.
 * State and actions are accessed outside React via getState().
 *
 * Covers Requirement 6.1 (ensureLoaded guards against duplicate fetches) and
 * Requirement 6.2 (removeCategory cascades to the category's lists).
 */

function category(id: string, name = id): Category {
  return { id, name } as Category;
}

function list(id: string, categoryId: string, name = id): List {
  return { id, categoryId, name } as List;
}

/** Builds a fetch mock whose responses are keyed by URL substring. */
function mockFetch(payloads: { categories: Category[]; lists: List[] }) {
  return vi.fn(async (input: string) => {
    const url = String(input);
    const data = url.includes("/api/categories")
      ? payloads.categories
      : payloads.lists;
    return { ok: true, json: async () => data } as Response;
  });
}

beforeEach(() => {
  useWorkspaceStore.setState({ categories: [], lists: [], status: "idle" });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("category mutators", () => {
  it("addCategory appends to the categories list", () => {
    const { addCategory } = useWorkspaceStore.getState();

    addCategory(category("cat-1"));
    addCategory(category("cat-2"));

    expect(useWorkspaceStore.getState().categories.map((c) => c.id)).toEqual([
      "cat-1",
      "cat-2",
    ]);
  });

  it("updateCategory replaces the matching category and leaves others intact", () => {
    useWorkspaceStore.setState({
      categories: [category("cat-1", "Old"), category("cat-2", "Two")],
      lists: [],
      status: "ready",
    });

    useWorkspaceStore.getState().updateCategory(category("cat-1", "New"));

    const categories = useWorkspaceStore.getState().categories;
    expect(categories).toHaveLength(2);
    expect(categories.find((c) => c.id === "cat-1")?.name).toBe("New");
    expect(categories.find((c) => c.id === "cat-2")?.name).toBe("Two");
  });

  it("removeCategory removes the category AND all its lists, leaving others intact", () => {
    useWorkspaceStore.setState({
      categories: [category("cat-1"), category("cat-2")],
      lists: [
        list("list-1", "cat-1"),
        list("list-2", "cat-1"),
        list("list-3", "cat-2"),
      ],
      status: "ready",
    });

    useWorkspaceStore.getState().removeCategory("cat-1");

    const state = useWorkspaceStore.getState();
    expect(state.categories.map((c) => c.id)).toEqual(["cat-2"]);
    expect(state.lists.map((l) => l.id)).toEqual(["list-3"]);
  });
});

describe("list mutators", () => {
  it("addList appends to the lists array", () => {
    useWorkspaceStore.getState().addList(list("list-1", "cat-1"));
    useWorkspaceStore.getState().addList(list("list-2", "cat-1"));

    expect(useWorkspaceStore.getState().lists.map((l) => l.id)).toEqual([
      "list-1",
      "list-2",
    ]);
  });

  it("updateList replaces the matching list and leaves others intact", () => {
    useWorkspaceStore.setState({
      categories: [],
      lists: [list("list-1", "cat-1", "Old"), list("list-2", "cat-1", "Two")],
      status: "ready",
    });

    useWorkspaceStore.getState().updateList(list("list-1", "cat-1", "New"));

    const lists = useWorkspaceStore.getState().lists;
    expect(lists).toHaveLength(2);
    expect(lists.find((l) => l.id === "list-1")?.name).toBe("New");
    expect(lists.find((l) => l.id === "list-2")?.name).toBe("Two");
  });

  it("removeList removes only the matching list", () => {
    useWorkspaceStore.setState({
      categories: [],
      lists: [list("list-1", "cat-1"), list("list-2", "cat-1")],
      status: "ready",
    });

    useWorkspaceStore.getState().removeList("list-1");

    expect(useWorkspaceStore.getState().lists.map((l) => l.id)).toEqual([
      "list-2",
    ]);
  });
});

describe("ensureLoaded / reload", () => {
  it("fetches once and populates the store with status ready", async () => {
    const fetchMock = mockFetch({
      categories: [category("cat-1")],
      lists: [list("list-1", "cat-1")],
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await useWorkspaceStore.getState().ensureLoaded();

    const state = useWorkspaceStore.getState();
    expect(state.status).toBe("ready");
    expect(state.categories.map((c) => c.id)).toEqual(["cat-1"]);
    expect(state.lists.map((l) => l.id)).toEqual(["list-1"]);
    // One call per endpoint: /api/categories and /api/lists.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not fetch again when already ready (Requirement 6.1)", async () => {
    const fetchMock = mockFetch({
      categories: [category("cat-1")],
      lists: [list("list-1", "cat-1")],
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await useWorkspaceStore.getState().ensureLoaded();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await useWorkspaceStore.getState().ensureLoaded();

    // Call count stays the same — the guard prevented a duplicate fetch.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("sets status error when a response is not ok", async () => {
    const fetchMock = vi.fn(async (input: string) => {
      const url = String(input);
      const ok = !url.includes("/api/lists");
      return { ok, json: async () => [] } as Response;
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await useWorkspaceStore.getState().ensureLoaded();

    const state = useWorkspaceStore.getState();
    expect(state.status).toBe("error");
    expect(state.categories).toEqual([]);
    expect(state.lists).toEqual([]);
  });

  it("reload refetches even when already ready", async () => {
    const fetchMock = mockFetch({
      categories: [category("cat-1")],
      lists: [list("list-1", "cat-1")],
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await useWorkspaceStore.getState().ensureLoaded();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await useWorkspaceStore.getState().reload();

    // reload ignores the ready guard and fetches both endpoints again.
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(useWorkspaceStore.getState().status).toBe("ready");
  });
});
