/**
 * Domain error types.
 *
 * The service layer throws these to signal outcomes that are meaningful to
 * callers without depending on any transport (HTTP, CLI, etc.). The route
 * handler maps them to HTTP status codes:
 *   - ValidationError -> 400
 *   - NotFoundError    -> 404 (also used for "referenced id does not exist")
 *   - ConflictError    -> 409 (duplicate active name / unique-index violation)
 *   - anything else    -> 500
 *
 * Keeping these framework-agnostic means the service never imports
 * `NextResponse`/`NextRequest`, and the route handler never leaks Prisma
 * error shapes to clients.
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}
