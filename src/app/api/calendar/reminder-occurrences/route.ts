import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import {
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "../../../../lib/errors";
import { listReminderOccurrencesForCurrentUserRange } from "../../../../services/planning-item.service";

/**
 * Route Handler for /api/calendar/reminder-occurrences.
 *
 * Read-only range query powering the calendar's RECURRING-reminder markers:
 * returns the authenticated user's recurring-reminder OCCURRENCES whose
 * normalized date falls in `[from, to)`, expanded from each reminder's recurrence
 * rule. One-shot reminders keep flowing through `/api/calendar/reminders` — this
 * endpoint is only for recurring ones. Mirrors `/api/calendar/habits`. Thin by
 * design — validate the range, delegate to one service function, translate the
 * result/error into an HTTP response. No business logic and no Prisma import.
 */

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
 *   ZodError          -> 400 (missing/invalid range)
 *   ValidationError   -> 400 (domain validation failure)
 *   UnauthorizedError -> 401
 *   NotFoundError     -> 404
 *   anything else     -> 500 (never leaks the underlying error shape)
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

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const params = new URL(request.url).searchParams;
    const { from, to } = rangeSchema.parse({
      from: params.get("from"),
      to: params.get("to"),
    });
    const occurrences = await listReminderOccurrencesForCurrentUserRange(
      from,
      to,
    );
    return NextResponse.json(occurrences, { status: 200 });
  } catch (error) {
    return mapErrorToResponse(error);
  }
}
