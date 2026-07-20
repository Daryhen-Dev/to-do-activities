import { NextResponse } from "next/server";
import { listStatuses } from "../../../services/catalog.service";

/**
 * Route Handler for /api/statuses.
 *
 * Read-only catalog endpoint: returns the active statuses for the client
 * to populate selects. Thin by design — delegates to the catalog service
 * and never imports Prisma or a repository directly.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const statuses = await listStatuses();
    return NextResponse.json(statuses, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
