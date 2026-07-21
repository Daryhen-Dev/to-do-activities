# Design Document

## Overview

Surface the already-modeled item type in the UI: choose it on create, change it
on edit, and show it as a color+icon badge in the task list and calendar detail.
The backend already supports `itemTypeId` on `POST`/`PATCH /api/planning-items`
and exposes the catalog via `GET /api/item-types`, so the only backend change is
**seeding a color and icon** for each of the six item types. Everything else is
frontend: a shared catalog store, a reusable badge, and wiring the type into the
create form, the edit `FormSheet`, and the calendar detail sheet.

Guiding decisions:

- **Selection + display only.** Type-driven behavior (reminders, progress,
  recurrence) is out of scope — a later spec.
- **One shared catalog source.** A small `useItemTypeStore` (mirroring
  `useWorkspaceStore`'s `ensureLoaded` pattern) is the single place the task
  list and both calendars read item types from, avoiding duplicate fetches and
  id→type maps.
- **Explicit icon mapping, not dynamic import.** `ItemType.icon` is a string
  (a lucide icon name); a pure lookup maps it to a component with a safe
  fallback, so an unknown/empty icon never breaks rendering.
- **Calendar chips stay category-colored** (from D3); the type appears only in
  the event detail sheet to avoid visual conflict with the category color.

## Architecture

```
Seed (src/prisma/seed.ts)
  └─ ITEM_TYPES gains { color, icon } per type (idempotent upsert by key)

useItemTypeStore (new, src/stores/item-type-store.ts)
  └─ ensureLoaded() → GET /api/item-types → itemTypes: ItemType[]
       consumed by: TaskList, CategoryCalendar, CombinedCalendar

ItemTypeBadge (new, src/components/tasks/item-type-badge.tsx)
  └─ (itemType) → colored icon + name; iconForItemType(name) [pure] with fallback

Create flow:
  TaskList → CreateTaskForm (adds a type <Select>, default = isDefault)
    → onCreate(title, itemTypeId) → POST /api/planning-items { title, listId, itemTypeId }

Edit flow:
  TaskItem → TaskEditDialog (adds a type <Select>, prefilled)
    → TaskEditPayload gains itemTypeId → PATCH /api/planning-items/[id] { itemTypeId, ... }

Display:
  TaskItem → <ItemTypeBadge/> in the meta row
  CategoryCalendar / CombinedCalendar → <ItemTypeBadge/> in the <DetailSheet/>
    (CalendarEvent gains optional itemTypeId; resolved via the store)
```

## Components and Interfaces

### Seed — `src/prisma/seed.ts`

Add `color` and `icon` to each of the six `ITEM_TYPES` entries. The upsert is
keyed by `key` and already passes the whole object to both `create` and
`update`, so adding the fields is automatically idempotent (re-running updates
existing rows). Proposed values (icons are lucide names):

| key | color | icon |
|-----|-------|------|
| tarea | `#3B82F6` | `ListChecks` |
| recordatorio | `#F59E0B` | `Bell` |
| evento | `#A855F7` | `CalendarClock` |
| habito | `#22C55E` | `Repeat` |
| objetivo | `#EF4444` | `Target` |
| nota | `#6B7280` | `StickyNote` |

### Catalog store — `src/stores/item-type-store.ts` (new)

```ts
interface ItemTypeState {
  itemTypes: ItemType[];
  status: "idle" | "loading" | "ready" | "error";
  ensureLoaded: () => Promise<void>; // fetch once (no-op while loading/ready)
  reload: () => Promise<void>;
}
```

Mirrors `useWorkspaceStore`: guarded loader, in-memory, `GET /api/item-types`.
Consumers derive an `itemTypeById` map locally with `useMemo`.

### Icon resolution — `src/components/tasks/item-type-badge.tsx` (new)

```ts
/** Maps a stored icon name to a lucide component; falls back to Tag. */
export function iconForItemType(iconName: string | null): LucideIcon;

/** Colored icon + name chip for an item type. */
export function ItemTypeBadge({ itemType }: { itemType: ItemType }): ReactElement;
```

- `iconForItemType` uses an explicit `Record<string, LucideIcon>` for the six
  seeded names (plus any future ones) and returns a `Tag` fallback for
  unknown/empty. Pure and unit-tested.
- `ItemTypeBadge` renders the icon tinted with `itemType.color` (fallback to
  `currentColor` when null) + the name; small, inline, legible (Req 3.3, 3.4).

### Create — `CreateTaskForm` + `TaskList`

- `CreateTaskForm` gains an `itemTypes: ItemType[]` prop and a compact type
  `<Select>` beside the title input. Its schema gains `itemTypeId: string`,
  defaulting to the catalog's `isDefault` type id. `onCreate` becomes
  `onCreate(title, itemTypeId)`.
- `TaskList` calls `useItemTypeStore().ensureLoaded()`, passes `itemTypes` to
  `CreateTaskForm` and `TaskItem`, and updates `handleCreate(title, itemTypeId)`
  to `POST { title, listId, itemTypeId }`. Builds `itemTypeById` for display.

### Edit — `TaskEditDialog`

- Add `itemTypes: ItemType[]` to `TaskEditDialogProps`.
- Add `itemTypeId: z.string()` to `editTaskSchema`, defaulted from `item.itemTypeId`.
- Add a Type `<Select>` field (same shape as the List/Priority selects).
- Add `itemTypeId: string` to `TaskEditPayload`; include it in the submit
  payload. All other payload fields are unchanged, so a type change touches only
  the type (Req 2.3).

### Display in calendar — `CalendarEvent` + containers

- Extend `CalendarEvent` with optional `itemTypeId?: string`. Populate it in
  `toCalendarEvents` and `toCombinedCalendarEvents` from the row's `itemTypeId`.
- `CategoryCalendar` and `CombinedCalendar` call `useItemTypeStore().ensureLoaded()`,
  resolve `peekEvent.itemTypeId` → `ItemType` via the store's map, and render an
  `<ItemTypeBadge/>` inside the `<DetailSheet/>` (Req 3.2). No badge on chips.

### Backend

No schema or route changes. `POST`/`PATCH /api/planning-items` already accept
`itemTypeId` (the validator marks it optional), the service forwards it, and the
repository translates an unknown `itemTypeId` FK violation (P2003) into
`NotFoundError` → 404 (Req 5.1). `GET /api/item-types` already returns the full
rows including `color`/`icon`.

## Data Models

No schema change. `ItemType.color` and `ItemType.icon` (existing nullable
columns) are populated by the seed. The `CalendarEvent` projection gains an
optional `itemTypeId` string. The `TaskEditPayload` gains a required
`itemTypeId` string.

## Error Handling

- **Unknown `itemTypeId`** on create/update → repository P2003 →
  `NotFoundError` → 404; nothing persisted (Req 5.1).
- **Catalog load failure** (`GET /api/item-types`) → the store enters `error`;
  the type selector falls back to showing only the item's current type (edit) or
  disables until loaded (create), and a non-blocking toast informs the user. The
  UI never crashes on a missing catalog.
- **Missing/unknown icon or color** on a type → `ItemTypeBadge` falls back to a
  default icon and `currentColor`, still showing the name (Req 3.4).

## Correctness Properties

### Property 1: Default type on create

When the user does not choose a type, the create submits the catalog's
`isDefault` type id (Tarea); when they choose one, that id is submitted.

**Validates: Requirements 1.2, 1.3**

### Property 2: Icon resolution is total with a fallback

`iconForItemType(name)` returns a defined component for every seeded icon name
and a single fallback component for any unknown or empty/null name (never
undefined).

**Validates: Requirements 3.4**

### Property 3: Type change is isolated

Changing the type in the edit form produces a payload whose `itemTypeId` differs
while title, description, list, priority, `dueAt`, and schedule fields match the
item's existing values.

**Validates: Requirements 2.3**

### Property 4: Seed assigns distinct appearance idempotently

After seeding, each of the six item types has a non-null color and icon, colors
are distinct, and re-running the seed updates rows by `key` without creating
duplicates.

**Validates: Requirements 4.1, 4.2**

### Property 5: Unknown type is rejected

A create or update referencing an `itemTypeId` that does not exist is rejected
(404) and persists nothing.

**Validates: Requirements 5.1**

## Testing Strategy

- **Pure (primary)**: `iconForItemType` — returns a component for each seeded
  name; returns the fallback for unknown/empty/null; never returns undefined.
- **Backend (layered)**: extend the catalog repository/service test to assert
  each seeded item type exposes a non-null color and icon and that colors are
  distinct; the existing planning-item create/update tests already cover the
  unknown-`itemTypeId` → 404 path (confirm/keep). Seed idempotency is exercised
  by the upsert-by-key already used.
- **Interaction (manual smoke)**: create an item with a chosen type → it
  persists and shows the badge; edit changes the type without touching other
  fields; the badge appears in the list and the calendar detail sheet; an
  uncolored/unknown icon still renders the name.
- Gates: `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test`, `pnpm build` green;
  run `pnpm db:seed` so the new colors/icons land in the dev DB.

## Verification Checklist

- [ ] Seed gives all six types a distinct color + icon; re-seeding is idempotent.
- [ ] Create lets the user pick a type (default Tarea) and persists it.
- [ ] Edit changes the type via the FormSheet without altering other fields.
- [ ] Type badge shows in the task list and the calendar detail sheet, consistently.
- [ ] Unknown/empty icon falls back gracefully to a named badge.
- [ ] Unknown `itemTypeId` is rejected (404); ownership unaffected.
- [ ] Pure `iconForItemType` tests + catalog seed tests green; build/lint/tsc clean.
