import { getFileName } from './utils';
import React, { useEffect, useState, useCallback, useMemo, memo, useRef } from 'react';
import {
    Save, Play, ExternalLink, X, SplitSquareHorizontal, Loader, ChevronDown,
    Table, Image, List, Link, FileText, Code, Sigma, Layout, Quote, Hash,
    AlertCircle, CheckCircle, Check, Pencil, ZoomIn, ZoomOut, Search, Replace, Undo, Redo,
    AlignLeft, Braces, RefreshCw, Download, Settings, BookOpen, Eye, EyeOff,
    Maximize2, Minimize2, FileCode, Terminal, ChevronRight, ChevronUp,
    Bold, Italic, Underline as UnderlineIcon, Type, MessageSquare, PanelLeft,
    ChevronLeft, ChevronsUpDown
} from 'lucide-react';
import CodeMirror from '@uiw/react-codemirror';
import { EditorView, ViewPlugin, lineNumbers, highlightActiveLineGutter, highlightActiveLine, drawSelection, dropCursor, rectangularSelection, crosshairCursor, highlightSpecialChars } from '@codemirror/view';
import { keymap } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap, indentWithTab, undo, redo } from '@codemirror/commands';
import { HighlightStyle, syntaxHighlighting, indentOnInput, bracketMatching, foldGutter, foldKeymap, StreamLanguage } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap, type CompletionContext } from '@codemirror/autocomplete';
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

const latexHighlightStyleDark = HighlightStyle.define([
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

const latexHighlightStyleLight = HighlightStyle.define([
    { tag: t.keyword, color: '#7c3aed', fontWeight: 'bold' },
    { tag: t.function(t.variableName), color: '#2563eb' },
    { tag: t.typeName, color: '#b45309' },
    { tag: t.comment, color: '#94a3b8', fontStyle: 'italic' },
    { tag: t.number, color: '#c2410c' },
    { tag: t.operator, color: '#0d9488' },
    { tag: t.escape, color: '#16a34a' },
    { tag: t.bracket, color: '#db2777' },
    { tag: t.squareBracket, color: '#16a34a' },
    { tag: t.link, color: '#0891b2', textDecoration: 'underline' },
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

const editorThemeDark = EditorView.theme({
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

const editorThemeLight = EditorView.theme({
    '&': { height: '100%', fontSize: '13px', backgroundColor: 'var(--theme-bg)' },
    '.cm-content': {
        fontFamily: '"Fira Code", "JetBrains Mono", "Cascadia Code", Menlo, monospace',
        caretColor: '#2563eb',
        padding: '8px 0',
        lineHeight: '1.6',
    },
    '.cm-cursor': { borderLeftColor: '#2563eb', borderLeftWidth: '2px' },
    '& .cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
        backgroundColor: 'rgba(37, 99, 235, 0.15)',
    },
    '& .cm-activeLine, &.cm-focused .cm-activeLine': {
        backgroundColor: 'rgba(0, 0, 0, 0.04)',
    },
    '& .cm-activeLineGutter': {
        backgroundColor: 'rgba(0, 0, 0, 0.04)',
        color: '#475569',
    },
    '.cm-gutters': {
        backgroundColor: 'var(--theme-bg-secondary)',
        color: '#94a3b8',
        borderRight: '1px solid var(--theme-border)',
    },
    '.cm-lineNumbers .cm-gutterElement': { padding: '0 12px 0 16px', minWidth: '44px', fontSize: '11px' },
    '&.cm-focused .cm-matchingBracket': {
        backgroundColor: 'rgba(16, 163, 127, 0.15)',
        outline: '1px solid rgba(16, 163, 127, 0.4)',
        borderRadius: '2px',
    },
    '.cm-searchMatch': { backgroundColor: 'rgba(245, 158, 11, 0.2)', borderRadius: '2px' },
    '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'rgba(245, 158, 11, 0.4)' },
    '.cm-foldGutter .cm-gutterElement': { color: '#94a3b8', fontSize: '12px' },
    '.cm-foldGutter .cm-gutterElement:hover': { color: '#2563eb' },
    '.cm-tooltip': { backgroundColor: 'var(--theme-bg)', border: '1px solid var(--theme-border)', borderRadius: '8px' },
    '.cm-tooltip-autocomplete': { backgroundColor: 'var(--theme-bg)', border: '1px solid var(--theme-border)', borderRadius: '8px' },
    '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: 'rgba(37, 99, 235, 0.1)', color: '#1e293b' },
});

const LatexViewer = ({
    nodeId,
    contentDataRef,
    findNodePath,
    rootLayoutNode,
    setDraggedItem,
    setPaneContextMenu,
    closeContentPane,
    performSplit,
    onToggleZen,
    isZenMode,
    onClose,
    renamingPaneId,
    setRenamingPaneId,
    editedFileName,
    setEditedFileName,
    handleConfirmRename,
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
    const [isDarkMode, setIsDarkMode] = useState(() => !document.body.classList.contains('light-mode'));
    const [isCompact, setIsCompact] = useState(false);
    const [showSavedFlash, setShowSavedFlash] = useState(false);
    const [openPdfOnBuild, setOpenPdfOnBuild] = useState(() => localStorage.getItem('latex_openPdfOnBuild') !== 'false');
    const resizeObserverRef = useRef<ResizeObserver | null>(null);
    const toolbarRef = useCallback((node: HTMLDivElement | null) => {
        if (resizeObserverRef.current) {
            resizeObserverRef.current.disconnect();
            resizeObserverRef.current = null;
        }
        if (node) {
            const observer = new ResizeObserver(entries => {
                for (const entry of entries) {
                    setIsCompact(entry.contentRect.width < 1040);
                }
            });
            observer.observe(node);
            resizeObserverRef.current = observer;
        }
    }, []);
    const editorRef = useRef<any>(null);
    const editorViewRef = useRef<any>(null);

    // Watch for light/dark mode changes
    useEffect(() => {
        const observer = new MutationObserver(() => {
            setIsDarkMode(!document.body.classList.contains('light-mode'));
        });
        observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
        return () => observer.disconnect();
    }, []);

    // Bibliography state
    const [bibFilePath, setBibFilePath] = useState<string | null>(null);
    const [bibEntries, setBibEntries] = useState<{ key: string; title?: string; author?: string; year?: string }[]>([]);
    const [availableBibFiles, setAvailableBibFiles] = useState<string[]>([]);
    const bibEntriesRef = useRef(bibEntries);
    bibEntriesRef.current = bibEntries;

    // Scan for .bib files in the same directory
    useEffect(() => {
        if (!filePath) return;
        const dir = filePath.substring(0, filePath.lastIndexOf('/')) || filePath.substring(0, filePath.lastIndexOf('\\'));
        if (!dir) return;
        (async () => {
            try {
                const result = await (window as any).api?.readDir?.(dir);
                if (result?.files) {
                    const bibs = result.files.filter((f: any) => (f.name || f).endsWith('.bib')).map((f: any) => f.name || f);
                    setAvailableBibFiles(bibs);
                    // Auto-select first .bib if none selected
                    if (!bibFilePath && bibs.length > 0) {
                        setBibFilePath(dir + '/' + bibs[0]);
                    }
                }
            } catch (err) {
                // Directory listing may not be available
            }
        })();
    }, [filePath]);

    // Load bib entries when bibFilePath changes
    useEffect(() => {
        if (!bibFilePath) { setBibEntries([]); return; }
        (async () => {
            try {
                const result = await (window as any).api?.readFile?.(bibFilePath);
                const text = typeof result === 'string' ? result : result?.content || '';
                if (!text) return;
                // Simple .bib parser: extract @type{key, title, author, year}
                const entries: { key: string; title?: string; author?: string; year?: string }[] = [];
                const entryRegex = /@\w+\s*\{\s*([^,\s]+)\s*,([^@]*)/g;
                let match;
                while ((match = entryRegex.exec(text)) !== null) {
                    const key = match[1];
                    const body = match[2];
                    const getField = (field: string) => {
                        const m = new RegExp(field + '\\s*=\\s*[{"]([^}"]*)[}"]', 'i').exec(body);
                        return m ? m[1] : undefined;
                    };
                    entries.push({ key, title: getField('title'), author: getField('author'), year: getField('year') });
                }
                setBibEntries(entries);
            } catch (err) {
                console.error('Failed to load bib file:', err);
                setBibEntries([]);
            }
        })();
    }, [bibFilePath]);

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
        let inCommentBlock = false;
        lines.forEach((line, idx) => {
            const trimmed = line.trimStart();
            // Track \iffalse...\fi comment blocks
            if (trimmed.startsWith('\\iffalse')) { inCommentBlock = true; return; }
            if (inCommentBlock) { if (trimmed.startsWith('\\fi')) inCommentBlock = false; return; }
            // Skip commented-out lines
            if (trimmed.startsWith('%')) return;
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
        if (!compileLog) return errors;

        // Standard line errors: l.XX message
        const lineRegex = /^l\.(\d+)\s+(.+)$/gm;
        let match;
        while ((match = lineRegex.exec(compileLog)) !== null) {
            errors.push({ line: parseInt(match[1]), message: match[2] });
        }

        // LaTeX errors: ! error message (missing packages, classes, etc.)
        const bangRegex = /^!\s+(.+)$/gm;
        while ((match = bangRegex.exec(compileLog)) !== null) {
            const msg = match[1].trim();
            // Skip if already captured as a line error
            if (!errors.some(e => e.message.includes(msg))) {
                errors.push({ line: 0, message: msg });
            }
        }

        // Package/class not found: File `foo.sty' not found / File `foo.cls' not found
        const fileNotFoundRegex = /File [`']([^']+)' not found/gi;
        while ((match = fileNotFoundRegex.exec(compileLog)) !== null) {
            const msg = `Missing file: ${match[1]}`;
            if (!errors.some(e => e.message === msg)) {
                errors.push({ line: 0, message: msg });
            }
        }

        return errors;
    }, [compileLog]);

    // LaTeX command autocompletion: triggers when typing \
    const latexCommandCompletion = useCallback((context: CompletionContext) => {
        const before = context.matchBefore(/\\[a-zA-Z]*/);
        if (!before || before.text.length < 1) return null;
        // Don't trigger inside \cite{...} — that's handled by citation completion
        const lineText = context.state.doc.lineAt(context.pos).text;
        const upToCursor = lineText.slice(0, context.pos - context.state.doc.lineAt(context.pos).from);
        if (/\\(?:cite|textcite|parencite|autocite|citet|citep|nocite)\{[^}]*$/.test(upToCursor)) return null;

        const commands: { label: string; detail?: string; type: string; boost?: number }[] = [
            // Sectioning
            { label: '\\section{}', detail: 'Section', type: 'keyword', boost: 10 },
            { label: '\\subsection{}', detail: 'Subsection', type: 'keyword', boost: 9 },
            { label: '\\subsubsection{}', detail: 'Subsubsection', type: 'keyword', boost: 8 },
            { label: '\\chapter{}', detail: 'Chapter', type: 'keyword', boost: 7 },
            { label: '\\paragraph{}', detail: 'Paragraph', type: 'keyword' },
            { label: '\\part{}', detail: 'Part', type: 'keyword' },
            // Formatting
            { label: '\\textbf{}', detail: 'Bold', type: 'function', boost: 9 },
            { label: '\\textit{}', detail: 'Italic', type: 'function', boost: 9 },
            { label: '\\underline{}', detail: 'Underline', type: 'function', boost: 8 },
            { label: '\\emph{}', detail: 'Emphasis', type: 'function', boost: 7 },
            { label: '\\texttt{}', detail: 'Monospace', type: 'function' },
            { label: '\\textsc{}', detail: 'Small Caps', type: 'function' },
            { label: '\\textsf{}', detail: 'Sans Serif', type: 'function' },
            { label: '\\textsl{}', detail: 'Slanted', type: 'function' },
            { label: '\\textrm{}', detail: 'Roman', type: 'function' },
            // Font size
            { label: '\\tiny', detail: 'Tiny size', type: 'property' },
            { label: '\\scriptsize', detail: 'Script size', type: 'property' },
            { label: '\\footnotesize', detail: 'Footnote size', type: 'property' },
            { label: '\\small', detail: 'Small size', type: 'property' },
            { label: '\\normalsize', detail: 'Normal size', type: 'property' },
            { label: '\\large', detail: 'Large size', type: 'property' },
            { label: '\\Large', detail: 'Larger size', type: 'property' },
            { label: '\\LARGE', detail: 'Even larger', type: 'property' },
            { label: '\\huge', detail: 'Huge size', type: 'property' },
            { label: '\\Huge', detail: 'Largest size', type: 'property' },
            // Environments
            { label: '\\begin{}', detail: 'Begin environment', type: 'keyword', boost: 10 },
            { label: '\\end{}', detail: 'End environment', type: 'keyword', boost: 10 },
            // Math
            { label: '\\frac{}{}', detail: 'Fraction', type: 'function', boost: 6 },
            { label: '\\sqrt{}', detail: 'Square root', type: 'function' },
            { label: '\\sum', detail: 'Summation', type: 'function' },
            { label: '\\int', detail: 'Integral', type: 'function' },
            { label: '\\prod', detail: 'Product', type: 'function' },
            { label: '\\lim', detail: 'Limit', type: 'function' },
            { label: '\\infty', detail: 'Infinity', type: 'constant' },
            { label: '\\alpha', detail: 'Greek: alpha', type: 'constant' },
            { label: '\\beta', detail: 'Greek: beta', type: 'constant' },
            { label: '\\gamma', detail: 'Greek: gamma', type: 'constant' },
            { label: '\\delta', detail: 'Greek: delta', type: 'constant' },
            { label: '\\epsilon', detail: 'Greek: epsilon', type: 'constant' },
            { label: '\\lambda', detail: 'Greek: lambda', type: 'constant' },
            { label: '\\mu', detail: 'Greek: mu', type: 'constant' },
            { label: '\\sigma', detail: 'Greek: sigma', type: 'constant' },
            { label: '\\theta', detail: 'Greek: theta', type: 'constant' },
            { label: '\\pi', detail: 'Greek: pi', type: 'constant' },
            { label: '\\omega', detail: 'Greek: omega', type: 'constant' },
            { label: '\\phi', detail: 'Greek: phi', type: 'constant' },
            { label: '\\psi', detail: 'Greek: psi', type: 'constant' },
            { label: '\\mathbb{}', detail: 'Blackboard bold', type: 'function' },
            { label: '\\mathcal{}', detail: 'Calligraphic', type: 'function' },
            { label: '\\mathrm{}', detail: 'Roman in math', type: 'function' },
            { label: '\\mathbf{}', detail: 'Bold math', type: 'function' },
            { label: '\\vec{}', detail: 'Vector arrow', type: 'function' },
            { label: '\\hat{}', detail: 'Hat accent', type: 'function' },
            { label: '\\bar{}', detail: 'Bar accent', type: 'function' },
            { label: '\\tilde{}', detail: 'Tilde accent', type: 'function' },
            { label: '\\dot{}', detail: 'Dot accent', type: 'function' },
            { label: '\\ddot{}', detail: 'Double dot', type: 'function' },
            { label: '\\left', detail: 'Auto-sizing left', type: 'keyword' },
            { label: '\\right', detail: 'Auto-sizing right', type: 'keyword' },
            { label: '\\leq', detail: 'Less or equal', type: 'constant' },
            { label: '\\geq', detail: 'Greater or equal', type: 'constant' },
            { label: '\\neq', detail: 'Not equal', type: 'constant' },
            { label: '\\approx', detail: 'Approximately', type: 'constant' },
            { label: '\\equiv', detail: 'Equivalent', type: 'constant' },
            { label: '\\subset', detail: 'Subset', type: 'constant' },
            { label: '\\supset', detail: 'Superset', type: 'constant' },
            { label: '\\in', detail: 'Element of', type: 'constant' },
            { label: '\\forall', detail: 'For all', type: 'constant' },
            { label: '\\exists', detail: 'Exists', type: 'constant' },
            { label: '\\partial', detail: 'Partial deriv', type: 'constant' },
            { label: '\\nabla', detail: 'Nabla/Del', type: 'constant' },
            { label: '\\cdot', detail: 'Center dot', type: 'constant' },
            { label: '\\times', detail: 'Times', type: 'constant' },
            { label: '\\rightarrow', detail: 'Right arrow', type: 'constant' },
            { label: '\\leftarrow', detail: 'Left arrow', type: 'constant' },
            { label: '\\Rightarrow', detail: 'Double right arrow', type: 'constant' },
            { label: '\\Leftarrow', detail: 'Double left arrow', type: 'constant' },
            // References
            { label: '\\label{}', detail: 'Label', type: 'keyword', boost: 6 },
            { label: '\\ref{}', detail: 'Reference', type: 'keyword', boost: 6 },
            { label: '\\eqref{}', detail: 'Equation ref', type: 'keyword' },
            { label: '\\pageref{}', detail: 'Page reference', type: 'keyword' },
            { label: '\\cite{}', detail: 'Citation', type: 'keyword', boost: 8 },
            { label: '\\textcite{}', detail: 'Text citation', type: 'keyword' },
            { label: '\\parencite{}', detail: 'Paren citation', type: 'keyword' },
            { label: '\\autocite{}', detail: 'Auto citation', type: 'keyword' },
            { label: '\\footcite{}', detail: 'Footnote cite', type: 'keyword' },
            // Lists / structure
            { label: '\\item', detail: 'List item', type: 'keyword', boost: 7 },
            { label: '\\footnote{}', detail: 'Footnote', type: 'function' },
            { label: '\\caption{}', detail: 'Caption', type: 'function' },
            // Includes / preamble
            { label: '\\usepackage{}', detail: 'Use package', type: 'keyword', boost: 5 },
            { label: '\\documentclass{}', detail: 'Document class', type: 'keyword', boost: 5 },
            { label: '\\input{}', detail: 'Input file', type: 'keyword' },
            { label: '\\include{}', detail: 'Include file', type: 'keyword' },
            { label: '\\bibliography{}', detail: 'Bibliography', type: 'keyword' },
            { label: '\\bibliographystyle{}', detail: 'Bib style', type: 'keyword' },
            // Spacing / breaks
            { label: '\\newline', detail: 'New line', type: 'keyword' },
            { label: '\\newpage', detail: 'New page', type: 'keyword' },
            { label: '\\hspace{}', detail: 'Horizontal space', type: 'function' },
            { label: '\\vspace{}', detail: 'Vertical space', type: 'function' },
            { label: '\\noindent', detail: 'No indent', type: 'keyword' },
            // Figures / tables
            { label: '\\includegraphics{}', detail: 'Include image', type: 'function', boost: 6 },
            { label: '\\centering', detail: 'Center content', type: 'keyword' },
            { label: '\\hline', detail: 'Horizontal line', type: 'keyword' },
            { label: '\\multicolumn{}{}{}', detail: 'Multi column', type: 'function' },
            { label: '\\title{}', detail: 'Title', type: 'keyword' },
            { label: '\\author{}', detail: 'Author', type: 'keyword' },
            { label: '\\date{}', detail: 'Date', type: 'keyword' },
            { label: '\\maketitle', detail: 'Make title', type: 'keyword' },
            { label: '\\tableofcontents', detail: 'Table of contents', type: 'keyword' },
        ];

        return {
            from: before.from,
            options: commands.map(c => ({
                label: c.label,
                detail: c.detail,
                type: c.type,
                boost: c.boost,
                apply: (view: any, completion: any, from: number, to: number) => {
                    const text = c.label;
                    // Place cursor inside the first {} if it exists
                    const firstBrace = text.indexOf('{');
                    if (firstBrace >= 0) {
                        view.dispatch({
                            changes: { from, to, insert: text },
                            selection: { anchor: from + firstBrace + 1 },
                        });
                    } else {
                        view.dispatch({
                            changes: { from, to, insert: text },
                            selection: { anchor: from + text.length },
                        });
                    }
                },
            })),
            filter: true,
        };
    }, []);

    // Citation autocompletion: triggers after \cite{, \textcite{, \parencite{, \autocite{, \citet{, \citep{
    const citationCompletion = useCallback((context: CompletionContext) => {
        const before = context.matchBefore(/\\(?:cite|textcite|parencite|autocite|citet|citep|nocite)\{[^}]*/);
        if (!before) return null;
        const bracePos = before.text.indexOf('{');
        if (bracePos === -1) return null;
        // Handle multiple citations separated by comma
        const afterBrace = before.text.slice(bracePos + 1);
        const lastComma = afterBrace.lastIndexOf(',');
        const partial = (lastComma >= 0 ? afterBrace.slice(lastComma + 1) : afterBrace).trim();
        const fromPos = before.to - partial.length;
        const entries = bibEntriesRef.current;
        if (entries.length === 0) return null;
        return {
            from: fromPos,
            options: entries.map(e => ({
                label: e.key,
                detail: e.year ? `(${e.year})` : undefined,
                info: [e.author, e.title].filter(Boolean).join(' — ') || undefined,
                type: 'text',
            })),
            filter: true,
        };
    }, []);

    const extensions = useMemo(() => [
        latexLanguage,
        syntaxHighlighting(isDarkMode ? latexHighlightStyleDark : latexHighlightStyleLight),
        isDarkMode ? editorThemeDark : editorThemeLight,
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
        autocompletion({
            override: [citationCompletion, latexCommandCompletion],
        }),
        keymap.of([
            { key: 'Mod-/', run: (view) => {
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
                return true;
            }},
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
        // Scroll preservation via ViewPlugin — no race conditions with CM's resize handler
        ViewPlugin.fromClass(class {
            savedScrollTop: number;
            lastHeight: number;
            pendingRestore: boolean;
            constructor(view: any) {
                const initial = paneData?._scrollTopPos ?? 0;
                this.savedScrollTop = initial;
                this.lastHeight = 0;
                this.pendingRestore = initial > 0;
            }
            update(update: any) {
                const scrollDOM = update.view.scrollDOM;
                const height = scrollDOM?.clientHeight ?? 0;
                const wasHidden = this.lastHeight === 0 && height > 0;
                this.lastHeight = height;
                if (height === 0) return;

                if (wasHidden && this.savedScrollTop > 0) this.pendingRestore = true;

                if (this.pendingRestore) {
                    this.pendingRestore = false;
                    const st = this.savedScrollTop;
                    scrollDOM.scrollTop = st;
                    return;
                }

                // Track pixel scroll position
                const currentTop = scrollDOM.scrollTop;
                if (currentTop !== this.savedScrollTop) {
                    this.savedScrollTop = currentTop;
                    if (paneData) paneData._scrollTopPos = currentTop;
                }
            }
        }),
    ], [citationCompletion, latexCommandCompletion, isDarkMode, paneData]);

    // Save to paneData on unmount
    useEffect(() => {
        return () => {
            const view = editorViewRef.current;
            if (view && paneData) {
                try { paneData._scrollTopPos = view.scrollDOM.scrollTop; } catch (e) {}
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
    // Commands ending with '{' auto-close with '}' and place cursor inside
    const insertAtCursor = useCallback((text: string) => {
        const view = editorViewRef.current;
        if (view) {
            const { from, to } = view.state.selection.main;
            const selectedText = view.state.sliceDoc(from, to);
            const endsWithBrace = text.endsWith('{');

            if (endsWithBrace && selectedText.length > 0) {
                // Wrap selection: \textbf{selected text}
                const wrapped = text + selectedText + '}';
                view.dispatch({
                    changes: { from, to, insert: wrapped },
                    selection: { anchor: from + text.length, head: from + text.length + selectedText.length },
                });
            } else if (endsWithBrace) {
                // No selection: insert \textbf{} with cursor between braces
                const withClose = text + '}';
                view.dispatch({
                    changes: { from, to, insert: withClose },
                    selection: { anchor: from + text.length },
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
            setShowSavedFlash(true);
            setTimeout(() => setShowSavedFlash(false), 1500);
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
            const needsBibtex = bibFilePath || /\\bibliography\{|\\addbibresource\{|\\printbibliography/.test(content);
            const res = await (window as any).api.compileLatex(filePath, { bibtex: !!needsBibtex });
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
                compile(openPdfOnBuild);
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
    }, [save, compile, insertAtCursor, toggleComment, toggleBlockComment, wrapInEnvironment, openPdfOnBuild]);

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

    const ToolbarDivider = () => <div className="w-px h-5 theme-border mx-1 opacity-30" />;

    const ToolbarButton = ({ onClick, title, active, disabled, children }: any) => (
        <button
            onClick={onClick}
            title={title}
            disabled={disabled}
            className={`w-7 h-7 flex items-center justify-center rounded-md transition-all duration-150
                ${disabled ? 'opacity-25 cursor-default' : 'active:scale-90 theme-text-muted'}
            `}
            style={active ? {
                background: 'linear-gradient(180deg, rgba(96,165,250,0.2) 0%, rgba(96,165,250,0.1) 100%)',
                color: '#93c5fd',
                boxShadow: 'inset 0 0 0 1px rgba(96,165,250,0.2), 0 0 8px rgba(96,165,250,0.08)',
            } : undefined}
            onMouseEnter={e => { if (!active && !disabled) e.currentTarget.style.background = 'rgba(128,128,128,0.12)'; }}
            onMouseLeave={e => { if (!active && !disabled) e.currentTarget.style.background = 'transparent'; }}
        >
            {children}
        </button>
    );

    return (
        <div className="h-full flex flex-col overflow-hidden theme-bg-primary">
            {/* Toolbar (also serves as pane header — draggable, with close/zen) */}
            <div
                ref={toolbarRef}
                className="flex items-center gap-0.5 px-1 h-10 flex-shrink-0 theme-bg-secondary border-b theme-border"
                style={{ cursor: 'move' }}
                draggable={renamingPaneId !== nodeId}
                onDragStart={(e) => {
                    if (renamingPaneId === nodeId) { e.preventDefault(); return; }
                    const nodePath = findNodePath(rootLayoutNode, nodeId);
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('application/json', JSON.stringify({ type: 'pane', id: nodeId, nodePath }));
                    setTimeout(() => { setDraggedItem?.({ type: 'pane', id: nodeId, nodePath }); }, 0);
                }}
                onDragEnd={() => setDraggedItem?.(null)}
                onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const nodePath = findNodePath(rootLayoutNode, nodeId);
                    setPaneContextMenu?.({ isOpen: true, x: e.clientX, y: e.clientY, nodeId, nodePath });
                }}
            >
                {/* Zen mode toggle */}
                {onToggleZen && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onToggleZen(); }}
                        onMouseDown={(e) => e.stopPropagation()}
                        className={`p-1 theme-hover rounded flex-shrink-0 ${isZenMode ? 'text-blue-400' : 'theme-text-muted hover:text-blue-400'}`}
                        title={isZenMode ? "Exit zen mode (Esc)" : "Enter zen mode"}
                    >
                        {isZenMode ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                    </button>
                )}

                {/* File title */}
                {renamingPaneId === nodeId ? (
                    <div
                        className="flex items-center gap-1 flex-shrink-0 px-1"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                    >
                        <input
                            type="text"
                            value={editedFileName}
                            onChange={(e) => setEditedFileName(e.target.value)}
                            onKeyDown={(e) => {
                                e.stopPropagation();
                                if (e.key === 'Enter') handleConfirmRename?.(nodeId, filePath);
                                if (e.key === 'Escape') setRenamingPaneId(null);
                            }}
                            className="px-1 py-0.5 text-[11px] theme-bg-primary theme-text-primary border theme-border rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                            style={{ width: '120px' }}
                            autoFocus
                        />
                        <button onClick={() => handleConfirmRename?.(nodeId, filePath)} className="p-0.5 theme-hover rounded text-green-400"><Check size={10} /></button>
                        <button onClick={() => setRenamingPaneId(null)} className="p-0.5 theme-hover rounded text-red-400"><X size={10} /></button>
                    </div>
                ) : (
                    <div className="flex items-center gap-0.5 flex-shrink-0 px-1 min-w-0">
                        <span
                            className="text-[11px] font-semibold theme-text-primary truncate max-w-[120px] cursor-default"
                            onDoubleClick={(e) => { e.stopPropagation(); e.preventDefault(); setRenamingPaneId(nodeId); setEditedFileName(getFileName(filePath) || ''); }}
                        >
                            {getFileName(filePath) || 'LaTeX'}{hasChanges ? ' *' : ''}
                        </span>
                        <button
                            onClick={(e) => { e.stopPropagation(); setRenamingPaneId(nodeId); setEditedFileName(getFileName(filePath) || ''); }}
                            className="p-0.5 theme-hover rounded opacity-40 hover:opacity-100 flex-shrink-0"
                            title="Rename file"
                        ><Pencil size={9} /></button>
                    </div>
                )}

                <ToolbarDivider />

                {/* Outline toggle */}
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
                                        : 'theme-text-muted hover:theme-text-primary theme-hover'}`}
                            >
                                <FileText size={12} />
                                {!isCompact && <span>Templates</span>}
                                {!isCompact && <ChevronDown size={9} className="opacity-50" />}
                            </button>
                            {activeMenu === 'templates' && (
                                <div className="absolute top-full left-0 mt-1.5 rounded-xl shadow-2xl z-50 min-w-[160px] py-1.5 border theme-border backdrop-blur-xl overflow-hidden theme-bg-secondary">
                                    {TEMPLATES.map(t => (
                                        <button key={t.label} onClick={() => applyTemplate(t.content)}
                                            className="w-full px-3 py-2 text-left text-[11px] theme-text-secondary hover:bg-gradient-to-r hover:from-violet-500/10 hover:to-transparent hover:theme-text-primary transition-all duration-100">
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
                                    ${activeMenu === cat ? '' : 'theme-text-muted theme-hover'}`}
                                style={activeMenu === cat ? {
                                    background: `linear-gradient(180deg, ${accentColor}22 0%, ${accentColor}11 100%)`,
                                    boxShadow: `inset 0 0 0 1px ${accentColor}33`,
                                    color: accentColor,
                                } : undefined}
                            >
                                <Icon size={12} />
                                {!isCompact && <span className="capitalize">{cat}</span>}
                                {!isCompact && <ChevronDown size={9} className="opacity-40" />}
                            </button>
                            {activeMenu === cat && (
                                <div className="absolute top-full left-0 mt-1.5 rounded-xl shadow-2xl z-50 min-w-[190px] py-1.5 max-h-80 overflow-y-auto border theme-border overflow-hidden backdrop-blur-xl theme-bg-secondary">
                                    {items.map(item => (
                                        <button
                                            key={item.label}
                                            onClick={() => handleSnippetClick(item.snippet)}
                                            className="w-full px-3 py-1.5 text-left text-[11px] theme-text-secondary flex items-center gap-2.5 transition-all duration-100"
                                            style={{ }}
                                            onMouseEnter={e => (e.currentTarget.style.background = `linear-gradient(90deg, ${accentColor}18 0%, transparent 100%)`)}
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

                {/* Bib file selector */}
                {availableBibFiles.length > 0 && (
                    <>
                        <ToolbarDivider />
                        <div className="flex items-center gap-1">
                            <BookOpen size={11} className="text-yellow-400/70" />
                            <select
                                value={bibFilePath ? bibFilePath.split('/').pop() || '' : ''}
                                onChange={(e) => {
                                    if (!e.target.value) { setBibFilePath(null); return; }
                                    const dir = filePath.substring(0, filePath.lastIndexOf('/'));
                                    setBibFilePath(dir + '/' + e.target.value);
                                }}
                                className="h-6 px-1 text-[10px] bg-transparent border theme-border rounded theme-text-secondary focus:outline-none focus:border-yellow-500/50"
                            >
                                <option value="">No .bib</option>
                                {availableBibFiles.map(f => (
                                    <option key={f} value={f}>{f}</option>
                                ))}
                            </select>
                            {bibEntries.length > 0 && (
                                <span className="text-[9px] theme-text-muted">{bibEntries.length} refs</span>
                            )}
                        </div>
                    </>
                )}

                <div className="flex-1" />

                {/* Compile button + PDF toggle */}
                <div className="flex items-center gap-0.5">
                    <button
                        onClick={() => compile(openPdfOnBuild)}
                        disabled={isCompiling}
                        className="h-7 px-3 text-[11px] rounded-md flex items-center gap-1.5 transition-all duration-150 font-medium"
                        style={{
                            background: isCompiling
                                ? 'var(--theme-hover)'
                                : isDarkMode
                                    ? 'linear-gradient(180deg, rgba(96,165,250,0.2) 0%, rgba(96,165,250,0.1) 100%)'
                                    : 'linear-gradient(180deg, rgba(37,99,235,0.12) 0%, rgba(37,99,235,0.06) 100%)',
                            color: isDarkMode ? '#93c5fd' : '#2563eb',
                            boxShadow: isDarkMode ? 'inset 0 0 0 1px rgba(96,165,250,0.2)' : 'inset 0 0 0 1px rgba(37,99,235,0.15)',
                        }}
                    >
                        {isCompiling ? <Loader size={12} className="animate-spin" /> : <Play size={12} />}
                        {!isCompact && <span>{isCompiling ? 'Building...' : 'Build'}</span>}
                    </button>
                    <button
                        onClick={() => { const next = !openPdfOnBuild; setOpenPdfOnBuild(next); localStorage.setItem('latex_openPdfOnBuild', String(next)); }}
                        className="w-6 h-7 flex items-center justify-center rounded-md theme-text-muted transition-all duration-150"
                        title={openPdfOnBuild ? 'PDF opens after build (click to disable)' : 'PDF will not open after build (click to enable)'}
                    >
                        {openPdfOnBuild ? <Eye size={11} /> : <EyeOff size={11} />}
                    </button>
                </div>

                <ToolbarDivider />

                {/* Symbols toggle */}
                <ToolbarButton onClick={() => setShowSymbols(!showSymbols)} title="Math Symbols" active={showSymbols}><Sigma size={14} /></ToolbarButton>

                {/* Stats pill */}
                {!isCompact && (
                    <div className="flex items-center gap-2 ml-1.5 px-2.5 h-6 rounded-full text-[10px] theme-text-muted tabular-nums"
                        style={{ background: isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)', border: isDarkMode ? '1px solid rgba(255,255,255,0.04)' : '1px solid rgba(0,0,0,0.06)' }}>
                        <span>{stats.lines} <span className="opacity-60">ln</span></span>
                        <span className="w-px h-3" style={{ background: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)' }} />
                        <span>{stats.words} <span className="opacity-60">w</span></span>
                    </div>
                )}

                <ToolbarDivider />

                {/* Save button */}
                <button
                    onClick={(e) => { e.stopPropagation(); save(); }}
                    disabled={!hasChanges || isSaving}
                    className={`p-1 rounded text-xs theme-hover disabled:opacity-30 flex-shrink-0 transition-all duration-300 ${showSavedFlash ? 'text-emerald-500' : ''}`}
                    title="Save (Ctrl+S)"
                >
                    {isSaving ? <Loader size={12} className="animate-spin" /> : showSavedFlash ? <CheckCircle size={12} /> : <Save size={12} />}
                </button>

                {/* Close button */}
                {onClose && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onClose(); }}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="p-1 theme-hover rounded flex-shrink-0 theme-text-muted hover:text-red-400"
                        title="Close pane"
                    >
                        <X size={14} />
                    </button>
                )}
            </div>

            {/* Main content */}
            <div className="flex-1 flex min-h-0 overflow-hidden">
                {/* Outline panel */}
                {showOutline && (
                    <div className="w-56 flex flex-col flex-shrink-0 overflow-hidden theme-bg-secondary" style={{
                        borderRight: '1px solid var(--theme-border)',
                    }}>
                        <div className="flex items-center justify-between px-3 h-9 flex-shrink-0" style={{ borderBottom: '1px solid var(--theme-border)' }}>
                            <div className="flex items-center gap-2">
                                <BookOpen size={11} className="text-violet-400/70" />
                                <span className="text-[10px] font-semibold theme-text-primary tracking-wider uppercase">Outline</span>
                            </div>
                            <span className="text-[9px] theme-text-muted tabular-nums px-1.5 py-0.5 rounded-full" style={{ background: isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }}>{sectionOutline.length}</span>
                        </div>
                        {outline.length === 0 ? (
                            <div className="p-4 text-[11px] theme-text-muted leading-relaxed">
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
                                            className="w-full text-left py-1.5 px-1.5 flex items-center gap-2 rounded-lg transition-all duration-100 theme-hover group"
                                            style={{ paddingLeft: indent }}
                                            title={`Line ${item.line}`}
                                        >
                                            {style?.icon && React.createElement(style.icon, { size: 11, style: { color: style.color }, className: 'flex-shrink-0 opacity-80 group-hover:opacity-100' })}
                                            {isSection && !style && <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: isChapter ? '#c084fc' : isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)' }} />}
                                            <span className={`truncate text-[11px] ${isChapter ? 'font-semibold theme-text-primary' : isSection ? 'theme-text-muted' : 'theme-text-muted'} ${item.kind === 'label' ? 'font-mono text-[10px]' : ''}`}
                                                style={style?.color && !isSection ? { color: style.color } : undefined}
                                            >
                                                {item.title}
                                            </span>
                                            <span className="ml-auto text-[9px] theme-text-muted tabular-nums flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">{item.line}</span>
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
                        <div className={`absolute inset-0 ${isDarkMode ? 'bg-black/60' : 'bg-white/60'} flex items-center justify-center z-10 backdrop-blur-sm`}>
                            <div className="rounded-2xl p-6 flex items-center gap-5 shadow-2xl border theme-border theme-bg-secondary">
                                <div className="relative">
                                    <Loader size={24} className="animate-spin text-blue-400" />
                                    <div className="absolute inset-0 rounded-full" style={{ background: 'radial-gradient(circle, rgba(96,165,250,0.15) 0%, transparent 70%)' }} />
                                </div>
                                <div>
                                    <div className="text-sm font-semibold theme-text-primary">Compiling...</div>
                                    <div className="text-[11px] theme-text-muted mt-0.5">Running pdflatex</div>
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
                        />
                    </div>
                </div>

                {/* Symbols panel */}
                {showSymbols && (
                    <div className="w-52 flex flex-col flex-shrink-0 overflow-hidden theme-bg-secondary" style={{
                        borderLeft: '1px solid var(--theme-border)',
                    }}>
                        <div className="flex items-center gap-2 px-3 h-9 flex-shrink-0" style={{ borderBottom: '1px solid var(--theme-border)' }}>
                            <Sigma size={11} className="text-blue-400/70" />
                            <span className="text-[10px] font-semibold theme-text-primary tracking-wider uppercase">Symbols</span>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2">
                            <div className="grid grid-cols-5 gap-0.5">
                                {MATH_SYMBOLS.map(sym => (
                                    <button
                                        key={sym.cmd}
                                        onClick={() => insertAtCursor(sym.cmd)}
                                        className="aspect-square flex items-center justify-center text-[15px] rounded-lg theme-text-muted transition-all duration-100"
                                        style={{ }}
                                        title={sym.cmd}
                                        onMouseEnter={e => { e.currentTarget.style.background = isDarkMode ? 'rgba(96,165,250,0.1)' : 'rgba(37,99,235,0.08)'; e.currentTarget.style.color = isDarkMode ? '#93c5fd' : '#2563eb'; e.currentTarget.style.transform = 'scale(1.15)'; }}
                                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = ''; e.currentTarget.style.transform = 'scale(1)'; }}
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
                <div className="flex flex-col flex-shrink-0 theme-bg-secondary" style={{
                    borderTop: '1px solid var(--theme-border)',
                }}>
                    <div className="flex items-center justify-between px-3 h-8" style={{ borderBottom: '1px solid var(--theme-border)' }}>
                        <div className="flex items-center gap-2.5">
                            <Terminal size={12} className="theme-text-muted" />
                            <span className="text-[10px] font-semibold theme-text-muted uppercase tracking-wider">Build Output</span>
                            {compileStatus === 'success' && (
                                <span className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full"
                                    style={{ background: 'rgba(52,211,153,0.1)', color: isDarkMode ? '#6ee7b7' : '#059669', border: '1px solid rgba(52,211,153,0.15)' }}>
                                    <CheckCircle size={10} /> OK
                                </span>
                            )}
                            {compileStatus === 'error' && (
                                <span className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full"
                                    style={{ background: 'rgba(239,68,68,0.1)', color: isDarkMode ? '#fca5a5' : '#dc2626', border: '1px solid rgba(239,68,68,0.15)' }}>
                                    <AlertCircle size={10} /> {parseErrors.length} {parseErrors.length === 1 ? 'error' : 'errors'}
                                </span>
                            )}
                        </div>
                        <button onClick={() => setShowLog(false)} className="w-5 h-5 flex items-center justify-center rounded-md theme-hover theme-text-muted transition-colors">
                            <X size={11} />
                        </button>
                    </div>
                    <div className="max-h-28 overflow-auto px-3 py-2 font-mono text-[10px] leading-relaxed">
                        {compileLog ? (
                            <pre className="whitespace-pre-wrap theme-text-muted">{compileLog}</pre>
                        ) : (
                            <div className="theme-text-muted py-1">Press <kbd className="px-1.5 py-0.5 rounded-md text-[9px] theme-text-secondary font-medium" style={{ background: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)', border: isDarkMode ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(0,0,0,0.08)' }}>Ctrl+Enter</kbd> to compile</div>
                        )}
                    </div>
                    {parseErrors.length > 0 && (
                        <div className="px-2 pb-2 space-y-1" style={{ borderTop: '1px solid var(--theme-border)' }}>
                            {parseErrors.slice(0, 5).map((err, i) => (
                                <button
                                    key={i}
                                    onClick={() => goToLine(err.line)}
                                    className="w-full text-left px-2.5 py-1.5 text-[11px] rounded-lg flex items-center gap-2 transition-all duration-100"
                                    style={{ background: 'rgba(239,68,68,0.08)', color: isDarkMode ? '#f87171' : '#dc2626', border: '1px solid rgba(239,68,68,0.08)' }}
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
            <div className="flex items-center justify-between px-3 h-6 flex-shrink-0 text-[10px] theme-bg-secondary" style={{
                borderTop: '1px solid var(--theme-border)',
            }}>
                <div className="flex items-center gap-2">
                    {error && <span className="text-red-400 truncate max-w-[200px] flex items-center gap-1"><AlertCircle size={10} /> {error}</span>}
                    {!error && hasChanges && (
                        <span className={`${isDarkMode ? 'text-amber-400/90' : 'text-amber-600'} flex items-center gap-1.5`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${isDarkMode ? 'bg-amber-400' : 'bg-amber-500'} animate-pulse`} />
                            Modified
                        </span>
                    )}
                    {!error && !hasChanges && (
                        <span className={`${showSavedFlash ? (isDarkMode ? 'text-emerald-400' : 'text-emerald-600') : (isDarkMode ? 'text-emerald-400/60' : 'text-emerald-600/60')} flex items-center gap-1.5 transition-colors duration-300`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${showSavedFlash ? (isDarkMode ? 'bg-emerald-400' : 'bg-emerald-500') : (isDarkMode ? 'bg-emerald-400/60' : 'bg-emerald-500/60')} transition-colors duration-300`} />
                            Saved
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2 theme-text-muted">
                    {[
                        ['Ctrl+S', 'save'],
                        ['Ctrl+Enter', 'build'],
                        ['Ctrl+/', '%'],
                        ['Ctrl+B', 'bold'],
                    ].map(([key, label]) => (
                        <span key={label} className="flex items-center gap-0.5">
                            <kbd className="px-1 py-px rounded text-[9px] theme-text-muted font-mono" style={{ background: isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)', border: isDarkMode ? '1px solid rgba(255,255,255,0.04)' : '1px solid rgba(0,0,0,0.06)' }}>{key}</kbd>
                            <span className="opacity-70 text-[9px]">{label}</span>
                        </span>
                    ))}
                </div>
            </div>
        </div>
    );
};

// Custom comparison to prevent reload on pane resize
const arePropsEqual = (prevProps: any, nextProps: any) => {
    return prevProps.nodeId === nextProps.nodeId
        && prevProps.renamingPaneId === nextProps.renamingPaneId
        && prevProps.editedFileName === nextProps.editedFileName
        && prevProps.isZenMode === nextProps.isZenMode;
};

export default memo(LatexViewer, arePropsEqual);
