export const APP_ROLES = {
  ADMIN: "ADMIN",
  VEDENIE: "VEDENIE",
  VELITEL: "VELITEL",
  POKLADNIK: "POKLADNIK",
  TRENER: "TRENER",
  CLEN: "CLEN",
  RODIC: "RODIC",
} as const;

export type AppRole = (typeof APP_ROLES)[keyof typeof APP_ROLES];

const APP_ROLE_VALUES: ReadonlySet<string> = new Set(Object.values(APP_ROLES));

export const ROLE_LABELS: Record<AppRole, string> = {
  ADMIN: "Administrátor",
  VEDENIE: "Vedenie",
  VELITEL: "Veliteľ",
  POKLADNIK: "Pokladník",
  TRENER: "Tréner",
  CLEN: "Člen",
  RODIC: "Rodič",
};

export function isAppRole(role: string): role is AppRole {
  return APP_ROLE_VALUES.has(role);
}

export function hasRole(userRoles: readonly AppRole[], role: AppRole): boolean {
  return userRoles.includes(role);
}

export function hasAnyRole(userRoles: readonly AppRole[], roles: readonly AppRole[]): boolean {
  return roles.some((role) => userRoles.includes(role));
}
