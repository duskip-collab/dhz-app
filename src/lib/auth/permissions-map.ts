// Čisté mapovacie funkcie autorizácie — oddelené od "next/navigation"
// aj Supabase klienta, aby boli priamo unit-testovateľné cez node --test.
// Database relation embeddings are normalized here and checked against the
// application permission/role catalogs.
//
// POZN.: relatívne importy "./x.ts" (nie "@/...") — node --test bez bundlera
// nevie alias; Next build prijíma oboje (tsconfig paths).
//
import { isPermission, type Permission } from "./permissions.ts";

interface CodeEmbed {
  code: string;
}

interface RolePermissionEmbedRow {
  /** Vzťah role_permissions → permissions (FK role_permissions_permission_id_fkey). */
  permissions: CodeEmbed | CodeEmbed[] | null;
}

export type { RolePermissionEmbedRow };

interface PermissionEmbedRow {
  /** Embedded permission row from a member grant or denial relation. */
  permissions: CodeEmbed | CodeEmbed[] | null;
}

/** Normalizuje vložený objekt PostgREST (objekt alebo jednoprvkové pole). */
function embeddedCode(
  embedded: CodeEmbed | CodeEmbed[] | null | undefined,
): string | null {
  if (!embedded) return null;
  if (Array.isArray(embedded)) return embedded[0]?.code ?? null;
  return typeof embedded.code === "string" ? embedded.code : null;
}

/**
 * Mapuje riadky *_permissions (+permissions) na platné kódy oprávnení.
 * Dedup je na volajúcom (Set). Čistá funkcia — unit-testovaná.
 */
export function mapPermissionCodes(
  rows: readonly (RolePermissionEmbedRow | PermissionEmbedRow)[],
): Permission[] {
  return rows
    .map((row) => embeddedCode(row.permissions))
    .filter((code): code is string => code !== null)
    .filter(isPermission);
}

/**
 * Computes effective permissions as (role permissions ∪ grants) − denials.
 */
export function computeEffectivePermissions(
  rolePermissions: readonly Permission[],
  directPermissions: readonly Permission[],
  deniedPermissions: readonly Permission[],
): Permission[] {
  const denied = new Set(deniedPermissions);
  return Array.from(new Set([...rolePermissions, ...directPermissions])).filter(
    (permission) => !denied.has(permission),
  );
}

export function isActiveMemberAccessProfile(
  status: string | null | undefined,
): boolean {
  return status === "active";
}
