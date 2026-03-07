import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../components/AuthProvider';
import {
    getEncryptionKey,
    hasEncryptionKey,
    encryptEntity,
    decryptObject,
    EncryptedEntityType
} from '../utils/encryption';

const API_BASE_URL = 'https://api.incognide.com';

const LAST_SYNC_KEY = 'incognide-last-sync';
const PENDING_CHANGES_KEY = 'incognide-pending-changes';
const SYNC_FREQUENCY_KEY = 'incognide-sync-frequency';

export const SYNC_FREQUENCIES = {
    '1m': 60000,
    '10m': 600000,
    '30m': 1800000,
    '1h': 3600000,
    '24h': 86400000,
    'manual': 0,
} as const;

export type SyncFrequency = keyof typeof SYNC_FREQUENCIES;

const DEFAULT_SYNC_FREQUENCY: SyncFrequency = '10m';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'pending' | 'error' | 'no_encryption_key';

interface PendingChange {
    id: string;
    type: EncryptedEntityType;
    action: 'create' | 'update' | 'delete';
    data: Record<string, unknown>;
    timestamp: string;
}

interface EncryptedChange {
    entity_type: EncryptedEntityType;
    entity_id: string;
    encrypted_data: string;
    iv: string;
    action: 'upsert' | 'delete';
}

interface SyncState {
    syncStatus: SyncStatus;
    isOnline: boolean;
    lastSyncTime: Date | null;
    pendingChanges: number;
    syncError: string | null;
    syncFrequency: SyncFrequency;
}

interface UseSyncReturn extends SyncState {
    triggerSync: () => Promise<void>;
    addPendingChange: (change: Omit<PendingChange, 'id' | 'timestamp'>) => void;
    clearPendingChanges: () => void;
    setSyncFrequency: (frequency: SyncFrequency) => void;
}

export const useSync = (): UseSyncReturn => {
    const { isAuthenticated, isEncryptionReady, getToken } = useAuth();

    const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [lastSyncTime, setLastSyncTime] = useState<Date | null>(() => {
        const stored = localStorage.getItem(LAST_SYNC_KEY);
        return stored ? new Date(stored) : null;
    });
    const [pendingChanges, setPendingChanges] = useState<PendingChange[]>(() => {
        try {
            const stored = localStorage.getItem(PENDING_CHANGES_KEY);
            return stored ? JSON.parse(stored) : [];
        } catch {
            return [];
        }
    });
    const [syncError, setSyncError] = useState<string | null>(null);
    const [syncFrequency, setSyncFrequencyState] = useState<SyncFrequency>(() => {
        const stored = localStorage.getItem(SYNC_FREQUENCY_KEY);
        if (stored && stored in SYNC_FREQUENCIES) {
            return stored as SyncFrequency;
        }
        return DEFAULT_SYNC_FREQUENCY;
    });

    const syncInProgressRef = useRef(false);
    const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    useEffect(() => {
        localStorage.setItem(PENDING_CHANGES_KEY, JSON.stringify(pendingChanges));
        if (pendingChanges.length > 0) {
            setSyncStatus('pending');
        }
    }, [pendingChanges]);

    const addPendingChange = useCallback((change: Omit<PendingChange, 'id' | 'timestamp'>) => {
        const newChange: PendingChange = {
            ...change,
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString()
        };
        setPendingChanges(prev => [...prev, newChange]);
    }, []);

    const clearPendingChanges = useCallback(() => {
        setPendingChanges([]);
        localStorage.removeItem(PENDING_CHANGES_KEY);
    }, []);

    const setSyncFrequency = useCallback((frequency: SyncFrequency) => {
        setSyncFrequencyState(frequency);
        localStorage.setItem(SYNC_FREQUENCY_KEY, frequency);
        console.log(`[SYNC] Sync frequency changed to: ${frequency}`);
    }, []);

    const encryptChanges = useCallback(async (changes: PendingChange[]): Promise<EncryptedChange[]> => {
        const key = getEncryptionKey();
        if (!key) {
            throw new Error('Encryption key not available');
        }

        const encryptedChanges: EncryptedChange[] = [];

        for (const change of changes) {
            const { encrypted_data, iv } = await encryptEntity(
                change.data,
                change.type,
                key
            );

            encryptedChanges.push({
                entity_type: change.type,
                entity_id: change.data.id as string,
                encrypted_data,
                iv,
                action: change.action === 'delete' ? 'delete' : 'upsert'
            });
        }

        return encryptedChanges;
    }, []);

    const pushChanges = useCallback(async (): Promise<boolean> => {
        if (pendingChanges.length === 0) return true;

        const token = await getToken();
        if (!token) {
            console.log('[SYNC] No auth token, cannot push changes');
            return false;
        }

        if (!hasEncryptionKey()) {
            console.log('[SYNC] No encryption key, cannot push changes');
            setSyncStatus('no_encryption_key');
            return false;
        }

        try {
            const deviceId = await (window as any).api?.getDeviceId?.();

            const encryptedChanges = await encryptChanges(pendingChanges);

            const response = await fetch(`${API_BASE_URL}/api/sync/e2e/push`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    device_id: deviceId,
                    changes: encryptedChanges
                })
            });

            if (!response.ok) {
                throw new Error(`Push failed: ${response.status}`);
            }

            const result = await response.json();
            console.log(`[SYNC] Pushed ${result.processed} encrypted changes`);

            clearPendingChanges();
            return true;
        } catch (e: any) {
            console.error('[SYNC] Push error:', e);
            throw e;
        }
    }, [pendingChanges, clearPendingChanges, encryptChanges, getToken]);

    const pullChanges = useCallback(async (): Promise<boolean> => {
        const token = await getToken();
        if (!token) {
            console.log('[SYNC] No auth token, cannot pull changes');
            return false;
        }

        if (!hasEncryptionKey()) {
            console.log('[SYNC] No encryption key, cannot pull changes');
            setSyncStatus('no_encryption_key');
            return false;
        }

        try {
            const key = getEncryptionKey()!;
            const lastSync = lastSyncTime?.toISOString() || '1970-01-01T00:00:00.000Z';
            const deviceId = await (window as any).api?.getDeviceId?.();

            const response = await fetch(
                `${API_BASE_URL}/api/sync/e2e/pull?since=${encodeURIComponent(lastSync)}&device_id=${deviceId}`,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                }
            );

            if (!response.ok) {
                throw new Error(`Pull failed: ${response.status}`);
            }

            const data = await response.json();
            const changes = data.changes || [];

            if (changes.length === 0) {
                console.log('[SYNC] No new changes to pull');
                return true;
            }

            console.log(`[SYNC] Pulling ${changes.length} encrypted changes`);

            for (const change of changes) {
                try {
                    if (change.action === 'delete') {

                        const decryptedData = await decryptObject<Record<string, unknown>>(
                            change.encrypted_data,
                            change.iv,
                            key
                        );
                        await applyDeleteChange(change.entity_type, change.entity_id, decryptedData);
                    } else {

                        const decryptedData = await decryptObject<Record<string, unknown>>(
                            change.encrypted_data,
                            change.iv,
                            key
                        );
                        await applyUpsertChange(change.entity_type, change.entity_id, decryptedData);
                    }
                } catch (decryptErr) {
                    console.error(`[SYNC] Failed to decrypt change ${change.entity_id}:`, decryptErr);

                }
            }

            return true;
        } catch (e: any) {
            console.error('[SYNC] Pull error:', e);
            throw e;
        }
    }, [lastSyncTime, getToken]);

    const applyUpsertChange = async (
        entityType: string,
        entityId: string,
        decryptedData: Record<string, unknown>
    ) => {

        const fullData = { ...decryptedData, id: entityId };

        switch (entityType) {
            case 'conversation': {
                const existingConvos = JSON.parse(localStorage.getItem('synced-conversations') || '{}');
                existingConvos[entityId] = fullData;
                localStorage.setItem('synced-conversations', JSON.stringify(existingConvos));
                console.log(`[SYNC] Applied conversation: ${entityId}`);
                break;
            }
            case 'message': {
                const existingMessages = JSON.parse(localStorage.getItem('synced-messages') || '{}');
                const conversationId = (decryptedData as Record<string, unknown>).conversation_id as string;
                if (conversationId) {
                    if (!existingMessages[conversationId]) {
                        existingMessages[conversationId] = [];
                    }

                    const idx = existingMessages[conversationId].findIndex((m: Record<string, unknown>) => m.id === entityId);
                    if (idx >= 0) {
                        existingMessages[conversationId][idx] = fullData;
                    } else {
                        existingMessages[conversationId].push(fullData);
                    }
                    localStorage.setItem('synced-messages', JSON.stringify(existingMessages));
                    console.log(`[SYNC] Applied message: ${entityId}`);
                }
                break;
            }
            case 'bookmark': {
                const existingBookmarks = JSON.parse(localStorage.getItem('synced-bookmarks') || '{}');
                existingBookmarks[entityId] = fullData;
                localStorage.setItem('synced-bookmarks', JSON.stringify(existingBookmarks));
                console.log(`[SYNC] Applied bookmark: ${entityId}`);
                break;
            }
            case 'history': {
                const existingHistory = JSON.parse(localStorage.getItem('synced-history') || '{}');
                existingHistory[entityId] = fullData;
                localStorage.setItem('synced-history', JSON.stringify(existingHistory));
                console.log(`[SYNC] Applied history: ${entityId}`);
                break;
            }
            case 'memory': {
                const existingMemories = JSON.parse(localStorage.getItem('synced-memories') || '{}');
                existingMemories[entityId] = fullData;
                localStorage.setItem('synced-memories', JSON.stringify(existingMemories));
                console.log(`[SYNC] Applied memory: ${entityId}`);
                break;
            }
            default:
                console.warn(`[SYNC] Unknown entity type: ${entityType}`);
        }
    };

    const applyDeleteChange = async (
        entityType: string,
        entityId: string,
        _decryptedData: Record<string, unknown>
    ) => {
        switch (entityType) {
            case 'conversation': {
                const existingConvos = JSON.parse(localStorage.getItem('synced-conversations') || '{}');
                delete existingConvos[entityId];
                localStorage.setItem('synced-conversations', JSON.stringify(existingConvos));
                console.log(`[SYNC] Deleted conversation: ${entityId}`);
                break;
            }
            case 'message': {

                const existingMessages = JSON.parse(localStorage.getItem('synced-messages') || '{}');
                for (const convId of Object.keys(existingMessages)) {
                    existingMessages[convId] = existingMessages[convId].filter(
                        (m: any) => m.id !== entityId
                    );
                }
                localStorage.setItem('synced-messages', JSON.stringify(existingMessages));
                console.log(`[SYNC] Deleted message: ${entityId}`);
                break;
            }
            case 'bookmark': {
                const existingBookmarks = JSON.parse(localStorage.getItem('synced-bookmarks') || '{}');
                delete existingBookmarks[entityId];
                localStorage.setItem('synced-bookmarks', JSON.stringify(existingBookmarks));
                console.log(`[SYNC] Deleted bookmark: ${entityId}`);
                break;
            }
            case 'history': {
                const existingHistory = JSON.parse(localStorage.getItem('synced-history') || '{}');
                delete existingHistory[entityId];
                localStorage.setItem('synced-history', JSON.stringify(existingHistory));
                console.log(`[SYNC] Deleted history: ${entityId}`);
                break;
            }
            case 'memory': {
                const existingMemories = JSON.parse(localStorage.getItem('synced-memories') || '{}');
                delete existingMemories[entityId];
                localStorage.setItem('synced-memories', JSON.stringify(existingMemories));
                console.log(`[SYNC] Deleted memory: ${entityId}`);
                break;
            }
            default:
                console.warn(`[SYNC] Unknown entity type for delete: ${entityType}`);
        }
    };

    const triggerSync = useCallback(async () => {
        if (syncInProgressRef.current) {
            console.log('[SYNC] Sync already in progress');
            return;
        }

        if (!isAuthenticated) {
            console.log('[SYNC] Not authenticated, skipping sync');
            return;
        }

        if (!isOnline) {
            console.log('[SYNC] Offline, skipping sync');
            setSyncError('Offline - sync will resume when online');
            return;
        }

        if (!isEncryptionReady || !hasEncryptionKey()) {
            console.log('[SYNC] Encryption not ready, skipping sync');
            setSyncStatus('no_encryption_key');
            setSyncError('Enter your passphrase to enable sync');
            return;
        }

        syncInProgressRef.current = true;
        setSyncStatus('syncing');
        setSyncError(null);

        try {

            await pushChanges();

            await pullChanges();

            const now = new Date();
            setLastSyncTime(now);
            localStorage.setItem(LAST_SYNC_KEY, now.toISOString());

            setSyncStatus('synced');
            console.log('[SYNC] E2E sync completed successfully');
        } catch (e: any) {
            console.error('[SYNC] Sync failed:', e);
            setSyncError(e.message || 'Sync failed');
            setSyncStatus('error');
        } finally {
            syncInProgressRef.current = false;
        }
    }, [isOnline, isAuthenticated, isEncryptionReady, pushChanges, pullChanges]);

    useEffect(() => {
        const intervalMs = SYNC_FREQUENCIES[syncFrequency];

        if (syncIntervalRef.current) {
            clearInterval(syncIntervalRef.current);
            syncIntervalRef.current = null;
        }

        if (!isAuthenticated || !isOnline || !isEncryptionReady || intervalMs === 0) {
            return;
        }

        triggerSync();

        syncIntervalRef.current = setInterval(() => {
            triggerSync();
        }, intervalMs);

        console.log(`[SYNC] Auto-sync enabled: every ${syncFrequency}`);

        return () => {
            if (syncIntervalRef.current) {
                clearInterval(syncIntervalRef.current);
                syncIntervalRef.current = null;
            }
        };
    }, [isOnline, isAuthenticated, isEncryptionReady, syncFrequency, triggerSync]);

    useEffect(() => {
        if (isOnline && isAuthenticated && isEncryptionReady && pendingChanges.length > 0) {
            triggerSync();
        }
    }, [isOnline, isAuthenticated, isEncryptionReady]);

    return {
        syncStatus,
        isOnline,
        lastSyncTime,
        pendingChanges: pendingChanges.length,
        syncError,
        syncFrequency,
        triggerSync,
        addPendingChange,
        clearPendingChanges,
        setSyncFrequency
    };
};

export default useSync;
