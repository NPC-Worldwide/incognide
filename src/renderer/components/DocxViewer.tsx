import React, { useState, useEffect, useCallback, useRef, memo, useMemo } from 'react';
import {
    Save, Download, Bold, Italic, List, ListOrdered, AlignLeft, AlignCenter, AlignRight,
    Undo, Redo, X, Image, Table, Type, Link, Minus, Search, Strikethrough, Subscript,
    Superscript, Highlighter, Indent, Outdent, FileText, Printer, ChevronDown,
    ZoomIn, ZoomOut, Underline, AlignJustify, Quote, Code, Replace, PaintBucket,
    Palette, LayoutTemplate, Columns, FileDown, Eye, EyeOff, Maximize2, Grid,
    MoreHorizontal, Scissors, Clipboard, ClipboardPaste, RotateCcw, Sun, Moon
} from 'lucide-react';

// Font options - comprehensive list
const FONTS = [
    { name: 'Arial', family: 'Arial, Helvetica, sans-serif' },
    { name: 'Calibri', family: 'Calibri, sans-serif' },
    { name: 'Times New Roman', family: '"Times New Roman", Times, serif' },
    { name: 'Georgia', family: 'Georgia, serif' },
    { name: 'Verdana', family: 'Verdana, Geneva, sans-serif' },
    { name: 'Trebuchet MS', family: '"Trebuchet MS", sans-serif' },
    { name: 'Garamond', family: 'Garamond, serif' },
    { name: 'Courier New', family: '"Courier New", Courier, monospace' },
    { name: 'Comic Sans MS', family: '"Comic Sans MS", cursive' },
    { name: 'Impact', family: 'Impact, sans-serif' },
];

const FONT_SIZES = [
    { label: '8', value: '1' },
    { label: '10', value: '2' },
    { label: '12', value: '3' },
    { label: '14', value: '4' },
    { label: '16', value: '4' },
    { label: '18', value: '5' },
    { label: '20', value: '5' },
    { label: '24', value: '6' },
    { label: '28', value: '6' },
    { label: '36', value: '7' },
    { label: '48', value: '7' },
    { label: '72', value: '7' },
];

const HIGHLIGHT_COLORS = [
    { name: 'Yellow', color: '#ffff00' },
    { name: 'Green', color: '#00ff00' },
    { name: 'Cyan', color: '#00ffff' },
    { name: 'Pink', color: '#ff00ff' },
    { name: 'Red', color: '#ff6b6b' },
    { name: 'Blue', color: '#74b9ff' },
    { name: 'Orange', color: '#ffa502' },
    { name: 'Purple', color: '#a29bfe' },
];

const TEXT_COLORS = [
    '#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#cccccc', '#d9d9d9', '#efefef', '#f3f3f3', '#ffffff',
    '#980000', '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff', '#4a86e8', '#0000ff', '#9900ff', '#ff00ff',
    '#e6b8af', '#f4cccc', '#fce5cd', '#fff2cc', '#d9ead3', '#d0e0e3', '#c9daf8', '#cfe2f3', '#d9d2e9', '#ead1dc',
];

// Track loaded fonts
const loadedFonts = new Set<string>();

// Load a Google Font dynamically
function loadGoogleFont(fontName: string): void {
    if (!fontName || loadedFonts.has(fontName)) return;
    loadedFonts.add(fontName);

    // System fonts don't need loading
    const systemFonts = ['Arial', 'Helvetica', 'Times New Roman', 'Georgia', 'Verdana', 'Courier New', 'Calibri', 'Cambria', 'Comic Sans MS', 'Impact', 'Trebuchet MS'];
    if (systemFonts.includes(fontName)) return;

    console.log('[DOCX] Loading font:', fontName);

    // Try to load from Google Fonts by injecting a style tag (works around some CSP issues)
    const style = document.createElement('style');
    style.textContent = `@import url('https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontName)}:wght@300;400;500;600;700&display=swap');`;
    document.head.appendChild(style);
}

// Global cache for loaded DOCX content - keyed by filePath
const docxContentCache = new Map<string, {
    html: string;
    fonts?: any;
    pageSize?: any;
}>();

// Document templates
const TEMPLATES = [
    { name: 'Blank', content: '<p><br></p>' },
    { name: 'Letter', content: '<p style="text-align: right;">[Your Name]<br>[Your Address]<br>[City, State ZIP]<br>[Date]</p><p><br></p><p>[Recipient Name]<br>[Recipient Address]<br>[City, State ZIP]</p><p><br></p><p>Dear [Recipient],</p><p><br></p><p>[Letter body...]</p><p><br></p><p>Sincerely,</p><p>[Your Name]</p>' },
    { name: 'Resume', content: '<h1 style="text-align: center; margin-bottom: 0;">[Your Name]</h1><p style="text-align: center; color: #666;">[Email] | [Phone] | [Location]</p><hr><h2>Experience</h2><h3>[Job Title] - [Company]</h3><p style="color: #666;">[Date Range]</p><ul><li>[Achievement 1]</li><li>[Achievement 2]</li></ul><h2>Education</h2><h3>[Degree] - [University]</h3><p style="color: #666;">[Year]</p>' },
    { name: 'Report', content: '<h1 style="text-align: center;">[Report Title]</h1><p style="text-align: center; color: #666;">Prepared by: [Author]<br>Date: [Date]</p><hr><h2>Executive Summary</h2><p>[Summary text...]</p><h2>Introduction</h2><p>[Introduction text...]</p><h2>Findings</h2><p>[Findings text...]</p><h2>Conclusion</h2><p>[Conclusion text...]</p>' },
];

const DocxViewer = ({
    nodeId,
    contentDataRef,
    findNodePath,
    rootLayoutNode,
    setDraggedItem,
    setPaneContextMenu,
    closeContentPane
}) => {
    const paneData = contentDataRef.current[nodeId];
    const filePath = paneData?.contentId;

    const [htmlContent, setHtmlContent] = useState('');
    const [error, setError] = useState(null);
    const [hasChanges, setHasChanges] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [history, setHistory] = useState<string[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const editorRef = useRef<HTMLDivElement>(null);
    const isUndoRedoRef = useRef(false);
    const [isLoaded, setIsLoaded] = useState(false);
    const lastFilePathRef = useRef<string | null>(null);

    // Synchronously check cache when filePath changes to avoid loading flash on tab switch
    if (filePath && filePath !== lastFilePathRef.current) {
        const cached = docxContentCache.get(filePath);
        if (cached) {
            // Update state synchronously during render for cached content
            if (!isLoaded || htmlContent !== cached.html) {
                setHtmlContent(cached.html);
                setHistory([cached.html]);
                setHistoryIndex(0);
                setIsLoaded(true);
                setError(null);
            }
        } else if (isLoaded) {
            // Reset loading state for uncached files
            setIsLoaded(false);
        }
        lastFilePathRef.current = filePath;
    }

    // Independent document light/dark mode
    const [docLightMode, setDocLightMode] = useState(() => {
        const saved = localStorage.getItem('docxViewer_lightMode');
        return saved !== null ? JSON.parse(saved) : true;
    });

    // Persist docLightMode changes
    useEffect(() => {
        localStorage.setItem('docxViewer_lightMode', JSON.stringify(docLightMode));
    }, [docLightMode]);

    // Debug logging
    // console.log('[DOCX] nodeId:', nodeId, 'paneData:', paneData, 'filePath:', filePath);

    // UI State
    const [zoom, setZoom] = useState(100);
    const [showRuler, setShowRuler] = useState(true);
    const [viewMode, setViewMode] = useState<'page' | 'web'>('page');

    // Toolbar dropdowns
    const [showFontPicker, setShowFontPicker] = useState(false);
    const [showSizePicker, setShowSizePicker] = useState(false);
    const [showHighlightPicker, setShowHighlightPicker] = useState(false);
    const [showTextColorPicker, setShowTextColorPicker] = useState(false);
    const [showTablePicker, setShowTablePicker] = useState(false);
    const [showTemplatePicker, setShowTemplatePicker] = useState(false);
    const [showMoreTools, setShowMoreTools] = useState(false);

    // Current formatting state
    const [currentFont, setCurrentFont] = useState('Calibri');
    const [currentFontSize, setCurrentFontSize] = useState('12');

    // Document fonts from DOCX
    const [docFonts, setDocFonts] = useState<{ default: string; heading: string; all: string[] } | null>(null);
    // Page dimensions from DOCX (in inches)
    const [pageSize, setPageSize] = useState<{
        width: number;
        height: number;
        marginTop: number;
        marginBottom: number;
        marginLeft: number;
        marginRight: number;
    }>({ width: 8.5, height: 11, marginTop: 1, marginBottom: 1, marginLeft: 1, marginRight: 1 });
    // Spacing from DOCX
    const [docSpacing, setDocSpacing] = useState<{
        lineHeight: number;
        paragraphBefore: number;
        paragraphAfter: number;
    }>({ lineHeight: 1.15, paragraphBefore: 0, paragraphAfter: 8 });
    const [tablePickerSize, setTablePickerSize] = useState({ rows: 3, cols: 3 });

    // Find and replace
    const [showFindReplace, setShowFindReplace] = useState(false);
    const [findText, setFindText] = useState('');
    const [replaceText, setReplaceText] = useState('');
    const [matchCount, setMatchCount] = useState(0);

    // Document statistics
    const documentStats = useMemo(() => {
        const text = editorRef.current?.innerText || '';
        const words = text.trim() ? text.trim().split(/\s+/).length : 0;
        const chars = text.length;
        const pages = Math.max(1, Math.ceil(words / 500));
        return { words, chars, pages };
    }, [htmlContent]);

    // Load document
    useEffect(() => {
        const loadDocx = async () => {
            if (!filePath) return;

            // Check global cache first
            const cached = docxContentCache.get(filePath);
            if (cached) {
                setHtmlContent(cached.html);
                setHistory([cached.html]);
                setHistoryIndex(0);
                if (editorRef.current) editorRef.current.innerHTML = cached.html;
                setIsLoaded(true);
                if (cached.fonts) setDocFonts(cached.fonts);
                if (cached.pageSize) setPageSize(cached.pageSize);
                return;
            }

            try {
                // console.log('[DOCX] Reading file buffer...');
                // Read as buffer first to check if it's a real DOCX
                const rawBuffer = await window.api.readFileBuffer(filePath);
                // console.log('[DOCX] Got rawBuffer:', rawBuffer?.length || 'null', typeof rawBuffer);
                // Convert to Uint8Array if needed (IPC may return different types)
                const buffer = rawBuffer instanceof Uint8Array ? rawBuffer :
                               rawBuffer?.data ? new Uint8Array(rawBuffer.data) :
                               rawBuffer?.type === 'Buffer' ? new Uint8Array(rawBuffer.data) :
                               new Uint8Array(rawBuffer || []);
                // console.log('[DOCX] Converted buffer length:', buffer?.length, 'first bytes:', buffer?.[0], buffer?.[1]);

                if (!buffer || buffer.length === 0) {
                    // Empty file - start with blank
                    const blank = '<p><br></p>';
                    setHtmlContent(blank);
                    setHistory([blank]);
                    setHistoryIndex(0);
                    if (editorRef.current) editorRef.current.innerHTML = blank;
                    setIsLoaded(true);
                    return;
                }

                // Check if it's a ZIP (DOCX files are ZIP archives starting with PK)
                const isZip = buffer[0] === 0x50 && buffer[1] === 0x4B;
                // console.log('[DOCX] isZip:', isZip);

                if (isZip) {
                    // It's a real DOCX file - use mammoth
                    console.log('[DOCX] Calling readDocxContent...');
                    const response = await window.api.readDocxContent(filePath);
                    console.log('[DOCX] readDocxContent response length:', response.content?.length);
                    if (response.error) {
                        throw new Error(response.error);
                    }
                    const html = response.content || '<p><br></p>';

                    // Debug: count empty paragraphs
                    const nbspCount = (html.match(/<p>&nbsp;<\/p>/g) || []).length;
                    const emptyPCount = (html.match(/<p>\s*<\/p>/g) || []).length;
                    console.log('[DOCX] Empty paragraphs with &nbsp;:', nbspCount, 'Empty <p>:', emptyPCount);
                    console.log('[DOCX] First 500 chars:', html.substring(0, 500));

                    setHtmlContent(html);
                    setHistory([html]);
                    setHistoryIndex(0);
                    if (editorRef.current) editorRef.current.innerHTML = html;

                    // Handle document fonts
                    if (response.fonts) {
                        console.log('[DOCX] Document fonts:', response.fonts);
                        setDocFonts(response.fonts);
                        setCurrentFont(response.fonts.default || 'Calibri');

                        // Load all fonts from the document
                        for (const font of response.fonts.all || []) {
                            loadGoogleFont(font);
                        }
                    }

                    // Handle page size
                    if (response.pageSize) {
                        console.log('[DOCX] Page size:', response.pageSize);
                        setPageSize(response.pageSize);
                    }

                    // Handle spacing
                    if (response.spacing) {
                        setDocSpacing(response.spacing);
                    }
                    // Cache globally by filePath
                    docxContentCache.set(filePath, {
                        html,
                        fonts: response.fonts,
                        pageSize: response.pageSize
                    });
                } else {
                    // It's a text/HTML file saved by our editor
                    const textContent = await window.api.readFileContent(filePath);
                    const content = textContent?.content || '<p><br></p>';
                    setHtmlContent(content);
                    setHistory([content]);
                    setHistoryIndex(0);
                    if (editorRef.current) editorRef.current.innerHTML = content;
                    // Cache globally
                    docxContentCache.set(filePath, { html: content });
                }

                setIsLoaded(true);
            } catch (err) {
                console.error('[DOCX] Load error:', err);
                setError(err.message);
            }
            // console.log('[DOCX] loadDocx finished');
        };
        loadDocx();
    }, [filePath]);

    // Set content to editor after it's rendered
    useEffect(() => {
        if (isLoaded && editorRef.current && htmlContent) {
            // console.log('[DOCX] Setting innerHTML after render, length:', htmlContent.length);
            editorRef.current.innerHTML = htmlContent;
        }
    }, [isLoaded, htmlContent]);

    // History management
    const addToHistory = useCallback((newContent: string) => {
        if (isUndoRedoRef.current) {
            isUndoRedoRef.current = false;
            return;
        }
        setHistory(prev => {
            const newHistory = prev.slice(0, historyIndex + 1);
            newHistory.push(newContent);
            if (newHistory.length > 100) newHistory.shift();
            return newHistory;
        });
        setHistoryIndex(prev => Math.min(prev + 1, 99));
    }, [historyIndex]);

    const handleInput = useCallback(() => {
        if (!editorRef.current) return;
        const newContent = editorRef.current.innerHTML;
        setHtmlContent(newContent);
        setHasChanges(true);
        addToHistory(newContent);
    }, [addToHistory]);

    const undo = useCallback(() => {
        if (historyIndex > 0) {
            isUndoRedoRef.current = true;
            const newIndex = historyIndex - 1;
            setHistoryIndex(newIndex);
            const content = history[newIndex];
            setHtmlContent(content);
            if (editorRef.current) editorRef.current.innerHTML = content;
            setHasChanges(true);
        }
    }, [history, historyIndex]);

    const redo = useCallback(() => {
        if (historyIndex < history.length - 1) {
            isUndoRedoRef.current = true;
            const newIndex = historyIndex + 1;
            setHistoryIndex(newIndex);
            const content = history[newIndex];
            setHtmlContent(content);
            if (editorRef.current) editorRef.current.innerHTML = content;
            setHasChanges(true);
        }
    }, [history, historyIndex]);

    // Save document
    const saveDocument = useCallback(async () => {
        if (!hasChanges || !editorRef.current) return;
        setIsSaving(true);
        try {
            const content = editorRef.current.innerHTML;
            await window.api.writeFileContent(filePath, content);
            setHtmlContent(content);
            setHasChanges(false);
        } catch (err) {
            setError(err.message);
        } finally {
            setIsSaving(false);
        }
    }, [hasChanges, filePath]);

    // Execute formatting command
    const execCommand = useCallback((command: string, value: string | null = null) => {
        document.execCommand(command, false, value);
        editorRef.current?.focus();
        setTimeout(handleInput, 0);
    }, [handleInput]);

    // Insert HTML at cursor
    const insertAtCursor = useCallback((html: string) => {
        editorRef.current?.focus();
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            range.deleteContents();
            const fragment = range.createContextualFragment(html);
            range.insertNode(fragment);
            range.collapse(false);
        }
        setTimeout(handleInput, 0);
    }, [handleInput]);

    // Insert table
    const insertTable = useCallback((rows: number, cols: number) => {
        let html = '<table style="border-collapse: collapse; width: 100%; margin: 16px 0;">';
        for (let r = 0; r < rows; r++) {
            html += '<tr>';
            for (let c = 0; c < cols; c++) {
                const isHeader = r === 0;
                const tag = isHeader ? 'th' : 'td';
                const style = `border: 1px solid #ccc; padding: 12px; ${isHeader ? 'background: #f5f5f5; font-weight: bold;' : ''}`;
                html += `<${tag} style="${style}">${isHeader ? `Column ${c + 1}` : ''}</${tag}>`;
            }
            html += '</tr>';
        }
        html += '</table><p><br></p>';
        insertAtCursor(html);
        setShowTablePicker(false);
    }, [insertAtCursor]);

    // Insert image
    const insertImage = useCallback(() => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (ev) => {
                    const dataUrl = ev.target?.result as string;
                    insertAtCursor(`<img src="${dataUrl}" style="max-width: 100%; height: auto; margin: 16px 0; display: block;" />`);
                };
                reader.readAsDataURL(file);
            }
        };
        input.click();
    }, [insertAtCursor]);

    // Insert link
    const insertLink = useCallback(() => {
        const url = prompt('Enter URL:');
        if (url) {
            const text = window.getSelection()?.toString() || url;
            execCommand('createLink', url);
        }
    }, [execCommand]);

    // Print
    const printDocument = useCallback(() => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;
        const content = editorRef.current?.innerHTML || '';
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>${filePath?.split('/').pop() || 'Document'}</title>
                <style>
                    @page {
                        size: ${pageSize.width}in ${pageSize.height}in;
                        margin: ${pageSize.marginTop}in ${pageSize.marginRight}in ${pageSize.marginBottom}in ${pageSize.marginLeft}in;
                    }
                    body {
                        font-family: ${currentFont}, sans-serif;
                        line-height: 1.6;
                        color: #000;
                        max-width: ${pageSize.width}in;
                        margin: 0 auto;
                    }
                    h1 { font-size: 24pt; margin: 0.5em 0; }
                    h2 { font-size: 18pt; margin: 0.5em 0; }
                    h3 { font-size: 14pt; margin: 0.5em 0; }
                    p { margin: 0.5em 0; }
                    table { border-collapse: collapse; width: 100%; }
                    td, th { border: 1px solid #000; padding: 8px; }
                    img { max-width: 100%; }
                    .docx-page-break { page-break-after: always; break-after: page; height: 0; margin: 0; padding: 0; border: none; }
                </style>
            </head>
            <body>${content}</body>
            </html>
        `);
        printWindow.document.close();
        setTimeout(() => printWindow.print(), 250);
    }, [filePath, currentFont, pageSize]);

    // Export functions
    const exportAsHtml = useCallback(async () => {
        const newPath = filePath.replace(/\.[^.]+$/, '.html');
        const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>${filePath?.split('/').pop()}</title>
    <style>
        body { font-family: ${currentFont}, sans-serif; max-width: 8.5in; margin: 1in auto; line-height: 1.6; }
        h1 { font-size: 2em; } h2 { font-size: 1.5em; } h3 { font-size: 1.17em; }
        table { border-collapse: collapse; width: 100%; }
        td, th { border: 1px solid #ccc; padding: 8px; }
        img { max-width: 100%; }
    </style>
</head>
<body>
${htmlContent}
</body>
</html>`;
        await window.api.writeFileContent(newPath, html);
        alert('Exported to ' + newPath);
    }, [htmlContent, filePath, currentFont]);

    const exportAsMarkdown = useCallback(async () => {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlContent;
        const text = tempDiv.innerText;
        const newPath = filePath.replace(/\.[^.]+$/, '.md');
        await window.api.writeFileContent(newPath, text);
        alert('Exported to ' + newPath);
    }, [htmlContent, filePath]);

    // Find and replace
    const findInDocument = useCallback(() => {
        if (!findText.trim() || !editorRef.current) {
            setMatchCount(0);
            return;
        }
        const content = editorRef.current.innerText;
        const regex = new RegExp(findText, 'gi');
        const matches = content.match(regex);
        setMatchCount(matches?.length || 0);
    }, [findText]);

    const replaceNext = useCallback(() => {
        if (!findText.trim() || !editorRef.current) return;
        const content = editorRef.current.innerHTML;
        const regex = new RegExp(findText, 'i');
        const newContent = content.replace(regex, replaceText);
        if (newContent !== content) {
            editorRef.current.innerHTML = newContent;
            handleInput();
            findInDocument();
        }
    }, [findText, replaceText, handleInput, findInDocument]);

    const replaceAll = useCallback(() => {
        if (!findText.trim() || !editorRef.current) return;
        const content = editorRef.current.innerHTML;
        const regex = new RegExp(findText, 'gi');
        const newContent = content.replace(regex, replaceText);
        if (newContent !== content) {
            editorRef.current.innerHTML = newContent;
            handleInput();
            setMatchCount(0);
        }
    }, [findText, replaceText, handleInput]);

    // Apply template
    const applyTemplate = useCallback((template: typeof TEMPLATES[0]) => {
        if (editorRef.current) {
            editorRef.current.innerHTML = template.content;
            handleInput();
        }
        setShowTemplatePicker(false);
    }, [handleInput]);

    // Keyboard shortcuts
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        const isCtrl = e.ctrlKey || e.metaKey;
        if (isCtrl && e.key === 's') { e.preventDefault(); saveDocument(); }
        else if (isCtrl && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
        else if (isCtrl && e.key === 'z' && e.shiftKey) { e.preventDefault(); redo(); }
        else if (isCtrl && e.key === 'y') { e.preventDefault(); redo(); }
        else if (isCtrl && e.key === 'b') { e.preventDefault(); execCommand('bold'); }
        else if (isCtrl && e.key === 'i') { e.preventDefault(); execCommand('italic'); }
        else if (isCtrl && e.key === 'u') { e.preventDefault(); execCommand('underline'); }
        else if (isCtrl && e.key === 'f') { e.preventDefault(); setShowFindReplace(true); }
    }, [saveDocument, undo, redo, execCommand]);

    // Close dropdowns on outside click
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (!target.closest('.dropdown-container')) {
                setShowFontPicker(false);
                setShowSizePicker(false);
                setShowHighlightPicker(false);
                setShowTextColorPicker(false);
                setShowTablePicker(false);
                setShowTemplatePicker(false);
                setShowMoreTools(false);
            }
        };
        document.addEventListener('click', handleClick);
        return () => document.removeEventListener('click', handleClick);
    }, []);

    if (error) return <div className="p-4 text-red-500">Error: {error}</div>;
    if (!isLoaded) return (
        <div className="h-full flex items-center justify-center theme-bg-secondary">
            <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
                <p className="text-sm theme-text-muted">Loading document...</p>
            </div>
        </div>
    );

    return (
        <div className="h-full flex flex-col theme-bg-secondary overflow-hidden">
            {/* Header Bar */}
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
                    setPaneContextMenu({
                        isOpen: true, x: e.clientX, y: e.clientY, nodeId,
                        nodePath: findNodePath(rootLayoutNode, nodeId)
                    });
                }}
                className="px-3 py-2 border-b theme-border theme-bg-secondary cursor-move flex items-center justify-between"
            >
                <span className="text-sm font-medium truncate">
                    {filePath?.split('/').pop() || 'Document'}{hasChanges ? ' *' : ''}
                </span>
                <div className="flex items-center gap-1">
                    <button onClick={undo} disabled={historyIndex <= 0} className="p-1.5 theme-hover rounded disabled:opacity-30" title="Undo">
                        <Undo size={14} />
                    </button>
                    <button onClick={redo} disabled={historyIndex >= history.length - 1} className="p-1.5 theme-hover rounded disabled:opacity-30" title="Redo">
                        <Redo size={14} />
                    </button>
                    <div className="w-px h-4 bg-gray-600 mx-1" />
                    <button onClick={saveDocument} disabled={!hasChanges} className="p-1.5 theme-hover rounded disabled:opacity-30" title="Save">
                        <Save size={14} />
                    </button>
                    <button onClick={printDocument} className="p-1.5 theme-hover rounded" title="Print">
                        <Printer size={14} />
                    </button>
                    <button onClick={() => setShowFindReplace(!showFindReplace)} className={`p-1.5 rounded ${showFindReplace ? 'bg-blue-600/30' : 'theme-hover'}`} title="Find & Replace">
                        <Search size={14} />
                    </button>
                    <button
                        onClick={() => setDocLightMode(!docLightMode)}
                        className="p-1.5 theme-hover rounded"
                        title={docLightMode ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
                    >
                        {docLightMode ? <Moon size={14} /> : <Sun size={14} />}
                    </button>
                    <div className="relative dropdown-container">
                        <button onClick={(e) => { e.stopPropagation(); setShowMoreTools(!showMoreTools); }} className="p-1.5 theme-hover rounded" title="More">
                            <MoreHorizontal size={14} />
                        </button>
                        {showMoreTools && (
                            <div className="absolute right-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded shadow-lg z-50 min-w-[160px] py-1">
                                <button onClick={exportAsHtml} className="w-full px-3 py-1.5 text-left text-xs hover:bg-gray-700 flex items-center gap-2">
                                    <FileDown size={12} /> Export as HTML
                                </button>
                                <button onClick={exportAsMarkdown} className="w-full px-3 py-1.5 text-left text-xs hover:bg-gray-700 flex items-center gap-2">
                                    <FileText size={12} /> Export as Markdown
                                </button>
                                <div className="border-t border-gray-700 my-1" />
                                <button onClick={() => setShowRuler(!showRuler)} className="w-full px-3 py-1.5 text-left text-xs hover:bg-gray-700 flex items-center gap-2">
                                    {showRuler ? <EyeOff size={12} /> : <Eye size={12} />} {showRuler ? 'Hide' : 'Show'} Ruler
                                </button>
                                <button onClick={() => setViewMode(viewMode === 'page' ? 'web' : 'page')} className="w-full px-3 py-1.5 text-left text-xs hover:bg-gray-700 flex items-center gap-2">
                                    <LayoutTemplate size={12} /> {viewMode === 'page' ? 'Web View' : 'Page View'}
                                </button>
                            </div>
                        )}
                    </div>
                    <button onClick={() => closeContentPane(nodeId)} className="p-1.5 theme-hover rounded" title="Close">
                        <X size={14} />
                    </button>
                </div>
            </div>

            {/* Main Toolbar */}
            <div className="px-2 py-1.5 border-b theme-border theme-bg-tertiary flex items-center gap-1 flex-wrap">
                {/* Font Family */}
                <div className="relative dropdown-container">
                    <button
                        onClick={(e) => { e.stopPropagation(); setShowFontPicker(!showFontPicker); }}
                        className="px-2 py-1 text-[11px] theme-hover rounded flex items-center gap-1 min-w-[100px] border border-white/10"
                        style={{ fontFamily: currentFont }}
                    >
                        <span className="truncate flex-1 text-left">{currentFont}</span>
                        <ChevronDown size={10} />
                    </button>
                    {showFontPicker && (
                        <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-700 rounded shadow-xl z-50 max-h-64 overflow-y-auto min-w-[180px]">
                            {FONTS.map(font => (
                                <button
                                    key={font.name}
                                    onClick={() => { execCommand('fontName', font.family); setCurrentFont(font.name); setShowFontPicker(false); }}
                                    className="w-full px-3 py-2 text-left text-xs hover:bg-gray-700 flex items-center justify-between"
                                    style={{ fontFamily: font.family }}
                                >
                                    {font.name}
                                    {currentFont === font.name && <span className="text-blue-400">✓</span>}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Font Size */}
                <div className="relative dropdown-container">
                    <button
                        onClick={(e) => { e.stopPropagation(); setShowSizePicker(!showSizePicker); }}
                        className="px-2 py-1 text-[11px] theme-hover rounded flex items-center gap-1 w-14 border border-white/10"
                    >
                        <span>{currentFontSize}</span>
                        <ChevronDown size={10} />
                    </button>
                    {showSizePicker && (
                        <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-700 rounded shadow-xl z-50 max-h-48 overflow-y-auto">
                            {FONT_SIZES.map(size => (
                                <button
                                    key={size.label}
                                    onClick={() => { execCommand('fontSize', size.value); setCurrentFontSize(size.label); setShowSizePicker(false); }}
                                    className="w-full px-3 py-1.5 text-left text-xs hover:bg-gray-700"
                                >
                                    {size.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="w-px h-5 bg-gray-600 mx-0.5" />

                {/* Text Formatting */}
                <button onClick={() => execCommand('bold')} className="p-1.5 theme-hover rounded" title="Bold (Ctrl+B)"><Bold size={14} /></button>
                <button onClick={() => execCommand('italic')} className="p-1.5 theme-hover rounded" title="Italic (Ctrl+I)"><Italic size={14} /></button>
                <button onClick={() => execCommand('underline')} className="p-1.5 theme-hover rounded" title="Underline (Ctrl+U)"><Underline size={14} /></button>
                <button onClick={() => execCommand('strikeThrough')} className="p-1.5 theme-hover rounded" title="Strikethrough"><Strikethrough size={14} /></button>

                <div className="w-px h-5 bg-gray-600 mx-0.5" />

                {/* Text Color */}
                <div className="relative dropdown-container">
                    <button
                        onClick={(e) => { e.stopPropagation(); setShowTextColorPicker(!showTextColorPicker); }}
                        className="p-1.5 theme-hover rounded flex items-center"
                        title="Text Color"
                    >
                        <Type size={14} />
                        <div className="w-3 h-1 bg-red-500 ml-0.5 rounded-sm" />
                    </button>
                    {showTextColorPicker && (
                        <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-700 rounded shadow-xl z-50 p-2">
                            <div className="grid grid-cols-10 gap-1">
                                {TEXT_COLORS.map(color => (
                                    <button
                                        key={color}
                                        onClick={() => { execCommand('foreColor', color); setShowTextColorPicker(false); }}
                                        className="w-5 h-5 rounded border border-gray-600 hover:scale-110 transition-transform"
                                        style={{ backgroundColor: color }}
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Highlight Color */}
                <div className="relative dropdown-container">
                    <button
                        onClick={(e) => { e.stopPropagation(); setShowHighlightPicker(!showHighlightPicker); }}
                        className="p-1.5 theme-hover rounded"
                        title="Highlight"
                    >
                        <Highlighter size={14} />
                    </button>
                    {showHighlightPicker && (
                        <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-700 rounded shadow-xl z-50 p-2">
                            <div className="grid grid-cols-4 gap-1 mb-2">
                                {HIGHLIGHT_COLORS.map(h => (
                                    <button
                                        key={h.color}
                                        onClick={() => { execCommand('hiliteColor', h.color); setShowHighlightPicker(false); }}
                                        className="w-6 h-6 rounded border border-gray-600 hover:scale-110 transition-transform"
                                        style={{ backgroundColor: h.color }}
                                        title={h.name}
                                    />
                                ))}
                            </div>
                            <button onClick={() => { execCommand('removeFormat'); setShowHighlightPicker(false); }} className="w-full text-xs py-1 hover:bg-gray-700 rounded">
                                Remove
                            </button>
                        </div>
                    )}
                </div>

                <div className="w-px h-5 bg-gray-600 mx-0.5" />

                {/* Alignment */}
                <button onClick={() => execCommand('justifyLeft')} className="p-1.5 theme-hover rounded" title="Align Left"><AlignLeft size={14} /></button>
                <button onClick={() => execCommand('justifyCenter')} className="p-1.5 theme-hover rounded" title="Center"><AlignCenter size={14} /></button>
                <button onClick={() => execCommand('justifyRight')} className="p-1.5 theme-hover rounded" title="Align Right"><AlignRight size={14} /></button>
                <button onClick={() => execCommand('justifyFull')} className="p-1.5 theme-hover rounded" title="Justify"><AlignJustify size={14} /></button>

                <div className="w-px h-5 bg-gray-600 mx-0.5" />

                {/* Lists & Indent */}
                <button onClick={() => execCommand('insertUnorderedList')} className="p-1.5 theme-hover rounded" title="Bullet List"><List size={14} /></button>
                <button onClick={() => execCommand('insertOrderedList')} className="p-1.5 theme-hover rounded" title="Numbered List"><ListOrdered size={14} /></button>
                <button onClick={() => execCommand('indent')} className="p-1.5 theme-hover rounded" title="Increase Indent"><Indent size={14} /></button>
                <button onClick={() => execCommand('outdent')} className="p-1.5 theme-hover rounded" title="Decrease Indent"><Outdent size={14} /></button>

                <div className="w-px h-5 bg-gray-600 mx-0.5" />

                {/* Block Format */}
                <select
                    onChange={(e) => execCommand('formatBlock', e.target.value)}
                    className="px-2 py-1 rounded theme-bg-secondary border border-white/10 text-[11px]"
                    defaultValue="p"
                >
                    <option value="p">Normal</option>
                    <option value="h1">Heading 1</option>
                    <option value="h2">Heading 2</option>
                    <option value="h3">Heading 3</option>
                    <option value="h4">Heading 4</option>
                    <option value="blockquote">Quote</option>
                    <option value="pre">Code</option>
                </select>

                <div className="w-px h-5 bg-gray-600 mx-0.5" />

                {/* Insert */}
                <button onClick={insertImage} className="p-1.5 theme-hover rounded" title="Insert Image"><Image size={14} /></button>

                <div className="relative dropdown-container">
                    <button onClick={(e) => { e.stopPropagation(); setShowTablePicker(!showTablePicker); }} className="p-1.5 theme-hover rounded" title="Insert Table">
                        <Table size={14} />
                    </button>
                    {showTablePicker && (
                        <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-700 rounded shadow-xl z-50 p-3">
                            <div className="text-xs text-gray-400 mb-2">Table: {tablePickerSize.rows} × {tablePickerSize.cols}</div>
                            <div className="grid gap-0.5" style={{ gridTemplateColumns: 'repeat(8, 1fr)' }}>
                                {Array.from({ length: 64 }).map((_, i) => {
                                    const row = Math.floor(i / 8) + 1;
                                    const col = (i % 8) + 1;
                                    const isSelected = row <= tablePickerSize.rows && col <= tablePickerSize.cols;
                                    return (
                                        <div
                                            key={i}
                                            onMouseEnter={() => setTablePickerSize({ rows: row, cols: col })}
                                            onClick={() => insertTable(row, col)}
                                            className={`w-4 h-4 border cursor-pointer transition-colors ${isSelected ? 'bg-blue-500 border-blue-400' : 'border-gray-600 hover:border-gray-500'}`}
                                        />
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                <button onClick={insertLink} className="p-1.5 theme-hover rounded" title="Insert Link"><Link size={14} /></button>
                <button onClick={() => insertAtCursor('<hr style="border: none; border-top: 1px solid #ccc; margin: 16px 0;" /><p><br></p>')} className="p-1.5 theme-hover rounded" title="Horizontal Line"><Minus size={14} /></button>

                {/* Templates */}
                <div className="relative dropdown-container">
                    <button onClick={(e) => { e.stopPropagation(); setShowTemplatePicker(!showTemplatePicker); }} className="p-1.5 theme-hover rounded" title="Templates">
                        <LayoutTemplate size={14} />
                    </button>
                    {showTemplatePicker && (
                        <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-700 rounded shadow-xl z-50 min-w-[140px] py-1">
                            {TEMPLATES.map(t => (
                                <button
                                    key={t.name}
                                    onClick={() => applyTemplate(t)}
                                    className="w-full px-3 py-2 text-left text-xs hover:bg-gray-700"
                                >
                                    {t.name}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="flex-1" />

                {/* Zoom */}
                <button onClick={() => setZoom(z => Math.max(50, z - 10))} className="p-1.5 theme-hover rounded" title="Zoom Out"><ZoomOut size={14} /></button>
                <span className="text-[10px] text-gray-400 w-10 text-center">{zoom}%</span>
                <button onClick={() => setZoom(z => Math.min(200, z + 10))} className="p-1.5 theme-hover rounded" title="Zoom In"><ZoomIn size={14} /></button>
            </div>

            {/* Find & Replace Bar */}
            {showFindReplace && (
                <div className="flex items-center gap-2 px-3 py-2 border-b theme-border theme-bg-tertiary">
                    <Search size={14} className="text-gray-500" />
                    <input
                        type="text"
                        value={findText}
                        onChange={(e) => setFindText(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && findInDocument()}
                        placeholder="Find..."
                        className="flex-1 max-w-[180px] bg-white/5 border border-white/10 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-500"
                        autoFocus
                    />
                    <input
                        type="text"
                        value={replaceText}
                        onChange={(e) => setReplaceText(e.target.value)}
                        placeholder="Replace..."
                        className="flex-1 max-w-[180px] bg-white/5 border border-white/10 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-500"
                    />
                    <button onClick={findInDocument} className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 rounded">Find</button>
                    <button onClick={replaceNext} disabled={!matchCount} className="px-2 py-1 text-xs theme-hover rounded disabled:opacity-30">Replace</button>
                    <button onClick={replaceAll} disabled={!matchCount} className="px-2 py-1 text-xs theme-hover rounded disabled:opacity-30">All</button>
                    {matchCount > 0 && <span className="text-xs text-gray-400">{matchCount} found</span>}
                    <button onClick={() => { setShowFindReplace(false); setFindText(''); setReplaceText(''); setMatchCount(0); }} className="p-1 theme-hover rounded">
                        <X size={12} />
                    </button>
                </div>
            )}

            {/* Document Area */}
            <div className="flex-1 overflow-auto theme-bg-primary">
                {/* Ruler */}
                {showRuler && viewMode === 'page' && (
                    <div className="sticky top-0 z-10 bg-gray-100 dark:bg-gray-800 border-b border-gray-300 dark:border-gray-700 h-6 flex items-end justify-center">
                        <div style={{ width: `${pageSize.width}in`, paddingLeft: `${pageSize.marginLeft}in`, paddingRight: `${pageSize.marginRight}in`, transform: `scale(${zoom / 100})`, transformOrigin: 'center bottom' }} className="flex items-end">
                            {Array.from({ length: Math.ceil(pageSize.width * 8) + 1 }).map((_, i) => {
                                const isInch = i % 8 === 0;
                                const isHalf = i % 4 === 0;
                                return (
                                    <div key={i} className="flex-1 flex justify-end">
                                        <div className={`w-px ${isInch ? 'h-4 bg-gray-600' : isHalf ? 'h-2 bg-gray-500' : 'h-1 bg-gray-400'}`} />
                                        {isInch && i > 0 && <span className="text-[8px] text-gray-500 ml-0.5 -translate-y-1">{i / 8}</span>}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Editor */}
                <div className={`${viewMode === 'page' ? 'py-8' : 'p-4'}`} style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center' }}>
                    <style>{`
                        .docx-editor { font-family: "${docFonts?.default || currentFont}", ${currentFont}, Arial, sans-serif; }
                        .docx-editor h1, .docx-editor h2, .docx-editor h3, .docx-editor h4, .docx-editor h5, .docx-editor h6 {
                            font-family: "${docFonts?.heading || docFonts?.default || currentFont}", ${currentFont}, Arial, sans-serif;
                        }
                        .docx-editor h1 { font-size: 2em; font-weight: bold; margin: 0.67em 0; color: inherit; min-height: 1.2em; line-height: ${docSpacing.lineHeight}; }
                        .docx-editor h2 { font-size: 1.5em; font-weight: bold; margin: 0.83em 0; color: inherit; min-height: 1.2em; line-height: ${docSpacing.lineHeight}; }
                        .docx-editor h3 { font-size: 1.17em; font-weight: bold; margin: 1em 0; color: inherit; min-height: 1.2em; line-height: ${docSpacing.lineHeight}; }
                        .docx-editor h4 { font-size: 1em; font-weight: bold; margin: 1.33em 0; color: inherit; min-height: 1.2em; line-height: ${docSpacing.lineHeight}; }
                        .docx-editor p { margin: 0; padding-top: ${docSpacing.paragraphBefore}pt; padding-bottom: ${docSpacing.paragraphAfter}pt; min-height: 1.2em; line-height: ${docSpacing.lineHeight}; }
                        .docx-editor ul, .docx-editor ol { padding-left: 2em; margin: 0.5em 0; line-height: ${docSpacing.lineHeight}; }
                        .docx-editor li { margin: 0.25em 0; line-height: ${docSpacing.lineHeight}; }
                        .docx-editor table { border-collapse: collapse; width: 100%; margin: 1em 0; }
                        .docx-editor td, .docx-editor th { border: 1px solid #ccc; padding: 8px; vertical-align: top; }
                        .docx-editor th { background: #f5f5f5; font-weight: bold; }
                        .docx-editor img { max-width: 100%; height: auto; }
                        .docx-editor blockquote { border-left: 4px solid #ccc; margin: 1em 0; padding-left: 1em; color: #666; font-style: italic; }
                        .docx-editor pre { background: #f4f4f4; padding: 1em; border-radius: 4px; overflow-x: auto; font-family: monospace; }
                        .docx-editor code { background: #f4f4f4; padding: 0.2em 0.4em; border-radius: 3px; font-family: monospace; }
                        .docx-editor a { color: #2563eb; text-decoration: underline; }
                        .docx-editor hr { border: none; border-top: 1px solid #ccc; margin: 1em 0; }
                        .docx-editor strong, .docx-editor b { font-weight: bold; }
                        .docx-editor em, .docx-editor i { font-style: italic; }
                        .docx-editor u { text-decoration: underline; }
                        .docx-editor s, .docx-editor strike { text-decoration: line-through; }
                        /* Page break styling */
                        .docx-editor .docx-page-break {
                            page-break-after: always;
                            break-after: page;
                            height: 0;
                            margin: 0;
                            padding: 0;
                            border: none;
                            border-top: 2px dashed #999;
                            margin: 2em 0;
                            position: relative;
                        }
                        .docx-editor .docx-page-break::after {
                            content: 'Page Break';
                            position: absolute;
                            top: -0.6em;
                            left: 50%;
                            transform: translateX(-50%);
                            background: ${docLightMode ? '#fff' : '#1a1a2e'};
                            padding: 0 0.5em;
                            font-size: 10px;
                            color: #999;
                            text-transform: uppercase;
                            letter-spacing: 0.1em;
                        }
                    `}</style>
                    <div
                        ref={editorRef}
                        contentEditable
                        suppressContentEditableWarning
                        onInput={handleInput}
                        onKeyDown={handleKeyDown}
                        className={`docx-editor outline-none ${viewMode === 'page' ? 'shadow-xl mx-auto' : ''}`}
                        style={{
                            width: viewMode === 'page' ? `${pageSize.width}in` : '100%',
                            minHeight: viewMode === 'page' ? `${pageSize.height}in` : '400px',
                            paddingTop: viewMode === 'page' ? `${pageSize.marginTop}in` : '16px',
                            paddingBottom: viewMode === 'page' ? `${pageSize.marginBottom}in` : '16px',
                            paddingLeft: viewMode === 'page' ? `${pageSize.marginLeft}in` : '16px',
                            paddingRight: viewMode === 'page' ? `${pageSize.marginRight}in` : '16px',
                            lineHeight: docSpacing.lineHeight,
                            fontSize: '12pt',
                            color: docLightMode ? '#000' : '#e5e5e5',
                            backgroundColor: viewMode === 'page' ? (docLightMode ? '#fff' : '#1a1a2e') : 'transparent',
                            boxSizing: 'border-box',
                        }}
                    />
                </div>
            </div>

            {/* Status Bar */}
            <div className="flex items-center justify-between px-3 py-1 border-t theme-border theme-bg-tertiary text-[10px] text-gray-500">
                <div className="flex items-center gap-4">
                    <span>Page {documentStats.pages}</span>
                    <span>{documentStats.words} words</span>
                    <span>{documentStats.chars} characters</span>
                </div>
                <div className="flex items-center gap-3">
                    {hasChanges && <span className="text-yellow-500">● Unsaved</span>}
                    <span>{viewMode === 'page' ? 'Page View' : 'Web View'}</span>
                    <span>{zoom}%</span>
                </div>
            </div>
        </div>
    );
};

// Custom comparison to prevent re-renders when layout changes but pane identity is the same
const arePropsEqual = (prevProps: any, nextProps: any) => {
    // Only re-render if the pane identity changes (nodeId) or content changes
    return prevProps.nodeId === nextProps.nodeId;
};

export default memo(DocxViewer, arePropsEqual);
