import type { MembershipType, MemberStatus } from "@/lib/members/members.service";

const MEMBERSHIP_LABELS: Record<MembershipType, string> = {
  adult: "Dospelý",
  youth: "Mládež",
  preparatory: "Prípravka",
  dorast: "Dorast",
};

const MEMBERSHIP_STYLES: Record<MembershipType, string> = {
  adult: "bg-gray-100 text-gray-700",
  youth: "bg-blue-50 text-blue-700",
  preparatory: "bg-sky-50 text-sky-700",
  dorast: "bg-amber-50 text-amber-700",
};

export function MembershipBadge({ type }: { type: MembershipType }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${MEMBERSHIP_STYLES[type] ?? "bg-gray-100 text-gray-700"}`}
    >
      {MEMBERSHIP_LABELS[type] ?? type}
    </span>
  );
}

export function MemberStatusBadge({ status }: { status: MemberStatus }) {
  const isActive = status === "active";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        isActive ? "bg-green-50 text-green-700" : "bg-red-50 text-[#C62828]"
      }`}
    >
      <span
        aria-hidden
        className={`h-1.5 w-1.5 rounded-full ${isActive ? "bg-green-500" : "bg-[#C62828]"}`}
      />
      {isActive ? "🟢 Aktívny" : "🔴 Neaktívny"}
    </span>
  );
}

export function MemberAvatar({
  firstName,
  lastName,
  photoPath,
}: {
  firstName: string;
  lastName: string;
  photoPath?: string | null;
}) {
  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  return (
    <span
      aria-hidden
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#C62828]/10 text-sm font-bold text-[#C62828]"
      title={photoPath ? "Fotografia bude dostupná v K8.4" : undefined}
    >
      {initials}
    </span>
  );
}

/** Maskuje telefónne číslo – viditeľné zostávajú posledné 3 číslice. */
export function maskPhone(phone: string | null): string {
  if (!phone) return "—";
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 3) return "•••";
  const tail = digits.slice(-3);
  return `••• ••• ${tail}`;
}

/** Vek z dátumu narodenia (ISO). Vracia null ak neznáme. */
export function ageFromBirthDate(birthDate: string | null): number | null {
  if (!birthDate) return null;
  const d = new Date(birthDate);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age < 0 ? null : age;
}
