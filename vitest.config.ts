import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    globals: false,
    exclude: [
      "**/node_modules/**",
      "src/lib/finance/finance-core.test.ts",
      "src/lib/reports/reports.core.test.ts",
      "src/app/dashboard/finance/attachment-constants.test.ts",
      "src/features/members/schemas/member.validation.test.ts",
      "src/hooks/push-utils.test.ts",
      "src/lib/auth/invitation.test.ts",
      "src/lib/auth/invitations.share.test.ts",
      "src/lib/auth/server.test.ts",
      "src/lib/equipment/fault-reporting.test.ts",
    ],
  },
});

