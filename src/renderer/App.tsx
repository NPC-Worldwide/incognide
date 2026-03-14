import React, { useState, useEffect } from 'react';
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

const App: React.FC = () => {
  const [showSetup, setShowSetup] = useState<boolean | null>(null);
  const [showTutorial, setShowTutorial] = useState(false);

  useEffect(() => {
    const checkSetup = async () => {
      try {
        const result = await (window as any).api?.setupCheckNeeded?.();
        setShowSetup(result?.needed ?? false);

        if (!result?.needed) {
          const profile = await (window as any).api?.profileGet?.();
          if (profile && profile.setupComplete && !profile.tutorialComplete) {
            setShowTutorial(true);
          }
        }
      } catch (err) {
        console.error('Error checking setup:', err);
        setShowSetup(false);
      }
    };
    checkSetup();
  }, []);

  const handleSetupComplete = async () => {
    setShowSetup(false);
    try {
      const profile = await (window as any).api?.profileGet?.();
      if (!profile?.tutorialComplete) {
        setShowTutorial(true);
      }
    } catch {
      setShowTutorial(true);
    }
  };

  const handleTutorialComplete = async () => {
    setShowTutorial(false);
    try {
      await (window as any).api?.profileSave?.({ tutorialComplete: true });
    } catch (err) {
      console.error('Error saving tutorial state:', err);
    }
  };

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
        {showTutorial && !showSetup && <AppTutorial onComplete={handleTutorialComplete} />}
      </AiFeatureProvider>
    </AuthWrapper>
  );
};

export default App;
