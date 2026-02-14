import { getFileName } from './utils';
import React, { useEffect, useState, useCallback, useMemo, memo, useRef } from 'react';
import {
    Save, Play, ExternalLink, X, SplitSquareHorizontal, Loader, ChevronDown,
    Table, Image, List, Link, FileText, Code, Sigma, Layout, Quote, Hash,
    AlertCircle, CheckCircle, ZoomIn, ZoomOut, Search, Replace, Undo, Redo,
    AlignLeft, Braces, RefreshCw, Download, Settings, BookOpen, Eye, EyeOff,
    Maximize2, Minimize2, FileCode, Terminal, ChevronRight, ChevronUp,
    Bold, Italic, Underline as UnderlineIcon, Type, MessageSquare, PanelLeft,
    ChevronLeft, ChevronsUpDown
} from 'lucide-react';
import CodeMirror from '@uiw/react-codemirror';
import { EditorView, lineNumbers, highlightActiveLineGutter, highlightActiveLine, drawSelection, dropCursor, rectangularSelection, crosshairCursor, highlightSpecialChars } from '@codemirror/view';
import { keymap } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
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
    { tag: t.keyword, color: '#cba6f7', fontWeight: 'bold' },
    { tag: t.function(t.variableName), color: '#89b4fa' },
    { tag: t.typeName, color: '#f9e2af' },
    { tag: t.comment, color: '#6c7086', fontStyle: 'italic' },
    { tag: t.number, color: '#fab387' },
    { tag: t.operator, color: '#94e2d5' },
    { tag: t.escape, color: '#a6e3a1' },
    { tag: t.bracket, color: '#f38ba8' },
    { tag: t.squareBracket, color: '#a6e3a1' },
    { tag: t.link, color: '#74c7ec', textDecoration: 'underline' },
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

// Snippets — 'ENV:envname' triggers wrapInEnvironment for block-level wrapping
// Consolidated into 5 menus to keep toolbar clean
const SNIPPETS = {
    structure: [
        { label: 'Part', snippet: '\\part{', icon: Hash },
        { label: 'Chapter', snippet: '\\chapter{', icon: Hash },
        { label: 'Section', snippet: '\\section{', icon: Hash },
        { label: 'Subsection', snippet: '\\subsection{', icon: Hash },
        { label: 'Subsubsection', snippet: '\\subsubsection{', icon: Hash },
        { label: 'Paragraph', snippet: '\\paragraph{', icon: FileText },
        { label: 'Appendix', snippet: '\\appendix', icon: Hash },
        { label: 'Table of Contents', snippet: '\\tableofcontents', icon: List },
    ],
    format: [
        // --- Text style ---
        { label: 'Bold', snippet: '\\textbf{', icon: Bold },
        { label: 'Italic', snippet: '\\textit{', icon: Italic },
        { label: 'Underline', snippet: '\\underline{', icon: UnderlineIcon },
        { label: 'Emphasis', snippet: '\\emph{', icon: Italic },
        { label: 'Monospace', snippet: '\\texttt{', icon: Code },
        { label: 'Small Caps', snippet: '\\textsc{', icon: Type },
        { label: 'Strikethrough', snippet: '\\sout{', icon: Type },
        { label: 'Superscript', snippet: '\\textsuperscript{', icon: Type },
        { label: 'Subscript', snippet: '\\textsubscript{', icon: Type },
        { label: 'Text Color', snippet: '\\textcolor{red}{', icon: Type },
        // --- Size ---
        { label: '\\tiny', snippet: '{\\tiny ', icon: Type },
        { label: '\\small', snippet: '{\\small ', icon: Type },
        { label: '\\large', snippet: '{\\large ', icon: Type },
        { label: '\\Large', snippet: '{\\Large ', icon: Type },
        { label: '\\Huge', snippet: '{\\Huge ', icon: Type },
        // --- Alignment ---
        { label: 'Center Block', snippet: 'ENV:center', icon: AlignLeft },
        { label: 'Flush Left', snippet: 'ENV:flushleft', icon: AlignLeft },
        { label: 'Flush Right', snippet: 'ENV:flushright', icon: AlignLeft },
    ],
    math: [
        { label: 'Inline $...$', snippet: '$', icon: Sigma },
        { label: 'Display \\[...\\]', snippet: '\\[\n\n\\]', icon: Sigma },
        { label: 'Equation', snippet: 'ENV:equation', icon: Sigma },
        { label: 'Align', snippet: '\\begin{align}\n  & \\\\\n\\end{align}', icon: Sigma },
        { label: 'Align*', snippet: '\\begin{align*}\n  & \\\\\n\\end{align*}', icon: Sigma },
        { label: 'Gather', snippet: 'ENV:gather', icon: Sigma },
        { label: 'Multline', snippet: 'ENV:multline', icon: Sigma },
        { label: 'Cases', snippet: '\\begin{cases}\n  & \\text{if } \\\\\n  & \\text{otherwise}\n\\end{cases}', icon: Sigma },
        { label: 'Fraction', snippet: '\\frac{}{}', icon: Sigma },
        { label: 'Sum', snippet: '\\sum_{}^{}', icon: Sigma },
        { label: 'Product', snippet: '\\prod_{}^{}', icon: Sigma },
        { label: 'Integral', snippet: '\\int_{}^{}', icon: Sigma },
        { label: 'Limit', snippet: '\\lim_{\\to }', icon: Sigma },
        { label: 'Matrix (round)', snippet: '\\begin{pmatrix}\n  &  \\\\\n  & \n\\end{pmatrix}', icon: Sigma },
        { label: 'Matrix [square]', snippet: '\\begin{bmatrix}\n  &  \\\\\n  & \n\\end{bmatrix}', icon: Sigma },
        { label: 'Sqrt', snippet: '\\sqrt{', icon: Sigma },
        { label: 'Binomial', snippet: '\\binom{}{}', icon: Sigma },
        { label: 'Overline', snippet: '\\overline{', icon: Sigma },
        { label: 'Hat / Vec / Dot', snippet: '\\hat{', icon: Sigma },
    ],
    insert: [
        // --- Environments ---
        { label: 'Figure', snippet: '\\begin{figure}[htbp]\n  \\centering\n  \\includegraphics[width=0.8\\textwidth]{}\n  \\caption{}\n  \\label{fig:}\n\\end{figure}', icon: Image },
        { label: 'Table', snippet: '\\begin{table}[htbp]\n  \\centering\n  \\begin{tabular}{|c|c|c|}\n    \\hline\n    A & B & C \\\\\n    \\hline\n  \\end{tabular}\n  \\caption{}\n  \\label{tab:}\n\\end{table}', icon: Table },
        { label: 'Itemize', snippet: '\\begin{itemize}\n  \\item \n  \\item \n\\end{itemize}', icon: List },
        { label: 'Enumerate', snippet: '\\begin{enumerate}\n  \\item \n  \\item \n\\end{enumerate}', icon: List },
        { label: 'Description', snippet: '\\begin{description}\n  \\item[Term] Desc\n\\end{description}', icon: List },
        { label: 'Verbatim', snippet: 'ENV:verbatim', icon: Code },
        { label: 'Quote', snippet: 'ENV:quote', icon: Quote },
        { label: 'Abstract', snippet: 'ENV:abstract', icon: FileText },
        { label: 'Minipage', snippet: '\\begin{minipage}[t]{0.45\\textwidth}\n\n\\end{minipage}', icon: Layout },
        { label: 'Multicols', snippet: '\\begin{multicols}{2}\n\n\\end{multicols}', icon: Layout },
        // --- Theorems ---
        { label: 'Theorem', snippet: 'ENV:theorem', icon: BookOpen },
        { label: 'Lemma', snippet: 'ENV:lemma', icon: BookOpen },
        { label: 'Proof', snippet: 'ENV:proof', icon: BookOpen },
        { label: 'Definition', snippet: 'ENV:definition', icon: BookOpen },
        { label: 'Corollary', snippet: 'ENV:corollary', icon: BookOpen },
        { label: 'Remark', snippet: 'ENV:remark', icon: BookOpen },
        { label: 'Example', snippet: 'ENV:example', icon: BookOpen },
        // --- Code ---
        { label: 'lstlisting', snippet: '\\begin{lstlisting}[language=Python]\n\n\\end{lstlisting}', icon: Code },
        { label: 'minted', snippet: '\\begin{minted}{python}\n\n\\end{minted}', icon: Code },
        { label: 'Algorithm', snippet: '\\begin{algorithm}[H]\n  \\caption{}\n  \\begin{algorithmic}[1]\n    \\State \n  \\end{algorithmic}\n\\end{algorithm}', icon: Code },
        { label: 'Comment Block', snippet: '\\iffalse\n\n\\fi', icon: MessageSquare },
        // --- Layout ---
        { label: 'New Page', snippet: '\\newpage', icon: FileText },
        { label: 'Vert Space', snippet: '\\vspace{1em}', icon: FileText },
        { label: '\\include{}', snippet: '\\include{', icon: FileText },
        { label: '\\usepackage{}', snippet: '\\usepackage{', icon: FileText },
        { label: '\\newcommand', snippet: '\\newcommand{\\cmdname}[1]{#1}', icon: Code },
        { label: '\\newtheorem', snippet: '\\newtheorem{theorem}{Theorem}[section]', icon: Code },
    ],
    references: [
        { label: 'Citation', snippet: '\\cite{', icon: Quote },
        { label: 'Text Cite', snippet: '\\textcite{', icon: Quote },
        { label: 'Reference', snippet: '\\ref{', icon: Link },
        { label: 'Equation Ref', snippet: '\\eqref{', icon: Link },
        { label: 'Auto Ref', snippet: '\\autoref{', icon: Link },
        { label: 'Label', snippet: '\\label{', icon: Hash },
        { label: 'Footnote', snippet: '\\footnote{', icon: FileText },
        { label: 'URL', snippet: '\\url{', icon: Link },
        { label: 'Hyperlink', snippet: '\\href{URL}{', icon: Link },
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
    { label: 'Homework', content: `\\documentclass[12pt]{article}
\\usepackage[utf8]{inputenc}
\\usepackage{amsmath,amssymb,amsthm}
\\usepackage{enumitem}
\\usepackage[margin=1in]{geometry}

\\newcommand{\\problem}[1]{\\section*{Problem #1}}
\\newcommand{\\solution}{\\subsection*{Solution}}

\\title{Homework \\#1}
\\author{Your Name}
\\date{\\today}

\\begin{document}

\\maketitle

\\problem{1}
State the problem here.

\\solution
Write your solution here.

\\problem{2}
State the problem here.

\\solution
Write your solution here.

\\end{document}
` },
    { label: 'Thesis', content: `\\documentclass[12pt,a4paper]{report}
\\usepackage[utf8]{inputenc}
\\usepackage{amsmath,amssymb,amsthm}
\\usepackage{graphicx}
\\usepackage{hyperref}
\\usepackage[margin=1in]{geometry}
\\usepackage{setspace}
\\usepackage{fancyhdr}
\\usepackage[backend=biber,style=numeric]{biblatex}

\\onehalfspacing
\\pagestyle{fancy}

\\title{Thesis Title}
\\author{Your Name}
\\date{\\today}

\\begin{document}

\\maketitle

\\begin{abstract}
Your abstract here.
\\end{abstract}

\\tableofcontents
\\listoffigures
\\listoftables

\\chapter{Introduction}
\\section{Background}
\\section{Motivation}
\\section{Objectives}

\\chapter{Literature Review}

\\chapter{Methodology}

\\chapter{Results}

\\chapter{Discussion}

\\chapter{Conclusion}

\\printbibliography

\\appendix
\\chapter{Supplementary Material}

\\end{document}
` },
    { label: 'CV / Resume', content: `\\documentclass[11pt,a4paper]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[margin=0.75in]{geometry}
\\usepackage{enumitem}
\\usepackage{hyperref}
\\usepackage{titlesec}

\\titleformat{\\section}{\\Large\\bfseries}{}{0em}{}[\\titlerule]
\\titlespacing{\\section}{0pt}{12pt}{6pt}

\\pagestyle{empty}

\\begin{document}

\\begin{center}
  {\\LARGE\\bfseries Your Name}\\\\[4pt]
  your.email@example.com $\\cdot$ (555) 123-4567 $\\cdot$ City, State\\\\
  \\url{https://github.com/yourusername}
\\end{center}

\\section{Education}
\\textbf{University Name} \\hfill 2020 -- 2024\\\\
B.S. in Computer Science, GPA: 3.8/4.0

\\section{Experience}
\\textbf{Company Name} -- Software Engineer Intern \\hfill Summer 2023
\\begin{itemize}[leftmargin=*, nosep]
  \\item Accomplishment or responsibility
  \\item Another accomplishment
\\end{itemize}

\\section{Skills}
\\textbf{Languages:} Python, C++, JavaScript, \\LaTeX\\\\
\\textbf{Tools:} Git, Docker, Linux

\\section{Projects}
\\textbf{Project Name} \\hfill \\url{https://github.com/...}
\\begin{itemize}[leftmargin=*, nosep]
  \\item Description of the project and impact
\\end{itemize}

\\end{document}
` },
    { label: 'Minimal', content: `\\documentclass{article}
\\begin{document}

Hello, world!

\\end{document}
` },
];

const editorTheme = EditorView.theme({
    '&': { height: '100%', fontSize: '13px', backgroundColor: '#1e1e2e' },
    '.cm-content': {
        fontFamily: '"Fira Code", "JetBrains Mono", "Cascadia Code", Menlo, monospace',
        caretColor: '#89b4fa',
        padding: '8px 0',
        lineHeight: '1.6',
    },
    '.cm-cursor': { borderLeftColor: '#89b4fa', borderLeftWidth: '2px' },
    '& .cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
        backgroundColor: '#284f78',
    },
    '& .cm-activeLine, &.cm-focused .cm-activeLine': {
        backgroundColor: '#1e2030',
    },
    '& .cm-activeLineGutter': {
        backgroundColor: '#1e2030',
        color: '#a6adc8',
    },
    '.cm-gutters': {
        backgroundColor: '#181825',
        color: '#45475a',
        borderRight: '1px solid rgba(255,255,255,0.04)',
    },
    '.cm-lineNumbers .cm-gutterElement': { padding: '0 12px 0 16px', minWidth: '44px', fontSize: '11px' },
    '&.cm-focused .cm-matchingBracket': {
        backgroundColor: 'rgba(166, 227, 161, 0.2)',
        outline: '1px solid rgba(166, 227, 161, 0.4)',
        borderRadius: '2px',
    },
    '.cm-searchMatch': { backgroundColor: 'rgba(249, 226, 175, 0.25)', borderRadius: '2px' },
    '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'rgba(249, 226, 175, 0.45)' },
    '.cm-foldGutter .cm-gutterElement': { color: '#45475a', fontSize: '12px' },
    '.cm-foldGutter .cm-gutterElement:hover': { color: '#89b4fa' },
    '.cm-tooltip': { backgroundColor: '#1e1e2e', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px' },
    '.cm-tooltip-autocomplete': { backgroundColor: '#1e1e2e', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px' },
    '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: 'rgba(137, 180, 250, 0.15)', color: '#cdd6f4' },
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
    const paneData = contentDataRef.current[nodeId];
    const filePath = paneData?.contentId;

    // Restore content from contentDataRef if available (survives remounts from layout changes)
    const [content, setContentRaw] = useState(() => paneData?.fileContent || '');
    const [hasChangesRaw, setHasChangesRaw] = useState(() => paneData?.fileChanged || false);
    const hasChanges = hasChangesRaw;
    const setHasChanges = useCallback((val: boolean | ((prev: boolean) => boolean)) => {
        setHasChangesRaw(prev => {
            const next = typeof val === 'function' ? val(prev) : val;
            if (paneData) paneData.fileChanged = next;
            return next;
        });
    }, [paneData]);
    const [isSaving, setIsSaving] = useState(false);
    const [isCompiling, setIsCompiling] = useState(false);
    const [compileLog, setCompileLog] = useState('');
    const [compileStatus, setCompileStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(() => !paneData?.fileContent);

    // UI state
    const [activeMenu, setActiveMenu] = useState<string | null>(null);
    const [showSymbols, setShowSymbols] = useState(false);
    const [showLog, setShowLog] = useState(false);
    const [showOutline, setShowOutline] = useState(false);
    const editorRef = useRef<any>(null);
    const editorViewRef = useRef<any>(null);

    // Wrap setContent to always sync to contentDataRef so content survives remounts
    const setContent = useCallback((valOrFn: string | ((prev: string) => string)) => {
        setContentRaw(prev => {
            const next = typeof valOrFn === 'function' ? valOrFn(prev) : valOrFn;
            if (paneData) {
                paneData.fileContent = next;
            }
            return next;
        });
    }, [paneData]);

    // Document statistics
    const stats = useMemo(() => {
        const lines = content.split('\n').length;
        const words = content.trim() ? content.trim().split(/\s+/).length : 0;
        const chars = content.length;
        return { lines, words, chars };
    }, [content]);

    // Extract document outline (sections, subsections, figures, tables, labels, theorems, etc.)
    const outline = useMemo(() => {
        const items: { level: number; title: string; line: number; kind: string }[] = [];
        const lines = content.split('\n');
        lines.forEach((line, idx) => {
            // Sections
            const secMatch = line.match(/\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\*?\{([^}]+)\}/);
            if (secMatch) {
                const levels: Record<string, number> = { part: -1, chapter: 0, section: 1, subsection: 2, subsubsection: 3, paragraph: 4, subparagraph: 5 };
                items.push({ level: levels[secMatch[1]] ?? 1, title: secMatch[2], line: idx + 1, kind: secMatch[1] });
                return;
            }
            // Figures
            const figMatch = line.match(/\\begin\{figure\}/);
            if (figMatch) {
                // Look ahead for caption
                for (let j = idx; j < Math.min(idx + 15, lines.length); j++) {
                    const capMatch = lines[j].match(/\\caption\{([^}]+)\}/);
                    if (capMatch) { items.push({ level: 10, title: `Fig: ${capMatch[1]}`, line: idx + 1, kind: 'figure' }); return; }
                }
                items.push({ level: 10, title: 'Figure', line: idx + 1, kind: 'figure' });
                return;
            }
            // Tables
            const tabMatch = line.match(/\\begin\{table\}/);
            if (tabMatch) {
                for (let j = idx; j < Math.min(idx + 20, lines.length); j++) {
                    const capMatch = lines[j].match(/\\caption\{([^}]+)\}/);
                    if (capMatch) { items.push({ level: 10, title: `Tab: ${capMatch[1]}`, line: idx + 1, kind: 'table' }); return; }
                }
                items.push({ level: 10, title: 'Table', line: idx + 1, kind: 'table' });
                return;
            }
            // Theorems, lemmas, proofs, definitions, etc.
            const thmMatch = line.match(/\\begin\{(theorem|lemma|proof|definition|corollary|proposition|remark|example)\}/);
            if (thmMatch) {
                const name = thmMatch[1].charAt(0).toUpperCase() + thmMatch[1].slice(1);
                items.push({ level: 10, title: name, line: idx + 1, kind: 'theorem' });
                return;
            }
            // Labels
            const labelMatch = line.match(/\\label\{([^}]+)\}/);
            if (labelMatch) {
                items.push({ level: 11, title: `\\label{${labelMatch[1]}}`, line: idx + 1, kind: 'label' });
            }
        });
        return items;
    }, [content]);

    // Separate structural outline (sections only) for navigation
    const sectionOutline = useMemo(() => outline.filter(item => item.level <= 5), [outline]);

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

    // Save editor state (including undo history) on unmount so it survives layout changes
    useEffect(() => {
        return () => {
            const view = editorViewRef.current;
            if (view && paneData) {
                try {
                    paneData._editorStateJSON = view.state.toJSON({ history: history() });
                    paneData._cursorPos = view.state.selection.main.head;
                } catch (e) {
                    // Serialization might fail for some state extensions - that's OK
                }
            }
        };
    }, [nodeId]);

    // Load file — skip if contentDataRef already has content (remount after layout change)
    useEffect(() => {
        const load = async () => {
            if (!filePath) return;
            // If we already have content from a previous mount, don't reload from disk
            if (paneData?.fileContent && paneData.fileContent.length > 0) {
                setIsLoading(false);
                return;
            }
            setIsLoading(true);
            try {
                const text = await (window as any).api.readFileContent(filePath);
                if (text?.error) throw new Error(text.error);
                setContent(typeof text === 'string' ? text : text?.content ?? '');
                setHasChanges(false);
                if (paneData) paneData.fileChanged = false;
            } catch (e: any) {
                setError(e.message || String(e));
            } finally {
                setIsLoading(false);
            }
        };
        load();
    }, [filePath]);

    // Insert text at cursor, or wrap selection for formatting commands
    const insertAtCursor = useCallback((text: string) => {
        const view = editorViewRef.current;
        if (view) {
            const { from, to } = view.state.selection.main;
            const selectedText = view.state.sliceDoc(from, to);

            // Check if this is a wrapping command (e.g., \textbf{, \textit{, \underline{, etc.)
            const isWrappingCmd = text.endsWith('{') && selectedText.length > 0;

            if (isWrappingCmd) {
                // Wrap selection: \textbf{selected text}
                const wrapped = text + selectedText + '}';
                view.dispatch({
                    changes: { from, to, insert: wrapped },
                    selection: { anchor: from + text.length, head: from + text.length + selectedText.length },
                });
            } else {
                view.dispatch({
                    changes: { from, to, insert: text },
                    selection: { anchor: from + text.length },
                });
            }
            view.focus();
        } else {
            setContent(prev => prev + text);
        }
        setHasChanges(true);
        setActiveMenu(null);
    }, []);

    // Toggle line comment (%) on selected lines
    const toggleComment = useCallback(() => {
        const view = editorViewRef.current;
        if (!view) return;
        const { from, to } = view.state.selection.main;
        const startLine = view.state.doc.lineAt(from);
        const endLine = view.state.doc.lineAt(to);

        const lines: { from: number; to: number; text: string }[] = [];
        for (let pos = startLine.from; pos <= endLine.to;) {
            const line = view.state.doc.lineAt(pos);
            lines.push({ from: line.from, to: line.to, text: line.text });
            pos = line.to + 1;
            if (pos > view.state.doc.length) break;
        }

        const allCommented = lines.every(l => l.text.trimStart().startsWith('%'));
        const changes = lines.map(l => {
            if (allCommented) {
                const idx = l.text.indexOf('%');
                const removeLen = l.text[idx + 1] === ' ' ? 2 : 1;
                return { from: l.from + idx, to: l.from + idx + removeLen, insert: '' };
            } else {
                return { from: l.from, to: l.from, insert: '% ' };
            }
        });

        view.dispatch({ changes });
        view.focus();
        setHasChanges(true);
    }, []);

    // Wrap selected text (or insert empty) in a \begin{env}...\end{env} block
    const wrapInEnvironment = useCallback((envName: string) => {
        const view = editorViewRef.current;
        if (!view) {
            setContent(prev => prev + `\\begin{${envName}}\n\n\\end{${envName}}`);
            setHasChanges(true);
            setActiveMenu(null);
            return;
        }
        const { from, to } = view.state.selection.main;
        const selectedText = view.state.sliceDoc(from, to);
        const begin = `\\begin{${envName}}\n`;
        const end = `\n\\end{${envName}}`;
        const inner = selectedText || '  ';
        const full = begin + inner + end;
        view.dispatch({
            changes: { from, to, insert: full },
            selection: selectedText
                ? { anchor: from + begin.length, head: from + begin.length + selectedText.length }
                : { anchor: from + begin.length },
        });
        view.focus();
        setHasChanges(true);
        setActiveMenu(null);
    }, []);

    // Wrap selection in a block comment (\iffalse...\fi)
    const toggleBlockComment = useCallback(() => {
        const view = editorViewRef.current;
        if (!view) return;
        const { from, to } = view.state.selection.main;
        const selectedText = view.state.sliceDoc(from, to);

        // Check if selection is already block-commented
        if (selectedText.startsWith('\\iffalse\n') && selectedText.endsWith('\n\\fi')) {
            const inner = selectedText.slice('\\iffalse\n'.length, selectedText.length - '\n\\fi'.length);
            view.dispatch({
                changes: { from, to, insert: inner },
                selection: { anchor: from, head: from + inner.length },
            });
        } else {
            const wrapped = `\\iffalse\n${selectedText}\n\\fi`;
            view.dispatch({
                changes: { from, to, insert: wrapped },
                selection: { anchor: from + '\\iffalse\n'.length, head: from + '\\iffalse\n'.length + selectedText.length },
            });
        }
        view.focus();
        setHasChanges(true);
    }, []);

    // Handle snippet click: ENV: prefix triggers wrapInEnvironment, otherwise insertAtCursor
    const handleSnippetClick = useCallback((snippet: string) => {
        if (snippet.startsWith('ENV:')) {
            wrapInEnvironment(snippet.slice(4));
        } else {
            insertAtCursor(snippet);
        }
    }, [wrapInEnvironment, insertAtCursor]);

    // Go to line — scroll so the target line appears at the top of the editor
    const goToLine = useCallback((lineNum: number) => {
        const view = editorViewRef.current;
        if (view) {
            const line = view.state.doc.line(lineNum);
            view.dispatch({
                selection: { anchor: line.from },
                effects: EditorView.scrollIntoView(line.from, { y: 'start', yMargin: 5 }),
            });
            view.focus();
        }
    }, []);

    // Navigate to prev/next section
    const navigateSection = useCallback((direction: 'prev' | 'next') => {
        const view = editorViewRef.current;
        if (!view || sectionOutline.length === 0) return;
        const cursorLine = view.state.doc.lineAt(view.state.selection.main.head).number;
        let target: { line: number } | undefined;
        if (direction === 'next') {
            target = sectionOutline.find(item => item.line > cursorLine);
        } else {
            for (let i = sectionOutline.length - 1; i >= 0; i--) {
                if (sectionOutline[i].line < cursorLine) { target = sectionOutline[i]; break; }
            }
        }
        if (target) goToLine(target.line);
    }, [sectionOutline, goToLine]);

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

    // Autosave: debounced write to disk 3 seconds after last edit
    useEffect(() => {
        if (!hasChanges || !filePath || isSaving) return;
        const timer = setTimeout(async () => {
            try {
                await (window as any).api.writeFileContent(filePath, content);
                setHasChanges(false);
            } catch (e) {
                // Silent fail for autosave - user can still manual save
            }
        }, 3000);
        return () => clearTimeout(timer);
    }, [content, hasChanges, filePath, isSaving]);

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
            } else if (isCtrl && e.key === '/') {
                e.preventDefault();
                toggleComment();
            } else if (isCtrl && e.shiftKey && e.key.toLowerCase() === 'a') {
                e.preventDefault();
                toggleBlockComment();
            } else if (isCtrl && e.key.toLowerCase() === 'b') {
                e.preventDefault();
                insertAtCursor('\\textbf{');
            } else if (isCtrl && e.key.toLowerCase() === 'i') {
                e.preventDefault();
                insertAtCursor('\\textit{');
            } else if (isCtrl && e.key.toLowerCase() === 'u') {
                e.preventDefault();
                insertAtCursor('\\underline{');
            } else if (isCtrl && e.shiftKey && e.key.toLowerCase() === 'm') {
                e.preventDefault();
                insertAtCursor('$');
            } else if (isCtrl && e.shiftKey && e.key.toLowerCase() === 'e') {
                e.preventDefault();
                wrapInEnvironment('center');
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [save, compile, insertAtCursor, toggleComment, toggleBlockComment, wrapInEnvironment]);

    // Expose save/compile on paneData so PaneHeader buttons can call them
    useEffect(() => {
        const paneData = contentDataRef.current[nodeId];
        if (paneData) {
            paneData.onSave = save;
            paneData.onCompile = compile;
            paneData.hasChanges = hasChanges;
            paneData.fileChanged = hasChanges;
            paneData.isSaving = isSaving;
            paneData.isCompiling = isCompiling;
            paneData.compileStatus = compileStatus;
        }
    }, [nodeId, save, compile, hasChanges, isSaving, isCompiling, compileStatus, contentDataRef]);

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

    const ToolbarDivider = () => <div className="w-px h-5 bg-white/[0.06] mx-1" />;

    const ToolbarButton = ({ onClick, title, active, disabled, children }: any) => (
        <button
            onClick={onClick}
            title={title}
            disabled={disabled}
            className={`w-7 h-7 flex items-center justify-center rounded-md transition-all duration-150
                ${disabled ? 'opacity-25 cursor-default' : 'active:scale-90 text-gray-400 hover:text-gray-100'}
            `}
            style={active ? {
                background: 'linear-gradient(180deg, rgba(96,165,250,0.2) 0%, rgba(96,165,250,0.1) 100%)',
                color: '#93c5fd',
                boxShadow: 'inset 0 0 0 1px rgba(96,165,250,0.2), 0 0 8px rgba(96,165,250,0.08)',
            } : undefined}
            onMouseEnter={e => { if (!active && !disabled) e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; }}
            onMouseLeave={e => { if (!active && !disabled) e.currentTarget.style.background = 'transparent'; }}
        >
            {children}
        </button>
    );

    return (
        <div className="h-full flex flex-col overflow-hidden" style={{ background: '#1a1b26' }}>
            {/* Toolbar */}
            <div className="flex items-center gap-0.5 px-2 h-10 flex-shrink-0" style={{
                background: 'linear-gradient(180deg, #1c1d2b 0%, #16171f 100%)',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
            }}>
                {/* Outline toggle — leftmost */}
                <ToolbarButton onClick={() => setShowOutline(!showOutline)} title="Outline" active={showOutline}><PanelLeft size={14} /></ToolbarButton>

                <ToolbarDivider />

                {/* Templates dropdown — only when document is empty */}
                {content.trim().length === 0 && (
                    <>
                        <div className="relative dropdown-menu">
                            <button
                                onClick={(e) => { e.stopPropagation(); setActiveMenu(activeMenu === 'templates' ? null : 'templates'); }}
                                className={`h-7 px-2.5 text-[11px] rounded-md flex items-center gap-1.5 transition-all duration-150
                                    ${activeMenu === 'templates'
                                        ? 'bg-gradient-to-b from-violet-500/25 to-violet-600/15 text-violet-300 shadow-[inset_0_0_0_1px_rgba(139,92,246,0.3)]'
                                        : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.07]'}`}
                            >
                                <FileText size={12} />
                                <span>Templates</span>
                                <ChevronDown size={9} className="opacity-50" />
                            </button>
                            {activeMenu === 'templates' && (
                                <div className="absolute top-full left-0 mt-1.5 rounded-xl shadow-2xl z-50 min-w-[160px] py-1.5 border border-white/[0.1] backdrop-blur-xl overflow-hidden"
                                    style={{ background: 'linear-gradient(180deg, #242538 0%, #1e1f2e 100%)' }}>
                                    {TEMPLATES.map(t => (
                                        <button key={t.label} onClick={() => applyTemplate(t.content)}
                                            className="w-full px-3 py-2 text-left text-[11px] text-gray-300 hover:bg-gradient-to-r hover:from-violet-500/10 hover:to-transparent hover:text-white transition-all duration-100">
                                            {t.label}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        <ToolbarDivider />
                    </>
                )}

                {/* Quick format */}
                <ToolbarButton onClick={() => insertAtCursor('\\textbf{')} title="Bold (Ctrl+B)"><Bold size={14} /></ToolbarButton>
                <ToolbarButton onClick={() => insertAtCursor('\\textit{')} title="Italic (Ctrl+I)"><Italic size={14} /></ToolbarButton>
                <ToolbarButton onClick={() => insertAtCursor('\\underline{')} title="Underline (Ctrl+U)"><UnderlineIcon size={14} /></ToolbarButton>
                <ToolbarButton onClick={() => insertAtCursor('\\texttt{')} title="Monospace"><Code size={14} /></ToolbarButton>

                <ToolbarDivider />

                {/* Comment toggle */}
                <ToolbarButton onClick={toggleComment} title="Toggle Comment (Ctrl+/)">
                    <span className="text-[13px] font-mono font-bold leading-none">%</span>
                </ToolbarButton>

                <ToolbarDivider />

                {/* Section nav */}
                <ToolbarButton onClick={() => navigateSection('prev')} title="Previous section" disabled={sectionOutline.length === 0}><ChevronUp size={14} /></ToolbarButton>
                <ToolbarButton onClick={() => navigateSection('next')} title="Next section" disabled={sectionOutline.length === 0}><ChevronDown size={14} /></ToolbarButton>

                <ToolbarDivider />

                {/* Snippet menus */}
                {Object.entries(SNIPPETS).map(([cat, items]) => {
                    const icons: Record<string, any> = { structure: Hash, format: AlignLeft, math: Sigma, insert: Braces, references: Link };
                    const colors: Record<string, string> = { structure: '#c084fc', format: '#f472b6', math: '#60a5fa', insert: '#4ade80', references: '#fbbf24' };
                    const Icon = icons[cat] || FileText;
                    const accentColor = colors[cat] || '#60a5fa';
                    return (
                        <div key={cat} className="relative dropdown-menu">
                            <button
                                onClick={(e) => { e.stopPropagation(); setActiveMenu(activeMenu === cat ? null : cat); }}
                                className={`h-7 px-2 text-[11px] rounded-md flex items-center gap-1.5 transition-all duration-150
                                    ${activeMenu === cat ? 'text-white' : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.07]'}`}
                                style={activeMenu === cat ? {
                                    background: `linear-gradient(180deg, ${accentColor}22 0%, ${accentColor}11 100%)`,
                                    boxShadow: `inset 0 0 0 1px ${accentColor}33`,
                                    color: accentColor,
                                } : undefined}
                            >
                                <Icon size={12} />
                                <span className="capitalize">{cat}</span>
                                <ChevronDown size={9} className="opacity-40" />
                            </button>
                            {activeMenu === cat && (
                                <div className="absolute top-full left-0 mt-1.5 rounded-xl shadow-2xl z-50 min-w-[190px] py-1.5 max-h-80 overflow-y-auto border overflow-hidden backdrop-blur-xl"
                                    style={{
                                        background: 'linear-gradient(180deg, #242538 0%, #1e1f2e 100%)',
                                        borderColor: `${accentColor}22`,
                                    }}>
                                    {items.map(item => (
                                        <button
                                            key={item.label}
                                            onClick={() => handleSnippetClick(item.snippet)}
                                            className="w-full px-3 py-1.5 text-left text-[11px] text-gray-300 hover:text-white flex items-center gap-2.5 transition-all duration-100"
                                            style={{ }}
                                            onMouseEnter={e => (e.currentTarget.style.background = `linear-gradient(90deg, ${accentColor}12 0%, transparent 100%)`)}
                                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                        >
                                            <item.icon size={12} className="flex-shrink-0" style={{ color: `${accentColor}99` }} />
                                            <span>{item.label}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}

                <div className="flex-1" />

                {/* Compile button */}
                <button
                    onClick={() => compile(true)}
                    disabled={isCompiling}
                    className="h-7 px-3 text-[11px] rounded-md flex items-center gap-1.5 transition-all duration-150 font-medium"
                    style={{
                        background: isCompiling
                            ? 'rgba(96,165,250,0.15)'
                            : 'linear-gradient(180deg, rgba(96,165,250,0.2) 0%, rgba(96,165,250,0.1) 100%)',
                        color: '#93c5fd',
                        boxShadow: 'inset 0 0 0 1px rgba(96,165,250,0.2)',
                    }}
                    onMouseEnter={e => !isCompiling && (e.currentTarget.style.background = 'linear-gradient(180deg, rgba(96,165,250,0.3) 0%, rgba(96,165,250,0.15) 100%)')}
                    onMouseLeave={e => !isCompiling && (e.currentTarget.style.background = 'linear-gradient(180deg, rgba(96,165,250,0.2) 0%, rgba(96,165,250,0.1) 100%)')}
                >
                    {isCompiling ? <Loader size={12} className="animate-spin" /> : <Play size={12} />}
                    <span>{isCompiling ? 'Building...' : 'Build'}</span>
                </button>

                <ToolbarDivider />

                {/* Symbols toggle */}
                <ToolbarButton onClick={() => setShowSymbols(!showSymbols)} title="Math Symbols" active={showSymbols}><Sigma size={14} /></ToolbarButton>

                {/* Stats pill */}
                <div className="flex items-center gap-2 ml-1.5 px-2.5 h-6 rounded-full text-[10px] text-gray-500 tabular-nums"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.04)' }}>
                    <span>{stats.lines} <span className="text-gray-600">ln</span></span>
                    <span className="w-px h-3 bg-white/[0.06]" />
                    <span>{stats.words} <span className="text-gray-600">w</span></span>
                </div>
            </div>

            {/* Main content */}
            <div className="flex-1 flex min-h-0 overflow-hidden">
                {/* Outline panel */}
                {showOutline && (
                    <div className="w-56 flex flex-col flex-shrink-0 overflow-hidden" style={{
                        background: 'linear-gradient(180deg, #181925 0%, #14151d 100%)',
                        borderRight: '1px solid rgba(255,255,255,0.06)',
                    }}>
                        <div className="flex items-center justify-between px-3 h-9 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                            <div className="flex items-center gap-2">
                                <BookOpen size={11} className="text-violet-400/70" />
                                <span className="text-[10px] font-semibold text-gray-300 tracking-wider uppercase">Outline</span>
                            </div>
                            <span className="text-[9px] text-gray-600 tabular-nums px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.04)' }}>{sectionOutline.length}</span>
                        </div>
                        {outline.length === 0 ? (
                            <div className="p-4 text-[11px] text-gray-600 leading-relaxed">
                                No sections yet.<br />
                                Add <code className="px-1.5 py-0.5 rounded text-[10px] text-violet-400/80" style={{ background: 'rgba(139,92,246,0.1)' }}>\section{'{}'}</code> to get started.
                            </div>
                        ) : (
                            <div className="flex-1 overflow-y-auto py-1.5 px-1">
                                {outline.map((item, i) => {
                                    const kindStyles: Record<string, { color: string; icon: any }> = {
                                        figure: { color: '#4ade80', icon: Image },
                                        table: { color: '#60a5fa', icon: Table },
                                        theorem: { color: '#c084fc', icon: BookOpen },
                                        label: { color: '#6b7280', icon: Hash },
                                    };
                                    const style = kindStyles[item.kind];
                                    const isSection = item.level <= 5;
                                    const indent = isSection ? 10 + Math.max(0, item.level) * 14 : 22;
                                    const isChapter = item.level <= 0;
                                    return (
                                        <button
                                            key={i}
                                            onClick={() => goToLine(item.line)}
                                            className="w-full text-left py-1.5 px-1.5 flex items-center gap-2 rounded-lg transition-all duration-100 hover:bg-white/[0.05] active:bg-white/[0.1] group"
                                            style={{ paddingLeft: indent }}
                                            title={`Line ${item.line}`}
                                        >
                                            {style?.icon && React.createElement(style.icon, { size: 11, style: { color: style.color }, className: 'flex-shrink-0 opacity-80 group-hover:opacity-100' })}
                                            {isSection && !style && <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: isChapter ? '#c084fc' : 'rgba(255,255,255,0.15)' }} />}
                                            <span className={`truncate text-[11px] ${isChapter ? 'font-semibold text-gray-200' : isSection ? 'text-gray-400 group-hover:text-gray-200' : 'text-gray-600 group-hover:text-gray-400'} ${item.kind === 'label' ? 'font-mono text-[10px]' : ''}`}
                                                style={style?.color && !isSection ? { color: style.color } : undefined}
                                            >
                                                {item.title}
                                            </span>
                                            <span className="ml-auto text-[9px] text-gray-700 group-hover:text-gray-500 tabular-nums flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">{item.line}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* Editor */}
                <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
                    {isCompiling && (
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-10 backdrop-blur-sm">
                            <div className="rounded-2xl p-6 flex items-center gap-5 shadow-2xl border border-white/[0.08]"
                                style={{ background: 'linear-gradient(135deg, #1e1f2e 0%, #232440 100%)' }}>
                                <div className="relative">
                                    <Loader size={24} className="animate-spin text-blue-400" />
                                    <div className="absolute inset-0 rounded-full" style={{ background: 'radial-gradient(circle, rgba(96,165,250,0.15) 0%, transparent 70%)' }} />
                                </div>
                                <div>
                                    <div className="text-sm font-semibold text-white">Compiling...</div>
                                    <div className="text-[11px] text-gray-500 mt-0.5">Running pdflatex</div>
                                </div>
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
                            initialState={paneData?._editorStateJSON ? {
                                json: paneData._editorStateJSON,
                                fields: { history: history() },
                            } : undefined}
                        />
                    </div>
                </div>

                {/* Symbols panel */}
                {showSymbols && (
                    <div className="w-52 flex flex-col flex-shrink-0 overflow-hidden" style={{
                        background: 'linear-gradient(180deg, #181925 0%, #14151d 100%)',
                        borderLeft: '1px solid rgba(255,255,255,0.06)',
                    }}>
                        <div className="flex items-center gap-2 px-3 h-9 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                            <Sigma size={11} className="text-blue-400/70" />
                            <span className="text-[10px] font-semibold text-gray-300 tracking-wider uppercase">Symbols</span>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2">
                            <div className="grid grid-cols-5 gap-0.5">
                                {MATH_SYMBOLS.map(sym => (
                                    <button
                                        key={sym.cmd}
                                        onClick={() => insertAtCursor(sym.cmd)}
                                        className="aspect-square flex items-center justify-center text-[15px] rounded-lg text-gray-400 transition-all duration-100"
                                        style={{ }}
                                        title={sym.cmd}
                                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(96,165,250,0.1)'; e.currentTarget.style.color = '#93c5fd'; e.currentTarget.style.transform = 'scale(1.15)'; }}
                                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#9ca3af'; e.currentTarget.style.transform = 'scale(1)'; }}
                                    >
                                        {sym.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Build log */}
            {showLog && (
                <div className="flex flex-col flex-shrink-0" style={{
                    background: 'linear-gradient(180deg, #151620 0%, #111218 100%)',
                    borderTop: '1px solid rgba(255,255,255,0.06)',
                }}>
                    <div className="flex items-center justify-between px-3 h-8" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <div className="flex items-center gap-2.5">
                            <Terminal size={12} className="text-gray-500" />
                            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Build Output</span>
                            {compileStatus === 'success' && (
                                <span className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full"
                                    style={{ background: 'rgba(52,211,153,0.1)', color: '#6ee7b7', border: '1px solid rgba(52,211,153,0.15)' }}>
                                    <CheckCircle size={10} /> OK
                                </span>
                            )}
                            {compileStatus === 'error' && (
                                <span className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full"
                                    style={{ background: 'rgba(239,68,68,0.1)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.15)' }}>
                                    <AlertCircle size={10} /> {parseErrors.length} {parseErrors.length === 1 ? 'error' : 'errors'}
                                </span>
                            )}
                        </div>
                        <button onClick={() => setShowLog(false)} className="w-5 h-5 flex items-center justify-center rounded-md hover:bg-white/[0.07] text-gray-500 hover:text-gray-300 transition-colors">
                            <X size={11} />
                        </button>
                    </div>
                    <div className="max-h-28 overflow-auto px-3 py-2 font-mono text-[10px] leading-relaxed">
                        {compileLog ? (
                            <pre className="whitespace-pre-wrap text-gray-500">{compileLog}</pre>
                        ) : (
                            <div className="text-gray-600 py-1">Press <kbd className="px-1.5 py-0.5 rounded-md text-[9px] text-gray-400 font-medium" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.06)' }}>Ctrl+Enter</kbd> to compile</div>
                        )}
                    </div>
                    {parseErrors.length > 0 && (
                        <div className="px-2 pb-2 space-y-1" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                            {parseErrors.slice(0, 5).map((err, i) => (
                                <button
                                    key={i}
                                    onClick={() => goToLine(err.line)}
                                    className="w-full text-left px-2.5 py-1.5 text-[11px] rounded-lg flex items-center gap-2 transition-all duration-100"
                                    style={{ background: 'rgba(239,68,68,0.08)', color: '#f87171', border: '1px solid rgba(239,68,68,0.08)' }}
                                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.14)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.2)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.08)'; }}
                                >
                                    <AlertCircle size={11} className="flex-shrink-0" />
                                    <span className="font-mono text-[10px] font-semibold">L{err.line}</span>
                                    <span className="truncate">{err.message}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Status bar */}
            <div className="flex items-center justify-between px-3 h-6 flex-shrink-0 text-[10px]" style={{
                background: 'linear-gradient(90deg, #111218 0%, #13141e 100%)',
                borderTop: '1px solid rgba(255,255,255,0.04)',
            }}>
                <div className="flex items-center gap-2">
                    {error && <span className="text-red-400 truncate max-w-[200px] flex items-center gap-1"><AlertCircle size={10} /> {error}</span>}
                    {!error && hasChanges && (
                        <span className="text-amber-400/90 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                            Modified
                        </span>
                    )}
                    {!error && !hasChanges && (
                        <span className="text-emerald-400/60 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/60" />
                            Saved
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2 text-gray-600">
                    {[
                        ['Ctrl+S', 'save'],
                        ['Ctrl+Enter', 'build'],
                        ['Ctrl+/', '%'],
                        ['Ctrl+B', 'bold'],
                    ].map(([key, label]) => (
                        <span key={label} className="flex items-center gap-0.5">
                            <kbd className="px-1 py-px rounded text-[9px] text-gray-500/80 font-mono" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.04)' }}>{key}</kbd>
                            <span className="text-gray-600/70 text-[9px]">{label}</span>
                        </span>
                    ))}
                </div>
            </div>
        </div>
    );
};

// Custom comparison to prevent reload on pane resize
const arePropsEqual = (prevProps: any, nextProps: any) => {
    return prevProps.nodeId === nextProps.nodeId;
};

export default memo(LatexViewer, arePropsEqual);
