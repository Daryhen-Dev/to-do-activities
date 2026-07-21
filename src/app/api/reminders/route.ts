import { NextResponse } from "next/server";
import { UnauthorizedError } from "../../../lib/errors";
import { listDueRemindersForCurrentUser } from "../../../services/planning-item.service";

/**
 * Route Handler for /api/reminders.
 *
 * Thin by design: delegate to exactly one service function and translate the
 * result/error into an HTTP response. No business logic and no Prisma import
 * here — the due predicate lives in the service/repository.
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
    const reminders = await listDueRemindersForCurrentUser();
    return NextResponse.json(reminders, { status: 200 });
  } catch (error) {
    return mapErrorToResponse(error);
  }
}
