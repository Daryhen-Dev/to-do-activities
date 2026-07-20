# Design Document

## Overview

Turn `/` into a read-only global dashboard, segmented by category. It shows a
summary strip (overdue / due today / upcoming / open, across everything) and a
card per category with that category's numbers.

Two building blocks are introduced:
1. A **Zustand workspace store** holding the shared categories + lists tree. The
   sidebar and the dashboard both read from it, so structural changes made in
   the sidebar are reflected on the dashboard without a reload (Requirement 6).
2. A **pure metrics module** that computes all dashboard numbers from a snapshot
   of tasks + categories + lists + statuses. Keeping the math in pure functions
   makes it unit-testable despite the absence of a React component test harness.

Task data for the counts is fetched by the dashboard itself; the per-category
counts are computed only over tasks whose `listId` belongs to a list currently
in the store, so a list deleted in the sidebar drops out of the counts
immediately (Requirement 6.2).

This is the first use of Zustand in the project (a new dependency). Scope is
deliberately limited to the categories/lists tree — task-level state stays local
to the views that own it (the list view and the dashboard).

## Architecture

```
(app)/layout.tsx (server)
  ├── AppSidebar (client)  ──┐
  └── (app)/page.tsx (server) → <Dashboard /> (client) ──┐
                                                          ▼
                              useWorkspaceStore (Zustand): categories, lists
                                 ▲ ensureLoaded() fetches once (GET /api/categories, /api/lists)
                                 │ addCategory / updateCategory / removeCategory
                                 │ addList / updateList / removeList
Dashboard (client)
  ├── fetches GET /api/planning-items + GET /api/statuses (task snapshot)
  ├── reads categories + lists from the store
  └── computeDashboard(tasks, categories, lists, statuses, now)  ← pure module
        → { summary, categories: CategoryStats[] }
```

## Components and Interfaces

### Dependency

- Add `zustand` (latest 5.x) to dependencies.

### Workspace store (`src/stores/workspace-store.ts`)

```ts
type WorkspaceStatus = "idle" | "loading" | "ready" | "error";

interface WorkspaceState {
  categories: Category[];
  lists: List[];
  status: WorkspaceStatus;
  ensureLoaded: () => Promise<void>; // fetches once; guards on status
  reload: () => Promise<void>;
  addCategory: (c: Category) => void;
  updateCategory: (c: Category) => void;
  removeCategory: (id: string) => void; // also drops the category's lists
  addList: (l: List) => void;
  updateList: (l: List) => void;
  removeList: (id: string) => void;
}
```

- `ensureLoaded` fetches `/api/categories` and `/api/lists` in parallel, sets
  `status`, and populates state; it is a no-op when already `ready`/`loading`.
- Mutators are synchronous state updates. Components keep doing the API calls
  (POST/PATCH/DELETE) with `sonner` error toasts, then call the matching store
  mutator on success — the toasts and optimistic UX stay in the components, the
  shared state lives in the store.
- `removeCategory(id)` also removes that category's lists from state (mirrors the
  server cascade) so the dashboard and sidebar stay consistent.

### Sidebar refactor (`src/components/layout/app-sidebar.tsx`)

- Replace the local `useState` + fetch of categories/lists with the store: call
  `ensureLoaded()` on mount and read `categories`/`lists` from the store.
- The existing create/rename/delete handlers keep their fetch + toast logic but
  update the store via the mutators instead of local `setState`.
- The active-list highlighting and controlled-collapsible behavior are unchanged.

### Dashboard page and component

- `src/app/(app)/page.tsx`: render `<Dashboard />` (replaces the empty state).
- `src/components/dashboard/dashboard.tsx` (client):
  - `ensureLoaded()` from the store; read `categories`/`lists`.
  - Fetch `/api/planning-items` and `/api/statuses` locally (task snapshot),
    with a `sonner` toast on failure, mirroring `TaskList`'s fetch pattern.
  - Compute `computeDashboard(...)` with `useMemo`, keyed on tasks/lists/
    categories/statuses.
  - Render `<SummaryStrip>` and a `<CategoryCard>` per category.
  - Handle loading (skeletons) and the onboarding empty state (no categories).
- `src/components/dashboard/summary-strip.tsx`, `category-card.tsx`:
  presentational, receive computed numbers as props.

### Metrics module (`src/lib/dashboard-metrics.ts`) — pure, unit-tested

```ts
interface DashboardSummary {
  open: number;
  overdue: number;
  dueToday: number;
  upcoming: number;
}
interface CategoryStats {
  categoryId: string;
  open: number;
  completed: number;
  overdue: number;
  dueToday: number;
  upcoming: number;
  openByStatusId: Record<string, number>; // open counts keyed by status id
  lists: List[];                            // this category's lists (for links)
}
interface DashboardData {
  summary: DashboardSummary;
  categories: CategoryStats[];
}

function computeDashboard(
  tasks: PlanningItem[],
  categories: Category[],
  lists: List[],
  statuses: Status[],
  now: Date,
): DashboardData;
```

Rules encoded here (Requirement 4):
- **Open** = status not `completado` and not `cancelado`. **Completed** = status
  `completado`. (Resolve those two status ids from `statuses` by `key`.)
- **Overdue** = open AND `dueAt` < `now`.
- **Due today** = open AND (`dueAt` or `startAt`) within the current local day
  `[startOfToday, startOfTomorrow)`.
- **Upcoming** = open AND (`dueAt` or `startAt`) within
  `[startOfTomorrow, startOfTomorrow + 7d)`.
- Only tasks whose `listId` is present in `lists` are counted (a list removed
  from the store drops its tasks — Requirement 6.2). Each task maps to its
  category via `list.categoryId`.
- Local day boundaries are derived from `now` in the browser timezone.
- The summary totals are the sums of the per-category values (Requirement 4.3).

## Data Models

No schema changes. The dashboard is a read model built from existing entities
(`PlanningItem`, `Category`, `List`, `Status`). No new tables, no migration.

## Error Handling

- Failed workspace or task/status fetches → `sonner` error toast; the dashboard
  shows a non-blocking error/empty state rather than crashing (mirrors the
  existing client fetch pattern). No new server error paths are introduced.
- The dashboard is read-only, so there are no new write/validation errors.

## Correctness Properties

### Property 1: Open/completed partition

A task is counted as "open" iff its status is neither `completado` nor
`cancelado`, and as "completed" iff its status is `completado`; the two never
overlap.

**Validates: Requirements 4.1**

### Property 2: Totals equal the sum of categories

Each global summary metric equals the sum of the same metric across all category
cards.

**Validates: Requirements 4.3, 2.5**

### Property 3: Deleted lists drop out

Tasks whose `listId` is not among the current lists are excluded from every
count, so deleting a list (removing it from the store) immediately excludes its
tasks.

**Validates: Requirements 6.1, 6.2**

### Property 4: Local-day time buckets

"Overdue", "due today", and "upcoming" are computed against the browser-local
day boundaries derived from `now`, consistent with the editor's local↔UTC
handling.

**Validates: Requirements 4.2**

## Testing Strategy

- **Metrics module (primary coverage)**: exhaustive Vitest unit tests for
  `computeDashboard` and its helpers — open/completed partition; overdue/
  due-today/upcoming bucketing across local-day boundaries; tasks in deleted
  lists excluded; per-category grouping via `list.categoryId`; summary totals
  equal the sum of categories; empty inputs. These pure tests are where the
  behavior is proven.
- **Store**: unit tests for the mutators (`removeCategory` also drops its lists;
  add/update/remove list; `ensureLoaded` guards against duplicate fetches — mock
  `fetch`).
- **Frontend rendering**: manual smoke test (dashboard shows correct numbers;
  creating/deleting a list in the sidebar updates the cards without reload;
  onboarding state with no categories). Automated React component tests remain
  out of scope (no UI test framework yet).
- Gates: `pnpm build`, `pnpm test`, `pnpm lint`, `pnpm exec tsc --noEmit` all
  green.

## Verification Checklist

- Metrics unit tests cover every rule in Requirement 4.
- Sidebar still creates/renames/deletes categories and lists (now via the store)
  with no regression.
- Dashboard renders at `/` inside the sidebar layout and reflects sidebar changes
  without a reload.
