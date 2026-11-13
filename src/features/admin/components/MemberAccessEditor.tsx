"use client";

import {
  useCallback,
  useMemo,
  useState,
  useEffect,
} from "react";
import {
  KeyRound,
  Loader2,
  RefreshCw,
  User,
} from "lucide-react";
import {
  loadMemberAccessDetailAction,
  saveMemberAccessAction,
  generateActivationCodeAction,
  generateMemberAccessCodeForMemberAction,
  revokeActivationCodeAction,
  listActivationCodesForMemberAction,
} from "@/app/(app)/admin/actions";
import type { AdminMemberRow } from "@/lib/admin/admin.service";
import { APP_ROLES, ROLE_LABELS, type AppRole } from "@/lib/auth/roles";
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
  inherited: boolean;
  granted: boolean;
  denied: boolean;
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

interface AccessSnapshot {
  role: AppRole | null;
  grants: string[];
  denials: string[];
}

function createActionFormData(fields: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    formData.set(name, value);
  }
  return formData;
}

function getAccessSnapshot(detail: MemberAccessData): AccessSnapshot {
  return {
    role: detail.role,
    grants: detail.permissions.filter((permission) => permission.granted).map((permission) => permission.code).sort(),
    denials: detail.permissions.filter((permission) => permission.denied).map((permission) => permission.code).sort(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
  const [baseline, setBaseline] = useState<AccessSnapshot | null>(null);
  const [detailPending, setDetailPending] = useState(true);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [savePending, setSavePending] = useState(false);
  const [codePending, setCodePending] = useState(false);
  const [revokePending, setRevokePending] = useState(false);
  const [generatedCode, setGeneratedCode] = useState<{
    code: string;
    expiresAt: string | null;
    kind: "invitation" | "login";
  } | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const result = await loadMemberAccessDetailAction(
        null,
        createActionFormData({ member_id: member.member_id }),
      );
      if (!active) return;
      if (result.ok && result.data) {
        const loadedDetail = result.data as MemberAccessData;
        setDetail(loadedDetail);
        setBaseline(getAccessSnapshot(loadedDetail));
      } else {
        setDetailError(result.message ?? "Prístupy člena sa nepodarilo načítať.");
      }
      setDetailPending(false);
    })();
    return () => {
      active = false;
    };
  }, [member.member_id]);

  const changed = useMemo(() => {
    if (!detail || !baseline) {
      return {
        added: [] as string[],
        removed: [] as string[],
        denied: [] as string[],
        restored: [] as string[],
      };
    }
    const snapshot = getAccessSnapshot(detail);
    return {
      added: snapshot.grants.filter((code) => !baseline.grants.includes(code)),
      removed: baseline.grants.filter((code) => !snapshot.grants.includes(code)),
      denied: snapshot.denials.filter((code) => !baseline.denials.includes(code)),
      restored: baseline.denials.filter((code) => !snapshot.denials.includes(code)),
    };
  }, [baseline, detail]);

  const handleToggle = useCallback((code: string) => {
    setDetail((d) => {
      if (!d) return null;
      const entry = d.permissions.find((p) => p.code === code);
      if (!entry) return d;
      const next = { ...entry };
      const enabled = (entry.inherited || entry.granted) && !entry.denied;
      if (enabled) {
        next.denied = true;
      } else {
        next.denied = false;
        if (!next.inherited && !next.granted) next.granted = true;
      }
      next.source = next.denied
        ? "denied"
        : next.granted
          ? "granted"
          : next.inherited
            ? "inherited"
            : "none";
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
          granted: false,
          denied: false,
          source: p.inherited ? "inherited" : "none",
        })),
      };
    });
  }, [detail]);

  const handleSave = useCallback(async () => {
    if (!detail) return;
    setSavePending(true);
    const grantPermissions = detail.permissions.filter((p) => p.granted).map((p) => p.code);
    const denyPermissions = detail.permissions.filter((p) => p.denied).map((p) => p.code);
    const roleCode = (detail.role ?? APP_ROLES.CLEN) as AppRole;
    const result = await saveMemberAccessAction(null, createActionFormData({
      member_id: detail.member.member_id,
      role_code: roleCode,
      grant_permissions: JSON.stringify(grantPermissions),
      deny_permissions: JSON.stringify(denyPermissions),
    }));
    setSavePending(false);
    if (!result.ok) {
      setSaveMessage({ kind: "error", text: result.message ?? "Uloženie zlyhalo." });
      return;
    }

    setSaveMessage({ kind: "success", text: result.message ?? "Prístupy uložené." });
    const refreshed = await loadMemberAccessDetailAction(
      null,
      createActionFormData({ member_id: detail.member.member_id }),
    );
    if (refreshed.ok && refreshed.data) {
      const loadedDetail = refreshed.data as MemberAccessData;
      setDetail(loadedDetail);
      setBaseline(getAccessSnapshot(loadedDetail));
    } else {
      setSaveMessage({
        kind: "error",
        text: "Prístupy sa uložili, ale ich aktuálny stav sa nepodarilo obnoviť.",
      });
    }
  }, [detail]);

  const handleGenerateCode = useCallback(async () => {
    if (!detail) return;
    setCodePending(true);
    setGeneratedCode(null);
    setCodeError(null);
    const formData = createActionFormData({
      member_id: detail.member.member_id,
      role_code: (detail.role ?? APP_ROLES.CLEN) as AppRole,
    });
    if (detail.member.has_account) {
      const result = await generateMemberAccessCodeForMemberAction(null, formData);
      setCodePending(false);
      if (!result.ok) {
        setCodeError(result.message);
        return;
      }
      if (!isRecord(result.data) || typeof result.data.code !== "string") {
        setCodeError("Kód bol vytvorený, ale nepodarilo sa ho načítať.");
        return;
      }
      setGeneratedCode({ code: result.data.code, expiresAt: null, kind: "login" });
    } else {
      formData.set("permissions", JSON.stringify(detail.permissions.filter((p) => p.granted).map((p) => p.code)));
      formData.set("validity_days", "14");
      formData.set("max_uses", "1");
      const result = await generateActivationCodeAction(null, formData);
      setCodePending(false);
      if (!result.ok) {
        setCodeError(result.message);
        return;
      }
      if (!isRecord(result.data) || typeof result.data.code !== "string") {
        setCodeError("Kód bol vytvorený, ale nepodarilo sa ho načítať.");
        return;
      }
      setGeneratedCode({
        code: result.data.code,
        expiresAt: typeof result.data.expiresAt === "string" ? result.data.expiresAt : null,
        kind: "invitation",
      });
      const refreshedCodes = await listActivationCodesForMemberAction(
        null,
        createActionFormData({ member_id: detail.member.member_id }),
      );
      if (refreshedCodes.ok && refreshedCodes.data) {
        setDetail((current) => current
          ? { ...current, activationCodes: refreshedCodes.data as ActivationCodeRow[] }
          : current);
      } else {
        setCodeError("Kód bol vytvorený, ale zoznam pozvánok sa nepodarilo obnoviť.");
      }
    }
  }, [detail]);

  const handleRevokeCode = useCallback(async () => {
    if (!detail) return;
    if (!window.confirm("Zrušiť aktívny aktivačný kód tohto člena?")) return;
    setRevokePending(true);
    const result = await revokeActivationCodeAction(
      null,
      createActionFormData({ member_id: detail.member.member_id }),
    );
    setRevokePending(false);
    if (!result.ok) {
      setCodeError(result.message);
      return;
    }
    const refreshed = await listActivationCodesForMemberAction(
      null,
      createActionFormData({ member_id: detail.member.member_id }),
    );
    if (refreshed.ok && refreshed.data) {
      setDetail({ ...detail, activationCodes: refreshed.data as ActivationCodeRow[] });
    } else if (!refreshed.ok) {
      setCodeError(refreshed.message);
    }
  }, [detail]);


  const hasChanges = useMemo(() => {
    if (!detail || !baseline) return false;
    const snapshot = getAccessSnapshot(detail);
    return (
      snapshot.role !== baseline.role ||
      snapshot.grants.join(",") !== baseline.grants.join(",") ||
      snapshot.denials.join(",") !== baseline.denials.join(",")
    );
  }, [baseline, detail]);

  const hasAccount = detail?.member.has_account ?? false;
  const hasActiveInvitation = detail?.activationCodes.some(
    (code) => code.status === "active",
  ) ?? false;

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
              <Badge tone={hasAccount ? "green" : hasActiveInvitation ? "blue" : "gray"}>
                {hasAccount
                  ? "Aktívny účet"
                  : hasActiveInvitation
                    ? "Pozvánka čaká na registráciu"
                    : "Bez účtu"}
              </Badge>
              {detail?.member.auth_user_id && (
                <span className="text-xs text-gray-400">auth.id: {detail.member.auth_user_id.slice(0, 8)}…</span>
              )}
            </div>
          </div>
        </div>

        {!detail ? (
          detailPending ? (
            <LoadingState label="Načítavam prístupy člena…" />
          ) : (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#C62828]">
              {detailError ?? "Prístupy člena sa nepodarilo načítať."}
            </p>
          )
        ) : (
        <div className="space-y-4">
        <Card title="Aktuálna rola" subtitle="Vyberte rolu člena.">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {ROLE_OPTIONS.map((opt) => {
              const selected = detail?.role === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() =>
                    setDetail((d) => (d ? { ...d, role: opt.value } : null))
                  }
                  disabled={savePending}
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
                Rola: <span className="font-semibold">{ROLE_LABELS[detail.role ?? APP_ROLES.CLEN]}</span>
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
              {changed.denied.length > 0 && (
                <li className="flex items-center gap-1">
                  <span className="text-[#C62828]">−</span>{" "}
                  Zablokované: {changed.denied.join(", ")}
                </li>
              )}
              {changed.restored.length > 0 && (
                <li className="flex items-center gap-1">
                  <span className="text-green-600">+</span>{" "}
                  Obnovené: {changed.restored.join(", ")}
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
            <KeyRound className="h-4 w-4 mr-2" />
            {hasAccount ? "Generovať prihlasovací kód" : "Generovať aktivačný kód"}
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
        {generatedCode && (
          <Card
            title={generatedCode.kind === "invitation" ? "Registračný kód" : "Prihlasovací kód"}
            subtitle="Tento kód sa z bezpečnostných dôvodov zobrazí iba počas tohto okna."
          >
            <input
              type="text"
              value={generatedCode.code}
              readOnly
              onFocus={(event) => event.currentTarget.select()}
              className="w-full min-h-[44px] rounded-lg border border-gray-300 bg-gray-50 px-3 text-center font-mono text-sm text-[#C62828]"
              aria-label="Vygenerovaný prístupový kód"
            />
            <p className="mt-2 text-xs text-gray-500">
              {generatedCode.kind === "invitation"
                ? generatedCode.expiresAt
                  ? `Jednorazový kód platí do ${new Date(generatedCode.expiresAt).toLocaleString("sk-SK")}. Po registrácii sa účet priradí k tomuto členovi.`
                  : "Jednorazový registračný kód. Po registrácii sa účet priradí k tomuto členovi."
                : "Prihlasovací kód slúži ako heslo účtu. Nový kód nahradí predchádzajúci."}
            </p>
          </Card>
        )}
        {codeError && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#C62828]">
            {codeError}
          </p>
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
                    const effective = Boolean(entry && (entry.inherited || entry.granted) && !entry.denied);
                    return (
                      <button
                        key={perm.code}
                        type="button"
                        onClick={() => handleToggle(perm.code)}
                        disabled={savePending}
                        className="w-full flex items-center justify-between px-3 py-2.5 text-sm transition hover:bg-gray-25 disabled:opacity-60"
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
        )}
      </div>
    </div>
  );
}

