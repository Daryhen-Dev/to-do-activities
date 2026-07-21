# Design Document

## Overview

Make timed events in the week/day time-grid draggable to reschedule them. The
interaction is built with **Pointer Events** (no drag-and-drop library): pointer
events unify mouse and touch, give precise control over a time-grid, and let us
keep the reschedule math in **pure, testable functions**. On drop the new
schedule is applied optimistically, persisted via `PATCH /api/planning-items/[id]`,
and reverted if the server rejects it (including the existing no-overlap rule).

No schema or backend changes: the reschedule reuses the update endpoint and the
"no double-booking" validation already in place.

### Mechanism decision: custom Pointer Events

- **Chosen — Pointer Events**: one code path for mouse + touch, precise
  pixel→time mapping, no dependency, and the arithmetic (snap, duration
  preservation, clamping, new day/time) factors into pure helpers we can unit
  test. Fits the project's "build the calendar ourselves" stance.
- **Rejected — native HTML Drag-and-Drop**: awkward custom drag images, poor
  touch support, coarse control — bad fit for a time-grid.
- **Rejected — a DnD library (dnd-kit/react-dnd)**: adds a dependency and is
  oriented at sortable lists; free time positioning still needs our own math.

## Architecture

```
CategoryCalendar (client, owns `events` state)
  └─ onReschedule(event, newStartAt, newEndAt)
       ├─ optimistic: replace the event in local state
       ├─ PATCH /api/planning-items/[id] { startAt, endAt }
       └─ on failure (400 overlap / network): revert + sonner toast
  └─ <TimeGrid … onReschedule=… />   (only for week/day; enables drag)
        per TimedEvent: pointer-drag → compute target day + minute
          → computeRescheduledSchedule(event, targetDay, targetMinute) [pure]
          → onReschedule(...)
```

## Components and Interfaces

### Pure helpers (`src/lib/calendar.ts`) — unit-tested

```ts
/** Rounds a minute-of-day to the nearest `increment` (default 15). */
function snapMinutes(minute: number, increment?: number): number;

/**
 * New schedule when an event is dropped on `targetDay` at `targetStartMinute`
 * (minutes from local midnight). Snaps the start, clamps it within the day,
 * preserves the duration (end shifts with start), and keeps `endAt` null for a
 * point-in-time event.
 */
function computeRescheduledSchedule(
  event: CalendarEvent,
  targetDay: Date,
  targetStartMinute: number,
  increment?: number,
): { startAt: Date; endAt: Date | null };
```

Rules:
- `snapMinutes` rounds to the nearest increment (15), clamped to `[0, 1440]`.
- Duration = `endAt - startAt` when `endAt` is set, else `null`. New start =
  `targetDay` local-midnight + snapped minute; new end = new start + duration (or
  `null`). Start is clamped so a ranged event does not spill past midnight
  (clamp start to `[0, 1440 - durationMinutes]`); a point event clamps start to
  `[0, 1440)`.

### TimeGrid (`src/components/calendar/time-grid.tsx`) — drag behavior

- New optional prop `onReschedule?(event, newStartAt: Date, newEndAt: Date | null)`.
  When provided, timed event blocks become draggable; when absent, behavior is
  unchanged (read-only).
- Each `TimedEvent` uses Pointer Events:
  - `onPointerDown`: record the origin `(clientX, clientY)`, `setPointerCapture`,
    mark a "pending" drag (not yet moved).
  - `onPointerMove`: once movement exceeds a small **threshold** (e.g. 4px),
    enter dragging; show a live preview by translating the block by the pointer
    delta (and, in week view, letting it follow across columns).
  - `onPointerUp`: if never crossed the threshold → treat as a **click** →
    `onPeek(event)`. If dragging → determine the target **day column** (via each
    column's ref / `getBoundingClientRect` containing `clientX`) and the target
    **minute** (`((clientY - columnRect.top) / HOUR_HEIGHT) * 60`, using the same
    HOUR_HEIGHT), then call
    `computeRescheduledSchedule(event, targetDay, targetMinute)` and invoke
    `onReschedule`.
- Column geometry: keep a ref per day column so pointer-to-day/minute mapping
  reads live `getBoundingClientRect()` (DOM measurement stays in the component;
  the arithmetic is delegated to the pure helper).
- Only timed blocks are draggable (all-day strip stays static). Click-to-peek is
  preserved via the threshold (Req 4.2, 4.3).

### CategoryCalendar (`src/components/calendar/category-calendar.tsx`)

- Add `handleReschedule(event, newStartAt, newEndAt)`:
  - Snapshot current `events`; optimistically replace the event's
    `startAt`/`endAt` in local state (Req 3.1).
  - `PATCH /api/planning-items/${event.id}` with
    `{ startAt: newStartAt.toISOString(), endAt: newEndAt ? newEndAt.toISOString() : null }`.
  - On `!res.ok`: restore the snapshot and `toast.error(await errorMessage(res, …))`
    — the no-overlap 400 message surfaces here (Req 2.1, 2.2, 3.2).
  - On success: keep the optimistic state (optionally reconcile with the
    returned row) (Req 3.3).
- Pass `onReschedule={handleReschedule}` to `<TimeGrid>` for week and day views
  only.

### Backend

No changes. `PATCH /api/planning-items/[id]` already updates `startAt`/`endAt`,
runs `validateSchedule`, and enforces `assertNoTimedOverlap` (excluding self),
returning `400` on conflict. Ownership is enforced by the existing update path
(Req 5.1). The reschedule payload only sends `startAt`/`endAt` (Req 5.2, 5.3).

## Data Models

No changes. Reschedule is a client interaction over `CalendarEvent` that results
in a scheduling `PATCH`.

## Error Handling

- **Overlap on drop** → server `400` (ValidationError) → revert + toast the
  server message (Req 2.1, 2.2).
- **Network/other failure** → revert + generic error toast (Req 3.2).
- **Invalid target** (e.g. dropped outside any column) → treated as no-op
  (event stays put); no request sent.

## Correctness Properties

### Property 1: Snapping

`snapMinutes(m, inc)` returns a multiple of `inc` within `[0, 1440]`, choosing
the nearest increment.

**Validates: Requirements 1.3**

### Property 2: Duration preserved and clamped

`computeRescheduledSchedule` keeps `endAt - startAt` equal to the original
duration (or `endAt` null when the original had none), and never lets a ranged
event's end exceed the target day's midnight (start is clamped accordingly).

**Validates: Requirements 1.1, 5.3**

### Property 3: Point-in-time stays point-in-time

An event with no `endAt` reschedules with a moved `startAt` and `endAt` still
`null`.

**Validates: Requirements 5.3**

### Property 4: Reschedule touches only the schedule

The reschedule PATCH sends only `startAt`/`endAt`; list, title, priority,
status, and `dueAt` are never included.

**Validates: Requirements 5.2**

## Testing Strategy

- **Pure helpers (primary coverage)** in `src/lib/calendar.test.ts`:
  `snapMinutes` (nearest-increment rounding, clamping to `[0,1440]`, exact
  multiples); `computeRescheduledSchedule` (duration preserved for a ranged
  event; `endAt` stays null for a point event; start clamped so a long event
  does not spill past midnight; target-day change sets the right date; snapping
  applied).
- **Interaction**: manual smoke test — drag within a day changes the time; drag
  across columns (week) changes the day; a tiny move is treated as a click and
  opens details; dropping onto an occupied slot reverts and shows the conflict
  toast; a successful drop persists (survives a reload). No React interaction
  test framework in the project.
- Gates: `pnpm build`, `pnpm test`, `pnpm lint`, `pnpm exec tsc --noEmit` green.

## Verification Checklist

- [ ] `snapMinutes` / `computeRescheduledSchedule` unit tests cover Reqs 1 & 5.
- [ ] Drag reschedules time (day view) and day (week view), preserving duration.
- [ ] Click still opens details (threshold distinguishes click from drag).
- [ ] Overlapping drop reverts with a conflict message; valid drop persists.
- [ ] Only `startAt`/`endAt` change.
