import { describe, it, expect, vi } from 'vitest';
import { buildUpdatedProviders, createFileSerializer } from '../../src/ipc/team.js';

describe('buildUpdatedProviders', () => {
  it('adds a new provider with models', () => {
    const result = buildUpdatedProviders([], 'openai', ['gpt-4', 'gpt-3.5-turbo'], {});
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('openai');
    expect(result[0].provider_type).toBe('openai');
    expect(result[0].models).toEqual(['gpt-4', 'gpt-3.5-turbo']);
  });

  it('merges new models into an existing provider', () => {
    const providers = [{ name: 'openai', provider_type: 'openai', models: ['gpt-4'] }];
    const result = buildUpdatedProviders(providers, 'openai', ['gpt-3.5-turbo'], {});
    expect(result[0].models).toEqual(['gpt-4', 'gpt-3.5-turbo']);
  });

  it('does not duplicate models', () => {
    const providers = [{ name: 'openai', provider_type: 'openai', models: ['gpt-4'] }];
    const result = buildUpdatedProviders(providers, 'openai', ['gpt-4'], {});
    expect(result[0].models).toEqual(['gpt-4']);
  });

  it('clears models when null is passed', () => {
    const providers = [{ name: 'openai', provider_type: 'openai', models: ['gpt-4'] }];
    const result = buildUpdatedProviders(providers, 'openai', null, {});
    expect(result[0].models).toEqual([]);
  });

  it('preserves existing models when an empty array is passed', () => {
    const providers = [{ name: 'openai', provider_type: 'openai', models: ['gpt-4'] }];
    const result = buildUpdatedProviders(providers, 'openai', [], {});
    expect(result[0].models).toEqual(['gpt-4']);
  });

  it('matches existing provider by provider_type option', () => {
    const providers = [{ name: 'OpenAI', provider_type: 'openai', models: ['gpt-4'] }];
    const result = buildUpdatedProviders(providers, 'custom-openai', ['gpt-3.5-turbo'], { providerType: 'openai' });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('custom-openai');
    expect(result[0].models).toEqual(['gpt-4', 'gpt-3.5-turbo']);
  });

  it('adds api_url and api_key when provided', () => {
    const result = buildUpdatedProviders([], 'myllm', ['model-a'], { apiUrl: 'https://api.example.com', apiKey: 'secret' });
    expect(result[0].api_url).toBe('https://api.example.com');
    expect(result[0].api_key).toBe('secret');
  });
});

describe('createFileSerializer', () => {
  it('runs updates sequentially for the same file', async () => {
    const serializer = createFileSerializer();
    const seen: number[] = [];
    const update = (n: number) => async () => {
      seen.push(n);
      return n;
    };

    const p1 = serializer.run('/file', update(1));
    const p2 = serializer.run('/file', update(2));
    const results = await Promise.all([p1, p2]);

    expect(results).toEqual([1, 2]);
    expect(seen).toEqual([1, 2]);
  });

  it('does not block different files', async () => {
    const serializer = createFileSerializer();
    const order: string[] = [];
    const slow = (file: string) => async () => {
      await new Promise((r) => setTimeout(r, 30));
      order.push(file);
      return file;
    };

    const p1 = serializer.run('/a', slow('/a'));
    const p2 = serializer.run('/b', slow('/b'));
    const results = await Promise.all([p1, p2]);

    expect(results).toEqual(['/a', '/b']);
    expect(order).toEqual(['/a', '/b']);
  });

  it('continues the chain after a rejected update', async () => {
    const serializer = createFileSerializer();
    const seen: string[] = [];

    const first = serializer.run('/file', async () => {
      seen.push('fail');
      throw new Error('boom');
    });

    const second = serializer.run('/file', async () => {
      seen.push('recover');
      return 'ok';
    });

    await expect(first).rejects.toThrow('boom');
    expect(await second).toBe('ok');
    expect(seen).toEqual(['fail', 'recover']);
  });
});

describe('team provider update integration shape', () => {
  it('returns an error payload when updateProviderInTeamCtx rejects', async () => {
    const { register } = await import('../../src/ipc/team.js');
    const handlers: Record<string, Function> = {};
    const logs: string[] = [];

    register({
      ipcMain: { handle: (channel: string, fn: Function) => { handlers[channel] = fn; } },
      getMainWindow: () => ({ isDestroyed: () => false, webContents: { send: vi.fn() } }),
      log: (msg: string) => logs.push(msg),
    });

    const result = await handlers['team:update-provider']({}, { teamPath: '', providerName: 'x', models: [], options: {} });
    expect(result.error).toMatch(/No team path/);
    expect(logs.some((l) => l.includes('team:update-provider'))).toBe(true);
  });
});
