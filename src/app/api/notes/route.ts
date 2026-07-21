import { NextResponse } from "next/server";
import { UnauthorizedError } from "../../../lib/errors";
import { listNotesForCurrentUser } from "../../../services/planning-item.service";

/**
 * Route Handler for /api/notes.
 *
 * Read-only endpoint powering the Notes view: returns the authenticated user's
 * `nota`-type items, each enriched with its owning category (the section).
 * Notes are created/edited/deleted through the generic `/api/planning-items`
 * endpoints — this route is read-only. Thin by design: delegate to one service
 * function and translate the result/error into an HTTP response.
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
    const notes = await listNotesForCurrentUser();
    return NextResponse.json(notes, { status: 200 });
  } catch (error) {
    return mapErrorToResponse(error);
  }
}
