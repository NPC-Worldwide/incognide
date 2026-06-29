import React, { useState, useEffect } from 'react';
import { AlertCircle, X } from 'lucide-react';

const BackendErrorBanner: React.FC = () => {
  const [error, setError] = useState<{ message?: string; binaryPath?: string; exitCode?: number | null } | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const api = (window as any).api;
    if (!api) return;

    const verifyAndSet = async (err: any) => {
      if (!err) return;
      try {
        const health = await api.backendHealth?.();
        if (health?.status === 'ok') return;
      } catch {}
      setError(err);
    };

    const startupErrPromise = api.backendGetStartupError?.();
    if (startupErrPromise) {
      startupErrPromise.then(verifyAndSet).catch(() => {});
    }

    const unsubError = api.onBackendStartupError?.((data: any) => {
      verifyAndSet(data);
      setDismissed(false);
    });

    const unsubStarted = api.onBackendStarted?.(() => {
      setDismissed(true);
    });

    const iv = setInterval(async () => {
      try {
        const health = await api.backendHealth?.();
        if (health?.status === 'ok') {
          setError(null);
          setDismissed(true);
        }
      } catch {}
    }, 5000);

    return () => {
      unsubError?.();
      unsubStarted?.();
      clearInterval(iv);
    };
  }, []);

  if (!error || dismissed) return null;

  const exitCodeStr = error.exitCode !== null && error.exitCode !== undefined
    ? ` (exit code ${error.exitCode})`
    : '';

  const handleReportIssue = () => {
    const title = encodeURIComponent('AI backend failed to start');
    const body = encodeURIComponent(
      `**Describe the bug**\nAI backend failed to start${exitCodeStr}.\n\n` +
      `**Backend error message**\n${error.message || 'N/A'}\n\n` +
      `**Exit code**\n${error.exitCode ?? 'N/A'}\n\n` +
      `**Binary path**\n${error.binaryPath || 'N/A'}\n\n` +
      `**To Reproduce**\nSteps to reproduce the behavior:\n1. ...\n\n` +
      `**Expected behavior**\nA clear and concise description of what you expected to happen.`
    );
    const url = `https://github.com/NPC-Worldwide/incognide/issues/new?title=${title}&body=${body}`;
    (window as any).api?.openExternal?.(url);
  };

  return (
    <div className="relative flex flex-col w-full" style={{ pointerEvents: 'auto' }}>
      <div className="flex items-center gap-2 bg-yellow-900/90 border-b border-yellow-700 text-yellow-100 px-4 py-2 text-sm shadow-lg">
        <AlertCircle size={16} className="text-yellow-400 flex-shrink-0" />
        <span className="flex-1 min-w-0 truncate">
          AI backend failed to start{exitCodeStr}. You can continue without AI.
        </span>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleReportIssue}
            className="px-3 py-1 rounded bg-blue-700 hover:bg-blue-600 text-white text-xs transition-colors"
          >
            Report issue
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="px-3 py-1 rounded bg-yellow-800 hover:bg-yellow-700 text-yellow-100 text-xs transition-colors"
          >
            Continue without AI
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="p-1 rounded hover:bg-yellow-700 text-yellow-300 transition-colors"
            title="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default BackendErrorBanner;
