/**
 * Vitest configuration for @ironyard/api.
 *
 * All tests run in the standard Node pool (no @cloudflare/vitest-pool-workers).
 *
 * - Pure-function tests (lobby-do-source, tokens, lobby-do-stampers): no runtime
 *   needed; mocks cover the DB + worker globals.
 * - Integration tests (tests/integration/): spin up a real Miniflare-backed
 *   worker via unstable_dev (wrangler) in globalSetup/beforeAll; hit it with
 *   fetch + WebSocket. This is intentionally a Node.js test against a subprocess,
 *   not a test running inside the Workers runtime.
 *
 * Timeout is bumped for integration tests — the first unstable_dev start compiles
 * and bundles the worker, which can take ~8s on cold start.
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Each test file runs in its own isolated environment; integration tests
    // that share a server across tests use beforeAll/afterAll within the file.
    pool: 'forks',
    // 20s per test; integration suites override locally with beforeAll timeouts.
    testTimeout: 20_000,
    // Longer hook timeout for worker startup.
    hookTimeout: 40_000,
  },
});
