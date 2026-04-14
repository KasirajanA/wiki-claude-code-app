import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  // Load .env.test when running tests
  const testEnv = loadEnv("test", process.cwd(), "");

  return {
    plugins: [react()],
    test: {
      environment: "node",
      globals: true,
      setupFiles: ["./src/test/setup.ts"],
      include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
      exclude: ["src/test/e2e/**", "node_modules/**"],
      // Ensure tests run serially so DB state is predictable
      pool: "forks",
      poolOptions: { forks: { singleFork: true } },
      env: {
        ...testEnv,
        // Allow override from shell for CI
        DATABASE_URL:
          process.env.DATABASE_URL_TEST ??
          testEnv.DATABASE_URL ??
          process.env.DATABASE_URL ??
          "",
      },
      coverage: {
        provider: "v8",
        reporter: ["text", "lcov"],
      },
    },
    resolve: {
      alias: {
        "@": resolve(__dirname, "./src"),
      },
    },
  };
});
