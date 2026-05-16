/**
 * Shared helpers for integration tests that spin up a real wrangler dev server
 * via unstable_dev (Miniflare-backed, ephemeral D1 + DOs per test run).
 *
 * Harness: unstable_dev (wrangler) — not @cloudflare/vitest-pool-workers.
 * Reason: vitest-pool-workers@0.5.x pins wrangler@3.100 which conflicts with
 * this workspace's wrangler@^3.99 when wrangler is a direct dep (the pool
 * brings its own copy). unstable_dev re-uses the same Miniflare internals and
 * avoids the version conflict entirely.
 *
 * Migration strategy: `unstable_dev` does NOT auto-apply D1 migrations when
 * using `persistTo`. We call `wrangler d1 migrations apply DB --local` in a
 * subprocess before starting the worker. Both the migration CLI invocation and
 * the worker start use the same temp `persistTo` directory so they share the
 * same SQLite file.
 *
 * Usage pattern in spec files:
 *   let server: Unstable_DevWorker;
 *   beforeAll(async () => { server = await startWorker(); });
 *   afterAll(async () => { await server.stop(); });
 */

import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Unstable_DevWorker, unstable_dev } from 'wrangler';

const HELPERS_DIR = path.dirname(fileURLToPath(import.meta.url));
const API_DIR = path.resolve(HELPERS_DIR, '../..');
const WORKER_SCRIPT = path.resolve(API_DIR, 'src/index.ts');
const WRANGLER_CONFIG = path.resolve(API_DIR, 'wrangler.toml');
// pnpm hoists wrangler to the app-level node_modules since it's in devDeps.
const WRANGLER_BIN = path.resolve(API_DIR, 'node_modules/.bin/wrangler');

// ── Worker lifecycle ──────────────────────────────────────────────────────────

/** Start an ephemeral worker instance for one test suite. */
export async function startWorker(): Promise<Unstable_DevWorker> {
  // Create an isolated persist directory for this suite.
  const persistTo = mkdtempSync(path.join(tmpdir(), 'ironyard-inttest-'));

  // Apply D1 migrations into that directory BEFORE the worker starts.
  // `wrangler d1 migrations apply` picks up the migrations_dir from wrangler.toml.
  execSync(
    `"${WRANGLER_BIN}" d1 migrations apply DB --local --persist-to "${persistTo}" --config "${WRANGLER_CONFIG}"`,
    { cwd: API_DIR, encoding: 'utf8', timeout: 30_000 },
  );

  const worker = await unstable_dev(WORKER_SCRIPT, {
    config: WRANGLER_CONFIG,
    local: true,
    persistTo,
    // Suppress noisy wrangler output in test logs.
    logLevel: 'none',
    vars: {
      // Enable the dev-login route so tests can create sessions without email.
      IRONYARD_DEV_SKIP_AUTH: '1',
    },
    experimental: {
      disableExperimentalWarning: true,
      // NOTE: testMode: true is intentionally NOT set here. In wrangler 3.114.x,
      // testMode breaks WebSocket upgrades — the server stops forwarding WS frames
      // through the proxy layer. Regular local mode works correctly for WS.
    },
  });

  // Attach cleanup: remove the temp persist dir when the worker stops.
  const originalStop = worker.stop.bind(worker);
  worker.stop = async () => {
    await originalStop();
    try {
      rmSync(persistTo, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup; not worth failing on.
    }
  };

  return worker;
}

/** WS URL for the running worker. */
export function wsBaseUrl(worker: Unstable_DevWorker): string {
  return `ws://${worker.address}:${worker.port}`;
}

// ── Auth helpers ──────────────────────────────────────────────────────────────

export interface LoginResult {
  /** User id returned by dev-login */
  userId: string;
  /** Cookie header value to include in subsequent requests */
  cookie: string;
}

/**
 * Dev-login: creates a user (if new) and returns a session cookie.
 * Requires IRONYARD_DEV_SKIP_AUTH=1 on the worker (set in startWorker).
 */
export async function devLogin(
  worker: Unstable_DevWorker,
  email: string,
  displayName?: string,
): Promise<LoginResult> {
  const res = await worker.fetch('/api/auth/dev-login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, displayName: displayName ?? email.split('@')[0] }),
  });
  if (!res.ok) {
    throw new Error(`dev-login failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { user: { id: string } };
  const setCookie = res.headers.get('set-cookie') ?? '';
  // Extract the session cookie name=value from the Set-Cookie header.
  const cookie = setCookie.split(';')[0] ?? '';
  return { userId: data.user.id, cookie };
}

/** Authenticated fetch wrapper.
 *
 * NOTE: The return type is `Promise<any>` because Wrangler's internal Response
 * type (`Response_2`) diverges from Node's DOM `Response` in the integration
 * test context. Callers cast the returned response to the shape they need via
 * `res.json()`, `res.text()`, `res.ok`, etc. — all of which are present at
 * runtime. The `any` cast on the init argument similarly papers over the
 * Wrangler `RequestInit_2` vs DOM `RequestInit` mismatch.
 */
export function authedFetch(
  worker: Unstable_DevWorker,
  cookie: string,
  fetchPath: string,
  init: RequestInit = {},
  // biome-ignore lint/suspicious/noExplicitAny: see comment above
): Promise<any> {
  const headers = new Headers(init.headers as HeadersInit | undefined);
  headers.set('cookie', cookie);
  // biome-ignore lint/suspicious/noExplicitAny: see comment above
  return worker.fetch(fetchPath, { ...init, headers } as any);
}

// ── Campaign helpers ──────────────────────────────────────────────────────────

export interface Campaign {
  id: string;
  name: string;
  inviteCode: string;
  isOwner: boolean;
  isDirector: boolean;
}

export async function createCampaign(
  worker: Unstable_DevWorker,
  cookie: string,
  name: string,
): Promise<Campaign> {
  const res = await authedFetch(worker, cookie, '/api/campaigns', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    throw new Error(`createCampaign failed: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<Campaign>;
}

export async function joinCampaign(
  worker: Unstable_DevWorker,
  cookie: string,
  inviteCode: string,
): Promise<Campaign> {
  const res = await authedFetch(worker, cookie, '/api/campaigns/join', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ inviteCode }),
  });
  if (!res.ok) {
    throw new Error(`joinCampaign failed: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<Campaign>;
}

// ── Character helpers ─────────────────────────────────────────────────────────

/**
 * Minimal "complete" character fixture that satisfies CompleteCharacterSchema.
 * Used for auto-submit tests and session setup.
 */
function buildCompleteCharacterFixture() {
  return {
    level: 1,
    xp: 0,
    details: {},
    ancestryId: 'human',
    ancestryChoices: { traitIds: [] },
    culture: {
      customName: '',
      environment: 'urban' as const,
      organization: 'communal' as const,
      upbringing: 'martial' as const,
      environmentSkill: 'athletics',
      organizationSkill: 'persuade',
      upbringingSkill: 'endure',
      language: 'Variac',
    },
    careerId: 'soldier',
    careerChoices: {
      skills: [],
      languages: [],
      incitingIncidentId: 'battle',
      perkId: null,
    },
    classId: 'fury',
    characteristicArray: [2, -1, -1],
    characteristicSlots: { agility: 2, reason: -1, intuition: -1 },
    subclassId: null,
    levelChoices: {
      '1': { abilityIds: [], subclassAbilityIds: [], perkId: null, skillId: null },
    },
    kitId: null,
    complicationId: null,
    campaignId: null,
  };
}

/**
 * Create a character with complete data attached to the given campaign by invite
 * code. The attach route auto-submits when data is complete, leaving the
 * character in `pending` status in `campaign_characters`. The caller is
 * responsible for dispatching `ApproveCharacter` over WS if `approved` status
 * is needed (e.g. before StartSession).
 *
 * Returns the new character's id.
 */
export async function createPendingCharacter(
  worker: Unstable_DevWorker,
  cookie: string,
  campaignInviteCode: string,
): Promise<string> {
  // Create standalone character with complete data (no campaignCode yet).
  const createRes = await authedFetch(worker, cookie, '/api/characters', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'TestHero', data: buildCompleteCharacterFixture() }),
  });
  if (!createRes.ok) {
    throw new Error(
      `createPendingCharacter (create) failed: ${createRes.status} ${await createRes.text()}`,
    );
  }
  const created = (await createRes.json()) as { id: string };

  // Attach to the campaign — auto-submits the complete character to pending.
  const attachRes = await authedFetch(worker, cookie, `/api/characters/${created.id}/attach`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ campaignCode: campaignInviteCode }),
  });
  if (!attachRes.ok) {
    throw new Error(
      `createPendingCharacter (attach) failed: ${attachRes.status} ${await attachRes.text()}`,
    );
  }
  const attached = (await attachRes.json()) as { autoSubmitted?: boolean };
  if (!attached.autoSubmitted) {
    throw new Error(
      'createPendingCharacter: auto-submit did not happen — character data may be incomplete',
    );
  }

  return created.id;
}
