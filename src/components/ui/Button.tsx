import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variants: Record<Variant, string> = {
  primary: "bg-[#C62828] text-white hover:bg-[#8E0000] focus:ring-[#C62828]",
  secondary: "bg-white text-gray-800 border border-gray-200 hover:bg-gray-50 focus:ring-gray-300",
  ghost: "bg-transparent text-gray-700 hover:bg-gray-100 focus:ring-gray-300",
  danger: "bg-red-50 text-[#C62828] border border-red-200 hover:bg-red-100 focus:ring-red-300",
};

const sizes: Record<Size, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-sm",
  lg: "px-5 py-3 text-base",
};

export function Button({ variant = "primary", size = "md", className = "", ...rest }: Props) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] ${variants[variant]} ${sizes[size]} ${className}`}
      {...rest}
    />
  );
}
