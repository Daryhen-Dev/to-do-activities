"use client";

import { Bell } from "lucide-react";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useReminderStore } from "@/stores/reminder-store";
import { formatReminderTime, selectNewlyDueIds } from "@/lib/reminders";

/** How often the bell re-checks the server for due reminders while open. */
const POLL_INTERVAL_MS = 60_000;

/**
 * Notification bell for due reminders. Mounted once in the `(app)` top bar, so
 * there is a single poll loop app-wide. Shows an unread count, lists the due
 * reminders with a dismiss action, and toasts each reminder once when it first
 * becomes due during the session.
 *
 * "Due" is computed server-side; this component only fetches, polls (on an
 * interval and on window focus), and renders. Toast-once bookkeeping uses a
 * ref-held set of already-announced ids so re-renders never re-toast.
 */
export function ReminderBell() {
  const dueReminders = useReminderStore((state) => state.dueReminders);
  const ensureLoaded = useReminderStore((state) => state.ensureLoaded);
  const reload = useReminderStore((state) => state.reload);
  const acknowledge = useReminderStore((state) => state.acknowledge);

  // Ids already announced this session; a ref so updating it never re-renders.
  const knownIdsRef = useRef<Set<string>>(new Set());
  // The first load seeds the known set silently (reminders that were already
  // due before the session are not toasted — only fresh transitions are).
  const primedRef = useRef(false);

  // Initial load + polling + refresh on window focus. One loop for the app.
  useEffect(() => {
    void ensureLoaded();
    const interval = setInterval(() => {
      void reload();
    }, POLL_INTERVAL_MS);
    const onFocus = () => {
      void reload();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [ensureLoaded, reload]);

  // Toast newly-due reminders exactly once. On the first load, prime the known
  // set without toasting so an existing backlog does not burst notifications.
  useEffect(() => {
    if (!primedRef.current) {
      for (const reminder of dueReminders) {
        knownIdsRef.current.add(reminder.id);
      }
      primedRef.current = true;
      return;
    }
    const newIds = selectNewlyDueIds(knownIdsRef.current, dueReminders);
    for (const id of newIds) {
      const reminder = dueReminders.find((item) => item.id === id);
      if (reminder) {
        toast(reminder.title, { description: "Reminder" });
      }
      knownIdsRef.current.add(id);
    }
  }, [dueReminders]);

  const count = dueReminders.length;
  const now = new Date();

  async function handleDismiss(id: string) {
    const ok = await acknowledge(id);
    if (!ok) {
      toast.error("Failed to dismiss the reminder");
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            aria-label={
              count > 0
                ? `Notifications, ${count} due`
                : "Notifications, none due"
            }
          >
            <Bell className="size-4" aria-hidden="true" />
            {count > 0 ? (
              <span
                className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium leading-4 text-white"
                aria-hidden="true"
              >
                {count > 9 ? "9+" : count}
              </span>
            ) : null}
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-80">
        <div className="border-b px-1.5 py-1 text-xs font-medium text-muted-foreground">
          Reminders
        </div>
        {count === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            No due reminders
          </p>
        ) : (
          <ul className="max-h-80 overflow-y-auto py-1">
            {dueReminders.map((reminder) => (
              <li
                key={reminder.id}
                className="flex items-start justify-between gap-2 px-2 py-1.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {reminder.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {reminder.remindAt
                      ? formatReminderTime(new Date(reminder.remindAt), now)
                      : ""}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Dismiss reminder: ${reminder.title}`}
                  onClick={() => void handleDismiss(reminder.id)}
                >
                  Dismiss
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
