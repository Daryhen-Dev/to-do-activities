# Design Document

## Overview

Add **in-app reminders** to the existing planning-item vertical. Two nullable
columns on `PlanningItem` (`remindAt`, `reminderSeenAt`) carry the reminder time
and its acknowledgement. The existing create/update path is extended to accept
`remindAt` (nullable/clearable, exactly like `dueAt`). A small **reminders**
read/ack surface (`GET /api/reminders`, `POST /api/reminders/[id]/seen`) feeds a
client **notification bell** in the `(app)` top bar that polls while the app is
open, shows an unread count, lists due reminders, and toasts when one first
becomes due. Acknowledgement is a dedicated action so `reminderSeenAt` never
leaks into the general PATCH surface.

Guiding decisions:

- **Reuse the vertical, add a thin read/ack surface.** No new repository file:
  reminder queries live in `planning-item.repository.ts` (the sole Prisma
  boundary for this model). The reminders routes are a thin cohesive grouping
  over the same service.
- **"Due" is computed in SQL, not the client.** The server is the source of
  truth for the current time and the due predicate; the client only renders and
  polls. A pure helper handles the *toast-once* bookkeeping client-side.
- **Hard logic stays pure and unit-tested.** New-due detection (which reminders
  to toast) and relative-time formatting are pure functions in `src/lib/`.
- **Reminders are orthogonal to item type and to scheduling.** `remindAt` is
  independent of `startAt`/`endAt`/`dueAt`; the no-overlap rule ignores it.

### Acknowledgement decision: dedicated endpoint, not general PATCH

- **Chosen** — `POST /api/reminders/[id]/seen` sets `reminderSeenAt = now`
  server-side. The client never sends a timestamp; the server stamps it. Keeps
  `reminderSeenAt` off the client-writable PATCH surface (Req 4.5) and makes the
  intent explicit.
- **Rejected** — adding `reminderSeenAt` to `updatePlanningItemSchema`: would let
  any client set an arbitrary acknowledgement time and muddy the "unset vs omit"
  contract of the general update.

### Re-arm decision: a new `remindAt` clears the prior acknowledgement

When `remindAt` is set to a new value via update, the service resets
`reminderSeenAt` to `null` so the reminder can fire again (Req 1.4). Rationale: a
user who reschedules a reminder they previously dismissed clearly wants to be
reminded at the new time. Clearing `remindAt` (to `null`) also clears
`reminderSeenAt` (an item with no reminder has nothing to acknowledge).

## Architecture

```
Task edit dialog (client)
  └─ Reminder field (datetime-local | clear) → PATCH /api/planning-items/[id] { remindAt }
        → updatePlanningItemForCurrentUser  [service: re-arm reminderSeenAt on remindAt change]
              → updatePlanningItem           [repository: sole Prisma boundary]

(app)/layout.tsx (server, top bar)
  └─ <ReminderBell/> (client, mounted once)
       ├─ useReminderStore.ensureLoaded()            (initial fetch)
       ├─ poll: setInterval(reload, 60s) + window "focus" → reload
       ├─ GET /api/reminders → dueReminders           [service → repository]
       ├─ selectNewlyDueIds(knownIds, due) → toast per new id (once/session)
       ├─ badge count = dueReminders.length
       ├─ <Popover> list: title + formatReminderTime(remindAt) + Dismiss
       └─ dismiss → optimistic remove + POST /api/reminders/[id]/seen + revert/toast

GET  /api/reminders/route.ts (thin)
  → listDueRemindersForCurrentUser()                 [service]
       → listDueReminders(userId, now)               [repository]
POST /api/reminders/[id]/seen/route.ts (thin)
  → acknowledgeReminderForCurrentUser(id)            [service: ownership precheck]
       → markReminderSeen(id, now)                   [repository]
```

## Data Models

### Schema change — `PlanningItem` (`src/prisma/schema.prisma`)

Add two nullable columns and one index:

```prisma
model PlanningItem {
  // ...existing fields...
  remindAt       DateTime? @map("remind_at")
  reminderSeenAt DateTime? @map("reminder_seen_at")
  // ...
  @@index([userId, remindAt])   // supports the due-reminders scan per user
}
```

Migration created via `pnpm db:migrate` (Prisma `migrate dev`), name e.g.
`add_planning_item_reminders`. Both columns are nullable with no default, so the
migration is backward-compatible with existing rows (all become "no reminder").

### Due predicate (authoritative, in the repository query)

An item is a **due reminder** for `userId` at instant `now` when:

```
userId = :userId
AND deletedAt IS NULL
AND archived = false
AND remindAt IS NOT NULL
AND remindAt <= :now
AND reminderSeenAt IS NULL
```

Ordered by `remindAt ASC` (soonest first). Note: completion status is
intentionally NOT part of the predicate (keeps reminders decoupled from the
Status catalog); dismissing a handled reminder is one click. This is a noted,
deliberate scope choice.

## Components and Interfaces

### Pure helpers — `src/lib/reminders.ts` (new) — unit-tested

```ts
import type { PlanningItem } from "@prisma/client";

/**
 * Ids present in `due` that are NOT in `knownIds` — i.e. reminders that became
 * due since the last poll and should be toasted exactly once. Pure: no side
 * effects, deterministic for the same inputs.
 */
export function selectNewlyDueIds(
  knownIds: ReadonlySet<string>,
  due: readonly Pick<PlanningItem, "id">[],
): string[];

/**
 * Human-friendly label for a reminder time relative to `now` (e.g. "just now",
 * "5 min ago", "in 10 min", or an absolute date for far times). Pure — `now` is
 * injected, never read from the clock inside.
 */
export function formatReminderTime(remindAt: Date, now: Date): string;
```

`selectNewlyDueIds` drives the toast-once behavior (Req 2.4): the bell keeps the
set of already-seen due ids for the session; each poll toasts only the freshly
appeared ones and then folds them into the known set.

### State — `src/stores/reminder-store.ts` (new)

Mirrors the `useItemTypeStore`/`useWorkspaceStore` pattern (plain state + guarded
loader) plus the due list and an optimistic acknowledge.

```ts
type ReminderStatus = "idle" | "loading" | "ready" | "error";

interface ReminderState {
  dueReminders: PlanningItem[];
  status: ReminderStatus;
  /** Fetch once; no-op while loading/ready. */
  ensureLoaded: () => Promise<void>;
  /** Force a refetch (used by the poll + focus handler). */
  reload: () => Promise<void>;
  /**
   * Optimistically remove the reminder, POST the acknowledgement, and restore
   * it on failure. Returns whether it succeeded (so the caller can toast).
   */
  acknowledge: (id: string) => Promise<boolean>;
}
```

`fetchDueReminders()` GETs `/api/reminders`; throws on non-OK. `reload` sets
`dueReminders`. `acknowledge` snapshots the list, removes the id, POSTs
`/api/reminders/[id]/seen`, and on `!res.ok` restores the snapshot.

### Presentational + container — `src/components/reminders/reminder-bell.tsx` (new, client)

- Renders a bell icon button (`lucide-react` `Bell`) with a count badge when
  `dueReminders.length > 0` (Req 2.1, 2.2). Uses a `Popover`/`DropdownMenu` from
  `src/components/ui` for the list.
- On mount: `ensureLoaded()`. Sets up `setInterval(reload, 60_000)` and a
  `window` `focus` listener calling `reload`; both cleaned up on unmount
  (Req 2.5).
- After each successful load, computes `selectNewlyDueIds(knownIdsRef, due)` and
  `toast()`s each new one (title + "reminder"), then merges those ids into
  `knownIdsRef` so they are not re-toasted (Req 2.3, 2.4). `knownIdsRef` is a
  `useRef<Set<string>>` so it survives re-renders without causing them.
- List rows: title + `formatReminderTime(remindAt, new Date())` + a Dismiss
  button calling `acknowledge(id)`; on `false` shows `toast.error` (Req 3.1–3.4).
- Empty state text when `dueReminders.length === 0` (Req 3.5).
- Accessible: the trigger is a `button` with an `aria-label` reflecting the
  count; each dismiss is a labeled `button`.

### Top-bar mount — `src/app/(app)/layout.tsx` (edited)

The header currently holds only `<SidebarTrigger/>`. Add `<ReminderBell/>` to the
right side of the header (e.g. wrap the trigger and bell in a flex row with the
bell pushed to the end via `ml-auto`). The layout stays a server component;
`<ReminderBell/>` is a client component it renders (allowed). Mounted once, so
there is a single poll loop app-wide.

### Edit dialog — `src/components/tasks/task-edit-dialog.tsx` (edited)

Add a **Reminder** field to the existing Schedule section: a `datetime-local`
input bound to `remindAt` plus a way to clear it (empty input → `null`). Extend
the dialog's `editTaskSchema` with `remindAt: z.coerce.date().nullable().optional()`
and include `remindAt` in the `TaskEditPayload`/submit body so it flows through
`PATCH /api/planning-items/[id]`. Pattern mirrors the existing `dueAt` control.

## Backend

### Validators — `src/validators/planning-item.schema.ts` (edited)

- `createPlanningItemSchema`: add `remindAt: z.coerce.date().optional()`.
- `updatePlanningItemSchema`: add `remindAt: z.coerce.date().nullable().optional()`
  (nullable → clearable, following the `dueAt` precedent). Do **not** add
  `reminderSeenAt` (Req 4.5).

### Repository — `src/repositories/planning-item.repository.ts` (edited)

- Extend `CreatePlanningItemData` and `UpdatePlanningItemData` with
  `remindAt?: Date | null` (and internally allow writing `reminderSeenAt` via a
  dedicated field so the service can re-arm/clear it — see below). Keep
  `reminderSeenAt` OUT of the public update surface used by the general PATCH;
  expose it only through the dedicated functions.
- `listDueReminders(userId: string, now: Date): Promise<PlanningItem[]>` — the
  due predicate above, `orderBy: { remindAt: "asc" }`.
- `markReminderSeen(id: string, seenAt: Date): Promise<PlanningItem>` — sets
  `reminderSeenAt`; the service prechecks ownership first.

To let the service re-arm on `remindAt` change without widening the public PATCH
contract, `UpdatePlanningItemData` includes an internal-only
`reminderSeenAt?: Date | null` that only the service sets (never populated from
the client schema). The route/validator never forward it.

### Service — `src/services/planning-item.service.ts` (edited)

- `createPlanningItemForCurrentUser`: pass `remindAt: input.remindAt ?? null`
  (and `reminderSeenAt: null`) to the repository.
- `updatePlanningItemForCurrentUser`: when `input.remindAt !== undefined`,
  forward `remindAt`, and set `reminderSeenAt: null` whenever `remindAt` changes
  to a non-null value OR is cleared (re-arm / clear per the decision above).
  `remindAt` does NOT participate in `validateSchedule` or `assertNoTimedOverlap`
  (Req 5.3).
- `listDueRemindersForCurrentUser(): Promise<PlanningItem[]>` — resolves the user
  via `getCurrentUserId()` and delegates with `now = new Date()`.
- `acknowledgeReminderForCurrentUser(id): Promise<PlanningItem>` — resolves the
  user, `getOwnedPlanningItemOrThrow(userId, id)` (reuse existing precheck →
  `NotFoundError`/404, no existence leak), then `markReminderSeen(id, new Date())`.

### Routes

- `src/app/api/reminders/route.ts` (new): `GET` → `listDueRemindersForCurrentUser`
  → 200 array. Reuse the shared `mapErrorToResponse` contract (Unauthorized → 401,
  else 500). Thin.
- `src/app/api/reminders/[id]/seen/route.ts` (new): `POST` →
  `acknowledgeReminderForCurrentUser(id)` → 200 with the updated item.
  `NotFoundError` → 404, `UnauthorizedError` → 401. Thin. (`[id]` resolved from
  the route params, consistent with `planning-items/[id]`.)

## Error Handling

- **Unauthenticated** → `getCurrentUserId()` throws `UnauthorizedError` → `401`
  on both reminder endpoints (Req 4.4).
- **Acknowledge unknown/not-owned id** → `NotFoundError` → `404`, existence never
  leaked (Req 4.3).
- **Bell load failure** → the store enters `error` and the bell shows no count /
  a quiet empty state; a `toast.error` is optional and non-blocking (never
  crashes the shell) (Req 2.2).
- **Dismiss failure** → optimistic remove is reverted from the snapshot and a
  `toast.error` is shown (Req 3.4).
- **Invalid `remindAt` in a payload** → Zod coercion fails → `400` via the
  existing `mapErrorToResponse` on the planning-items route.

## Correctness Properties

### Property 1: New-due detection is exact and idempotent

`selectNewlyDueIds(knownIds, due)` returns exactly the ids in `due` not present
in `knownIds`; ids already in `knownIds` are never returned, so a still-due
reminder is toasted at most once per session (Req 2.4).

**Validates: Requirements 2.3, 2.4**

### Property 2: Relative-time formatting is pure and time-injected

`formatReminderTime(remindAt, now)` depends only on its two arguments (no clock
read inside), so the same pair always yields the same label.

**Validates: Requirements 3.1**

### Property 3: Due query is user-scoped and respects lifecycle

`listDueReminders(userId, now)` returns only items of `userId` that are live
(`deletedAt IS NULL`, `archived = false`), have `remindAt <= now`, and
`reminderSeenAt IS NULL`; future reminders, dismissed reminders, deleted and
archived items, and other users' items are all excluded, ordered by `remindAt`
ascending.

**Validates: Requirements 2.6, 4.1, 5.1, 5.2, 5.4**

### Property 4: Acknowledgement is owned and server-stamped

`acknowledgeReminderForCurrentUser(id)` acknowledges only an item owned by the
caller (else `NotFoundError`), and sets `reminderSeenAt` to a server-side
timestamp; it is unreachable via the general PATCH schema.

**Validates: Requirements 3.3, 3.6, 4.2, 4.3, 4.5**

### Property 5: Re-arming clears the prior acknowledgement

Updating an item's `remindAt` to a new value resets `reminderSeenAt` to `null`,
so a previously dismissed reminder becomes eligible to fire again; clearing
`remindAt` also clears `reminderSeenAt`.

**Validates: Requirements 1.4**

### Property 6: Reminder is independent of schedule

Setting or clearing `remindAt` never changes `startAt`/`endAt`/`dueAt` and never
triggers `validateSchedule` or `assertNoTimedOverlap`.

**Validates: Requirements 5.3**

## Testing Strategy

- **Pure helpers (primary coverage)** — `src/lib/reminders.test.ts`:
  `selectNewlyDueIds` (empty known → all ids; known id excluded; stable across
  calls); `formatReminderTime` (past/near/future labels with injected `now`;
  deterministic).
- **Backend (layered)**:
  - Repository — `listDueReminders` (user scope; excludes future `remindAt`,
    `reminderSeenAt` set, deleted, archived, other users; order by `remindAt`);
    `markReminderSeen` (stamps `reminderSeenAt`). Against the test DB with the
    stable seed and idempotent cleanup.
  - Service — `listDueRemindersForCurrentUser` (delegates with the resolved
    user + `now`); `acknowledgeReminderForCurrentUser` (ownership → NotFound on
    foreign/absent id; stamps via repo); `updatePlanningItemForCurrentUser`
    re-arm (new `remindAt` resets `reminderSeenAt`; clearing `remindAt` clears
    it; `remindAt` skips schedule/overlap checks); `createPlanningItemForCurrentUser`
    forwards `remindAt`.
  - Routes — `GET /api/reminders` (200 with due list, 401 unauth);
    `POST /api/reminders/[id]/seen` (200 owned, 404 foreign/absent, 401 unauth).
  - Validator — `create`/`update` schema accept `remindAt` (update accepts
    `null`); `update` schema rejects/ignores `reminderSeenAt`.
- **Interaction (manual smoke test)**: set a `remindAt` a minute out in the edit
  dialog; within a minute the bell count increments and a toast appears once;
  open the bell, see the reminder with its time, dismiss it → count drops to 0
  and it does not return on reload; clearing `remindAt` removes it; a future
  reminder does not surface until its time.
- **Gates**: `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test`, `pnpm build`
  all green.

## Verification Checklist

- [ ] Migration adds `remind_at` + `reminder_seen_at` (+ `userId, remindAt`
      index); existing rows unaffected.
- [ ] Edit dialog sets and clears `remindAt`; value round-trips through PATCH.
- [ ] `GET /api/reminders` returns only the user's live, due, un-acknowledged
      reminders ordered by `remindAt`; 401 unauth.
- [ ] `POST /api/reminders/[id]/seen` stamps `reminderSeenAt`; 404 on
      foreign/absent id; 401 unauth; not reachable via general PATCH.
- [ ] Bell shows the count, lists reminders, toasts each new one once, polls +
      refreshes on focus, and dismiss removes optimistically (reverts on error).
- [ ] Re-setting `remindAt` after dismiss re-arms the reminder.
- [ ] `remindAt` never affects schedule or the no-overlap rule.
- [ ] Pure-helper + layered backend tests green; build/lint/tsc clean.

## Notes

- **Additive & backward-compatible**: two nullable columns, a new read/ack
  surface, and one client component; no existing behavior changes.
- **Forward-compatible with Options B/C**: the same `remindAt`/`reminderSeenAt`
  model is what a future server-side scheduler (Web Push / email) will read; this
  step builds the data + UX foundation without rework.
- **Workflow**: follow the repo's current convention (commit to `main`,
  conventional commits, no AI attribution, keep the suite green) unless the user
  says otherwise.
