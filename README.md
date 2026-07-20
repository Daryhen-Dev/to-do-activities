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

Auth.js (NextAuth v5) with a Credentials provider and stateless JWT sessions.
`getCurrentUserId()` (in `src/lib/current-user.ts`) resolves the acting user
from the session and throws `UnauthorizedError` (HTTP 401) when there is none,
so every service enforces auth through that single seam. Route protection for
pages lives in `src/proxy.ts` (the Next 16 successor to `middleware.ts`), which
shares the edge-safe `src/auth.config.ts` with the full server config in
`src/auth.ts`.

Local sign-in uses the seeded dev user:

- **Email**: `dev@local.test`
- **Password**: `devpassword123`

`AUTH_SECRET` must be set in `.env` (see `.env.example` for how to generate one).

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
(`todo:todo@localhost:5432/todo_activities`). Also set `AUTH_SECRET` — generate
one with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

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
