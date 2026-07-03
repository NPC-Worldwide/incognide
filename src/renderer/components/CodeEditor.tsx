import { getFileName } from './utils';
import { useAiEnabled } from './AiFeatureContext';
import { readFileContent, writeFileContent } from '../api/fileSystem';
import React, { useMemo, useCallback, useRef, useEffect, useState, memo } from 'react';
import { createPortal } from 'react-dom';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { json } from '@codemirror/lang-json';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { markdown } from '@codemirror/lang-markdown';
import { EditorView, ViewPlugin, lineNumbers, highlightActiveLineGutter, highlightActiveLine, drawSelection, dropCursor, rectangularSelection, crosshairCursor, highlightSpecialChars } from '@codemirror/view';
import { search, searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { keymap } from '@codemirror/view';
import { defaultKeymap, emacsStyleKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { vim } from '@replit/codemirror-vim';
import { HighlightStyle, syntaxHighlighting, indentOnInput, bracketMatching, foldGutter, foldKeymap, indentUnit } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { tags as t } from '@lezer/highlight';
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { lintKeymap, linter, lintGutter, type Diagnostic } from '@codemirror/lint';
import { Edit, FileText, MessageSquare, GitBranch, X, Play, HelpCircle, RefreshCw, ChevronDown, Bot } from 'lucide-react';

const appHighlightStyleDark = HighlightStyle.define([
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

const appHighlightStyleLight = HighlightStyle.define([
    { tag: t.keyword, color: '#a626a4' },
    { tag: [t.name, t.deleted, t.character, t.propertyName, t.macroName], color: '#e45649' },
    { tag: [t.function(t.variableName), t.labelName], color: '#4078f2' },
    { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: '#986801' },
    { tag: [t.definition(t.name), t.function(t.definition(t.name))], color: '#c18401' },
    { tag: [t.typeName, t.className, t.number, t.changed, t.annotation, t.modifier, t.self, t.namespace], color: '#986801' },
    { tag: [t.operator, t.operatorKeyword], color: '#0184bc' },
    { tag: [t.meta, t.comment], color: '#a0a1a7', fontStyle: 'italic' },
    { tag: [t.string, t.inserted], color: '#50a14f' },
    { tag: t.invalid, color: '#ff0000' },
]);

const editorThemeDark = EditorView.theme({
    '&': {
        height: '100%',
        fontSize: '14px',
        backgroundColor: '#1e1e2e',
    },
    '.cm-content': {
        fontFamily: '"Fira Code", "JetBrains Mono", "Cascadia Code", Menlo, Monaco, monospace',
        caretColor: '#89b4fa',
    },
    '.cm-cursor': {
        borderLeftColor: '#89b4fa',
        borderLeftWidth: '2px',
    },
    '& .cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
        backgroundColor: '#284f78',
    },
    '& .cm-content ::selection': {
        backgroundColor: 'transparent',
    },
    '& .cm-activeLine, &.cm-focused .cm-activeLine': {
        backgroundColor: '#1e2030',
    },
    '& .cm-activeLineGutter': {
        backgroundColor: '#1e2030',
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

    '.cm-lint-marker-error': {
        content: '"!"',
        color: '#f38ba8',
    },
    '.cm-lint-marker-warning': {
        content: '"⚠"',
        color: '#f9e2af',
    },
    '.cm-lintRange-error': {
        backgroundImage: 'none',
        textDecoration: 'underline wavy #f38ba8',
        textUnderlineOffset: '3px',
    },
    '.cm-lintRange-warning': {
        backgroundImage: 'none',
        textDecoration: 'underline wavy #f9e2af',
        textUnderlineOffset: '3px',
    },
    '.cm-tooltip-lint': {
        backgroundColor: '#1e1e2e',
        border: '1px solid #313244',
        borderRadius: '4px',
        color: '#cdd6f4',
        padding: '4px 8px',
        fontSize: '12px',
    },
    '& .cm-selectionMatch': {
        backgroundColor: '#3d3522',
        outline: '1px solid #5c4f2a',
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

    '.cm-vim-panel': {
        backgroundColor: '#0f0f14',
        color: '#cdd6f4',
        padding: '4px 12px',
        fontFamily: '"Fira Code", monospace',
        fontSize: '13px',
        borderTop: '1px solid #313244',
        width: '100%',
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        minHeight: '26px',
    },
    '.cm-vim-panel input': {
        backgroundColor: 'transparent',
        color: '#cdd6f4',
        border: 'none',
        outline: 'none',
        fontFamily: '"Fira Code", monospace',
        fontSize: '13px',
        flex: '1',
        marginLeft: '8px',
    },

    '&.cm-focused .cm-fat-cursor': {
        background: '#89b4fa !important',
        color: '#1e1e2e !important',
    },
    '&:not(.cm-focused) .cm-fat-cursor': {
        background: 'none !important',
        outline: '1px solid #89b4fa !important',
        color: 'transparent !important',
    },
}, { dark: true });

const editorThemeLight = EditorView.theme({
    '&': {
        height: '100%',
        fontSize: '14px',
        backgroundColor: '#fafafa',
    },
    '.cm-content': {
        fontFamily: '"Fira Code", "JetBrains Mono", "Cascadia Code", Menlo, Monaco, monospace',
        caretColor: '#2563eb',
    },
    '.cm-cursor': {
        borderLeftColor: '#2563eb',
        borderLeftWidth: '2px',
    },
    '& .cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
        backgroundColor: 'rgba(37, 99, 235, 0.15)',
    },
    '& .cm-content ::selection': {
        backgroundColor: 'transparent',
    },
    '& .cm-activeLine, &.cm-focused .cm-activeLine': {
        backgroundColor: '#f0f0f0',
    },
    '& .cm-activeLineGutter': {
        backgroundColor: '#f0f0f0',
    },
    '.cm-gutters': {
        backgroundColor: '#fafafa',
        color: '#9ca3af',
        border: 'none',
        borderRight: '1px solid #e5e7eb',
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
        color: '#2563eb',
    },
    '&.cm-focused .cm-matchingBracket': {
        backgroundColor: 'rgba(37, 99, 235, 0.15)',
        outline: '1px solid #2563eb',
    },
    '.cm-searchMatch': {
        backgroundColor: 'rgba(234, 179, 8, 0.3)',
        outline: '1px solid #f59e0b',
    },
    '.cm-searchMatch.cm-searchMatch-selected': {
        backgroundColor: 'rgba(34, 197, 94, 0.3)',
    },
    '.cm-lint-marker-error': {
        content: '"!"',
        color: '#dc2626',
    },
    '.cm-lint-marker-warning': {
        content: '"⚠"',
        color: '#f59e0b',
    },
    '.cm-lintRange-error': {
        backgroundImage: 'none',
        textDecoration: 'underline wavy #dc2626',
        textUnderlineOffset: '3px',
    },
    '.cm-lintRange-warning': {
        backgroundImage: 'none',
        textDecoration: 'underline wavy #f59e0b',
        textUnderlineOffset: '3px',
    },
    '.cm-tooltip-lint': {
        backgroundColor: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: '4px',
        color: '#1f2937',
        padding: '4px 8px',
        fontSize: '12px',
    },
    '& .cm-selectionMatch': {
        backgroundColor: '#fef3c7',
        outline: '1px solid #fbbf24',
    },
    '.cm-panels': {
        backgroundColor: '#fafafa',
        color: '#374151',
    },
    '.cm-panels.cm-panels-top': {
        borderBottom: '1px solid #e5e7eb',
    },
    '.cm-panel.cm-search': {
        padding: '8px 12px',
        backgroundColor: '#f3f4f6',
    },
    '.cm-panel.cm-search input, .cm-panel.cm-search button': {
        margin: '0 4px',
        padding: '4px 8px',
        borderRadius: '4px',
        backgroundColor: '#ffffff',
        border: '1px solid #d1d5db',
        color: '#374151',
    },
    '.cm-panel.cm-search button:hover': {
        backgroundColor: '#f3f4f6',
    },
    '.cm-panel.cm-search label': {
        margin: '0 8px',
        color: '#6b7280',
    },
    '.cm-tooltip': {
        backgroundColor: '#ffffff',
        border: '1px solid #e5e7eb',
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
            backgroundColor: '#eff6ff',
            color: '#1e40af',
        },
    },
    '.cm-completionIcon': {
        width: '1em',
        marginRight: '0.5em',
    },
    '.cm-vim-panel': {
        backgroundColor: '#f9fafb',
        color: '#374151',
        padding: '4px 12px',
        fontFamily: '"Fira Code", monospace',
        fontSize: '13px',
        borderTop: '1px solid #e5e7eb',
        width: '100%',
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        minHeight: '26px',
    },
    '.cm-vim-panel input': {
        backgroundColor: 'transparent',
        color: '#374151',
        border: 'none',
        outline: 'none',
        fontFamily: '"Fira Code", monospace',
        fontSize: '13px',
        flex: '1',
        marginLeft: '8px',
    },
    '&.cm-focused .cm-fat-cursor': {
        background: '#2563eb !important',
        color: '#ffffff !important',
    },
    '&:not(.cm-focused) .cm-fat-cursor': {
        background: 'none !important',
        outline: '1px solid #2563eb !important',
        color: 'transparent !important',
    },
});

const CodeMirrorEditor = memo(({ value, onChange, filePath, onSave, onContextMenu, onSelect, onSendToTerminal, savedEditorState, onEditorStateChange, keybindMode }) => {
    const editorRef = useRef(null);

    const onSelectRef = useRef(onSelect);
    const onContextMenuRef = useRef(onContextMenu);
    const onSendToTerminalRef = useRef(onSendToTerminal);
    const onSaveRef = useRef(onSave);
    const onEditorStateChangeRef = useRef(onEditorStateChange);
    onSelectRef.current = onSelect;
    onContextMenuRef.current = onContextMenu;
    onSendToTerminalRef.current = onSendToTerminal;
    onSaveRef.current = onSave;
    onEditorStateChangeRef.current = onEditorStateChange;

    const [isDarkMode, setIsDarkMode] = useState(() => !document.body.classList.contains('light-mode'));

    useEffect(() => {
        const observer = new MutationObserver(() => {
            setIsDarkMode(!document.body.classList.contains('light-mode'));
        });
        observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
        return () => observer.disconnect();
    }, []);

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
        { key: 'Mod-s', run: () => { if (onSaveRef.current) onSaveRef.current(); return true; } },
        { key: 'Ctrl-Enter', run: (view) => {
            if (onSendToTerminalRef.current) {
                const selection = view.state.sliceDoc(
                    view.state.selection.main.from,
                    view.state.selection.main.to
                );
                if (selection) {
                    onSendToTerminalRef.current(selection);
                    return true;
                }
            }
            return false;
        }},
        { key: 'Mod-Enter', run: (view) => {
            if (onSendToTerminalRef.current) {
                const selection = view.state.sliceDoc(
                    view.state.selection.main.from,
                    view.state.selection.main.to
                );
                if (selection) {
                    onSendToTerminalRef.current(selection);
                    return true;
                }
            }
            return false;
        }},
        indentWithTab,
    ]), []);

    const tabSize = useMemo(() => {
        const saved = localStorage.getItem('incognide_tabSize');
        return saved ? parseInt(saved) : 4;
    }, []);

    const lintExtension = useMemo(() => {
        const ext = filePath?.split('.').pop()?.toLowerCase();
        let language: string | null = null;
        if (['js', 'mjs', 'jsx'].includes(ext || '')) language = 'javascript';
        else if (['ts', 'tsx'].includes(ext || '')) language = 'typescript';
        else if (['py', 'pyw'].includes(ext || '')) language = 'python';
        else if (ext === 'tex') language = 'tex';

        if (!language) return [];

        const lintEnabled = localStorage.getItem('incognide_lintEnabled') !== 'false';
        if (!lintEnabled) return [];

        return [
            linter(async (view) => {
                const content = view.state.doc.toString();
                if (!content.trim()) return [];
                try {
                    const results = await (window as any).api?.lintFile?.({ filePath, content, language });
                    if (!Array.isArray(results)) return [];
                    return results.map((d: any) => {
                        const fromLine = view.state.doc.line(Math.min(d.from.line + 1, view.state.doc.lines));
                        const toLine = view.state.doc.line(Math.min(d.to.line + 1, view.state.doc.lines));
                        const from = Math.min(fromLine.from + d.from.col, fromLine.to);
                        const to = Math.min(toLine.from + d.to.col, toLine.to);
                        return {
                            from: Math.max(0, from),
                            to: Math.max(from, to),
                            message: d.message,
                            severity: d.severity === 'error' ? 'error' : 'warning',
                        } as Diagnostic;
                    });
                } catch { return []; }
            }, { delay: 2000 }),
            lintGutter(),
        ];
    }, [filePath]);

    const keymapExtensions = useMemo(() => {
        const base = [
            ...closeBracketsKeymap,
            ...historyKeymap,
            ...searchKeymap,
            ...foldKeymap,
            ...completionKeymap,
            ...lintKeymap,
        ];

        switch (keybindMode) {
            case 'emacs':
                return [keymap.of([...base, ...emacsStyleKeymap])];
            case 'nano': {
                const nanoKeymap = [
                    { key: 'Ctrl-o', run: () => { if (onSave) onSave(); return true; } },
                    { key: 'Ctrl-k', run: (view) => {

                        const line = view.state.doc.lineAt(view.state.selection.main.head);
                        const text = view.state.sliceDoc(line.from, line.to + 1);
                        navigator.clipboard.writeText(text);
                        view.dispatch({ changes: { from: line.from, to: Math.min(line.to + 1, view.state.doc.length) } });
                        return true;
                    }},
                    { key: 'Ctrl-u', run: (view) => {

                        navigator.clipboard.readText().then(text => {
                            view.dispatch({ changes: { from: view.state.selection.main.head, insert: text } });
                        });
                        return true;
                    }},
                    { key: 'Ctrl-w', run: (view) => {

                        const searchCmd = searchKeymap.find(k => k.key === 'Mod-f');
                        if (searchCmd?.run) return searchCmd.run(view);
                        return false;
                    }},
                    { key: 'Ctrl-a', run: (view) => {

                        const line = view.state.doc.lineAt(view.state.selection.main.head);
                        view.dispatch({ selection: { anchor: line.from } });
                        return true;
                    }},
                    { key: 'Ctrl-e', run: (view) => {

                        const line = view.state.doc.lineAt(view.state.selection.main.head);
                        view.dispatch({ selection: { anchor: line.to } });
                        return true;
                    }},
                ];
                return [keymap.of([...nanoKeymap, ...base, ...defaultKeymap])];
            }
            default:
                return [keymap.of([...base, ...defaultKeymap])];
        }
    }, [keybindMode, onSave]);

    const vimExtension = useMemo(() => {
        return keybindMode === 'vim' ? [vim()] : [];
    }, [keybindMode]);

    const initialScrollPosRef = useRef(savedEditorState?.scrollTopPos ?? 0);
    const scrollPreserverPlugin = useMemo(() => {
        const stateChangeRef = onEditorStateChangeRef;
        const posRef = initialScrollPosRef;
        return ViewPlugin.fromClass(class {
            savedScrollTop: number;
            lastHeight: number;
            pendingRestore: boolean;
            constructor(view: any) {
                this.savedScrollTop = posRef.current;
                this.lastHeight = 0;
                this.pendingRestore = posRef.current > 0;
            }
            update(update: any) {
                const scrollDOM = update.view.scrollDOM;
                const height = scrollDOM?.clientHeight ?? 0;
                const wasHidden = this.lastHeight === 0 && height > 0;
                this.lastHeight = height;
                if (height === 0) return;

                if (wasHidden && this.savedScrollTop > 0) this.pendingRestore = true;

                // Detect external document reload (full replacement)
                if (update.docChanged && !this.pendingRestore) {
                    let isFullReplace = false;
                    const oldLen = update.startState.doc.length;
                    update.changes.iterChanges((fromA: number, toA: number) => {
                        if (fromA === 0 && toA === oldLen) isFullReplace = true;
                    });
                    if (isFullReplace) this.pendingRestore = true;
                }

                if (this.pendingRestore) {
                    this.pendingRestore = false;
                    const st = this.savedScrollTop;

                    scrollDOM.scrollTop = st;
                    return;
                }

                const currentTop = scrollDOM.scrollTop;
                if (currentTop !== this.savedScrollTop) {
                    this.savedScrollTop = currentTop;
                    stateChangeRef.current?.({ scrollTopPos: currentTop });
                }
            }
        });
    }, []);

    const extensions = useMemo(() => [

        ...vimExtension,

        lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
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

        indentUnit.of(' '.repeat(tabSize)),
        EditorState.tabSize.of(tabSize),

        languageExtension,

        ...lintExtension,

        search({ top: true }),

        ...keymapExtensions,
        customKeymap,

        isDarkMode ? editorThemeDark : editorThemeLight,
        syntaxHighlighting(isDarkMode ? appHighlightStyleDark : appHighlightStyleLight),

        EditorView.lineWrapping,

        scrollPreserverPlugin,
    ], [languageExtension, lintExtension, customKeymap, tabSize, keymapExtensions, vimExtension, isDarkMode]);

    const handleUpdate = useCallback((viewUpdate) => {
        if (viewUpdate.selectionSet && onSelectRef.current) {
            const { from, to } = viewUpdate.state.selection.main;
            onSelectRef.current(from, to);
        }
    }, []);

    const handleContextMenu = useCallback((event: React.MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        const view = editorRef.current?.view;
        let selection = '';
        if (view) {
            const { from, to } = view.state.selection.main;
            if (from !== to) {
                selection = view.state.sliceDoc(from, to);
            }
        }
        onContextMenuRef.current?.(event, selection);
    }, []);

    useEffect(() => {
        const editorDOM = editorRef.current?.editor;
        if (!editorDOM) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (((e.ctrlKey || e.metaKey) || e.shiftKey) && e.key === 'Enter') {
                const view = editorRef.current?.view;
                if (view) {
                    const { from, to } = view.state.selection.main;
                    if (from !== to) {
                        const selection = view.state.sliceDoc(from, to);
                        if (selection && onSendToTerminalRef.current) {
                            e.preventDefault();
                            e.stopPropagation();
                            onSendToTerminalRef.current(selection);
                        }
                    }
                }
            }
        };

        editorDOM.addEventListener('keydown', handleKeyDown, true);
        return () => editorDOM.removeEventListener('keydown', handleKeyDown, true);
    }, []);

    useEffect(() => {
        return () => {
            if (onEditorStateChange && editorRef.current?.view) {
                try { onEditorStateChange({ scrollTopPos: editorRef.current.view.scrollDOM.scrollTop }); } catch (e) {}
            }
        };
    }, [onEditorStateChange]);

    return (
        <CodeMirror
            ref={editorRef}
            value={value}
            height="100%"
            style={{ height: '100%' }}
            extensions={extensions}
            onChange={onChange}
            onUpdate={handleUpdate}
            onContextMenu={handleContextMenu}
        />
    );
}, (prevProps, nextProps) => {

    return prevProps.value === nextProps.value
        && prevProps.filePath === nextProps.filePath
        && prevProps.keybindMode === nextProps.keybindMode;
});

const KbRow = ({ keys, desc }: { keys: string; desc: string }) => (
    <div className="flex justify-between gap-2">
        <kbd className="text-purple-300/80 font-mono shrink-0">{keys}</kbd>
        <span className="text-gray-500 text-right">{desc}</span>
    </div>
);

const CodeEditorPane = ({
    nodeId,
    contentDataRef,
    setRootLayoutNode,
    activeContentPaneId,
    setActiveContentPaneId,
    aiEditModal,
    renamingPaneId,
    setRenamingPaneId,
    editedFileName,
    setEditedFileName,
    handleTextSelection,
    handleEditorCopy,
    handleEditorPaste,
    handleAddToChat,
    handleAddToAgent,
    handleAIEdit,
    startAgenticEdit,
    setPromptModal,
    onGitBlame,
    currentPath,
    onRunScript,
    onSendToTerminal,
}) => {
    const aiEnabled = useAiEnabled();
    const paneData = contentDataRef.current[nodeId];
    const [showBlame, setShowBlame] = useState(false);
    const [blameData, setBlameData] = useState<any[] | null>(null);
    const [blameLoading, setBlameLoading] = useState(false);
    const [contextMenuSelection, setContextMenuSelection] = useState('');
    const [editorContextMenuPos, setEditorContextMenuPos] = useState<{ x: number; y: number } | null>(null);
    const [keybindMode, setKeybindMode] = useState(() => {
        return localStorage.getItem('incognide_editorKeybindMode') || 'default';
    });
    const [enabledModes, setEnabledModes] = useState<string[]>(() => {
        const saved = localStorage.getItem('incognide_editorEnabledModes');
        return saved ? JSON.parse(saved) : ['default', 'vim'];
    });
    const [showKeybindGuide, setShowKeybindGuide] = useState(false);
    const [diskChangeContent, setDiskChangeContent] = useState<string | null>(null);
    const [showModeDropdown, setShowModeDropdown] = useState(false);
    const [diskConflictModal, setDiskConflictModal] = useState<{ isOpen: boolean; diskMtime: number | null; diskContent: string | null }>({ isOpen: false, diskMtime: null, diskContent: null });
    const diskMtimeRef = useRef<number | null>(null);
    const diskContentRef = useRef<string | null>(null);
    const pendingDiskConflictRef = useRef(false);

    const updateDiskState = useCallback((content: string, mtime: number) => {
        diskContentRef.current = content;
        diskMtimeRef.current = mtime;
        pendingDiskConflictRef.current = false;
    }, []);

    const checkDiskState = useCallback(async (filePath: string) => {
        try {
            const stats = await (window as any).api.getFileStats(filePath);
            return { mtime: stats?.mtimeMs || 0, exists: true };
        } catch {
            return { mtime: 0, exists: false };
        }
    }, []);

    useEffect(() => {
        const handleCycleMode = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'Space') {
                e.preventDefault();
                e.stopPropagation();
                if (enabledModes.length < 2) return;
                const currentIndex = enabledModes.indexOf(keybindMode);
                const nextIndex = (currentIndex + 1) % enabledModes.length;
                const nextMode = enabledModes[nextIndex];
                setKeybindMode(nextMode);
                localStorage.setItem('incognide_editorKeybindMode', nextMode);
            }
        };
        window.addEventListener('keydown', handleCycleMode, true);
        return () => window.removeEventListener('keydown', handleCycleMode, true);
    }, [keybindMode, enabledModes]);

    useEffect(() => {
        const pd = contentDataRef.current[nodeId];
        if (pd?.contentId && !pd.isUntitled && pd.fileContent === undefined) {
            (async () => {
                try {
                    const [result, stats] = await Promise.all([
                        readFileContent(pd.contentId),
                        (window as any).api.getFileStats(pd.contentId).catch(() => null)
                    ]);
                    const content = typeof result === 'string' ? result : result?.content;
                    if (content != null) {
                        pd.fileContent = content;
                        pd.fileChanged = false;
                        updateDiskState(content, stats?.mtimeMs || 0);
                        setRootLayoutNode(p => ({ ...p }));
                    }
                } catch (e) {
                    console.error('[CodeEditor] Auto-load failed:', e);
                }
            })();
        }
    }, [nodeId, updateDiskState]);

    if (!paneData) return null;

    const { contentId: filePath, fileContent, fileChanged } = paneData;
    const fileName = getFileName(filePath) || 'Untitled';
    const isRenaming = renamingPaneId === nodeId;

    const handleLoadBlame = useCallback(async () => {
        if (!currentPath || !filePath) return;
        setBlameLoading(true);
        try {

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
                    await writeFileContent(filepath, currentPaneData.fileContent || '');

                    currentPaneData.contentId = filepath;
                    currentPaneData.isUntitled = false;
                    currentPaneData.fileChanged = false;
                    setRootLayoutNode(p => ({ ...p }));
                }
            });
            return;
        }

        if (!currentPaneData.contentId || !currentPaneData.fileChanged) return;

        const { mtime } = await checkDiskState(currentPaneData.contentId);
        const knownMtime = diskMtimeRef.current;
        if (knownMtime != null && mtime !== 0 && mtime !== knownMtime) {
            try {
                const result = await readFileContent(currentPaneData.contentId);
                const diskContent = typeof result === 'string' ? result : result?.content;
                setDiskConflictModal({ isOpen: true, diskMtime: mtime, diskContent: diskContent ?? null });
            } catch {
                setDiskConflictModal({ isOpen: true, diskMtime: mtime, diskContent: null });
            }
            return;
        }

        currentPaneData._selfWriting = true;
        currentPaneData._lastWrittenContent = currentPaneData.fileContent;
        await writeFileContent(currentPaneData.contentId, currentPaneData.fileContent);
        currentPaneData.fileChanged = false;
        const newStats = await checkDiskState(currentPaneData.contentId);
        updateDiskState(currentPaneData.fileContent || '', newStats.mtime);
        setRootLayoutNode(p => ({ ...p }));
        setTimeout(() => { currentPaneData._selfWriting = false; }, 4000);
    }, [nodeId, contentDataRef, setRootLayoutNode, setPromptModal, currentPath, checkDiskState, updateDiskState]);

    const resolveDiskConflict = useCallback(async (overwrite: boolean) => {
        const currentPaneData = contentDataRef.current[nodeId];
        if (!currentPaneData?.contentId || !diskConflictModal.isOpen) return;
        if (overwrite) {
            currentPaneData._selfWriting = true;
            currentPaneData._lastWrittenContent = currentPaneData.fileContent;
            await writeFileContent(currentPaneData.contentId, currentPaneData.fileContent || '');
            currentPaneData.fileChanged = false;
            const newStats = await checkDiskState(currentPaneData.contentId);
            updateDiskState(currentPaneData.fileContent || '', newStats.mtime);
            setDiskChangeContent(null);
            setRootLayoutNode(p => ({ ...p }));
            setTimeout(() => { currentPaneData._selfWriting = false; }, 4000);
        } else {
            if (diskConflictModal.diskContent != null) {
                updateDiskState(diskConflictModal.diskContent, diskConflictModal.diskMtime || 0);
            } else {
                pendingDiskConflictRef.current = true;
            }
        }
        setDiskConflictModal({ isOpen: false, diskMtime: null, diskContent: null });
    }, [nodeId, contentDataRef, setRootLayoutNode, diskConflictModal, checkDiskState, updateDiskState]);

    useEffect(() => {
        const paneData = contentDataRef.current[nodeId];
        if (paneData) paneData.onSave = onSave;
        return () => { if (paneData) delete paneData.onSave; };
    }, [nodeId, onSave, contentDataRef]);

    useEffect(() => {
        const currentPaneData = contentDataRef.current[nodeId];
        if (!currentPaneData?.fileChanged || !currentPaneData?.contentId || currentPaneData?.isUntitled) return;
        if (pendingDiskConflictRef.current) return;
        const timer = setTimeout(async () => {
            try {
                const { mtime } = await checkDiskState(currentPaneData.contentId);
                if (diskMtimeRef.current != null && mtime !== 0 && mtime !== diskMtimeRef.current) {
                    pendingDiskConflictRef.current = true;
                    const result = await readFileContent(currentPaneData.contentId);
                    setDiskChangeContent(typeof result === 'string' ? result : result?.content ?? null);
                    setRootLayoutNode(p => ({ ...p }));
                    return;
                }
                currentPaneData._selfWriting = true;
                currentPaneData._lastWrittenContent = currentPaneData.fileContent;
                await writeFileContent(currentPaneData.contentId, currentPaneData.fileContent);
                currentPaneData.fileChanged = false;
                const newStats = await checkDiskState(currentPaneData.contentId);
                updateDiskState(currentPaneData.fileContent || '', newStats.mtime);
                setRootLayoutNode(p => ({ ...p }));
                setTimeout(() => { currentPaneData._selfWriting = false; }, 4000);
            } catch (e) {
                currentPaneData._selfWriting = false;
            }
        }, 30000);
        return () => clearTimeout(timer);
    }, [fileContent, fileChanged, nodeId, contentDataRef, setRootLayoutNode, checkDiskState, updateDiskState]);

    const reloadFromDisk = useCallback(async () => {
        const pd = contentDataRef.current[nodeId];
        if (!pd?.contentId || pd.isUntitled) return;
        try {
            const [result, stats] = await Promise.all([
                (window as any).api.readFileContent(pd.contentId),
                (window as any).api.getFileStats(pd.contentId).catch(() => null)
            ]);
            const diskContent = typeof result === 'string' ? result : result?.content;
            if (diskContent != null) {
                pd.fileContent = diskContent;
                pd.fileChanged = false;
                updateDiskState(diskContent, stats?.mtimeMs || 0);
                pendingDiskConflictRef.current = false;
                setDiskChangeContent(null);
                setRootLayoutNode(p => ({ ...p }));
            }
        } catch (e) {
            console.error('[CodeEditor] Reload failed:', e);
        }
    }, [nodeId, contentDataRef, setRootLayoutNode, updateDiskState]);

    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setEditorContextMenuPos(null);
        };
        window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
    }, []);

    useEffect(() => {
        const currentPaneData = contentDataRef.current[nodeId];
        const fp = currentPaneData?.contentId;
        if (!fp || currentPaneData?.isUntitled) return;
        (window as any).api.watchFile(fp);
        const removeListener = (window as any).api.onFileChanged(async (changedPath: string) => {
            const pd = contentDataRef.current[nodeId];
            if (!pd || pd.contentId !== changedPath) return;
            if (pd._selfWriting) return;
            try {
                const stats = await (window as any).api.getFileStats(changedPath).catch(() => null);
                const newMtime = stats?.mtimeMs || 0;
                if (newMtime && diskMtimeRef.current != null && newMtime === diskMtimeRef.current) return;

                const result = await readFileContent(changedPath);
                const diskContent = typeof result === 'string' ? result : result?.content;
                if (diskContent == null) return;
                if (diskContent === diskContentRef.current) return;
                if (diskContent === pd.fileContent) {
                    updateDiskState(diskContent, newMtime);
                    setDiskChangeContent(null);
                    return;
                }
                pendingDiskConflictRef.current = true;
                setDiskChangeContent(diskContent);
                updateDiskState(diskContent, newMtime);
            } catch (e) {
                console.error('[FILE-WATCH] Error reloading:', e);
            }
        });
        return () => {
            removeListener();
            (window as any).api.unwatchFile(fp);
        };
    }, [nodeId, contentDataRef, setRootLayoutNode, updateDiskState]);

    const onEditorContextMenu = useCallback((e, selection) => {
        e.preventDefault();
        e.stopPropagation();
        setActiveContentPaneId?.(nodeId);
        setContextMenuSelection(selection || '');
        setEditorContextMenuPos({ x: e.clientX, y: e.clientY });
    }, [nodeId, setActiveContentPaneId, setEditorContextMenuPos]);

    const handleStartRename = useCallback(() => {
        setRenamingPaneId(nodeId);
        setEditedFileName(fileName);
    }, [nodeId, fileName, setRenamingPaneId, setEditedFileName]);

    return (
        <div
            className="flex-1 flex flex-col min-h-0 theme-bg-secondary relative"
            onMouseDown={() => setActiveContentPaneId?.(nodeId)}
        >
            {diskChangeContent !== null && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-yellow-900/40 border-b border-yellow-700/50 text-yellow-200 text-xs shrink-0">
                    <RefreshCw size={12} className="text-yellow-400 shrink-0" />
                    <span className="flex-1">File changed on disk. You have unsaved changes.</span>
                    <button
                        onClick={reloadFromDisk}
                        className="px-2 py-0.5 rounded bg-yellow-600/50 hover:bg-yellow-600/80 text-yellow-100 font-medium transition-colors"
                    >
                        Reload (discard local)
                    </button>
                    <button
                        onClick={() => {
                            pendingDiskConflictRef.current = true;
                            setDiskChangeContent(null);
                        }}
                        className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-gray-300 transition-colors"
                    >
                        Keep local
                    </button>
                </div>
            )}
            <div className="flex-1 flex min-h-0">
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

                <div className="flex-1 overflow-hidden min-h-0 relative">
                    <CodeMirrorEditor
                        value={fileContent || ''}
                        onChange={onContentChange}
                        onSave={onSave}
                        filePath={filePath}
                        onSelect={handleTextSelection}
                        onContextMenu={onEditorContextMenu}
                        onSendToTerminal={onSendToTerminal}
                        keybindMode={keybindMode}
                        savedEditorState={paneData?._scrollTopPos != null ? { scrollTopPos: paneData._scrollTopPos } : undefined}
                        onEditorStateChange={(state) => { if (paneData) { paneData._scrollTopPos = state.scrollTopPos; } }}
                    />
                    <div className="absolute bottom-1 right-2 z-10 flex items-center gap-2">
                        <span className="text-[10px] text-gray-500 font-mono select-none">
                            {(fileContent || '').split('\n').length} lines
                        </span>
                        <div className="relative">
                            <button
                                onClick={() => setShowModeDropdown(prev => !prev)}
                                className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border bg-black/40 text-gray-300 border-white/10 hover:bg-black/60 hover:text-gray-100 cursor-pointer transition-colors"
                                title="Click to switch keybinding mode. Ctrl+Shift+Space to cycle."
                            >
                                {keybindMode === 'default' ? 'Default' : keybindMode.charAt(0).toUpperCase() + keybindMode.slice(1)}
                                <ChevronDown size={10} />
                            </button>
                            {showModeDropdown && (
                                <>
                                    <div className="fixed inset-0 z-[9997]" onClick={() => setShowModeDropdown(false)} />
                                    <div className="absolute bottom-full right-0 mb-1 z-[9998] theme-bg-secondary theme-border border rounded shadow-lg py-1 min-w-[120px]">
                                        {(['default', 'vim', 'emacs', 'nano'] as const).map(mode => {
                                            const isEnabled = enabledModes.includes(mode);
                                            const isActive = keybindMode === mode;
                                            return (
                                                <button
                                                    key={mode}
                                                    onClick={() => {
                                                        setKeybindMode(mode);
                                                        localStorage.setItem('incognide_editorKeybindMode', mode);
                                                        setShowModeDropdown(false);
                                                        if (!isEnabled) {
                                                            const next = [...enabledModes, mode];
                                                            setEnabledModes(next);
                                                            localStorage.setItem('incognide_editorEnabledModes', JSON.stringify(next));
                                                        }
                                                    }}
                                                    className={`flex items-center justify-between gap-2 px-3 py-1.5 theme-hover w-full text-left text-xs ${
                                                        isActive ? 'text-purple-300' : 'theme-text-primary'
                                                    }`}
                                                >
                                                    <span>{mode === 'default' ? 'Default' : mode.charAt(0).toUpperCase() + mode.slice(1)}</span>
                                                    {isActive && <span className="text-purple-400 text-[10px]">●</span>}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </>
                            )}
                        </div>
                        <button
                            onClick={reloadFromDisk}
                            className="p-0.5 rounded hover:bg-black/60 text-gray-500 hover:text-gray-300"
                            title="Reload file from disk"
                        >
                            <RefreshCw size={12} />
                        </button>
                        <button
                            onClick={() => setShowKeybindGuide(prev => !prev)}
                            className={`p-0.5 rounded hover:bg-black/60 ${showKeybindGuide ? 'text-purple-400' : 'text-gray-500 hover:text-gray-300'}`}
                            title="Keybinding reference"
                        >
                            <HelpCircle size={12} />
                        </button>
                    </div>
                    {showKeybindGuide && (
                        <div className="absolute bottom-7 left-0 right-0 z-20 border-t border-white/10 bg-[#181825]/95 backdrop-blur text-[11px] text-gray-300">
                            <div className="flex items-center justify-between px-3 py-1 border-b border-white/10 bg-black/20">
                                <span className="font-medium text-gray-200 text-xs">
                                    {keybindMode === 'default' ? 'Default' : keybindMode === 'vim' ? 'Vim' : keybindMode === 'emacs' ? 'Emacs' : 'Nano'} Keybindings
                                    <span className="ml-2 text-gray-500 font-normal">Ctrl+Shift+Space to cycle modes</span>
                                </span>
                                <button onClick={() => setShowKeybindGuide(false)} className="p-0.5 rounded hover:bg-white/10 text-gray-500 hover:text-gray-300">
                                    <X size={10} />
                                </button>
                            </div>
                            <div className="px-3 py-1.5 overflow-x-auto">
                                {keybindMode === 'default' && (
                                    <div className="flex gap-6 flex-wrap">
                                        <div className="space-y-0.5">
                                            <div className="text-gray-500 font-medium mb-0.5">File</div>
                                            <KbRow keys="Ctrl+S" desc="Save" />
                                            <KbRow keys="Ctrl+Z" desc="Undo" />
                                            <KbRow keys="Ctrl+Shift+Z" desc="Redo" />
                                        </div>
                                        <div className="space-y-0.5">
                                            <div className="text-gray-500 font-medium mb-0.5">Find</div>
                                            <KbRow keys="Ctrl+F" desc="Find" />
                                            <KbRow keys="Ctrl+H" desc="Replace" />
                                            <KbRow keys="Ctrl+D" desc="Select next match" />
                                        </div>
                                        <div className="space-y-0.5">
                                            <div className="text-gray-500 font-medium mb-0.5">Edit</div>
                                            <KbRow keys="Ctrl+/" desc="Toggle comment" />
                                            <KbRow keys="Tab / Shift+Tab" desc="Indent / dedent" />
                                            <KbRow keys="Ctrl+Enter" desc="Run in terminal" />
                                        </div>
                                    </div>
                                )}
                                {keybindMode === 'vim' && (
                                    <div className="flex gap-6 flex-wrap">
                                        <div className="space-y-0.5">
                                            <div className="text-gray-500 font-medium mb-0.5">Mode Switch</div>
                                            <KbRow keys="i / a / o" desc="Insert / append / open line" />
                                            <KbRow keys="I / A / O" desc="Insert start / append end / open above" />
                                            <KbRow keys="Esc" desc="Back to normal" />
                                            <KbRow keys="v / V / Ctrl+V" desc="Visual / line / block" />
                                        </div>
                                        <div className="space-y-0.5">
                                            <div className="text-gray-500 font-medium mb-0.5">Movement</div>
                                            <KbRow keys="h j k l" desc="Left / down / up / right" />
                                            <KbRow keys="w / b / e" desc="Word fwd / back / end" />
                                            <KbRow keys="0 / $ / ^" desc="Line start / end / first char" />
                                            <KbRow keys="gg / G" desc="File start / end" />
                                            <KbRow keys="{ / }" desc="Paragraph up / down" />
                                            <KbRow keys="Ctrl+D / Ctrl+U" desc="Half page down / up" />
                                            <KbRow keys="f{c} / t{c}" desc="Jump to / before char" />
                                        </div>
                                        <div className="space-y-0.5">
                                            <div className="text-gray-500 font-medium mb-0.5">Edit</div>
                                            <KbRow keys="dd / yy / p" desc="Delete / yank / paste line" />
                                            <KbRow keys="dw / cw" desc="Delete / change word" />
                                            <KbRow keys="x / r{c}" desc="Delete char / replace char" />
                                            <KbRow keys="u / Ctrl+R" desc="Undo / redo" />
                                            <KbRow keys="." desc="Repeat last edit" />
                                            <KbRow keys=">> / <<" desc="Indent / dedent" />
                                        </div>
                                        <div className="space-y-0.5">
                                            <div className="text-gray-500 font-medium mb-0.5">Text Objects</div>
                                            <KbRow keys={'ci( / ci"'} desc="Change inside parens/quotes" />
                                            <KbRow keys={'di{ / da['} desc="Delete inside/around brackets" />
                                            <KbRow keys="yiw / yaw" desc="Yank inner/around word" />
                                        </div>
                                        <div className="space-y-0.5">
                                            <div className="text-gray-500 font-medium mb-0.5">Search & Command</div>
                                            <KbRow keys="/ / ? / n / N" desc="Search fwd/back, next/prev" />
                                            <KbRow keys="* / #" desc="Search word under cursor" />
                                            <KbRow keys=":w" desc="Save" />
                                            <KbRow keys=":noh" desc="Clear highlight" />
                                            <KbRow keys=":%s/a/b/g" desc="Find & replace" />
                                        </div>
                                    </div>
                                )}
                                {keybindMode === 'emacs' && (
                                    <div className="flex gap-6 flex-wrap">
                                        <div className="space-y-0.5">
                                            <div className="text-gray-500 font-medium mb-0.5">Movement</div>
                                            <KbRow keys="Ctrl+F / Ctrl+B" desc="Forward / back char" />
                                            <KbRow keys="Alt+F / Alt+B" desc="Forward / back word" />
                                            <KbRow keys="Ctrl+N / Ctrl+P" desc="Next / prev line" />
                                            <KbRow keys="Ctrl+A / Ctrl+E" desc="Line start / end" />
                                            <KbRow keys="Alt+< / Alt+>" desc="File start / end" />
                                        </div>
                                        <div className="space-y-0.5">
                                            <div className="text-gray-500 font-medium mb-0.5">Delete & Kill</div>
                                            <KbRow keys="Ctrl+D" desc="Delete forward char" />
                                            <KbRow keys="Ctrl+H / Backspace" desc="Delete backward char" />
                                            <KbRow keys="Alt+D" desc="Kill word forward" />
                                            <KbRow keys="Ctrl+K" desc="Kill to end of line" />
                                            <KbRow keys="Ctrl+W" desc="Kill region (cut)" />
                                            <KbRow keys="Ctrl+Y" desc="Yank (paste from kill ring)" />
                                            <KbRow keys="Alt+Y" desc="Cycle kill ring" />
                                        </div>
                                        <div className="space-y-0.5">
                                            <div className="text-gray-500 font-medium mb-0.5">Selection & Search</div>
                                            <KbRow keys="Ctrl+Space" desc="Set mark (start selection)" />
                                            <KbRow keys="Ctrl+S" desc="Incremental search forward" />
                                            <KbRow keys="Ctrl+R" desc="Incremental search backward" />
                                            <KbRow keys="Ctrl+G" desc="Cancel / quit" />
                                        </div>
                                        <div className="space-y-0.5">
                                            <div className="text-gray-500 font-medium mb-0.5">File</div>
                                            <KbRow keys="Ctrl+X Ctrl+S" desc="Save (Emacs style)" />
                                            <KbRow keys="Cmd/Ctrl+S" desc="Save (standard)" />
                                            <KbRow keys="Ctrl+/" desc="Undo" />
                                        </div>
                                    </div>
                                )}
                                {keybindMode === 'nano' && (
                                    <div className="flex gap-6 flex-wrap">
                                        <div className="space-y-0.5">
                                            <div className="text-gray-500 font-medium mb-0.5">File</div>
                                            <KbRow keys="Ctrl+O" desc="Save (Write Out)" />
                                            <KbRow keys="Ctrl+S" desc="Save (alt)" />
                                        </div>
                                        <div className="space-y-0.5">
                                            <div className="text-gray-500 font-medium mb-0.5">Edit</div>
                                            <KbRow keys="Ctrl+K" desc="Cut line" />
                                            <KbRow keys="Ctrl+U" desc="Paste (Uncut)" />
                                            <KbRow keys="Ctrl+Z" desc="Undo" />
                                            <KbRow keys="Ctrl+Shift+Z" desc="Redo" />
                                        </div>
                                        <div className="space-y-0.5">
                                            <div className="text-gray-500 font-medium mb-0.5">Navigation</div>
                                            <KbRow keys="Ctrl+A / Ctrl+E" desc="Line start / end" />
                                            <KbRow keys="Ctrl+W" desc="Search" />
                                            <KbRow keys="Ctrl+Enter" desc="Run in terminal" />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {diskConflictModal.isOpen && createPortal(
                <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70">
                    <div className="theme-bg-secondary theme-border border rounded-lg shadow-xl p-5 max-w-md w-full mx-4">
                        <h3 className="text-base font-semibold theme-text-primary mb-2">File changed on disk</h3>
                        <p className="text-sm theme-text-secondary mb-4">
                            The file has been modified on disk since you loaded it. Do you want to overwrite those changes with your version?
                        </p>
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => resolveDiskConflict(false)}
                                className="px-3 py-1.5 rounded text-sm font-medium theme-text-secondary hover:bg-white/10 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => resolveDiskConflict(true)}
                                className="px-3 py-1.5 rounded text-sm font-medium bg-red-600 hover:bg-red-500 text-white transition-colors"
                            >
                                Overwrite disk
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {editorContextMenuPos && createPortal(
                <>
                    <div
                        className="fixed inset-0 z-[9998] bg-transparent"
                        onMouseDown={() => setEditorContextMenuPos(null)}
                    />
                    <div
                        className="fixed theme-bg-secondary theme-border border rounded shadow-lg py-1 z-[9999]"
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
                        <div className="border-t theme-border my-1"></div>
                        <button
                            onClick={() => {
                                setEditorContextMenuPos(null);
                                handleLoadBlame();
                            }}
                            className="flex items-center gap-2 px-4 py-2 theme-hover w-full text-left text-purple-400 text-sm">
                            <GitBranch size={16} />Git Blame
                        </button>
                        {contextMenuSelection && (
                            <>
                                <div className="border-t theme-border my-1"></div>
                                <button
                                    onClick={() => {
                                        setEditorContextMenuPos(null);
                                        handleAddToChat(contextMenuSelection);
                                    }}
                                    className="flex items-center gap-2 px-4 py-2 theme-hover w-full text-left text-blue-400 text-sm">
                                    <MessageSquare size={16} />Add to Chat
                                </button>
                                <button
                                    onClick={() => {
                                        setEditorContextMenuPos(null);
                                        handleAddToAgent(contextMenuSelection);
                                    }}
                                    className="flex items-center gap-2 px-4 py-2 theme-hover w-full text-left text-indigo-400 text-sm">
                                    <Bot size={16} />Add to Agent
                                </button>
                            </>
                        )}
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
                    </div>
                </>,
                document.body
            )}
        </div>
    );
};

export default CodeEditorPane;

    const renderFileContextMenu = () => (
        fileContextMenuPos && (
            <>
                <div
                    className="fixed inset-0 z-40 bg-transparent"
                    onMouseDown={() => setFileContextMenuPos(null)}
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