export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div
      className="flex items-center justify-center rounded-full bg-[#C62828] text-white font-bold shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      aria-hidden="true"
    >
      {initials || "?"}
    </div>
  );
}
