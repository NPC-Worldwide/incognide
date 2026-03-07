import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useUser, useAuth as useClerkAuth, useClerk } from '@clerk/clerk-react';
import { deriveKey, setEncryptionKey, clearEncryptionKey, hasEncryptionKey } from '../utils/encryption';

const API_BASE_URL = 'https://api.incognide.com';

interface User {
    id: string;
    clerkId: string;
    email: string;
    name: string;
    profilePicture?: string;
    isPremium: boolean;
    storageUsedBytes: number;
    storageLimitBytes: number;
}

interface Device {
    id: string;
    deviceId: string;
    deviceName: string;
    deviceType: string;
    lastSeen: string;
    createdAt: string;
}

interface AuthContextType {
    user: User | null;
    device: Device | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    isEncryptionReady: boolean;
    hasPassphrase: boolean;
    needsPassphraseSetup: boolean;
    setupPassphrase: (passphrase: string) => Promise<{ success: boolean; error?: string }>;
    unlockWithPassphrase: (passphrase: string) => Promise<{ success: boolean; error?: string }>;
    signOut: () => Promise<void>;
    refreshUser: () => Promise<void>;
    getToken: () => Promise<string | null>;
    error: string | null;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    device: null,
    isAuthenticated: false,
    isLoading: true,
    isEncryptionReady: false,
    hasPassphrase: false,
    needsPassphraseSetup: false,
    setupPassphrase: async () => ({ success: false }),
    unlockWithPassphrase: async () => ({ success: false }),
    signOut: async () => {},
    refreshUser: async () => {},
    getToken: async () => null,
    error: null,
});

export const useAuth = () => useContext(AuthContext);

interface AuthProviderProps {
    children: ReactNode;
}

const USER_DATA_KEY = 'incognide-user-data';
const ENCRYPTION_SALT_KEY = 'incognide-encryption-salt';
const HAS_PASSPHRASE_KEY = 'incognide-has-passphrase';

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
    const { user: clerkUser, isLoaded: clerkLoaded, isSignedIn } = useUser();
    const { getToken: getClerkToken, signOut: clerkSignOut } = useClerkAuth();
    const clerk = useClerk();

    const [user, setUser] = useState<User | null>(null);
    const [device, setDevice] = useState<Device | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isEncryptionReady, setIsEncryptionReady] = useState(false);
    const [hasPassphrase, setHasPassphrase] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const stored = localStorage.getItem(HAS_PASSPHRASE_KEY);
        setHasPassphrase(stored === 'true');
    }, []);

    useEffect(() => {
        const syncUserToBackend = async () => {
            if (!clerkLoaded) return;

            if (!isSignedIn || !clerkUser) {
                setUser(null);
                setIsLoading(false);
                return;
            }

            setIsLoading(true);

            try {

                const token = await getClerkToken();
                if (!token) {
                    throw new Error('Failed to get auth token');
                }

                const deviceInfo = await (window as any).api?.getDeviceInfo?.();

                const response = await fetch(`${API_BASE_URL}/api/auth/clerk-sync`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        clerk_id: clerkUser.id,
                        email: clerkUser.primaryEmailAddress?.emailAddress,
                        name: clerkUser.fullName || clerkUser.firstName || 'User',
                        profile_picture: clerkUser.imageUrl,
                        device_id: deviceInfo?.deviceId,
                        device_name: deviceInfo?.deviceName,
                        device_type: deviceInfo?.deviceType
                    })
                });

                if (response.ok) {
                    const userData = await response.json();
                    const mappedUser: User = {
                        id: userData.id,
                        clerkId: clerkUser.id,
                        email: userData.email,
                        name: userData.name,
                        profilePicture: userData.profilePicture || clerkUser.imageUrl,
                        isPremium: userData.isPremium || false,
                        storageUsedBytes: userData.storageUsedBytes || 0,
                        storageLimitBytes: userData.storageLimitBytes || 209715200,
                    };
                    setUser(mappedUser);
                    localStorage.setItem(USER_DATA_KEY, JSON.stringify(mappedUser));

                    if (userData.encryptionSalt) {
                        localStorage.setItem(ENCRYPTION_SALT_KEY, userData.encryptionSalt);
                        localStorage.setItem(HAS_PASSPHRASE_KEY, 'true');
                        setHasPassphrase(true);
                    }
                } else {

                    console.warn('[AUTH] Backend sync failed, using Clerk data');
                    const fallbackUser: User = {
                        id: clerkUser.id,
                        clerkId: clerkUser.id,
                        email: clerkUser.primaryEmailAddress?.emailAddress || '',
                        name: clerkUser.fullName || clerkUser.firstName || 'User',
                        profilePicture: clerkUser.imageUrl,
                        isPremium: false,
                        storageUsedBytes: 0,
                        storageLimitBytes: 209715200,
                    };
                    setUser(fallbackUser);
                }

                if (deviceInfo) {
                    setDevice({
                        id: deviceInfo.deviceId,
                        deviceId: deviceInfo.deviceId,
                        deviceName: deviceInfo.deviceName,
                        deviceType: deviceInfo.deviceType,
                        lastSeen: new Date().toISOString(),
                        createdAt: deviceInfo.createdAt
                    });
                }
            } catch (e) {
                console.error('[AUTH] Error syncing user:', e);
                setError('Failed to sync user data');

                if (clerkUser) {
                    const fallbackUser: User = {
                        id: clerkUser.id,
                        clerkId: clerkUser.id,
                        email: clerkUser.primaryEmailAddress?.emailAddress || '',
                        name: clerkUser.fullName || clerkUser.firstName || 'User',
                        profilePicture: clerkUser.imageUrl,
                        isPremium: false,
                        storageUsedBytes: 0,
                        storageLimitBytes: 209715200,
                    };
                    setUser(fallbackUser);
                }
            } finally {
                setIsLoading(false);
            }
        };

        syncUserToBackend();
    }, [clerkLoaded, isSignedIn, clerkUser, getClerkToken]);

    const setupPassphrase = useCallback(async (passphrase: string): Promise<{ success: boolean; error?: string }> => {
        if (!user) {
            return { success: false, error: 'Not signed in' };
        }

        if (passphrase.length < 8) {
            return { success: false, error: 'Passphrase must be at least 8 characters' };
        }

        try {

            const saltBytes = crypto.getRandomValues(new Uint8Array(16));
            const salt = btoa(String.fromCharCode(...saltBytes));

            const encryptionKey = await deriveKey(passphrase, salt);
            setEncryptionKey(encryptionKey);

            localStorage.setItem(ENCRYPTION_SALT_KEY, salt);
            localStorage.setItem(HAS_PASSPHRASE_KEY, 'true');
            setHasPassphrase(true);
            setIsEncryptionReady(true);

            const token = await getClerkToken();
            if (token) {
                await fetch(`${API_BASE_URL}/api/auth/set-encryption-salt`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ encryption_salt: salt })
                });
            }

            console.log('[AUTH] Passphrase set up successfully');
            return { success: true };
        } catch (e: any) {
            console.error('[AUTH] Failed to set up passphrase:', e);
            return { success: false, error: e.message || 'Failed to set up passphrase' };
        }
    }, [user, getClerkToken]);

    const unlockWithPassphrase = useCallback(async (passphrase: string): Promise<{ success: boolean; error?: string }> => {
        if (!user) {
            return { success: false, error: 'Not signed in' };
        }

        try {

            let salt = localStorage.getItem(ENCRYPTION_SALT_KEY);

            if (!salt) {
                const token = await getClerkToken();
                if (token) {
                    const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    if (response.ok) {
                        const data = await response.json();
                        if (data.encryptionSalt) {
                            salt = data.encryptionSalt;
                            localStorage.setItem(ENCRYPTION_SALT_KEY, salt);
                        }
                    }
                }
            }

            if (!salt) {
                return { success: false, error: 'No encryption data found. Please set up a new passphrase.' };
            }

            const encryptionKey = await deriveKey(passphrase, salt);
            setEncryptionKey(encryptionKey);
            setIsEncryptionReady(true);

            console.log('[AUTH] Unlocked with passphrase successfully');
            return { success: true };
        } catch (e: any) {
            console.error('[AUTH] Failed to unlock:', e);
            return { success: false, error: 'Invalid passphrase' };
        }
    }, [user, getClerkToken]);

    const signOut = useCallback(async () => {
        setIsLoading(true);

        try {

            localStorage.removeItem(USER_DATA_KEY);
            localStorage.removeItem(ENCRYPTION_SALT_KEY);

            setUser(null);
            setIsEncryptionReady(false);

            clearEncryptionKey();

            await clerkSignOut();
        } catch (e: any) {
            setError(e.message || 'Failed to sign out');
        } finally {
            setIsLoading(false);
        }
    }, [clerkSignOut]);

    const refreshUser = useCallback(async () => {
        const token = await getClerkToken();
        if (!token) return;

        try {
            const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const userData = await response.json();
                setUser(prev => prev ? { ...prev, ...userData } : null);
                localStorage.setItem(USER_DATA_KEY, JSON.stringify(userData));
            }
        } catch (e) {
            console.error('[AUTH] Failed to refresh user:', e);
        }
    }, [getClerkToken]);

    const getToken = useCallback(async (): Promise<string | null> => {
        return await getClerkToken();
    }, [getClerkToken]);

    const needsPassphraseSetup = !!user && !hasPassphrase;

    return (
        <AuthContext.Provider
            value={{
                user,
                device,
                isAuthenticated: !!user,
                isLoading: isLoading || !clerkLoaded,
                isEncryptionReady,
                hasPassphrase,
                needsPassphraseSetup,
                setupPassphrase,
                unlockWithPassphrase,
                signOut,
                refreshUser,
                getToken,
                error
            }}
        >
            {children}
        </AuthContext.Provider>
    );
};

export default AuthProvider;
