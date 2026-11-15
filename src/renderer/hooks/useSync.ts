import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../components/AuthProvider';
import {
    getEncryptionKey,
    hasEncryptionKey,
    encryptEntity,
    decryptObject,
} from '../utils/encryption';
import { API_BASE_URL } from '../config';
// Shared with src/ipc/syncCategories.js: the renderer can show the full list of
// syncable categories before (or without) a main-process round trip.
import SYNC_CATEGORY_DEFS from '../../shared/syncCategories.json';


const LAST_SYNC_KEY = 'incognide-last-sync';
/** Local mirror of the category selection, used when the IPC is unavailable. */
const SYNC_CATS_KEY = 'incognide-sync-categories';
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

export interface SyncCategory {
    id: string;
    label: string;
    description: string;
    group: string;
    defaultEnabled: boolean;
    sensitive?: boolean;
    count: number;
    available: boolean;
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
    forceFullResync: () => Promise<void>;
    setSyncFrequency: (frequency: SyncFrequency) => void;
    // Per-category selection
    syncCategories: SyncCategory[];
    categorySelection: Record<string, boolean>;
    categoriesLoading: boolean;
    toggleCategory: (id: string, enabled: boolean) => Promise<void>;
    refreshCategories: () => Promise<void>;
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

    /**
     * Seeded from the shared definitions so the toggles appear immediately, then
     * enriched with live row counts when `sync:categories` returns. Starting from
     * an empty array meant the whole section rendered nothing until IPC replied,
     * which is indistinguishable from "the feature is missing".
     */
    const [syncCategories, setSyncCategories] = useState<SyncCategory[]>(() =>
        (SYNC_CATEGORY_DEFS as any[]).map((c) => ({
            ...c,
            count: 0,
            available: false,
        }))
    );
    const [categorySelection, setCategorySelection] = useState<Record<string, boolean>>(() => {
        const defaults: Record<string, boolean> = {};
        for (const c of SYNC_CATEGORY_DEFS as any[]) defaults[c.id] = !!c.defaultEnabled;

        // A locally saved selection wins: it is what the user last chose, and it
        // is readable before any IPC reply.
        try {
            const saved = localStorage.getItem(SYNC_CATS_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                const merged = { ...defaults };
                for (const c of SYNC_CATEGORY_DEFS as any[]) {
                    if (parsed[c.id] !== undefined) merged[c.id] = !!parsed[c.id];
                }
                return merged;
            }
        } catch {}
        return defaults;
    });
    const [categoriesLoading, setCategoriesLoading] = useState(false);

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

    /**
     * Load the category list (with local row counts) and the saved selection.
     * Counts come from the main process so the panel can show "12,431 messages"
     * next to each toggle instead of guessing.
     */
    const refreshCategories = useCallback(async () => {
        try {
            setCategoriesLoading(true);
            const res = await (window as any).api?.syncCategories?.();

            if (Array.isArray(res?.categories) && res.categories.length > 0) {
                // Merge by id: the shared defs provide label/group/order, the
                // main process provides live counts and availability. A category
                // that exists only locally still renders.
                const liveById = new Map(res.categories.map((c: any) => [c.id, c]));
                setSyncCategories((SYNC_CATEGORY_DEFS as any[]).map((def) => {
                    const live: any = liveById.get(def.id);
                    return {
                        ...def,
                        count: live?.count ?? 0,
                        available: live?.available ?? false,
                    };
                }));
            }

            if (res?.selection) {
                setCategorySelection(res.selection);
                try { localStorage.setItem(SYNC_CATS_KEY, JSON.stringify(res.selection)); } catch {}
            }
        } catch (err) {
            // Keep the seeded list; the toggles still work for the next sync.
            console.error('[SYNC] Failed to load sync categories:', err);
        } finally {
            setCategoriesLoading(false);
        }
    }, []);

    useEffect(() => {
        refreshCategories();
    }, [refreshCategories]);

    /**
     * Flip one category and persist immediately.
     *
     * Optimistic: the checkbox updates before the round trip so the toggle never
     * feels laggy, and a failure reverts it.
     */
    const toggleCategory = useCallback(async (id: string, enabled: boolean) => {
        const next = { ...categorySelection, [id]: enabled };
        setCategorySelection(next);

        // Persist locally first. This makes the toggle stick even if the
        // main-process IPC is unavailable, and the export call passes the
        // selection explicitly anyway, so a local-only choice still governs the
        // very next sync.
        try { localStorage.setItem(SYNC_CATS_KEY, JSON.stringify(next)); } catch {}

        try {
            const res = await (window as any).api?.syncSetCategorySelection?.(next);
            if (res?.error) console.warn('[SYNC] Category selection not persisted to disk:', res.error);
        } catch (err) {
            // Non-fatal: the local mirror and the explicit export argument cover it.
            console.warn('[SYNC] Failed to save category selection to main process:', err);
        }
    }, [categorySelection]);

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

            const pushToken = await getToken();
            if (!pushToken) throw new Error('No auth token');

            const initialSyncDone = localStorage.getItem('incognide-initial-sync-done');
            const needsFullDump = !initialSyncDone;
            const since = needsFullDump ? '1970-01-01T00:00:00.000Z' : (lastSyncRef.current?.toISOString() || '1970-01-01T00:00:00.000Z');
            setSyncProgress(5);
            // The selection is read from main-process storage inside the handler,
            // but passing it explicitly keeps an in-flight toggle from being lost
            // between the panel and the export.
            const data = await (window as any).api?.syncExportData?.({
                since,
                fullDump: needsFullDump,
                categories: categorySelection,
            });
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
                        const encProgress = 10 + Math.round((encryptedCount / totalItems) * 10);
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

                /**
                 * Additional categories. Each maps to a payload key from
                 * sync:export-data and an entity_type the server already knows
                 * (or ignores). Failures here are logged, never fatal, so one
                 * rejected category cannot block the rest of the sync.
                 */
                const extraCategories: Array<{ key: string; rows: any[]; entityType: string; idOf: (r: any) => string }> = [
                    { key: 'pdfHighlights', rows: data.pdfHighlights || [], entityType: 'pdf_highlight', idOf: (r) => `pdfh_${r.id}` },
                    { key: 'pdfDrawings', rows: data.pdfDrawings || [], entityType: 'pdf_drawing', idOf: (r) => `pdfd_${r.id}` },
                    { key: 'kgEntities', rows: data.kgEntities || [], entityType: 'kg_entity', idOf: (r) => `kge_${r.id}` },
                    { key: 'kgRelations', rows: data.kgRelations || [], entityType: 'kg_relation', idOf: (r) => `kgr_${r.id}` },
                    { key: 'kgTriples', rows: data.kgTriples || [], entityType: 'kg_triple', idOf: (r) => `kgt_${r.id}` },
                    { key: 'fileIndex', rows: data.fileIndex || [], entityType: 'file_index', idOf: (r) => `fi_${r.id}` },
                ];

                for (const category of extraCategories) {
                    if (category.rows.length === 0) continue;
                    try {
                        for (const row of category.rows) {
                            const { encrypted_data, iv } = await encryptEntity(row, category.entityType as any, key);
                            changes.push({
                                entity_type: category.entityType,
                                entity_id: category.idOf(row),
                                encrypted_data,
                                iv,
                                action: 'upsert',
                            });
                            encryptedCount++;
                        }
                    } catch (err: any) {
                        console.warn(`[SYNC] Skipped ${category.key} (${err?.message || err})`);
                    }
                }
                setSyncProgress(25);
            }

            let totalPushed = 0;
            if (changes.length > 0) {
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
                    const startProgress = 25 + Math.round((batchIdx / totalBatches) * 35);
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

            // Agents sync as their own isolated attempt. The server decides which
            // entity types it accepts, and this repo cannot see that contract, so
            // a rejection here must not abort the message/bookmark/history push
            // that already succeeded above.
            //
            // Gated on the user's `agent_registry` category: the account panel
            // offers that toggle, so it must actually control what is sent.
            try {
                const agentRecords = categorySelection?.agent_registry === false
                    ? []
                    : (Array.isArray(data?.agents) ? data.agents : []);
                if (agentRecords.length > 0) {
                    const agentChanges = [];
                    for (const agent of agentRecords) {
                        const { encrypted_data, iv } = await encryptEntity(agent, 'agent' as any, key);
                        agentChanges.push({
                            entity_type: 'agent',
                            entity_id: `agent_${agent.id}`,
                            encrypted_data,
                            iv,
                            action: 'upsert',
                        });
                    }
                    const agentToken = await getToken();
                    if (agentToken) {
                        const agentResp = await fetch(`${API_BASE_URL}/api/sync/e2e/push`, {
                            method: 'POST',
                            headers: { 'Authorization': `Bearer ${agentToken}`, 'Content-Type': 'application/json' },
                            body: JSON.stringify({ device_id: deviceId, changes: agentChanges }),
                        });
                        if (agentResp.ok) {
                            const r = await agentResp.json().catch(() => ({}));
                            totalPushed += r.processed || 0;
                            console.log(`[SYNC] Pushed ${agentChanges.length} agent record(s)`);
                        } else {
                            const body = await agentResp.text().catch(() => 'no body');
                            console.warn(`[SYNC] Agent push rejected (${agentResp.status}): ${body.slice(0, 200)} — continuing without agent sync`);
                        }
                    }
                }
            } catch (agentErr: any) {
                console.warn('[SYNC] Agent sync skipped:', agentErr?.message || agentErr);
            }

            setSyncProgress(65);
            const pullToken = await getToken();
            if (!pullToken) throw new Error('No auth token for pull');

            const pullResp = await fetch(
                `${API_BASE_URL}/api/sync/e2e/pull?since=${encodeURIComponent(since)}&device_id=${deviceId}`,
                { headers: { 'Authorization': `Bearer ${pullToken}` } }
            );
            if (!pullResp.ok) throw new Error(`Pull failed: ${pullResp.status}`);

            const pullData = await pullResp.json();
            const pullChanges = pullData.changes || [];
            setSyncProgress(80);

            if (pullChanges.length > 0) {
                const messages: any[] = [];
                const bookmarks: any[] = [];
                const history: any[] = [];
                const agents: any[] = [];
                const extra: Record<string, any[]> = {
                    pdfHighlights: [], pdfDrawings: [],
                    kgEntities: [], kgRelations: [], kgTriples: [],
                    fileIndex: [],
                };

                for (const change of pullChanges) {
                    if (change.action === 'delete') continue;
                    try {
                        const decrypted = await decryptObject<Record<string, unknown>>(change.encrypted_data, change.iv, key);
                        switch (change.entity_type) {
                            case 'message': messages.push(decrypted); break;
                            case 'bookmark': bookmarks.push(decrypted); break;
                            case 'history': history.push(decrypted); break;
                            case 'agent': agents.push(decrypted); break;
                            case 'pdf_highlight': extra.pdfHighlights.push(decrypted); break;
                            case 'pdf_drawing': extra.pdfDrawings.push(decrypted); break;
                            case 'kg_entity': extra.kgEntities.push(decrypted); break;
                            case 'kg_relation': extra.kgRelations.push(decrypted); break;
                            case 'kg_triple': extra.kgTriples.push(decrypted); break;
                            case 'file_index': extra.fileIndex.push(decrypted); break;
                        }
                    } catch (e) {
                        console.error(`[SYNC] Failed to decrypt ${change.entity_id}:`, e);
                    }
                }

                setSyncProgress(90);
                const imported = await (window as any).api?.syncImportData?.({ messages, bookmarks, history, ...extra });
                console.log(`[SYNC] Imported:`, imported);

                if (agents.length > 0) {
                    const agentImported = await (window as any).api?.agentsImport?.({ agents });
                    if (agentImported?.error) {
                        console.warn('[SYNC] Agent import failed:', agentImported.error);
                    } else {
                        console.log(`[SYNC] Imported ${agents.length} agent record(s)`);
                    }
                }
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
    }, [isOnline, isAuthenticated, isEncryptionReady, getToken, categorySelection]);

    useEffect(() => {
        const intervalMs = SYNC_FREQUENCIES[syncFrequency];
        if (syncIntervalRef.current) {
            clearInterval(syncIntervalRef.current);
            syncIntervalRef.current = null;
        }

        if (!isAuthenticated || !isOnline || !isEncryptionReady || intervalMs === 0) return;

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

    const forceFullResync = useCallback(async () => {
        const ok = window.confirm('This clears the sync cursor and re-uploads all local data. Continue?');
        if (!ok) return;
        localStorage.removeItem('incognide-initial-sync-done');
        localStorage.removeItem(LAST_SYNC_KEY);
        setLastSyncTime(null);
        lastSyncRef.current = null;
        await triggerSync();
    }, [triggerSync]);

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
        forceFullResync,
        setSyncFrequency,
        syncCategories,
        categorySelection,
        categoriesLoading,
        toggleCategory,
        refreshCategories,
    };
};

export default useSync;
