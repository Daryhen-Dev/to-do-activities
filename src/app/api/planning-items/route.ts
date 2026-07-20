import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import {
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "../../../lib/errors";
import {
  createPlanningItemForCurrentUser,
  listPlanningItemsForCurrentUser,
} from "../../../services/planning-item.service";
import { createPlanningItemSchema } from "../../../validators/planning-item.schema";

/**
 * Route Handler for /api/planning-items.
 *
 * Thin by design: validate the request with Zod, delegate to exactly one
 * service function, and translate the result/error into an HTTP response.
 * No business logic and no Prisma import here — see
 * `src/services/planning-item.service.ts` and
 * `src/repositories/planning-item.repository.ts`.
 */

/**
 * Maps a thrown error to an HTTP response, shared by every verb in this
 * route so the domain-error -> status-code contract stays in one place.
 *
 *   ZodError        -> 400 (invalid request body)
 *   ValidationError -> 400 (domain validation failure)
 *   NotFoundError    -> 404 (referenced id does not exist)
 *   anything else    -> 500 (never leaks the underlying error shape)
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

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body: unknown = await request.json();
    const input = createPlanningItemSchema.parse(body);
    const item = await createPlanningItemForCurrentUser(input);
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return mapErrorToResponse(error);
  }
}

export async function GET(): Promise<NextResponse> {
  try {
    const items = await listPlanningItemsForCurrentUser();
    return NextResponse.json(items, { status: 200 });
  } catch (error) {
    return mapErrorToResponse(error);
  }
}
