import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../../../lib/errors";
import {
  createListForCurrentUser,
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
 * Lists are always scoped to a category, so `categoryId` is a required
 * query parameter (`GET /api/lists?categoryId=…`). A missing param is a
 * client error surfaced as a domain `ValidationError` -> 400.
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const categoryId = new URL(request.url).searchParams.get("categoryId");
    if (!categoryId) {
      throw new ValidationError("categoryId query parameter is required");
    }
    const lists = await listListsForCategory(categoryId);
    return NextResponse.json(lists, { status: 200 });
  } catch (error) {
    return mapErrorToResponse(error);
  }
}
