# To-Do Activities

A task and activity planning application. Users organize work into categories
and lists, then track individual planning items classified by type, priority,
and status.

## Tech Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Prisma 7** ORM over **PostgreSQL 17**
- **Zod 4** for input validation
- **Vitest** for unit and integration tests
- **pnpm** as the package manager
- **Docker Compose** for the local database

## Architecture

The codebase follows a layered (Clean/Hexagonal) architecture. Each layer has
a single responsibility and its own colocated tests:

```
src/
├── validators/   # Zod schemas — validate incoming request data
├── repositories/ # Data access — the only place that talks to Prisma
├── services/     # Business logic — orchestrates repositories and rules
├── lib/          # Shared helpers (prisma client, errors, current user)
├── prisma/       # Schema, migrations, and seed
└── app/api/      # Next.js route handlers (HTTP layer)
```

Route handlers are intentionally thin: they validate the request with Zod,
delegate to exactly one service function, and map the result or error to an
HTTP status code. No business logic or Prisma imports live in the route layer.

## Data Model

- **User** — owner of all data (cascade delete).
- **Category → List** — a hierarchy for grouping work. Both support soft delete
  via `deletedAt`.
- **PlanningItem** — the core entity. Belongs to a user, optionally to a list,
  and is classified by three catalogs:
  - **ItemType** — with capability flags (`requiresCompletion`, `allowsProgress`,
    `allowsChecklist`, `allowsRepetition`).
  - **Priority**
  - **Status**

Some invariants that Prisma's schema DSL cannot express — partial unique indexes
scoped to non-deleted rows (`WHERE deleted_at IS NULL`) and the "at most one
default" rule for `ItemType`/`Status` — are enforced through hand-written SQL
migrations.

## Authentication

Auth.js is not wired up yet. `src/lib/current-user.ts` returns a fixed
`DEV_USER_ID` in development and throws in production. When real auth lands,
only the body of `getCurrentUserId()` changes — its signature and every caller
stay identical.

## Getting Started

### 1. Install dependencies

```bash
pnpm install
```

### 2. Start the database

```bash
pnpm db:up
```

### 3. Configure environment

Copy the example env file and adjust if needed:

```bash
cp .env.example .env
```

The default `DATABASE_URL` matches the Docker Compose credentials
(`todo:todo@localhost:5432/todo_activities`).

### 4. Run migrations and seed

```bash
pnpm db:migrate
pnpm db:seed
```

### 5. Start the dev server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Script            | Description                              |
| ----------------- | ---------------------------------------- |
| `pnpm dev`        | Start the Next.js dev server             |
| `pnpm build`      | Production build                         |
| `pnpm start`      | Start the production server              |
| `pnpm lint`       | Run ESLint                               |
| `pnpm test`       | Run the Vitest suite once                |
| `pnpm db:up`      | Start the PostgreSQL container           |
| `pnpm db:down`    | Stop the PostgreSQL container            |
| `pnpm db:migrate` | Apply Prisma migrations (dev)            |
| `pnpm db:seed`    | Seed the database                        |
| `pnpm db:studio`  | Open Prisma Studio                       |
| `pnpm db:generate`| Regenerate the Prisma client             |
