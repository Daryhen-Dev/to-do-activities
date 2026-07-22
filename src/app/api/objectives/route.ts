import { NextResponse } from "next/server";
import { UnauthorizedError } from "../../../lib/errors";
import { listObjectivesForCurrentUser } from "../../../services/planning-item.service";

/**
 * Route Handler for /api/objectives.
 *
 * Read-only endpoint powering the Objectives view: returns the authenticated
 * user's `objetivo`-type items (live), each enriched with its owning category,
 * ordered by deadline. Objectives are created/edited/deleted through the generic
 * `/api/planning-items` endpoints — this route is read-only. Thin by design.
 */

/**
 *   UnauthorizedError -> 401 (no signed-in user)
 *   anything else      -> 500 (never leaks the underlying error shape)
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
    const objectives = await listObjectivesForCurrentUser();
    return NextResponse.json(objectives, { status: 200 });
  } catch (error) {
    return mapErrorToResponse(error);
  }
}
