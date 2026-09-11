import React from 'react';
import ReactDOM from 'react-dom/client';
import OrcaRouterConfig from '../../src/renderer/components/OrcaRouterConfig';
import '../../src/index.css';

/**
 * Evidence harness.
 *
 * Wires the real OrcaRouterConfig to a bridge that behaves like the Electron
 * main process: catalog requests go to the harness endpoint, which applies the
 * shipped capability filters. No credential ever reaches this page - the
 * status call returns a masked key only.
 */

const bridge: any = {
  orcaRouterInfo: async () => ({
    runtime: { authBase: 'https://www.orcarouter.ai', apiBase: 'https://api.orcarouter.ai/v1' },
    encryptionAvailable: true,
  }),
  orcaRouterCredentialStatus: async () => ({
    connected: true, source: 'api-key', maskedKey: 'sk-orca-…TEST', scope: 'api',
    lifecycle: 'user_supplied_key', needsReauth: false, generation: 1,
  }),
  orcaRouterListModels: async (payload: any) => {
    const params = new URLSearchParams({
      capability: payload?.capability || 'chat',
      inputModalities: (payload?.inputModalities || ['text']).join(','),
    });
    const res = await fetch(`/orca-evidence/catalog?${params}`);
    return res.json();
  },
  orcaRouterSeedModels: async () => ({ ok: true, models: [], source: 'seed', degraded: true }),
  orcaRouterLoginStart: async () => ({ ok: false, attemptId: 'evidence', source: 'pkce', error: 'evidence_mode', message: 'Evidence harness: no live authorization is performed.' }),
  orcaRouterLoginCancel: async () => ({ ok: true }),
  orcaRouterLoginState: async () => ({ busy: false, status: 'idle' }),
  orcaRouterDisconnect: async () => ({ ok: true }),
  orcaRouterValidateModel: async () => ({ ok: true, valid: true }),
};

(window as any).api = bridge;

const Root = () => {
  // Drives the attachment state so the multimodal run uses the same component
  // the app uses, with the attachment changing the requested modalities.
  const [modalities, setModalities] = React.useState<string[]>(['text']);

  React.useEffect(() => {
    (window as any).__setModalities = (next: string[]) => setModalities(next);
  }, []);

  return (
    <div style={{ background: '#0f172a', minHeight: '100vh', padding: 16, width: 720 }}>
      <OrcaRouterConfig capability="chat" inputModalities={modalities} />
      <div style={{ marginTop: 12, color: '#94a3b8', fontSize: 11 }} data-testid="current-modalities">
        input modalities: {modalities.join(', ')}
      </div>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(<Root />);
