import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';

interface FileItem {
    name: string;
    path: string;
    type: 'file' | 'directory';
}

interface CommandPaletteProps {
    isOpen: boolean;
    onClose: () => void;
    onFileSelect: (filePath: string) => void;
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
    currentPath,
    folderStructure,
}) => {
    const [query, setQuery] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    const allFiles = useMemo(() => {
        return flattenFiles(folderStructure, currentPath).filter(f => f.type === 'file');
    }, [folderStructure, currentPath]);

    const filteredFiles = useMemo(() => {
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
    }, [allFiles, query]);

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
                setSelectedIndex(i => Math.min(i + 1, filteredFiles.length - 1));
                break;
            case 'ArrowUp':
                e.preventDefault();
                setSelectedIndex(i => Math.max(i - 1, 0));
                break;
            case 'Enter':
                e.preventDefault();
                if (filteredFiles[selectedIndex]) {
                    onFileSelect(filteredFiles[selectedIndex].path);
                    onClose();
                }
                break;
            case 'Escape':
                e.preventDefault();
                onClose();
                break;
        }
    }, [filteredFiles, selectedIndex, onFileSelect, onClose]);

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
                        placeholder="Search files by name..."
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
                    {filteredFiles.length === 0 ? (
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
