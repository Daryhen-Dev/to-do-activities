import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { NotFoundError, ValidationError } from "../../../../lib/errors";
import {
  deletePlanningItemForCurrentUser,
  getPlanningItemForCurrentUser,
  updatePlanningItemForCurrentUser,
} from "../../../../services/planning-item.service";
import { updatePlanningItemSchema } from "../../../../validators/planning-item.schema";

/**
 * Route Handler for /api/planning-items/[id].
 *
 * Thin by design: validate the request with Zod, delegate to exactly one
 * service function, and translate the result/error into an HTTP response.
 * No business logic and no Prisma import here — see
 * `src/services/planning-item.service.ts` and
 * `src/repositories/planning-item.repository.ts`.
 */

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Maps a thrown error to an HTTP response, shared by every verb in this
 * route so the domain-error -> status-code contract stays in one place.
 *
 *   ZodError        -> 400 (invalid request body)
 *   ValidationError -> 400 (domain validation failure)
 *   NotFoundError    -> 404 (not found / not owned / soft-deleted / unknown ref)
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

  if (error instanceof NotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  return NextResponse.json(
    { error: "Internal server error" },
    { status: 500 },
  );
}

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    const item = await getPlanningItemForCurrentUser(id);
    return NextResponse.json(item, { status: 200 });
  } catch (error) {
    return mapErrorToResponse(error);
  }
}

export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    const body: unknown = await request.json();
    const input = updatePlanningItemSchema.parse(body);
    const item = await updatePlanningItemForCurrentUser(id, input);
    return NextResponse.json(item, { status: 200 });
  } catch (error) {
    return mapErrorToResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    await deletePlanningItemForCurrentUser(id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return mapErrorToResponse(error);
  }
}
