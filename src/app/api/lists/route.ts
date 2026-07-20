import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import {
  ConflictError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "../../../lib/errors";
import {
  createListForCurrentUser,
  listAllListsForCurrentUser,
  listListsForCategory,
} from "../../../services/list.service";
import { createListSchema } from "../../../validators/list.schema";

/**
 * Route Handler for /api/lists.
 *
 * Thin by design: validate the request with Zod, delegate to exactly one
 * service function, and translate the result/error into an HTTP response.
 * No business logic and no Prisma import here — see
 * `src/services/list.service.ts` and `src/repositories/list.repository.ts`.
 */

/**
 * Maps a thrown error to an HTTP response, shared by every verb in this
 * route so the domain-error -> status-code contract stays in one place.
 *
 *   ZodError        -> 400 (invalid request body)
 *   ValidationError -> 400 (domain validation failure, e.g. missing query)
 *   NotFoundError    -> 404 (category/list not found or not owned)
 *   ConflictError    -> 409 (duplicate active name in the category)
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
    const input = createListSchema.parse(body);
    const list = await createListForCurrentUser(input);
    return NextResponse.json(list, { status: 201 });
  } catch (error) {
    return mapErrorToResponse(error);
  }
}

/**
 * Lists for the current user. With `?categoryId=…` the result is scoped to
 * that (owned) category; without it, every list the user owns across all
 * categories is returned — useful for category-grouped pickers.
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const categoryId = new URL(request.url).searchParams.get("categoryId");
    const lists = categoryId
      ? await listListsForCategory(categoryId)
      : await listAllListsForCurrentUser();
    return NextResponse.json(lists, { status: 200 });
  } catch (error) {
    return mapErrorToResponse(error);
  }
}
