import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../components/AuthProvider';
import {
    getEncryptionKey,
    hasEncryptionKey,
    encryptEntity,
    decryptObject,
} from '../utils/encryption';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.incognide.com';

const LAST_SYNC_KEY = 'incognide-last-sync';
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
export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error' | 'no_encryption_key';

interface UseSyncReturn {
    syncStatus: SyncStatus;
    isOnline: boolean;
    lastSyncTime: Date | null;
    pendingChanges: number;
    syncError: string | null;
    syncFrequency: SyncFrequency;
    triggerSync: () => Promise<void>;
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
    const [syncError, setSyncError] = useState<string | null>(null);
    const [syncFrequency, setSyncFrequencyState] = useState<SyncFrequency>(() => {
        const stored = localStorage.getItem(SYNC_FREQUENCY_KEY);
        if (stored && stored in SYNC_FREQUENCIES) return stored as SyncFrequency;
        return '10m';
    });

    const syncInProgressRef = useRef(false);
    const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const lastSyncRef = useRef(lastSyncTime);
    lastSyncRef.current = lastSyncTime;

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

    const setSyncFrequency = useCallback((frequency: SyncFrequency) => {
        setSyncFrequencyState(frequency);
        localStorage.setItem(SYNC_FREQUENCY_KEY, frequency);
    }, []);

    const triggerSync = useCallback(async () => {
        if (syncInProgressRef.current) return;
        if (!isAuthenticated || !isOnline) return;
        if (!isEncryptionReady || !hasEncryptionKey()) {
            setSyncStatus('no_encryption_key');
            return;
        }

        const key = getEncryptionKey();
        if (!key) return;

        syncInProgressRef.current = true;
        setSyncStatus('syncing');
        setSyncError(null);

        try {
            const deviceId = await (window as any).api?.getDeviceId?.();

            // --- PUSH ---
            const pushToken = await getToken();
            if (!pushToken) throw new Error('No auth token');

            // First sync ever for this device — do a full dump
            const initialSyncDone = localStorage.getItem('incognide-initial-sync-done');
            const needsFullDump = !initialSyncDone;
            const since = needsFullDump ? '1970-01-01T00:00:00.000Z' : (lastSyncRef.current?.toISOString() || '1970-01-01T00:00:00.000Z');
            const data = await (window as any).api?.syncExportData?.({ since, fullDump: needsFullDump });
            const changes: Array<{
                entity_type: string; entity_id: string;
                encrypted_data: string; iv: string; action: string;
            }> = [];

            if (data) {
                for (const msg of (data.messages || [])) {
                    const { encrypted_data, iv } = await encryptEntity(msg, 'message' as any, key);
                    changes.push({ entity_type: 'message', entity_id: msg.message_id, encrypted_data, iv, action: 'upsert' });
                }
                for (const bm of (data.bookmarks || [])) {
                    const { encrypted_data, iv } = await encryptEntity(bm, 'bookmark' as any, key);
                    changes.push({ entity_type: 'bookmark', entity_id: `bm_${bm.id}`, encrypted_data, iv, action: 'upsert' });
                }
                for (const h of (data.history || [])) {
                    const { encrypted_data, iv } = await encryptEntity(h, 'history' as any, key);
                    changes.push({ entity_type: 'history', entity_id: `hist_${h.id}`, encrypted_data, iv, action: 'upsert' });
                }
            }

            if (changes.length > 0) {
                // Batch into chunks of 500 to avoid 413
                const BATCH_SIZE = 500;
                let totalPushed = 0;
                for (let i = 0; i < changes.length; i += BATCH_SIZE) {
                    const batch = changes.slice(i, i + BATCH_SIZE);
                    const token = await getToken();
                    if (!token) throw new Error('No auth token for push batch');
                    const pushResp = await fetch(`${API_BASE_URL}/api/sync/e2e/push`, {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ device_id: deviceId, changes: batch })
                    });
                    if (!pushResp.ok) throw new Error(`Push failed: ${pushResp.status}`);
                    const pushResult = await pushResp.json();
                    totalPushed += pushResult.processed;
                    console.log(`[SYNC] Pushed batch ${Math.floor(i / BATCH_SIZE) + 1}: ${pushResult.processed} changes`);
                }
                console.log(`[SYNC] Pushed ${totalPushed} total changes`);
            } else {
                console.log('[SYNC] Nothing to push');
            }

            // --- PULL (fresh token in case push took a while) ---
            const pullToken = await getToken();
            if (!pullToken) throw new Error('No auth token for pull');

            const pullResp = await fetch(
                `${API_BASE_URL}/api/sync/e2e/pull?since=${encodeURIComponent(since)}&device_id=${deviceId}`,
                { headers: { 'Authorization': `Bearer ${pullToken}` } }
            );
            if (!pullResp.ok) throw new Error(`Pull failed: ${pullResp.status}`);

            const pullData = await pullResp.json();
            const pullChanges = pullData.changes || [];

            if (pullChanges.length > 0) {
                const messages: any[] = [];
                const bookmarks: any[] = [];
                const history: any[] = [];

                for (const change of pullChanges) {
                    if (change.action === 'delete') continue;
                    try {
                        const decrypted = await decryptObject<Record<string, unknown>>(change.encrypted_data, change.iv, key);
                        switch (change.entity_type) {
                            case 'message': messages.push(decrypted); break;
                            case 'bookmark': bookmarks.push(decrypted); break;
                            case 'history': history.push(decrypted); break;
                        }
                    } catch (e) {
                        console.error(`[SYNC] Failed to decrypt ${change.entity_id}:`, e);
                    }
                }

                const imported = await (window as any).api?.syncImportData?.({ messages, bookmarks, history });
                console.log(`[SYNC] Imported:`, imported);
            } else {
                console.log('[SYNC] Nothing to pull');
            }

            const now = new Date();
            setLastSyncTime(now);
            localStorage.setItem(LAST_SYNC_KEY, now.toISOString());
            if (needsFullDump) {
                localStorage.setItem('incognide-initial-sync-done', 'true');
                console.log('[SYNC] Initial full sync completed');
            }
            setSyncStatus('synced');
            console.log('[SYNC] Sync completed');
        } catch (e: any) {
            console.error('[SYNC] Sync failed:', e);
            setSyncError(e.message || 'Sync failed');
            setSyncStatus('error');
        } finally {
            syncInProgressRef.current = false;
        }
    }, [isOnline, isAuthenticated, isEncryptionReady, getToken]);

    // Auto-sync interval — stable deps, no recreation loop
    useEffect(() => {
        const intervalMs = SYNC_FREQUENCIES[syncFrequency];
        if (syncIntervalRef.current) {
            clearInterval(syncIntervalRef.current);
            syncIntervalRef.current = null;
        }

        if (!isAuthenticated || !isOnline || !isEncryptionReady || intervalMs === 0) return;

        // Initial sync on mount
        triggerSync();

        syncIntervalRef.current = setInterval(triggerSync, intervalMs);
        console.log(`[SYNC] Auto-sync enabled: every ${syncFrequency}`);

        return () => {
            if (syncIntervalRef.current) {
                clearInterval(syncIntervalRef.current);
                syncIntervalRef.current = null;
            }
        };
    }, [isAuthenticated, isOnline, isEncryptionReady, syncFrequency]);

    return {
        syncStatus,
        isOnline,
        lastSyncTime,
        pendingChanges: 0,
        syncError,
        syncFrequency,
        triggerSync,
        setSyncFrequency
    };
};

export default useSync;
