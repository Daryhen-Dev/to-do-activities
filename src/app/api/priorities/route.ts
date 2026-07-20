import { NextResponse } from "next/server";
import { listPriorities } from "../../../services/catalog.service";

/**
 * Route Handler for /api/priorities.
 *
 * Read-only catalog endpoint: returns the active priorities for the client
 * to populate selects. Thin by design — delegates to the catalog service
 * and never imports Prisma or a repository directly.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const priorities = await listPriorities();
    return NextResponse.json(priorities, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
