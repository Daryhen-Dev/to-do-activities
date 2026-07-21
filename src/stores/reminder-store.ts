import { create } from "zustand";
import type { PlanningItem } from "@prisma/client";

/**
 * Due-reminders store: the single source of truth for the notification bell.
 * Holds the current user's DUE reminders (computed server-side) and an
 * optimistic acknowledge. Mirrors `useItemTypeStore`/`useWorkspaceStore`
 * (plain state + a guarded loader), plus a `reload` the bell drives on a poll
 * and on window focus. Holds ONLY the due set — no per-item editing state.
 */

type ReminderStatus = "idle" | "loading" | "ready" | "error";

interface ReminderState {
  dueReminders: PlanningItem[];
  status: ReminderStatus;
  /** Fetches the due set once; a no-op while already loading or ready. */
  ensureLoaded: () => Promise<void>;
  /** Forces a refetch regardless of current status (poll / focus). */
  reload: () => Promise<void>;
  /**
   * Optimistically removes the reminder, POSTs the acknowledgement, and
   * restores it on failure. Resolves to whether the server accepted it, so the
   * caller can surface an error toast.
   */
  acknowledge: (id: string) => Promise<boolean>;
}

/** Loads the current user's due reminders; throws on a non-OK response. */
async function fetchDueReminders(): Promise<PlanningItem[]> {
  const res = await fetch("/api/reminders");
  if (!res.ok) {
    throw new Error("Failed to load reminders");
  }
  return (await res.json()) as PlanningItem[];
}

export const useReminderStore = create<ReminderState>((set, get) => ({
  dueReminders: [],
  status: "idle",

  ensureLoaded: async () => {
    const { status } = get();
    if (status === "loading" || status === "ready") return;
    await get().reload();
  },

  reload: async () => {
    set({ status: "loading" });
    try {
      const dueReminders = await fetchDueReminders();
      set({ dueReminders, status: "ready" });
    } catch {
      set({ status: "error" });
    }
  },

  acknowledge: async (id) => {
    const snapshot = get().dueReminders;
    // Optimistic: drop it from the due set immediately.
    set({ dueReminders: snapshot.filter((item) => item.id !== id) });
    try {
      const res = await fetch(`/api/reminders/${id}/seen`, { method: "POST" });
      if (!res.ok) {
        set({ dueReminders: snapshot });
        return false;
      }
      return true;
    } catch {
      set({ dueReminders: snapshot });
      return false;
    }
  },
}));
