import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import OrcaRouterConfig, { OrcaRouterModelPicker } from '../../src/renderer/components/OrcaRouterConfig';

/** Catalog shaped like the live OrcaRouter response, resolved by a fake main process. */
const TEXT_ONLY = {
  id: 'deepseek/deepseek-v4-pro', name: 'DeepSeek: V4 Pro', provider: 'orcarouter',
  architecture: { input_modalities: ['text'], output_modalities: ['text'] },
  supported_endpoint_types: ['openai'], reasoning: true, reasoning_efforts: ['low', 'medium', 'high'],
};
const IMAGE_CAPABLE = {
  id: 'openai/gpt-5.5', name: 'OpenAI: GPT-5.5', provider: 'orcarouter',
  architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] },
  supported_endpoint_types: ['openai', 'openai-response'], reasoning: true,
  reasoning_efforts: ['low', 'medium', 'high', 'xhigh'],
};

const TEST_KEY = 'sk-orca-component-test-9999';

function installBridge(overrides: Record<string, any> = {}) {
  const calls: any[] = [];
  const bridge: any = {
    orcaRouterInfo: vi.fn(async () => ({
      runtime: { apiBase: 'https://api.orcarouter.ai/v1', authBase: 'https://www.orcarouter.ai' },
      encryptionAvailable: true,
    })),
    orcaRouterCredentialStatus: vi.fn(async () => ({ connected: false, source: null, maskedKey: null, needsReauth: false })),
    orcaRouterListModels: vi.fn(async (payload: any) => {
      calls.push(payload);
      // Stand in for the main-process capability filter.
      const imageRequired = (payload?.inputModalities || []).includes('image');
      const models = imageRequired ? [IMAGE_CAPABLE] : [TEXT_ONLY, IMAGE_CAPABLE];
      return { ok: true, models, source: 'live', degraded: false, total: models.length };
    }),
    orcaRouterLoginStart: vi.fn(async () => ({ ok: true, attemptId: 'orca-login-1', source: 'api-key', maskedKey: 'sk-orca-…9999', scope: 'api' })),
    orcaRouterLoginCancel: vi.fn(async () => ({ ok: true })),
    orcaRouterLoginState: vi.fn(async () => ({ busy: false, status: 'idle' })),
    orcaRouterDisconnect: vi.fn(async () => ({ ok: true })),
    orcaRouterSeedModels: vi.fn(async () => ({ ok: true, models: [], source: 'seed', degraded: true })),
    ...overrides,
  };
  (window as any).api = bridge;
  return { bridge, calls };
}

describe('OrcaRouter configuration UI', () => {
  beforeEach(() => {
    installBridge();
  });

  it('shows both authentication choices side by side and independently usable', async () => {
    render(<OrcaRouterConfig />);

    // API-key entry: a password-typed control, never a plain text field.
    const keyInput = await screen.findByTestId('orcarouter-api-key-input');
    expect(keyInput).toBeInTheDocument();
    expect(keyInput).toHaveAttribute('type', 'password');
    expect(keyInput).toHaveAttribute('autocomplete', 'off');

    // PKCE entry: a distinct, independently enabled control.
    expect(screen.getByTestId('orcarouter-connect')).toBeInTheDocument();
    expect(screen.getByTestId('orcarouter-connect')).toHaveTextContent(/Connect with OrcaRouter/i);

    // The two are separately identifiable, not merged into one button.
    expect(screen.getByTestId('orcarouter-api-key-method')).toBeInTheDocument();
    expect(screen.getByTestId('orcarouter-pkce-method')).toBeInTheDocument();
  });

  it('saves a pasted API key without starting a PKCE login', async () => {
    const { bridge } = installBridge();
    render(<OrcaRouterConfig />);

    const input = await screen.findByTestId('orcarouter-api-key-input');
    fireEvent.change(input, { target: { value: TEST_KEY } });
    fireEvent.click(screen.getByTestId('orcarouter-api-key-save'));

    await waitFor(() => expect(bridge.orcaRouterLoginStart).toHaveBeenCalledTimes(1));
    expect(bridge.orcaRouterLoginStart).toHaveBeenCalledWith({ source: 'api-key', apiKey: TEST_KEY });
  });

  it('starts the PKCE flow through the connect adapter, not the key field', async () => {
    const { bridge } = installBridge();
    render(<OrcaRouterConfig />);

    fireEvent.click(await screen.findByTestId('orcarouter-connect'));

    await waitFor(() => expect(bridge.orcaRouterLoginStart).toHaveBeenCalledTimes(1));
    expect(bridge.orcaRouterLoginStart).toHaveBeenCalledWith({ source: 'pkce' });
  });

  it('masks the stored credential and never renders the raw key', async () => {
    installBridge({
      orcaRouterCredentialStatus: vi.fn(async () => ({
        connected: true, source: 'pkce', maskedKey: 'sk-orca-…9999', lifecycle: 'durable_key_grant', needsReauth: false, generation: 2,
      })),
    });
    render(<OrcaRouterConfig />);

    const masked = await screen.findByTestId('orcarouter-masked-key');
    expect(masked).toHaveTextContent('sk-orca-…9999');
    // The component must never receive or print the full secret.
    expect(document.body.textContent).not.toContain(TEST_KEY);
    expect(document.body.textContent).not.toContain('component-test');
  });

  it('surfaces a reconnect requirement instead of a dead credential', async () => {
    installBridge({
      orcaRouterCredentialStatus: vi.fn(async () => ({
        connected: true, source: 'pkce', maskedKey: 'sk-orca-…9999', needsReauth: true, lifecycle: 'needs_reauth',
      })),
    });
    render(<OrcaRouterConfig />);
    expect(await screen.findByTestId('orcarouter-needs-reauth')).toBeInTheDocument();
  });

  it('reports a scope downgrade rather than assuming the requested scope', async () => {
    installBridge({
      orcaRouterLoginStart: vi.fn(async () => ({
        ok: true, attemptId: 'a1', source: 'pkce', maskedKey: 'sk-orca-…9999',
        scope: 'api', scopeWarning: 'OrcaRouter granted scope "api", not "connector".',
      })),
    });
    render(<OrcaRouterConfig />);
    fireEvent.click(await screen.findByTestId('orcarouter-connect'));
    await waitFor(() => expect(screen.getByTestId('orcarouter-error')).toHaveTextContent(/granted scope "api", not "connector"/));
  });

  it('clears the busy state on cancel without waiting for the aborted request', async () => {
    const { bridge } = installBridge({
      orcaRouterLoginStart: vi.fn(() => new Promise(() => {})), // never settles
      orcaRouterLoginState: vi.fn(async () => ({ busy: true, attemptId: 'orca-login-2', status: 'waiting_for_browser', authorizeUrl: 'https://www.orcarouter.ai/auth?x=1' })),
    });
    render(<OrcaRouterConfig />);

    fireEvent.click(await screen.findByTestId('orcarouter-connect'));
    const cancel = await screen.findByTestId('orcarouter-cancel');
    expect(screen.getByTestId('orcarouter-connect')).toBeDisabled();

    fireEvent.click(cancel);
    await waitFor(() => expect(bridge.orcaRouterLoginCancel).toHaveBeenCalled());
    // Busy must clear synchronously in the handler, not via the guarded finally.
    await waitFor(() => expect(screen.queryByTestId('orcarouter-cancel')).toBeNull());
  });
});

describe('OrcaRouter model selector options', () => {
  beforeEach(() => {
    installBridge();
  });

  it('renders options produced by the main-process discovery call, not free text', async () => {
    const { calls } = installBridge();
    render(<OrcaRouterModelPicker capability="chat" inputModalities={['text']} selectedModel={null} onSelect={() => {}} />);

    fireEvent.click(await screen.findByTestId('orca-model-trigger'));
    const panel = await screen.findByTestId('orca-model-panel');

    expect(calls[0]).toEqual({ capability: 'chat', inputModalities: ['text'] });
    const options = within(panel).getAllByRole('option');
    expect(options).toHaveLength(2);
    expect(options.map((o) => o.getAttribute('data-model-id'))).toEqual(
      expect.arrayContaining(['deepseek/deepseek-v4-pro', 'openai/gpt-5.5'])
    );
    // There is no free-text fallback anywhere in the panel.
    expect(within(panel).queryByRole('textbox')).not.toBeNull(); // the search box
    expect(panel.querySelector('input[list]')).toBeNull();
  });

  it('drops text-only models from the options once an image is attached', async () => {
    render(
      <OrcaRouterModelPicker capability="chat" inputModalities={['text', 'image']} selectedModel={null} onSelect={() => {}} />
    );

    fireEvent.click(await screen.findByTestId('orca-model-trigger'));
    const panel = await screen.findByTestId('orca-model-panel');

    const ids = within(panel).getAllByRole('option').map((o) => o.getAttribute('data-model-id'));
    expect(ids).toEqual(['openai/gpt-5.5']);
    expect(ids).not.toContain('deepseek/deepseek-v4-pro');
  });

  it('clears a selected model that is no longer compatible', async () => {
    const onSelect = vi.fn();
    const { rerender } = render(
      <OrcaRouterModelPicker capability="chat" inputModalities={['text']} selectedModel={null} onSelect={onSelect} />
    );

    // The user picks a text-only model.
    fireEvent.click(await screen.findByTestId('orca-model-trigger'));
    const textOnlyOption = (await screen.findAllByTestId('orca-model-option'))
      .find((o) => o.getAttribute('data-model-id') === 'deepseek/deepseek-v4-pro')!;
    fireEvent.click(textOnlyOption);

    // Then attaches an image: the text-only selection must be dropped.
    rerender(
      <OrcaRouterModelPicker capability="chat" inputModalities={['text', 'image']} selectedModel="deepseek/deepseek-v4-pro" onSelect={onSelect} />
    );
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith(null));
  });

  it('labels a degraded catalog and offers a retry instead of free input', async () => {
    installBridge({
      orcaRouterListModels: vi.fn(async () => ({
        ok: true, source: 'seed', degraded: true,
        models: [{ ...TEXT_ONLY, seed: true }],
        message: 'Could not reach the OrcaRouter model catalog.',
      })),
    });
    render(<OrcaRouterModelPicker capability="chat" inputModalities={['text']} selectedModel={null} onSelect={() => {}} />);

    const degraded = await screen.findByTestId('orca-model-degraded');
    expect(degraded).toHaveTextContent(/verified fallback list/i);
    expect(within(degraded).getByText('Retry')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('orca-model-trigger'));
    const options = within(await screen.findByTestId('orca-model-panel')).getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent('fallback');
  });

  it('shows an explicit empty state when no model matches the capability', async () => {
    installBridge({
      orcaRouterListModels: vi.fn(async () => ({ ok: true, models: [], source: 'live', degraded: false, total: 0 })),
    });
    render(<OrcaRouterModelPicker capability="image" inputModalities={['text']} selectedModel={null} onSelect={() => {}} />);

    fireEvent.click(await screen.findByTestId('orca-model-trigger'));
    expect(await screen.findByTestId('orca-model-empty')).toHaveTextContent(/No compatible models/i);
  });
});
