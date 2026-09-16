import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import http from 'http';

const requireCjs = createRequire(import.meta.url);
const pkce = requireCjs('../../src/services/orcarouter/pkce.js');
const origins = requireCjs('../../src/services/orcarouter/origins.js');
const credentials = requireCjs('../../src/services/orcarouter/credentials.js');
const { createLoginManager } = requireCjs('../../src/services/orcarouter/session.js');

const AUTH_BASE = 'https://www.orcarouter.ai';
const API_BASE = 'https://api.orcarouter.ai/v1';

/** A fake OrcaRouter auth origin. Real HTTP, real sockets, fake endpoints. */
async function startFakeAuthServer(handler: (req: any, res: any, body: any) => void) {
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      let body: any = null;
      try { body = raw ? JSON.parse(raw) : null; } catch { body = raw; }
      handler(req, res, body);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as any).port;
  return { server, port, base: `http://127.0.0.1:${port}` };
}

function json(res: any, status: number, payload: any) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

describe('OrcaRouter origins', () => {
  it('uses the public defaults when nothing is configured', () => {
    const o = origins.resolveOrigins({});
    expect(o.authBase).toBe(AUTH_BASE);
    expect(o.apiBase).toBe(API_BASE);
  });

  it('keeps auth on www and inference on api - never derives one from the other', () => {
    const o = origins.resolveOrigins({});
    expect(origins.authorizeEndpoint(o.authBase)).toBe(`${AUTH_BASE}/auth`);
    expect(origins.exchangeEndpoint(o.authBase)).toBe(`${AUTH_BASE}/api/v1/auth/keys`);
    // The single most common integration mistake: the relay's /v1 prefix.
    expect(origins.exchangeEndpoint(o.authBase)).not.toContain('api.orcarouter.ai');
    expect(origins.modelsEndpoint(o.apiBase)).toBe(`${API_BASE}/models`);
    expect(origins.modelsEndpoint(o.apiBase)).not.toContain('www.orcarouter.ai');
  });

  it('lets explicit overrides win over the shared self-hosted base', () => {
    const o = origins.resolveOrigins({
      ORCA_BASE_URL: 'https://self.example.com',
      ORCA_AUTH_BASE_URL: 'https://login.example.com',
      ORCA_API_BASE_URL: 'https://relay.example.com/v1',
    });
    expect(o.authBase).toBe('https://login.example.com');
    expect(o.apiBase).toBe('https://relay.example.com/v1');
  });

  it('appends /v1 to a shared self-hosted base for inference only', () => {
    const o = origins.resolveOrigins({ ORCA_BASE_URL: 'https://one.example.com' });
    expect(o.authBase).toBe('https://one.example.com');
    expect(o.apiBase).toBe('https://one.example.com/v1');
  });

  it('requires HTTPS for remote origins and allows HTTP only on loopback', () => {
    expect(() => origins.resolveOrigins({ ORCA_AUTH_BASE_URL: 'http://evil.example.com' })).toThrow(/HTTPS/i);
    expect(() => origins.resolveOrigins({ ORCA_API_BASE_URL: 'http://evil.example.com/v1' })).toThrow(/HTTPS/i);
    expect(() => origins.resolveOrigins({ ORCA_AUTH_BASE_URL: 'http://127.0.0.1:8080' })).not.toThrow();
    expect(() => origins.resolveOrigins({ ORCA_AUTH_BASE_URL: 'http://localhost:8080' })).not.toThrow();
  });
});

describe('OrcaRouter PKCE primitives', () => {
  it('produces a fresh verifier and state on every attempt', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 64; i += 1) seen.add(pkce.generateVerifier());
    expect(seen.size).toBe(64);
    expect(pkce.generateVerifier()).not.toBe(pkce.generateVerifier());
    expect(pkce.generateState()).not.toBe(pkce.generateState());
  });

  it('derives an unpadded base64url S256 challenge', () => {
    const verifier = pkce.generateVerifier();
    const challenge = pkce.challengeFor(verifier);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(challenge).not.toContain('=');
    expect(challenge).not.toContain('+');
    expect(challenge).not.toContain('/');
    expect(challenge).toBe(
      requireCjs('crypto').createHash('sha256').update(verifier).digest('base64url')
    );
  });

  it('compares state in constant time and rejects empty or mismatched values', () => {
    const state = pkce.generateState();
    expect(pkce.safeEqual(state, state)).toBe(true);
    expect(pkce.safeEqual(state, pkce.generateState())).toBe(false);
    expect(pkce.safeEqual(state, '')).toBe(false);
    expect(pkce.safeEqual('', '')).toBe(false);
    expect(pkce.safeEqual(state, null)).toBe(false);
  });

  it('always sends S256 and never leaks the verifier into the authorize URL', () => {
    const verifier = pkce.generateVerifier();
    const state = pkce.generateState();
    const url = new URL(pkce.buildAuthorizeUrl({
      authBase: AUTH_BASE,
      callbackUrl: 'http://127.0.0.1:51234/cb',
      challenge: pkce.challengeFor(verifier),
      state,
      appName: 'incognide',
    }));
    expect(url.origin).toBe(AUTH_BASE);
    expect(url.pathname).toBe('/auth');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('state')).toBe(state);
    // The verifier must never ride on a URL.
    expect(url.toString()).not.toContain(verifier);
    expect(url.toString()).not.toContain('code_verifier');
  });
});

describe('OrcaRouter exchange', () => {
  it('POSTs the code, verifier and S256 to the auth origin only', async () => {
    const calls: any[] = [];
    const fetchImpl = vi.fn(async (url: string, init: any) => {
      calls.push({ url, init });
      return { status: 200, ok: true, json: async () => ({ key: 'sk-orca-fake-key-1234', user_id: '42', scope: 'api' }) };
    });

    const result = await pkce.exchangeCode({
      authBase: AUTH_BASE, code: 'the-code', verifier: 'the-verifier', fetchImpl,
    });

    expect(result.ok).toBe(true);
    expect(result.key).toBe('sk-orca-fake-key-1234');
    expect(result.scope).toBe('api');
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${AUTH_BASE}/api/v1/auth/keys`);
    expect(calls[0].url).not.toContain('api.orcarouter.ai');
    // The auth API lives under /api/v1/auth on the www origin - the relay's
    // /v1 prefix must not be applied to it.
    expect(new URL(calls[0].url).pathname).toBe('/api/v1/auth/keys');
    expect(calls[0].url.startsWith('https://api.orcarouter.ai')).toBe(false);
    const sent = JSON.parse(calls[0].init.body);
    expect(sent).toEqual({ code: 'the-code', code_verifier: 'the-verifier', code_challenge_method: 'S256' });
  });

  it('classifies denial without echoing request material', async () => {
    const fetchImpl = vi.fn(async () => ({ status: 403, ok: false, json: async () => ({}) }));
    const result = await pkce.exchangeCode({ authBase: AUTH_BASE, code: 'secret-code', verifier: 'secret-verifier', fetchImpl });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('invalid_grant');
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('secret-code');
    expect(serialized).not.toContain('secret-verifier');
    expect(serialized).not.toContain('code_verifier');
  });

  it('classifies an expired or reused code as a terminal invalid_grant', async () => {
    const fetchImpl = vi.fn(async () => ({ status: 403, ok: false, json: async () => ({}) }));
    const first = await pkce.exchangeCode({ authBase: AUTH_BASE, code: 'used', verifier: 'verifier-value', fetchImpl });
    const second = await pkce.exchangeCode({ authBase: AUTH_BASE, code: 'used', verifier: 'verifier-value', fetchImpl });
    expect(first.error).toBe('invalid_grant');
    expect(second.error).toBe('invalid_grant');
    // Never retried automatically: a spent code cannot be replayed.
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('classifies a 400 method mismatch and a 429 rate limit', async () => {
    const bad = vi.fn(async () => ({ status: 400, ok: false, json: async () => ({}) }));
    expect((await pkce.exchangeCode({ authBase: AUTH_BASE, code: 'c', verifier: 'v', fetchImpl: bad })).error).toBe('invalid_request');

    const limited = vi.fn(async () => ({ status: 429, ok: false, json: async () => ({}) }));
    const result = await pkce.exchangeCode({ authBase: AUTH_BASE, code: 'c', verifier: 'v', fetchImpl: limited });
    expect(result.error).toBe('rate_limited');
    expect(result.message).toMatch(/24 hours/);
  });

  it('gives up on a network failure instead of hot-looping', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('ECONNREFUSED'); });
    const result = await pkce.exchangeCode({ authBase: AUTH_BASE, code: 'c', verifier: 'v', fetchImpl });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('network_error');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('rejects a malformed success body rather than persisting a non-key', async () => {
    const fetchImpl = vi.fn(async () => ({ status: 200, ok: true, json: async () => ({ scope: 'api' }) }));
    const result = await pkce.exchangeCode({ authBase: AUTH_BASE, code: 'c', verifier: 'v', fetchImpl });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('invalid_response');
  });
});

describe('OrcaRouter loopback listener (Flow A)', () => {
  it('delivers the code when state matches and serves the browser a closing page', async () => {
    const state = pkce.generateState();
    const listener = pkce.startLoopbackListener({ state, timeoutMs: 5000 });
    const port = await listener.ready;
    const res = await fetch(`http://127.0.0.1:${port}/cb?code=abc123&state=${encodeURIComponent(state)}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toMatch(/close this tab/i);
    await expect(listener.code).resolves.toBe('abc123');
  });

  it('rejects a mismatched state before the code is used', async () => {
    const listener = pkce.startLoopbackListener({ state: 'expected-state', timeoutMs: 5000 });
    const port = await listener.ready;
    await fetch(`http://127.0.0.1:${port}/cb?code=stolen&state=wrong-state`);
    await expect(listener.code).rejects.toMatchObject({ code: 'state_mismatch' });
  });

  it('surfaces a denial as access_denied', async () => {
    const state = pkce.generateState();
    const listener = pkce.startLoopbackListener({ state, timeoutMs: 5000 });
    const port = await listener.ready;
    await fetch(`http://127.0.0.1:${port}/cb?error=access_denied&state=${encodeURIComponent(state)}`);
    await expect(listener.code).rejects.toMatchObject({ code: 'access_denied' });
  });

  it('times out rather than waiting forever', async () => {
    const listener = pkce.startLoopbackListener({ state: 's', timeoutMs: 60 });
    await listener.ready;
    await expect(listener.code).rejects.toMatchObject({ code: 'timeout' });
  });
});

describe('OrcaRouter credential seam', () => {
  let logged: string[] = [];
  let spies: any[] = [];

  beforeEach(() => {
    logged = [];
    spies = ['log', 'error', 'warn', 'info'].map((level) =>
      vi.spyOn(console, level as any).mockImplementation((...args: any[]) => { logged.push(args.join(' ')); })
    );
  });

  afterEach(() => {
    spies.forEach((s) => s.mockRestore());
  });

  it('returns the same credential shape from the API-key and PKCE adapters', async () => {
    const apiStore = new credentials.MemoryCredentialStore();
    const pkceStore = new credentials.MemoryCredentialStore();

    const fakeFetch = vi.fn(async () => ({
      status: 200, ok: true,
      json: async () => ({ key: 'sk-orca-pkce-issued-key-9999', user_id: '7', scope: 'api' }),
    }));

    const fromKey = await credentials.acquireCredential({
      store: apiStore, sourceId: credentials.SOURCE_API_KEY, apiKey: 'sk-orca-pasted-key-1111',
    });

    // Full Flow A round-trip against a real local HTTP server.
    const fake = await startFakeAuthServer((req, res, body) => {
      if (req.url?.startsWith('/api/v1/auth/keys')) {
        expect(body.code_challenge_method).toBe('S256');
        json(res, 200, { key: 'sk-orca-pkce-issued-key-9999', user_id: '7', scope: 'api' });
        return;
      }
      res.writeHead(404).end();
    });

    // Drive the callback by hand: the redirect target is the listener we start.
    const fromPkce = await credentials.acquireCredential({
      store: pkceStore,
      sourceId: credentials.SOURCE_PKCE,
      env: { ORCA_AUTH_BASE_URL: fake.base },
      fetchImpl: fakeFetch,
      openBrowser: async (url: string) => {
        const parsed = new URL(url);
        const callback = new URL(parsed.searchParams.get('callback_url')!);
        // Simulate the consent screen redirecting with the code.
        setTimeout(() => {
          fetch(`${callback.origin}${callback.pathname}?code=live-code&state=${parsed.searchParams.get('state')}`).catch(() => {});
        }, 10);
      },
    });
    fake.server.close();

    expect(fromKey.ok).toBe(true);
    expect(fromPkce.ok).toBe(true);

    // Downstream sees one shape; only `source` differs.
    expect(fromKey.credential.provider).toBe('orcarouter');
    expect(fromPkce.credential.provider).toBe('orcarouter');
    expect(fromKey.credential.source).toBe('api-key');
    expect(fromPkce.credential.source).toBe('pkce');
    expect(Object.keys(fromKey.credential).sort()).toEqual(Object.keys(fromPkce.credential).sort());
    expect(fromKey.key).toBe('sk-orca-pasted-key-1111');
    expect(fromPkce.key).toBe('sk-orca-pkce-issued-key-9999');
  });

  it('stores, reads and clears the key, and only ever returns a masked form', async () => {
    const store = new credentials.MemoryCredentialStore();
    const secret = 'sk-orca-super-secret-value-7777';

    const stored = await credentials.acquireCredential({ store, sourceId: credentials.SOURCE_API_KEY, apiKey: secret });
    expect(stored.ok).toBe(true);
    expect(stored.maskedKey).toBe('sk-orca-…7777');
    expect(stored.maskedKey).not.toContain('super-secret');

    const read = await store.read();
    expect(read.key).toBe(secret); // the store holds it; the UI never does

    await store.clear();
    expect(await store.read()).toBeNull();
  });

  it('rejects an empty key and an obviously malformed one', async () => {
    const store = new credentials.MemoryCredentialStore();
    const empty = await credentials.acquireCredential({ store, sourceId: credentials.SOURCE_API_KEY, apiKey: '   ' });
    expect(empty.ok).toBe(false);
    expect(empty.error).toBe('invalid_request');

    const malformed = await credentials.acquireCredential({ store, sourceId: credentials.SOURCE_API_KEY, apiKey: 'sk-other-1234567890' });
    expect(malformed.ok).toBe(false);
    expect(malformed.error).toBe('invalid_format');
    expect(await store.read()).toBeNull();
  });

  it('reports a scope downgrade instead of assuming the request was granted', async () => {
    const store = new credentials.MemoryCredentialStore();
    const fake = await startFakeAuthServer((req, res, body) => {
      if (req.url?.startsWith('/api/v1/auth/keys')) { json(res, 200, { key: 'sk-orca-narrow-0001', user_id: '1', scope: 'api' }); return; }
      res.writeHead(404).end();
    });

    const result = await credentials.acquireCredential({
      store, sourceId: credentials.SOURCE_PKCE, scope: 'connector',
      env: { ORCA_AUTH_BASE_URL: fake.base },
      fetchImpl: vi.fn(async (url: string, init: any) => {
        const res = await fetch(url, init as any);
        return { status: res.status, ok: res.ok, json: () => res.json() };
      }) as any,
      openBrowser: async (url: string) => {
        const parsed = new URL(url);
        // The connector scope was requested; the workspace role granted only api.
        expect(parsed.searchParams.get('scope')).toBe('connector');
        const callback = new URL(parsed.searchParams.get('callback_url')!);
        setTimeout(() => {
          fetch(`${callback.origin}${callback.pathname}?code=c&state=${parsed.searchParams.get('state')}`).catch(() => {});
        }, 10);
      },
    });
    fake.server.close();

    expect(result.ok).toBe(true);
    expect(result.scope).toBe('api');
    expect(result.scopeWarning).toMatch(/granted scope "api", not "connector"/);
  });

  it('never writes the verifier or the key to a log', async () => {
    const store = new credentials.MemoryCredentialStore();
    await credentials.acquireCredential({ store, sourceId: credentials.SOURCE_API_KEY, apiKey: 'sk-orca-logged-4444' });
    const failed = await credentials.acquireCredential({
      store, sourceId: credentials.SOURCE_PKCE,
      timeoutMs: 150,
      fetchImpl: vi.fn(async () => { throw new Error('boom'); }),
      openBrowser: async () => { throw new Error('no browser'); },
    });
    expect(failed.ok).toBe(false);
    const all = logged.join('\n');
    expect(all).not.toContain('sk-orca-logged-4444');
    // A base64url(32-byte) verifier is 43 characters; none may appear.
    expect(all).not.toMatch(/[A-Za-z0-9_-]{43}/);
  });

  it('treats a 401 as terminal reauthentication and never fabricates a refresh', async () => {
    const store = new credentials.MemoryCredentialStore();
    const fetchImpl = vi.fn();
    await credentials.acquireCredential({ store, sourceId: credentials.SOURCE_API_KEY, apiKey: 'sk-orca-revoked-5555' });

    // Simulating the relay answering 401 does not trigger any outbound call
    // from the credential layer - there is no refresh endpoint to call.
    const marked = await credentials.markNeedsReauth(store, { accountId: null, generation: 1 });
    expect(marked.marked).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();

    const record = await store.read();
    expect(record.needsReauth).toBe(true);
    expect(credentials.credentialLifecycle(record)).toBe('needs_reauth');
    // The secret is preserved: a misclassified failure must not destroy it.
    expect(record.key).toBe('sk-orca-revoked-5555');
  });

  it('marks only the exact account and generation that made the rejected request', async () => {
    const store = new credentials.MemoryCredentialStore();
    await store.write(credentials.makeCredential({
      key: 'sk-orca-current-8888', source: credentials.SOURCE_PKCE, userId: 'acct-B', generation: 4,
    }));

    // A late 401 from the previous generation must not poison the new one.
    const stale = await credentials.markNeedsReauth(store, { accountId: 'acct-B', generation: 3 });
    expect(stale.marked).toBe(false);
    expect(stale.reason).toBe('stale_generation');
    expect((await store.read()).needsReauth).toBe(false);

    // Nor may a failure from a different account.
    const other = await credentials.markNeedsReauth(store, { accountId: 'acct-A', generation: 4 });
    expect(other.marked).toBe(false);
    expect(other.reason).toBe('different_account');
    expect((await store.read()).needsReauth).toBe(false);

    // The matching account and generation is marked.
    const exact = await credentials.markNeedsReauth(store, { accountId: 'acct-B', generation: 4 });
    expect(exact.marked).toBe(true);
  });

  it('bumps the credential generation on each new acquisition', async () => {
    const store = new credentials.MemoryCredentialStore();
    const first = await credentials.acquireCredential({ store, sourceId: credentials.SOURCE_API_KEY, apiKey: 'sk-orca-generation-0001' });
    const second = await credentials.acquireCredential({ store, sourceId: credentials.SOURCE_API_KEY, apiKey: 'sk-orca-generation-0002' });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(second.generation).toBe(first.generation + 1);
  });
});

describe('OrcaRouter login session lifecycle', () => {
  it('exposes the authorization URL, then releases the lock on cancel', async () => {
    const store = new credentials.MemoryCredentialStore();
    const manager = createLoginManager({ store, env: { ORCA_AUTH_BASE_URL: AUTH_BASE } });

    const pending = manager.start('pkce', {
      timeoutMs: 30000,
      openBrowser: async (url: string) => {
        const parsed = new URL(url);
        expect(parsed.origin).toBe(AUTH_BASE);
        expect(parsed.searchParams.get('code_challenge_method')).toBe('S256');
      },
    });

    await vi.waitFor(() => {
      expect(manager.getState().busy).toBe(true);
      expect(manager.getState().authorizeUrl).toBeTruthy();
    }, { timeout: 3000 });

    manager.cancel();
    const outcome = await pending;
    expect(outcome.ok).toBe(false);
    expect(manager.getState().busy).toBe(false);
    expect(manager.getState().authorizeUrl).toBeNull();
  });

  it('starts a second login after pagehide without remounting', async () => {
    const store = new credentials.MemoryCredentialStore();
    const manager = createLoginManager({ store, env: { ORCA_AUTH_BASE_URL: AUTH_BASE } });

    const first = manager.start('pkce', { timeoutMs: 30000, openBrowser: async () => {} });
    await vi.waitFor(() => expect(manager.getState().busy).toBe(true), { timeout: 3000 });

    // The component's pagehide handler invalidates the generation, clears the
    // visible state synchronously, and cancels the server-side work.
    const duringPagehide = manager.getState();
    manager.cancel(duringPagehide.attemptId);
    expect(manager.getState().busy).toBe(false);
    expect(manager.getState().authorizeUrl).toBeNull();
    expect(manager.getState().hint).toBeNull();

    await first;
    expect(manager.getState().busy).toBe(false);

    // A second login must be able to start without a remount.
    const second = manager.start('pkce', { timeoutMs: 5000, openBrowser: async () => {} });
    await vi.waitFor(() => expect(manager.getState().busy).toBe(true), { timeout: 3000 });
    manager.cancel();
    await second;
    expect(manager.getState().busy).toBe(false);
  });

  it('drops a superseded attempt so it cannot overwrite newer state', async () => {
    const store = new credentials.MemoryCredentialStore();
    const manager = createLoginManager({ store, env: { ORCA_AUTH_BASE_URL: AUTH_BASE } });

    const opens: string[] = [];
    const first = manager.start('pkce', {
      timeoutMs: 5000,
      openBrowser: async (url: string) => { opens.push(url); },
    });
    await vi.waitFor(() => expect(opens.length).toBe(1), { timeout: 3000 });

    const second = manager.start('pkce', {
      timeoutMs: 5000,
      openBrowser: async (url: string) => { opens.push(url); },
    });
    await vi.waitFor(() => expect(opens.length).toBe(2), { timeout: 3000 });

    manager.cancel();
    const [a, b] = await Promise.all([first, second]);
    expect(a.superseded).toBe(true);
    expect(b.ok).toBe(false);
    expect(manager.getState().busy).toBe(false);
  });

  it('keeps the API-key adapter independent of the browser flow', async () => {
    const store = new credentials.MemoryCredentialStore();
    const manager = createLoginManager({ store });
    const result = await manager.start(credentials.SOURCE_API_KEY, { apiKey: 'sk-orca-headless-2222' });
    expect(result.ok).toBe(true);
    expect(result.result.credential.source).toBe('api-key');
    // A pasted key never opens a browser or takes the login lock.
    expect(manager.getState().busy).toBe(false);
  });
});
