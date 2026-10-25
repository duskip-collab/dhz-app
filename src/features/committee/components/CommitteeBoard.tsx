"use client";

import Link from "next/link";
import { useState } from "react";
import { MessageSquarePlus, Pencil, Send, Trash2, Users } from "lucide-react";
import { deleteCommitteeMessageAction } from "@/app/(app)/committee/actions";
import type {
  CommitteeMember,
  CommitteeMessage,
} from "@/lib/committee/committee.service";

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("sk-SK", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function authorName(author: CommitteeMessage["author"]): string {
  if (!author) return "Neznámy autor";
  return `${author.first_name} ${author.last_name}`;
}

/**
 * CommitteeBoard – chat / nástenka výboru (časť 1).
 * Zoznam členov výboru s funkcionárskym zaradením.
 */
export function CommitteeMemberGrid({ members }: { members: CommitteeMember[] }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-4">
        <Users className="h-5 w-5 text-[#C62828]" />
        <h2 className="text-base font-bold text-gray-900">Členovia výboru</h2>
      </div>
      <div className="p-5">
        {members.length === 0 ? (
          <p className="text-sm text-gray-500">
            Zatiaľ nie je evidovaný žiadny člen výboru. Člena výboru označíte v jeho profile
            („Člen výboru DHZ“).
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {members.map((m) => (
              <li key={m.id} className="rounded-xl border border-gray-200 bg-white p-4">
                <p className="font-semibold text-gray-900">
                  {m.title ? `${m.title} ` : ""}
                  {m.first_name} {m.last_name}
                </p>
                {m.position ? (
                  <p className="mt-0.5 text-xs font-semibold uppercase tracking-wide text-[#C62828]">
                    {m.position}
                  </p>
                ) : null}
                {m.rank ? <p className="text-xs text-gray-600">Hodnosť: {m.rank}</p> : null}
                <Link
                  href={`/members/${m.id}`}
                  className="mt-1 inline-block text-xs font-semibold text-gray-500 hover:text-[#C62828]"
                >
                  Otvoriť profil
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}


/**
 * CommitteeThread – jedna správa s vláknovými odpoveďami (časť 2).
 * Odpovedať možno priamo na každú správu; mazanie je dostupné pre autora/ADMIN.
 */
export function CommitteeThread({
  message,
  canSend,
  replyAction,
}: {
  message: CommitteeMessage;
  canSend: boolean;
  replyAction: (formData: FormData) => void | Promise<void>;
}) {
  const [replyOpen, setReplyOpen] = useState(false);

  return (
    <article className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-sm font-bold text-gray-900">{authorName(message.author)}</p>
            <p className="text-xs text-gray-400">{formatDateTime(message.created_at)}</p>
          </div>
          {canSend ? (
            <form action={deleteCommitteeMessageAction}>
              <input type="hidden" name="message_id" value={message.id} />
              <button
                type="submit"
                aria-label="Odstrániť správu"
                className="inline-flex min-h-[36px] w-9 items-center justify-center rounded-lg border border-red-200 text-[#C62828] transition hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </form>
          ) : null}
        </div>
        <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{message.content}</p>

        {message.replies.length > 0 ? (
          <ul className="mt-3 space-y-2 border-l-2 border-gray-100 pl-3">
            {message.replies.map((reply) => (
              <li key={reply.id} className="rounded-lg bg-gray-50 px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-bold text-gray-900">
                      {authorName(reply.author)}
                    </p>
                    <p className="text-[11px] text-gray-400">
                      {formatDateTime(reply.created_at)}
                    </p>
                  </div>
                  {canSend ? (
                    <form action={deleteCommitteeMessageAction}>
                      <input type="hidden" name="message_id" value={reply.id} />
                      <button
                        type="submit"
                        aria-label="Odstrániť odpoveď"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition hover:bg-red-50 hover:text-[#C62828]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </form>
                  ) : null}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">{reply.content}</p>
              </li>
            ))}
          </ul>
        ) : null}

        {canSend ? (
          replyOpen ? (
            <form action={replyAction} className="mt-3 space-y-2">
              <input type="hidden" name="message_id" value={message.id} />
              <textarea
                name="content"
                required
                maxLength={2000}
                rows={2}
                autoFocus
                placeholder="Napíšte odpoveď…"
                className="min-h-[44px] w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-[#C62828]"
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-gray-900 px-4 text-sm font-semibold text-white transition hover:bg-gray-700"
                >
                  <Send className="h-4 w-4" /> Odpovedať
                </button>
                <button
                  type="button"
                  onClick={() => setReplyOpen(false)}
                  className="inline-flex min-h-[40px] items-center rounded-lg border border-gray-200 px-4 text-sm font-semibold text-gray-700 transition hover:border-gray-300"
                >
                  Zrušiť
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setReplyOpen(true)}
              className="mt-3 inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-xs font-semibold text-gray-700 transition hover:border-red-200 hover:text-[#C62828]"
            >
              <Pencil className="h-3.5 w-3.5" /> Odpovedať
            </button>
          )
        ) : null}
      </div>
    </article>
  );
}


/**
 * CommitteeNewMessageForm – formulár novej správy (časť 3).
 */
export function CommitteeNewMessageForm({
  postAction,
}: {
  postAction: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="px-5 py-4">
        <h2 className="flex items-center gap-2 text-base font-bold text-gray-900">
          <MessageSquarePlus className="h-5 w-5 text-[#C62828]" /> Nová správa
        </h2>
      </div>
      <div className="px-5 pb-5">
        <form action={postAction} className="flex flex-col gap-2 sm:flex-row">
          <textarea
            name="content"
            required
            maxLength={2000}
            rows={2}
            placeholder="Napíšte správu, poznámku alebo oznam pre výbor…"
            className="min-h-[44px] flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-[#C62828]"
          />
          <button
            type="submit"
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-[#C62828] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#8E0000]"
          >
            <Send className="h-4 w-4" /> Odoslať
          </button>
        </form>
      </div>
    </section>
  );
}
