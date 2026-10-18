const tones: Record<string, string> = {
  gray: "bg-gray-100 text-gray-700",
  green: "bg-green-50 text-[#2E7D32] border border-green-200",
  yellow: "bg-yellow-50 text-[#F9A825] border border-yellow-200",
  red: "bg-red-50 text-[#C62828] border border-red-200",
  blue: "bg-blue-50 text-[#1565C0] border border-blue-200",
};

export function Badge({
  tone = "gray",
  children,
}: {
  tone?: keyof typeof tones;
  children: React.ReactNode;
}) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: "ok" | "warn" | "error" | "info" }) {
  const map = {
    ok: <Badge tone="green">OK</Badge>,
    warn: <Badge tone="yellow">Upozornenie</Badge>,
    error: <Badge tone="red">Kritické</Badge>,
    info: <Badge tone="blue">Info</Badge>,
  } as const;
  return map[status];
}
