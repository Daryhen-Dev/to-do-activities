import { create } from "zustand";
import type { ItemType } from "@prisma/client";

/**
 * Shared item-type catalog store: the single source of truth for the active
 * item types (Tarea, Recordatorio, Evento, Hábito, Objetivo, Nota), consumed by
 * the task list and the calendars so the type selector and the type badge read
 * the same data without duplicate fetches. Holds ONLY the catalog — no per-item
 * state. Mirrors `useWorkspaceStore`: plain state + a guarded loader.
 */

type ItemTypeStatus = "idle" | "loading" | "ready" | "error";

interface ItemTypeState {
  itemTypes: ItemType[];
  status: ItemTypeStatus;
  /** Fetches the catalog once; a no-op while already loading or ready. */
  ensureLoaded: () => Promise<void>;
  /** Forces a refetch regardless of current status. */
  reload: () => Promise<void>;
}

/** Loads the active item types; throws on a non-OK response. */
async function fetchItemTypes(): Promise<ItemType[]> {
  const res = await fetch("/api/item-types");
  if (!res.ok) {
    throw new Error("Failed to load item types");
  }
  return (await res.json()) as ItemType[];
}

export const useItemTypeStore = create<ItemTypeState>((set, get) => ({
  itemTypes: [],
  status: "idle",

  ensureLoaded: async () => {
    const { status } = get();
    if (status === "loading" || status === "ready") return;
    await get().reload();
  },

  reload: async () => {
    set({ status: "loading" });
    try {
      const itemTypes = await fetchItemTypes();
      set({ itemTypes, status: "ready" });
    } catch {
      set({ status: "error" });
    }
  },
}));
