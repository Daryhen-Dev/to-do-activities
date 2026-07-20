import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    // Several suites are integration tests that hit ONE shared Postgres
    // instance (see the *.integration and *.repository tests). Running test
    // files in parallel lets them race on the same dev-user data — one file's
    // list/category cleanup can cascade-delete rows another file is mid-way
    // through using, causing intermittent "No record found" / 404 failures.
    // The suite is small, so run files serially for deterministic DB state.
    fileParallelism: false,
  },
});
