# Design Document

## Overview

This spec adds a scheduling model to `PlanningItem` (`startAt`, `endAt`,
`allDay`) alongside the existing `dueAt` deadline, exposes it in the task
editor, and adds a category-scoped range query that later powers the calendar.
It follows the existing vertical-slice architecture (validator → repository →
service → route) and the soft-delete / ownership conventions already in place.

No new runtime dependencies are introduced here. Zustand and the calendar UI
belong to later specs (dashboard / calendar); this spec keeps the task editor on
its current React Hook Form + local state approach.

### Key decisions

- **Scheduling is optional and separate from `dueAt`.** A task may have no
  schedule, only a `dueAt`, or a full `startAt`/`endAt`. `dueAt` semantics are
  untouched.
- **UTC storage, browser-timezone rendering.** Prisma stores `DateTime` in UTC.
  Rendering/parsing in the user's timezone happens in the client (editor and,
  later, the calendar). No per-user timezone field yet.
- **Authoritative validation lives in the service for updates.** Cross-field
  rules (`endAt >= startAt`, `endAt` requires `startAt`) cannot be fully checked
  by a partial PATCH schema, because `startAt` may live on the existing record
  and not in the payload. The service computes the *effective* schedule (current
  row merged with the patch) and validates that. The create schema also checks
  the intra-payload case for a fast 400.
- **Calendar visibility = has `startAt`.** The range query returns only
  scheduled items (`startAt` set). `dueAt`-only tasks are deadlines, not
  calendar events (revisitable in the calendar spec).

## Architecture

```
Task editor (client, RHF)                 Calendar/dashboard (later specs)
   │ PATCH /api/planning-items/[id]           │ GET /api/categories/[id]/calendar?from=&to=
   ▼                                          ▼
planning-item route ──► planning-item.service ──► planning-item.repository ──► Prisma
                              │  validateSchedule (effective start/end)
                              │  ownership prechecks (findOwnedList / findOwnedCategory)
category calendar route ──────┘
```

The new range query is a read in the planning-item vertical, exposed under a
category-scoped route (`/api/categories/[id]/calendar`) because it is always
scoped to one category and reads naturally as "this category's calendar data".
It delegates to a planning-item service function; category ownership is verified
via the existing `findOwnedCategory` helper.

## Components and Interfaces

### Data layer (Prisma schema)

Add to `PlanningItem`:

```prisma
startAt DateTime? @map("start_at")
endAt   DateTime? @map("end_at")
allDay  Boolean   @default(false) @map("all_day")
```

Add an index to support range scans:

```prisma
@@index([startAt])
```

### Migration (hand-written SQL)

New migration `<timestamp>_planning_items_scheduling`:

```sql
ALTER TABLE "planning_items"
  ADD COLUMN "start_at" TIMESTAMP(3),
  ADD COLUMN "end_at"   TIMESTAMP(3),
  ADD COLUMN "all_day"  BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "planning_items_start_at_idx" ON "planning_items" ("start_at");
```

Existing rows get `start_at`/`end_at` NULL and `all_day` false — no schedule
(Requirement 5.1). Non-destructive, additive migration.

### Validators (`planning-item.schema.ts`)

- `createPlanningItemSchema`: add
  - `startAt: z.coerce.date().optional()`
  - `endAt: z.coerce.date().optional()`
  - `allDay: z.boolean().optional()`
  - `.refine(...)`: if `endAt` is present, `startAt` must be present and
    `endAt >= startAt` (intra-payload check → fast 400 on create).
- `updatePlanningItemSchema`: add the same three fields, each additionally
  `.nullable()` so the client can CLEAR them (`startAt: null` clears the
  schedule). No cross-field `.refine` here — partial payloads make it unreliable;
  the service performs the authoritative check.

### Repository (`planning-item.repository.ts`)

- Extend `CreatePlanningItemData` and `UpdatePlanningItemData` with
  `startAt?: Date | null`, `endAt?: Date | null`, `allDay?: boolean` (create uses
  concrete values with null defaults; update keeps the "omit vs null" contract).
- New read: `listScheduledItemsByCategory(categoryId, from, to)` returning
  non-deleted items whose parent list belongs to the category and whose schedule
  overlaps `[from, to)`:

  ```ts
  where: {
    deletedAt: null,
    startAt: { not: null, lt: to },
    // overlap: an item is visible if it starts before `to` and ends at/after
    // `from`; for point items (no endAt) the end is the start.
    OR: [
      { endAt: null, startAt: { gte: from, lt: to } },
      { endAt: { gte: from } },
    ],
    list: { categoryId, deletedAt: null, category: { userId, deletedAt: null } },
  }
  ```

  (Exact overlap predicate finalized in implementation; the intent is
  `startAt < to AND coalesce(endAt, startAt) >= from`.)

### Service (`planning-item.service.ts`)

- `validateSchedule(startAt, endAt)`: pure helper throwing `ValidationError`
  when `endAt` is set without `startAt`, or `endAt < startAt`.
- `createPlanningItemForCurrentUser`: pass `startAt`/`endAt`/`allDay` (defaulting
  null/false) into the repository; call `validateSchedule` on the incoming
  values.
- `updatePlanningItemForCurrentUser`: after loading the owned item, compute the
  *effective* schedule (existing values overlaid with any provided fields, honoring
  explicit `null` as "clear"), then `validateSchedule` before writing. Clearing
  `startAt` also clears `endAt` (a scheduled end with no start is invalid).
- `listScheduledItemsForCategory(categoryId, from, to)`: resolve current user,
  assert category ownership via `findOwnedCategory` (throw `NotFoundError` if not
  owned/absent), then delegate to the repository query.

### Route — category calendar (`/api/categories/[id]/calendar/route.ts`)

- `GET`: parse `from`/`to` from query string (`z.coerce.date()`), validate
  `to > from` (else `ValidationError` → 400), delegate to
  `listScheduledItemsForCategory`. Reuse the shared `mapErrorToResponse` contract
  (400 / 401 / 404 / 500). Ownership failure → 404.

### Editor UI (`task-edit-dialog.tsx`)

- Add a "Schedule" section: an `allDay` checkbox, plus start/end inputs.
  - `allDay` off → two `datetime-local` inputs (start, end).
  - `allDay` on → two `date` inputs.
- Convert between the input's local value and an ISO/UTC string on submit; the
  payload sends `startAt`/`endAt` as ISO strings or `null`, and `allDay` boolean.
- Client-side: show a validation message when end precedes start (mirrors the
  server rule) and block submit; clearing the start clears the schedule.
- `TaskEditPayload` gains `startAt?: string | null`, `endAt?: string | null`,
  `allDay?: boolean`. `TaskList.handleUpdate` forwards them unchanged (it already
  passes the payload straight through).

## Data Models

| Field     | Type        | Notes                                             |
|-----------|-------------|---------------------------------------------------|
| `startAt` | `DateTime?` | UTC; presence means "scheduled"                   |
| `endAt`   | `DateTime?` | UTC; only valid with `startAt`; `>= startAt`      |
| `allDay`  | `Boolean`   | default `false`; time-of-day not significant      |
| `dueAt`   | `DateTime?` | unchanged existing deadline                       |

## Error Handling

Reuses the existing domain-error → HTTP-status mapping:
- Missing/invalid schedule on create (`endAt` without `startAt`, `endAt <
  startAt`) → Zod/`ValidationError` → **400**.
- Inconsistent effective schedule on update → `ValidationError` from the service
  → **400**.
- Calendar query with missing/invalid range (`to <= from`, unparseable) → **400**.
- Category not owned/absent on the calendar query → `NotFoundError` → **404**.
- Unauthenticated → **401**. Unexpected → **500**.

## Correctness Properties

### Property 1: Schedule consistency

No persisted task ever has `endAt` set without `startAt`, and no task has
`endAt < startAt`. Enforced by the create schema `.refine` and the service-level
`validateSchedule` on both create and update (using the effective schedule).

**Validates: Requirements 2.1, 2.2, 2.3**

### Property 2: dueAt independence

Setting, changing, or clearing a task's schedule never alters its `dueAt`, and
vice versa.

**Validates: Requirements 1.3**

### Property 3: Range query soundness

Every item returned by the calendar range query belongs to the requested
(owned) category, is non-deleted, has a non-null `startAt`, and overlaps the
`[from, to)` window.

**Validates: Requirements 4.1, 4.2, 4.4, 4.5**

### Property 4: Backward compatibility

Applying the migration leaves every existing task valid and unscheduled
(`startAt`/`endAt` null, `allDay` false), and existing create/list flows keep
working without schedule fields.

**Validates: Requirements 5.1, 5.2, 5.3**

## Testing Strategy

Reuse the layered Vitest suite and the `getCurrentUserId` mocking pattern
(next-auth v5 is not importable in Vitest).

- **Validator tests**: create rejects `endAt` without `startAt` and `endAt <
  startAt`; accepts point (`startAt` only) and all-day; update accepts explicit
  `null` to clear.
- **Service tests**: `validateSchedule` edge cases; update computes the effective
  schedule (e.g. adding `endAt` to a task that already has `startAt`, and
  rejecting an `endAt` that precedes the stored `startAt`); clearing `startAt`
  clears `endAt`; `listScheduledItemsForCategory` throws `NotFoundError` for a
  non-owned category.
- **Repository tests** (real DB): range query returns only scheduled, in-range,
  same-category items; excludes unscheduled and soft-deleted; respects the
  category → list → task join. Include an overlap case (multi-day event spanning
  the window boundary).
- **Route tests**: `GET /api/categories/[id]/calendar` → 400 for missing/invalid
  range, 404 for a non-owned category, 200 with the expected items. `PATCH
  /api/planning-items/[id]` → 400 for an inconsistent schedule, 200 for a valid
  one.
- **Migration**: apply via `pnpm db:migrate`, regenerate client, re-seed; confirm
  existing/seeded data is unscheduled and valid.
- **Frontend**: manual smoke test of the editor schedule controls (set start/end,
  all-day, clear). Automated React component tests remain out of scope (no UI
  test framework yet).

## Verification Checklist

- `pnpm build`, `pnpm test`, `pnpm lint`, and `pnpm exec tsc --noEmit` all green.
- Migration applies cleanly and the seed still runs.
