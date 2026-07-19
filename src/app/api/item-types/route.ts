import { NextResponse } from "next/server";
import { listItemTypes } from "../../../services/catalog.service";

/**
 * Route Handler for /api/item-types.
 *
 * Read-only catalog endpoint: returns the active item types for the client
 * to populate selects. Thin by design — delegates to the catalog service
 * and never imports Prisma or a repository directly.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const itemTypes = await listItemTypes();
    return NextResponse.json(itemTypes, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
