import type { User } from "@prisma/client";
import { prisma } from "../lib/prisma";

/**
 * Sole Prisma import boundary for the user vertical. Currently used only by
 * the auth service to resolve credentials — hence `findUserByEmail` returns
 * the full row (including `passwordHash`). Keep any passwordHash-bearing
 * result inside the auth boundary; never return it to a route/response.
 */

/** The user with this email, or `null`. Includes `passwordHash` for auth. */
export async function findUserByEmail(email: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { email } });
}
