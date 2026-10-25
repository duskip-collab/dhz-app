import { AuthError } from "@/lib/members/members.errors";
import { getAuthContext } from "@/lib/auth/server";
import type { AuthContext } from "@/lib/auth/server";

/**
 * Lokálny auth guard pre documents modul.
 * requirePermission() redirectuje na stránku – servisy potrebujú AuthContext.
 */
export async function requireAuthenticated(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx.userId) throw new AuthError(401, "Prihlásenie vypršalo alebo neplatí.");
  return ctx;
}
