import type { Dispatch, SetStateAction } from "react";
import { toast } from "sonner";

import type { CalendarEvent } from "./calendar";

/**
 * Shared drag-to-reschedule glue for the calendars (per-category and combined).
 * Extracted so both containers share one implementation of the optimistic-move
 * + PATCH + revert flow. Client-side interaction helper (not a pure module).
 */

const JSON_HEADERS = { "content-type": "application/json" };

/** Extracts the API's `{ error }` message, falling back to a default. */
export async function errorMessage(
  res: Response,
  fallback: string,
): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * Reschedules an event: optimistically moves it in local `events` state,
 * persists the new schedule via `PATCH /api/planning-items/[id]`, and reverts
 * (with a toast) if the server rejects it — including the no-overlap rule's
 * 400. Only `startAt`/`endAt` change. `currentEvents` is the pre-move snapshot
 * used to revert on failure.
 */
export async function rescheduleEvent(
  event: CalendarEvent,
  newStartAt: Date,
  newEndAt: Date | null,
  currentEvents: CalendarEvent[],
  setEvents: Dispatch<SetStateAction<CalendarEvent[]>>,
): Promise<void> {
  const snapshot = currentEvents;
  setEvents((prev) =>
    prev.map((current) =>
      current.id === event.id
        ? { ...current, startAt: newStartAt, endAt: newEndAt }
        : current,
    ),
  );

  const res = await fetch(`/api/planning-items/${event.id}`, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify({
      startAt: newStartAt.toISOString(),
      endAt: newEndAt ? newEndAt.toISOString() : null,
    }),
  });
  if (!res.ok) {
    setEvents(snapshot);
    toast.error(await errorMessage(res, "Failed to reschedule the activity"));
  }
}
