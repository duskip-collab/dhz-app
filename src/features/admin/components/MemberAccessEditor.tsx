"use client";

import {
  useCallback,
  useMemo,
  useState,
  useActionState,
  useEffect,
} from "react";
import {
  ChevronRight,
  KeyRound,
  Loader2,
  RefreshCw,
  ShieldAlert,
  User,
} from "lucide-react";
import {
  loadMemberAccessDetailAction,
  saveMemberAccessAction,
  generateActivationCodeAction,
  revokeActivationCodeAction,
  listActivationCodesForMemberAction,
} from "@/app/(app)/admin/actions";
import type { AdminMemberRow } from "@/lib/admin/admin.service";
import { APP_ROLES, ROLE_LABELS, type AppRole, isAppRole } from "@/lib/auth/roles";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState, LoadingState } from "@/components/ui/EmptyState";

type PermissionSource = "inherited" | "granted" | "denied" | "none";

interface PermissionEntry {
  code: string;
  name: string;
  description: string;
  source: PermissionSource;
}

interface ActivationCodeRow {
  id: string;
  role: AppRole;
  status: string;
  use_count: number;
  max_uses: number;
  expires_at: string;
  created_at: string;
}

interface MemberAccessData {
  member: AdminMemberRow;
  role: AppRole | null;
  permissions: PermissionEntry[];
  activationCodes: ActivationCodeRow[];
}

const MODULES: Array<{
  module: string;
  label: string;
  permissions: Array<{ code: string; name: string; description: string }>;
}> = [
  { module: "dashboard", label: "Dashboard", permissions: [{ code: "dashboard.view", name: "Zobrazenie", description: "Zobraziť rozhľad dashboardu." }] },
  { module: "members", label: "Členovia", permissions: [
    { code: "members.view", name: "Zobrazenie", description: "Zobraziť zoznam a detail člena." },
    { code: "members.create", name: "Vytvorenie", description: "Vytvoriť nového člena." },
    { code: "members.edit", name: "Úprava", description: "Upraviť existujúceho člena." },
  ] },
  { module: "training", label: "Tréningy", permissions: [
    { code: "training.view", name: "Zobrazenie", description: "Zobraziť tréningy." },
    { code: "training.create", name: "Vytvorenie", description: "Vytvoriť tréning." },
    { code: "training.edit", name: "Úprava", description: "Upraviť tréning." },
  ] },
  { module: "competition", label: "Súťaže", permissions: [
    { code: "competition.view", name: "Zobrazenie", description: "Zobraziť súťaže." },
    { code: "competition.create", name: "Vytvorenie", description: "Vytvoriť súťaž." },
    { code: "competition.edit", name: "Úprava", description: "Upraviť súťaž." },
  ] },
  { module: "calendar", label: "Kalendár", permissions: [
    { code: "calendar.view", name: "Zobrazenie", description: "Zobraziť kalendár." },
    { code: "calendar.manage", name: "Správa", description: "Spravovať kalendár." },
  ] },
  { module: "inventory", label: "Inventár", permissions: [
    { code: "inventory.view", name: "Zobrazenie", description: "Zobraziť inventár." },
    { code: "inventory.create", name: "Vytvorenie", description: "Vytvoriť položku inventára." },
    { code: "inventory.edit", name: "Úprava", description: "Upraviť položku inventára." },
  ] },
  { module: "vehicle", label: "Vozidlá", permissions: [
    { code: "vehicle.view", name: "Zobrazenie", description: "Zobraziť vozidlá." },
    { code: "vehicle.manage", name: "Správa", description: "Spravovať vozidlá." },
  ] },
  { module: "fault", label: "Poruchy", permissions: [
    { code: "fault.create", name: "Nahlásenie", description: "Nahlásiť poruchu." },
    { code: "fault.manage", name: "Správa", description: "Spravovať poruchy." },
  ] },
  { module: "finance", label: "Financie", permissions: [
    { code: "finance.view", name: "Zobrazenie", description: "Zobraziť finančné údaje." },
    { code: "finance.create", name: "Vytvorenie", description: "Vytvoriť transakciu." },
    { code: "finance.edit", name: "Úprava", description: "Upraviť transakciu." },
    { code: "finance.export", name: "Export", description: "Exportovať údaje." },
    { code: "finance.manage_access", name: "Prístupy", description: "Spravovať prístupy k financiám." },
  ] },
  { module: "documents", label: "Dokumenty", permissions: [
    { code: "documents.view", name: "Zobrazenie", description: "Zobraziť dokumenty." },
    { code: "documents.upload", name: "Nahrávanie", description: "Nahrať dokument." },
  ] },
  { module: "reports", label: "Reporty", permissions: [
    { code: "reports.view", name: "Zobrazenie", description: "Zobraziť reporty." },
    { code: "reports.export", name: "Export", description: "Exportovať reporty." },
  ] },
  { module: "communication", label: "Komunikácia", permissions: [
    { code: "communication.view", name: "Zobrazenie", description: "Zobraziť komunikáciu." },
    { code: "communication.send", name: "Odoslanie", description: "Odoslať správu." },
  ] },
  { module: "admin", label: "Administrácia", permissions: [
    { code: "admin.users", name: "Používatelia", description: "Spravovať používateľov." },
    { code: "admin.permissions", name: "Oprávnenia", description: "Spravovať oprávnenia." },
    { code: "admin.audit", name: "Audit", description: "Zobraziť auditný log." },
  ] },
];

const SOURCE_LABELS: Record<PermissionSource, { label: string; tone: string }> = {
  inherited: { label: "Z roly", tone: "blue" },
  granted: { label: "Individuálne pridané", tone: "green" },
  denied: { label: "Individuálne odobrané", tone: "red" },
  none: { label: "Nie je priradené", tone: "gray" },
};

const ROLE_OPTIONS: Array<{ value: AppRole; label: string }> = Object.values(APP_ROLES).map((r) => ({
  value: r as AppRole,
  label: ROLE_LABELS[r as AppRole],
}));

function isAdminRole(role: AppRole | null | undefined): role is AppRole {
  return role === APP_ROLES.ADMIN;
}

export function MemberAccessEditor({
  member,
  onClose,
}: {
  member: AdminMemberRow & { roles: string[]; permissions: string[] };
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<MemberAccessData | null>(null);
  const [detailPending, setDetailPending] = useState(false);
  const [savePending, setSavePending] = useState(false);
  const [codePending, setCodePending] = useState(false);
  const [revokePending, setRevokePending] = useState(false);
  const [showRawCode, setShowRawCode] = useState<string | null>(null);
  const [generatedCode, setGeneratedCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [saveMessage, setSaveMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const [detailState, detailAction] = useActionState(loadMemberAccessDetailAction, null);
  const [saveState, saveAction] = useActionState(saveMemberAccessAction, null);
  const [codeState, codeAction] = useActionState(generateActivationCodeAction, null);
  const [revokeState, revokeAction] = useActionState(revokeActivationCodeAction, null);
  const [codesState, codesAction] = useActionState(listActivationCodesForMemberAction, null);

  useEffect(() => {
    void detailAction(Object.assign(new FormData(), { member_id: member.member_id }));
  }, [member.member_id, detailAction]);

  useEffect(() => {
    if (detailState?.ok && detailState.data) {
      setDetail(detailState.data as MemberAccessData);
      setDetailPending(false);
    } else if (detailState?.ok === false) {
      setDetailPending(false);
    }
  }, [detailState]);

  useEffect(() => {
    if (saveState?.ok) {
      setSavePending(false);
      setSaveMessage({ kind: "success", text: saveState.message ?? "Prístupy uložené." });
      setTimeout(() => setSaveMessage(null), 4000);
    } else if (saveState?.ok === false) {
      setSavePending(false);
      setSaveMessage({ kind: "error", text: saveState.message ?? "Uloženie zlyhalo." });
    }
  }, [saveState]);

  useEffect(() => {
    if (codeState?.ok && codeState.data) {
      setCodePending(false);
      setGeneratedCode({
        code: (codeState.data as { code?: string }).code ?? "",
        expiresAt: (codeState.data as { expiresAt?: string }).expiresAt ?? "",
      });
      setShowRawCode((codeState.data as { code?: string }).code ?? null);
    } else if (codeState?.ok === false) {
      setCodePending(false);
    }
  }, [codeState]);

  useEffect(() => {
    if (codesState?.ok && codesState.data) {
      const d = detail;
      if (d) setDetail({ ...d, activationCodes: codesState.data as ActivationCodeRow[] });
    }
  }, [codesState, detail]);

  const current = useMemo(() => {
    if (!detail) return null;
    return { role: detail.role };
  }, [detail]);

  const changed = useMemo(() => {
    if (!detail) return { added: [] as string[], removed: [] as string[] };
    return {
      added: detail.permissions.filter((p) => p.source === "granted").map((p) => p.code),
      removed: detail.permissions.filter((p) => p.source === "denied").map((p) => p.code),
    };
  }, [detail]);

  const handleToggle = useCallback((code: string) => {
    setDetail((d) => {
      if (!d) return null;
      const entry = d.permissions.find((p) => p.code === code);
      if (!entry) return d;
      const next: PermissionEntry = { ...entry };
      switch (entry.source) {
        case "none":
          next.source = "granted";
          break;
        case "granted":
          next.source = "denied";
          break;
        case "denied":
          next.source = "none";
          break;
        case "inherited":
          next.source = "granted";
          break;
      }
      return { ...d, permissions: d.permissions.map((p) => (p.code === code ? next : p)) };
    });
  }, []);

  const handleResetDefaults = useCallback(() => {
    if (!detail) return;
    if (!window.confirm("Obnoviť predvolené oprávnenie roly? Individuálne pridané aj odobrané sa zrušia.")) return;
    setDetail((d) => {
      if (!d) return null;
      return {
        ...d,
        permissions: d.permissions.map((p) => ({
          ...p,
          source: p.source === "inherited" ? "inherited" : "none",
        })),
      };
    });
  }, [detail]);

  const handleSave = useCallback(async () => {
    if (!detail) return;
    setSavePending(true);
    const grantPermissions = detail.permissions.filter((p) => p.source === "granted").map((p) => p.code);
    const denyPermissions = detail.permissions.filter((p) => p.source === "denied").map((p) => p.code);
    const roleCode = (detail.role ?? APP_ROLES.CLEN) as AppRole;
    await saveAction(Object.assign(new FormData(), {
      member_id: detail.member.member_id,
      role_code: roleCode,
      grant_permissions: JSON.stringify(grantPermissions),
      deny_permissions: JSON.stringify(denyPermissions),
    }));
  }, [detail, saveAction]);

  const handleGenerateCode = useCallback(async () => {
    if (!detail) return;
    setCodePending(true);
    await codeAction(Object.assign(new FormData(), {
      member_id: detail.member.member_id,
      role_code: (detail.role ?? APP_ROLES.CLEN) as AppRole,
      permissions: JSON.stringify(detail.permissions.filter((p) => p.source === "granted").map((p) => p.code)),
      validity_days: "14",
      max_uses: "1",
    }));
  }, [detail, codeAction]);

  const handleRevokeCode = useCallback(async () => {
    if (!detail) return;
    if (!window.confirm("Zrušiť aktívny aktivačný kód tohto člena?")) return;
    setRevokePending(true);
    await revokeAction(Object.assign(new FormData(), { member_id: detail.member.member_id }));
    setRevokePending(false);
    void codesAction(Object.assign(new FormData(), { member_id: detail.member.member_id }));
  }, [detail, revokeAction, codesAction]);


  const hasChanges = useMemo(() => {
    if (!detail) return false;
    return (detail.role !== (current?.role ?? null)) || changed.added.length > 0 || changed.removed.length > 0;
  }, [detail, current, changed]);

  const hasAccount = detail?.member.has_account ?? false;

  const memberPhoto = (
    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#C62828]/10 text-[#C62828]">
      <User className="h-6 w-6" />
    </div>
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Prístupy člena"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 py-10"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-3xl rounded-2xl bg-white p-6 shadow-xl border border-gray-100">
        <div className="flex flex-col md:flex-row md:items-start gap-6 mb-6">
          <div className="shrink-0">{memberPhoto}</div>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold text-gray-900">
              {detail?.member.first_name} {detail?.member.last_name}
            </h2>
            <p className="text-sm text-gray-500 truncate">
              {detail?.member.member_number} ·
              {detail?.member.position ?? "—"} ·
              {detail?.member.email ?? "—"}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <Badge tone={hasAccount ? "green" : "gray"}>
                {hasAccount ? "Aktívny účet" : "Bez účtu"}
              </Badge>
              {detail?.member.auth_user_id && (
                <span className="text-xs text-gray-400">auth.id: {detail.member.auth_user_id.slice(0, 8)}…</span>
              )}
            </div>
          </div>
        </div>

        <Card title="Aktuálna rola" subtitle="Vyberte rolu člena.">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {ROLE_OPTIONS.map((opt) => {
              const selected = detail?.role === opt.value;
              const isAdmin = isAdminRole(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() =>
                    setDetail((d) => (d ? { ...d, role: opt.value } : null))
                  }
                  disabled={isAdmin && !detail?.member.auth_user_id}
                  className={`min-h-[44px] rounded-lg border px-3 py-2 text-sm font-medium transition ${
                    selected
                      ? "bg-[#C62828] border-[#C62828] text-white"
                      : "bg-white border-gray-200 text-gray-700 hover:border-gray-300"
                  }`}
                >
                  {opt.label}
                  {selected && <span className="ml-2 text-[10px] opacity-80">vybraná</span>}
                </button>
              );
            })}
          </div>
          {isAdminRole(detail?.role ?? null) && (
            <p className="mt-1 text-xs text-[#C62828]">
              ⚠ ADMIN je osobitne chránená rola – pridanie vyžaduje rolu ADMIN.
            </p>
          )}
        </Card>


{hasChanges && (
          <Card
            title="Súhrn zmien"
            subtitle="Pred uložením skontrolujte zmeny."
            className="border-yellow-100 bg-yellow-50/50"
          >
            <ul className="text-sm text-gray-700 space-y-1">
              <li>
                Rola: <span className="font-semibold">{ROLE_LABELS[detail!.role!]}</span>
              </li>
              {changed.added.length > 0 && (
                <li className="flex items-center gap-1">
                  <span className="text-green-600">+</span>{" "}
                  Pridané: {changed.added.join(", ")}
                </li>
              )}
              {changed.removed.length > 0 && (
                <li className="flex items-center gap-1">
                  <span className="text-[#C62828]">−</span>{" "}
                  Odobrané: {changed.removed.join(", ")}
                </li>
              )}
            </ul>
          </Card>
        )}

        <div className="mt-4 flex items-center justify-between gap-2">
          <Button variant="secondary" onClick={handleResetDefaults} disabled={savePending || !detail}>
            <RefreshCw className="h-4 w-4 mr-2" /> Obnoviť predvolené
          </Button>
          <Button
            variant="secondary"
            onClick={handleGenerateCode}
            disabled={savePending || codePending || !detail}
          >
            <KeyRound className="h-4 w-4 mr-2" /> Generovať aktivačný kód
          </Button>
          <Button
            variant={hasChanges ? "primary" : "secondary"}
            onClick={handleSave}
            disabled={!hasChanges || savePending || !detail}
          >
            <Loader2 className={savePending ? "animate-spin h-4 w-4 mr-2" : "hidden"} />
            Uložiť zmeny
          </Button>
        </div>

        {saveMessage && (
          <div className={`mt-3 rounded-lg border px-3 py-2 text-xs ${
            saveMessage.kind === "success"
              ? "border-green-200 bg-green-50 text-[#2E7D32]"
              : "border-red-200 bg-red-50 text-[#C62828]"
          }`}>
            {saveMessage.text}
          </div>
        )}
        <Card
          title="Oprávnenia podľa modulov"
          subtitle="Modré = z roly, zelené = individuálne pridané, červené = individuálne odobrané."
        >
          <div className="space-y-3">
            {MODULES.map((mod) => (
              <div key={mod.module} className="border border-gray-100 rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600 border-b border-gray-100 uppercase tracking-wide">
                  {mod.label}
                </div>
                <div className="divide-y divide-gray-50">
                  {mod.permissions.map((perm) => {
                    const entry = detail?.permissions.find((p) => p.code === perm.code);
                    const source = entry?.source ?? "none";
                    const info = SOURCE_LABELS[source];
                    const effective = source === "granted" || source === "inherited";
                    return (
                      <button
                        key={perm.code}
                        type="button"
                        onClick={() => handleToggle(perm.code)}
                        className="w-full flex items-center justify-between px-3 py-2.5 text-sm transition hover:bg-gray-25"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <input
                            type="checkbox"
                            checked={effective}
                            readOnly
                            className="rounded border-gray-300 text-[#C62828] focus:ring-[#C62828]"
                          />
                          <div className="min-w-0">
                            <div className="font-medium text-gray-900 truncate">{perm.name}</div>
                            <div className="text-[11px] text-gray-500 truncate">{perm.description}</div>
                          </div>
                        </div>
                        <Badge tone={info.tone}>
                          {info.label}
                        </Badge>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Aktivačné kódy" subtitle="Prehľad aktívnych a použitých kódov tohto člena." className="mt-6">
          <div className="space-y-2">
            {detail?.activationCodes.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                      <th className="px-3 py-2 font-semibold">Rola</th>
                      <th className="px-3 py-2 font-semibold text-right">Stav</th>
                      <th className="px-3 py-2 font-semibold text-right">Použití</th>
                      <th className="px-3 py-2 font-semibold text-right">Expirácia</th>
                      <th className="px-3 py-2 font-semibold text-right">Vytvorené</th>
                      <th className="px-3 py-2 font-semibold text-right">Akcia</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {detail.activationCodes.map((c) => {
                      const active = c.status === "active";
                      return (
                        <tr key={c.id} className="hover:bg-gray-25">
                          <td className="px-3 py-2">{ROLE_LABELS[c.role]}</td>
                          <td className="px-3 py-2 text-right">
                            <Badge
                              tone={
                                active
                                  ? "green"
                                  : c.status === "consumed"
                                  ? "blue"
                                  : c.status === "revoked"
                                  ? "red"
                                  : "yellow"
                              }
                            >
                              {c.status}
                            </Badge>
                          </td>
                          <td className="px-3 py-2 text-right">{c.use_count} / {c.max_uses}</td>
                          <td className="px-3 py-2 text-right text-[11px] text-gray-500">{new Date(c.expires_at).toLocaleDateString("sk-SK")}</td>
                          <td className="px-3 py-2 text-right text-[11px] text-gray-500">{new Date(c.created_at).toLocaleDateString("sk-SK")}</td>
                          <td className="px-3 py-2 text-right">
                            {active && !codePending && !revokePending ? (
                              <Button variant="danger" size="sm" onClick={handleRevokeCode} disabled={revokePending}>
                                Zrušiť
                              </Button>
                            ) : (
                              <span className="text-[10px] text-gray-400">
                                {c.status === "consumed" ? "použité" : c.status === "expired" ? "expirované" : "zrušené"}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="Žiadne aktivačné kódy" description="Vygenerujte kód pre prístup člena." />
            )}
          </div>
        </Card>

        <div className="mt-4 flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            Zavrieť
          </Button>
        </div>
      </div>
    </div>
  );
}

