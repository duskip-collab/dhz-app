// Čisté mapovacie funkcie autorizácie — oddelené od "next/navigation"
// aj Supabase klienta, aby boli priamo unit-testovateľné cez node --test.
// REÁLNA schéma (20261006): junction tabuľky s UUID *_id + JOIN na
// definition tabuľky; kódy sa čítajú z roles.code / permissions.code.
//
// POZN.: relatívne importy "./x.ts" (nie "@/...") — node --test bez bundlera
// nevie alias; Next build prijíma oboje (tsconfig paths).
//
// IMPORTANT: server.ts používa `mapRoleCodes`/`mapPermissionCodes` AJ
// `roles` vzťah cez explicitný FK embed
// (`roles!user_roles_role_id_fkey(code)`) — názvy FK musia sedieť s typmi
// v database.types.ts (UUID *_id schéma, nie code stĺpce).
import { isPermission, type Permission } from "./permissions.ts";
import { isAppRole, type AppRole } from "./roles.ts";

interface CodeEmbed {
  code: string;
}

interface UserRoleEmbedRow {
  /** Vzťah user_roles → roles (FK user_roles_role_id_fkey). */
  roles: CodeEmbed | CodeEmbed[] | null;
}

export type { UserRoleEmbedRow };

interface RolePermissionEmbedRow {
  /** Vzťah role_permissions → permissions (FK role_permissions_permission_id_fkey). */
  permissions: CodeEmbed | CodeEmbed[] | null;
}

export type { RolePermissionEmbedRow };

interface UserPermissionEmbedRow {
  /** Vzťah user_permissions → permissions (FK user_permissions_permission_id_fkey). */
  permissions: CodeEmbed | CodeEmbed[] | null;
}

export type { UserPermissionEmbedRow };

/** Normalizuje vložený objekt PostgREST (objekt alebo jednoprvkové pole). */
function embeddedCode(
  embedded: CodeEmbed | CodeEmbed[] | null | undefined,
): string | null {
  if (!embedded) return null;
  if (Array.isArray(embedded)) return embedded[0]?.code ?? null;
  return typeof embedded.code === "string" ? embedded.code : null;
}

/**
 * Mapuje riadky user_roles (+roles) na kódy rolí.
 * Neznáme kódy vynechá (isAppRole). Čistá funkcia — unit-testovaná.
 */
export function mapRoleCodes(rows: readonly UserRoleEmbedRow[]): AppRole[] {
  return rows
    .map((row) => embeddedCode(row.roles))
    .filter((code): code is string => code !== null)
    .filter(isAppRole);
}

/**
 * Mapuje riadky *_permissions (+permissions) na platné kódy oprávnení.
 * Dedup je na volajúcom (Set). Čistá funkcia — unit-testovaná.
 */
export function mapPermissionCodes(
  rows: readonly (RolePermissionEmbedRow | UserPermissionEmbedRow)[],
): Permission[] {
  return rows
    .map((row) => embeddedCode(row.permissions))
    .filter((code): code is string => code !== null)
    .filter(isPermission);
}
