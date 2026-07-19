import bcrypt from "bcryptjs";
import { findUserByEmail } from "../repositories/user.repository";

/**
 * Business rules for authentication. Owns the credential-verification logic
 * (constant-ish-time password comparison via bcrypt) and never leaks the
 * password hash past this boundary — it returns only a minimal, safe
 * identity on success. Consumed by the NextAuth `authorize` callback in
 * `src/auth.ts`.
 */

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string | null;
}

/**
 * Verifies an email/password pair against the stored bcrypt hash.
 *
 * Returns the authenticated identity on success, or `null` on any failure
 * (unknown email, a user with no password set, or a mismatch). Failures are
 * deliberately indistinguishable to the caller so the endpoint cannot be
 * used to probe which emails exist.
 */
export async function authenticateUser(
  email: string,
  password: string,
): Promise<AuthenticatedUser | null> {
  const user = await findUserByEmail(email);
  if (!user || !user.passwordHash) {
    return null;
  }

  const matches = await bcrypt.compare(password, user.passwordHash);
  if (!matches) {
    return null;
  }

  return { id: user.id, email: user.email, name: user.name };
}
