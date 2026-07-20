# Requirements Document

## Introduction

Today the app exposes a flat "all tasks" screen at `/`, while list creation is
buried three clicks deep under the category drill-down (`/categories/[id]`).
Tasks are created loose and only later assigned to a list. This makes the
intended structure — Category → List → Task — invisible and hard to follow.

This change enforces a **mandatory hierarchy** (every task belongs to a list,
every list belongs to a category) and unifies navigation behind a persistent,
collapsible sidebar (shadcn `sidebar-07`). Categories appear as collapsible
groups in the sidebar; their lists nest underneath. Selecting a list drives the
main panel, which shows that list's tasks and a list-scoped task creator.

Scope decisions already agreed with the product owner:
- **Enforcement at the database level** (`listId` becomes `NOT NULL`).
- **Cascade delete**: deleting a list removes its tasks.
- **Unified layout**: the sidebar replaces the current `/categories` and
  `/categories/[id]` pages and the flat "all tasks" home.

## Glossary

- **Category**: Top-level grouping owned by a user (e.g. "Work", "Personal").
- **List**: A named collection of tasks that belongs to exactly one category.
- **Task**: A planning item (`PlanningItem`) that, after this change, belongs to
  exactly one list.
- **Mandatory hierarchy**: The invariant that every task belongs to a list and
  every list belongs to a category.
- **Soft-delete**: Marking a row as deleted via `deletedAt` instead of removing
  it from the database.
- **List-scoped view**: The main panel showing only the tasks of the currently
  selected list.

## Requirements

### Requirement 1: Every task belongs to a list (mandatory hierarchy)

**User Story:** As a user, I want every task to live inside a list, so that my
tasks stay organized under a clear Category → List → Task structure.

#### Acceptance Criteria

1. WHEN a client requests to create a task without a `listId` THEN the system
   SHALL reject the request with a validation error and SHALL NOT create the
   task.
2. WHEN a client requests to create a task with a `listId` that the current
   user does not own THEN the system SHALL reject the request with a not-found
   error.
3. WHERE a task is created with a valid owned `listId` THE system SHALL persist
   the task associated with that list.
4. THE database SHALL enforce that `planning_items.list_id` is `NOT NULL`.
5. WHEN existing tasks with a null `list_id` are present at migration time THEN
   the migration SHALL remove those orphaned tasks before applying the
   `NOT NULL` constraint.

### Requirement 2: Deleting a list cascades to its tasks

**User Story:** As a user, I want deleting a list to also remove its tasks, so
that I never end up with orphaned tasks that have nowhere to live.

#### Acceptance Criteria

1. WHEN a user deletes a list THEN the system SHALL soft-delete every
   non-deleted task belonging to that list in the same operation.
2. WHEN a list is deleted THEN its tasks SHALL no longer appear in any task view.
3. THE database foreign key from `planning_items.list_id` to `lists.id` SHALL
   use `ON DELETE CASCADE` so that a hard delete of a list also removes its
   tasks.
4. WHERE a list deletion fails THE system SHALL leave both the list and its
   tasks unchanged (no partial delete).

### Requirement 3: Persistent sidebar navigation

**User Story:** As a user, I want a persistent sidebar listing my categories and
their lists, so that I can navigate and create structure without hunting through
nested pages.

#### Acceptance Criteria

1. WHEN an authenticated user views any authenticated route THEN the system
   SHALL render a persistent collapsible sidebar.
2. THE sidebar SHALL display the user's categories as collapsible groups, with
   each category's lists nested beneath it.
3. WHEN a user activates the "add category" control THEN the system SHALL let
   the user create a category from within the sidebar.
4. WHEN a user activates the "add list" control on a category THEN the system
   SHALL let the user create a list under that category from within the sidebar.
5. WHEN a user selects a list in the sidebar THEN the system SHALL navigate to
   that list's task view.
6. THE sidebar SHALL provide sign-out access and show the signed-in user.
7. WHEN a category or list is created, renamed, or deleted THEN the sidebar
   SHALL reflect the change without requiring a full page reload.

### Requirement 4: List-scoped task view

**User Story:** As a user, I want to select a list and see and create its tasks
in the main panel, so that task creation is always tied to a clear context.

#### Acceptance Criteria

1. WHEN a user opens a list's task view THEN the system SHALL display only the
   tasks belonging to that list.
2. WHEN a user creates a task from within a list's view THEN the system SHALL
   associate the new task with that list.
3. WHEN a user has not selected any list (e.g. at `/`) THEN the system SHALL
   show an empty state prompting the user to select or create a list.
4. WHERE a list view is shown THE system SHALL let the user hide completed tasks.
5. WHEN a user requests a task view for a list they do not own or that does not
   exist THEN the system SHALL show a not-found state.

### Requirement 5: Move a task between lists

**User Story:** As a user, I want to move a task from one list to another, so
that I can reorganize without recreating tasks.

#### Acceptance Criteria

1. WHEN a user edits a task THEN the system SHALL let the user reassign it to a
   different owned list.
2. THE task edit flow SHALL NOT offer an option to detach a task from all lists
   (no "none" option), consistent with the mandatory hierarchy.
3. WHEN a task is reassigned to another list THEN it SHALL appear under the
   destination list and disappear from the source list's view.

### Requirement 6: Migration away from the old pages

**User Story:** As a user, I want the old category pages and flat task screen to
be replaced cleanly, so that there is a single, consistent way to work.

#### Acceptance Criteria

1. THE routes `/categories` and `/categories/[id]` SHALL be removed or redirected
   into the unified sidebar experience.
2. THE flat "all tasks" home SHALL be replaced by the list-scoped experience.
3. WHERE a previously bookmarked category route is visited THE system SHALL not
   error (it either redirects into the new experience or shows a not-found
   state).
