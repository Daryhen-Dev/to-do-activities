import { NextResponse } from "next/server";
import { UnauthorizedError } from "../../../lib/errors";
import { listHabitsForCurrentUser } from "../../../services/planning-item.service";

/**
 * Route Handler for /api/habits.
 *
 * Read-only endpoint powering the Habits view: returns the authenticated user's
 * `habito`-type items (live), each enriched with its owning category and its
 * computed streak + weekly adherence. Habits are created/edited/archived through
 * the generic `/api/planning-items` endpoints; occurrence completions go through
 * `/api/habits/[id]/completions`. This route is read-only. Thin by design.
 */

/**
 *   UnauthorizedError -> 401 (no signed-in user), no item data
 *   anything else      -> 500 (never leaks the underlying error shape), no data
 */
function mapErrorToResponse(error: unknown): NextResponse {
  if (error instanceof UnauthorizedError) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }

  return NextResponse.json(
    { error: "Internal server error" },
    { status: 500 },
  );
}

export async function GET(): Promise<NextResponse> {
  try {
    const habits = await listHabitsForCurrentUser();
    return NextResponse.json(habits, { status: 200 });
  } catch (error) {
    return mapErrorToResponse(error);
  }
}
