# Design Document

## Overview

Add an **Objectives view** at `/(app)/objectives`: a stack of the user's
objectives rendered as **progress bars ordered by deadline**, each showing days
remaining and a status. An objective is an `objetivo`-type `PlanningItem` with a
**dedicated timeframe** (`objectiveStartAt` / `objectiveEndAt`) and a manual
`progress` (0–100) — three new nullable columns. Because objectives use their own
timeframe columns (not `startAt`/`endAt`), the calendar (which filters
`startAt`) and the no-overlap rule (which checks `startAt`) ignore them
automatically — **no coupling, no type checks anywhere**. A new read endpoint
`GET /api/objectives` feeds the view; create/edit/delete/progress all reuse the
existing `/api/planning-items` endpoints, which are extended to carry the three
new fields exactly like `remindAt`.

Guiding decisions:

- **Dedicated columns for total separation.** `objectiveStartAt`/
  `objectiveEndAt`/`progress` keep objectives out of the calendar and the
  no-overlap rule with zero changes to that code — the cleanest possible
  isolation.
- **No new write endpoints.** The three fields flow through the existing
  create/update planning-item path (validator + service), like `remindAt`.
  Progress updates are just a `PATCH /api/planning-items/[id] { progress }`.
- **Hard logic stays pure and unit-tested.** Days-remaining, progress clamping,
  and status derivation are pure functions in `src/lib/objectives.ts`; the view
  is a thin renderer with local state + optimistic mutations.
- **Reminders reuse `remindAt`.** An objective's optional reminder is the
  existing `remindAt` (bell + calendar reminder layer). Recurring reminders are
  deferred to the habits work.

## Architecture

```
sidebar "Objectives" → /(app)/objectives/page.tsx (server: (app) auth shell)
  └─ <ObjectivesView/> (client)
       ├─ useWorkspaceStore + useItemTypeStore (categories/lists + `objetivo` type id)
       ├─ fetch GET /api/objectives → ObjectiveWithCategory[]  (local state)
       ├─ stack of <ObjectiveCard/> (progress bar + daysRemaining + status + inline progress)
       │     inline progress commit → PATCH /api/planning-items/[id] { progress }
       ├─ create/edit → <ObjectiveFormDialog/> (title, body, section, start, end, progress, reminder)
       │     create → POST /api/planning-items { itemTypeId: objetivo, objectiveStartAt, objectiveEndAt, progress, remindAt, ... }
       │     edit   → PATCH /api/planning-items/[id] { ...same fields }
       └─ delete   → DELETE /api/planning-items/[id]   (optimistic, revert on error)

GET /api/objectives/route.ts (thin)
  → listObjectivesForCurrentUser()            [service]
       → listObjectivesByUser(userId)         [repository: sole Prisma boundary]
             where itemType.key = "objetivo", live, joins List→Category, order objectiveEndAt asc nulls last
```

## Data Models

### Schema change — `PlanningItem` (`src/prisma/schema.prisma`)

Add three nullable columns:

```prisma
model PlanningItem {
  // ...existing fields...
  objectiveStartAt DateTime? @map("objective_start_at")
  objectiveEndAt   DateTime? @map("objective_end_at")
  progress         Int?      @map("progress")   // 0..100, objective completion
  // ...
  @@index([userId, objectiveEndAt])   // supports the deadline-ordered objectives scan
}
```

Migration via `pnpm db:migrate` (name e.g. `add_objective_fields`). All nullable
with no default → backward-compatible; existing rows get `null` (not objectives).

### Read projection — `src/lib/objectives.ts`

```ts
/** An objective enriched with its owning category (the section). */
export interface ObjectiveWithCategory extends PlanningItem {
  categoryId: string;
  categoryName: string;
  categoryColor: string | null;
}
```

## Components and Interfaces

### Pure helpers — `src/lib/objectives.ts` (new) — unit-tested

```ts
import type { PlanningItem } from "@prisma/client";

export type ObjectiveStatus = "completed" | "overdue" | "no-deadline" | "active";

export interface ObjectiveWithCategory extends PlanningItem { /* see above */ }

/**
 * Whole calendar days from `now` to `endAt` (both reduced to local midnight):
 * positive when the deadline is ahead, 0 on the deadline day, negative once
 * past. Returns null when there is no deadline. `now` is injected (pure).
 */
export function daysRemaining(endAt: Date | null, now: Date): number | null;

/** Rounds and clamps an arbitrary number into the 0..100 progress range. */
export function clampProgress(value: number): number;

/**
 * Objective status from progress + deadline relative to `now`:
 * progress >= 100 → "completed"; else no deadline → "no-deadline";
 * else deadline before today → "overdue"; else "active".
 */
export function objectiveStatus(
  endAt: Date | null,
  progress: number | null,
  now: Date,
): ObjectiveStatus;
```

- `daysRemaining` compares local start-of-day of `now` and `endAt` so a deadline
  later today reads as 0 days, tomorrow as 1, yesterday as −1. Pure/deterministic.
- `clampProgress(x)` = `Math.max(0, Math.min(100, Math.round(x)))`.
- `objectiveStatus` treats `progress` null as 0. Order of checks as above so a
  completed objective never reads as overdue.

### Presentational + container — `src/components/objectives/objectives-view.tsx` (new, client)

Mirrors `NotesView`/`TaskList` (local state + optimistic mutations + toasts):

- On mount: `ensureLoaded()` on the workspace store (categories + lists) and the
  item-type store (resolve the `objetivo` type id by key). Fetch
  `GET /api/objectives` into `objectives` state.
- Render the stack of `<ObjectiveCard/>` in the order returned (already
  deadline-sorted by the endpoint).
- Create: a "New objective" trigger → `<ObjectiveFormDialog mode="create"/>` →
  `POST /api/planning-items` with `{ title, description?, listId, itemTypeId:
  objetivoTypeId, objectiveStartAt, objectiveEndAt, progress, remindAt }` →
  prepend/refresh on success; disabled with a hint if the user has no lists.
- Edit: `<ObjectiveFormDialog mode="edit"/>` → `PATCH /api/planning-items/[id]`
  with the same fields → replace in state.
- Delete: optimistic remove + `DELETE /api/planning-items/[id]` → revert + toast
  on failure.
- Empty state when there are no objectives (Req 1.5).
- After any create/edit, rebuild the `ObjectiveWithCategory` from the returned
  item + the workspace tree (same `toObjective` helper approach as notes), and
  re-sort by deadline client-side so a changed deadline reorders the stack.

### `ObjectiveCard` (`src/components/objectives/objective-card.tsx`, new)

- Title + section swatch (category) + `objectiveStatus` badge.
- A progress bar: a filled div with `role="progressbar"`, `aria-valuenow`,
  `aria-valuemin=0`, `aria-valuemax=100`.
- A days-remaining line derived from `daysRemaining` + status (e.g. "3 days
  left", "Overdue by N days", "Completed", "No deadline").
- **Progress editing is a separate, explicit mode** (not an always-on control).
  By default the bar is read-only; an "Update progress" button reveals a range
  slider with Save/Cancel. A `draft` value is used only while editing (the bar
  reflects it live); Save calls `onProgressCommit(id, draft)` and returns to
  read-only, Cancel discards it. Outside edit mode the card always reflects the
  saved `progress`, so it never goes stale after a dialog edit. This keeps
  "view" and "edit" as distinct states rather than overlapping a slider on the
  display bar.
- Edit (opens `ObjectiveFormDialog`) and delete (confirm `AlertDialog`)
  affordances, delegated via props.

### `ObjectiveFormDialog` (`src/components/objectives/objective-form-dialog.tsx`, new)

`FormSheet`-based create/edit form: `title` (required ≤ 500), `description`
(optional ≤ 2000), **section** select (list grouped by category, reusing the
notes/task pattern), **start** and **end** date inputs (`type="date"`),
**progress** (number input 0–100), and an optional **reminder**
(`datetime-local`, reusing `remindAt`). Zod-validated, including
`objectiveEndAt >= objectiveStartAt` when both are present. Resolves `true` on
success. Payload carries `objectiveStartAt`/`objectiveEndAt` (ISO or null),
`progress`, and `remindAt` (ISO or null).

### Route — `src/app/(app)/objectives/page.tsx` (new)

Server component under the `(app)` group (sidebar shell + `auth()` guard),
rendering `<ObjectivesView/>` in a centered content column.

### Navigation — `src/components/layout/app-sidebar.tsx` (edited)

Add a top-level "Objectives" link (a `Target` icon → `/objectives`, `isActive`
when `pathname === "/objectives"`) in the same group as Calendar and Notes.

## Backend

### Validators — `src/validators/planning-item.schema.ts` (edited)

- `createPlanningItemSchema`: add `objectiveStartAt: z.coerce.date().optional()`,
  `objectiveEndAt: z.coerce.date().optional()`, `progress:
  z.number().int().min(0).max(100).optional()`. Add a refine:
  `objectiveEndAt >= objectiveStartAt` when both are present (path
  `objectiveEndAt`). Independent of the existing schedule refines.
- `updatePlanningItemSchema`: add the same three as nullable + optional
  (`objectiveStartAt`/`objectiveEndAt` `.nullable().optional()`, `progress`
  `.int().min(0).max(100).nullable().optional()`). The authoritative
  timeframe check runs in the service against the EFFECTIVE (merged) values.

### Repository — `src/repositories/planning-item.repository.ts` (edited)

- Extend `CreatePlanningItemData` and `UpdatePlanningItemData` with
  `objectiveStartAt?: Date | null`, `objectiveEndAt?: Date | null`,
  `progress?: number | null`.
- `listObjectivesByUser(userId): Promise<ObjectiveWithCategory[]>`: `where` =
  `userId`, `deletedAt: null`, `archived: false`, `itemType: { key: "objetivo"
  }`, live `list` + `category: { userId, deletedAt: null }`. `include` the
  `List → Category` select; flatten to `ObjectiveWithCategory`. Order
  `objectiveEndAt: { sort: "asc", nulls: "last" }`.

### Service — `src/services/planning-item.service.ts` (edited)

- Add `validateObjectiveTimeframe(start, end)` (mirrors `validateSchedule`): when
  both present, `end >= start` else `ValidationError`. Called on create and on
  update against the effective (merged) timeframe. It does **not** touch
  `validateSchedule` or `assertNoTimedOverlap` — objective dates are separate
  from `startAt`/`endAt`, so the overlap rule is never involved (no coupling).
- `createPlanningItemForCurrentUser`: forward `objectiveStartAt ?? null`,
  `objectiveEndAt ?? null`, `progress ?? null` after `validateObjectiveTimeframe`.
- `updatePlanningItemForCurrentUser`: when present, forward each of the three;
  compute the effective start/end (stored overlaid with the patch, `null` =
  clear) and run `validateObjectiveTimeframe`. `progress` is passed through
  (already validated/clamped by the schema; the schema min/max guards it).
- `listObjectivesForCurrentUser(): Promise<ObjectiveWithCategory[]>` — resolves
  the user and delegates to `listObjectivesByUser`.

### Route — `src/app/api/objectives/route.ts` (new)

Thin `GET`: calls `listObjectivesForCurrentUser`, returns the array with 200.
Reuse the shared `mapErrorToResponse` (UnauthorizedError → 401, else 500).

## Error Handling

- **Inconsistent timeframe** (`objectiveEndAt < objectiveStartAt`) → Zod 400 on
  create; `ValidationError` 400 on update (effective check) (Req 4.2).
- **Out-of-range progress** → Zod 400 (schema min/max) (Req 2.3); the client also
  clamps before sending.
- **Unauthenticated** → `401` on `GET /api/objectives` (Req 6.4).
- **Objectives load failure** → non-blocking error toast; view renders empty.
- **Create/edit/delete/progress failure** → surfaced via the existing
  `/api/planning-items` error bodies; optimistic changes reverted (Req 2.4, 5.6).

## Correctness Properties

### Property 1: Days-remaining is whole-day and time-injected

`daysRemaining(endAt, now)` returns null when `endAt` is null; otherwise the
signed whole number of local calendar days from `now`'s day to `endAt`'s day
(0 on the deadline day, positive ahead, negative past), depending only on its two
arguments.

**Validates: Requirements 3.1, 3.2**

### Property 2: Progress clamping is total

`clampProgress(x)` returns an integer in `[0, 100]` for any finite input:
values below 0 become 0, above 100 become 100, and in-range values round to the
nearest integer.

**Validates: Requirements 2.3**

### Property 3: Status derivation is correct and ordered

`objectiveStatus(endAt, progress, now)` returns `completed` when progress ≥ 100
(regardless of deadline), else `no-deadline` when `endAt` is null, else `overdue`
when the deadline is before today, else `active` — treating null progress as 0.

**Validates: Requirements 3.2, 3.3, 3.4**

### Property 4: Objectives query is user-scoped, type-filtered, deadline-ordered

`listObjectivesByUser(userId)` returns only `objetivo`-type live items of
`userId`, each with its category, ordered by `objectiveEndAt` ascending with
no-deadline objectives last; non-`objetivo`, deleted, archived, and other users'
items are excluded.

**Validates: Requirements 6.1, 6.2, 6.3, 6.5, 1.3**

### Property 5: Timeframe is validated and calendar-independent

Creating/updating an objective enforces `objectiveEndAt >= objectiveStartAt` when
both are set, and setting the objective timeframe never sets `startAt`/`endAt`,
never triggers `assertNoTimedOverlap`, and never makes the item appear in the
calendar range queries (which filter `startAt`).

**Validates: Requirements 4.2, 4.3, 4.4**

## Testing Strategy

- **Pure helpers (primary coverage)** — `src/lib/objectives.test.ts`:
  `daysRemaining` (null end → null; future/today/past → correct signed whole
  days; time-of-day within a day ignored); `clampProgress` (below/above/in-range,
  rounding, negatives); `objectiveStatus` (completed wins over overdue; null end
  → no-deadline; past + <100 → overdue; else active; null progress treated as 0).
- **Backend (layered)**:
  - Repository `listObjectivesByUser` — only `objetivo` live items with category;
    excludes a non-objective, deleted, archived, and other users; ordered by
    `objectiveEndAt asc` with a null-deadline objective last. Test DB + stable
    seed + idempotent cleanup (resolve the `objetivo` type id from the seed).
  - Service — `createPlanningItemForCurrentUser`/`updatePlanningItemForCurrentUser`
    forward the three fields; `validateObjectiveTimeframe` rejects
    `end < start` (create and effective update) and never invokes the overlap
    check for objective dates; `listObjectivesForCurrentUser` delegates.
  - Validator — create accepts the three fields and rejects `end < start` and
    out-of-range progress; update accepts nulls to clear and rejects bad
    progress.
  - Route `GET /api/objectives` — 200 with data; 401 unauthenticated.
- **Interaction (manual smoke test)**: `/objectives` lists objectives as bars
  ordered by deadline; days-remaining and status render (active/overdue/
  completed/no-deadline); dragging the progress slider commits on release and
  persists (reverts on error); creating/editing/deleting works and a changed
  deadline reorders the stack; an objective never appears on the calendar; a
  reminder set on an objective shows in the bell and the calendar reminder layer.
- **Gates**: `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test`, `pnpm build`
  green.

## Verification Checklist

- [ ] Migration adds `objective_start_at` + `objective_end_at` + `progress` (+ the deadline index); existing rows unaffected.
- [ ] `/objectives` lists live `objetivo` items as progress bars ordered by deadline (no-deadline last).
- [ ] Days remaining + status (active/overdue/completed/no-deadline) render correctly.
- [ ] Inline progress commits on release, clamps 0–100, persists, reverts on error.
- [ ] Create/edit/delete reuse `/api/planning-items`; a changed deadline reorders the stack.
- [ ] `objectiveEndAt >= objectiveStartAt` enforced; objectives never hit the calendar or the no-overlap rule.
- [ ] An objective reminder (`remindAt`) shows in the bell and the calendar reminder layer.
- [ ] `GET /api/objectives` returns only owned, live `objetivo` items with category; 401 unauth; no non-objective items.
- [ ] Sidebar "Objectives" entry routes to `/objectives`.
- [ ] Pure-helper + layered backend tests green; build/lint/tsc clean.

## Notes

- **Dedicated columns = zero coupling**: because objectives use
  `objectiveStartAt`/`objectiveEndAt` (not `startAt`), the calendar and
  no-overlap logic ignore them with no type checks anywhere.
- **Reuse over reinvention**: sections = categories; writes = existing
  `/api/planning-items`; reminders = existing `remindAt`; only a read endpoint +
  three columns + pure helpers + the view are new.
- **Recurring reminders** ("every N days") are deferred to the habits/recurrence
  spec; this version supports a single `remindAt` per objective.
- **Workflow**: commit to `main`, conventional commits, no AI attribution, keep
  the suite green (current repo convention) unless told otherwise.
