import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    agentFeedback: true,
  },
  // O2: Cache Components vypnuté – App Router používa klasické dynamické
  // vykresľovanie cez cookies(). Cookie-based auth (middleware + Server
  // Components + redirect) nie je kompatibilné s `cacheComponents: true`
  // (Next 16 zakazuje `export const dynamic = "force-dynamic"` a vyžaduje
  // <Suspense> okolo cookies()/headers()/connection()). Plná migrácia na
  // Cache Components je mimo scope O2 a naplánovaná samostatne.
  cacheComponents: false,
  partialPrefetching: false,
  turbopack: {
  root: process.cwd(),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  allowedDevOrigins: ["192.168.0.103", "localhost", "127.0.0.1", "::1"],
};

export default nextConfig;
