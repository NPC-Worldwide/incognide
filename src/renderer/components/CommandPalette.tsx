import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';

interface FileItem {
    name: string;
    path: string;
    type: 'file' | 'directory';
}

interface PaneCommand {
    id: string;
    label: string;
    aliases: string[];
    icon: string;
    category: 'pane' | 'team' | 'action';
}

const PANE_COMMANDS: PaneCommand[] = [
    { id: 'chat', label: 'Chat', aliases: ['/chat', '/agent'], icon: '💬', category: 'pane' },
    { id: 'terminal', label: 'Terminal', aliases: ['/term', '/cmd', '/terminal'], icon: '🖥️', category: 'pane' },
    { id: 'browser', label: 'Browser', aliases: ['/brows', '/browser', '/web'], icon: '🌐', category: 'pane' },
    { id: 'vixynt', label: 'Vixynt', aliases: ['/vix', '/vixynt', '/image'], icon: '🎨', category: 'pane' },
    { id: 'scherzo', label: 'Scherzo', aliases: ['/scher', '/scherzo', '/audio', '/music'], icon: '🎵', category: 'pane' },
    { id: 'cartoglyph', label: 'Cartoglyph', aliases: ['/carto', '/map', '/gis'], icon: '🗺️', category: 'pane' },
    { id: 'cartoglyph', label: 'Radio', aliases: ['/radio', '/ham'], icon: '📡', category: 'pane' },
    { id: 'editor', label: 'Editor', aliases: ['/edit', '/editor'], icon: '📝', category: 'pane' },
    { id: 'word', label: 'Word', aliases: ['/word', '/doc'], icon: '📄', category: 'pane' },
    { id: 'ppt', label: 'PowerPoint', aliases: ['/ppt', '/slides'], icon: '📊', category: 'pane' },
    { id: 'excel', label: 'Excel', aliases: ['/xls', '/excel', '/sheets'], icon: '📈', category: 'pane' },
    { id: 'git', label: 'Git', aliases: ['/git'], icon: '🔀', category: 'pane' },
    { id: 'teammanagement', label: 'Team', aliases: ['/team'], icon: '👥', category: 'pane' },
    { id: 'logs', label: 'Logs', aliases: ['/logs'], icon: '📋', category: 'pane' },
    { id: 'settings', label: 'Settings', aliases: ['/settings', '/prefs'], icon: '⚙️', category: 'pane' },
    { id: 'downloads', label: 'Downloads', aliases: ['/downl', '/downloads'], icon: '⬇️', category: 'pane' },
    { id: 'disk-usage', label: 'Disk Usage', aliases: ['/disk'], icon: '💾', category: 'pane' },
    { id: 'data-dash', label: 'Data Dash', aliases: ['/data', '/db', '/dash'], icon: '📊', category: 'pane' },
    { id: 'help', label: 'Help', aliases: ['/help'], icon: '❓', category: 'pane' },
    // Team management submenus
    { id: 'team:npcs', label: 'NPCs', aliases: ['/npcs', '/npc'], icon: '👤', category: 'team' },
    { id: 'team:context', label: 'Context', aliases: ['/context', '/ctx'], icon: '📋', category: 'team' },
    { id: 'team:jinxes', label: 'Jinxes', aliases: ['/jinxes', '/jinx'], icon: '🔧', category: 'team' },
    { id: 'team:memory', label: 'Memory', aliases: ['/memory', '/mem'], icon: '🧠', category: 'team' },
    { id: 'team:knowledge', label: 'Knowledge', aliases: ['/knowledge', '/kg'], icon: '🔗', category: 'team' },
    { id: 'team:cron', label: 'Cron', aliases: ['/cron', '/jobs'], icon: '⏰', category: 'team' },
    { id: 'team:mcp', label: 'MCP', aliases: ['/mcp'], icon: '🔌', category: 'team' },
    { id: 'team:models', label: 'SQL Models', aliases: ['/sql', '/models'], icon: '🗃️', category: 'team' },
    { id: 'team:databases', label: 'Databases', aliases: ['/databases', '/nql'], icon: '🗄️', category: 'team' },
    // Actions
    { id: 'action:pomodoro', label: 'Pomodoro', aliases: ['/pomo', '/pomodoro'], icon: '🍅', category: 'action' },
];

interface CommandPaletteProps {
    isOpen: boolean;
    onClose: () => void;
    onFileSelect: (filePath: string) => void;
    onCommand?: (commandId: string) => void;
    currentPath: string;
    folderStructure: any;
}

const flattenFiles = (structure: any, basePath: string = ''): FileItem[] => {
    const files: FileItem[] = [];

    if (!structure || typeof structure !== 'object') return files;

    if (structure.error) return files;

    for (const [name, value] of Object.entries(structure)) {

        if (!value || typeof value !== 'object') continue;

        const item = value as any;

        if (item.type === 'file') {

            const filePath = item.path || (basePath ? `${basePath}/${name}` : name);
            files.push({ name, path: filePath, type: 'file' });
        } else if (item.type === 'directory') {

            const dirPath = item.path || (basePath ? `${basePath}/${name}` : name);
            files.push({ name, path: dirPath, type: 'directory' });
            if (item.children && typeof item.children === 'object') {
                files.push(...flattenFiles(item.children, dirPath));
            }
        }
    }

    return files;
};

const fuzzyMatch = (query: string, text: string): { match: boolean; score: number; indices: number[] } => {
    const queryLower = query.toLowerCase();
    const textLower = text.toLowerCase();

    if (!query) return { match: true, score: 0, indices: [] };

    let queryIdx = 0;
    let score = 0;
    const indices: number[] = [];
    let consecutiveBonus = 0;

    for (let i = 0; i < textLower.length && queryIdx < queryLower.length; i++) {
        if (textLower[i] === queryLower[queryIdx]) {
            indices.push(i);

            score += 1 + consecutiveBonus;
            consecutiveBonus += 0.5;

            if (i === 0 || text[i - 1] === '/' || text[i - 1] === '_' || text[i - 1] === '-' || text[i - 1] === '.') {
                score += 2;
            }
            queryIdx++;
        } else {
            consecutiveBonus = 0;
        }
    }

    const match = queryIdx === queryLower.length;

    if (match) {
        score -= text.length * 0.01;
    }

    return { match, score, indices };
};

const HighlightedText: React.FC<{ text: string; indices: number[] }> = ({ text, indices }) => {
    const indexSet = new Set(indices);
    return (
        <>
            {text.split('').map((char, i) => (
                <span key={i} style={indexSet.has(i) ? { color: '#89b4fa', fontWeight: 'bold' } : undefined}>
                    {char}
                </span>
            ))}
        </>
    );
};

export const CommandPalette: React.FC<CommandPaletteProps> = ({
    isOpen,
    onClose,
    onFileSelect,
    onCommand,
    currentPath,
    folderStructure,
}) => {
    const [query, setQuery] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    const isCommandMode = query.startsWith('/');

    const filteredCommands = useMemo(() => {
        if (!isCommandMode) return [];
        const q = query.toLowerCase();
        return PANE_COMMANDS.filter(cmd =>
            cmd.aliases.some(a => a.startsWith(q)) ||
            cmd.label.toLowerCase().includes(q.slice(1))
        ).sort((a, b) => {
            const aExact = a.aliases.some(al => al === q);
            const bExact = b.aliases.some(al => al === q);
            if (aExact !== bExact) return aExact ? -1 : 1;
            const aStarts = a.aliases.some(al => al.startsWith(q));
            const bStarts = b.aliases.some(al => al.startsWith(q));
            if (aStarts !== bStarts) return aStarts ? -1 : 1;
            return a.label.localeCompare(b.label);
        });
    }, [query, isCommandMode]);

    const allFiles = useMemo(() => {
        return flattenFiles(folderStructure, currentPath).filter(f => f.type === 'file');
    }, [folderStructure, currentPath]);

    const filteredFiles = useMemo(() => {
        if (isCommandMode) return [];
        if (!query.trim()) {
            return allFiles.slice(0, 50);
        }

        const results = allFiles
            .map(file => {
                const { match, score, indices } = fuzzyMatch(query, file.name);
                const pathMatch = fuzzyMatch(query, file.path);
                return {
                    file,
                    match: match || pathMatch.match,
                    score: Math.max(score, pathMatch.score * 0.8),
                    indices: match ? indices : pathMatch.indices,
                    usePathIndices: !match && pathMatch.match,
                };
            })
            .filter(r => r.match)
            .sort((a, b) => b.score - a.score)
            .slice(0, 50);

        return results.map(r => ({ ...r.file, indices: r.indices, usePathIndices: r.usePathIndices }));
    }, [allFiles, query, isCommandMode]);

    const totalItems = isCommandMode ? filteredCommands.length : filteredFiles.length;

    useEffect(() => {
        setSelectedIndex(0);
    }, [query]);

    useEffect(() => {
        if (isOpen) {
            setQuery('');
            setSelectedIndex(0);
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [isOpen]);

    useEffect(() => {
        if (listRef.current) {
            const selectedElement = listRef.current.children[selectedIndex] as HTMLElement;
            if (selectedElement) {
                selectedElement.scrollIntoView({ block: 'nearest' });
            }
        }
    }, [selectedIndex]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setSelectedIndex(i => Math.min(i + 1, totalItems - 1));
                break;
            case 'ArrowUp':
                e.preventDefault();
                setSelectedIndex(i => Math.max(i - 1, 0));
                break;
            case 'Enter':
                e.preventDefault();
                if (isCommandMode) {
                    if (filteredCommands[selectedIndex]) {
                        onCommand?.(filteredCommands[selectedIndex].id);
                        onClose();
                    }
                } else if (filteredFiles[selectedIndex]) {
                    onFileSelect(filteredFiles[selectedIndex].path);
                    onClose();
                }
                break;
            case 'Escape':
                e.preventDefault();
                onClose();
                break;
        }
    }, [filteredFiles, filteredCommands, selectedIndex, onFileSelect, onCommand, onClose, isCommandMode, totalItems]);

    if (!isOpen) return null;

    const getFileIcon = (fileName: string) => {
        const ext = fileName.split('.').pop()?.toLowerCase();
        const icons: Record<string, string> = {
            'js': '📜', 'jsx': '⚛️', 'ts': '📘', 'tsx': '⚛️',
            'py': '🐍', 'json': '📋', 'md': '📝', 'css': '🎨',
            'html': '🌐', 'svg': '🖼️', 'png': '🖼️', 'jpg': '🖼️',
            'pdf': '📄', 'txt': '📄', 'yml': '⚙️', 'yaml': '⚙️',
        };
        return icons[ext || ''] || '📄';
    };

    const overlay = (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'center',
                paddingTop: '15vh',
                zIndex: 100000,
            }}
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div
                style={{
                    width: '600px',
                    maxWidth: '90vw',
                    backgroundColor: '#1e1e2e',
                    borderRadius: '12px',
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
                    border: '1px solid #45475a',
                    overflow: 'hidden',
                }}
            >
                <div style={{ padding: '16px', borderBottom: '1px solid #45475a' }}>
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Search files... (type / for commands)"
                        style={{
                            width: '100%',
                            padding: '12px 16px',
                            fontSize: '16px',
                            backgroundColor: '#313244',
                            border: '1px solid #45475a',
                            borderRadius: '8px',
                            color: '#cdd6f4',
                            outline: 'none',
                        }}
                    />
                </div>

                <div
                    ref={listRef}
                    style={{
                        maxHeight: '400px',
                        overflow: 'auto',
                    }}
                >
                    {isCommandMode ? (
                        filteredCommands.length === 0 ? (
                            <div style={{ padding: '24px', textAlign: 'center', color: '#6c7086' }}>
                                No matching commands
                            </div>
                        ) : (
                            filteredCommands.map((cmd, index) => (
                                <div
                                    key={cmd.id}
                                    onClick={() => { onCommand?.(cmd.id); onClose(); }}
                                    style={{
                                        padding: '10px 16px',
                                        cursor: 'pointer',
                                        backgroundColor: index === selectedIndex ? '#313244' : 'transparent',
                                        borderLeft: index === selectedIndex ? '3px solid #89b4fa' : '3px solid transparent',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '12px',
                                    }}
                                    onMouseEnter={() => setSelectedIndex(index)}
                                >
                                    <span style={{ fontSize: '18px' }}>{cmd.icon}</span>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ color: '#cdd6f4', fontWeight: 500 }}>{cmd.label}</div>
                                        <div style={{ color: '#6c7086', fontSize: '12px' }}>
                                            {cmd.aliases.join(' ')}
                                            {cmd.category === 'team' && <span style={{ marginLeft: 8, color: '#9399b2' }}>Team</span>}
                                        </div>
                                    </div>
                                </div>
                            ))
                        )
                    ) : filteredFiles.length === 0 ? (
                        <div style={{ padding: '24px', textAlign: 'center', color: '#6c7086' }}>
                            {query ? 'No files found' : 'No files in workspace'}
                        </div>
                    ) : (
                        filteredFiles.map((file: any, index) => (
                            <div
                                key={file.path}
                                onClick={() => {
                                    onFileSelect(file.path);
                                    onClose();
                                }}
                                style={{
                                    padding: '10px 16px',
                                    cursor: 'pointer',
                                    backgroundColor: index === selectedIndex ? '#313244' : 'transparent',
                                    borderLeft: index === selectedIndex ? '3px solid #89b4fa' : '3px solid transparent',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '12px',
                                }}
                                onMouseEnter={() => setSelectedIndex(index)}
                            >
                                <span style={{ fontSize: '18px' }}>{getFileIcon(file.name)}</span>
                                <div style={{ flex: 1, overflow: 'hidden' }}>
                                    <div style={{
                                        color: '#cdd6f4',
                                        fontWeight: 500,
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                    }}>
                                        {file.indices && !file.usePathIndices ? (
                                            <HighlightedText text={file.name} indices={file.indices} />
                                        ) : (
                                            file.name
                                        )}
                                    </div>
                                    <div style={{
                                        color: '#6c7086',
                                        fontSize: '12px',
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                    }}>
                                        {file.indices && file.usePathIndices ? (
                                            <HighlightedText text={file.path} indices={file.indices} />
                                        ) : (
                                            file.path.replace(currentPath + '/', '')
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                <div style={{
                    padding: '8px 16px',
                    borderTop: '1px solid #45475a',
                    display: 'flex',
                    gap: '16px',
                    fontSize: '12px',
                    color: '#6c7086',
                }}>
                    <span><kbd style={{ backgroundColor: '#313244', padding: '2px 6px', borderRadius: '4px' }}>↑↓</kbd> Navigate</span>
                    <span><kbd style={{ backgroundColor: '#313244', padding: '2px 6px', borderRadius: '4px' }}>Enter</kbd> Open</span>
                    <span><kbd style={{ backgroundColor: '#313244', padding: '2px 6px', borderRadius: '4px' }}>Esc</kbd> Close</span>
                </div>
            </div>
        </div>
    );

    return createPortal(overlay, document.body);
};

export default CommandPalette;
