import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import {
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "../../../../../lib/errors";
import { listScheduledItemsForCategory } from "../../../../../services/planning-item.service";

/**
 * Route Handler for /api/categories/[id]/calendar.
 *
 * Read-only range query powering the per-category calendar: returns the
 * category's scheduled items whose schedule overlaps `[from, to)`. Thin by
 * design — validate the range, delegate to one service function, translate
 * the result/error into an HTTP response. No business logic and no Prisma
 * import here.
 */

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** `from`/`to` query contract: both required, parseable, and `to` after `from`. */
const rangeSchema = z
  .object({
    from: z.coerce.date(),
    to: z.coerce.date(),
  })
  .refine((range) => range.to > range.from, {
    message: "`to` must be after `from`",
    path: ["to"],
  });

/**
 * Maps a thrown error to an HTTP response so the domain-error -> status-code
 * contract stays in one place.
 *
 *   ZodError        -> 400 (missing/invalid range)
 *   ValidationError -> 400 (domain validation failure)
 *   UnauthorizedError -> 401
 *   NotFoundError    -> 404 (category not found / not owned)
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

export async function GET(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    const params = new URL(request.url).searchParams;
    const { from, to } = rangeSchema.parse({
      from: params.get("from"),
      to: params.get("to"),
    });
    const items = await listScheduledItemsForCategory(id, from, to);
    return NextResponse.json(items, { status: 200 });
  } catch (error) {
    return mapErrorToResponse(error);
  }
}
