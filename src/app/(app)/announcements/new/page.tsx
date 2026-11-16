// =============================================================================
// Nový Oznam (Formulár) – Stránka na vytvorenie oznamu
// =============================================================================
// K29.0: Obmedzenie prístupu iba pre aktuálne členy výboru
// =============================================================================

import { redirect } from "next/navigation";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { getAuthContext } from "@/lib/auth/server";
import { isCurrentCommitteeMember } from "@/lib/auth/committee";
import { publishAnnouncementAction } from "../actions";

export default async function NewAnnouncementPage() {
  const ctx = await getAuthContext();

  const isCommittee = ctx.memberId
    ? await isCurrentCommitteeMember(ctx.memberId)
    : false;
  if (!isCommittee) {
    redirect("/");
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Vytvoriť oznam</h1>
        <p className="text-gray-600 mt-1">
          Vyplňte názov a obsah oznámenia. Oznámenie môžete uložiť ako koncept alebo
          ho zverejniť ihneď.
        </p>
      </div>

      <form
        action={publishAnnouncementAction}
        className="space-y-4 border border-gray-200 rounded-lg p-6 bg-white shadow-sm"
      >
        <input type="hidden" name="request_id" value={randomUUID()} />
        <div>
          <label
            htmlFor="title"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Názov *
          </label>
          <input
            type="text"
            id="title"
            name="title"
            maxLength={200}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Zadajte názov oznamu (max 200 znakov)"
          />
        </div>

        <div>
          <label
            htmlFor="priority"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Priorita
          </label>
          <select
            id="priority"
            name="priority"
            defaultValue="NORMAL"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="LOW">Nízka</option>
            <option value="NORMAL">Bežná</option>
            <option value="HIGH">Vysoká</option>
            <option value="URGENT">Urgentná</option>
          </select>
        </div>

        <div>
          <label
            htmlFor="content"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Obsah *
          </label>
          <textarea
            id="content"
            name="content"
            rows={5}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Zadajte obsah oznámenia"
          />
        </div>

        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="publish"
            name="publish"
            value="true"
            className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
          />
          <label
            htmlFor="publish"
            className="text-sm text-gray-700"
          >
            Zverejniť oznámenie ihneď
          </label>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            className="flex-1 px-4 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
          >
            Uložiť oznámenie
          </button>
          <Link
            href="/announcements"
            className="px-4 py-2 border border-gray-300 text-gray-700 font-medium rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-colors"
          >
            Zrušiť
          </Link>
        </div>
      </form>
    </div>
  );
}
