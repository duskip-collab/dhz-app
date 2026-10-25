"use client";

import { useActionState, useState } from "react";
import { X, Share2, SlidersHorizontal, Mail, Phone } from "lucide-react";
import {
  setUserRoleAction,
  toggleUserPermissionAction,
  generateMemberAccessCodeAction,
} from "@/app/(app)/admin/actions";
import type { AdminMemberRow } from "@/lib/admin/admin.service";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

const PERMISSION_LABELS: Record<string, string> = {
  "members.view": "Členovia – zobraziť",
  "members.create": "Členovia – vytvoriť",
  "members.edit": "Členovia – upraviť",
  "members.delete": "Členovia – zmazať",
  "inventory.view": "Inventár – zobraziť",
  "inventory.edit": "Inventár – upraviť",
  "inventory.manage": "Inventár – spravovať",
  "documents.view": "Dokumenty – zobraziť",
  "documents.upload": "Dokumenty – nahrať",
  "communication.view": "Komunikácia – zobraziť",
  "communication.send": "Komunikácia – odoslať",
  "admin.users": "Admin – používatelia",
  "admin.permissions": "Admin – oprávnenia",
  "dashboard.view": "Dashboard",
  "reports.view": "Reporty – zobraziť",
};

export function AdminMemberManager({
  member,
  onClose,
}: {
  member: AdminMemberRow & { roles: string[]; permissions: string[] };
  onClose: () => void;
}) {
  const [roleState, roleAction, rolePending] = useActionState(setUserRoleAction, null);
  const [permState, permAction, permPending] = useActionState(toggleUserPermissionAction, null);
  const [codeState, codeAction, codePending] = useActionState(generateMemberAccessCodeAction, null);
  const [showCode, setShowCode] = useState<string | null>(null);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Správa člena"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 py-10"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">
            Správa: {member.first_name} {member.last_name}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1 text-sm text-gray-500 hover:bg-gray-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Členské údaje */}
          <div className="rounded-xl border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Členské údaje</h3>
            <dl className="grid gap-2 text-sm">
              <div className="flex items-start gap-3">
                <dt className="text-gray-500 font-medium">Meno</dt>
                <dd className="text-gray-900">
                  {member.first_name} {member.last_name}
                </dd>
              </div>
              <div className="flex items-start gap-3">
                <dt className="text-gray-500 font-medium">Číslo člena</dt>
                <dd className="text-gray-900">{member.member_number}</dd>
              </div>
              <div className="flex items-start gap-3">
                <dt className="text-gray-500 font-medium">Pozícia</dt>
                <dd className="text-gray-900">{member.position ?? "—"}</dd>
              </div>
              <div className="flex items-start gap-3">
                <dt className="text-gray-500 font-medium">E-mail</dt>
                <dd className="text-gray-900">{member.email ?? "—"}</dd>
              </div>
              <div className="flex items-start gap-3">
                <dt className="text-gray-500 font-medium">Stav</dt>
                <dd className="text-gray-900">{member.status}</dd>
              </div>
              <div className="flex items-start gap-3">
                <dt className="text-gray-500 font-medium">Účet</dt>
                <dd className="text-gray-900">
                  {member.has_account ? "Aktívny" : "Nemá účet"}
                </dd>
              </div>
              <div className="flex items-start gap-3">
                <dt className="text-gray-500 font-medium">Prístupový kód</dt>
                <dd className="text-gray-900">
                  {member.has_access_code ? "Nastavený" : "Nie je nastavený"}
                </dd>
              </div>
            </dl>
          </div>

          {/* Rola */}
          <div className="rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-3">
              <SlidersHorizontal className="h-4 w-4 text-gray-400" />
              <h3 className="text-sm font-semibold text-gray-900">Rola</h3>
            </div>
            <form action={roleAction} className="space-y-2">
              <input type="hidden" name="user_id" value={member.auth_user_id ?? ""} />
              <select
                name="role_code"
                defaultValue={member.roles[0] ?? ""}
                className="w-full min-h-[44px] rounded-lg border border-gray-300 px-3 text-sm focus:ring-2 focus:ring-[#C62828] focus:border-transparent"
              >
                <option value="">— bez role —</option>
                {Object.entries(ROLE_LABELS).map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={rolePending}
                className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-lg bg-[#C62828] px-4 text-xs font-semibold text-white transition hover:bg-[#8E0000] disabled:opacity-50"
              >
                {rolePending ? "Ukladám…" : "Uložiť rolu"}
              </button>
            </form>
            {roleState?.message && !roleState?.ok && (
              <p className="mt-2 text-xs text-[#C62828]">{roleState.message}</p>
            )}
            {roleState?.ok && (
              <p className="mt-2 text-xs text-green-700">Rola bola uložená.</p>
            )}
          </div>

          {/* Oprávnenia */}
          <div className="rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Mail className="h-4 w-4 text-gray-400" />
              <h3 className="text-sm font-semibold text-gray-900">Oprávnenia</h3>
            </div>
            <div className="space-y-1 max-h-48 overflow-y-auto pb-2">
              {[
                "members.view",
                "members.create",
                "members.edit",
                "members.delete",
                "inventory.view",
                "inventory.edit",
                "inventory.manage",
                "documents.view",
                "documents.upload",
                "communication.view",
                "communication.send",
                "admin.users",
                "admin.permissions",
                "dashboard.view",
                "reports.view",
              ].map((code) => {
                const enabled = member.permissions.includes(code);
                return (
                  <form
                    key={code}
                    action={permAction}
                    className="flex items-center justify-between gap-2 p-1.5 rounded-lg hover:bg-gray-50 transition"
                  >
                    <input type="hidden" name="user_id" value={member.auth_user_id ?? ""} />
                    <input type="hidden" name="permission_code" value={code} />
                    <input type="hidden" name="enabled" value={String(!enabled)} />
                    <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 select-none">
                      <span className="text-gray-600">{PERMISSION_LABELS[code]}</span>
                    </label>
                    <button
                      type="submit"
                      className={`rounded-md px-2 text-xs font-medium transition ${
                        enabled
                          ? "bg-[#C62828] text-white"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      {enabled ? "Zrušiť" : "Pridať"}
                    </button>
                  </form>
                );
              })}
            </div>
            {permState?.message && !permState?.ok && (
              <p className="mt-2 text-xs text-[#C62828]">{permState.message}</p>
            )}
            {permState?.ok && (
              <p className="mt-2 text-xs text-green-700">Oprávnenie aktualizované.</p>
            )}
          </div>

          {/* Prístupový kód */}
          <div className="rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Phone className="h-4 w-4 text-gray-400" />
              <h3 className="text-sm font-semibold text-gray-900">Prístupový kód</h3>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              Kód slúži ako heslo pre prihlásenie člena bez e-mailu v profile.
            </p>

            {showCode ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={showCode}
                    readOnly
                    className="flex-1 min-h-[44px] rounded-lg border border-gray-300 bg-gray-50 px-3 text-sm font-mono text-center text-[#C62828]"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const text = `DHZ Digital OS – Váš prístupový kód: ${showCode}`;
                      try {
                        if (navigator.share) {
                          navigator.share({
                            title: "DHZ Digital OS – Prístupový kód",
                            text,
                            url: window.location.origin,
                          });
                        } else {
                          const waUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
                          window.open(waUrl, "_blank");
                        }
                      } catch {
                        const waUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
                        window.open(waUrl, "_blank");
                      }
                    }}
                    className="flex min-h-[44px] items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 transition hover:bg-gray-50"
                  >
                    <Share2 className="h-4 w-4" /> Zdieľať
                  </button>
                </div>
                <p className="text-xs text-gray-400">
                  Použite WhatsApp, Messenger alebo systémové zdieľanie.
                </p>
              </div>
            ) : null}

            {member.has_access_code ? (
              <p className="text-xs text-green-700">Člen má nastavený prístupový kód.</p>
            ) : (
              <p className="text-xs text-gray-400">Člen zatiaľ nemá prístupový kód.</p>
            )}

            <form action={codeAction} className="mt-3">
              <input type="hidden" name="user_id" value={member.auth_user_id ?? ""} />
              <button
                type="submit"
                disabled={codePending}
                className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg px-4 text-xs font-semibold transition ${
                  member.has_access_code
                    ? "bg-gray-200 text-gray-600"
                    : "bg-[#C62828] text-white hover:bg-[#8E0000]"
                } disabled:opacity-50`}
              >
                {codePending
                  ? "Generujem…"
                  : member.has_access_code
                    ? "Kód existuje"
                    : "Vygenerovať kód"}
              </button>
            </form>

            {codeState?.message && !codeState?.ok && (
              <p className="mt-2 text-xs text-[#C62828]">{codeState.message}</p>
            )}
            {codeState?.ok && !showCode && (
              <p className="mt-2 text-xs text-green-700 cursor-pointer underline underline-offset-4 hover:text-green-600" onClick={() => {
                const match = codeState?.message?.match(/([A-Z0-9]{6,})/);
                if (match) setShowCode(match[1]);
              }}>
                Kód vygenerovaný – kliknite pre zobrazenie a zdieľanie
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}