# Design Document

## Overview

Add **week** and **day** hour-grid views to the per-category calendar. Both
render a vertical hour axis with one column per day; timed events are blocks
positioned by local start time and sized by duration, overlapping events are
laid out in side-by-side lanes, and all-day events sit in a strip above the
grid. Read-only (drag-to-reschedule is D2). No schema changes; reuses the Spec A
range endpoint and the existing Zustand calendar store.

As with the rest of the calendar, the hard logic — week-day construction, range
windows, and the overlap-lane layout — lives in **pure functions** in
`src/lib/calendar.ts`, so it is unit-tested; the components are thin renderers.

## Architecture

```
CategoryCalendar (client)
  ├─ useCalendarStore: view ("month"|"week"|"day"|"agenda"), anchorDate
  │     view-aware nav: goToPrev / goToNext (by month|week|day), goToToday, setView
  ├─ rangeFor(view, anchor)  → fetch GET /api/categories/[id]/calendar?from&to
  ├─ view === "month"  → <MonthGrid/>
  ├─ view === "agenda" → <AgendaList/>
  └─ view === "week" | "day" → <TimeGrid days=… events=… onPeek=… />
        uses buildWeekDays(anchor) (week) or [startOfDay(anchor)] (day)
        per day: layoutDayEvents(events, day) → positioned timed blocks + all-day
```

## Components and Interfaces

### Calendar view store (`src/stores/calendar-store.ts`) — changes

- Extend `CalendarView` to `"month" | "week" | "day" | "agenda"`.
- Replace `goToPrevMonth`/`goToNextMonth` with **view-aware** `goToPrev()` /
  `goToNext()` that shift `anchorDate` by the active view's unit:
  - month → ±1 month, week → ±7 days, day → ±1 day, agenda → ±7 days.
- Keep `setView` and `goToToday`.

### Pure helpers (`src/lib/calendar.ts`) — additions

```ts
/** Local midnight of the week-start day for the week containing `date`. */
function startOfWeek(date: Date, weekStartsOn?: 0 | 1): Date;

/** The 7 local days of `anchor`'s week (week-start aligned). */
function buildWeekDays(anchor: Date, weekStartsOn?: 0 | 1): Date[];

/** A timed event positioned within a single day's grid. */
interface PositionedEvent {
  event: CalendarEvent;
  startMin: number;   // minutes from local midnight, clamped [0, 1440]
  endMin: number;     // > startMin (min duration enforced)
  lane: number;       // 0-based overlap lane
  lanes: number;      // total lanes in this event's overlap cluster
}

interface DayLayout {
  allDay: CalendarEvent[];       // all-day events for the day
  timed: PositionedEvent[];      // positioned timed events
}

/** Splits a day's events into an all-day strip and a laid-out timed set. */
function layoutDayEvents(events: CalendarEvent[], day: Date): DayLayout;
```

- **`rangeFor`** extends: `week` → `[startOfWeek(anchor), +7 days)`; `day` →
  `[startOfDay(anchor), +1 day)`. Month/agenda unchanged.
- **`layoutDayEvents`** rules:
  - Consider events intersecting `[dayStart, dayEnd)`.
  - **All-day** events (`allDay === true`) go to `allDay`, excluded from timed.
  - For **timed** events, compute `startMin`/`endMin` clamped to `[0, 1440]`
    (an event spilling in/out of the day is clamped to the day's bounds); a
    zero/near-zero or missing-end duration is given a minimum block
    (`MIN_EVENT_MINUTES`, e.g. 30).
  - **Lane assignment (overlap):** sort by `startMin` then `endMin`; sweep to
    form clusters of mutually overlapping events; within a cluster, greedily
    assign each event the first lane whose last event ended at/before this
    event's start; `lanes` = the cluster's max concurrent count. Non-overlapping
    events get `lanes = 1`.
- The component derives geometry from minutes: `top = startMin / 1440`,
  `height = (endMin - startMin) / 1440`, `left = lane / lanes`,
  `width = 1 / lanes` (as percentages of the column).

### TimeGrid component (`src/components/calendar/time-grid.tsx`, client)

- Props: `days: Date[]`, `events: CalendarEvent[]`, `onPeek?: (e) => void`.
- Layout: a left hour-axis gutter (00–23 labels) plus one column per day.
- **All-day strip**: a row across the top; per day, its `layoutDayEvents().allDay`
  events as chips.
- **Hour grid**: a scrollable body with a fixed height per hour
  (`HOUR_HEIGHT`, e.g. 48px → day height = 24 × HOUR_HEIGHT). Hour lines drawn
  per row. Per day column, render each `PositionedEvent` absolutely using the
  minute-derived top/height/left/width. Each block is a read-only button that
  calls `onPeek(event)` (opens the existing bottom `DetailSheet`).
- **Now indicator**: if a rendered day is today, draw a horizontal line at the
  current local time; a `setInterval` (cleared on unmount) refreshes it each
  minute. Today's column/header is visually distinguished.
- Body auto-scrolls to a sensible start (e.g. 07:00) on mount so early-morning
  is reachable but the working day is visible; nothing is hidden (Req 1.5).

### CalendarToolbar (`src/components/calendar/calendar-toolbar.tsx`) — changes

- View toggle offers **Month, Week, Day, Agenda**.
- Prev/next call the view-aware `goToPrev`/`goToNext`.
- Title adapts to the view: month → "July 2026"; week → "Jul 13 – 19, 2026"
  (range of the week); day → "Wed, Jul 15, 2026".

### CategoryCalendar (`src/components/calendar/category-calendar.tsx`) — changes

- Add `view === "week"` → `<TimeGrid days={buildWeekDays(anchorDate)} …/>` and
  `view === "day"` → `<TimeGrid days={[startOfDay(anchorDate)]} …/>`.
- `rangeFor(view, anchorDate)` already drives the fetch; the memoized inputs
  extend to cover the week/day builders. The existing `onPeek`/DetailSheet wiring
  is reused for time-grid blocks.

## Data Models

No schema changes. `PositionedEvent`/`DayLayout` are client-side projections of
`CalendarEvent`.

## Error Handling

Unchanged from the calendar: a failed range fetch shows a `sonner` toast and
keeps the last render; ranges always come from `rangeFor` (well-formed
`from < to`). No new server paths.

## Correctness Properties

### Property 1: Week/day range windows

`rangeFor("week", anchor)` spans the week-start-aligned 7-day window containing
`anchor`, and `rangeFor("day", anchor)` spans that local day; both yield
`from < to`.

**Validates: Requirements 4.2, 5.1**

### Property 2: Week days are contiguous and aligned

`buildWeekDays(anchor)` returns exactly 7 consecutive local days beginning on
the configured week-start day of `anchor`'s week.

**Validates: Requirements 1.1**

### Property 3: Overlap lanes keep every event visible

In `layoutDayEvents`, any two events that overlap in time receive different
lanes, `lanes` is at least the maximum number of concurrently overlapping
events, and every timed event has `0 <= lane < lanes` — so no event is hidden
behind another.

**Validates: Requirements 3.1, 3.2**

### Property 4: All-day events are separated and timed events are clamped

All-day events appear only in `DayLayout.allDay` (never in `timed`), and every
timed event's `[startMin, endMin]` is within `[0, 1440]` with
`endMin - startMin >= MIN_EVENT_MINUTES`.

**Validates: Requirements 2.1, 2.2, 1.3**

## Testing Strategy

- **Pure helpers (primary coverage)** in `src/lib/calendar.test.ts` (extend it):
  `startOfWeek`/`buildWeekDays` (7 contiguous aligned days, week-start 0 and 1,
  month/year boundaries); `rangeFor` week/day windows; `layoutDayEvents`
  (all-day separation; clamping of events spilling across midnight; min-height
  for missing/zero `endAt`; lane assignment for non-overlapping, fully
  overlapping, and partially overlapping sets, asserting distinct lanes and
  correct `lanes` counts).
- **Store** in `src/stores/calendar-store.test.ts` (extend it): view-aware
  `goToPrev`/`goToNext` shift by month/week/day per the active view (including
  week crossing a month boundary and day crossing a week boundary);
  `goToToday`/`setView` unchanged.
- **Rendering**: manual smoke test (week/day show events at correct times;
  overlaps sit side by side; all-day strip; now line on today; toggle and
  prev/next by the right unit; click opens the DetailSheet). No React component
  test framework yet.
- Gates: `pnpm build`, `pnpm test`, `pnpm lint`, `pnpm exec tsc --noEmit` green.

## Verification Checklist

- [ ] Layout and range unit tests cover Requirements 1–4.
- [ ] Week/Day appear in the toggle and navigate by the right unit.
- [ ] Events land at correct local times; overlaps are all visible.
- [ ] All-day strip separates all-day events.
- [ ] Now indicator shows on today; read-only (click opens details only).
