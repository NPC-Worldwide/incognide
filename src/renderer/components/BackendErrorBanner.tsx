import React, { useState, useEffect, useRef } from 'react';
import { AlertCircle, X, ChevronDown, ChevronUp } from 'lucide-react';

interface PythonResult {
  found: boolean;
  pythonPath: string | null;
  version: string | null;
}

interface InstallResult {
  success: boolean;
  error?: string;
}

type ExtrasOption = 'lite' | 'local';

const BackendErrorBanner: React.FC = () => {
  const [error, setError] = useState<{ message?: string; binaryPath?: string; exitCode?: number | null } | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

  // Local Python detection
  const [detecting, setDetecting] = useState(false);
  const [pythonResult, setPythonResult] = useState<PythonResult | null>(null);

  // Install state
  const [extras, setExtras] = useState<ExtrasOption>('lite');
  const [installing, setInstalling] = useState(false);
  const [installDone, setInstallDone] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);
  const [progressLines, setProgressLines] = useState<string[]>([]);
  const progressEndRef = useRef<HTMLDivElement>(null);

  // On mount: query for existing startup error, and listen for future ones
  useEffect(() => {
    const api = (window as any).api;
    if (!api) return;

    // Verify backend is actually unreachable before showing. If health check passes,
    // a running backend (e.g. dev server) means no need for the banner.
    const verifyAndSet = async (err: any) => {
      if (!err) return;
      try {
        const health = await api.backendHealth?.();
        if (health?.status === 'ok') return;
      } catch {}
      setError(err);
    };

    api.backendGetStartupError?.().then(verifyAndSet).catch(() => {});

    const unsubError = api.onBackendStartupError?.((data: any) => {
      verifyAndSet(data).then(() => setDismissed(false));
    });

    const unsubStarted = api.onBackendStarted?.(() => {
      setDismissed(true);
      setInstallDone(true);
    });

    // Periodically re-check — if backend comes up later, auto-dismiss
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

  // Auto-scroll progress log
  useEffect(() => {
    progressEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [progressLines]);

  const handleDetectPython = async () => {
    setDetecting(true);
    setPythonResult(null);
    setInstallError(null);
    try {
      const result: PythonResult = await (window as any).api?.backendTryLocalPython?.();
      setPythonResult(result);
    } catch (e: any) {
      setPythonResult({ found: false, pythonPath: null, version: null });
    }
    setDetecting(false);
  };

  const handleOpenPanel = () => {
    setPanelOpen(true);
    handleDetectPython();
  };

  const handleInstall = async () => {
    if (!pythonResult?.pythonPath) return;
    setInstalling(true);
    setInstallError(null);
    setProgressLines([]);
    setInstallDone(false);

    const api = (window as any).api;
    const unsub = api?.onBackendInstallProgress?.((data: { text: string }) => {
      setProgressLines(prev => [...prev, data.text]);
    });

    try {
      const result: InstallResult = await api?.backendInstallAndStart?.({
        pythonPath: pythonResult.pythonPath,
        npcpyExtras: extras,
      });
      if (result?.success) {
        setInstallDone(true);
        setError(null);
      } else {
        setInstallError(result?.error || 'Installation failed');
      }
    } catch (e: any) {
      setInstallError(e.message || 'Installation failed');
    } finally {
      unsub?.();
      setInstalling(false);
    }
  };

  // Nothing to show if no error or user dismissed and backend isn't needed
  if (!error || dismissed) return null;

  const exitCodeStr = error.exitCode !== null && error.exitCode !== undefined
    ? ` (exit code ${error.exitCode})`
    : '';

  return (
    <div className="relative flex flex-col w-full" style={{ pointerEvents: 'auto' }}>
      {/* Main banner bar */}
      <div className="flex items-center gap-2 bg-yellow-900/90 border-b border-yellow-700 text-yellow-100 px-4 py-2 text-sm shadow-lg">
        <AlertCircle size={16} className="text-yellow-400 flex-shrink-0" />
        <span className="flex-1 min-w-0 truncate">
          AI backend failed to start{exitCodeStr}. You can continue without AI, or try a local Python install.
        </span>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => setDismissed(true)}
            className="px-3 py-1 rounded bg-yellow-800 hover:bg-yellow-700 text-yellow-100 text-xs transition-colors"
          >
            Continue without AI
          </button>
          <button
            onClick={panelOpen ? () => setPanelOpen(false) : handleOpenPanel}
            className="flex items-center gap-1 px-3 py-1 rounded bg-blue-700 hover:bg-blue-600 text-white text-xs transition-colors"
          >
            Try local Python
            {panelOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
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

      {/* Expanded panel */}
      {panelOpen && (
        <div className="bg-gray-900 border-b border-gray-700 px-4 py-3 shadow-xl">
          {/* Python detection */}
          <div className="mb-3">
            {detecting && (
              <div className="text-gray-400 text-xs">Searching for Python 3.10+...</div>
            )}
            {!detecting && pythonResult === null && (
              <div className="text-gray-400 text-xs">Detecting local Python...</div>
            )}
            {!detecting && pythonResult !== null && (
              pythonResult.found ? (
                <div className="text-green-400 text-xs font-mono">
                  Found Python {pythonResult.version} at: {pythonResult.pythonPath}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-red-400 text-xs">No Python 3.10+ found on this system.</span>
                  <button
                    onClick={handleDetectPython}
                    className="text-xs text-blue-400 hover:text-blue-300 underline"
                  >
                    Retry
                  </button>
                </div>
              )
            )}
          </div>

          {/* Options + install button — only show if python was found */}
          {pythonResult?.found && !installDone && (
            <div className="flex items-center gap-3 mb-3">
              <label className="text-gray-400 text-xs whitespace-nowrap">npcpy extras:</label>
              <select
                value={extras}
                onChange={e => setExtras(e.target.value as ExtrasOption)}
                disabled={installing}
                className="bg-gray-800 border border-gray-600 text-gray-100 text-xs rounded px-2 py-1"
              >
                <option value="lite">lite (recommended)</option>
                <option value="local">local (larger, includes local model support)</option>
              </select>
              <button
                onClick={handleInstall}
                disabled={installing}
                className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs transition-colors"
              >
                {installing ? 'Installing...' : 'Install & Start'}
              </button>
            </div>
          )}

          {/* Progress log */}
          {progressLines.length > 0 && (
            <div className="bg-black rounded border border-gray-700 p-2 max-h-40 overflow-y-auto font-mono text-xs text-gray-300 mb-2">
              {progressLines.map((line, i) => (
                <div key={i}>{line}</div>
              ))}
              <div ref={progressEndRef} />
            </div>
          )}

          {/* Success */}
          {installDone && (
            <div className="text-green-400 text-xs font-medium">
              AI backend started successfully. You can dismiss this banner.
            </div>
          )}

          {/* Error */}
          {installError && (
            <div className="text-red-400 text-xs">
              Error: {installError}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default BackendErrorBanner;
