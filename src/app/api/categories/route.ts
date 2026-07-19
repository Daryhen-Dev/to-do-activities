import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import {
  ConflictError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "../../../lib/errors";
import {
  createCategoryForCurrentUser,
  listCategoriesForCurrentUser,
} from "../../../services/category.service";
import { createCategorySchema } from "../../../validators/category.schema";

/**
 * Route Handler for /api/categories.
 *
 * Thin by design: validate the request with Zod, delegate to exactly one
 * service function, and translate the result/error into an HTTP response.
 * No business logic and no Prisma import here — see
 * `src/services/category.service.ts` and
 * `src/repositories/category.repository.ts`.
 */

/**
 * Maps a thrown error to an HTTP response, shared by every verb in this
 * route so the domain-error -> status-code contract stays in one place.
 *
 *   ZodError        -> 400 (invalid request body)
 *   ValidationError -> 400 (domain validation failure)
 *   NotFoundError    -> 404 (referenced id does not exist)
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

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body: unknown = await request.json();
    const input = createCategorySchema.parse(body);
    const category = await createCategoryForCurrentUser(input);
    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    return mapErrorToResponse(error);
  }
}

export async function GET(): Promise<NextResponse> {
  try {
    const categories = await listCategoriesForCurrentUser();
    return NextResponse.json(categories, { status: 200 });
  } catch (error) {
    return mapErrorToResponse(error);
  }
}
