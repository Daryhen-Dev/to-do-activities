import { handlers } from "../../../../auth";

/**
 * Auth.js catch-all route. Exposes the sign-in / sign-out / session / CSRF
 * endpoints under /api/auth/*. All configuration lives in `src/auth.ts`.
 */
export const { GET, POST } = handlers;
