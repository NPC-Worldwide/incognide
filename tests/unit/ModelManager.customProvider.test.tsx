import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ModelManager from '../../src/renderer/components/ModelManager';

// Mock lucide-react icons so tests do not need SVG support.
vi.mock('lucide-react', () => ({
  DownloadCloud: () => <span data-testid="download-cloud-icon" />,
  Trash2: () => <span data-testid="trash-icon" />,
  MessageSquare: () => <span data-testid="message-icon" />,
  Send: () => <span data-testid="send-icon" />,
  X: () => <span data-testid="x-icon" />,
  ChevronRight: () => <span data-testid="chevron-icon" />,
  RefreshCw: () => <span data-testid="refresh-icon" />,
  Plus: () => <span data-testid="plus-icon" />,
  Globe: () => <span data-testid="globe-icon" />,
}));

// Mock npcts components that ModelManager imports but does not render directly.
vi.mock('npcts', () => ({
  Card: ({ children, title }: any) => (
    <div data-testid="npcts-card">
      {title && <div>{title}</div>}
      {children}
    </div>
  ),
  Button: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
  Input: ({ value, onChange, placeholder }: any) => (
    <input value={value || ''} onChange={onChange} placeholder={placeholder} />
  ),
}));

describe('ModelManager custom provider', () => {
  let storedProviders: Record<string, any> = {};

  beforeEach(() => {
    storedProviders = {};
    vi.clearAllMocks();

    const api = window.api as any;

    // Simulate no detected provider keys in the environment. This is the
    // common case for local LLM endpoints that do not require an API key.
    api.detectProviderKeys = vi.fn().mockResolvedValue([]);

    // Stateful custom provider persistence mock.
    api.customProvidersRead = vi.fn(async () => ({ providers: storedProviders }));
    api.customProvidersWrite = vi.fn(async (providers: Record<string, any>) => {
      storedProviders = providers;
      return { success: true };
    });

    // Local provider status checks.
    api.checkOllamaStatus = vi.fn().mockResolvedValue({ installed: false, running: false });
    api.getLocalModelStatus = vi.fn().mockResolvedValue({ installed: false, running: false });
    api.scanLocalModels = vi.fn().mockResolvedValue({ models: [] });
    api.getLocalOllamaModels = vi.fn().mockResolvedValue({ models: [] });

    // Simulate fetching models from a custom OpenAI-compatible endpoint.
    api.getProviderModels = vi.fn(async ({ provider }: any) => {
      if (provider === 'myllm') {
        return {
          models: [
            { id: 'myllm-model-a', name: 'My LLM Model A', provider: 'myllm' },
            { id: 'myllm-model-b', name: 'My LLM Model B', provider: 'myllm' },
          ],
        };
      }
      return { models: [] };
    });

    // Ollama pull event subscriptions (return cleanup functions).
    api.onOllamaPullProgress = vi.fn(() => () => {});
    api.onOllamaPullComplete = vi.fn(() => () => {});
    api.onOllamaPullError = vi.fn(() => () => {});
  });

  it('shows a custom provider added without an API key', async () => {
    const user = userEvent.setup();
    render(<ModelManager />);

    // Wait for the component to finish initial async loads.
    await waitFor(() => screen.getByText('All Providers'));

    // Open the add-provider form.
    const addButton = screen.getByText('Add Provider');
    await user.click(addButton);

    // Fill in the form, leaving the API key env var empty.
    const inputs = screen.getAllByRole('textbox');
    const nameInput = inputs.find((el) => el.getAttribute('placeholder')?.includes('myllm'));
    const urlInput = inputs.find((el) => el.getAttribute('placeholder')?.includes('api.example.com'));
    expect(nameInput).toBeDefined();
    expect(urlInput).toBeDefined();

    await user.clear(nameInput!);
    await user.type(nameInput!, 'myllm');
    await user.clear(urlInput!);
    await user.type(urlInput!, 'http://127.0.0.1:8123/v1');

    const saveButton = screen.getByText('Save', { selector: 'button' });
    await user.click(saveButton);

    // The custom provider should appear in the list even though no API key
    // environment variable is set.
    await waitFor(() => {
      expect(screen.getByText('Myllm')).toBeInTheDocument();
    });

    // It should be labelled as custom.
    expect(screen.getByText('custom')).toBeInTheDocument();
  });

  it('fetches models for a custom provider when expanded', async () => {
    const user = userEvent.setup();

    // Pre-seed a custom provider without an API key before rendering.
    storedProviders = {
      myllm: { base_url: 'http://127.0.0.1:8123/v1', api_key_var: '' },
    };

    render(<ModelManager />);

    await waitFor(() => screen.getByText('All Providers'));

    // Wait for the custom provider to appear.
    const providerButton = await waitFor(() => {
      const el = screen.getByText('Myllm');
      return el.closest('button');
    });
    expect(providerButton).toBeInTheDocument();

    // Expand the provider row.
    await user.click(providerButton!);

    // Refresh models.
    const refreshButton = await waitFor(() => screen.getByText('Refresh'));
    await user.click(refreshButton);

    // The mocked getProviderModels should have been called with the custom URL.
    await waitFor(() => {
      expect(window.api.getProviderModels).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'myllm',
          baseUrl: 'http://127.0.0.1:8123/v1',
          apiKeyVar: '',
        })
      );
    });

    // Models should appear (names come from the mocked getProviderModels response).
    await waitFor(() => {
      expect(screen.getByText('My LLM Model A')).toBeInTheDocument();
    });
  });
});
