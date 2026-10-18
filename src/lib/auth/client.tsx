"use client";

import { createContext, useContext } from "react";
import { hasPermission as checkPermission } from "@/lib/auth/permissions";
import type { Permission } from "@/lib/auth/permissions";
import { hasRole as checkRole, type AppRole } from "@/lib/auth/roles";

interface ClientAuth {
  roles: AppRole[];
  permissions: string[];
}

const AuthCtx = createContext<ClientAuth>({ roles: [], permissions: [] });

export function AuthProvider({
  roles,
  permissions,
  children,
}: ClientAuth & { children: React.ReactNode }) {
  return <AuthCtx.Provider value={{ roles, permissions }}>{children}</AuthCtx.Provider>;
}

export function useAuth(): ClientAuth & {
  hasPermission: (permission: Permission) => boolean;
  hasRole: (role: AppRole) => boolean;
} {
  const ctx = useContext(AuthCtx);
  return {
    ...ctx,
    hasPermission: (permission) => checkPermission(ctx.permissions, permission),
    hasRole: (role) => checkRole(ctx.roles, role),
  };
}
