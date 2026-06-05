import { useState, useCallback, useRef, useEffect } from 'react';
import { setActiveConnectionId as setFsConnection } from '../api/fileSystem';

export interface SshConnection {
    id: string;
    host: string;
    port: number;
    username: string;
    password?: string;
    privateKeyPath?: string;
    passphrase?: string;
    currentPath: string;
    isConnected: boolean;
}

const STORAGE_KEY = 'incognide_ssh_connections';

function loadSavedConfigs(): Omit<SshConnection, 'isConnected' | 'currentPath'>[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return JSON.parse(raw);
    } catch {}
    return [];
}

function saveConfigs(configs: Omit<SshConnection, 'isConnected' | 'currentPath'>[]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(configs.map(c => {
        const { password, passphrase, ...rest } = c;
        return rest;
    })));
}

export function useRemoteConnections() {
    const [connections, setConnections] = useState<SshConnection[]>(() => {
        const saved = loadSavedConfigs();
        return saved.map(c => ({ ...c, isConnected: false, currentPath: '/home/' + c.username }));
    });
    const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null);
    const activeConnection = connections.find(c => c.id === activeConnectionId) || null;
    const listenersRef = useRef<(() => void)[]>([]);

    useEffect(() => {
        const cleanupData = (window as any).api?.onSshTerminalData?.(() => {});
        const cleanupClose = (window as any).api?.onSshTerminalClosed?.(() => {});
        const cleanupDisc = (window as any).api?.onSshDisconnected?.((data: any) => {
            if (data?.id) {
                setConnections(prev => prev.map(c => c.id === data.id ? { ...c, isConnected: false } : c));
                if (activeConnectionId === data.id) {
                    setActiveConnectionId(null);
                    setFsConnection(null);
                }
            }
        });
        return () => {
            cleanupData?.();
            cleanupClose?.();
            cleanupDisc?.();
        };
    }, [activeConnectionId]);

    const addConnection = useCallback((config: Omit<SshConnection, 'isConnected' | 'currentPath'>) => {
        const newConn: SshConnection = {
            ...config,
            isConnected: false,
            currentPath: '/home/' + config.username,
        };
        setConnections(prev => {
            const filtered = prev.filter(c => c.id !== config.id);
            const next = [...filtered, newConn];
            saveConfigs(next);
            return next;
        });
    }, []);

    const removeConnection = useCallback((id: string) => {
        setConnections(prev => {
            const next = prev.filter(c => c.id !== id);
            saveConfigs(next);
            return next;
        });
        if (activeConnectionId === id) {
            setActiveConnectionId(null);
            setFsConnection(null);
        }
    }, [activeConnectionId]);

    const connect = useCallback(async (id: string, password?: string, passphrase?: string) => {
        const conn = connections.find(c => c.id === id);
        if (!conn) return { success: false, error: 'Connection not found' };
        const result = await (window as any).api.sshConnect({
            id: conn.id,
            host: conn.host,
            port: conn.port || 22,
            username: conn.username,
            password: password || conn.password,
            privateKeyPath: conn.privateKeyPath,
            passphrase: passphrase || conn.passphrase,
        });
        if (result.success) {
            setConnections(prev => prev.map(c => c.id === id ? { ...c, isConnected: true } : c));
            setActiveConnectionId(id);
            setFsConnection(id);
        }
        return result;
    }, [connections]);

    const disconnect = useCallback(async (id: string) => {
        await (window as any).api.sshDisconnect({ id });
        setConnections(prev => prev.map(c => c.id === id ? { ...c, isConnected: false } : c));
        if (activeConnectionId === id) {
            setActiveConnectionId(null);
            setFsConnection(null);
        }
    }, [activeConnectionId]);

    const setConnectionPath = useCallback((id: string, path: string) => {
        setConnections(prev => prev.map(c => c.id === id ? { ...c, currentPath: path } : c));
    }, []);

    return {
        connections,
        activeConnectionId,
        activeConnection,
        setActiveConnectionId,
        addConnection,
        removeConnection,
        connect,
        disconnect,
        setConnectionPath,
    };
}
