import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { PWARegister } from "@/components/pwa/PWARegister";
import { OfflineIndicator } from "@/components/pwa/OfflineIndicator";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";

const inter = Inter({ subsets: ["latin", "latin-ext"] });

export const metadata: Metadata = {
  title: {
    default: "DHZ Digital OS",
    template: "%s | DHZ Digital OS",
  },
  applicationName: "DHZ Digital OS",
  description:
    "Digitálny organizačný systém dobrovoľného hasičského zboru",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/icons/icon-192.png", type: "image/png" }],
    apple: [
      {
        url: "/icons/apple-touch-icon.png",
        type: "image/png",
      },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "DHZ Digital OS",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#C62828",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="sk"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
      className="h-full"
    >
      <body
        className={`${inter.className} antialiased bg-[#F5F6F8] text-gray-900 h-full`}
      >
        <PWARegister />
        <OfflineIndicator />
        <InstallPrompt />
        {children}
      </body>
    </html>
  );
}
