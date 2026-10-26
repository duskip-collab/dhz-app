import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/auth/server", () => ({
  hasPermissionServer: vi.fn(),
}));

vi.mock("@/lib/audit/audit.service", () => ({
  logSecurityEvent: vi.fn(),
  AUDIT_ACTIONS: { UPDATE: "members:update" },
}));

vi.mock("./members.errors", () => ({
  createAuthError: (status: number, message: string) => {
    const e = new Error(message) as Error & { status: number };
    e.status = status;
    return e;
  },
}));

import { createClient } from "@/lib/supabase/server";
import { hasPermissionServer } from "@/lib/auth/server";
import { logSecurityEvent } from "@/lib/audit/audit.service";
import {
  assignMemberFunction,
  endMemberFunction,
  getMemberFunctionCatalog,
  getMemberFunctions,
} from "./member-functions.service";

function mockSupabase(overrides: Record<string, unknown> = {}) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn(),
    ...overrides,
  };
  chain.single.mockResolvedValue({ data: null, error: null });
  const client = { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) }, from: vi.fn().mockReturnValue(chain) };
  (chain as Record<string, unknown>).then = (resolve: (v: unknown) => void) => resolve({ data: [], error: null });
  (createClient as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue(client);
  return { client, chain };
}

beforeEach(() => {
  vi.clearAllMocks();
  (hasPermissionServer as unknown as { mockResolvedValue: (v: boolean) => void }).mockResolvedValue(true);
});

describe("member-functions.service", () => {
  it("getMemberFunctionCatalog requires members.view", async () => {
    mockSupabase();
    await getMemberFunctionCatalog();
    expect(hasPermissionServer).toHaveBeenCalledWith("u1", "members.view");
  });

  it("assignMemberFunction inserts with assigned_by from auth", async () => {
    const { chain } = mockSupabase();
    chain.single
      .mockResolvedValueOnce({ data: { id: "m1", status: "active" }, error: null })
      .mockResolvedValueOnce({ data: { code: "FIREFIGHTER", is_active: true }, error: null })
      .mockResolvedValueOnce({ data: { id: "a1" }, error: null });
    const res = await assignMemberFunction("123e4567-e89b-12d3-a456-426614174000", { function_code: "FIREFIGHTER" });
    expect(res).toEqual({ id: "a1" });
    expect(logSecurityEvent).toHaveBeenCalled();
  });

  it("assignMemberFunction maps 23505 to 409", async () => {
    const { chain } = mockSupabase();
    chain.single
      .mockResolvedValueOnce({ data: { id: "m1", status: "active" }, error: null })
      .mockResolvedValueOnce({ data: { code: "FIREFIGHTER", is_active: true }, error: null })
      .mockResolvedValueOnce({ data: null, error: { code: "23505", message: "dup" } });
    await expect(assignMemberFunction("123e4567-e89b-12d3-a456-426614174000", { function_code: "FIREFIGHTER" })).rejects.toMatchObject({ status: 409 });
    expect(logSecurityEvent).not.toHaveBeenCalled();
  });

  it("assignMemberFunction propagates other db errors", async () => {
    const { chain } = mockSupabase();
    chain.single
      .mockResolvedValueOnce({ data: { id: "m1", status: "active" }, error: null })
      .mockResolvedValueOnce({ data: { code: "FIREFIGHTER", is_active: true }, error: null })
      .mockResolvedValueOnce({ data: null, error: { code: "23503", message: "fk" } });
    await expect(assignMemberFunction("123e4567-e89b-12d3-a456-426614174000", { function_code: "FIREFIGHTER" })).rejects.toMatchObject({ code: "23503" });
  });

  it("assignMemberFunction rejects invalid uuid", async () => {
    mockSupabase();
    await expect(assignMemberFunction("not-uuid", { function_code: "FIREFIGHTER" })).rejects.toBeTruthy();
  });

  it("assignMemberFunction denies without permission", async () => {
    const { chain } = mockSupabase();
    (hasPermissionServer as unknown as { mockResolvedValue: (v: boolean) => void }).mockResolvedValue(false);
    await expect(assignMemberFunction("123e4567-e89b-12d3-a456-426614174000", { function_code: "FIREFIGHTER" })).rejects.toBeTruthy();
    expect(chain.insert).not.toHaveBeenCalled();
    expect(logSecurityEvent).not.toHaveBeenCalled();
  });

  it("assignMemberFunction rejects when member inactive", async () => {
    const { chain } = mockSupabase();
    chain.single.mockResolvedValueOnce({ data: { id: "m1", status: "inactive" }, error: null });
    await expect(assignMemberFunction("123e4567-e89b-12d3-a456-426614174000", { function_code: "FIREFIGHTER" })).rejects.toMatchObject({ status: 409 });
  });

  it("endMemberFunction updates valid_to", async () => {
    const { chain } = mockSupabase();
    chain.single
      .mockResolvedValueOnce({ data: { id: "a1", valid_from: "2024-01-01", valid_to: null }, error: null })
      .mockResolvedValueOnce({ data: { id: "a1", valid_to: "2024-02-02" }, error: null });
    const res = await endMemberFunction("123e4567-e89b-12d3-a456-426614174000", "2024-02-02");
    expect(res).toEqual({ id: "a1", valid_to: "2024-02-02" });
  });
});
