"use client";

import { useState } from "react";
import Link from "next/link";
import type { Member } from "@/lib/members/members.service";

export function MemberPhotoGallery({
  members,
  photoUrls,
}: {
  members: Member[];
  photoUrls: Record<string, string>;
}) {
  return (
    <section aria-labelledby="member-gallery-title" className="overflow-x-hidden">
      <header className="mb-5">
        <h2 id="member-gallery-title" className="text-lg font-bold text-gray-900">
          Naši členovia
        </h2>
        <p className="mt-1 text-sm text-gray-500">Prehľad členov DHZ RUŽINDOL</p>
      </header>
      {members.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-500">
          Nenašli sa žiadni členovia.
        </p>
      ) : (
        <ul className="grid grid-cols-4 gap-x-3 gap-y-5 sm:grid-cols-5 sm:gap-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10">
          {members.map((member) => (
            <MemberPhotoItem
              key={`${member.id}:${photoUrls[member.id] ?? ""}`}
              member={member}
              photoUrl={photoUrls[member.id]}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function MemberPhotoItem({
  member,
  photoUrl,
}: {
  member: Member;
  photoUrl?: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const initials = `${member.first_name.charAt(0)}${member.last_name.charAt(0)}`.toUpperCase();
  const fullName = `${member.first_name} ${member.last_name}`;
  const showPhoto = Boolean(photoUrl) && !failed;

  return (
    <li className="min-w-0">
      <Link
        href={`/members/${member.id}`}
        aria-label={`Otvoriť profil člena ${fullName}`}
        className="group flex min-h-11 flex-col items-center gap-2 rounded-lg text-center outline-none focus-visible:ring-2 focus-visible:ring-[#C62828] focus-visible:ring-offset-2"
      >
        <span className="relative flex aspect-square w-full max-w-[72px] items-center justify-center overflow-hidden rounded-full bg-slate-200 text-lg font-semibold text-slate-800 transition-transform group-hover:scale-105 group-focus-visible:scale-105 sm:max-w-20 sm:text-xl md:max-w-[88px] lg:max-w-24 xl:max-w-[104px]">
          {showPhoto && !loaded ? (
            <span className="absolute inset-0 animate-pulse rounded-full bg-gray-200" aria-hidden="true" />
          ) : null}
          {!showPhoto ? <span aria-hidden="true">{initials}</span> : null}
          {showPhoto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoUrl}
              alt=""
              aria-hidden="true"
              loading="lazy"
              decoding="async"
              onLoad={() => setLoaded(true)}
              onError={() => setFailed(true)}
              className={`absolute inset-0 h-full w-full object-cover transition-opacity ${
                loaded ? "opacity-100" : "opacity-0"
              }`}
            />
          ) : null}
        </span>
        <span className="line-clamp-2 w-full max-w-full break-words text-center text-xs font-medium text-gray-800 sm:text-sm">
          {fullName}
        </span>
      </Link>
    </li>
  );
}

export function MemberPhotoGallerySkeleton() {
  return (
    <section aria-label="Načítavajú sa fotografie členov" aria-busy="true">
      <div className="mb-5 space-y-2">
        <div className="h-6 w-40 animate-pulse rounded bg-gray-200" />
        <div className="h-4 w-56 animate-pulse rounded bg-gray-100" />
      </div>
      <ul className="grid grid-cols-4 gap-x-3 gap-y-5 sm:grid-cols-5 sm:gap-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10">
        {Array.from({ length: 20 }, (_, index) => (
          <li key={index} className="flex min-w-0 flex-col items-center gap-2">
            <span className="aspect-square w-full max-w-[72px] animate-pulse rounded-full bg-gray-200 sm:max-w-20 md:max-w-[88px] lg:max-w-24 xl:max-w-[104px]" />
            <span className="h-3 w-4/5 animate-pulse rounded bg-gray-100" />
          </li>
        ))}
      </ul>
    </section>
  );
}
