import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../components/AuthProvider';
import {
    getEncryptionKey,
    hasEncryptionKey,
    encryptEntity,
    decryptObject,
} from '../utils/encryption';
import { API_BASE_URL } from '../config';

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

export interface SyncStats {
    pushed: number;
    pulled: number;
    durationMs: number;
}

interface UseSyncReturn {
    syncStatus: SyncStatus;
    isOnline: boolean;
    lastSyncTime: Date | null;
    pendingChanges: number;
    syncError: string | null;
    syncFrequency: SyncFrequency;
    lastSyncStats: SyncStats | null;
    syncProgress: number;
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
    const [lastSyncStats, setLastSyncStats] = useState<SyncStats | null>(null);
    const [syncProgress, setSyncProgress] = useState<number>(0);
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
        setSyncProgress(0);
        const syncStart = Date.now();

        try {
            const deviceId = await (window as any).api?.getDeviceId?.();

            // --- PUSH ---
            const pushToken = await getToken();
            if (!pushToken) throw new Error('No auth token');

            // First sync ever for this device — do a full dump
            const initialSyncDone = localStorage.getItem('incognide-initial-sync-done');
            const needsFullDump = !initialSyncDone;
            const since = needsFullDump ? '1970-01-01T00:00:00.000Z' : (lastSyncRef.current?.toISOString() || '1970-01-01T00:00:00.000Z');
            setSyncProgress(5); // exporting local data
            const data = await (window as any).api?.syncExportData?.({ since, fullDump: needsFullDump });
            const changes: Array<{
                entity_type: string; entity_id: string;
                encrypted_data: string; iv: string; action: string;
            }> = [];

            if (data) {
                const msgs = data.messages || [];
                const bms = data.bookmarks || [];
                const hist = data.history || [];
                const totalItems = msgs.length + bms.length + hist.length;
                let encryptedCount = 0;

                for (const msg of msgs) {
                    const { encrypted_data, iv } = await encryptEntity(msg, 'message' as any, key);
                    changes.push({ entity_type: 'message', entity_id: msg.message_id, encrypted_data, iv, action: 'upsert' });
                    encryptedCount++;
                    if (encryptedCount % 100 === 0) {
                        const encProgress = 10 + Math.round((encryptedCount / totalItems) * 10); // 10-20%
                        setSyncProgress(encProgress);
                    }
                }
                for (const bm of bms) {
                    const { encrypted_data, iv } = await encryptEntity(bm, 'bookmark' as any, key);
                    changes.push({ entity_type: 'bookmark', entity_id: `bm_${bm.id}`, encrypted_data, iv, action: 'upsert' });
                    encryptedCount++;
                }
                for (const h of hist) {
                    const { encrypted_data, iv } = await encryptEntity(h, 'history' as any, key);
                    changes.push({ entity_type: 'history', entity_id: `hist_${h.id}`, encrypted_data, iv, action: 'upsert' });
                    encryptedCount++;
                }
                setSyncProgress(25); // encryption done
            }

            let totalPushed = 0;
            if (changes.length > 0) {
                // Size-aware batching: accumulate up to ~500KB per request
                const MAX_BATCH_BYTES = 500 * 1024;
                const batches: typeof changes[] = [];
                let current: typeof changes = [];
                let currentSize = 0;

                for (const change of changes) {
                    const itemSize = JSON.stringify(change).length;
                    if (currentSize + itemSize > MAX_BATCH_BYTES && current.length > 0) {
                        batches.push(current);
                        current = [change];
                        currentSize = itemSize;
                    } else {
                        current.push(change);
                        currentSize += itemSize;
                    }
                }
                if (current.length > 0) batches.push(current);

                const totalBatches = batches.length;

                for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
                    const batch = batches[batchIdx];
                    const batchNum = batchIdx + 1;
                    const startProgress = 25 + Math.round((batchIdx / totalBatches) * 35); // 25-60%
                    setSyncProgress(startProgress);

                    const token = await getToken();
                    if (!token) throw new Error('No auth token for push batch');
                    const pushResp = await fetch(`${API_BASE_URL}/api/sync/e2e/push`, {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ device_id: deviceId, changes: batch })
                    });
                    if (!pushResp.ok) {
                        const errBody = await pushResp.text().catch(() => 'no body');
                        console.error(`[SYNC] Push batch ${batchNum}/${totalBatches} failed: ${pushResp.status} — ${errBody}`);
                        throw new Error(`Push failed: ${pushResp.status} — ${errBody.slice(0, 200)}`);
                    }
                    const pushResult = await pushResp.json();
                    totalPushed += pushResult.processed;

                    const endProgress = 25 + Math.round((batchNum / totalBatches) * 35);
                    setSyncProgress(endProgress);
                    console.log(`[SYNC] Pushed batch ${batchNum}/${totalBatches}: ${pushResult.processed} changes`);
                }

                console.log(`[SYNC] Pushed ${totalPushed} total changes in ${totalBatches} batches`);
            } else {
                console.log('[SYNC] Nothing to push');
            }

            // --- PULL (fresh token in case push took a while) ---
            setSyncProgress(65); // pull starts at 65%
            const pullToken = await getToken();
            if (!pullToken) throw new Error('No auth token for pull');

            const pullResp = await fetch(
                `${API_BASE_URL}/api/sync/e2e/pull?since=${encodeURIComponent(since)}&device_id=${deviceId}`,
                { headers: { 'Authorization': `Bearer ${pullToken}` } }
            );
            if (!pullResp.ok) throw new Error(`Pull failed: ${pullResp.status}`);

            const pullData = await pullResp.json();
            const pullChanges = pullData.changes || [];
            setSyncProgress(80); // received data = 80%

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

                setSyncProgress(90); // decrypted
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
            setSyncProgress(100);
            setLastSyncStats({ pushed: totalPushed, pulled: pullChanges.length, durationMs: Date.now() - syncStart });
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
        lastSyncStats,
        syncProgress,
        triggerSync,
        setSyncFrequency
    };
};

export default useSync;
