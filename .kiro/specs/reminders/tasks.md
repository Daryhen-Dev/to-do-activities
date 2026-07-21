# Implementation Plan

## Overview

Add in-app reminders to the planning-item vertical. Work splits into a
**schema/backend** track (two nullable columns + a due query + an acknowledge
action, wired through validator/service/route with re-arm semantics), a
**pure-logic** track (new-due detection + relative-time formatting, unit-tested),
and a **UI** track (edit-dialog reminder field, reminder store, the notification
bell, and mounting it in the top bar). The bell converges the store + pure
helpers; the layout edit mounts it. Backward-compatible: nullable columns, an
additive read/ack surface, one new client component.

## Task Dependency Graph

```mermaid
flowchart TD
  T1[1. Schema + migration] --> T2[2. Repo: due query + markSeen + remindAt fields]
  T2 --> T3[3. Validators: remindAt in create/update]
  T3 --> T4[4. Service: create/update remindAt + re-arm]
  T2 --> T5[5. Service: list due + acknowledge]
  T5 --> T6[6. Route GET /api/reminders]
  T5 --> T7[7. Route POST /api/reminders/[id]/seen]
  T8[8. Pure helpers reminders.ts] --> T9[9. Pure-helper unit tests]
  T4 --> T10[10. Backend layered tests]
  T5 --> T10
  T3 --> T10
  T8 --> T11[11. Reminder store]
  T6 --> T11
  T7 --> T11
  T11 --> T12[12. ReminderBell component]
  T8 --> T12
  T4 --> T13[13. Edit-dialog remindAt field]
  T12 --> T14[14. Mount bell in (app) top bar]
  T10 --> T15[15. Verification pass]
  T9 --> T15
  T12 --> T15
  T13 --> T15
  T14 --> T15
```

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1", "8"] },
    { "wave": 2, "tasks": ["2", "9"] },
    { "wave": 3, "tasks": ["3", "5"] },
    { "wave": 4, "tasks": ["4", "6", "7"] },
    { "wave": 5, "tasks": ["10", "11", "13"] },
    { "wave": 6, "tasks": ["12"] },
    { "wave": 7, "tasks": ["14"] },
    { "wave": 8, "tasks": ["15"] }
  ]
}
```

## Tasks

### Phase 1 — Schema and pure foundations

- [x] 1. Add reminder columns + migration
  - In `src/prisma/schema.prisma`, add to `PlanningItem`: `remindAt DateTime? @map("remind_at")` and `reminderSeenAt DateTime? @map("reminder_seen_at")`, plus `@@index([userId, remindAt])`. Run `pnpm db:migrate` to create the migration (name e.g. `add_planning_item_reminders`) and regenerate the client. Both columns are nullable with no default (backward-compatible with existing rows).
  - _Requirements: 1.2, 5.3_

- [x] 8. Add the pure reminder helpers
  - Create `src/lib/reminders.ts` with `selectNewlyDueIds(knownIds: ReadonlySet<string>, due: readonly Pick<PlanningItem, "id">[]): string[]` (ids in `due` not in `knownIds`) and `formatReminderTime(remindAt: Date, now: Date): string` (relative label — "just now", "N min ago", "in N min", absolute date for far times). Both pure and deterministic; `now` is injected, never read from the clock inside.
  - _Requirements: 2.3, 2.4, 3.1_

### Phase 2 — Repository and pure tests

- [x] 2. Extend the repository (due query, acknowledge, remindAt fields)
  - In `src/repositories/planning-item.repository.ts`: add `remindAt?: Date | null` to `CreatePlanningItemData` and `UpdatePlanningItemData`, plus an internal-only `reminderSeenAt?: Date | null` on `UpdatePlanningItemData` (set only by the service — never from the client schema). Add `listDueReminders(userId: string, now: Date): Promise<PlanningItem[]>` with the due predicate (`deletedAt: null`, `archived: false`, `remindAt: { not: null, lte: now }`, `reminderSeenAt: null`, scoped to `userId`), `orderBy: { remindAt: "asc" }`. Add `markReminderSeen(id: string, seenAt: Date): Promise<PlanningItem>` (updates `reminderSeenAt`).
  - _Requirements: 2.6, 4.1, 4.2, 5.1, 5.2, 5.4_

- [x] 9. Unit-test the pure helpers
  - Create `src/lib/reminders.test.ts`: `selectNewlyDueIds` (empty known → all; a known id is excluded; result stable across calls; duplicates handled); `formatReminderTime` (past/near/future labels with an injected `now`; deterministic for the same inputs).
  - _Requirements: 2.3, 2.4, 3.1_

### Phase 3 — Validators and read/ack service

- [x] 3. Add `remindAt` to the validators
  - In `src/validators/planning-item.schema.ts`: add `remindAt: z.coerce.date().optional()` to `createPlanningItemSchema` and `remindAt: z.coerce.date().nullable().optional()` to `updatePlanningItemSchema` (nullable = clearable, following the `dueAt` precedent). Do NOT add `reminderSeenAt` to either schema (Req 4.5).
  - _Requirements: 1.1, 1.3, 4.5_

- [x] 5. Add the read + acknowledge service functions
  - In `src/services/planning-item.service.ts`: add `listDueRemindersForCurrentUser(): Promise<PlanningItem[]>` (resolve `getCurrentUserId()`, delegate to `listDueReminders(userId, new Date())`) and `acknowledgeReminderForCurrentUser(id: string): Promise<PlanningItem>` (resolve user, `getOwnedPlanningItemOrThrow(userId, id)` for the ownership precheck → NotFound/404, then `markReminderSeen(id, new Date())`).
  - _Requirements: 3.3, 4.1, 4.2, 4.3, 4.4_

### Phase 4 — Create/update service + routes

- [x] 4. Wire `remindAt` + re-arm into create/update service
  - In `src/services/planning-item.service.ts`: in `createPlanningItemForCurrentUser` pass `remindAt: input.remindAt ?? null` (and `reminderSeenAt: null`) to the repository. In `updatePlanningItemForCurrentUser`, when `input.remindAt !== undefined` forward `remindAt` AND set `reminderSeenAt: null` (re-arm on a new time, clear on `null`). Ensure `remindAt` does NOT enter `validateSchedule` or `assertNoTimedOverlap` (Req 5.3). Only set the internal `reminderSeenAt` from here.
  - _Requirements: 1.4, 5.3_

- [x] 6. Add `GET /api/reminders`
  - Create `src/app/api/reminders/route.ts`: thin `GET` calling `listDueRemindersForCurrentUser`, returning the array with 200. Reuse the shared `mapErrorToResponse` contract (UnauthorizedError → 401, else 500). No Prisma, no business logic.
  - _Requirements: 4.1, 4.4_

- [x] 7. Add `POST /api/reminders/[id]/seen`
  - Create `src/app/api/reminders/[id]/seen/route.ts`: thin `POST` resolving `[id]` from route params, calling `acknowledgeReminderForCurrentUser(id)`, returning the updated item with 200. `NotFoundError` → 404 (no existence leak), `UnauthorizedError` → 401, else 500, via `mapErrorToResponse`.
  - _Requirements: 3.3, 4.2, 4.3, 4.4_

### Phase 5 — Backend tests, store, edit dialog

- [x] 10. Backend layered tests
  - Repository (`planning-item.repository.test.ts`): `listDueReminders` (user scope; excludes future `remindAt`, `reminderSeenAt` set, `deletedAt` set, `archived`, other users; ordered by `remindAt asc`); `markReminderSeen` (stamps `reminderSeenAt`). Service (`planning-item.service.test.ts`): `listDueRemindersForCurrentUser` (delegates with resolved user); `acknowledgeReminderForCurrentUser` (owned OK, foreign/absent → NotFound); `updatePlanningItemForCurrentUser` re-arm (new `remindAt` resets `reminderSeenAt`; clearing clears it; `remindAt` skips schedule/overlap); `createPlanningItemForCurrentUser` forwards `remindAt`. Validator (`planning-item.schema.test.ts`): create/update accept `remindAt` (update accepts `null`); `reminderSeenAt` not accepted. Routes: create `src/app/api/reminders/route.test.ts` and `src/app/api/reminders/[id]/seen/route.test.ts` (200 owned/list, 404 foreign, 401 unauth). Use the stable seed with idempotent cleanup for DB-hitting tests.
  - _Requirements: 2.6, 3.3, 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.4_

- [x] 11. Add the reminder store
  - Create `src/stores/reminder-store.ts` (`useReminderStore`) mirroring `useItemTypeStore`: `dueReminders: PlanningItem[]`, `status`, `ensureLoaded()`, `reload()` (GET `/api/reminders`), and `acknowledge(id): Promise<boolean>` (snapshot → optimistic remove → POST `/api/reminders/[id]/seen` → restore snapshot + return false on `!res.ok`, else true).
  - _Requirements: 2.5, 3.2, 3.3, 3.4_

- [x] 13. Add the reminder field to the edit dialog
  - In `src/components/tasks/task-edit-dialog.tsx`, add a "Reminder" `datetime-local` input to the Schedule section bound to `remindAt` (empty → `null` to clear). Extend `editTaskSchema` with `remindAt: z.coerce.date().nullable().optional()` and include `remindAt` in the submit payload / `TaskEditPayload` so it flows through `PATCH /api/planning-items/[id]`. Mirror the existing `dueAt` control's wiring.
  - _Requirements: 1.1, 1.2, 1.3, 1.5_

### Phase 6 — Notification bell

- [x] 12. Build the ReminderBell component
  - Create `src/components/reminders/reminder-bell.tsx` (client): a `Bell` icon button with a count badge when `dueReminders.length > 0` (empty/zero state otherwise, no error). On mount call `ensureLoaded()`; set up `setInterval(reload, 60_000)` + a `window` `focus` listener → `reload`, both cleaned up on unmount. After each load, `toast()` each id from `selectNewlyDueIds(knownIdsRef.current, dueReminders)` once, then merge into `knownIdsRef` (a `useRef<Set<string>>`). Render a `Popover`/`DropdownMenu` list: each row = title + `formatReminderTime(remindAt, new Date())` + a Dismiss button → `acknowledge(id)`, `toast.error` on false. Empty-state text when none. Accessible trigger (`aria-label` with count) and labeled dismiss buttons.
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5_

### Phase 7 — Mount

- [x] 14. Mount the bell in the (app) top bar
  - In `src/app/(app)/layout.tsx`, add `<ReminderBell/>` to the header (flex row; bell pushed to the end with `ml-auto`). Layout stays a server component rendering the client bell; mounted once so there is a single poll loop app-wide.
  - _Requirements: 2.1, 2.5_

### Phase 8 — Verification

- [x] 15. Full verification pass
  - `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test`, `pnpm build` all green (clear `.next` if a stale route type error appears). Manual smoke test: set a `remindAt` ~1 min out in the edit dialog; the bell count increments and a toast fires once within a minute; open the bell, see the reminder with its relative time, dismiss it → count drops to 0 and it does not return on reload; re-setting `remindAt` after dismiss re-arms it; a future reminder does not surface until its time; `remindAt` changes never move the item on the calendar.
  - _Requirements: 1.2, 1.4, 2.1, 2.3, 2.4, 2.5, 3.3, 3.5, 5.3, 5.4_

## Notes

- **Backward-compatible schema**: two nullable columns + one index; existing rows
  become "no reminder". Migration via `pnpm db:migrate`.
- **Dedicated ack surface**: `reminderSeenAt` is server-stamped via
  `POST /api/reminders/[id]/seen` and never client-writable through the general
  PATCH (keeps the update contract clean).
- **Pure logic isolated**: `selectNewlyDueIds` + `formatReminderTime` are pure and
  unit-tested; the bell is a thin interaction layer. Backend gets layered tests.
- **Orthogonal**: `remindAt` is independent of item type and of
  `startAt`/`endAt`/`dueAt`; the no-overlap rule ignores it.
- **Forward-compatible**: the same columns feed a future server-side scheduler
  (Web Push / email — Options B/C) without rework.
- **Workflow**: commit to `main`, conventional commits, no AI attribution, keep
  the suite green (per current repo convention) unless told otherwise.
- **Numbering** follows the dependency waves (parallelizable within a wave).
