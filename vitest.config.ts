import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Feature tests share one live Postgres instance and reset it in
    // beforeEach; running test files concurrently would race on that reset.
    fileParallelism: false,
  },
});
