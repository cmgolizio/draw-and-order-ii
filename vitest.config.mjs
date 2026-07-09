import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Resolve the app's `@/*` alias straight from tsconfig.
    tsconfigPaths: true,
    alias: {
      // The real package throws outside a React Server environment; unit
      // tests exercise server modules directly, so stub it out.
      "server-only": fileURLToPath(
        new URL("./tests/unit/helpers/server-only.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
  },
});
