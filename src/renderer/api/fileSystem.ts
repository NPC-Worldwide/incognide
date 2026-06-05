// Transparent filesystem proxy — routes calls to local IPC or SSH based on active connection
let _activeConnectionId: string | null = null;

export function setActiveConnectionId(id: string | null) {
    _activeConnectionId = id;
}

export function getActiveConnectionId(): string | null {
    return _activeConnectionId;
}

export function isRemote(): boolean {
    return !!_activeConnectionId;
}

// ============================================================
// Directory
// ============================================================
export async function readDirectoryStructure(dirPath: string, options?: any) {
    if (_activeConnectionId) {
        return (window as any).api.sshReadDirectory({ id: _activeConnectionId, dirPath });
    }
    return (window as any).api.readDirectoryStructure(dirPath, options);
}

export async function readDirectory(dirPath: string) {
    if (_activeConnectionId) {
        return (window as any).api.sshReadDirectory({ id: _activeConnectionId, dirPath });
    }
    return (window as any).api.readDirectory(dirPath);
}

export async function createDirectory(dirPath: string) {
    if (_activeConnectionId) {
        return (window as any).api.sshMkdir({ id: _activeConnectionId, dirPath });
    }
    return (window as any).api.createDirectory(dirPath);
}

export async function deleteDirectory(dirPath: string) {
    if (_activeConnectionId) {
        return (window as any).api.sshUnlink({ id: _activeConnectionId, filePath: dirPath, isDirectory: true });
    }
    return (window as any).api.deleteDirectory(dirPath);
}

export async function ensureDirectory(dirPath: string) {
    if (_activeConnectionId) {
        const stat = await (window as any).api.sshStat({ id: _activeConnectionId, filePath: dirPath });
        if (stat.error) {
            return (window as any).api.sshMkdir({ id: _activeConnectionId, dirPath });
        }
        return { success: true };
    }
    return (window as any).api.ensureDirectory(dirPath);
}

export async function goUpDirectory(currentPath: string) {
    if (_activeConnectionId) {
        const parts = currentPath.split('/').filter(Boolean);
        parts.pop();
        const parent = parts.length === 0 ? '/' : '/' + parts.join('/');
        return parent;
    }
    return (window as any).api.goUpDirectory(currentPath);
}

export async function getHomeDir() {
    if (_activeConnectionId) {
        return { homeDir: '/home' };
    }
    return (window as any).api.getHomeDir();
}

export async function getNpcshHome() {
    if (_activeConnectionId) {
        return { path: '/home/.npcsh' };
    }
    return (window as any).api.getNpcshHome?.();
}

// ============================================================
// File
// ============================================================
export async function readFileContent(filePath: string) {
    if (_activeConnectionId) {
        return (window as any).api.sshReadFile({ id: _activeConnectionId, filePath });
    }
    return (window as any).api.readFileContent(filePath);
}

export async function writeFileContent(filePath: string, content: string) {
    if (_activeConnectionId) {
        return (window as any).api.sshWriteFile({ id: _activeConnectionId, filePath, content });
    }
    return (window as any).api.writeFileContent(filePath, content);
}

export async function renameFile(oldPath: string, newPath: string) {
    if (_activeConnectionId) {
        return (window as any).api.sshRename({ id: _activeConnectionId, oldPath, newPath });
    }
    return (window as any).api.renameFile(oldPath, newPath);
}

export async function deleteFile(filePath: string) {
    if (_activeConnectionId) {
        return (window as any).api.sshUnlink({ id: _activeConnectionId, filePath, isDirectory: false });
    }
    return (window as any).api.deleteFile(filePath);
}

export async function readFileBuffer(filePath: string) {
    if (_activeConnectionId) {
        return (window as any).api.sshReadFileBuffer({ id: _activeConnectionId, filePath });
    }
    return (window as any).api.readFileBuffer(filePath);
}

// ============================================================
// Path helpers
// ============================================================
export async function open_directory_picker() {
    // Remote doesn't support native picker; return current connection home
    if (_activeConnectionId) {
        return null;
    }
    return (window as any).api.open_directory_picker();
}

export function normalizeRemotePath(p: string): string {
    if (!p) return '/';
    if (!p.startsWith('/')) return '/' + p;
    return p;
}
