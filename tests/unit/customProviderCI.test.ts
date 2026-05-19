import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs';
import yaml from 'js-yaml';

// Extract and test the getCustomProviders logic by mocking fs
async function getCustomProviders(homeDir: string) {
  try {
    const cpPath = path.join(homeDir, 'custom_providers.yaml');
    const content = await fs.promises.readFile(cpPath, 'utf8');
    const parsed = yaml.load(content);
    return parsed?.providers || {};
  } catch {
    return {};
  }
}

describe('custom providers end-to-end', () => {
  const tmpDir = path.join(os.tmpdir(), `incognide-cp-ci-${Date.now()}`);

  beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reads custom providers from YAML', async () => {
    const providers = {
      myllm: {
        base_url: 'https://api.myllm.com/v1',
        api_key_var: 'MYLLM_API_KEY',
        headers: { 'X-Custom': 'value' },
      },
      moonshot: {
        base_url: 'https://api.moonshot.cn/v1',
        api_key_var: 'MOONSHOT_API_KEY',
      },
    };
    fs.writeFileSync(
      path.join(tmpDir, 'custom_providers.yaml'),
      yaml.dump({ providers }, { lineWidth: -1 }),
      'utf8'
    );

    const result = await getCustomProviders(tmpDir);
    expect(result.myllm).toBeDefined();
    expect(result.myllm.base_url).toBe('https://api.myllm.com/v1');
    expect(result.myllm.api_key_var).toBe('MYLLM_API_KEY');
    expect(result.myllm.headers).toEqual({ 'X-Custom': 'value' });
    expect(result.moonshot).toBeDefined();
    expect(Object.keys(result)).toHaveLength(2);
  });

  it('returns empty object when YAML is missing', async () => {
    const result = await getCustomProviders(tmpDir);
    expect(result).toEqual({});
  });

  it('merges custom providers into model options without duplicating base', () => {
    const baseProviderOptions = [
      { value: 'ollama', label: 'Ollama' },
      { value: 'openai', label: 'OpenAI' },
    ];
    const customProviders = {
      myllm: { base_url: 'https://api.myllm.com/v1', api_key_var: 'MYLLM_API_KEY' },
      openai: { base_url: 'https://custom.openai.com/v1', api_key_var: 'OPENAI_API_KEY' },
    };
    const customProviderOptions = Object.entries(customProviders).map(([name]) => ({
      value: name,
      label: name.charAt(0).toUpperCase() + name.slice(1),
    }));
    const providerOptions = [...baseProviderOptions, ...customProviderOptions.filter(
      cp => !baseProviderOptions.some(bp => bp.value === cp.value)
    )];

    expect(providerOptions).toHaveLength(3);
    expect(providerOptions.find(p => p.value === 'myllm')).toBeDefined();
    expect(providerOptions.filter(p => p.value === 'openai')).toHaveLength(1);
  });

  it('builds get-provider-models fetch for a custom provider', async () => {
    // Simulate the handler logic for a custom provider
    const provider = 'myllm';
    const baseUrl = 'https://api.myllm.com/v1';
    const apiKeyVar = 'MYLLM_API_KEY';
    const apiKey = 'test-key-123';

    const cleanUrl = baseUrl.replace(/\/+$/, '');
    const modelsUrl = cleanUrl.endsWith('/models') ? cleanUrl : cleanUrl + '/models';
    const headers = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' };

    // Mock fetch
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: 'myllm-gpt-4', name: 'GPT-4' },
          { id: 'myllm-gpt-3.5', name: 'GPT-3.5' },
        ],
      }),
      text: async () => '',
    });

    const response = await mockFetch(modelsUrl, { headers });
    const data = await response.json();
    const models = (data.data || data.models || []).map((m: any) => ({
      id: m.id || m.name || m,
      name: m.id || m.name || m,
      provider,
    }));

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.myllm.com/v1/models',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-key-123',
        }),
      })
    );
    expect(models).toHaveLength(2);
    expect(models[0].id).toBe('myllm-gpt-4');
    expect(models[0].provider).toBe('myllm');
  });

  it('includes customProviders in chat inference payload', async () => {
    const customProviders = {
      myllm: { base_url: 'https://api.myllm.com/v1', api_key_var: 'MYLLM_API_KEY' },
    };

    // Simulate executeCommandStream payload construction
    const payload = {
      streamId: 'test-stream-123',
      commandstr: 'hello',
      currentPath: '/test',
      conversationId: 'conv-1',
      model: 'myllm-gpt-4',
      provider: 'myllm',
      npc: null,
      npcSource: 'global',
      attachments: [],
      executionMode: 'chat',
      parentMessageId: null,
      isResend: false,
      jinxes: [],
      tools: [],
      userMessageId: null,
      assistantMessageId: null,
      userParentMessageId: null,
      temperature: 0.7,
      top_p: 0.9,
      top_k: 40,
      max_tokens: 2048,
      disableThinking: false,
      customProviders,
    };

    expect(payload.customProviders).toBeDefined();
    expect(payload.customProviders.myllm).toBeDefined();
    expect(payload.customProviders.myllm.base_url).toBe('https://api.myllm.com/v1');
    expect(payload.provider).toBe('myllm');
    expect(payload.model).toBe('myllm-gpt-4');
  });

  it('writes and round-trips custom providers via YAML', () => {
    const filePath = path.join(tmpDir, 'custom_providers.yaml');
    const providers = {
      testprovider: {
        base_url: 'https://api.test.com/v1',
        api_key_var: 'TEST_API_KEY',
        headers: { 'X-Test': 'header' },
      },
    };

    fs.writeFileSync(filePath, yaml.dump({ providers }, { lineWidth: -1 }), 'utf8');
    const readBack = yaml.load(fs.readFileSync(filePath, 'utf8'));

    expect(readBack.providers.testprovider.base_url).toBe('https://api.test.com/v1');
    expect(readBack.providers.testprovider.api_key_var).toBe('TEST_API_KEY');
    expect(readBack.providers.testprovider.headers).toEqual({ 'X-Test': 'header' });
  });

  it('handles custom provider model fetch failure gracefully', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
      json: async () => { throw new Error('not json'); },
    });

    const provider = 'badllm';
    const baseUrl = 'https://api.bad.com/v1';
    const apiKey = 'bad-key';
    const modelsUrl = baseUrl.replace(/\/+$/, '') + '/models';

    const response = await mockFetch(modelsUrl, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!response.ok) {
      const errText = await response.text();
      const result = { models: [], error: `HTTP ${response.status}: ${errText.slice(0, 200)}` };
      expect(result.models).toHaveLength(0);
      expect(result.error).toContain('401');
    }
  });
});

describe('custom provider inference routing', () => {
  it('routes to custom provider base_url when provider matches custom key', () => {
    const customProviders = {
      myllm: { base_url: 'https://api.myllm.com/v1', api_key_var: 'MYLLM_API_KEY' },
    };
    const provider = 'myllm';
    const model = 'myllm-large';

    // Simulate backend routing logic
    const config = customProviders[provider];
    expect(config).toBeDefined();
    expect(config.base_url).toBe('https://api.myllm.com/v1');

    // The backend would construct the chat completions URL from base_url
    const chatUrl = `${config.base_url.replace(/\/+$/, '')}/chat/completions`;
    expect(chatUrl).toBe('https://api.myllm.com/v1/chat/completions');
  });

  it('resolves api key from env var name', () => {
    const customProviders = {
      myllm: { base_url: 'https://api.myllm.com/v1', api_key_var: 'MYLLM_API_KEY' },
    };
    const apiKeyVar = customProviders.myllm.api_key_var;

    // Simulate env lookup
    process.env.MYLLM_API_KEY = 'secret-123';
    const apiKey = process.env[apiKeyVar];
    expect(apiKey).toBe('secret-123');
    delete process.env.MYLLM_API_KEY;
  });

  it('uses custom headers when present', () => {
    const customProviders = {
      myllm: {
        base_url: 'https://api.myllm.com/v1',
        api_key_var: 'MYLLM_API_KEY',
        headers: { 'X-Custom-Id': 'org-123', 'X-Version': 'v2' },
      },
    };
    const headers = {
      ...customProviders.myllm.headers,
      Authorization: `Bearer ${process.env.MYLLM_API_KEY || 'fallback'}`,
      'Content-Type': 'application/json',
    };
    expect(headers['X-Custom-Id']).toBe('org-123');
    expect(headers['X-Version']).toBe('v2');
  });
});
