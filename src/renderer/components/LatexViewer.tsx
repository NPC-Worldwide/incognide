import { getFileName } from './utils';
import React, { useEffect, useState, useCallback, useMemo, memo, useRef } from 'react';
import {
    Save, Play, ExternalLink, X, SplitSquareHorizontal, Loader, ChevronDown,
    Table, Image, List, Link, FileText, Code, Sigma, Layout, Quote, Hash,
    AlertCircle, CheckCircle, ZoomIn, ZoomOut, Search, Replace, Undo, Redo,
    AlignLeft, Braces, RefreshCw, Download, Settings, BookOpen, Eye, EyeOff,
    Maximize2, Minimize2, FileCode, Terminal, ChevronRight, ChevronUp
} from 'lucide-react';
import CodeMirror from '@uiw/react-codemirror';
import { EditorView, lineNumbers, highlightActiveLineGutter, highlightActiveLine, drawSelection, dropCursor, rectangularSelection, crosshairCursor, highlightSpecialChars } from '@codemirror/view';
import { keymap } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab, undo, redo } from '@codemirror/commands';
import { HighlightStyle, syntaxHighlighting, indentOnInput, bracketMatching, foldGutter, foldKeymap, StreamLanguage } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { search, searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { lintGutter } from '@codemirror/lint';

// LaTeX language mode
const latexLanguage = StreamLanguage.define({
    name: 'latex',
    startState: () => ({
        inMath: false,
        mathDelimiter: null as string | null,
    }),
    token: (stream, state) => {
        if (stream.eatSpace()) return null;

        // Comments
        if (stream.match('%')) {
            stream.skipToEnd();
            return 'comment';
        }

        // Math delimiters
        if (stream.match('$$')) {
            state.inMath = !state.inMath;
            state.mathDelimiter = state.inMath ? '$$' : null;
            return 'keyword';
        }
        if (stream.match('\\[')) { state.inMath = true; state.mathDelimiter = '\\]'; return 'keyword'; }
        if (stream.match('\\]')) { state.inMath = false; state.mathDelimiter = null; return 'keyword'; }
        if (stream.match('\\(')) { state.inMath = true; state.mathDelimiter = '\\)'; return 'keyword'; }
        if (stream.match('\\)')) { state.inMath = false; state.mathDelimiter = null; return 'keyword'; }

        if (stream.peek() === '$' && !stream.match('$$')) {
            stream.next();
            if (state.inMath && state.mathDelimiter === '$') {
                state.inMath = false;
                state.mathDelimiter = null;
            } else if (!state.inMath) {
                state.inMath = true;
                state.mathDelimiter = '$';
            }
            return 'keyword';
        }

        if (state.inMath) {
            if (stream.match(/\\[a-zA-Z@]+/)) return 'function';
            if (stream.match(/[_^]/)) return 'operator';
            stream.next();
            return 'number';
        }

        if (stream.match(/\\[a-zA-Z@]+\*?/)) {
            const cmd = stream.current();
            if (/\\(documentclass|usepackage|begin|end|section|subsection|subsubsection|chapter|part|paragraph|title|author|date|maketitle|tableofcontents|bibliography|bibliographystyle|input|include)/.test(cmd)) {
                return 'keyword';
            }
            if (/\\(textbf|textit|emph|underline|texttt|textsf|textrm|textsc|tiny|scriptsize|footnotesize|small|normalsize|large|Large|LARGE|huge|Huge)/.test(cmd)) {
                return 'typeName';
            }
            if (/\\(ref|cite|label|pageref|eqref|footnote|caption|hyperref|autoref)/.test(cmd)) {
                return 'link';
            }
            return 'function';
        }

        if (stream.match(/\\[^a-zA-Z]/)) return 'escape';
        if (stream.match(/[{}]/)) return 'bracket';
        if (stream.match(/[\[\]]/)) return 'squareBracket';

        stream.next();
        return null;
    },
    languageData: { commentTokens: { line: '%' } },
});

const latexHighlightStyle = HighlightStyle.define([
    { tag: t.keyword, color: '#c678dd', fontWeight: 'bold' },
    { tag: t.function(t.variableName), color: '#61afef' },
    { tag: t.typeName, color: '#e5c07b' },
    { tag: t.comment, color: '#7f848e', fontStyle: 'italic' },
    { tag: t.number, color: '#d19a66' },
    { tag: t.operator, color: '#56b6c2' },
    { tag: t.escape, color: '#98c379' },
    { tag: t.bracket, color: '#e06c75' },
    { tag: t.squareBracket, color: '#98c379' },
    { tag: t.link, color: '#61afef', textDecoration: 'underline' },
]);

// Quick symbols for math
const MATH_SYMBOLS = [
    { label: 'α', cmd: '\\alpha' }, { label: 'β', cmd: '\\beta' }, { label: 'γ', cmd: '\\gamma' },
    { label: 'δ', cmd: '\\delta' }, { label: 'ε', cmd: '\\epsilon' }, { label: 'θ', cmd: '\\theta' },
    { label: 'λ', cmd: '\\lambda' }, { label: 'μ', cmd: '\\mu' }, { label: 'π', cmd: '\\pi' },
    { label: 'σ', cmd: '\\sigma' }, { label: 'φ', cmd: '\\phi' }, { label: 'ω', cmd: '\\omega' },
    { label: '∑', cmd: '\\sum' }, { label: '∏', cmd: '\\prod' }, { label: '∫', cmd: '\\int' },
    { label: '∂', cmd: '\\partial' }, { label: '∞', cmd: '\\infty' }, { label: '≠', cmd: '\\neq' },
    { label: '≤', cmd: '\\leq' }, { label: '≥', cmd: '\\geq' }, { label: '≈', cmd: '\\approx' },
    { label: '×', cmd: '\\times' }, { label: '÷', cmd: '\\div' }, { label: '±', cmd: '\\pm' },
    { label: '√', cmd: '\\sqrt{}' }, { label: '∈', cmd: '\\in' }, { label: '⊂', cmd: '\\subset' },
    { label: '∪', cmd: '\\cup' }, { label: '∩', cmd: '\\cap' }, { label: '→', cmd: '\\rightarrow' },
    { label: '←', cmd: '\\leftarrow' }, { label: '⇒', cmd: '\\Rightarrow' }, { label: '⇔', cmd: '\\Leftrightarrow' },
];

// Snippets
const SNIPPETS = {
    structure: [
        { label: 'Section', snippet: '\\section{', icon: Hash },
        { label: 'Subsection', snippet: '\\subsection{', icon: Hash },
        { label: 'Paragraph', snippet: '\\paragraph{', icon: FileText },
    ],
    formatting: [
        { label: 'Bold', snippet: '\\textbf{', icon: FileText },
        { label: 'Italic', snippet: '\\textit{', icon: FileText },
        { label: 'Underline', snippet: '\\underline{', icon: FileText },
        { label: 'Monospace', snippet: '\\texttt{', icon: Code },
    ],
    math: [
        { label: 'Inline $...$', snippet: '$', icon: Sigma },
        { label: 'Display \\[...\\]', snippet: '\\[\n\n\\]', icon: Sigma },
        { label: 'Equation', snippet: '\\begin{equation}\n\n\\end{equation}', icon: Sigma },
        { label: 'Align', snippet: '\\begin{align}\n  & \\\\\n\\end{align}', icon: Sigma },
        { label: 'Fraction', snippet: '\\frac{}{}', icon: Sigma },
        { label: 'Sum', snippet: '\\sum_{}^{}', icon: Sigma },
        { label: 'Integral', snippet: '\\int_{}^{}', icon: Sigma },
        { label: 'Matrix', snippet: '\\begin{pmatrix}\n  &  \\\\\n  & \n\\end{pmatrix}', icon: Sigma },
    ],
    environments: [
        { label: 'Figure', snippet: '\\begin{figure}[htbp]\n  \\centering\n  \\includegraphics[width=0.8\\textwidth]{}\n  \\caption{}\n  \\label{fig:}\n\\end{figure}', icon: Image },
        { label: 'Table', snippet: '\\begin{table}[htbp]\n  \\centering\n  \\begin{tabular}{|c|c|c|}\n    \\hline\n    A & B & C \\\\\n    \\hline\n  \\end{tabular}\n  \\caption{}\n  \\label{tab:}\n\\end{table}', icon: Table },
        { label: 'Itemize', snippet: '\\begin{itemize}\n  \\item \n  \\item \n\\end{itemize}', icon: List },
        { label: 'Enumerate', snippet: '\\begin{enumerate}\n  \\item \n  \\item \n\\end{enumerate}', icon: List },
        { label: 'Verbatim', snippet: '\\begin{verbatim}\n\n\\end{verbatim}', icon: Code },
        { label: 'Quote', snippet: '\\begin{quote}\n\n\\end{quote}', icon: Quote },
    ],
    references: [
        { label: 'Citation', snippet: '\\cite{}', icon: Quote },
        { label: 'Reference', snippet: '\\ref{}', icon: Link },
        { label: 'Label', snippet: '\\label{}', icon: Hash },
        { label: 'Footnote', snippet: '\\footnote{}', icon: FileText },
        { label: 'URL', snippet: '\\url{}', icon: Link },
    ],
};

const TEMPLATES = [
    { label: 'Article', content: `\\documentclass[12pt]{article}
\\usepackage[utf8]{inputenc}
\\usepackage{amsmath,amssymb,amsthm}
\\usepackage{graphicx}
\\usepackage{hyperref}
\\usepackage[margin=1in]{geometry}

\\title{Your Title}
\\author{Your Name}
\\date{\\today}

\\begin{document}

\\maketitle

\\begin{abstract}
Your abstract here.
\\end{abstract}

\\section{Introduction}
Your introduction here.

\\section{Methods}
Your methods here.

\\section{Results}
Your results here.

\\section{Conclusion}
Your conclusion here.

\\bibliographystyle{plain}
\\bibliography{references}

\\end{document}
` },
    { label: 'Beamer', content: `\\documentclass{beamer}
\\usetheme{Madrid}
\\usecolortheme{default}
\\usepackage{amsmath,amssymb}
\\usepackage{graphicx}

\\title{Presentation Title}
\\author{Your Name}
\\institute{Your Institution}
\\date{\\today}

\\begin{document}

\\begin{frame}
\\titlepage
\\end{frame}

\\begin{frame}{Outline}
\\tableofcontents
\\end{frame}

\\section{Introduction}
\\begin{frame}{Introduction}
\\begin{itemize}
  \\item First point
  \\item Second point
  \\item Third point
\\end{itemize}
\\end{frame}

\\section{Main Content}
\\begin{frame}{Main Content}
Your main content here.
\\end{frame}

\\section{Conclusion}
\\begin{frame}{Conclusion}
Thank you for your attention!
\\end{frame}

\\end{document}
` },
    { label: 'Report', content: `\\documentclass[12pt]{report}
\\usepackage[utf8]{inputenc}
\\usepackage{amsmath,amssymb}
\\usepackage{graphicx}
\\usepackage{hyperref}
\\usepackage[margin=1in]{geometry}

\\title{Report Title}
\\author{Your Name}
\\date{\\today}

\\begin{document}

\\maketitle

\\tableofcontents

\\chapter{Introduction}
Your introduction here.

\\chapter{Background}
Background information here.

\\chapter{Methodology}
Your methodology here.

\\chapter{Results}
Your results here.

\\chapter{Discussion}
Discussion here.

\\chapter{Conclusion}
Your conclusion here.

\\end{document}
` },
    { label: 'Letter', content: `\\documentclass{letter}
\\usepackage[utf8]{inputenc}

\\signature{Your Name}
\\address{Your Address}

\\begin{document}

\\begin{letter}{Recipient Name \\\\ Recipient Address}

\\opening{Dear Sir or Madam,}

Your letter content here.

\\closing{Yours faithfully,}

\\end{letter}

\\end{document}
` },
];

const editorTheme = EditorView.theme({
    '&': { height: '100%', fontSize: '13px', backgroundColor: '#1e1e2e' },
    '.cm-content': {
        fontFamily: '"Fira Code", "JetBrains Mono", "Cascadia Code", Menlo, monospace',
        caretColor: '#89b4fa',
        padding: '8px 0',
    },
    '.cm-cursor': { borderLeftColor: '#89b4fa', borderLeftWidth: '2px' },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
        backgroundColor: 'rgba(137, 180, 250, 0.3)',
    },
    '.cm-activeLine': { backgroundColor: 'rgba(137, 180, 250, 0.08)' },
    '.cm-activeLineGutter': { backgroundColor: 'rgba(137, 180, 250, 0.1)' },
    '.cm-gutters': {
        backgroundColor: '#181825',
        color: '#6c7086',
        borderRight: '1px solid #313244',
    },
    '.cm-lineNumbers .cm-gutterElement': { padding: '0 8px 0 12px', minWidth: '40px' },
    '&.cm-focused .cm-matchingBracket': {
        backgroundColor: 'rgba(137, 180, 250, 0.3)',
        outline: '1px solid rgba(137, 180, 250, 0.5)',
    },
    '.cm-searchMatch': { backgroundColor: 'rgba(229, 192, 123, 0.3)' },
    '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'rgba(229, 192, 123, 0.5)' },
});

const LatexViewer = ({
    nodeId,
    contentDataRef,
    findNodePath,
    rootLayoutNode,
    setDraggedItem,
    setPaneContextMenu,
    closeContentPane,
    performSplit
}: any) => {
    const [content, setContent] = useState('');
    const [hasChanges, setHasChanges] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isCompiling, setIsCompiling] = useState(false);
    const [compileLog, setCompileLog] = useState('');
    const [compileStatus, setCompileStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // UI state
    const [activeMenu, setActiveMenu] = useState<string | null>(null);
    const [showSymbols, setShowSymbols] = useState(false);
    const [showLog, setShowLog] = useState(true);
    const [showOutline, setShowOutline] = useState(false);
    const editorRef = useRef<any>(null);
    const editorViewRef = useRef<any>(null);

    const paneData = contentDataRef.current[nodeId];
    const filePath = paneData?.contentId;

    // Document statistics
    const stats = useMemo(() => {
        const lines = content.split('\n').length;
        const words = content.trim() ? content.trim().split(/\s+/).length : 0;
        const chars = content.length;
        return { lines, words, chars };
    }, [content]);

    // Extract document outline (sections, subsections, etc.)
    const outline = useMemo(() => {
        const items: { level: number; title: string; line: number }[] = [];
        const lines = content.split('\n');
        lines.forEach((line, idx) => {
            const match = line.match(/\\(chapter|section|subsection|subsubsection|paragraph)\*?\{([^}]+)\}/);
            if (match) {
                const levels: Record<string, number> = { chapter: 0, section: 1, subsection: 2, subsubsection: 3, paragraph: 4 };
                items.push({ level: levels[match[1]] || 1, title: match[2], line: idx + 1 });
            }
        });
        return items;
    }, [content]);

    // Parse compile errors
    const parseErrors = useMemo(() => {
        const errors: { line: number; message: string }[] = [];
        const regex = /^l\.(\d+)\s+(.+)$/gm;
        let match;
        while ((match = regex.exec(compileLog)) !== null) {
            errors.push({ line: parseInt(match[1]), message: match[2] });
        }
        return errors;
    }, [compileLog]);

    const extensions = useMemo(() => [
        latexLanguage,
        syntaxHighlighting(latexHighlightStyle),
        editorTheme,
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        highlightSpecialChars(),
        history(),
        foldGutter(),
        drawSelection(),
        dropCursor(),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        rectangularSelection(),
        crosshairCursor(),
        highlightSelectionMatches(),
        search(),
        autocompletion(),
        keymap.of([
            ...closeBracketsKeymap,
            ...defaultKeymap,
            ...searchKeymap,
            ...historyKeymap,
            ...foldKeymap,
            ...completionKeymap,
            indentWithTab,
        ]),
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
            if (update.view) editorViewRef.current = update.view;
        }),
    ], []);

    // Load file
    useEffect(() => {
        const load = async () => {
            if (!filePath) return;
            setIsLoading(true);
            try {
                const text = await (window as any).api.readFileContent(filePath);
                if (text?.error) throw new Error(text.error);
                setContent(typeof text === 'string' ? text : text?.content ?? '');
                setHasChanges(false);
            } catch (e: any) {
                setError(e.message || String(e));
            } finally {
                setIsLoading(false);
            }
        };
        load();
    }, [filePath]);

    // Insert text at cursor
    const insertAtCursor = useCallback((text: string) => {
        const view = editorViewRef.current;
        if (view) {
            const { from, to } = view.state.selection.main;
            view.dispatch({
                changes: { from, to, insert: text },
                selection: { anchor: from + text.length },
            });
            view.focus();
        } else {
            setContent(prev => prev + text);
        }
        setHasChanges(true);
        setActiveMenu(null);
    }, []);

    // Go to line
    const goToLine = useCallback((lineNum: number) => {
        const view = editorViewRef.current;
        if (view) {
            const line = view.state.doc.line(lineNum);
            view.dispatch({
                selection: { anchor: line.from },
                scrollIntoView: true,
            });
            view.focus();
        }
    }, []);

    const save = useCallback(async () => {
        if (!hasChanges) return;
        setIsSaving(true);
        setError(null);
        try {
            await (window as any).api.writeFileContent(filePath, content);
            setHasChanges(false);
        } catch (e: any) {
            setError(e.message || String(e));
        } finally {
            setIsSaving(false);
        }
    }, [hasChanges, content, filePath]);

    const openPdfInSplit = useCallback((pdfPath: string) => {
        const existing = Object.keys(contentDataRef.current).find(
            id => contentDataRef.current[id]?.contentType === 'pdf' && contentDataRef.current[id]?.contentId === pdfPath
        );
        if (existing) {
            window.dispatchEvent(new CustomEvent('pdf-refresh', { detail: { pdfPath } }));
            return;
        }
        if (performSplit) {
            performSplit(findNodePath(rootLayoutNode, nodeId), 'right', 'pdf', pdfPath);
        }
    }, [performSplit, findNodePath, rootLayoutNode, nodeId, contentDataRef]);

    const compile = useCallback(async (openInSplit = true) => {
        if (hasChanges) {
            try {
                await (window as any).api.writeFileContent(filePath, content);
                setHasChanges(false);
            } catch (e: any) {
                setError('Failed to save: ' + (e.message || String(e)));
                return;
            }
        }

        setIsCompiling(true);
        setCompileLog('');
        setCompileStatus('idle');
        setError(null);
        setShowLog(true);

        try {
            const res = await (window as any).api.compileLatex(filePath);
            const log = res?.log || res?.error || '';
            setCompileLog(log);

            const pdfPath = res?.pdfPath || filePath.replace(/\.tex$/i, '.pdf');
            const pdfExists = await (window as any).api.fileExists?.(pdfPath);

            if (!pdfExists) {
                setCompileStatus('error');
                setError('Compilation failed - no PDF generated');
                return;
            }

            setCompileStatus('success');
            if (openInSplit && performSplit) {
                openPdfInSplit(pdfPath);
            }
        } catch (e: any) {
            setCompileStatus('error');
            setError(e.message || String(e));
        } finally {
            setIsCompiling(false);
        }
    }, [filePath, content, hasChanges, performSplit, openPdfInSplit]);

    // Keyboard shortcuts
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            const isCtrl = e.ctrlKey || e.metaKey;
            if (isCtrl && e.key.toLowerCase() === 's') {
                e.preventDefault();
                save();
            } else if (isCtrl && e.key === 'Enter') {
                e.preventDefault();
                compile(true);
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [save, compile]);

    // Close menus on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (!(e.target as HTMLElement).closest('.dropdown-menu')) {
                setActiveMenu(null);
            }
        };
        document.addEventListener('click', handler);
        return () => document.removeEventListener('click', handler);
    }, []);

    const applyTemplate = useCallback((templateContent: string) => {
        if (content.trim() && !confirm('Replace current content with template?')) return;
        setContent(templateContent);
        setHasChanges(true);
        setActiveMenu(null);
    }, [content]);

    if (error && isLoading) return <div className="p-4 text-red-500">Error: {error}</div>;
    if (isLoading) return (
        <div className="h-full flex items-center justify-center theme-bg-secondary">
            <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2" />
                <p className="text-sm theme-text-muted">Loading document...</p>
            </div>
        </div>
    );

    return (
        <div className="h-full flex flex-col theme-bg-secondary overflow-hidden">
            {/* Header */}
            <div
                draggable
                onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'move';
                    const nodePath = findNodePath(rootLayoutNode, nodeId);
                    e.dataTransfer.setData('application/json', JSON.stringify({ type: 'pane', id: nodeId, nodePath }));
                    setTimeout(() => setDraggedItem({ type: 'pane', id: nodeId, nodePath }), 0);
                }}
                onDragEnd={() => setDraggedItem(null)}
                onContextMenu={(e) => {
                    e.preventDefault();
                    setPaneContextMenu({ isOpen: true, x: e.clientX, y: e.clientY, nodeId, nodePath: findNodePath(rootLayoutNode, nodeId) });
                }}
                className="px-3 py-2 border-b theme-border theme-bg-secondary cursor-move flex items-center justify-between"
            >
                <div className="flex items-center gap-2">
                    <FileCode size={14} className="text-green-400" />
                    <span className="text-sm font-medium truncate">
                        {getFileName(filePath) || 'Untitled'}{hasChanges ? ' *' : ''}
                    </span>
                </div>
                <div className="flex items-center gap-1">
                    <button onClick={save} disabled={!hasChanges || isSaving} className="p-1.5 theme-hover rounded disabled:opacity-30" title="Save (Ctrl+S)">
                        {isSaving ? <Loader size={14} className="animate-spin" /> : <Save size={14} />}
                    </button>
                    <button
                        onClick={() => compile(true)}
                        disabled={isCompiling}
                        className={`p-1.5 theme-hover rounded disabled:opacity-50 flex items-center gap-1 ${isCompiling ? 'text-yellow-400' : compileStatus === 'success' ? 'text-green-400' : compileStatus === 'error' ? 'text-red-400' : ''}`}
                        title="Compile & Preview (Ctrl+Enter)"
                    >
                        {isCompiling ? <Loader size={14} className="animate-spin" /> : <Play size={14} />}
                    </button>
                    <button onClick={() => openPdfInSplit(filePath.replace(/\.tex$/i, '.pdf'))} className="p-1.5 theme-hover rounded" title="Open PDF in split">
                        <SplitSquareHorizontal size={14} />
                    </button>
                    <button onClick={async () => { await (window as any).api.openFile(filePath.replace(/\.tex$/i, '.pdf')); }} className="p-1.5 theme-hover rounded" title="Open PDF externally">
                        <ExternalLink size={14} />
                    </button>
                    <div className="w-px h-4 bg-gray-600 mx-1" />
                    <button onClick={() => setShowOutline(!showOutline)} className={`p-1.5 rounded ${showOutline ? 'bg-blue-600/30' : 'theme-hover'}`} title="Document Outline">
                        <BookOpen size={14} />
                    </button>
                    <button onClick={() => setShowSymbols(!showSymbols)} className={`p-1.5 rounded ${showSymbols ? 'bg-blue-600/30' : 'theme-hover'}`} title="Math Symbols">
                        <Sigma size={14} />
                    </button>
                    <button onClick={() => setShowLog(!showLog)} className={`p-1.5 rounded ${showLog ? 'bg-blue-600/30' : 'theme-hover'}`} title="Build Log">
                        <Terminal size={14} />
                    </button>
                    <button onClick={() => closeContentPane(nodeId, findNodePath(rootLayoutNode, nodeId))} className="p-1.5 theme-hover rounded-full" title="Close">
                        <X size={14} />
                    </button>
                </div>
            </div>

            {/* Toolbar */}
            <div className="px-2 py-1.5 border-b theme-border theme-bg-tertiary flex items-center gap-1 flex-wrap">
                {/* Templates */}
                <div className="relative dropdown-menu">
                    <button
                        onClick={(e) => { e.stopPropagation(); setActiveMenu(activeMenu === 'templates' ? null : 'templates'); }}
                        className="px-2 py-1 text-[11px] theme-hover rounded flex items-center gap-1 border border-white/10"
                    >
                        <FileText size={12} />
                        <span>Templates</span>
                        <ChevronDown size={10} />
                    </button>
                    {activeMenu === 'templates' && (
                        <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-700 rounded shadow-xl z-50 min-w-[120px] py-1">
                            {TEMPLATES.map(t => (
                                <button key={t.label} onClick={() => applyTemplate(t.content)} className="w-full px-3 py-1.5 text-left text-xs hover:bg-gray-700">
                                    {t.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="w-px h-4 bg-gray-600 mx-0.5" />

                {/* Snippet categories */}
                {Object.entries(SNIPPETS).map(([cat, items]) => (
                    <div key={cat} className="relative dropdown-menu">
                        <button
                            onClick={(e) => { e.stopPropagation(); setActiveMenu(activeMenu === cat ? null : cat); }}
                            className={`px-2 py-1 text-[11px] rounded flex items-center gap-1 ${activeMenu === cat ? 'bg-blue-600/30' : 'theme-hover'}`}
                        >
                            {cat === 'structure' && <Hash size={12} />}
                            {cat === 'formatting' && <AlignLeft size={12} />}
                            {cat === 'math' && <Sigma size={12} />}
                            {cat === 'environments' && <Braces size={12} />}
                            {cat === 'references' && <Link size={12} />}
                            <span className="capitalize">{cat}</span>
                            <ChevronDown size={10} />
                        </button>
                        {activeMenu === cat && (
                            <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-700 rounded shadow-xl z-50 min-w-[140px] py-1 max-h-64 overflow-y-auto">
                                {items.map(item => (
                                    <button
                                        key={item.label}
                                        onClick={() => insertAtCursor(item.snippet)}
                                        className="w-full px-3 py-1.5 text-left text-xs hover:bg-gray-700 flex items-center gap-2"
                                    >
                                        <item.icon size={12} className="text-gray-500" />
                                        {item.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                ))}

                <div className="flex-1" />

                {/* Stats */}
                <div className="text-[10px] text-gray-500 flex items-center gap-3">
                    <span>{stats.lines} lines</span>
                    <span>{stats.words} words</span>
                    <span>{stats.chars} chars</span>
                </div>
            </div>

            {/* Main content */}
            <div className="flex-1 flex min-h-0 overflow-hidden">
                {/* Outline panel */}
                {showOutline && (
                    <div className="w-48 border-r theme-border overflow-y-auto theme-bg-tertiary">
                        <div className="px-3 py-2 text-[11px] font-medium border-b theme-border">Document Outline</div>
                        {outline.length === 0 ? (
                            <div className="p-3 text-xs text-gray-500">No sections found</div>
                        ) : (
                            <div className="p-1">
                                {outline.map((item, i) => (
                                    <button
                                        key={i}
                                        onClick={() => goToLine(item.line)}
                                        className="w-full text-left px-2 py-1 text-xs hover:bg-white/5 rounded truncate"
                                        style={{ paddingLeft: 8 + item.level * 12 }}
                                    >
                                        {item.title}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Editor */}
                <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
                    {isCompiling && (
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-10">
                            <div className="bg-gray-800 rounded-lg p-4 flex items-center gap-3 shadow-xl border border-gray-700">
                                <Loader size={24} className="animate-spin text-yellow-400" />
                                <span className="text-white font-medium">Compiling LaTeX...</span>
                            </div>
                        </div>
                    )}
                    <div className="flex-1 overflow-hidden">
                        <CodeMirror
                            ref={editorRef}
                            value={content}
                            onChange={(val) => { setContent(val); setHasChanges(true); }}
                            extensions={extensions}
                            basicSetup={false}
                            className="h-full"
                            style={{ height: '100%' }}
                        />
                    </div>
                </div>

                {/* Symbols panel */}
                {showSymbols && (
                    <div className="w-48 border-l theme-border overflow-y-auto theme-bg-tertiary">
                        <div className="px-3 py-2 text-[11px] font-medium border-b theme-border">Math Symbols</div>
                        <div className="grid grid-cols-4 gap-0.5 p-2">
                            {MATH_SYMBOLS.map(sym => (
                                <button
                                    key={sym.cmd}
                                    onClick={() => insertAtCursor(sym.cmd)}
                                    className="w-9 h-9 flex items-center justify-center text-lg theme-hover rounded"
                                    title={sym.cmd}
                                >
                                    {sym.label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Build log */}
            {showLog && (
                <div className="border-t theme-border theme-bg-tertiary flex flex-col">
                    <div className="flex items-center justify-between px-3 py-1 border-b theme-border">
                        <div className="flex items-center gap-2">
                            <Terminal size={12} />
                            <span className="text-[11px] font-medium">Build Log</span>
                            {compileStatus === 'success' && <CheckCircle size={12} className="text-green-400" />}
                            {compileStatus === 'error' && <AlertCircle size={12} className="text-red-400" />}
                            {parseErrors.length > 0 && (
                                <span className="text-[10px] text-red-400">{parseErrors.length} errors</span>
                            )}
                        </div>
                        <button onClick={() => setShowLog(false)} className="p-1 theme-hover rounded">
                            <ChevronDown size={12} />
                        </button>
                    </div>
                    <div className="max-h-32 overflow-auto p-2 font-mono text-[11px]">
                        {compileLog ? (
                            <pre className="whitespace-pre-wrap text-gray-400">{compileLog}</pre>
                        ) : (
                            <div className="text-gray-500">Press Ctrl+Enter to compile</div>
                        )}
                    </div>
                    {parseErrors.length > 0 && (
                        <div className="border-t theme-border p-2 space-y-1">
                            {parseErrors.slice(0, 5).map((err, i) => (
                                <button
                                    key={i}
                                    onClick={() => goToLine(err.line)}
                                    className="w-full text-left px-2 py-1 text-xs bg-red-500/10 text-red-400 rounded hover:bg-red-500/20 flex items-center gap-2"
                                >
                                    <AlertCircle size={12} />
                                    <span>Line {err.line}: {err.message}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Status bar */}
            <div className="flex items-center justify-between px-3 py-1 border-t theme-border theme-bg-tertiary text-[10px] text-gray-500">
                <div className="flex items-center gap-3">
                    {error && <span className="text-red-400">{error}</span>}
                    {!error && (hasChanges ? <span className="text-yellow-400">● Unsaved</span> : <span className="text-green-400">● Saved</span>)}
                </div>
                <div>Ctrl+S save | Ctrl+Enter compile</div>
            </div>
        </div>
    );
};

// Custom comparison to prevent reload on pane resize
const arePropsEqual = (prevProps: any, nextProps: any) => {
    return prevProps.nodeId === nextProps.nodeId;
};

export default memo(LatexViewer, arePropsEqual);
