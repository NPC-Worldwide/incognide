// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { fetchProviderModels } from '../../src/ipc/chat';

describe('fetchProviderModels with local OpenAI-style mock server', () => {
  let server: http.Server;
  let baseUrl: string;
  let lastRequest: { url?: string; headers?: http.IncomingHttpHeaders } | null = null;

  beforeAll(() => {
    return new Promise<void>((resolve) => {
      server = http.createServer((req, res) => {
        lastRequest = { url: req.url, headers: req.headers };

        if (req.url === '/v1/models') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            object: 'list',
            data: [
              { id: 'spoof-llama-3.1-8b', object: 'model', created: 1234567890, owned_by: 'local' },
              { id: 'spoof-qwen-2.5-7b', object: 'model', created: 1234567890, owned_by: 'local' },
            ],
          }));
          return;
        }

        if (req.url === '/v1/authed/models') {
          if (req.headers.authorization !== 'Bearer super-secret-key') {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Unauthorized' }));
            return;
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            object: 'list',
            data: [
              { id: 'authed-model-1', object: 'model' },
            ],
          }));
          return;
        }

        res.writeHead(404);
        res.end('Not found');
      });

      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          baseUrl = `http://127.0.0.1:${addr.port}/v1`;
        }
        resolve();
      });
    });
  });

  afterAll(() => {
    return new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  beforeEach(() => {
    lastRequest = null;
  });

  it('fetches spoofed models from a custom base URL without an API key', async () => {
    const result = await fetchProviderModels({
      provider: 'myllm',
      baseUrl,
      apiKeyVar: '',
    });

    expect(result.error).toBeUndefined();
    expect(result.models).toHaveLength(2);
    expect(result.models![0].id).toBe('spoof-llama-3.1-8b');
    expect(result.models![1].id).toBe('spoof-qwen-2.5-7b');
    expect(result.models![0].provider).toBe('myllm');

    expect(lastRequest?.url).toBe('/v1/models');
    expect(lastRequest?.headers?.authorization).toBeUndefined();
  });

  it('sends the API key when apiKeyVar is set and resolved from env', async () => {
    process.env.MYLLM_API_KEY = 'super-secret-key';
    const authedBaseUrl = baseUrl.replace('/v1', '/v1/authed');

    const result = await fetchProviderModels({
      provider: 'myllm',
      baseUrl: authedBaseUrl,
      apiKeyVar: 'MYLLM_API_KEY',
    });

    delete process.env.MYLLM_API_KEY;

    expect(result.error).toBeUndefined();
    expect(result.models).toHaveLength(1);
    expect(result.models![0].id).toBe('authed-model-1');
    expect(lastRequest?.headers?.authorization).toBe('Bearer super-secret-key');
  });

  it('returns an error when the custom endpoint rejects the request', async () => {
    const badBaseUrl = baseUrl.replace('/v1', '/v1/missing');

    const result = await fetchProviderModels({
      provider: 'badllm',
      baseUrl: badBaseUrl,
      apiKeyVar: '',
    });

    expect(result.models).toHaveLength(0);
    expect(result.error).toContain('404');
  });
});
