import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { GitBranch, RefreshCw, Check, X, AlertTriangle, SplitSquareHorizontal, AlignJustify, ChevronDown, ChevronUp, GitMerge, Undo2, ArrowLeft, ArrowRight, Combine, Save } from 'lucide-react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { json } from '@codemirror/lang-json';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { markdown } from '@codemirror/lang-markdown';
import { vscodeDark } from '@uiw/codemirror-theme-vscode';
import { githubLight } from '@uiw/codemirror-theme-github';
import { EditorView } from '@codemirror/view';

interface DiffViewerProps {
    filePath: string;
    diffStatus?: string;
    currentPath?: string;
    onStage?: () => void;
    onUnstage?: () => void;
    onDiscard?: () => void;
}

interface MergeConflict {
    id: number;
    startLine: number;
    endLine: number;
    ours: string;
    theirs: string;
    oursLabel: string;
    theirsLabel: string;
    resolved?: 'ours' | 'theirs' | 'both' | 'custom';
    resolvedContent?: string;
}

const DiffViewer: React.FC<DiffViewerProps> = ({
    filePath,
    diffStatus,
    currentPath,
    onStage,
    onUnstage,
    onDiscard
}) => {
    const [originalContent, setOriginalContent] = useState<string>('');
    const [modifiedContent, setModifiedContent] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<'split' | 'unified' | 'conflicts'>('split');
    const [mergeConflicts, setMergeConflicts] = useState<MergeConflict[]>([]);
    const [isDark, setIsDark] = useState(true);
    const [hasUnsavedResolutions, setHasUnsavedResolutions] = useState(false);

    // Detect file extension for syntax highlighting
    const getLanguageExtension = useCallback((path: string) => {
        const ext = path.split('.').pop()?.toLowerCase();
        switch (ext) {
            case 'js':
            case 'jsx':
            case 'ts':
            case 'tsx':
                return javascript({ jsx: true, typescript: ext.includes('ts') });
            case 'py':
                return python();
            case 'json':
                return json();
            case 'html':
                return html();
            case 'css':
            case 'scss':
            case 'less':
                return css();
            case 'md':
            case 'markdown':
                return markdown();
            default:
                return [];
        }
    }, []);

    // Detect merge conflicts in content
    const detectMergeConflicts = useCallback((content: string) => {
        const conflicts: MergeConflict[] = [];
        const lines = content.split('\n');
        let inConflict = false;
        let conflictStart = -1;
        let ours = '';
        let theirs = '';
        let oursLabel = 'HEAD';
        let theirsLabel = '';
        let inOurs = true;
        let conflictId = 0;

        lines.forEach((line, i) => {
            if (line.startsWith('<<<<<<<')) {
                inConflict = true;
                conflictStart = i;
                oursLabel = line.replace('<<<<<<<', '').trim() || 'HEAD';
                ours = '';
                theirs = '';
                inOurs = true;
            } else if (line.startsWith('=======') && inConflict) {
                inOurs = false;
            } else if (line.startsWith('>>>>>>>') && inConflict) {
                theirsLabel = line.replace('>>>>>>>', '').trim() || 'Incoming';
                conflicts.push({
                    id: conflictId++,
                    startLine: conflictStart,
                    endLine: i,
                    ours: ours.trimEnd(),
                    theirs: theirs.trimEnd(),
                    oursLabel,
                    theirsLabel
                });
                inConflict = false;
            } else if (inConflict) {
                if (inOurs) {
                    ours += line + '\n';
                } else {
                    theirs += line + '\n';
                }
            }
        });

        return conflicts;
    }, []);

    const loadContent = async () => {
        setLoading(true);
        setError(null);
        try {
            const repoPath = currentPath || filePath.split('/').slice(0, -1).join('/');
            const relativePath = filePath.replace(repoPath + '/', '').replace(repoPath, '');

            // Load original content from git (HEAD version)
            const originalResult = await (window as any).api?.gitShowFile?.(repoPath, relativePath, 'HEAD');
            if (originalResult?.success) {
                setOriginalContent(originalResult.content || '');
            } else {
                // File might be new, so no original
                setOriginalContent('');
            }

            // Load current modified content
            const modifiedResult = await (window as any).api?.readFileContent?.(filePath);
            if (modifiedResult) {
                setModifiedContent(modifiedResult);
                // Check for merge conflicts
                const conflicts = detectMergeConflicts(modifiedResult);
                setMergeConflicts(conflicts);
                // Auto-switch to conflicts view if there are conflicts
                if (conflicts.length > 0 && viewMode !== 'conflicts') {
                    setViewMode('conflicts');
                }
            } else {
                setModifiedContent('');
            }
        } catch (err: any) {
            setError(err.message || 'Failed to load diff');
        }
        setLoading(false);
        setHasUnsavedResolutions(false);
    };

    useEffect(() => {
        loadContent();
        // Check theme
        setIsDark(document.documentElement.classList.contains('dark'));
    }, [filePath, currentPath]);

    const handleStage = async () => {
        try {
            const repoPath = currentPath || filePath.split('/').slice(0, -1).join('/');
            const relativePath = filePath.replace(repoPath + '/', '').replace(repoPath, '');
            await (window as any).api?.gitStageFile?.(repoPath, relativePath);
            onStage?.();
        } catch (err) {
            console.error('Failed to stage file:', err);
        }
    };

    const handleDiscard = async () => {
        if (!confirm('Are you sure you want to discard all changes to this file?')) return;
        try {
            const repoPath = currentPath || filePath.split('/').slice(0, -1).join('/');
            const relativePath = filePath.replace(repoPath + '/', '').replace(repoPath, '');
            await (window as any).api?.gitDiscardFile?.(repoPath, relativePath);
            await loadContent();
            onDiscard?.();
        } catch (err) {
            console.error('Failed to discard changes:', err);
        }
    };

    // Resolve a specific conflict
    const resolveConflict = useCallback((conflictId: number, resolution: 'ours' | 'theirs' | 'both') => {
        setMergeConflicts(prev => prev.map(c => {
            if (c.id !== conflictId) return c;
            let resolvedContent = '';
            if (resolution === 'ours') {
                resolvedContent = c.ours;
            } else if (resolution === 'theirs') {
                resolvedContent = c.theirs;
            } else {
                resolvedContent = c.ours + '\n' + c.theirs;
            }
            return { ...c, resolved: resolution, resolvedContent };
        }));
        setHasUnsavedResolutions(true);
    }, []);

    // Apply all conflict resolutions and save file
    const applyResolutions = useCallback(async () => {
        const unresolvedCount = mergeConflicts.filter(c => !c.resolved).length;
        if (unresolvedCount > 0) {
            if (!confirm(`There are ${unresolvedCount} unresolved conflicts. Continue anyway?`)) {
                return;
            }
        }

        let newContent = modifiedContent;
        // Apply resolutions in reverse order to preserve line numbers
        const sortedConflicts = [...mergeConflicts].sort((a, b) => b.startLine - a.startLine);

        for (const conflict of sortedConflicts) {
            if (!conflict.resolved) continue;

            const lines = newContent.split('\n');
            const before = lines.slice(0, conflict.startLine);
            const after = lines.slice(conflict.endLine + 1);
            const resolvedLines = (conflict.resolvedContent || '').split('\n');

            newContent = [...before, ...resolvedLines, ...after].join('\n');
        }

        try {
            await (window as any).api?.writeFileContent?.(filePath, newContent);
            await loadContent();
        } catch (err) {
            console.error('Failed to save resolved conflicts:', err);
        }
    }, [mergeConflicts, modifiedContent, filePath, loadContent]);

    const fileName = filePath.split('/').pop() || filePath;
    const langExt = getLanguageExtension(filePath);
    const theme = isDark ? vscodeDark : githubLight;

    const editorExtensions = useMemo(() => [
        langExt,
        EditorView.lineWrapping,
        EditorView.editable.of(false), // Read-only
    ].flat(), [langExt]);

    const renderSplitView = () => (
        <div className="flex flex-1 min-h-0">
            {/* Left side - Original */}
            <div className="flex-1 flex flex-col border-r theme-border min-w-0">
                <div className="px-2 py-1 text-[10px] font-medium text-red-300 bg-red-900/20 flex items-center gap-1">
                    <GitBranch size={10} /> Original (HEAD)
                </div>
                <div className="flex-1 overflow-auto">
                    <CodeMirror
                        value={originalContent}
                        theme={theme}
                        extensions={editorExtensions}
                        className="h-full text-xs"
                        basicSetup={{
                            lineNumbers: true,
                            foldGutter: true,
                            highlightActiveLine: false,
                        }}
                    />
                </div>
            </div>

            {/* Right side - Modified */}
            <div className="flex-1 flex flex-col min-w-0">
                <div className="px-2 py-1 text-[10px] font-medium text-green-300 bg-green-900/20 flex items-center gap-1">
                    <GitBranch size={10} /> Modified (Working Copy)
                    {mergeConflicts.length > 0 && (
                        <span className="ml-auto flex items-center gap-1 text-yellow-400">
                            <AlertTriangle size={10} /> {mergeConflicts.length} conflict{mergeConflicts.length !== 1 ? 's' : ''}
                        </span>
                    )}
                </div>
                <div className="flex-1 overflow-auto">
                    <CodeMirror
                        value={modifiedContent}
                        theme={theme}
                        extensions={editorExtensions}
                        className="h-full text-xs"
                        basicSetup={{
                            lineNumbers: true,
                            foldGutter: true,
                            highlightActiveLine: false,
                        }}
                    />
                </div>
            </div>
        </div>
    );

    const renderUnifiedView = () => {
        const originalLines = originalContent.split('\n');
        const modifiedLines = modifiedContent.split('\n');

        return (
            <div className="flex-1 overflow-auto font-mono text-xs">
                {modifiedLines.map((line, i) => {
                    const isConflictStart = line.startsWith('<<<<<<<');
                    const isConflictMid = line.startsWith('=======');
                    const isConflictEnd = line.startsWith('>>>>>>>');
                    const isConflictLine = isConflictStart || isConflictMid || isConflictEnd;
                    const isAdded = !originalLines.includes(line) && !isConflictLine;

                    return (
                        <div
                            key={i}
                            className={`flex ${
                                isConflictStart ? 'bg-red-900/40 text-red-300' :
                                isConflictEnd ? 'bg-green-900/40 text-green-300' :
                                isConflictMid ? 'bg-yellow-900/40 text-yellow-300' :
                                isAdded ? 'bg-green-900/30' :
                                ''
                            }`}
                        >
                            <span className="w-12 text-right pr-2 text-gray-500 select-none border-r border-gray-700 flex-shrink-0">
                                {i + 1}
                            </span>
                            <span className={`w-4 text-center flex-shrink-0 ${
                                isConflictLine ? 'text-yellow-400' :
                                isAdded ? 'text-green-400' :
                                'text-gray-500'
                            }`}>
                                {isConflictLine ? '!' : isAdded ? '+' : ' '}
                            </span>
                            <pre className="flex-1 whitespace-pre-wrap break-all px-2">{line}</pre>
                        </div>
                    );
                })}
            </div>
        );
    };

    // Render conflict resolution view
    const renderConflictsView = () => {
        if (mergeConflicts.length === 0) {
            return (
                <div className="flex-1 flex items-center justify-center text-gray-400">
                    <div className="text-center">
                        <Check size={48} className="mx-auto mb-2 text-green-400" />
                        <p>No merge conflicts detected</p>
                    </div>
                </div>
            );
        }

        const resolvedCount = mergeConflicts.filter(c => c.resolved).length;

        return (
            <div className="flex-1 overflow-auto p-4 space-y-4">
                <div className="flex items-center justify-between mb-4">
                    <div className="text-sm">
                        <span className="text-gray-400">Progress: </span>
                        <span className={resolvedCount === mergeConflicts.length ? 'text-green-400' : 'text-yellow-400'}>
                            {resolvedCount}/{mergeConflicts.length} resolved
                        </span>
                    </div>
                    {hasUnsavedResolutions && (
                        <button
                            onClick={applyResolutions}
                            className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 rounded flex items-center gap-1"
                        >
                            <Save size={12} /> Apply Resolutions
                        </button>
                    )}
                </div>

                {mergeConflicts.map((conflict, idx) => (
                    <div
                        key={conflict.id}
                        className={`rounded-lg border ${
                            conflict.resolved ? 'border-green-500/50 bg-green-900/10' : 'border-yellow-500/50 bg-yellow-900/10'
                        }`}
                    >
                        {/* Conflict header */}
                        <div className="px-3 py-2 border-b border-gray-700/50 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-medium text-gray-300">
                                    Conflict #{idx + 1}
                                </span>
                                <span className="text-[10px] text-gray-500">
                                    Lines {conflict.startLine + 1}-{conflict.endLine + 1}
                                </span>
                                {conflict.resolved && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">
                                        Resolved: {conflict.resolved}
                                    </span>
                                )}
                            </div>
                            {!conflict.resolved && (
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => resolveConflict(conflict.id, 'ours')}
                                        className="px-2 py-1 text-[10px] bg-red-600/80 hover:bg-red-700 rounded flex items-center gap-1"
                                        title={`Accept ${conflict.oursLabel}`}
                                    >
                                        <ArrowLeft size={10} /> Ours
                                    </button>
                                    <button
                                        onClick={() => resolveConflict(conflict.id, 'both')}
                                        className="px-2 py-1 text-[10px] bg-purple-600/80 hover:bg-purple-700 rounded flex items-center gap-1"
                                        title="Accept both changes"
                                    >
                                        <Combine size={10} /> Both
                                    </button>
                                    <button
                                        onClick={() => resolveConflict(conflict.id, 'theirs')}
                                        className="px-2 py-1 text-[10px] bg-green-600/80 hover:bg-green-700 rounded flex items-center gap-1"
                                        title={`Accept ${conflict.theirsLabel}`}
                                    >
                                        Theirs <ArrowRight size={10} />
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Conflict content */}
                        <div className="flex">
                            {/* Ours side */}
                            <div className={`flex-1 border-r border-gray-700/50 ${conflict.resolved === 'theirs' ? 'opacity-40' : ''}`}>
                                <div className="px-2 py-1 text-[10px] font-medium text-red-300 bg-red-900/30 flex items-center gap-1">
                                    <ArrowLeft size={10} /> {conflict.oursLabel} (Current)
                                </div>
                                <pre className="p-2 text-xs font-mono whitespace-pre-wrap bg-red-900/10 min-h-[60px]">
                                    {conflict.ours || <span className="text-gray-500 italic">(empty)</span>}
                                </pre>
                            </div>

                            {/* Theirs side */}
                            <div className={`flex-1 ${conflict.resolved === 'ours' ? 'opacity-40' : ''}`}>
                                <div className="px-2 py-1 text-[10px] font-medium text-green-300 bg-green-900/30 flex items-center gap-1">
                                    {conflict.theirsLabel} (Incoming) <ArrowRight size={10} />
                                </div>
                                <pre className="p-2 text-xs font-mono whitespace-pre-wrap bg-green-900/10 min-h-[60px]">
                                    {conflict.theirs || <span className="text-gray-500 italic">(empty)</span>}
                                </pre>
                            </div>
                        </div>

                        {/* Show resolved content preview */}
                        {conflict.resolved && conflict.resolvedContent && (
                            <div className="border-t border-gray-700/50">
                                <div className="px-2 py-1 text-[10px] font-medium text-blue-300 bg-blue-900/30 flex items-center gap-1">
                                    <Check size={10} /> Resolved Content
                                </div>
                                <pre className="p-2 text-xs font-mono whitespace-pre-wrap bg-blue-900/10">
                                    {conflict.resolvedContent}
                                </pre>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        );
    };

    return (
        <div className="flex flex-col h-full theme-bg-primary">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b theme-border bg-gradient-to-r from-orange-900/20 to-amber-900/20">
                <div className="flex items-center gap-2">
                    <GitBranch size={16} className="text-orange-400" />
                    <span className="text-sm font-medium">{fileName}</span>
                    {diffStatus && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                            diffStatus === 'M' ? 'bg-yellow-500/20 text-yellow-400' :
                            diffStatus === 'A' ? 'bg-green-500/20 text-green-400' :
                            diffStatus === 'D' ? 'bg-red-500/20 text-red-400' :
                            diffStatus === 'U' ? 'bg-purple-500/20 text-purple-400' :
                            'bg-gray-500/20 text-gray-400'
                        }`}>
                            {diffStatus === 'M' ? 'Modified' :
                             diffStatus === 'A' ? 'Added' :
                             diffStatus === 'D' ? 'Deleted' :
                             diffStatus === 'U' ? 'Conflict' :
                             diffStatus}
                        </span>
                    )}
                    {mergeConflicts.length > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 flex items-center gap-1">
                            <GitMerge size={10} /> {mergeConflicts.length} conflict{mergeConflicts.length !== 1 ? 's' : ''}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-1">
                    {/* View mode buttons */}
                    <div className="flex items-center bg-black/20 rounded p-0.5 mr-2">
                        <button
                            onClick={() => setViewMode('split')}
                            className={`p-1.5 rounded text-xs ${viewMode === 'split' ? 'bg-orange-500/30 text-orange-400' : 'text-gray-400 hover:text-gray-200'}`}
                            title="Split view"
                        >
                            <SplitSquareHorizontal size={14} />
                        </button>
                        <button
                            onClick={() => setViewMode('unified')}
                            className={`p-1.5 rounded text-xs ${viewMode === 'unified' ? 'bg-orange-500/30 text-orange-400' : 'text-gray-400 hover:text-gray-200'}`}
                            title="Unified view"
                        >
                            <AlignJustify size={14} />
                        </button>
                        {mergeConflicts.length > 0 && (
                            <button
                                onClick={() => setViewMode('conflicts')}
                                className={`p-1.5 rounded text-xs ${viewMode === 'conflicts' ? 'bg-orange-500/30 text-orange-400' : 'text-gray-400 hover:text-gray-200'}`}
                                title="Conflict resolution"
                            >
                                <GitMerge size={14} />
                            </button>
                        )}
                    </div>
                    <button
                        onClick={loadContent}
                        className="p-1.5 rounded hover:bg-white/10 text-gray-400"
                        title="Refresh"
                    >
                        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                    </button>
                    <button
                        onClick={handleStage}
                        className="px-2 py-1 text-xs bg-green-600 hover:bg-green-700 rounded flex items-center gap-1"
                        title="Stage file"
                    >
                        <Check size={12} /> Stage
                    </button>
                    <button
                        onClick={handleDiscard}
                        className="px-2 py-1 text-xs bg-red-600/80 hover:bg-red-700 rounded flex items-center gap-1"
                        title="Discard changes"
                    >
                        <Undo2 size={12} /> Discard
                    </button>
                </div>
            </div>

            {/* Content */}
            {loading ? (
                <div className="flex-1 flex items-center justify-center">
                    <RefreshCw size={24} className="animate-spin text-gray-400" />
                </div>
            ) : error ? (
                <div className="flex-1 flex items-center justify-center text-red-400">
                    {error}
                </div>
            ) : viewMode === 'split' ? (
                renderSplitView()
            ) : viewMode === 'unified' ? (
                renderUnifiedView()
            ) : (
                renderConflictsView()
            )}

            {/* Footer with file path */}
            <div className="px-3 py-1 border-t theme-border text-[10px] text-gray-500 truncate flex items-center justify-between">
                <span>{filePath}</span>
                <span>
                    {originalContent.split('\n').length} → {modifiedContent.split('\n').length} lines
                </span>
            </div>
        </div>
    );
};

export default DiffViewer;
