# Design Document

## Overview

This design turns the flat task app into a hierarchy-first experience:
`Category → List → Task` is enforced end to end, and all navigation lives in a
persistent collapsible sidebar (shadcn `sidebar-07`). Selecting a list drives a
list-scoped task panel.

The change spans three layers, kept consistent with the existing vertical-slice
architecture (validator → repository → service → route) and the soft-delete
convention (`deletedAt`):

1. **Data**: `planning_items.list_id` becomes `NOT NULL`; its FK gains
   `ON DELETE CASCADE`. A hand-written migration removes orphaned rows first.
2. **Backend**: task creation requires an owned `listId`; deleting a list
   soft-deletes its tasks atomically (the DB cascade only fires on hard delete,
   so this is done in the repository via a transaction).
3. **Frontend**: a shared authenticated layout renders `AppSidebar` +
   `SidebarProvider`; a new `/lists/[listId]` route hosts the list-scoped task
   panel; `/categories` and `/categories/[id]` are removed.

### Key constraint: soft-delete vs DB cascade

Lists and tasks are archived via `deletedAt`, not physically deleted. A Postgres
`ON DELETE CASCADE` FK only fires on a **hard** `DELETE`. Therefore the
cascade required by Requirement 2.1 (soft-delete children when a list is
soft-deleted) MUST be implemented in application code inside a transaction. The
`ON DELETE CASCADE` FK (Requirement 2.3) is still added as a correctness
backstop for genuine hard deletes (e.g. a future user/category hard purge).

### Risk: sidebar-07 under Base UI (base-nova)

The project uses shadcn `base-nova` style backed by Base UI
(`@base-ui/react`), not Radix. The `sidebar-07` block was authored for Radix.
`npx shadcn@latest add sidebar-07` may either (a) resolve to the base-nova
variant, or (b) pull Radix-based files that need adaptation. The design treats
the block as a **starting scaffold**: we keep the `sidebar` UI primitive and
`AppSidebar` shell, strip the demo content (team-switcher, nav-user dummy data),
and wire our own category/list data. If the block fails to resolve for
base-nova, we fall back to adding the `sidebar` primitive alone and composing
`AppSidebar` by hand. This is verified during implementation via a build check.

## Architecture

```
Root layout (html/body, Toaster)
└── (authenticated) layout  ← NEW: SidebarProvider + AppSidebar + SidebarInset
    ├── /                    ← empty state: "select or create a list"
    └── /lists/[listId]      ← list-scoped task panel (RSC guards ownership)

AppSidebar (client)
├── Category groups (collapsible)      ← GET /api/categories
│   ├── List items (nested)            ← GET /api/lists?categoryId=…  (or all)
│   └── "add list" control per group   ← POST /api/lists
├── "add category" control             ← POST /api/categories
└── Footer: signed-in user + sign out
```

Data flow for the sidebar is client-side (mirrors the existing
`CategoryList` / `ListManager` fetch pattern) so create/rename/delete update the
tree without a full reload (Requirement 3.7). A lightweight shared state holder
(React context or a single fetch in the layout's client sidebar) keeps
categories+lists in one place.

## Components and Interfaces

### Data layer (Prisma schema)

`PlanningItem` changes:

```prisma
model PlanningItem {
  // ...
  listId String   // was: String?
  // ...
  list   List @relation(fields: [listId], references: [id], onDelete: Cascade) // was: List? … onDelete: SetNull
  // ...
}
```

### Migration (hand-written SQL)

New migration `…_planning_items_require_list`:

```sql
-- 1. Remove orphaned tasks (dev-only data; seed creates none).
DELETE FROM "planning_items" WHERE "listId" IS NULL;

-- 2. Enforce the mandatory hierarchy at the DB level.
ALTER TABLE "planning_items" ALTER COLUMN "listId" SET NOT NULL;

-- 3. Replace the SetNull FK with ON DELETE CASCADE.
ALTER TABLE "planning_items" DROP CONSTRAINT "planning_items_listId_fkey";
ALTER TABLE "planning_items"
  ADD CONSTRAINT "planning_items_listId_fkey"
  FOREIGN KEY ("listId") REFERENCES "lists"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
```

Note: confirmed against the `_init` migration — the `PlanningItem.listId` field
has no `@map`, so the physical column is `"listId"` (camelCase), and Prisma
named the FK `planning_items_listId_fkey`. (Only `dueAt`/`deletedAt` are mapped
to snake_case on this table.)

### Backend — planning-item vertical

- **Validator** (`planning-item.schema.ts`):
  - `createPlanningItemSchema.listId`: `z.string().min(1, "listId is required")`
    (required, no longer `.optional()`).
  - `updatePlanningItemSchema.listId`: `z.string().min(1).optional()` — remains
    changeable but drops `.nullable()` (cannot detach to null; Requirement 5.2).
- **Repository** (`planning-item.repository.ts`):
  - `CreatePlanningItemData.listId`: `string` (was `string | null`).
  - `UpdatePlanningItemData.listId`: `string | undefined` (drop `| null`).
- **Service** (`planning-item.service.ts`):
  - `createPlanningItemForCurrentUser` passes `listId: input.listId` (required).
    Ownership of the list is enforced by the FK (`P2003 → NotFoundError`), and
    optionally pre-checked via `findOwnedList` to return a precise not-found for
    a list owned by another user (Requirement 1.2). Design choice: add an
    explicit `findOwnedList` precheck in the service for a clear 404, consistent
    with the list vertical's ownership pattern.

### Backend — list vertical (cascade on delete)

- **Repository** (`list.repository.ts`): new
  `softDeleteListWithTasks(id: string)` wrapping both writes in
  `prisma.$transaction` (Requirement 2.4 — atomic, no partial delete):

  ```ts
  export async function softDeleteListWithTasks(id: string): Promise<void> {
    const now = new Date();
    await prisma.$transaction([
      prisma.planningItem.updateMany({
        where: { listId: id, deletedAt: null },
        data: { deletedAt: now },
      }),
      prisma.list.update({ where: { id }, data: { deletedAt: now } }),
    ]);
  }
  ```

- **Service** (`list.service.ts`): `deleteListForCurrentUser` calls
  `softDeleteListWithTasks` instead of `softDeleteList` (ownership precheck
  unchanged). `softDeleteList` is removed if it has no other callers.

### Frontend — layout and routing

- **`src/app/(app)/layout.tsx`** (route group, NEW): server component that
  calls `auth()`, renders `SidebarProvider`, `<AppSidebar user=… />`, and
  `<SidebarInset>{children}</SidebarInset>`. Pages `/` and `/lists/[listId]`
  move under this group.
- **`src/app/(app)/page.tsx`**: empty-state prompting list selection/creation
  (Requirement 4.3).
- **`src/app/(app)/lists/[listId]/page.tsx`** (NEW): RSC that resolves the list
  via `getListForCurrentUser(listId)` (404 → `notFound()`), then renders the
  list-scoped task panel.

### Frontend — components

- **`AppSidebar`** (`src/components/layout/app-sidebar.tsx`, NEW): categories as
  `Collapsible` `SidebarMenu` groups, lists as `SidebarMenuSub` items linking to
  `/lists/[listId]`; "add category" and per-group "add list" reuse the existing
  `CategoryFormDialog` / `ListFormDialog`. Footer shows the user + `SignOutButton`.
- **`TaskList`** (refactor): accept a required `listId` prop; drop the
  category/list **filter** UI (`TaskFilters` list filter) since the view is
  already list-scoped; keep "hide completed". `GET /api/planning-items` result
  is filtered client-side to `listId` (small dataset, matches existing pattern),
  or the create posts with `listId`.
- **`CreateTaskForm`** (refactor): `onCreate` still takes the title; the parent
  `TaskList` injects the `listId` into the POST body.
- **`TaskEditDialog`** (adjust): list selector remains for moving a task between
  lists, but the "none/unassigned" option is removed (Requirement 5.2).
- **Removed**: `src/app/categories/page.tsx`, `src/app/categories/[id]/page.tsx`.
  `ListManager` (the category-detail list CRUD) is superseded by the sidebar; it
  is removed or repurposed into the sidebar group.

## Data Models

No new tables. The only schema delta is on `PlanningItem`:

| Field    | Before          | After                    |
|----------|-----------------|--------------------------|
| `listId` | `String?`       | `String` (NOT NULL)      |
| FK       | `onDelete: SetNull` | `onDelete: Cascade`  |

Category and List models are unchanged. The existing partial unique indexes and
soft-delete columns are preserved.

## Correctness Properties

### Property 1: No orphan tasks

After this change, no active `PlanningItem` has a null or non-owned `listId`.
Enforced by the DB `NOT NULL` + FK, the create validator, and the service
ownership precheck.

**Validates: Requirements 1.1, 1.2, 1.3, 1.4**

### Property 2: Cascade completeness

After deleting a list, no active task references that list. Enforced by
`softDeleteListWithTasks` (soft path) and `ON DELETE CASCADE` (hard path).

**Validates: Requirements 2.1, 2.2, 2.3**

### Property 3: Delete atomicity

A list delete either soft-deletes the list and all its active tasks, or nothing
(single transaction).

**Validates: Requirements 2.4**

### Property 4: Ownership isolation

A user can never create or view a task under a list they do not own (service
precheck + owned-lookup joins through category).

**Validates: Requirements 1.2, 4.5**

## Error Handling

The existing domain-error → HTTP-status contract is preserved; this change only
adds new trigger points for already-defined errors:

- **Missing `listId` on create** → Zod `ValidationError` → `400` (route
  `mapErrorToResponse`).
- **`listId: null` on update** → Zod validation failure → `400`.
- **Non-owned / absent list on create or task view** → `NotFoundError` → `404`
  (service precheck and/or FK `P2003` translated in the repository).
- **List delete cascade failure** → the `prisma.$transaction` rolls back; the
  route surfaces a `500` and neither the list nor its tasks change
  (Requirement 2.4). No partial state is ever committed.
- **Duplicate list/category name** → existing `ConflictError` → `409`
  (unchanged).
- **Visiting a removed `/categories*` route** → Next.js `notFound()` (404) or a
  redirect into the new experience (Requirement 6.3); never an unhandled error.

## Testing Strategy

Reuse the existing layered Vitest suite and the `current-user` mocking pattern
(next-auth v5 cannot be imported in Vitest — keep mocking `getCurrentUserId`).

- **Validator tests**: create requires `listId` (missing → error); update
  rejects `listId: null`.
- **Repository tests**: `softDeleteListWithTasks` sets `deletedAt` on the list
  and its active tasks; leaves already-deleted tasks untouched; runs in one
  transaction.
- **Service tests**: `createPlanningItemForCurrentUser` throws `NotFoundError`
  for a non-owned/absent list; `deleteListForCurrentUser` cascades.
- **Route tests**: `POST /api/planning-items` → 400 without `listId`, 404 for a
  non-owned list, 201 for a valid owned list; `DELETE /api/lists/[id]` cascade.
- **Migration**: verified by running `prisma migrate dev` against the dev DB and
  re-seeding; smoke-test that task creation without a list is rejected.
- **Frontend**: manual smoke test end to end (create category → create list in
  sidebar → open list → create task → move task between lists → delete list and
  confirm its tasks disappear). Automated React component tests remain a known
  gap (no UI test framework yet) and are out of scope here.

## Verification Checklist

- `pnpm build` passes (catches the Base UI/Radix sidebar typing issues).
- `pnpm test` green (updated + new tests).
- `pnpm lint` clean.
- Runtime smoke test of the full create→navigate→delete flow.
