import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import {
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "../../../../../lib/errors";
import { setHabitCompletionForCurrentUser } from "../../../../../services/planning-item.service";
import { habitCompletionSchema } from "../../../../../validators/planning-item.schema";

/**
 * Route Handler for /api/habits/[id]/completions.
 *
 * A completion is a sub-resource of a habit, so the HTTP verb carries the
 * intent and the body is just the occurrence date:
 *   - POST   marks the occurrence complete   (idempotent create)
 *   - DELETE marks the occurrence incomplete (idempotent remove)
 *
 * Thin by design: validate the body with Zod, delegate to exactly one service
 * function, and translate the result/error into an HTTP response. The habit
 * ROW is created/edited/archived through `/api/planning-items`, never here.
 */

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 *   ZodError / ValidationError -> 400 (bad body, or date not scheduled)
 *   UnauthorizedError           -> 401 (no signed-in user)
 *   NotFoundError                -> 404 (habit not found / not owned / not a habit)
 *   anything else                -> 500 (never leaks the underlying error shape)
 */
function mapErrorToResponse(error: unknown): NextResponse {
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: "Validation failed", details: z.flattenError(error) },
      { status: 400 },
    );
  }
  if (error instanceof ValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
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
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    const body: unknown = await request.json();
    const { date } = habitCompletionSchema.parse(body);
    await setHabitCompletionForCurrentUser(id, date, true);
    return NextResponse.json({ date, completed: true }, { status: 200 });
  } catch (error) {
    return mapErrorToResponse(error);
  }
}

export async function DELETE(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    const body: unknown = await request.json();
    const { date } = habitCompletionSchema.parse(body);
    await setHabitCompletionForCurrentUser(id, date, false);
    return NextResponse.json({ date, completed: false }, { status: 200 });
  } catch (error) {
    return mapErrorToResponse(error);
  }
}
