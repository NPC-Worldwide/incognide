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
    { id: 'chat', label: 'New Chat', aliases: ['/chat', '/newchat', '/ask'], icon: '💬', category: 'pane' },
    { id: 'agent', label: 'New Agent Chat', aliases: ['/agent', '/npc'], icon: '🤖', category: 'pane' },
    { id: 'terminal', label: 'New Terminal', aliases: ['/term', '/cmd', '/terminal'], icon: '🖥️', category: 'pane' },
    { id: 'browser', label: 'New Browser', aliases: ['/brows', '/browser', '/web'], icon: '🌐', category: 'pane' },
    { id: 'folder', label: 'Open Folder', aliases: ['/folder', '/files'], icon: '📁', category: 'pane' },
    { id: 'search', label: 'Search Workspace', aliases: ['/search', '/find'], icon: '🔍', category: 'pane' },
    { id: 'editor', label: 'New Code Editor', aliases: ['/edit', '/editor', '/code'], icon: '📝', category: 'pane' },
    { id: 'word', label: 'New Word Doc', aliases: ['/word', '/doc'], icon: '📄', category: 'pane' },
    { id: 'ppt', label: 'New PowerPoint', aliases: ['/ppt', '/slides'], icon: '📊', category: 'pane' },
    { id: 'excel', label: 'New Excel Sheet', aliases: ['/xls', '/excel', '/sheets'], icon: '📈', category: 'pane' },
    { id: 'notebook', label: 'New Notebook', aliases: ['/notebook', '/nb'], icon: '📓', category: 'pane' },
    { id: 'radio', label: 'Radio', aliases: ['/radio', '/ham'], icon: '📡', category: 'pane' },
    { id: 'git', label: 'Git', aliases: ['/git'], icon: '🔀', category: 'pane' },
    { id: 'teammanagement', label: 'Team Management', aliases: ['/team'], icon: '👥', category: 'pane' },
    { id: 'logs', label: 'Logs', aliases: ['/logs'], icon: '📋', category: 'pane' },
    { id: 'settings', label: 'Settings', aliases: ['/settings', '/prefs'], icon: '⚙️', category: 'pane' },
    { id: 'disk-usage', label: 'Disk Usage', aliases: ['/disk'], icon: '💾', category: 'pane' },
    { id: 'help', label: 'Help', aliases: ['/help'], icon: '❓', category: 'pane' },
    { id: 'team:npcs', label: 'Team: NPCs', aliases: ['/npcs', '/npc'], icon: '👤', category: 'team' },
    { id: 'team:context', label: 'Team: Context', aliases: ['/context', '/ctx'], icon: '📋', category: 'team' },
    { id: 'team:jinxes', label: 'Team: Jinxes', aliases: ['/jinxes', '/jinx'], icon: '🔧', category: 'team' },
    { id: 'team:memory', label: 'Team: Memory', aliases: ['/memory', '/mem'], icon: '🧠', category: 'team' },
    { id: 'team:knowledge', label: 'Team: Knowledge', aliases: ['/knowledge', '/kg'], icon: '🔗', category: 'team' },
    { id: 'team:cron', label: 'Team: Cron', aliases: ['/cron', '/jobs'], icon: '⏰', category: 'team' },
    { id: 'team:mcp', label: 'Team: MCP', aliases: ['/mcp'], icon: '🔌', category: 'team' },
    { id: 'team:models', label: 'Team: SQL Models', aliases: ['/sql', '/models'], icon: '🗃️', category: 'team' },
    { id: 'team:databases', label: 'Team: Databases', aliases: ['/databases', '/nql'], icon: '🗄️', category: 'team' },
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
    const searchQuery = isCommandMode ? query.slice(1).trim().toLowerCase() : query.toLowerCase();

    const allFiles = useMemo(() => {
        return flattenFiles(folderStructure, currentPath).filter(f => f.type === 'file');
    }, [folderStructure, currentPath]);

    type ListItem =
        | { type: 'command'; command: PaneCommand; score: number }
        | { type: 'file'; file: FileItem & { indices?: number[]; usePathIndices?: boolean }; score: number };

    const items = useMemo<ListItem[]>(() => {
        if (isCommandMode) {
            if (!searchQuery) return PANE_COMMANDS.map(cmd => ({ type: 'command' as const, command: cmd, score: 0 }));
            return PANE_COMMANDS.filter(cmd => {
                const labelLower = cmd.label.toLowerCase();
                return cmd.aliases.some(a => a.startsWith('/' + searchQuery) || a.includes(searchQuery)) ||
                       labelLower.includes(searchQuery);
            }).map(cmd => ({ type: 'command' as const, command: cmd, score: 0 })).sort((a, b) => {
                const aExact = a.command.aliases.some(al => al === '/' + searchQuery);
                const bExact = b.command.aliases.some(al => al === '/' + searchQuery);
                if (aExact !== bExact) return aExact ? -1 : 1;
                const aStarts = a.command.aliases.some(al => al.startsWith('/' + searchQuery));
                const bStarts = b.command.aliases.some(al => al.startsWith('/' + searchQuery));
                if (aStarts !== bStarts) return aStarts ? -1 : 1;
                return a.command.label.localeCompare(b.command.label);
            });
        }

        const commandItems: ListItem[] = PANE_COMMANDS
            .filter(cmd => {
                if (!searchQuery) return true;
                const labelLower = cmd.label.toLowerCase();
                return cmd.aliases.some(a => a.includes(searchQuery)) || labelLower.includes(searchQuery);
            })
            .map(cmd => {
                let score = 0;
                if (searchQuery) {
                    const exact = cmd.aliases.some(a => a === '/' + searchQuery);
                    const starts = cmd.aliases.some(a => a.startsWith('/' + searchQuery)) || cmd.label.toLowerCase().startsWith(searchQuery);
                    const includes = cmd.label.toLowerCase().includes(searchQuery);
                    score = exact ? 1000 : starts ? 500 : includes ? 200 : 0;
                }
                return { type: 'command' as const, command: cmd, score };
            });

        const fileItems: ListItem[] = (() => {
            if (!searchQuery) return [];
            return allFiles
                .map(file => {
                    const nameMatch = fuzzyMatch(query, file.name);
                    const pathMatch = fuzzyMatch(query, file.path);
                    const match = nameMatch.match || pathMatch.match;
                    const score = Math.max(nameMatch.score, pathMatch.score * 0.8);
                    return {
                        type: 'file' as const,
                        file: { ...file, indices: nameMatch.match ? nameMatch.indices : pathMatch.indices, usePathIndices: !nameMatch.match && pathMatch.match },
                        score: match ? score : -1,
                    };
                })
                .filter(r => r.score >= 0)
                .sort((a, b) => b.score - a.score)
                .slice(0, 50);
        })();

        return [...commandItems, ...fileItems].sort((a, b) => {
            if (a.type === 'command' && b.type === 'file' && a.score !== b.score) return b.score - a.score;
            if (a.type === 'file' && b.type === 'command' && a.score !== b.score) return b.score - a.score;
            return b.score - a.score;
        }).slice(0, 100);
    }, [allFiles, query, isCommandMode, searchQuery]);

    const totalItems = items.length;

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
                const selected = items[selectedIndex];
                if (!selected) return;
                if (selected.type === 'command') {
                    onCommand?.(selected.command.id);
                } else {
                    onFileSelect(selected.file.path);
                }
                onClose();
                break;
            case 'Escape':
                e.preventDefault();
                onClose();
                break;
        }
    }, [items, selectedIndex, onFileSelect, onCommand, onClose, totalItems]);

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
                        placeholder="Open anything... (type / for commands only)"
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
                    {items.length === 0 ? (
                        <div style={{ padding: '24px', textAlign: 'center', color: '#6c7086' }}>
                            {query ? 'No matching commands or files' : 'Start typing or type / for commands'}
                        </div>
                    ) : (
                        items.map((item, index) => {
                            const isSelected = index === selectedIndex;
                            if (item.type === 'command') {
                                const cmd = item.command;
                                return (
                                    <div
                                        key={cmd.id}
                                        onClick={() => { onCommand?.(cmd.id); onClose(); }}
                                        style={{
                                            padding: '10px 16px',
                                            cursor: 'pointer',
                                            backgroundColor: isSelected ? '#313244' : 'transparent',
                                            borderLeft: isSelected ? '3px solid #89b4fa' : '3px solid transparent',
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
                                                {cmd.category === 'action' && <span style={{ marginLeft: 8, color: '#9399b2' }}>Action</span>}
                                            </div>
                                        </div>
                                    </div>
                                );
                            }
                            const file = item.file;
                            return (
                                <div
                                    key={file.path}
                                    onClick={() => {
                                        onFileSelect(file.path);
                                        onClose();
                                    }}
                                    style={{
                                        padding: '10px 16px',
                                        cursor: 'pointer',
                                        backgroundColor: isSelected ? '#313244' : 'transparent',
                                        borderLeft: isSelected ? '3px solid #89b4fa' : '3px solid transparent',
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
                            );
                        })
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
