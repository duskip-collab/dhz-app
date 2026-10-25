"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import {
  Ban,
  Check,
  Copy,
  KeyRound,
  Loader2,
  MessageCircle,
  Plus,
  Share2,
  X,
} from "lucide-react";
import {
  createInvitationAction,
  revokeInvitationAction,
  type InvitationActionState,
} from "@/app/(app)/admin/invitations/actions";
import { APP_ROLES, ROLE_LABELS, type AppRole } from "@/lib/auth/roles";
import {
  INVITATION_STATUS_LABELS,
  type Invitation,
  type InvitationStatus,
} from "@/lib/auth/invitations.types";
import {
  buildInvitationMessage,
  buildShareLinks,
  canUseMessenger,
  canUseSystemShare,
  getRegistrationUrlInBrowser,
} from "@/lib/auth/invitations.share";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";

const STATUS_TONES: Record<InvitationStatus, "green" | "blue" | "red" | "yellow"> = {
  active: "green",
  consumed: "blue",
  revoked: "red",
  expired: "yellow",
};

const VALIDITY_OPTIONS = [7, 14, 30, 60];

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("sk-SK", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // pokračujeme na fallback
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export function InvitationManager({
  invitations,
  registrationUrl: registrationUrlProp = null,
}: {
  invitations: Invitation[];
  /** Absolútna URL aplikácie vypočítaná na serveri (Vercel). */
  registrationUrl?: string | null;
}) {
  const [createState, createAction, createPending] = useActionState<
    InvitationActionState | null,
    FormData
  >(createInvitationAction, null);
  const [revokeState, revokeAction, revokePending] = useActionState<
    InvitationActionState | null,
    FormData
  >(revokeInvitationAction, null);

  const [createFormOpen, setCreateFormOpen] = useState(false);
  // ID zrušenej pozvánky (nie raw kód!) – po ňom sa dialóg už neotvorí.
  const [dismissedInvitationId, setDismissedInvitationId] = useState<string | null>(null);
  const [copied, setCopied] = useState<"code" | "text" | null>(null);
  const [shareNote, setShareNote] = useState<string | null>(null);
  // Krátko žijúci toast (auto-hide) – vizuálne potvrdenie skopírovania.
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Raw kód žije IBA v stave server action a IBA kým je dialóg otvorený.
  const createdCode = createState?.ok ? (createState.code ?? null) : null;
  const createdInvitation = createState?.ok ? (createState.invitation ?? null) : null;

  // Dialóg s kódom je otvorený, kým používateľ nezatvorí – zatvorením sa
  // kód zahodí zo stavu (v DB je iba hash).
  const showCode =
    Boolean(createdCode) && dismissedInvitationId !== (createdInvitation?.id ?? null);
  const showCreate = createFormOpen && !createdCode;

  // Registračná URL: priorita = server-computed (Vercel) → NEXT_PUBLIC_APP_URL
  // → window.location.origin (fallback pri lokálnom behu).
  const registrationUrl = useMemo(() => {
    if (registrationUrlProp) return registrationUrlProp;
    if (typeof window === "undefined") return null;
    return getRegistrationUrlInBrowser();
  }, [registrationUrlProp]);

  const message = useMemo(() => {
    if (!createdCode || !createdInvitation) return null;
    return buildInvitationMessage({
      code: createdCode,
      role: createdInvitation.role,
      expiresAt: createdInvitation.expires_at,
      registrationUrl,
    });
  }, [createdCode, createdInvitation, registrationUrl]);

  const links = useMemo(() => {
    if (!message) return null;
    return buildShareLinks(message);
  }, [message]);

  const messengerAvailable = canUseMessenger();
  const systemShareAvailable = canUseSystemShare();

  // Čistenie toast timera pri unmount (aby sa timeout nevykonal po zrušení).
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  function showToast(messageText: string, tone: "success" | "error" = "success") {
    setToast({ message: messageText, tone });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 4000);
  }

  function closeCodeDialog() {
    // Kód sa odstráni zo stavu – v DB je iba hash.
    // Zahadzujeme IBA ID pozvánky (nie raw kód).
    setDismissedInvitationId(createdInvitation?.id ?? null);
    setCopied(null);
    setShareNote(null);
  }

  async function handleCopyCode() {
    if (!createdCode) return;
    const ok = await copyToClipboard(createdCode);
    setCopied(ok ? "code" : null);
    setShareNote(
      ok ? "Kód bol skopírovaný do schránky." : "Kopírovanie zlyhalo – kód skopírujte ručne.",
    );
    showToast(
      ok ? "Kód skopírovaný do schránky." : "Kopírovanie kódu zlyhalo.",
      ok ? "success" : "error",
    );
  }

  async function handleCopyText() {
    if (!message) return;
    const ok = await copyToClipboard(message);
    setCopied(ok ? "text" : null);
    setShareNote(
      ok ? "Pozývací text bol skopírovaný do schránky." : "Kopírovanie zlyhalo – text skopírujte ručne.",
    );
    showToast(
      ok ? "Pozývací text skopírovaný do schránky." : "Kopírovanie textu zlyhalo.",
      ok ? "success" : "error",
    );
  }

  /**
   * WhatsApp: najprv skopírujeme kompletný pozývací text do schránky (aby bol
   * dostupný aj vtedy, keď sa deep-link neotvorí správne), potom otvoríme
   * `https://wa.me/?text=...` s predvyplnenou správou.
   */
  async function handleWhatsApp() {
    if (!message || !links) return;
    const shareWindow = window.open("about:blank", "_blank");
    if (shareWindow) shareWindow.opener = null;

    const copiedOk = await copyToClipboard(message);
    setCopied(copiedOk ? "text" : null);
    if (shareWindow && !shareWindow.closed) {
      shareWindow.location.replace(links.whatsapp);
      showToast(
        copiedOk
          ? "Pozývací text skopírovaný – otváram WhatsApp."
          : "Kopírovanie zlyhalo, otváram WhatsApp bez schránky.",
        copiedOk ? "success" : "error",
      );
      return;
    }

    showToast(
      copiedOk
        ? "Pozývací text skopírovaný, ale prehliadač zablokoval otvorenie WhatsApp."
        : "Kopírovanie zlyhalo a prehliadač zablokoval otvorenie WhatsApp.",
      "error",
    );
  }

  /**
   * Messenger: Messenger nepredvyplňuje text bez schválenej Meta App +
   * redirect_uri (Send Dialog). Preto text najprv skopírujeme do schránky
   * a otvoríme Messenger, kde ho používateľ vloží cez Ctrl+V.
   */
  async function handleMessenger() {
    if (!message || !links?.messenger) return;
    const shareWindow = window.open("about:blank", "_blank");
    if (shareWindow) shareWindow.opener = null;

    const copiedOk = await copyToClipboard(message);
    setCopied(copiedOk ? "text" : null);
    if (shareWindow && !shareWindow.closed) {
      shareWindow.location.replace(links.messenger);
      showToast(
        copiedOk
          ? "Pozývací text skopírovaný – otváram Messenger. Vložte text cez Ctrl+V."
          : "Kopírovanie zlyhalo – text vložte do Messengeru ručne.",
        copiedOk ? "success" : "error",
      );
      return;
    }

    showToast(
      copiedOk
        ? "Pozývací text skopírovaný, ale prehliadač zablokoval otvorenie Messengeru."
        : "Kopírovanie zlyhalo a prehliadač zablokoval otvorenie Messengeru.",
      "error",
    );
  }

  function handleSystemShare() {
    if (!message) return;
    try {
      void navigator.share({
        title: "DHZ Digital OS – pozvanie",
        text: message,
      });
      setShareNote(
        "Systémové zdieľanie je otvorené. Otvorenie dialógu neznamená, že správa bola odoslaná.",
      );
    } catch {
      setShareNote("Zdieľanie bolo zrušené.");
    }
  }


  return (
    <div className="space-y-6">
      <Card
        title="Pozývacie kódy"
        subtitle="Jednorazové kódy s rolou a obmedzenou platnosťou. Raw kód sa zobrazí iba raz pri vytvorení."
      >
        {invitations.length === 0 ? (
          <EmptyState
            title="Zatiaľ žiadne pozvánky"
            description="Vytvorte prvú pozvánku a pošlite kód novému členovi."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                  <th scope="col" className="px-4 py-3 font-semibold">Rola</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Stav</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Použitia</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Platnosť do</th>
                  <th scope="col" className="px-4 py-3 font-semibold hidden md:table-cell">E-mail</th>
                  <th scope="col" className="px-4 py-3 font-semibold hidden lg:table-cell">Vytvorené</th>
                  <th scope="col" className="px-4 py-3 font-semibold text-right">Akcie</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {invitations.map((inv) => (
                  <tr key={inv.id} className="hover:bg-gray-50/60 transition">
                    <td className="px-4 py-3 font-semibold text-gray-900">
                      {ROLE_LABELS[inv.role] ?? inv.role}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={STATUS_TONES[inv.status]}>
                        {INVITATION_STATUS_LABELS[inv.status] ?? inv.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {inv.use_count} / {inv.max_uses}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{formatDateTime(inv.expires_at)}</td>
                    <td className="px-4 py-3 text-gray-600 hidden md:table-cell">
                      {inv.target_email ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-600 hidden lg:table-cell">
                      {formatDateTime(inv.created_at)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {inv.status === "active" ? (
                        <form action={revokeAction} className="inline-block">
                          <input type="hidden" name="invitation_id" value={inv.id} />
                          <button
                            type="submit"
                            disabled={revokePending}
                            className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 text-xs font-semibold text-[#C62828] transition hover:bg-red-100 disabled:opacity-50"
                          >
                            <Ban className="h-3.5 w-3.5" />
                            Zrušiť
                          </button>
                        </form>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {revokeState?.message ? (
          <p
            role="status"
            className={`mt-3 rounded-lg border px-4 py-2.5 text-sm ${
              revokeState.ok
                ? "border-green-200 bg-green-50 text-green-800"
                : "border-red-200 bg-red-50 text-[#C62828]"
            }`}
          >
            {revokeState.message}
          </p>
        ) : null}
      </Card>


      {showCreate ? (
        <Card title="Vytvoriť pozvánku">
          <form action={createAction} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="inv-role" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Rola
                </label>
                <select
                  id="inv-role"
                  name="role"
                  required
                  defaultValue={APP_ROLES.CLEN}
                  className="w-full min-h-[44px] rounded-lg border border-gray-300 bg-white px-3 text-sm outline-none transition focus:border-[#C62828] focus:ring-2 focus:ring-[#C62828]"
                >
                  {(Object.keys(APP_ROLES) as AppRole[]).map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="inv-valid" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Platnosť (dni)
                </label>
                <select
                  id="inv-valid"
                  name="valid_days"
                  defaultValue="14"
                  className="w-full min-h-[44px] rounded-lg border border-gray-300 bg-white px-3 text-sm outline-none transition focus:border-[#C62828] focus:ring-2 focus:ring-[#C62828]"
                >
                  {VALIDITY_OPTIONS.map((days) => (
                    <option key={days} value={days}>
                      {days} dní
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="inv-max-uses" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Maximálny počet použití
                </label>
                <input
                  id="inv-max-uses"
                  name="max_uses"
                  type="number"
                  min={1}
                  max={100}
                  defaultValue={1}
                  className="w-full min-h-[44px] rounded-lg border border-gray-300 px-3 text-sm outline-none transition focus:border-[#C62828] focus:ring-2 focus:ring-[#C62828]"
                />
              </div>

              <div>
                <label htmlFor="inv-email" className="block text-sm font-medium text-gray-700 mb-1.5">
                  E-mail (voliteľné)
                </label>
                <input
                  id="inv-email"
                  name="target_email"
                  type="email"
                  placeholder="novy.clen@dhz.sk"
                  className="w-full min-h-[44px] rounded-lg border border-gray-300 px-3 text-sm outline-none transition focus:border-[#C62828] focus:ring-2 focus:ring-[#C62828]"
                />
              </div>
            </div>

            <div>
              <label htmlFor="inv-notes" className="block text-sm font-medium text-gray-700 mb-1.5">
                Poznámka (voliteľné)
              </label>
              <input
                id="inv-notes"
                name="notes"
                type="text"
                placeholder="napr. nový člen – rok 2026"
                className="w-full min-h-[44px] rounded-lg border border-gray-300 px-3 text-sm outline-none transition focus:border-[#C62828] focus:ring-2 focus:ring-[#C62828]"
              />
            </div>

            {createState && !createState.ok ? (
              <p
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-[#C62828]"
              >
                {createState.message}
              </p>
            ) : null}

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={createPending}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-[#C62828] px-4 text-sm font-semibold text-white transition hover:bg-[#8E0000] disabled:opacity-50"
              >
                {createPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <KeyRound className="h-4 w-4" />
                )}
                {createPending ? "Vytváram…" : "Vytvoriť pozvánku"}
              </button>
              <button
                type="button"
                onClick={() => setCreateFormOpen(false)}
                className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
              >
                Zrušiť
              </button>
            </div>
          </form>
        </Card>
      ) : (
        <button
          type="button"
          onClick={() => setCreateFormOpen(true)}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-[#C62828] px-4 text-sm font-semibold text-white transition hover:bg-[#8E0000]"
        >
          <Plus className="h-4 w-4" />
          Vytvoriť pozvánku
        </button>
      )}


      {showCode && createdCode && createdInvitation ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Pozvánka vytvorená"
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 py-10"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeCodeDialog();
          }}
        >
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Pozvánka vytvorená</h2>
                <p className="text-sm text-gray-500">
                  Rola: {ROLE_LABELS[createdInvitation.role] ?? createdInvitation.role}
                </p>
              </div>
              <button
                type="button"
                onClick={closeCodeDialog}
                aria-label="Zavrieť"
                className="rounded-lg px-3 py-1 text-sm text-gray-500 hover:bg-gray-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                Jednorazový pozývací kód
              </p>
              <p className="mt-2 select-all break-all text-center font-mono text-2xl font-bold tracking-widest text-[#C62828]">
                {createdCode}
              </p>
              <p className="mt-3 text-center text-xs text-amber-800">
                Kód sa zobrazuje iba raz. V databáze je uložený len jeho hash.
              </p>
              <button
                type="button"
                onClick={handleCopyCode}
                className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-amber-300 bg-white px-4 text-sm font-semibold text-amber-900 transition hover:bg-amber-100"
              >
                {copied === "code" ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                {copied === "code" ? "Skopírované" : "Skopírovať kód"}
              </button>
            </div>


            <div className="mt-4">
              <p className="mb-1.5 text-sm font-medium text-gray-700">Pozývací text</p>
              <textarea
                readOnly
                value={message ?? ""}
                rows={9}
                className="w-full rounded-lg border border-gray-300 bg-gray-50 p-3 font-mono text-xs text-gray-700 outline-none focus:border-[#C62828] focus:ring-2 focus:ring-[#C62828]"
              />
              <button
                type="button"
                onClick={handleCopyText}
                className="mt-2 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
              >
                {copied === "text" ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                {copied === "text" ? "Skopírované" : "Skopírovať text"}
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              {links ? (
                <button
                  type="button"
                  onClick={handleWhatsApp}
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-[#25D366] px-4 text-sm font-semibold text-white transition hover:bg-[#1eb455]"
                >
                  <MessageCircle className="h-4 w-4" />
                  WhatsApp
                </button>
              ) : null}

              {messengerAvailable && links?.messenger ? (
                <button
                  type="button"
                  onClick={handleMessenger}
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-[#0084FF] px-4 text-sm font-semibold text-white transition hover:bg-[#0072db]"
                >
                  <Share2 className="h-4 w-4" />
                  Messenger
                </button>
              ) : null}

              {systemShareAvailable ? (
                <button
                  type="button"
                  onClick={handleSystemShare}
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                >
                  <Share2 className="h-4 w-4" />
                  Zdieľať
                </button>
              ) : null}
            </div>


            <p className="mt-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-900">
              Otvorenie aplikácie <strong>neznamená</strong>, že správa bola odoslaná. Po otvorení
              ju, prosím, poslite a uveďte, že ste ju poslali. Pri Messengeri vložte
              skopírovaný text do chatu cez Ctrl+V (prípadne dlhým stlačením → Vložiť).
            </p>
            <p className="mt-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-600">
              Kód platí do {formatDateTime(createdInvitation.expires_at)} a je jednorazový. Ak sa
              dostal k niekomu cudziemu, pozvánku zrušte.
            </p>

            {shareNote ? (
              <p role="status" className="mt-3 text-sm text-gray-600">
                {shareNote}
              </p>
            ) : null}

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={closeCodeDialog}
                className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-[#C62828] px-4 text-sm font-semibold text-white transition hover:bg-[#8E0000]"
              >
                Zavrieť
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Vizuálne potvrdenie skopírovania (toast) */}
      {toast ? (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-4 left-1/2 z-[60] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg ${
            toast.tone === "success"
              ? "border-green-300 bg-green-50 text-green-800"
              : "border-red-300 bg-red-50 text-[#C62828]"
          }`}
        >
          <span className="flex items-center gap-2">
            {toast.tone === "success" ? (
              <Check className="h-4 w-4 shrink-0" />
            ) : (
              <X className="h-4 w-4 shrink-0" />
            )}
            {toast.message}
          </span>
        </div>
      ) : null}
    </div>
  );
}
