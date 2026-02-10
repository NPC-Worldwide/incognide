import { getFileName } from './utils';
import React, { useMemo, useCallback, useRef, useEffect, useState, memo } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { json } from '@codemirror/lang-json';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { markdown } from '@codemirror/lang-markdown';
import { EditorView, lineNumbers, highlightActiveLineGutter, highlightActiveLine, drawSelection, dropCursor, rectangularSelection, crosshairCursor, highlightSpecialChars } from '@codemirror/view';
import { search, searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { keymap } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { HighlightStyle, syntaxHighlighting, indentOnInput, bracketMatching, foldGutter, foldKeymap } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { lintKeymap } from '@codemirror/lint';
import { BrainCircuit, Edit, FileText, MessageSquare, GitBranch, X, Play } from 'lucide-react';

const appHighlightStyle = HighlightStyle.define([
    { tag: t.keyword, color: '#c678dd' },
    { tag: [t.name, t.deleted, t.character, t.propertyName, t.macroName], color: '#e06c75' },
    { tag: [t.function(t.variableName), t.labelName], color: '#61afef' },
    { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: '#d19a66' },
    { tag: [t.definition(t.name), t.function(t.definition(t.name))], color: '#e5c07b' },
    { tag: [t.typeName, t.className, t.number, t.changed, t.annotation, t.modifier, t.self, t.namespace], color: '#d19a66' },
    { tag: [t.operator, t.operatorKeyword], color: '#56b6c2' },
    { tag: [t.meta, t.comment], color: '#7f848e', fontStyle: 'italic' },
    { tag: [t.string, t.inserted], color: '#98c379' },
    { tag: t.invalid, color: '#ff5555' },
]);

// Custom theme for the editor
const editorTheme = EditorView.theme({
    '&': {
        height: '100%',
        fontSize: '14px',
    },
    '.cm-content': {
        fontFamily: '"Fira Code", "JetBrains Mono", "Cascadia Code", Menlo, Monaco, monospace',
        caretColor: '#89b4fa',
    },
    '.cm-cursor': {
        borderLeftColor: '#89b4fa',
        borderLeftWidth: '2px',
    },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, .cm-content ::selection': {
        backgroundColor: 'rgba(137, 180, 250, 0.3)',
    },
    '.cm-activeLine': {
        backgroundColor: 'rgba(137, 180, 250, 0.08)',
    },
    '.cm-activeLineGutter': {
        backgroundColor: 'rgba(137, 180, 250, 0.1)',
    },
    '.cm-gutters': {
        backgroundColor: '#1e1e2e',
        color: '#6c7086',
        border: 'none',
        borderRight: '1px solid #313244',
    },
    '.cm-lineNumbers .cm-gutterElement': {
        padding: '0 2px 0 4px',
        minWidth: 'unset',
    },
    '.cm-lineNumbers': {
        minWidth: 'unset',
        width: 'auto',
    },
    '.cm-gutter.cm-lineNumbers': {
        minWidth: 'unset',
        width: 'auto',
    },
    '.cm-foldGutter .cm-gutterElement': {
        padding: '0 4px',
        cursor: 'pointer',
    },
    '.cm-foldGutter .cm-gutterElement:hover': {
        color: '#89b4fa',
    },
    '&.cm-focused .cm-matchingBracket': {
        backgroundColor: 'rgba(137, 180, 250, 0.3)',
        outline: '1px solid #89b4fa',
    },
    '.cm-searchMatch': {
        backgroundColor: 'rgba(249, 226, 175, 0.3)',
        outline: '1px solid #f9e2af',
    },
    '.cm-searchMatch.cm-searchMatch-selected': {
        backgroundColor: 'rgba(166, 227, 161, 0.4)',
    },
    '.cm-selectionMatch': {
        backgroundColor: 'rgba(137, 180, 250, 0.2)',
    },
    '.cm-panels': {
        backgroundColor: '#1e1e2e',
        color: '#cdd6f4',
    },
    '.cm-panels.cm-panels-top': {
        borderBottom: '1px solid #313244',
    },
    '.cm-panel.cm-search': {
        padding: '8px 12px',
        backgroundColor: '#181825',
    },
    '.cm-panel.cm-search input, .cm-panel.cm-search button': {
        margin: '0 4px',
        padding: '4px 8px',
        borderRadius: '4px',
        backgroundColor: '#313244',
        border: '1px solid #45475a',
        color: '#cdd6f4',
    },
    '.cm-panel.cm-search button:hover': {
        backgroundColor: '#45475a',
    },
    '.cm-panel.cm-search label': {
        margin: '0 8px',
        color: '#a6adc8',
    },
    '.cm-tooltip': {
        backgroundColor: '#1e1e2e',
        border: '1px solid #313244',
        borderRadius: '6px',
    },
    '.cm-tooltip.cm-tooltip-autocomplete': {
        '& > ul': {
            fontFamily: '"Fira Code", monospace',
            maxHeight: '200px',
        },
        '& > ul > li': {
            padding: '4px 8px',
        },
        '& > ul > li[aria-selected]': {
            backgroundColor: '#313244',
            color: '#cdd6f4',
        },
    },
    '.cm-completionIcon': {
        width: '1em',
        marginRight: '0.5em',
    },
}, { dark: true });

const CodeMirrorEditor = memo(({ value, onChange, filePath, onSave, onContextMenu, onSelect, onSendToTerminal }) => {
    const editorRef = useRef(null);

    const languageExtension = useMemo(() => {
        const ext = filePath?.split('.').pop()?.toLowerCase();
        switch (ext) {
            case 'js': case 'mjs': return javascript();
            case 'jsx': return javascript({ jsx: true });
            case 'ts': return javascript({ typescript: true });
            case 'tsx': return javascript({ jsx: true, typescript: true });
            case 'py': case 'pyw': return python();
            case 'json': case 'jsonc': return json();
            case 'html': case 'htm': return html();
            case 'css': case 'scss': case 'less': return css();
            case 'md': case 'markdown': return markdown();
            default: return [];
        }
    }, [filePath]);

    const customKeymap = useMemo(() => keymap.of([
        { key: 'Mod-s', run: () => { if (onSave) onSave(); return true; } },
        { key: 'Ctrl-Enter', run: (view) => {
            if (onSendToTerminal) {
                const selection = view.state.sliceDoc(
                    view.state.selection.main.from,
                    view.state.selection.main.to
                );
                if (selection) {
                    onSendToTerminal(selection);
                    return true;
                }
            }
            return false;
        }},
        { key: 'Mod-Enter', run: (view) => {
            if (onSendToTerminal) {
                const selection = view.state.sliceDoc(
                    view.state.selection.main.from,
                    view.state.selection.main.to
                );
                if (selection) {
                    onSendToTerminal(selection);
                    return true;
                }
            }
            return false;
        }},
        indentWithTab,
    ]), [onSave, onSendToTerminal]);

    const extensions = useMemo(() => [
        // Core editor features
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        // foldGutter(), // Removed to save horizontal space
        drawSelection(),
        dropCursor(),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        autocompletion(),
        rectangularSelection(),
        crosshairCursor(),
        highlightActiveLine(),
        highlightSelectionMatches(),

        // Language support
        languageExtension,

        // Search with styled panel
        search({ top: true }),

        // Keymaps
        keymap.of([
            ...closeBracketsKeymap,
            ...defaultKeymap,
            ...historyKeymap,
            ...searchKeymap,
            ...foldKeymap,
            ...completionKeymap,
            ...lintKeymap,
        ]),
        customKeymap,

        // Styling
        editorTheme,
        syntaxHighlighting(appHighlightStyle),

        // Optional line wrapping (comment out for horizontal scroll)
        EditorView.lineWrapping,
    ], [languageExtension, customKeymap]);

    const handleUpdate = useCallback((viewUpdate) => {
        if (viewUpdate.selectionSet && onSelect) {
            const { from, to } = viewUpdate.state.selection.main;
            onSelect(from, to);
        }
    }, [onSelect]);

    useEffect(() => {
        const editorDOM = editorRef.current?.editor;
        if (editorDOM) {
            const handleContextMenu = (event) => {
                if (onContextMenu) {
                    const view = editorRef.current?.view;
                    let selection = '';
                    if (view) {
                        const { from, to } = view.state.selection.main;
                        if (from !== to) {
                            selection = view.state.sliceDoc(from, to);
                        }
                    }
                    onContextMenu(event, selection);
                }
            };
            editorDOM.addEventListener('contextmenu', handleContextMenu);
            return () => editorDOM.removeEventListener('contextmenu', handleContextMenu);
        }
    }, [onContextMenu]);

    // Direct keydown handler for Ctrl+Enter (or Shift+Enter) to send selection to terminal
    useEffect(() => {
        const editorDOM = editorRef.current?.editor;
        if (!editorDOM || !onSendToTerminal) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (((e.ctrlKey || e.metaKey) || e.shiftKey) && e.key === 'Enter') {
                const view = editorRef.current?.view;
                if (view) {
                    const { from, to } = view.state.selection.main;
                    if (from !== to) {
                        const selection = view.state.sliceDoc(from, to);
                        if (selection) {
                            e.preventDefault();
                            e.stopPropagation();
                            onSendToTerminal(selection);
                        }
                    }
                }
            }
        };

        editorDOM.addEventListener('keydown', handleKeyDown, true);
        return () => editorDOM.removeEventListener('keydown', handleKeyDown, true);
    }, [onSendToTerminal]);

    return (
        <CodeMirror
            ref={editorRef}
            value={value}
            height="100%"
            style={{ height: '100%' }}
            extensions={extensions}
            onChange={onChange}
            onUpdate={handleUpdate}
        />
    );
});


const CodeEditorPane = ({
    nodeId,
    contentDataRef,
    setRootLayoutNode,
    activeContentPaneId,
    editorContextMenuPos,
    setEditorContextMenuPos,
    aiEditModal,
    renamingPaneId,
    setRenamingPaneId,
    editedFileName,
    setEditedFileName,
    handleTextSelection,
    handleEditorCopy,
    handleEditorPaste,
    handleAddToChat,
    handleAIEdit,
    startAgenticEdit,
    setPromptModal,
    onGitBlame,
    currentPath,
    onRunScript,
    onSendToTerminal,
}) => {
    const paneData = contentDataRef.current[nodeId];
    const [showBlame, setShowBlame] = useState(false);
    const [blameData, setBlameData] = useState<any[] | null>(null);
    const [blameLoading, setBlameLoading] = useState(false);
    const [contextMenuSelection, setContextMenuSelection] = useState('');

    if (!paneData) return null;

    const { contentId: filePath, fileContent, fileChanged } = paneData;
    const fileName = getFileName(filePath) || 'Untitled';
    const isRenaming = renamingPaneId === nodeId;

    const handleLoadBlame = useCallback(async () => {
        if (!currentPath || !filePath) return;
        setBlameLoading(true);
        try {
            // Get relative path from currentPath
            const relativePath = filePath.startsWith(currentPath)
                ? filePath.slice(currentPath.length + 1)
                : filePath;
            const result = await (window as any).api.gitBlame(currentPath, relativePath);
            if (result?.success && Array.isArray(result.blame)) {
                setBlameData(result.blame);
                setShowBlame(true);
            } else {
                console.error('Git blame failed:', result?.error);
                setBlameData(null);
            }
        } catch (err) {
            console.error('Failed to load git blame:', err);
            setBlameData(null);
        } finally {
            setBlameLoading(false);
        }
    }, [currentPath, filePath]);

    const onContentChange = useCallback((value) => {
        if (contentDataRef.current[nodeId]) {
            contentDataRef.current[nodeId].fileContent = value;
            if (!contentDataRef.current[nodeId].fileChanged) {
                contentDataRef.current[nodeId].fileChanged = true;
                setRootLayoutNode(p => ({ ...p }));
            }
        }
    }, [nodeId, contentDataRef, setRootLayoutNode]);

    const onSave = useCallback(async () => {
        const currentPaneData = contentDataRef.current[nodeId];
        if (!currentPaneData) return;

        // If untitled file, prompt for filename
        if (!currentPaneData.contentId && currentPaneData.isUntitled) {
            setPromptModal({
                isOpen: true,
                title: 'Save File',
                message: 'Enter filename with extension (e.g., script.py, index.js, notes.md)',
                defaultValue: 'untitled.txt',
                onConfirm: async (inputFilename) => {
                    if (!inputFilename || inputFilename.trim() === '') return;
                    const cleanName = inputFilename.trim();
                    const filepath = `${currentPath}/${cleanName}`;
                    await window.api.writeFileContent(filepath, currentPaneData.fileContent || '');
                    // Update pane data with the new file path
                    currentPaneData.contentId = filepath;
                    currentPaneData.isUntitled = false;
                    currentPaneData.fileChanged = false;
                    setRootLayoutNode(p => ({ ...p }));
                }
            });
            return;
        }

        // Normal save for existing files
        if (currentPaneData.contentId && currentPaneData.fileChanged) {
            await window.api.writeFileContent(currentPaneData.contentId, currentPaneData.fileContent);
            currentPaneData.fileChanged = false;
            setRootLayoutNode(p => ({ ...p }));
        }
    }, [nodeId, contentDataRef, setRootLayoutNode, setPromptModal, currentPath]);

    const onEditorContextMenu = useCallback((e, selection) => {
        e.preventDefault();
        e.stopPropagation();
        if (activeContentPaneId === nodeId) {
            setContextMenuSelection(selection || '');
            setEditorContextMenuPos({ x: e.clientX, y: e.clientY });
        }
    }, [nodeId, activeContentPaneId, setEditorContextMenuPos]);

    const handleStartRename = useCallback(() => {
        setRenamingPaneId(nodeId);
        setEditedFileName(fileName);
    }, [nodeId, fileName, setRenamingPaneId, setEditedFileName]);

    return (
        <div className="flex-1 flex flex-col min-h-0 theme-bg-secondary relative">
            <div className="flex-1 flex min-h-0">
                {/* Git Blame Panel */}
                {showBlame && Array.isArray(blameData) && (
                    <div className="w-64 border-r theme-border flex flex-col bg-black/20 overflow-hidden">
                        <div className="flex items-center justify-between px-2 py-1 border-b theme-border bg-black/20">
                            <span className="text-xs font-medium theme-text-muted">Git Blame</span>
                            <button onClick={() => setShowBlame(false)} className="p-0.5 theme-hover rounded">
                                <X size={12} />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto text-xs font-mono">
                            {blameData.map((line: any, idx: number) => (
                                <div
                                    key={idx}
                                    className="flex items-center px-2 py-0.5 hover:bg-white/5 border-b border-white/5"
                                    style={{ minHeight: '20px' }}
                                >
                                    <div className="flex-1 truncate">
                                        <span className="text-purple-400">{line.hash?.slice(0, 7) || '-------'}</span>
                                        <span className="text-gray-500 mx-1">|</span>
                                        <span className="text-gray-400">{line.author?.slice(0, 12) || 'Unknown'}</span>
                                    </div>
                                    <div className="text-gray-500 text-right w-10">{idx + 1}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Editor */}
                <div className="flex-1 overflow-auto min-h-0">
                    <CodeMirrorEditor
                        value={fileContent || ''}
                        onChange={onContentChange}
                        onSave={onSave}
                        filePath={filePath}
                        onSelect={handleTextSelection}
                        onContextMenu={onEditorContextMenu}
                        onSendToTerminal={onSendToTerminal}
                    />
                </div>
            </div>

            {editorContextMenuPos && activeContentPaneId === nodeId && (
                <>
                    <div
                        className="fixed inset-0 z-40"
                        onClick={() => setEditorContextMenuPos(null)}
                    />
                    <div
                        className="fixed theme-bg-secondary theme-border border rounded shadow-lg py-1 z-50"
                        style={{
                            top: `${editorContextMenuPos.y}px`,
                            left: `${editorContextMenuPos.x}px`
                        }}
                    >
                        <button
                            onClick={() => { if (contextMenuSelection) navigator.clipboard.writeText(contextMenuSelection); setEditorContextMenuPos(null); }}
                            disabled={!contextMenuSelection}
                            className="flex items-center gap-2 px-4 py-2 theme-hover w-full text-left theme-text-primary text-sm disabled:opacity-50">
                            Copy
                        </button>
                        <button onClick={handleEditorPaste}
                            className="flex items-center gap-2 px-4 py-2 theme-hover w-full text-left theme-text-primary text-sm">
                            Paste
                        </button>
                        {contextMenuSelection && (
                            <>
                                <div className="border-t theme-border my-1"></div>
                                <button onClick={() => { handleAIEdit('ask', contextMenuSelection); setEditorContextMenuPos(null); }}
                                    className="flex items-center gap-2 px-4 py-2 theme-hover w-full text-left theme-text-primary text-sm">
                                    <MessageSquare size={16} />Explain
                                </button>
                                <button onClick={() => { handleAIEdit('document', contextMenuSelection); setEditorContextMenuPos(null); }}
                                    className="flex items-center gap-2 px-4 py-2 theme-hover w-full text-left theme-text-primary text-sm">
                                    <FileText size={16} />Add Comments
                                </button>
                                <button onClick={() => { handleAIEdit('edit', contextMenuSelection); setEditorContextMenuPos(null); }}
                                    className="flex items-center gap-2 px-4 py-2 theme-hover w-full text-left theme-text-primary text-sm">
                                    <Edit size={16} />Refactor
                                </button>
                            </>
                        )}
                        <div className="border-t theme-border my-1"></div>
                        <button
                            onClick={() => {
                                setEditorContextMenuPos(null);
                                handleLoadBlame();
                            }}
                            className="flex items-center gap-2 px-4 py-2 theme-hover w-full text-left text-purple-400 text-sm">
                            <GitBranch size={16} />Git Blame
                        </button>
                        {onSendToTerminal && contextMenuSelection && (
                            <>
                                <div className="border-t theme-border my-1"></div>
                                <button
                                    onClick={() => {
                                        setEditorContextMenuPos(null);
                                        onSendToTerminal(contextMenuSelection);
                                    }}
                                    className="flex items-center gap-2 px-4 py-2 theme-hover w-full text-left text-green-400 text-sm">
                                    <Play size={16} />Send to Terminal
                                </button>
                            </>
                        )}
                        <div className="border-t theme-border my-1"></div>
                        <button
                            onClick={() => {
                                setEditorContextMenuPos(null);
                                handleStartRename();
                            }}
                            className="flex items-center gap-2 px-4 py-2 theme-hover w-full text-left theme-text-primary text-sm">
                            <Edit size={16} />Rename File
                        </button>
                        <div className="border-t theme-border my-1"></div>
                        <button
                            onClick={() => {
                                setEditorContextMenuPos(null);
                                setPromptModal({
                                    isOpen: true,
                                    title: 'Agentic Code Edit',
                                    message: 'What would you like AI to do with all open files?',
                                    defaultValue: 'Add error handling and improve code quality',
                                    onConfirm: (instruction) => startAgenticEdit(instruction)
                                });
                            }}
                            className="flex items-center gap-2 px-4 py-2 theme-hover w-full text-left text-blue-400 text-sm">
                            <BrainCircuit size={16} />Agentic Edit
                        </button>
                    </div>
                </>
            )}
        </div>
    );
};

export default CodeEditorPane;




    const renderFileContextMenu = () => (
        fileContextMenuPos && (
            <>
                {/* Backdrop to catch outside clicks */}
                <div
                    className="fixed inset-0 z-40"
                    onClick={() => setFileContextMenuPos(null)}
                />
                <div
                    className="fixed theme-bg-secondary theme-border border rounded shadow-lg py-1 z-50"
                    style={{ top: fileContextMenuPos.y, left: fileContextMenuPos.x }}
                    onMouseLeave={() => setFileContextMenuPos(null)}
                >
                    <button
                        onClick={() => handleApplyPromptToFiles('summarize')}
                        className="flex items-center gap-2 px-4 py-2 theme-hover w-full text-left theme-text-primary"
                    >
                        <MessageSquare size={16} />
                        <span>Summarize Files ({selectedFiles.size})</span>
                    </button>
                    <button
                        onClick={() => handleApplyPromptToFilesInInput('summarize')}
                        className="flex items-center gap-2 px-4 py-2 theme-hover w-full text-left theme-text-primary"
                    >
                        <MessageSquare size={16} />
                        <span>Summarize in Input Field ({selectedFiles.size})</span>
                    </button>
                    <div className="border-t theme-border my-1"></div>
                    <button
                        onClick={() => handleApplyPromptToFiles('analyze')}
                        className="flex items-center gap-2 px-4 py-2 theme-hover w-full text-left theme-text-primary"
                    >
                        <Edit size={16} />
                        <span>Analyze Files ({selectedFiles.size})</span>
                    </button>
                    <button
                        onClick={() => handleApplyPromptToFilesInInput('analyze')}
                        className="flex items-center gap-2 px-4 py-2 theme-hover w-full text-left theme-text-primary"
                    >
                        <Edit size={16} />
                        <span>Analyze in Input Field ({selectedFiles.size})</span>
                    </button>
                    <div className="border-t theme-border my-1"></div>
                    <button
                        onClick={() => handleApplyPromptToFiles('refactor')}
                        className="flex items-center gap-2 px-4 py-2 theme-hover w-full text-left theme-text-primary"
                    >
                        <Code2 size={16} />
                        <span>Refactor Code ({selectedFiles.size})</span>
                    </button>
                    <button
                        onClick={() => handleApplyPromptToFiles('document')}
                        className="flex items-center gap-2 px-4 py-2 theme-hover w-full text-left theme-text-primary"
                    >
                        <FileText size={16} />
                        <span>Document Code ({selectedFiles.size})</span>
                    </button>
                </div>
            </>
        )
    );