import { create } from "zustand";
import type { Category, List } from "@prisma/client";

/**
 * Shared workspace store: the single source of truth for the user's categories
 * and lists tree, consumed by both the sidebar and the dashboard so structural
 * changes made in one are reflected in the other without a page reload.
 *
 * Task-level state is intentionally NOT held here — it stays local to the views
 * that own it (the list view and the dashboard). This store only manages the
 * categories/lists structure.
 *
 * Components keep performing the API calls (POST/PATCH/DELETE) with their own
 * error toasts, then call the matching mutator here on success. The store is
 * plain state + setters plus a guarded loader.
 */

type WorkspaceStatus = "idle" | "loading" | "ready" | "error";

interface WorkspaceState {
  categories: Category[];
  lists: List[];
  status: WorkspaceStatus;
  /** Fetches the tree once; a no-op while already loading or ready. */
  ensureLoaded: () => Promise<void>;
  /** Forces a refetch regardless of current status. */
  reload: () => Promise<void>;
  addCategory: (category: Category) => void;
  updateCategory: (category: Category) => void;
  /** Removes a category and, mirroring the server cascade, its lists. */
  removeCategory: (id: string) => void;
  addList: (list: List) => void;
  updateList: (list: List) => void;
  removeList: (id: string) => void;
}

/** Loads categories + lists in parallel; throws on any non-OK response. */
async function fetchWorkspace(): Promise<{
  categories: Category[];
  lists: List[];
}> {
  const [categoriesRes, listsRes] = await Promise.all([
    fetch("/api/categories"),
    fetch("/api/lists"),
  ]);
  if (!categoriesRes.ok || !listsRes.ok) {
    throw new Error("Failed to load the workspace");
  }
  const [categories, lists] = (await Promise.all([
    categoriesRes.json(),
    listsRes.json(),
  ])) as [Category[], List[]];
  return { categories, lists };
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  categories: [],
  lists: [],
  status: "idle",

  ensureLoaded: async () => {
    const { status } = get();
    if (status === "loading" || status === "ready") return;
    await get().reload();
  },

  reload: async () => {
    set({ status: "loading" });
    try {
      const { categories, lists } = await fetchWorkspace();
      set({ categories, lists, status: "ready" });
    } catch {
      set({ status: "error" });
    }
  },

  addCategory: (category) =>
    set((state) => ({ categories: [...state.categories, category] })),

  updateCategory: (category) =>
    set((state) => ({
      categories: state.categories.map((current) =>
        current.id === category.id ? category : current,
      ),
    })),

  removeCategory: (id) =>
    set((state) => ({
      categories: state.categories.filter((current) => current.id !== id),
      lists: state.lists.filter((list) => list.categoryId !== id),
    })),

  addList: (list) => set((state) => ({ lists: [...state.lists, list] })),

  updateList: (list) =>
    set((state) => ({
      lists: state.lists.map((current) =>
        current.id === list.id ? list : current,
      ),
    })),

  removeList: (id) =>
    set((state) => ({
      lists: state.lists.filter((current) => current.id !== id),
    })),
}));
