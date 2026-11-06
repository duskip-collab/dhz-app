"use client";

import { Images, List } from "lucide-react";

export type MemberView = "list" | "photos";

export function MemberViewToggle({
  value,
  onChange,
}: {
  value: MemberView;
  onChange: (view: MemberView) => void;
}) {
  const views: { id: MemberView; label: string; Icon: typeof List }[] = [
    { id: "list", label: "Zoznam", Icon: List },
    { id: "photos", label: "Fotografie", Icon: Images },
  ];

  return (
    <div
      role="group"
      aria-label="Spôsob zobrazenia členov"
      className="flex w-full justify-end sm:w-auto"
    >
      <div className="inline-flex max-w-full rounded-xl bg-gray-100 p-1">
        {views.map(({ id, label, Icon }) => {
          const active = value === id;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(id)}
              className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold transition sm:px-4 ${
                active
                  ? "bg-white text-[#C62828] shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
