// Loads `.env` (DATABASE_URL) for tests that hit the real Postgres instance
// (repository and route integration tests). Next.js loads env vars for
// `next dev`/`next build` automatically, but a plain Vitest run does not.
import "dotenv/config";
