export function Card({
  title,
  subtitle,
  children,
  className = "",
}: {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`bg-white rounded-xl border border-gray-200 shadow-sm p-5 ${className}`}>
      {(title || subtitle) && (
        <header className="mb-4">
          {title && <h2 className="text-base font-bold text-gray-900">{title}</h2>}
          {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
        </header>
      )}
      {children}
    </section>
  );
}
