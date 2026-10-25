import { Users } from "lucide-react";
import { requirePermission } from "@/lib/auth/server";
import { PERMISSIONS, hasPermission } from "@/lib/auth/permissions";
import {
  getCommitteeMembers,
  getCommitteeMessages,
  type CommitteeMember,
  type CommitteeMessage,
} from "@/lib/committee/committee.service";
import { postCommitteeMessageAction, postCommitteeReplyAction } from "./actions";
import {
  CommitteeMemberGrid,
  CommitteeThread,
  CommitteeNewMessageForm,
} from "@/features/committee/components/CommitteeBoard";

export default async function CommitteePage({
  searchParams,
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const ctx = await requirePermission(PERMISSIONS.COMMUNICATION_VIEW);
  const canSend = hasPermission(ctx.permissions, PERMISSIONS.COMMUNICATION_SEND);
  const sp = (await searchParams) ?? {};
  const error = typeof sp.error === "string" ? sp.error : undefined;
  const success = typeof sp.success === "string" ? sp.success : undefined;

  let members: CommitteeMember[] = [];
  let messages: CommitteeMessage[] = [];
  try {
    [members, messages] = await Promise.all([getCommitteeMembers(), getCommitteeMessages()]);
  } catch {
    members = [];
    messages = [];
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Users className="h-6 w-6 text-[#C62828]" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Výbor</h1>
          <p className="text-sm text-gray-500">
            Členovia výboru a interná nástenka – správy, poznámky a oznamy s odpoveďami.
          </p>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-[#C62828]">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          {success}
        </div>
      ) : null}

      <CommitteeMemberGrid members={members} />

      {canSend ? <CommitteeNewMessageForm postAction={postCommitteeMessageAction} /> : null}

      <div className="space-y-4">
        {messages.length === 0 ? (
          <p className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-10 text-center text-sm text-gray-500">
            Zatiaľ neboli pridané žiadne správy výboru.
          </p>
        ) : (
          messages.map((msg) => (
            <CommitteeThread
              key={msg.id}
              message={msg}
              canSend={canSend}
              replyAction={postCommitteeReplyAction}
            />
          ))
        )}
      </div>
    </div>
  );
}
