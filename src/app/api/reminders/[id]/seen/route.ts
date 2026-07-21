import { NextResponse } from "next/server";
import {
  NotFoundError,
  UnauthorizedError,
} from "../../../../../lib/errors";
import { acknowledgeReminderForCurrentUser } from "../../../../../services/planning-item.service";

/**
 * Route Handler for /api/reminders/[id]/seen.
 *
 * Thin by design: delegate to exactly one service function and translate the
 * result/error into an HTTP response. Acknowledgement is a dedicated action so
 * `reminderSeenAt` is server-stamped and never client-writable through the
 * general PATCH /api/planning-items/[id] surface.
 */

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 *   NotFoundError     -> 404 (not found / not owned — existence never leaked)
 *   UnauthorizedError -> 401 (no signed-in user)
 *   anything else      -> 500 (never leaks the underlying error shape)
 */
function mapErrorToResponse(error: unknown): NextResponse {
  if (error instanceof UnauthorizedError) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }

  if (error instanceof NotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  return NextResponse.json(
    { error: "Internal server error" },
    { status: 500 },
  );
}

export async function POST(
  _request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    const item = await acknowledgeReminderForCurrentUser(id);
    return NextResponse.json(item, { status: 200 });
  } catch (error) {
    return mapErrorToResponse(error);
  }
}
