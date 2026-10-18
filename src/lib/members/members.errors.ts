// Shared auth error – extracted to break circular import
// Used by both members.service.ts and audit.service.ts

export class AuthError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "AuthError";
  }
}

/** Vytvorí standardnú auth chybu */
export function createAuthError(
  statusCode: number,
  message: string,
  details?: Record<string, unknown>
): AuthError {
  return new AuthError(statusCode, message, details);
}
