# Design Document

## Overview

Let a `recordatorio` reminder carry the **same structured recurrence rule** that
habits use (days-of-week + time-of-day + optional "every N days" interval), which
already lives in dedicated nullable `PlanningItem` columns. A reminder WITH a rule
is **recurring**; a reminder WITHOUT one keeps its one-shot `remindAt` behavior,
untouched.

Two reuse decisions keep this small and schema-free:

- **Recurrence machinery is reused, not reinvented.** The pure `generateOccurrences`
  and `ruleFromItem` from `src/lib/habits.ts` compute occurrences; only reminder-
  specific glue (occurrence → instant, current-occurrence, due predicate) is new,
  in `src/lib/reminders.ts`.
- **Acknowledgement is a watermark on the existing `reminderSeenAt`.** For a
  recurring reminder, `reminderSeenAt` means "dismissed up to this instant". Its
  **current occurrence** (the most recent occurrence instant ≤ now) is due when the
  watermark is null or earlier than that instant. Dismissing stamps
  `reminderSeenAt = now` (the existing acknowledge flow, unchanged), which covers
  the current occurrence and re-arms the next. **No new table, no schema change.**

On the calendar, recurring reminders are **expanded into occurrence markers** on
the existing reminder layer (a fourth parallel fetch), mirroring how habits are
expanded — each occurrence is a `kind: "reminder"` point marker, so it inherits
the Reminders toggle and per-category filtering for free.

## Architecture

```
Bell → useReminderStore → GET /api/reminders (existing route)
  → listDueRemindersForCurrentUser()                         [service, EXTENDED]
       ├─ one-shot: listDueReminders(userId, now)            [repo, UNCHANGED] (remindAt ≤ now, not seen, no rule)
       └─ recurring: listRecurringReminders(userId)          [repo, NEW]
            → for each: currentDueOccurrence(rule, seenAt, now)  [lib/reminders, NEW]
            → due ones returned with remindAt = current occurrence instant

Dismiss → POST /api/reminders/[id]/seen (existing) → acknowledgeReminderForCurrentUser  [UNCHANGED]
       → markReminderSeen(id, now)  → sets the watermark; works for both kinds

Write → POST/PATCH /api/planning-items (existing) → create/update service  [EXTENDED]
       → recurrence validation now also runs for a recordatorio WITH a rule

Calendar → <CombinedCalendar/>
  ├─ GET /api/calendar                (scheduled)            [UNCHANGED]
  ├─ GET /api/calendar/reminders      (one-shot reminders)   [UNCHANGED]
  ├─ GET /api/calendar/habits         (habit occurrences)    [UNCHANGED]
  └─ GET /api/calendar/reminder-occurrences (recurring reminders)  [NEW]
       → listReminderOccurrencesForCurrentUserRange(from,to) [service, NEW]
            → listRecurringReminders(userId) + generateOccurrences → ReminderOccurrenceDTO[]
       → toReminderOccurrenceCalendarEvents(dtos) → kind:"reminder" point markers  [lib/calendar, NEW]
```

### Key decisions

**1. One-shot vs recurring split by "has a rule".** A reminder is recurring when
`recurrenceDays` is non-empty OR `recurrenceInterval` is set. The one-shot path
(`remindAt` + `listDueReminders` SQL predicate) is untouched; a recurring reminder
has no `remindAt`, so it never matches the one-shot query — the two paths never
double-count. The service simply concatenates the two due sets.

**2. Watermark reuse of `reminderSeenAt`.** Due ⟺ current occurrence exists AND
(`reminderSeenAt` is null OR `reminderSeenAt < currentOccurrenceInstant`).
Dismiss sets `reminderSeenAt = now`; since the current occurrence instant ≤ now,
the watermark now covers it (not due), and the next occurrence instant > now >
watermark, so it becomes due once it passes. The existing
`acknowledgeReminderForCurrentUser` / `markReminderSeen` already does exactly this
write — no acknowledge change is needed.

**3. Bell display reuses the one-shot shape.** `listDueRemindersForCurrentUser`
returns `PlanningItem[]`; for a recurring due reminder it returns the row with
`remindAt` overwritten (in memory) by its current occurrence instant, so the bell
renders its time with the existing `formatReminderTime` path — no bell UI change.

**4. Calendar expansion mirrors habits, additively.** A new endpoint returns
recurring-reminder occurrence DTOs; the client maps them to `kind: "reminder"`
markers and merges them. The existing `/api/calendar/reminders` (one-shot) is
unchanged (Req 5.4, 6.1), and occurrence markers ride the existing Reminders +
category toggles because they are `kind: "reminder"` and carry a `categoryId`.

## Data Models

No schema changes. Reuses the existing `PlanningItem` recurrence columns
(`recurrenceDays`, `recurrenceTimeMinutes`, `recurrenceInterval`,
`recurrenceAnchor`) and `reminderSeenAt`. One new serializable DTO:

```ts
// src/lib/reminders.ts (NEW type)
/** One expanded recurring-reminder occurrence, for the calendar layer. */
export interface ReminderOccurrenceDTO {
  reminderId: string;
  title: string;
  description: string | null;
  itemTypeId: string;
  date: string;            // "YYYY-MM-DD" (local)
  timeMinutes: number | null;
  categoryId: string;
  categoryName: string;
  categoryColor: string | null;
}
```

## Components and Interfaces

### Pure helpers — `src/lib/reminders.ts` (extended)

```ts
import type { RecurrenceRule } from "./habits";

/** The local instant of an occurrence: its date at `timeMinutes` (or 00:00). */
export function reminderOccurrenceInstant(
  date: Date,
  timeMinutes: number | null,
): Date;

/**
 * The instant of the most recent occurrence at or before `now`, or null when the
 * rule schedules none in a bounded lookback. Pure (bounded window; no clock read).
 */
export function currentReminderOccurrence(
  rule: RecurrenceRule,
  now: Date,
): Date | null;

/**
 * True when a recurring reminder is due: its current occurrence exists and the
 * watermark (`reminderSeenAt`) is null or strictly before that occurrence's
 * instant.
 */
export function isRecurringReminderDue(
  rule: RecurrenceRule,
  reminderSeenAt: Date | null,
  now: Date,
): boolean;

/** True when a reminder row carries a recurrence rule (days or interval). */
export function hasRecurrenceRule(rule: RecurrenceRule): boolean;
```

- `reminderOccurrenceInstant` builds `new Date(y, m, d, hh, mm)` from the
  normalized date + `timeMinutes` (00:00 when null).
- `currentReminderOccurrence` generates occurrences over `[now − LOOKBACK, now+1d)`
  (LOOKBACK bounded, e.g. 400 days — safely covers interval ≤ 365 and any weekday
  rule), maps each to its instant, keeps those ≤ now, and returns the max (or null).
- `isRecurringReminderDue` = `occ !== null && (seenAt == null || seenAt < occ)`.

### Service — `src/services/planning-item.service.ts` (extended + new)

- **`validateRecurrenceRule` gating (extended).** Recurrence validation currently
  runs only for `habito`. Extend it to also run for a `recordatorio` **when a
  recurrence rule is present** (`recurrenceDays` non-empty OR `recurrenceInterval`
  set). A recordatorio with no rule stays one-shot and skips it. Habits are
  unchanged (rule always required). The habit-specific title/description length
  bounds remain habit-only.
- **`listDueRemindersForCurrentUser` (extended).** Resolve the user; get the
  one-shot due set from `listDueReminders(userId, now)` (unchanged) and the
  recurring set from `listRecurringReminders(userId)`. For each recurring reminder,
  build `rule = ruleFromItem(row)`; when `isRecurringReminderDue(rule,
  row.reminderSeenAt, now)`, include it with `remindAt` overwritten by
  `currentReminderOccurrence(rule, now)`. Return the concatenation, soonest-first.
- **`listReminderOccurrencesForCurrentUserRange(from, to)` (new).** Resolve the
  user; `listRecurringReminders(userId)`; for each, `generateOccurrences(rule,
  from, to)` → one `ReminderOccurrenceDTO` per occurrence (`date = dateKey(occ)`,
  `timeMinutes = recurrenceTimeMinutes`, category fields). Mirrors
  `listHabitOccurrencesForCurrentUserRange`.
- **Acknowledge is unchanged** — `acknowledgeReminderForCurrentUser` →
  `markReminderSeen(id, now)` already sets the watermark for both kinds.

### Repository — `src/repositories/planning-item.repository.ts` (new method, sole Prisma boundary)

- **`listRecurringReminders(userId)` (new).** `recordatorio`-key, live
  (`deletedAt: null, archived: false`), with a recurrence rule
  (`OR: [{ recurrenceDays: { isEmpty: false } }, { recurrenceInterval: { not: null } }]`),
  joined to `List → Category`, flattened to `ScheduledItemWithCategory` (so the
  service has category id/name/color for the DTOs). It is the only place these are
  read.
- **`listDueReminders` (unchanged).** One-shot reminders have no rule and a
  `remindAt`, so this SQL predicate keeps returning exactly the one-shot due set.
  (Recurring reminders have `remindAt` null, so they are naturally excluded.)

### Backend route — `src/app/api/calendar/reminder-occurrences/route.ts` (new)

Thin `GET` mirroring `/api/calendar/habits`: reuse the `rangeSchema` + shared
`mapErrorToResponse`; call `listReminderOccurrencesForCurrentUserRange`; 200 with
the DTO array.

`GET /api/reminders` (bell) and `POST /api/reminders/[id]/seen` (dismiss) are
**unchanged** — they already call the service functions above.

### Pure helper — `src/lib/calendar.ts` (new)

```ts
/**
 * Maps recurring-reminder occurrence DTOs to `kind: "reminder"` point markers
 * (anchored at date+timeMinutes, or all-day at 00:00 when null), so they join
 * the reminder layer and inherit its toggle + category filtering. `id` is
 * `"{reminderId}:{date}"`. DTOs with an unparseable date are dropped.
 */
export function toReminderOccurrenceCalendarEvents(
  rows: ReminderOccurrenceDTO[],
): CalendarEvent[];
```

Behaves like `toHabitCalendarEvents` but sets `kind: "reminder"` and no
`completed`. (A recurring-reminder occurrence marker is a reminder marker; it does
not need the habit completed treatment.)

### UI

- **`HabitFormDialog` is NOT reused.** Reminders are created/edited through the
  existing task/reminder flow. Extend the reminder create/edit form
  (`src/components/tasks/*` — the create/edit dialog used for `recordatorio`
  items) to offer an OPTIONAL recurrence rule (a weekday multi-select + time +
  interval), identical in shape to the habit form's controls. When left empty the
  reminder stays one-shot (`remindAt`); when a rule is set, the recurrence fields
  are sent and `remindAt` is omitted.
- **Bell** (`reminder-bell.tsx`): unchanged. A recurring due reminder arrives as a
  normal due row (with its `remindAt` = current occurrence instant), renders and
  dismisses through the existing flow.
- **Combined calendar** (`combined-calendar.tsx`): add a fourth parallel fetch
  (`/api/calendar/reminder-occurrences`), map with
  `toReminderOccurrenceCalendarEvents`, and merge into the events. Visible-event
  filtering already covers `kind: "reminder"` (Reminders toggle) and category.

## Error Handling

- **Invalid recurring-reminder rule** → `validateRecurrenceRule` throws
  `ValidationError` → 400 on the write path, before any write (Req 2.1–2.4). The
  prior rule is retained (effective-rule validation, as for habits).
- **Unauthenticated** → `getCurrentUserId()` throws `UnauthorizedError` → 401 for
  the bell and the new calendar endpoint (Req 3.5).
- **Reminder-occurrences fetch fails** → the combined calendar shows its existing
  non-blocking error toast and renders what loaded (never crashes).
- **Dismiss of a foreign/missing id** → `getOwnedPlanningItemOrThrow` →
  `NotFoundError` → 404, no existence leak (Req 4.3), unchanged.

## Correctness Properties

*A property is a characteristic or behavior that should hold across all valid
executions — a formal, machine-verifiable statement of intent.*

### Property 1: Recurring due predicate matches the watermark rule

For any rule, watermark, and now, `isRecurringReminderDue(rule, seenAt, now)` is
true exactly when a current occurrence exists (an occurrence instant ≤ now) and
`seenAt` is null or strictly earlier than that occurrence instant; otherwise it is
false.

**Validates: Requirements 3.1, 3.2, 3.3**

### Property 2: Dismissing at now clears the current occurrence and re-arms the next

For any rule with a current occurrence at `now`, setting the watermark to `now`
makes `isRecurringReminderDue(rule, now, now)` false, and evaluating at any later
time `t` equal to the next occurrence instant makes it true again.

**Validates: Requirements 4.1, 4.2**

### Property 3: Current occurrence is the latest occurrence at or before now

For any rule, `currentReminderOccurrence(rule, now)` returns an instant ≤ now that
the rule schedules, and no scheduled occurrence instant lies strictly between it
and now; it returns null exactly when the rule schedules no occurrence at or
before now within the lookback.

**Validates: Requirements 3.1, 3.2**

### Property 4: Reminder occurrence expansion matches the schedule in-window

For any recurring reminder and window `[from, to)`,
`listReminderOccurrencesForCurrentUserRange` emits exactly one DTO per occurrence
in `generateOccurrences(rule, from, to)`, each with `date = dateKey(occurrence)`;
soft-deleted, archived, and non-recurring reminders contribute none.

**Validates: Requirements 5.1, 6.4**

### Property 5: One-shot reminders are unaffected

For a reminder with no recurrence rule, the due set, the calendar marker, and the
acknowledge behavior are identical to the pre-feature behavior (the one-shot SQL
predicate and single-`remindAt` marker path).

**Validates: Requirements 6.1, 3.4, 4.4**

## Testing Strategy

- **Pure helpers** — extend `src/lib/reminders.test.ts` with fast-check property
  tests for Properties 1–3 (`isRecurringReminderDue`, `currentReminderOccurrence`,
  the dismiss/re-arm sequence) and unit edge cases (no occurrence before now;
  watermark exactly at the occurrence instant → not due; interval and weekday
  rules). Extend `src/lib/calendar.test.ts` for
  `toReminderOccurrenceCalendarEvents` (kind reminder, point/all-day, id shape,
  drops invalid date).
- **Service** — extend `src/services/planning-item.service.test.ts`
  (repository mocked): `listDueRemindersForCurrentUser` merges one-shot + recurring
  due (recurring row returned with `remindAt` = current occurrence);
  `listReminderOccurrencesForCurrentUserRange` expansion (Property 4, model-based
  vs `generateOccurrences`); recurrence validation now rejects an invalid rule on a
  `recordatorio` and skips validation when no rule is present.
- **Repository** — extend `planning-item.repository.test.ts` (integration):
  `listRecurringReminders` returns only live recordatorio items WITH a rule,
  user-scoped, excludes one-shot/deleted/archived/other users, with category.
- **Route** — `src/app/api/calendar/reminder-occurrences/route.test.ts`: 200 with
  data, 400 bad range, 401 unauthenticated, 500 no-leak.
- **Interaction (manual smoke test)**: create a reminder "every weekday 09:00"; it
  appears in the bell at/after 09:00; dismissing clears it and it returns the next
  weekday; it shows as reminder markers on each weekday in the calendar and rides
  the Reminders toggle; a one-shot reminder still behaves exactly as before.
- **Gates**: `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test`, `pnpm build`
  green.

## Verification Checklist

- [ ] A reminder with a recurrence rule is recurring; without one it stays one-shot.
- [ ] Invalid recurring-reminder rules are rejected (empty rule, bad interval/time/day).
- [ ] The bell surfaces a recurring reminder's current occurrence via the watermark.
- [ ] Dismissing sets `reminderSeenAt = now`, clearing the current occurrence and re-arming the next.
- [ ] Recurring reminders appear as reminder markers on each occurrence in month/week/day/agenda.
- [ ] Occurrence markers ride the Reminders toggle + per-category toggles; are read-only.
- [ ] `GET /api/calendar/reminder-occurrences` returns owned, in-window occurrences; 400 bad range; 401 unauth.
- [ ] One-shot reminders, habits, `/api/calendar`, and `/api/calendar/reminders` are unchanged.
- [ ] No schema changes; pure + service + repo + route tests green; build/lint/tsc clean.

## Notes

- **Watermark, not a table.** The design deliberately keeps only the
  dismissed-up-to instant; a per-occurrence acknowledgement history is out of scope
  (reminders are ephemeral, unlike habit streaks).
- **Reuses habit recurrence** end to end (columns, `generateOccurrences`,
  `ruleFromItem`), so recurring reminders and habits stay single-sourced.
- **Additive**: one new repo read, two new service functions, one extended service
  gate, one new endpoint, one new pure mapper, and a form extension. Nothing
  existing changes behavior for one-shot reminders or habits.
- **Workflow**: commit to `main`, conventional commits, no AI attribution, keep the
  suite green.
