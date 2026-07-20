import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import {
  ConflictError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "../../../../lib/errors";
import {
  deleteCategoryForCurrentUser,
  getCategoryForCurrentUser,
  updateCategoryForCurrentUser,
} from "../../../../services/category.service";
import { updateCategorySchema } from "../../../../validators/category.schema";

/**
 * Route Handler for /api/categories/[id].
 *
 * Thin by design: validate the request with Zod, delegate to exactly one
 * service function, and translate the result/error into an HTTP response.
 * No business logic and no Prisma import here — see
 * `src/services/category.service.ts` and
 * `src/repositories/category.repository.ts`.
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
 *   NotFoundError    -> 404 (not found / not owned / soft-deleted)
 *   ConflictError    -> 409 (duplicate active name)
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

  if (error instanceof ConflictError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
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
    const category = await getCategoryForCurrentUser(id);
    return NextResponse.json(category, { status: 200 });
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
    const input = updateCategorySchema.parse(body);
    const category = await updateCategoryForCurrentUser(id, input);
    return NextResponse.json(category, { status: 200 });
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
    await deleteCategoryForCurrentUser(id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return mapErrorToResponse(error);
  }
}
