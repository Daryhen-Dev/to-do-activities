# Design Document

## Overview

Add a **reminder layer** to the combined multi-category calendar. A reminder is
modeled as a **point `CalendarEvent`** anchored at its `remindAt` instant
(`endAt = null`, `allDay = false`, `kind = "reminder"`), so it flows through the
existing pure calendar helpers (`eventsOnDay`, `groupEventsByDay`,
`layoutDayEvents`) **without changing any of them** — the grids only add a visual
branch for `kind === "reminder"`. Reminder rows come from a **new range endpoint**
(`GET /api/calendar/reminders`) that mirrors the scheduled-events endpoint but
filters by `remindAt` instead of `startAt`. A single session-scoped **Reminders
toggle** (added to the existing filter store + legend) shows/hides the whole
layer; reminders also inherit the per-category toggles for free (they carry a
`categoryId`, which `filterVisibleEvents` already honors).

Guiding decisions:

- **Reminder = point event, one discriminator.** Adding `kind?: "scheduled" |
  "reminder"` to `CalendarEvent` (default scheduled) is the smallest change that
  lets reminders reuse every layout/bucketing helper. No helper signature
  changes; only new mappers and grid rendering branches.
- **Separate endpoint, parallel fetch.** The scheduled query stays untouched
  (single responsibility). The client fetches `/api/calendar` and
  `/api/calendar/reminders` in parallel and merges the two event arrays. This
  keeps each query simple and lets the layer be reasoned about independently.
- **Calendar shows ALL reminders; the bell shows DUE ones.** The calendar layer
  does NOT filter by `reminderSeenAt` or `remindAt <= now` — it positions every
  reminder in the period. The bell keeps its due/unacknowledged predicate.
- **Read-only on the grid.** Reminder markers are never draggable; `remindAt` is
  edited in the task dialog. This avoids conflating "reschedule startAt" with
  "change remindAt".
- **No schema changes.** `remindAt` already exists; the endpoint reuses the
  `List → Category` join and the `ScheduledItemWithCategory` shape.

## Architecture

```
/(app)/calendar → <CombinedCalendar/> (client)
  ├─ fetch GET /api/calendar?from=&to=            → toCombinedCalendarEvents(rows)   [scheduled]
  ├─ fetch GET /api/calendar/reminders?from=&to=  → toReminderCalendarEvents(rows)   [reminders, kind="reminder"]
  ├─ merge → filterVisibleEvents(all, hiddenCategoryIds)   [category toggles — existing]
  │          → filterReminderLayer(events, remindersHidden) [reminders toggle — new]
  ├─ <CategoryLegend/> now also renders the Reminders toggle
  ├─ month → <MonthGrid/> (reminder chip w/ bell)
  ├─ week/day → <TimeGrid/> (reminder = non-draggable point marker w/ bell)
  ├─ agenda → <AgendaList/> (reminder row w/ bell)
  └─ <DetailSheet/> peek (reminder peek shows remind time + type + description)

GET /api/calendar/reminders/route.ts (thin)
  → listRemindersForCurrentUserRange(from, to)      [service]
       → listRemindersForUser(userId, from, to)     [repository: sole Prisma boundary]
             where remindAt in [from,to), live, not archived; joins List→Category
```

## Data Models

No schema changes. The endpoint returns the existing `ScheduledItemWithCategory`
shape (`PlanningItem` + `categoryId` + `categoryName` + `categoryColor`); the
client reads `remindAt` off it. `CalendarEvent` gains one optional discriminator.

## Components and Interfaces

### Pure helpers — `src/lib/calendar.ts` (extended) — unit-tested

```ts
export interface CalendarEvent {
  // ...existing fields...
  /**
   * Discriminates a reminder marker (point at `remindAt`) from a scheduled
   * event. Absent/"scheduled" is the default; "reminder" marks the layer.
   */
  kind?: "scheduled" | "reminder";
}

/**
 * Maps reminder rows to POINT `CalendarEvent`s anchored at `remindAt`
 * (`endAt = null`, `allDay = false`, `kind = "reminder"`), carrying
 * `categoryId`/`categoryName`/resolved `color`. Rows without a valid `remindAt`
 * are dropped.
 */
export function toReminderCalendarEvents(
  rows: ScheduledItemWithCategory[],
): CalendarEvent[];

/**
 * Events with reminders removed when `hidden` is true; unchanged when false.
 * Scheduled events are never affected.
 */
export function filterReminderLayer(
  events: CalendarEvent[],
  hidden: boolean,
): CalendarEvent[];
```

- `toReminderCalendarEvents` parses `remindAt` (skip null / NaN), sets
  `startAt = remindAt`, `endAt = null`, `allDay = false`, `kind = "reminder"`,
  and attaches `categoryId`, `categoryName`, and
  `color = resolveCategoryColor(row.categoryColor, row.categoryId)`.
- `filterReminderLayer` is `hidden ? events.filter(e => e.kind !== "reminder") :
  events`.
- Existing helpers are untouched: a reminder is a point event
  (`endAt = startAt`), so `eventsOnDay`, `groupEventsByDay`, and
  `layoutDayEvents` place it on its day/time exactly like a point scheduled item.
- `filterVisibleEvents` already excludes events whose `categoryId` is hidden — a
  reminder carrying a hidden `categoryId` is filtered for free (Req 2.6).

### State — `src/stores/calendar-filter-store.ts` (extended)

Add the reminder-layer toggle alongside the category toggles (session-scoped):

```ts
interface CalendarFilterState {
  hiddenCategoryIds: Set<string>;            // existing
  toggle: (categoryId: string) => void;      // existing
  isHidden: (categoryId: string) => boolean; // existing
  reset: () => void;                         // existing
  /** True when the whole reminder layer is hidden. Default false (shown). */
  remindersHidden: boolean;
  /** Flips the reminder-layer visibility. */
  toggleReminders: () => void;
}
```

Default `remindersHidden: false` (Req 2.4); in-memory so it survives view/period
navigation but resets on reload (Req 2.5).

### Presentational components

#### `CategoryLegend` (`src/components/calendar/category-legend.tsx`, extended)

After the per-category chips, render one more chip: a **Reminders** toggle with a
`Bell` icon (`lucide-react`). `aria-pressed={!remindersHidden}`; clicking calls
`toggleReminders()`. Dimmed/struck-through when hidden, mirroring the category
chip styling. It renders even when there are no categories (so the reminders
toggle is always available).

#### `MonthGrid` (`src/components/calendar/month-grid.tsx`, extended)

In `EventChip`, when `event.kind === "reminder"`, prefix a small `Bell` icon and
use a distinct chip treatment (e.g. dashed left accent / bell) while keeping the
category color and the time·title label. Scheduled chips are unchanged.

#### `TimeGrid` (`src/components/calendar/time-grid.tsx`, extended)

- Reminders are point events, so `layoutDayEvents` already positions them at
  their minute (with the existing `MIN_EVENT_MINUTES` height). Render a reminder
  block with a `Bell` icon and a distinct style (marker-like), **non-draggable**.
- Make draggability **per event**: inside `TimedEvent`, compute
  `canDrag = draggable && positioned.event.kind !== "reminder"`, and only attach
  the pointer handlers / grab cursor when `canDrag`. A reminder always peeks on
  click (`onPeek`), never drags. This is the only behavioral change to
  `TimeGrid`; scheduled events are unaffected.

#### `AgendaList` (`src/components/calendar/agenda-list.tsx`, extended)

When `event.kind === "reminder"`, prefix a `Bell` icon on the row (keeping the
color dot + time + title). Scheduled rows unchanged.

### Container — `src/components/calendar/combined-calendar.tsx` (extended)

- Fetch BOTH endpoints in parallel for the current `[from, to)`:
  `/api/calendar` (scheduled) and `/api/calendar/reminders` (reminders). Map each
  with `toCombinedCalendarEvents` / `toReminderCalendarEvents`, then set a single
  merged `events` array (scheduled ++ reminders).
- Read `remindersHidden` from the filter store. Compute visible events as
  `filterReminderLayer(filterVisibleEvents(events, hiddenCategoryIds),
  remindersHidden)`.
- `handleReschedule` is unchanged (it is only ever invoked by `TimeGrid` for
  draggable = scheduled events).
- The detail peek already renders title + `formatWhen` + type + description; for
  a reminder, `formatWhen` shows its `remindAt` date/time (a point event → date ·
  time), which reads naturally.
- On a fetch failure of either request, show the existing non-blocking error
  toast and render what loaded (never crash).

### Backend

#### Repository — `src/repositories/planning-item.repository.ts`

New function (sole Prisma boundary), modeled on `listScheduledItemsForUser` but
filtering by `remindAt`:

```ts
export async function listRemindersForUser(
  userId: string,
  from: Date,
  to: Date,
): Promise<ScheduledItemWithCategory[]>;
```

`where`: `userId`, `deletedAt: null`, `archived: false`,
`remindAt: { not: null, gte: from, lt: to }`, live list + `category: { userId,
deletedAt: null }`. `include` the `List → Category` select and flatten to
`ScheduledItemWithCategory` (Prisma shapes never leak). Order `remindAt asc`.
Note: NO `reminderSeenAt` filter and NO `remindAt <= now` — the calendar shows
all reminders in the window (Req 1.6).

#### Service — `src/services/planning-item.service.ts`

```ts
export async function listRemindersForCurrentUserRange(
  from: Date,
  to: Date,
): Promise<ScheduledItemWithCategory[]>;
```

Resolves the acting user via `getCurrentUserId()` and delegates to
`listRemindersForUser`. No category precheck — the query is already user-scoped
(mirrors `listScheduledItemsForCurrentUserRange`).

#### Route — `src/app/api/calendar/reminders/route.ts` (new)

Thin `GET` mirroring `/api/calendar`: reuse the same `rangeSchema` (`from`/`to`
coerced dates, `to > from`) and `mapErrorToResponse` contract (ZodError → 400,
UnauthorizedError → 401, NotFoundError → 404, else 500). Parses the range, calls
`listRemindersForCurrentUserRange`, returns the array with 200.

## Error Handling

- **Missing/invalid range** → `400` via the shared `rangeSchema` (Req 4.4).
- **Unauthenticated** → `getCurrentUserId()` throws `UnauthorizedError` → `401`
  (Req 4.5).
- **Reminder-layer fetch fails** → non-blocking error toast; the scheduled layer
  still renders (never crashes) (Req 1.7).
- **All reminders hidden / none in range** → `filterReminderLayer` / an empty
  fetch yields no markers, never an error.

## Correctness Properties

### Property 1: Reminder mapping produces point events at remindAt

`toReminderCalendarEvents` returns one event per row with a valid `remindAt`,
each with `startAt = remindAt`, `endAt = null`, `allDay = false`,
`kind = "reminder"`, and its `categoryId`/`categoryName`/resolved `color`; rows
with a null/invalid `remindAt` are dropped.

**Validates: Requirements 1.1, 1.4, 1.6**

### Property 2: Reminder-layer filter is exact and scoped to reminders

`filterReminderLayer(events, true)` returns exactly the events whose `kind` is
not `"reminder"`; `filterReminderLayer(events, false)` returns all events
unchanged. Scheduled events are never removed in either case.

**Validates: Requirements 2.2, 2.3**

### Property 3: Reminders respect the category filter

`filterVisibleEvents` excludes a reminder event whose `categoryId` is in
`hiddenIds`, exactly as it does for scheduled events.

**Validates: Requirements 2.6**

### Property 4: Reminders range query is user-scoped and lifecycle-correct

`listRemindersForUser(userId, from, to)` returns only items of `userId` with
`remindAt ∈ [from, to)` that are live (`deletedAt IS NULL`, `archived = false`),
each carrying its category id/name/color, ordered by `remindAt` ascending;
deleted, archived, out-of-window, and other users' items are excluded — and
acknowledgement (`reminderSeenAt`) does NOT exclude a reminder.

**Validates: Requirements 4.1, 4.2, 4.3, 4.6, 1.6**

### Property 5: Reminder markers never reschedule

In the week/day grid a reminder marker is non-draggable, so a reminder never
triggers `onReschedule`; only scheduled timed events do.

**Validates: Requirements 3.1, 3.4**

## Testing Strategy

- **Pure helpers (primary coverage)** — extend `src/lib/calendar.test.ts`:
  `toReminderCalendarEvents` (point event at `remindAt`, `endAt` null, `kind`
  reminder, category/color attached, drops null/invalid `remindAt`, includes
  acknowledged reminders); `filterReminderLayer` (hidden → drops only reminders,
  shown → all, scheduled untouched); `filterVisibleEvents` with a reminder that
  carries a hidden `categoryId` (excluded).
- **Backend (layered)**:
  - Repository `listRemindersForUser` — user scope; `remindAt` window overlap;
    excludes deleted/archived/out-of-window/other users; INCLUDES acknowledged;
    category join returns id/name/color; order by `remindAt asc`. Against the
    test DB with the stable seed and idempotent cleanup.
  - Service `listRemindersForCurrentUserRange` — delegates with the resolved
    user + window.
  - Route `GET /api/calendar/reminders` — 200 with data, 400 on missing/invalid
    range, 401 unauthenticated.
- **Store** — `calendar-filter-store` reminder toggle: default shown; toggle
  flips; independent of category toggles.
- **Interaction (manual smoke test)**: on `/calendar`, a reminder appears as a
  bell marker at its time across month/week/day/agenda; toggling Reminders off
  hides all markers and leaves scheduled events; hiding a category hides its
  reminders too; a reminder marker is not draggable but peeks on click showing
  its remind time; an item with both a schedule and a reminder shows two markers.
- **Gates**: `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test`, `pnpm build`
  green.

## Verification Checklist

- [ ] Reminders show as bell point markers at `remindAt` in month/week/day/agenda.
- [ ] Reminders are colored by category; an item with schedule + reminder shows two markers.
- [ ] Acknowledged reminders still appear on the calendar (unlike the bell).
- [ ] Reminders toggle hides/shows the whole layer; default on; survives view/period nav.
- [ ] Hiding a category also hides its reminders.
- [ ] Reminder markers are not draggable; clicking peeks with the remind time.
- [ ] `GET /api/calendar/reminders?from=&to=` returns owned, in-window, live reminders with category color; 400 bad range; 401 unauth.
- [ ] `/api/calendar` and the per-category calendar remain unchanged.
- [ ] Pure-helper + layered backend + store tests green; build/lint/tsc clean.

## Notes

- **Establishes the layer+toggle pattern** the later objectives/habits views will
  reuse (a typed overlay with its own toggle over the shared grids).
- **Additive & backward-compatible**: one optional `CalendarEvent` field, a new
  read endpoint, a new store flag, and rendering branches; nothing existing
  changes behavior.
- **Workflow**: commit to `main`, conventional commits, no AI attribution, keep
  the suite green (current repo convention) unless told otherwise.
