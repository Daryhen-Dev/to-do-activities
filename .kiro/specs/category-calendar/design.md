# Design Document

## Overview

Add a per-category calendar at `/categories/[id]/calendar`: a custom,
in-house calendar component (no calendar library) with a **month** grid and an
**agenda** list, read-only, scoped to one category. It consumes the existing
`GET /api/categories/[id]/calendar?from=&to=` endpoint (Spec A) and holds its
view state (active view + anchor month) in a small Zustand store.

The design keeps the hard, testable parts as **pure functions** — building the
month grid and bucketing events into days — so behavior is proven by unit tests
while the React components stay thin. Timezone handling lives only at the render
boundary: the API returns UTC ISO strings; the calendar maps them to local days.

## Architecture

```
(app)/categories/[id]/calendar/page.tsx (RSC)
  └─ getCategoryForCurrentUser(id)  → notFound() on NotFoundError (Req 1.3)
     └─ <CategoryCalendar categoryId category.name /> (client)
          ├─ useCalendarStore (Zustand): view ("month"|"agenda"), anchorDate
          │     actions: setView, goToPrevMonth, goToNextMonth, goToToday
          ├─ visibleRange = rangeFor(view, anchorDate)          ← pure
          ├─ fetch GET /api/categories/[id]/calendar?from&to    ← on range change
          ├─ <CalendarToolbar> (title, prev/next/today, month|agenda toggle)
          ├─ month → <MonthGrid weeks=buildMonthGrid(anchor) events=… />  ← pure grid
          └─ agenda → <AgendaList groups=groupEventsByDay(events) />        ← pure
```

## Components and Interfaces

### Route (`src/app/(app)/categories/[id]/calendar/page.tsx`, RSC)

Mirror the resolved-in-RSC pattern already used by the list page:

- `params: Promise<{ id: string }>`; `const { id } = await params`.
- `const category = await getCategoryForCurrentUser(id)` in try/catch;
  `NotFoundError` → `notFound()` (Req 1.3), rethrow otherwise.
- Render `<CategoryCalendar categoryId={category.id} categoryName={category.name} />`.

### Calendar view store (`src/stores/calendar-store.ts`, Zustand)

```ts
type CalendarView = "month" | "agenda";
interface CalendarState {
  view: CalendarView;
  anchorDate: Date;      // any date within the shown month
  setView: (view: CalendarView) => void;
  goToPrevMonth: () => void;
  goToNextMonth: () => void;
  goToToday: () => void;
}
```

- Holds only UI/view state (Req 4.3); event data is not stored here.
- `anchorDate` defaults to `new Date()`. Month moves shift the anchor by ±1
  month; `goToToday` resets it to now and is also handy after navigating.

### Pure calendar helpers (`src/lib/calendar.ts`) — unit-tested

```ts
interface CalendarEvent {
  id: string;
  title: string;
  startAt: Date;         // parsed from the API's ISO string
  endAt: Date | null;
  allDay: boolean;
}

/** The 6-week (max) grid of days covering the anchor month, week-aligned. */
function buildMonthGrid(anchor: Date, weekStartsOn?: 0 | 1): Date[][];

/** [from, to) the calendar needs data for, given the view + anchor. */
function rangeFor(view: CalendarView, anchor: Date): { from: Date; to: Date };

/** Events whose local [start, end] interval covers `day` (Req 2.2, 2.4). */
function eventsOnDay(events: CalendarEvent[], day: Date): CalendarEvent[];

/** Upcoming events grouped by local day, sorted, for the agenda (Req 3.1). */
function groupEventsByDay(
  events: CalendarEvent[],
  from: Date,
): { day: Date; events: CalendarEvent[] }[];

/** Maps the API rows (ISO strings) into CalendarEvent (parsed dates). */
function toCalendarEvents(rows: PlanningItem[]): CalendarEvent[];
```

Rules encoded here:
- **Grid** (Req 2.1): start from the first day of the anchor month, walk back to
  the week start, and emit full weeks until the month is covered (6 weeks max),
  using **local** date arithmetic.
- **Day membership** (Req 2.2, 2.4): an event covers `day` when its local
  interval `[startAt, endAt ?? startAt]` intersects that local calendar day; so
  multi-day events appear in every day they span within the grid.
- **Range** (Req 4.4, 5.1): month view → the grid's first day through the day
  after its last day; agenda → `[startOfToday, +N days)` (N is a small constant,
  e.g. 30). All boundaries are local.
- **Agenda grouping** (Req 3.1): filter to events at/after `from`, sort by
  `startAt`, group by local day.

### Calendar component (`src/components/calendar/category-calendar.tsx`, client)

- Reads `view`/`anchorDate` + actions from `useCalendarStore`.
- Computes `visibleRange = rangeFor(view, anchorDate)` and fetches
  `/api/categories/[id]/calendar?from=&to=` whenever the range changes (Req 4.4,
  5.1, 5.4); `sonner` toast on failure (Req 5.3); loading flag drives a spinner/
  skeleton (Req 7.1). Maps rows via `toCalendarEvents`.
- Renders `<CalendarToolbar>` and, by `view`, `<MonthGrid>` or `<AgendaList>`.

### Presentational pieces

- `src/components/calendar/calendar-toolbar.tsx`: month/year title, prev / today
  / next controls, and a month|agenda toggle. Calls the store actions.
- `src/components/calendar/month-grid.tsx`: weekday header + the `Date[][]`
  weeks; each cell shows the day number (current day highlighted, Req 2.3),
  out-of-month days dimmed, and up to `MAX_PER_DAY` event chips via
  `eventsOnDay`, with a "+N more" indicator on overflow (Req 2.5). Each chip
  shows the local start time (or "All day") and the title.
- `src/components/calendar/agenda-list.tsx`: day-grouped list from
  `groupEventsByDay`, each entry showing time range or "All day" + title; a
  neutral empty message when there are no groups (Req 3.3, 7.2).

### Navigation entry points (Req 1.2)

- **Sidebar**: add a per-category "Calendar" action (a small calendar icon in the
  category group, next to the add-list action) linking to
  `/categories/[id]/calendar`.
- **Dashboard**: add a "Calendar" link on each `CategoryCard` (alongside the
  existing list links).

## Data Models

No schema changes. The calendar is a read view over scheduled `PlanningItem`s;
`CalendarEvent` is a client-side projection with parsed `Date`s.

## Error Handling

- Non-owned/absent category on the route → `notFound()` (404) via the RSC
  service call (Req 1.3).
- Failed event fetch → `sonner` toast, keep the last-rendered grid/agenda; never
  throw to the error boundary (Req 5.3).
- Invalid range never reaches the API: ranges are always computed from
  `rangeFor` (well-formed `from < to`).

## Correctness Properties

### Property 1: Grid completeness and alignment

`buildMonthGrid(anchor)` returns whole weeks (length divisible by 7), the anchor
month's first and last days are included, and every row starts on the configured
week-start day.

**Validates: Requirements 2.1**

### Property 2: Day membership matches the interval

`eventsOnDay(events, day)` returns exactly the events whose local
`[startAt, endAt ?? startAt]` interval intersects `day`, so single-day events
appear once and multi-day events appear on every covered day.

**Validates: Requirements 2.2, 2.4**

### Property 3: Range drives the fetch window

`rangeFor(view, anchor)` yields `from < to` covering the visible period for each
view, and the component refetches whenever it changes.

**Validates: Requirements 4.4, 5.1, 5.4**

### Property 4: Agenda ordering and grouping

`groupEventsByDay` includes only events at/after `from`, orders groups and their
events by `startAt`, and groups strictly by local day.

**Validates: Requirements 3.1**

## Testing Strategy

- **Pure helpers (primary coverage)** in `src/lib/calendar.test.ts`:
  `buildMonthGrid` (whole weeks, alignment, month coverage across month lengths
  and a month starting on the week-start boundary), `rangeFor` (month vs agenda
  windows, `from < to`), `eventsOnDay` (single-day hit/miss, multi-day spanning,
  all-day, local-day boundaries), `groupEventsByDay` (ordering, grouping, `from`
  filter), and `toCalendarEvents` (ISO-string parsing, null `endAt`).
- **Store** in `src/stores/calendar-store.test.ts`: `setView`; month navigation
  shifts the anchor by exactly one month (including year rollover);
  `goToToday` resets to the current month.
- **Rendering**: manual smoke test (open a category calendar; events land on the
  right days with correct local times; prev/next/today and month/agenda toggle
  work; empty and loading states). No React component test framework yet.
- Gates: `pnpm build`, `pnpm test`, `pnpm lint`, `pnpm exec tsc --noEmit` green.

## Verification Checklist

- [ ] Grid and event-bucketing unit tests cover Requirements 2 and 3.
- [ ] Calendar reachable from the sidebar and a dashboard card link.
- [ ] A non-owned category calendar 404s.
- [ ] Times render in local timezone; all-day events show no time.
- [ ] Read-only: no create/edit/drag affordances.
