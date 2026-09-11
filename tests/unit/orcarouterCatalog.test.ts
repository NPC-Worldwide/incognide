import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';

const requireCjs = createRequire(import.meta.url);
const catalog = requireCjs('../../src/services/orcarouter/catalog.js');
const origins = requireCjs('../../src/services/orcarouter/origins.js');

/**
 * Fixtures covering each capability the app can drive. Shapes mirror the live
 * OrcaRouter catalog records, including the metadata the filters depend on.
 */
const FIXTURES = [
  {
    id: 'openai/gpt-5.5',
    name: 'OpenAI: GPT-5.5',
    context_length: 400000,
    architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] },
    supported_endpoint_types: ['openai', 'openai-response'],
    reasoning: true,
    reasoning_efforts: ['low', 'medium', 'high', 'xhigh'],
  },
  {
    id: 'deepseek/deepseek-v4-pro',
    name: 'DeepSeek: V4 Pro',
    context_length: 128000,
    architecture: { input_modalities: ['text'], output_modalities: ['text'] },
    supported_endpoint_types: ['openai'],
    reasoning: true,
    reasoning_efforts: ['low', 'medium', 'high'],
  },
  {
    id: 'google/gemini-3.5-flash',
    name: 'Google: Gemini 3.5 Flash',
    context_length: 1000000,
    architecture: { input_modalities: ['text', 'image', 'audio', 'video'], output_modalities: ['text'] },
    supported_endpoint_types: ['gemini'],
    reasoning: true,
    reasoning_efforts: ['low', 'medium', 'high'],
  },
  {
    id: 'openai/gpt-image-1',
    name: 'OpenAI: GPT Image 1',
    architecture: { input_modalities: ['text'], output_modalities: ['image'] },
    supported_endpoint_types: ['image-generation'],
  },
  {
    id: 'openai/sora-2',
    name: 'OpenAI: Sora 2',
    architecture: { input_modalities: ['text'], output_modalities: ['video'] },
    supported_endpoint_types: ['openai-video'],
  },
  {
    id: 'openai/text-embedding-3-large',
    name: 'OpenAI: Embedding 3 Large',
    architecture: { input_modalities: ['text'], output_modalities: ['embedding'] },
    supported_endpoint_types: ['embeddings'],
  },
  {
    id: 'jina/jina-reranker-v2',
    name: 'Jina: Reranker v2',
    architecture: { input_modalities: ['text'], output_modalities: ['text'] },
    supported_endpoint_types: ['jina-rerank'],
  },
  {
    // Declares an OpenAI endpoint but no modalities at all: must fail closed
    // for any multimodal entry point rather than being assumed text-only.
    id: 'mystery/model-x',
    name: 'Mystery Model X',
    supported_endpoint_types: ['openai'],
  },
];

describe('OrcaRouter catalog parsing', () => {
  it('preserves the vendor/model namespace verbatim', () => {
    const model = catalog.normalizeModel(FIXTURES[0], 'orcarouter');
    expect(model.id).toBe('openai/gpt-5.5');
    expect(model.provider).toBe('orcarouter');
  });

  it('drops records it cannot read instead of guessing at them', () => {
    expect(catalog.normalizeModel(null, 'orcarouter')).toBeNull();
    expect(catalog.normalizeModel({ name: 'no id' }, 'orcarouter')).toBeNull();
    expect(catalog.normalizeModel({ id: '   ' }, 'orcarouter')).toBeNull();
    expect(catalog.normalizeModel('a-string', 'orcarouter')).toBeNull();
  });

  it('preserves the verified reasoning ladder and input modalities', () => {
    const model = catalog.normalizeModel(FIXTURES[0], 'orcarouter');
    expect(model.reasoning).toBe(true);
    expect(model.reasoning_efforts).toEqual(['low', 'medium', 'high', 'xhigh']);
    expect(model.architecture.input_modalities).toEqual(['text', 'image']);
    expect(model.context_length).toBe(400000);
  });
});

describe('OrcaRouter capability filtering', () => {
  it('keeps only text chat models and excludes non-text specialists', () => {
    const ids = catalog.filterByCapability(FIXTURES, { capability: catalog.CAPABILITY.CHAT }).map((m: any) => m.id);
    expect(ids).toContain('openai/gpt-5.5');
    expect(ids).toContain('deepseek/deepseek-v4-pro');
    expect(ids).toContain('google/gemini-3.5-flash');
    // Image generation, video, embedding and rerank are not chat models.
    expect(ids).not.toContain('openai/gpt-image-1');
    expect(ids).not.toContain('openai/sora-2');
    expect(ids).not.toContain('openai/text-embedding-3-large');
    expect(ids).not.toContain('jina/jina-reranker-v2');
  });

  it('requires a supported text endpoint type for chat', () => {
    const noEndpoint = [{ id: 'x/y', name: 'x/y', architecture: { input_modalities: ['text'] } }];
    expect(catalog.filterByCapability(noEndpoint, { capability: catalog.CAPABILITY.CHAT })).toHaveLength(0);
  });

  it('fails closed when an image attachment is required', () => {
    const ids = catalog.filterByCapability(FIXTURES, {
      capability: catalog.CAPABILITY.CHAT,
      inputModalities: ['text', 'image'],
    }).map((m: any) => m.id);

    expect(ids).toEqual(expect.arrayContaining(['openai/gpt-5.5', 'google/gemini-3.5-flash']));
    // Text-only models are gone.
    expect(ids).not.toContain('deepseek/deepseek-v4-pro');
    // A model that declares no modalities at all is not assumed capable.
    expect(ids).not.toContain('mystery/model-x');
  });

  it('fails closed for audio and video attachments', () => {
    const audio = catalog.filterByCapability(FIXTURES, {
      capability: catalog.CAPABILITY.CHAT, inputModalities: ['text', 'audio'],
    }).map((m: any) => m.id);
    expect(audio).toEqual(['google/gemini-3.5-flash']);

    const video = catalog.filterByCapability(FIXTURES, {
      capability: catalog.CAPABILITY.CHAT, inputModalities: ['text', 'video'],
    }).map((m: any) => m.id);
    expect(video).toEqual(['google/gemini-3.5-flash']);
  });

  it('selects embedding, image, video and rerank models by declared endpoint only', () => {
    expect(catalog.filterByCapability(FIXTURES, { capability: catalog.CAPABILITY.EMBEDDING }).map((m: any) => m.id))
      .toEqual(['openai/text-embedding-3-large']);
    expect(catalog.filterByCapability(FIXTURES, { capability: catalog.CAPABILITY.IMAGE }).map((m: any) => m.id))
      .toEqual(['openai/gpt-image-1']);
    expect(catalog.filterByCapability(FIXTURES, { capability: catalog.CAPABILITY.VIDEO }).map((m: any) => m.id))
      .toEqual(['openai/sora-2']);
    expect(catalog.filterByCapability(FIXTURES, { capability: catalog.CAPABILITY.RERANK }).map((m: any) => m.id))
      .toEqual(['jina/jina-reranker-v2']);
  });

  it('uses the documented capability query parameter', () => {
    expect(catalog.capabilityQuery('chat')).toBe('chat');
    expect(catalog.capabilityQuery('embedding')).toBe('embedding');
    expect(catalog.capabilityQuery('image')).toBe('image');
  });
});

describe('OrcaRouter live discovery', () => {
  it('requests the inference origin with the caller Bearer key and a capability filter', async () => {
    const calls: any[] = [];
    const fetchImpl = vi.fn(async (url: string, init: any) => {
      calls.push({ url, init });
      return { status: 200, ok: true, text: async () => JSON.stringify({ data: FIXTURES }) };
    });

    const result = await catalog.fetchCatalog({
      apiBase: origins.DEFAULT_API_BASE, apiKey: 'sk-orca-test-key', capability: 'chat', fetchImpl,
    });

    expect(result.ok).toBe(true);
    expect(calls[0].url).toBe('https://api.orcarouter.ai/v1/models?capability=chat');
    expect(calls[0].init.headers.Authorization).toBe('Bearer sk-orca-test-key');
    expect(result.models.length).toBe(FIXTURES.length);
  });

  it('never sends the key to the auth origin', async () => {
    const seen: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      seen.push(new URL(url).origin);
      return { status: 200, ok: true, text: async () => JSON.stringify({ data: [] }) };
    });
    await catalog.fetchCatalog({ apiBase: origins.DEFAULT_API_BASE, apiKey: 'sk-orca-test-key', fetchImpl });
    expect(seen).toEqual(['https://api.orcarouter.ai']);
  });

  it('bounds the response size and drops unreadable records', async () => {
    const huge = vi.fn(async () => ({ status: 200, ok: true, text: async () => 'x'.repeat(catalog.LIMITS.maxBytes + 1) }));
    const oversized = await catalog.fetchCatalog({ apiBase: origins.DEFAULT_API_BASE, fetchImpl: huge });
    expect(oversized.ok).toBe(false);
    expect(oversized.error).toBe('response_too_large');

    const mixed = vi.fn(async () => ({
      status: 200, ok: true,
      text: async () => JSON.stringify({ data: [FIXTURES[0], { name: 'no id' }, null, 42] }),
    }));
    const parsed = await catalog.fetchCatalog({ apiBase: origins.DEFAULT_API_BASE, fetchImpl: mixed });
    expect(parsed.ok).toBe(true);
    expect(parsed.models.map((m: any) => m.id)).toEqual(['openai/gpt-5.5']);
  });

  it('caps how many items it will read', async () => {
    const many = Array.from({ length: catalog.LIMITS.maxItems + 25 }, (_, i) => ({
      id: `vendor/model-${i}`, supported_endpoint_types: ['openai'], architecture: { input_modalities: ['text'] },
    }));
    const fetchImpl = vi.fn(async () => ({ status: 200, ok: true, text: async () => JSON.stringify({ data: many }) }));
    const result = await catalog.fetchCatalog({ apiBase: origins.DEFAULT_API_BASE, fetchImpl });
    expect(result.models.length).toBe(catalog.LIMITS.maxItems);
    expect(result.truncated).toBe(true);
  });

  it('reports auth and rate-limit failures distinctly', async () => {
    const unauthorized = vi.fn(async () => ({ status: 401, ok: false }));
    const auth = await catalog.fetchCatalog({ apiBase: origins.DEFAULT_API_BASE, fetchImpl: unauthorized });
    expect(auth.error).toBe('unauthorized');

    const limited = vi.fn(async () => ({ status: 429, ok: false }));
    expect((await catalog.fetchCatalog({ apiBase: origins.DEFAULT_API_BASE, fetchImpl: limited })).error).toBe('rate_limited');
  });

  it('treats a timeout or network failure as a discovery failure, not a crash', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('ETIMEDOUT'); });
    const result = await catalog.fetchCatalog({ apiBase: origins.DEFAULT_API_BASE, fetchImpl });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('network_error');
  });
});

describe('OrcaRouter catalog resolution and fallback', () => {
  it('treats a successful live fetch as authoritative and never merges the seed', async () => {
    const fetchImpl = vi.fn(async () => ({
      status: 200, ok: true,
      text: async () => JSON.stringify({ data: [FIXTURES[1]] }),
    }));

    const result = await catalog.resolveCatalog({
      apiBase: origins.DEFAULT_API_BASE, capability: 'chat', fetchImpl,
    });

    expect(result.source).toBe('live');
    expect(result.degraded).toBe(false);
    expect(result.models.map((m: any) => m.id)).toEqual(['deepseek/deepseek-v4-pro']);
    // No seed entry may appear in an authoritative result.
    expect(result.models.some((m: any) => m.seed)).toBe(false);
    expect(result.models.map((m: any) => m.id)).not.toContain('orcarouter/auto');
  });

  it('falls back to the verified seed, clearly labelled, when discovery fails', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('offline'); });
    const result = await catalog.resolveCatalog({ apiBase: origins.DEFAULT_API_BASE, capability: 'chat', fetchImpl });

    expect(result.ok).toBe(true);
    expect(result.source).toBe('seed');
    expect(result.degraded).toBe(true);
    expect(result.models.length).toBeGreaterThan(0);
    expect(result.models.every((m: any) => m.seed === true)).toBe(true);

    // The verified metadata survives the fallback.
    const gpt = result.models.find((m: any) => m.id === 'openai/gpt-5.5');
    expect(gpt.reasoning_efforts).toEqual(['low', 'medium', 'high', 'xhigh']);
    expect(gpt.context_length).toBe(400000);
    expect(gpt.architecture.input_modalities).toEqual(['text', 'image']);
  });

  it('filters the seed by capability too, so a degraded list is still correct', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('offline'); });

    const image = await catalog.resolveCatalog({ apiBase: origins.DEFAULT_API_BASE, capability: 'image', fetchImpl });
    expect(image.degraded).toBe(true);
    expect(image.models).toHaveLength(0); // the seed holds no image generator

    const multimodal = await catalog.resolveCatalog({
      apiBase: origins.DEFAULT_API_BASE, capability: 'chat', inputModalities: ['text', 'image'], fetchImpl,
    });
    // The seed's text-only entries must not survive an image requirement.
    expect(multimodal.models.map((m: any) => m.id)).not.toContain('deepseek/deepseek-v4-pro');
    expect(multimodal.models.map((m: any) => m.id)).not.toContain('orcarouter/auto');
  });

  it('prefers a last-known-good catalog over the seed during an outage', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('offline'); });
    const lastKnownGood = [
      { id: 'vendor/live-model-a', name: 'Live A', supported_endpoint_types: ['openai'], architecture: { input_modalities: ['text'] }, provider: 'orcarouter' },
    ];

    const result = await catalog.resolveCatalog({
      apiBase: origins.DEFAULT_API_BASE, capability: 'chat', fetchImpl, lastKnownGood,
    });

    expect(result.source).toBe('last_known_good');
    expect(result.degraded).toBe(true);
    expect(result.models.map((m: any) => m.id)).toEqual(['vendor/live-model-a']);
  });
});

describe('OrcaRouter persisted model revalidation', () => {
  it('invalidates a stored model that is no longer compatible', async () => {
    const models = catalog.filterByCapability(FIXTURES, { capability: 'chat' });
    expect(catalog.isStillCompatible(models, 'openai/gpt-5.5', { capability: 'chat' })).toBe(true);
    expect(catalog.isStillCompatible(models, 'openai/sora-2', { capability: 'chat' })).toBe(false);

    // A text model stops being valid once an image is attached.
    expect(catalog.isStillCompatible(models, 'deepseek/deepseek-v4-pro', {
      capability: 'chat', inputModalities: ['text', 'image'],
    })).toBe(false);
    expect(catalog.isStillCompatible(models, '', { capability: 'chat' })).toBe(false);
  });
});
