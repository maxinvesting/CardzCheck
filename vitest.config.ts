import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "server-only": path.resolve(__dirname, "test/server-only.ts"),
    },
  },
  test: {
    exclude: [
      "**/node_modules/**",
      "**/.next/**",
      "**/.claude/**",
      "apps/web/**",
    ],
  },
});
