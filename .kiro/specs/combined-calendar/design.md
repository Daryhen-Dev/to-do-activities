# Design Document

## Overview

Add a **combined multi-category calendar** at `/(app)/calendar`. It reuses the
existing presentational calendar (`MonthGrid`, `TimeGrid`, `AgendaList`,
`CalendarToolbar`) and the shared `useCalendarStore` (view/anchor), but sources
its data from a **new range endpoint** that spans all of the user's categories
and carries each item's owning category id + color. Events are colored per
category and can be shown/hidden with per-category toggles. Drag-to-reschedule
(D2) works here too and continues to hit the same `PATCH /api/planning-items/[id]`
enforcing the no-overlap rule.

Guiding decisions:

- **Additive, not a rewrite.** The per-category calendar and its endpoint stay
  untouched. The combined view is a parallel container over the same grids.
- **Hard logic stays pure and unit-tested.** Color resolution and event
  visibility filtering are pure functions in `src/lib/`. Components stay thin.
- **No schema changes.** `Category.color` already exists. The endpoint joins
  `PlanningItem → List → Category` to attach `categoryId`/`color`.

### Endpoint decision: one combined endpoint, client-side filtering

- **Chosen** — `GET /api/calendar?from=&to=` returns *all* the user's scheduled
  items in the window (each enriched with `categoryId`/`categoryColor`), and the
  client filters by the toggle state. One request per range; toggling is instant
  (no refetch); mirrors the per-category endpoint's range contract.
- **Rejected** — passing selected category ids as query params: forces a refetch
  on every toggle and complicates caching for no real payload saving (a user has
  few categories).

## Architecture

```
/(app)/calendar/page.tsx (server: auth guard) 
  └─ <CombinedCalendar/> (client container)
       ├─ useWorkspaceStore → categories (ensureLoaded) → legend + toggles
       ├─ useCalendarStore → view/anchor (shared with per-category calendar)
       ├─ useCalendarFilterStore → hiddenCategoryIds (session toggle state)
       ├─ fetch GET /api/calendar?from=&to=  (range from rangeFor(view, anchor))
       │     → toCombinedCalendarEvents(rows)   [pure: attaches categoryId+color]
       ├─ filterVisibleEvents(events, hiddenIds) [pure]
       ├─ <CalendarToolbar/> + <CategoryLegend/> (swatch + toggle per category)
       ├─ month → <MonthGrid/>, week/day → <TimeGrid onReschedule/>, agenda → <AgendaList/>
       ├─ handleReschedule → optimistic + PATCH /api/planning-items/[id] + revert/toast
       └─ <DetailSheet/> on peek

GET /api/calendar/route.ts (thin)
  → listScheduledItemsForCurrentUserRange(from, to)   [service]
       → listScheduledItemsForUser(userId, from, to)   [repository: sole Prisma boundary]
             joins List→Category, returns flat ScheduledItemWithCategory[]
```

## Components and Interfaces

### Pure helpers

#### `src/lib/category-color.ts` (new) — unit-tested

```ts
/** Fixed accessible palette used to derive colors for uncolored categories. */
export const CATEGORY_COLOR_PALETTE: readonly string[];

/**
 * The color used to render a category's events. Returns `color` when set;
 * otherwise derives a STABLE palette color from `categoryId` (same id always
 * maps to the same color across reloads).
 */
export function resolveCategoryColor(
  color: string | null,
  categoryId: string,
): string;
```

- Derivation: a small deterministic hash of `categoryId` modulo the palette
  length. Pure, no randomness — identical input always yields identical output.

#### `src/lib/calendar.ts` (extended) — unit-tested

```ts
/** A calendar event enriched with its owning category (combined view). */
export interface CalendarEvent {
  // ...existing fields...
  /** Present only in the combined view; drives per-category coloring. */
  categoryId?: string;
  categoryName?: string;
  /** Resolved display color (already run through resolveCategoryColor). */
  color?: string;
}

/** API row for the combined endpoint: a planning item + its category info. */
export interface ScheduledItemWithCategory extends PlanningItem {
  categoryId: string;
  categoryName: string;
  categoryColor: string | null;
}

/** Maps combined-endpoint rows to events, resolving each category's color. */
export function toCombinedCalendarEvents(
  rows: ScheduledItemWithCategory[],
): CalendarEvent[];

/** Events whose category is NOT in `hiddenIds` (empty set → all visible). */
export function filterVisibleEvents(
  events: CalendarEvent[],
  hiddenIds: ReadonlySet<string>,
): CalendarEvent[];
```

`toCombinedCalendarEvents` reuses the existing parsing rules (skip items with no
`startAt`, parse dates) and additionally attaches `categoryId`, `categoryName`,
and `color = resolveCategoryColor(row.categoryColor, row.categoryId)`.

### State — `src/stores/calendar-filter-store.ts` (new)

Session UI state for which categories are hidden in the combined view. Tracks
**hidden** ids (not visible ids) so the default is "all on" and newly created
categories appear automatically without bookkeeping.

```ts
interface CalendarFilterState {
  hiddenCategoryIds: Set<string>;
  toggle: (categoryId: string) => void;   // flip membership (new Set each time)
  isHidden: (categoryId: string) => boolean;
  reset: () => void;                       // clear all hidden (show everything)
}
```

Persists for the session (Zustand in-memory), so navigating views/periods keeps
the toggles (Req 3.4). New Set instance on each `toggle` for correct reactivity.

### Presentational components

- **`MonthGrid`, `TimeGrid`, `AgendaList`** gain per-event coloring: when an
  event carries `color`, render it with that color as an **accent** (colored
  left border + a light tint / dot), keeping the existing text foreground so
  titles stay readable at any hue (Req 2.4). When `color` is absent (per-category
  calendar), rendering is unchanged — the change is backward-compatible.
- **`CategoryLegend`** (`src/components/calendar/category-legend.tsx`, new):
  lists the user's categories, each as a color swatch + name + on/off toggle
  button. Reads categories from `useWorkspaceStore` and hidden state from
  `useCalendarFilterStore`. Emits toggles to the store (Req 3.1–3.3).

### Container — `src/components/calendar/combined-calendar.tsx` (new)

Mirrors `CategoryCalendar`'s structure (fetch-by-range, peek sheet, optimistic
reschedule) but:
- Calls `ensureLoaded()` on the workspace store and reads `categories`.
- Fetches `GET /api/calendar?from=&to=` instead of the per-category endpoint,
  maps with `toCombinedCalendarEvents`, then applies `filterVisibleEvents` before
  rendering.
- Renders `<CategoryLegend/>` next to the toolbar.
- `handleReschedule` is identical in shape to the per-category one (optimistic →
  PATCH → revert/toast). To avoid duplicating the glue, the small
  `errorMessage(res, fallback)` + reschedule body may be extracted into a shared
  `src/lib/calendar-reschedule.ts` helper used by both containers; if extraction
  proves noisy it stays duplicated (both are tiny). Either way behavior is the
  D2 behavior unchanged.

### Route — `src/app/(app)/calendar/page.tsx` (new)

Server component under the `(app)` route group (inherits the sidebar shell +
`auth()` guard). Renders `<CombinedCalendar/>`. Fills available screen space,
consistent with the per-category calendar.

### Backend

#### Repository — `src/repositories/planning-item.repository.ts`

New function (sole Prisma boundary), modeled on `listScheduledItemsByCategory`
but scoped to the whole user and joined to the category:

```ts
export async function listScheduledItemsForUser(
  userId: string,
  from: Date,
  to: Date,
): Promise<ScheduledItemWithCategory[]>;
```

Same overlap predicate (`startAt < to AND coalesce(endAt, startAt) >= from`,
`deletedAt: null`, live list + category), scoped by `userId`, using
`include: { list: { select: { category: { select: { id, name, color } } } } }`,
then flattened to the `ScheduledItemWithCategory` shape (Prisma types never leak
past this layer). Ordered `startAt asc, createdAt asc`.

#### Service — `src/services/planning-item.service.ts`

```ts
export async function listScheduledItemsForCurrentUserRange(
  from: Date,
  to: Date,
): Promise<ScheduledItemWithCategory[]>;
```

Resolves the acting user via `getCurrentUserId()` (authoritative ownership) and
delegates to the repository. No category-ownership precheck is needed — the
query is already scoped to `userId`.

#### Route — `src/app/api/calendar/route.ts` (new)

Thin handler mirroring the per-category calendar route: reuse the same
`rangeSchema` (`from`/`to` coerced dates, `to > from`) and `mapErrorToResponse`
contract (ZodError → 400, ValidationError → 400, UnauthorizedError → 401, else
500). `GET` parses the range, calls the service, returns the array.

## Data Models

No schema changes. A new **read** projection `ScheduledItemWithCategory`
(`PlanningItem` + `categoryId` + `categoryName` + `categoryColor`) is assembled
in the repository from the `List → Category` join. `Category.color` is the
existing `String?` column.

## Error Handling

- **Missing/invalid `from`/`to`** → `400` via the shared `rangeSchema`; no
  partial data (Req 4.3).
- **Unauthenticated** → `getCurrentUserId()` throws `UnauthorizedError` → `401`
  (Req 4.5).
- **Reschedule overlap** → server `400` (no-overlap rule) → optimistic revert +
  conflict toast (Req 5.2).
- **Reschedule network/other failure** → revert + generic error toast.
- **Calendar load failure** → non-blocking error toast; the grid renders empty
  rather than crashing (Req 1.4).
- **All categories hidden** → `filterVisibleEvents` returns `[]` → empty state,
  never an error (Req 3.5).

## Correctness Properties

### Property 1: Color resolution is deterministic and stable

`resolveCategoryColor(color, id)` returns `color` when it is a non-null value,
and otherwise returns a palette color derived from `id` such that the same `id`
always yields the same color (no randomness, stable across calls/reloads).

**Validates: Requirements 2.1, 2.2**

### Property 2: Visibility filter is exact

`filterVisibleEvents(events, hiddenIds)` returns exactly the events whose
`categoryId` is not in `hiddenIds`: an empty `hiddenIds` returns all events, and
a `hiddenIds` covering every present category returns none.

**Validates: Requirements 3.2, 3.3, 3.5**

### Property 3: Combined mapping attaches category + color and drops unscheduled

`toCombinedCalendarEvents` returns one event per row that has a `startAt`
(unscheduled rows are dropped), each carrying its `categoryId`, `categoryName`,
and a resolved `color`, with dates parsed to `Date`.

**Validates: Requirements 2.3, 4.2**

### Property 4: Combined range query is user-scoped

`listScheduledItemsForUser` returns only items belonging to `userId` whose
schedule intersects `[from, to)`, across all of that user's categories, each
carrying its category id/color.

**Validates: Requirements 4.1, 4.2, 4.4**

### Property 5: Reschedule touches only the schedule

Reschedule in the combined view reuses the D2 path and sends only
`startAt`/`endAt`; the event's category, list, title, priority, status, and
`dueAt` are never included.

**Validates: Requirements 5.4**

## Testing Strategy

- **Pure helpers (primary coverage)**:
  - `resolveCategoryColor` — returns the set color; derives a stable color for a
    null color; same id → same color; different ids spread across the palette.
  - `filterVisibleEvents` — empty hidden set returns all; hidden id removes only
    that category; all-hidden returns none.
  - `toCombinedCalendarEvents` — attaches categoryId/name/color; drops rows with
    no `startAt`; parses dates.
- **Backend (layered)**: repository `listScheduledItemsForUser` (user scope,
  range overlap, category join, excludes deleted / other users) against the test
  DB using the stable seeded categories; service `listScheduledItemsForCurrentUserRange`
  (delegates with the resolved user); route `GET /api/calendar` (200 with data,
  400 on missing/invalid range, 401 unauthenticated).
- **Interaction**: manual smoke test — `/calendar` shows events from multiple
  categories in distinct colors; toggling a category hides/shows its events
  instantly; drag reschedules and an overlapping drop reverts with the conflict
  toast; per-category calendar still works unchanged.
- Gates: `pnpm build`, `pnpm test`, `pnpm lint`, `pnpm exec tsc --noEmit` green.

## Verification Checklist

- [ ] `/calendar` renders events across all categories, each in its category color.
- [ ] Uncolored categories get a stable derived color (same on reload).
- [ ] Category legend toggles hide/show events instantly; state survives view/period nav.
- [ ] All-off shows an empty state, not an error.
- [ ] `GET /api/calendar?from=&to=` returns owned items with categoryId+color; 400 on bad range; 401 unauth.
- [ ] Drag reschedule works and respects the cross-category no-overlap rule.
- [ ] Per-category calendar and its endpoint remain unchanged.
- [ ] Pure-helper unit tests + backend layered tests green; build/lint/tsc clean.
