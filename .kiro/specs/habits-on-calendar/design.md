# Design Document

## Overview

Add a **habit layer** to the combined multi-category calendar, reusing the
"layer + toggle" pattern from `reminders-on-calendar` and the pure recurrence
logic from `habits-recurrence`. The essential difference from the reminder layer:
a habit is a recurrence **rule**, not a single dated item, so each habit is
**expanded into its scheduled occurrences within the visible window**
server-side (via the existing pure `generateOccurrences`), and each occurrence is
returned as a lightweight DTO. The client maps each DTO to a **point (or all-day)
`CalendarEvent`** with `kind = "habit"`, so it flows through the existing pure
calendar helpers (`eventsOnDay`, `groupEventsByDay`, `layoutDayEvents`) **without
changing any of them** — the grids only add a visual branch for
`kind === "habit"`.

Guiding decisions:

- **Server-side occurrence expansion.** The recurrence rule lives on the server
  and the pure `generateOccurrences(rule, from, to)` already exists, so the new
  endpoint expands each habit's occurrences in `[from, to)` and returns flat
  occurrence DTOs. The client stays thin: no rule/expansion logic ships to the
  browser. Completion state per occurrence is computed from the habit's
  `HabitCompletion` rows using the existing `completedKeysFromRows` + `dateKey`.
- **Occurrence DTO carries calendar-date + time-of-day, not an instant.** Each
  DTO sends `date` as a `"YYYY-MM-DD"` calendar-date string plus
  `timeMinutes: number | null`. The CLIENT builds the local `Date`
  (`new Date(y, m-1, d, hh, mm)`), so all timezone-sensitive `Date` construction
  stays on the client, consistent with how the calendar already treats dates
  locally. `timeMinutes === null` → an all-day marker.
- **Habit = point/all-day event, one more discriminator.** Extend
  `CalendarEvent.kind` to `"scheduled" | "reminder" | "habit"` and add an optional
  `completed?: boolean`. This is the smallest change that lets habit occurrences
  reuse every layout/bucketing helper. The marker `id` is `"{habitId}:{date}"` so
  occurrences of the same habit never collide as React keys.
- **Third parallel fetch, reusing the repository.** The client fetches
  `/api/calendar`, `/api/calendar/reminders`, and the new
  `/api/calendar/habits` in parallel and merges the three event arrays. The new
  endpoint reuses the existing `listHabitsByUser` repository method (sole Prisma
  boundary) — no new query is needed; expansion is pure composition in the
  service.
- **Calendar shows all occurrences and their completion; completion is edited in
  the Habits view.** The calendar DISPLAYS whether each occurrence is completed
  but does not toggle it (read-only markers), mirroring how reminder markers are
  read-only on the grid.
- **No schema changes.** The recurrence columns and `HabitCompletion` already
  exist from `habits-recurrence`.

## Architecture

```
/(app)/calendar → <CombinedCalendar/> (client)
  ├─ fetch GET /api/calendar?from=&to=            → toCombinedCalendarEvents(rows)  [scheduled]
  ├─ fetch GET /api/calendar/reminders?from=&to=  → toReminderCalendarEvents(rows)  [reminders]
  ├─ fetch GET /api/calendar/habits?from=&to=     → toHabitCalendarEvents(dtos)     [habits, kind="habit"]  NEW
  ├─ merge → filterVisibleEvents(all, hiddenCategoryIds)        [category toggles — existing]
  │          → filterReminderLayer(events, remindersHidden)     [reminders toggle — existing]
  │          → filterHabitLayer(events, habitsHidden)           [habits toggle — NEW]
  ├─ <CategoryLegend/> now also renders the Habits toggle
  ├─ month → <MonthGrid/> (habit chip w/ repeat icon; completed = checked/dimmed)
  ├─ week/day → <TimeGrid/> (habit = non-draggable point/all-day marker w/ repeat icon)
  ├─ agenda → <AgendaList/> (habit row w/ repeat icon)
  └─ <DetailSheet/> peek (habit peek shows occurrence date/time, type, completion)

GET /api/calendar/habits/route.ts (thin, NEW)
  → listHabitOccurrencesForCurrentUserRange(from, to)   [service, NEW]
       → listHabitsByUser(userId)                       [repository: sole Prisma boundary, REUSED]
       → for each habit: generateOccurrences(rule, from, to) + completedKeysFromRows [lib/habits, REUSED]
```

## Data Models

No schema changes. The endpoint returns a NEW serializable DTO array; the client
maps it to `CalendarEvent`s. `CalendarEvent` gains one discriminator value and one
optional field.

```ts
// src/lib/habits.ts (NEW type)
/** One expanded habit occurrence, serializable for GET /api/calendar/habits. */
export interface HabitOccurrenceDTO {
  habitId: string;
  title: string;
  description: string | null;
  itemTypeId: string;
  /** Calendar date "YYYY-MM-DD" (local); the client builds the Date. */
  date: string;
  /** Minutes since local midnight, or null for an all-day habit. */
  timeMinutes: number | null;
  categoryId: string;
  categoryName: string;
  categoryColor: string | null;
  completed: boolean;
}
```

```ts
// src/lib/calendar.ts (extended)
export interface CalendarEvent {
  // ...existing fields...
  /** Adds "habit" to the layer discriminator. */
  kind?: "scheduled" | "reminder" | "habit";
  /** For a habit occurrence marker: whether that occurrence is completed. */
  completed?: boolean;
}
```

## Components and Interfaces

### Pure helpers — `src/lib/calendar.ts` (extended) — unit-tested

```ts
/**
 * Maps expanded habit-occurrence DTOs to `CalendarEvent`s. Each occurrence with
 * a `timeMinutes` becomes a POINT event anchored at that local time
 * (`allDay = false`); a null `timeMinutes` becomes an ALL-DAY marker. `endAt`
 * is null, `kind = "habit"`, `completed` is carried through, `id` is
 * `"{habitId}:{date}"`, and category id/name/resolved color are attached. DTOs
 * with an unparseable `date` are dropped.
 */
export function toHabitCalendarEvents(rows: HabitOccurrenceDTO[]): CalendarEvent[];

/**
 * Events with habit markers removed when `hidden` is true; unchanged when false.
 * Only `kind === "habit"` events are affected — scheduled and reminder events are
 * never removed.
 */
export function filterHabitLayer(
  events: CalendarEvent[],
  hidden: boolean,
): CalendarEvent[];
```

- `toHabitCalendarEvents` parses `date` (`"YYYY-MM-DD"` → `[y, m, d]`); when
  `timeMinutes != null` sets `startAt = new Date(y, m-1, d, hh, mm)` and
  `allDay = false`; otherwise `startAt = new Date(y, m-1, d)` and `allDay = true`.
  Sets `endAt = null`, `kind = "habit"`, `completed`, `itemTypeId`, `categoryId`,
  `categoryName`, `color = resolveCategoryColor(categoryColor, categoryId)`,
  `description`, and `id = "{habitId}:{date}"`.
- `filterHabitLayer` is `hidden ? events.filter(e => e.kind !== "habit") : events`.
- Existing helpers are untouched: a habit occurrence is a point/all-day event, so
  `eventsOnDay`, `groupEventsByDay`, and `layoutDayEvents` place it exactly like a
  point/all-day scheduled item.
- `filterVisibleEvents` already excludes events whose `categoryId` is hidden — a
  habit marker carrying a hidden `categoryId` is filtered for free (Req 2.6).

### State — `src/stores/calendar-filter-store.ts` (extended)

Add the habit-layer toggle alongside the category and reminder toggles
(session-scoped), mirroring `remindersHidden`:

```ts
interface CalendarFilterState {
  // ...existing (hiddenCategoryIds, toggle, isHidden, reset, remindersHidden, toggleReminders)...
  /** True when the whole habit layer is hidden. Default false (shown). */
  habitsHidden: boolean;
  /** Flips the habit-layer visibility. */
  toggleHabits: () => void;
}
```

Default `habitsHidden: false` (Req 2.4); in-memory so it survives view/period
navigation but resets on reload (Req 2.5).

### Presentational components

#### `CategoryLegend` (`src/components/calendar/category-legend.tsx`, extended)

After the Reminders toggle, render one more chip: a **Habits** toggle with a
`Repeat` icon (matching the seeded `habito` icon). `aria-pressed={!habitsHidden}`;
clicking calls `toggleHabits()`. Dimmed/struck-through when hidden, mirroring the
reminder chip styling. Always renders (even with no categories).

#### `MonthGrid` (`src/components/calendar/month-grid.tsx`, extended)

In `EventChip`, when `event.kind === "habit"`, prefix a small `Repeat` icon and
use a distinct chip treatment while keeping the category color and time·title
label. When `event.completed`, render the completed treatment (e.g. a check +
reduced emphasis). Scheduled and reminder chips are unchanged.

#### `TimeGrid` (`src/components/calendar/time-grid.tsx`, extended)

- A timed habit occurrence is a point event, already positioned by
  `layoutDayEvents`; an all-day habit occurrence renders in the all-day strip.
  Render a habit block/chip with a `Repeat` icon and a distinct style,
  **non-draggable**, with a completed treatment when `event.completed`.
- Extend the per-event drag guard: a habit is draggable only when
  `kind === "scheduled"`, i.e. `canDrag = draggable && event.kind === "scheduled"`
  (reminders were already excluded; this also excludes habits). A habit always
  peeks on click, never drags.

#### `AgendaList` (`src/components/calendar/agenda-list.tsx`, extended)

When `event.kind === "habit"`, prefix a `Repeat` icon on the row (keeping the
color dot + time + title) and show the completed treatment when
`event.completed`. Scheduled and reminder rows unchanged.

### Container — `src/components/calendar/combined-calendar.tsx` (extended)

- Add a THIRD parallel fetch (`/api/calendar/habits?from=&to=`) to the existing
  `Promise.all`. Map its DTOs with `toHabitCalendarEvents` and append to the
  merged `events` array (scheduled ++ reminders ++ habits).
- Read `habitsHidden` from the filter store. Compute visible events as
  `filterHabitLayer(filterReminderLayer(filterVisibleEvents(events,
  hiddenCategoryIds), remindersHidden), habitsHidden)`.
- `handleReschedule` is unchanged (only ever invoked by `TimeGrid` for draggable
  scheduled events).
- The detail peek renders title + `formatWhen` + type + description; for a habit,
  `formatWhen` shows its occurrence date · time (point) or date · All day, and the
  peek additionally shows the occurrence's completion state.
- On a fetch failure of any of the three requests, show the existing non-blocking
  error toast and render what loaded (never crash).

### Backend

#### Repository — `src/repositories/planning-item.repository.ts` (REUSED)

No new method. The existing `listHabitsByUser(userId)` already returns the user's
live `habito` items joined to their category and including their
`HabitCompletion` rows (`HabitWithCompletions[]`) — exactly what the service needs
to expand occurrences and compute completion. It remains the sole Prisma
boundary, and it is the only place `HabitCompletion` is read (Req 4.7).

#### Service — `src/services/planning-item.service.ts` (NEW function)

```ts
export async function listHabitOccurrencesForCurrentUserRange(
  from: Date,
  to: Date,
): Promise<HabitOccurrenceDTO[]>;
```

Resolves the acting user via `getCurrentUserId()`; calls `listHabitsByUser`; for
each habit builds `rule = ruleFromItem(habit)` and
`completed = completedKeysFromRows(habit.completions)`, expands
`generateOccurrences(rule, from, to)`, and emits one `HabitOccurrenceDTO` per
occurrence with `date = dateKey(occurrence)`,
`timeMinutes = habit.recurrenceTimeMinutes`, category fields, and
`completed = completed.has(dateKey(occurrence))`. No category precheck (the query
is already user-scoped, mirroring `listRemindersForCurrentUserRange`).

#### Route — `src/app/api/calendar/habits/route.ts` (NEW)

Thin `GET` mirroring `/api/calendar/reminders`: reuse the same `rangeSchema`
(`from`/`to` coerced dates, `to > from`) and the shared `mapErrorToResponse`
contract (ZodError → 400, ValidationError → 400, UnauthorizedError → 401,
NotFoundError → 404, else 500). Parses the range, calls
`listHabitOccurrencesForCurrentUserRange`, returns the DTO array with 200.

## Error Handling

- **Missing/invalid range** → `400` via the shared `rangeSchema` (Req 4.4), no
  partial data.
- **Unauthenticated** → `getCurrentUserId()` throws `UnauthorizedError` → `401`
  (Req 4.5).
- **Habit-layer fetch fails** → non-blocking error toast; the scheduled and
  reminder layers still render (never crashes) (Req 1.7).
- **All habits hidden / none in range** → `filterHabitLayer` / an empty expansion
  yields no markers, never an error.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all
valid executions of a system — a formal statement about what the system should
do, bridging human-readable specs and machine-verifiable guarantees.*

### Property 1: Habit mapping produces point/all-day events per occurrence

`toHabitCalendarEvents` returns one event per DTO with a parseable `date`, each
with `kind = "habit"`, `endAt = null`, `id = "{habitId}:{date}"`, the carried
`completed` flag, and its `categoryId`/`categoryName`/resolved `color`; a DTO with
`timeMinutes` set yields a point event at that local time (`allDay = false`) and a
null `timeMinutes` yields an all-day marker (`allDay = true`); DTOs with an
unparseable `date` are dropped.

**Validates: Requirements 1.1, 1.3, 1.5, 1.6**

### Property 2: Habit-layer filter is exact and scoped to habits

`filterHabitLayer(events, true)` returns exactly the events whose `kind` is not
`"habit"`; `filterHabitLayer(events, false)` returns all events unchanged.
Scheduled and reminder events are never removed in either case.

**Validates: Requirements 2.2, 2.3**

### Property 3: Habit markers respect the category filter

`filterVisibleEvents` excludes a habit event whose `categoryId` is in
`hiddenIds`, exactly as it does for scheduled and reminder events.

**Validates: Requirements 2.6**

### Property 4: Occurrence expansion matches the schedule and completion set

For any set of habits and a window `[from, to)`,
`listHabitOccurrencesForCurrentUserRange` emits exactly one DTO per
`(habit, occurrence)` where the occurrence is in `generateOccurrences(rule, from,
to)`, with `date = dateKey(occurrence)` and `completed` true exactly when that
`(habit, date)` has a completion; soft-deleted and archived habits contribute no
occurrences.

**Validates: Requirements 1.1, 4.1, 4.2, 4.3, 4.6**

### Property 5: Habit markers never reschedule

In the week/day grid a habit marker is non-draggable, so a habit occurrence never
triggers `onReschedule`; only scheduled timed events do.

**Validates: Requirements 3.1, 3.4**

## Testing Strategy

- **Pure helpers (primary coverage)** — extend `src/lib/calendar.test.ts`:
  `toHabitCalendarEvents` (point event at time-of-day; all-day when null;
  `kind = "habit"`; `endAt` null; `id = "{habitId}:{date}"`; completed carried;
  category/color attached; drops invalid `date`) and `filterHabitLayer` (hidden →
  drops only habits, shown → all, scheduled/reminders untouched); plus
  `filterVisibleEvents` with a habit carrying a hidden `categoryId` (excluded).
  Property-based tests (fast-check) implement Properties 1, 2, 3.
- **Service** — `src/services/planning-item.service.test.ts`:
  `listHabitOccurrencesForCurrentUserRange` with `listHabitsByUser` mocked —
  expands occurrences over a window, marks `completed` from the completion set,
  and yields no occurrences for a habit whose window has none (Property 4,
  example + model-based check against `generateOccurrences`).
- **Route** — `src/app/api/calendar/habits/route.test.ts`: 200 with data, 400 on
  missing/invalid range, 401 unauthenticated, 500 no-leak (service mocked).
- **Store** — `calendar-filter-store` habit toggle: default shown; toggle flips;
  independent of the category and reminder toggles.
- **Interaction (manual smoke test)**: on `/calendar`, a habit shows a repeat
  marker on each scheduled day across month/week/day/agenda; a timed habit is a
  point marker, a no-time habit is all-day; a completed occurrence is visually
  distinct; toggling Habits hides/shows the whole layer (default on, survives
  view/period nav); hiding a category hides its habit markers too; a habit marker
  is not draggable but peeks on click showing its occurrence time + completion.
- **Gates**: `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test`, `pnpm build`
  green.

## Verification Checklist

- [ ] Habit occurrences show as repeat markers on each scheduled day in month/week/day/agenda.
- [ ] Timed habits are point markers at their time; no-time habits are all-day markers.
- [ ] Completed occurrences are visually distinct from not-yet-completed ones.
- [ ] Habit markers are colored by category; hiding a category hides its habit markers.
- [ ] Habits toggle hides/shows the whole layer; default on; survives view/period nav; independent of the Reminders toggle.
- [ ] Habit markers are not draggable; clicking peeks with the occurrence time + completion + type.
- [ ] `GET /api/calendar/habits?from=&to=` returns owned, in-window, live occurrences with category color + completion; 400 bad range; 401 unauth.
- [ ] `/api/calendar`, `/api/calendar/reminders`, and the per-category calendar remain unchanged.
- [ ] Pure-helper + service + route + store tests green; build/lint/tsc clean.

## Notes

- **Reuses the layer+toggle pattern** established by `reminders-on-calendar`: a
  typed overlay with its own toggle over the shared grids. Third layer, same
  shape.
- **Additive & backward-compatible**: one more `CalendarEvent.kind` value + an
  optional `completed` field, a new read endpoint, a new store flag, and
  rendering branches; nothing existing changes behavior.
- **Occurrence expansion is server-side and pure** (`generateOccurrences`), so the
  client ships no recurrence logic and the behavior is single-sourced with the
  Habits view.
- **Out of scope**: toggling completion from the calendar, editing the rule from
  the calendar, the per-category calendar habit layer, recurring reminders, RRULE.
- **Workflow**: commit to `main`, conventional commits, no AI attribution, keep
  the suite green.
