import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ClerkProvider } from '@clerk/clerk-react';
import Enpistu from './components/Enpistu';
import SetupWizard from './components/SetupWizard';
import AppTutorial from './components/AppTutorial';
import { AuthProvider } from './components/AuthProvider';
import { AiFeatureProvider } from './components/AiFeatureContext';

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || '';

const AuthWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  if (!CLERK_PUBLISHABLE_KEY) {
    return <>{children}</>;
  }
  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY}>
      <AuthProvider>
        {children}
      </AuthProvider>
    </ClerkProvider>
  );
};

/**
 * Wait until a data-tutorial element is present in the DOM,
 * indicating Enpistu has fully mounted and rendered its UI.
 * Polls briefly then resolves. Rejects after timeout so we
 * don't hang forever if something unexpected happens.
 */
function waitForEnpistuReady(timeoutMs = 5000): Promise<void> {
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      if (document.querySelector('[data-tutorial]')) {
        resolve();
      } else if (Date.now() - start > timeoutMs) {
        // Enpistu never rendered tutorial targets — resolve anyway
        // so the app isn't stuck, but tutorial will gracefully degrade
        resolve();
      } else {
        requestAnimationFrame(check);
      }
    };
    check();
  });
}

const App: React.FC = () => {
  const [showSetup, setShowSetup] = useState<boolean | null>(null);
  const [showTutorial, setShowTutorial] = useState(false);
  // Tracks whether Enpistu has mounted and rendered its tutorial targets.
  // The tutorial overlay is only shown once this is true, preventing the
  // tutorial from rendering on top of a half-loaded or absent Enpistu UI.
  const [tutorialReady, setTutorialReady] = useState(false);
  // Whether we want the tutorial after setup finishes (deferred until Enpistu mounts)
  const pendingTutorialRef = useRef(false);

  useEffect(() => {
    const checkSetup = async () => {
      try {
        const result = await (window as any).api?.setupCheckNeeded?.();
        const needed = result?.needed ?? false;
        setShowSetup(needed);

        if (!needed) {
          const profile = await (window as any).api?.profileGet?.();
          if (profile && profile.setupComplete && !profile.tutorialComplete) {
            // Don't show tutorial immediately — wait for Enpistu to mount
            pendingTutorialRef.current = true;
          }
        }
      } catch (err) {
        console.error('Error checking setup:', err);
        setShowSetup(false);
      }
    };
    checkSetup();
  }, []);

  // When Enpistu is rendered (showSetup becomes false) and we have a pending
  // tutorial, wait for its DOM to be ready before showing the tutorial overlay.
  useEffect(() => {
    if (showSetup !== false) return;
    if (!pendingTutorialRef.current) return;

    let cancelled = false;
    waitForEnpistuReady().then(() => {
      if (!cancelled) {
        pendingTutorialRef.current = false;
        setTutorialReady(true);
        setShowTutorial(true);
      }
    });
    return () => { cancelled = true; };
  }, [showSetup]);

  const handleSetupComplete = useCallback(async () => {
    // Mark that we want the tutorial after Enpistu mounts
    try {
      const profile = await (window as any).api?.profileGet?.();
      if (!profile?.tutorialComplete) {
        pendingTutorialRef.current = true;
      }
    } catch {
      pendingTutorialRef.current = true;
    }
    // This triggers a render where Enpistu mounts; the useEffect above
    // will detect the pending tutorial and wait for DOM readiness.
    setShowSetup(false);
  }, []);

  const handleTutorialComplete = useCallback(async () => {
    setShowTutorial(false);
    setTutorialReady(false);
    try {
      await (window as any).api?.profileSave?.({ tutorialComplete: true });
    } catch (err) {
      console.error('Error saving tutorial state:', err);
    }
  }, []);

  if (showSetup === null) {
    return (
      <div className="fixed inset-0 bg-gray-900 flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  if (showSetup) {
    return (
      <AuthWrapper>
        <SetupWizard onComplete={handleSetupComplete} />
      </AuthWrapper>
    );
  }

  const handleRerunSetup = async () => {
    setShowTutorial(false);
    setTutorialReady(false);
    pendingTutorialRef.current = false;
    try {
      await (window as any).api?.profileSave?.({ setupComplete: false, tutorialComplete: false });
    } catch (err) {
      console.error('Error resetting profile:', err);
    }
    setShowSetup(true);
  };

  return (
    <AuthWrapper>
      <AiFeatureProvider>
        <Enpistu onRerunSetup={handleRerunSetup} />
        {showTutorial && tutorialReady && <AppTutorial onComplete={handleTutorialComplete} />}
      </AiFeatureProvider>
    </AuthWrapper>
  );
};

export default App;
