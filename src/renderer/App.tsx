import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ClerkProvider } from '@clerk/clerk-react';
import Enpistu from './components/Enpistu';
import SetupWizard from './components/SetupWizard';
import AppTutorial from './components/AppTutorial';
import BackendErrorBanner from './components/BackendErrorBanner';
import { AuthProvider, NoClerkAuthProvider } from './components/AuthProvider';
import { AiFeatureProvider } from './components/AiFeatureContext';
const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || '';

const AuthWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  if (!CLERK_PUBLISHABLE_KEY) {
    return (
      <NoClerkAuthProvider>
        {children}
      </NoClerkAuthProvider>
    );
  }
  return (
    <ClerkProvider
      publishableKey={CLERK_PUBLISHABLE_KEY}
      allowedRedirectOrigins={[window.location.origin]}
    >
      <AuthProvider>
        {children}
      </AuthProvider>
    </ClerkProvider>
  );
};

function waitForEnpistuReady(timeoutMs = 5000): Promise<void> {
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      if (document.querySelector('[data-tutorial]')) {
        resolve();
      } else if (Date.now() - start > timeoutMs) {
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
  const [tutorialReady, setTutorialReady] = useState(false);
  const pendingTutorialRef = useRef(false);

  useEffect(() => {
    const checkSetup = async () => {
      try {
        const result = await (window as any).api?.setupCheckNeeded?.();
        const needed = result?.needed ?? false;

        if (!needed) {
          const profile = await (window as any).api?.profileGet?.();
          if (profile && profile.setupComplete && !profile.tutorialComplete) {
            pendingTutorialRef.current = true;
          }
        }
        setShowSetup(needed);
      } catch (err) {
        console.error('Error checking setup:', err);
        setShowSetup(false);
      }
    };
    checkSetup();
  }, []);

  useEffect(() => {
    if (showSetup !== false) return;
    if (!pendingTutorialRef.current) return;

    let cancelled = false;
    waitForEnpistuReady().then(async () => {
      if (cancelled) return;
      pendingTutorialRef.current = false;
      window.dispatchEvent(new CustomEvent('open-help-pane'));
      await new Promise(resolve => setTimeout(resolve, 400));
      if (cancelled) return;
      setTutorialReady(true);
      setShowTutorial(true);
    });
    return () => { cancelled = true; };
  }, [showSetup]);

  useEffect(() => {
    const handleReplay = async () => {
      try {
        await (window as any).api?.profileSave?.({ tutorialComplete: false });
      } catch (err) {
        console.error('Error resetting tutorial state:', err);
      }
      await waitForEnpistuReady();
      window.dispatchEvent(new CustomEvent('open-help-pane'));
      await new Promise(resolve => setTimeout(resolve, 400));
      setTutorialReady(true);
      setShowTutorial(true);
    };
    window.addEventListener('replay-tutorial', handleReplay);
    return () => window.removeEventListener('replay-tutorial', handleReplay);
  }, []);

  const handleSetupComplete = useCallback(async () => {
    try {
      const profile = await (window as any).api?.profileGet?.();
      if (!profile?.tutorialComplete) {
        pendingTutorialRef.current = true;
      }
    } catch {
      pendingTutorialRef.current = true;
    }
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
        <BackendErrorBanner />
        <Enpistu onRerunSetup={handleRerunSetup} />
        {showTutorial && tutorialReady && <AppTutorial onComplete={handleTutorialComplete} />}
      </AiFeatureProvider>
    </AuthWrapper>
  );
};

export default App;
