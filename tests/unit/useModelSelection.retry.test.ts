import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useModelSelection } from '../../src/renderer/hooks/useModelSelection';

const NAMES = ['deepseek', 'ollama', 'gemini', 'openrouter', 'perplexity', 'anthropic', 'orcarouter', 'moonshot', 'openai'];

const yamlConfig = () => ({ providers: NAMES.map((name) => ({ name, models: [] })) });

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe('useModelSelection loading resilience', () => {
    it('recovers when config load and provider fetches fail transiently', async () => {
        let configCalls = 0;
        (window as any).api.userModelsLoad = vi.fn(async () => {
            configCalls += 1;
            if (configCalls === 1) return { config: { providers: [] }, error: 'boom' };
            if (configCalls === 2) throw new Error('backend not ready');
            return { config: yamlConfig() };
        });
        const fetchCalls: Record<string, number> = {};
        (window as any).api.getProviderModels = vi.fn(async ({ provider }: any) => {
            fetchCalls[provider] = (fetchCalls[provider] || 0) + 1;
            if (fetchCalls[provider] <= 2) throw new Error('backend not ready');
            return { models: [{ id: `${provider}-a` }, { id: `${provider}-b` }] };
        });

        const { result, unmount } = renderHook(() => useModelSelection());
        for (let i = 0; i < 40 && result.current.availableModels.length < 18; i++) {
            await vi.advanceTimersByTimeAsync(5000);
        }

        const providers = new Set(result.current.availableModels.map((m: any) => m.provider));
        expect(providers.size).toBe(9);
        expect(result.current.availableModels).toHaveLength(18);
        unmount();
    });

    it('gives up bounded after persistent failure instead of retrying forever', async () => {
        (window as any).api.userModelsLoad = vi.fn(async () => ({ config: yamlConfig() }));
        const fetchMock = vi.fn(async () => {
            throw new Error('down');
        });
        (window as any).api.getProviderModels = fetchMock;

        const { result, unmount } = renderHook(() => useModelSelection());
        for (let i = 0; i < 40 && fetchMock.mock.calls.length < 63; i++) {
            await vi.advanceTimersByTimeAsync(5000);
        }

        expect(result.current.availableModels).toHaveLength(0);
        expect(fetchMock.mock.calls.length).toBeGreaterThan(9);
        expect(fetchMock.mock.calls.length).toBeLessThan(200);
        unmount();
    });
});
