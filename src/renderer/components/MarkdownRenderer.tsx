import React, { useState, useRef, useCallback, memo, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomDark, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Copy, Check, Maximize2, Minimize2, Table, ChevronDown, ChevronUp, Download } from 'lucide-react';

// Utility to detect if content looks like tabular data (JSON array, CSV-like)
const detectTabularData = (content: string): { isTabular: boolean; data: any[] | null; type: 'json' | 'csv' | null } => {
    if (!content || typeof content !== 'string') return { isTabular: false, data: null, type: null };

    const trimmed = content.trim();

    // Try to parse as JSON array
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        try {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object' && parsed[0] !== null) {
                return { isTabular: true, data: parsed, type: 'json' };
            }
        } catch (e) {
            // Not valid JSON
        }
    }

    // Detect CSV-like content (lines with consistent delimiters)
    const lines = trimmed.split('\n').filter(l => l.trim());
    if (lines.length >= 2) {
        // Check for common delimiters: comma, tab, pipe
        const delimiters = [',', '\t', '|'];
        for (const delimiter of delimiters) {
            const counts = lines.map(line => (line.match(new RegExp(`\\${delimiter}`, 'g')) || []).length);
            const firstCount = counts[0];
            // If all lines have the same number of delimiters (and > 0), it's likely tabular
            if (firstCount > 0 && counts.every(c => c === firstCount)) {
                const headers = lines[0].split(delimiter).map(h => h.trim());
                const rows = lines.slice(1).map(line => {
                    const cells = line.split(delimiter).map(c => c.trim());
                    const row: Record<string, string> = {};
                    headers.forEach((h, i) => { row[h] = cells[i] || ''; });
                    return row;
                });
                if (rows.length > 0) {
                    return { isTabular: true, data: rows, type: 'csv' };
                }
            }
        }
    }

    return { isTabular: false, data: null, type: null };
};

// Interactive data table component
const DataTableComponent = memo(({ data, title }: { data: any[]; title?: string }) => {
    const [expanded, setExpanded] = useState(data.length <= 10);
    const [sortColumn, setSortColumn] = useState<string | null>(null);
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

    if (!data || data.length === 0) return null;

    const columns = Object.keys(data[0]);

    const sortedData = sortColumn
        ? [...data].sort((a, b) => {
            const aVal = a[sortColumn];
            const bVal = b[sortColumn];
            const comparison = String(aVal).localeCompare(String(bVal), undefined, { numeric: true });
            return sortDirection === 'asc' ? comparison : -comparison;
        })
        : data;

    const displayData = expanded ? sortedData : sortedData.slice(0, 5);

    const handleSort = (col: string) => {
        if (sortColumn === col) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortColumn(col);
            setSortDirection('asc');
        }
    };

    const handleExportCSV = () => {
        const csv = [
            columns.join(','),
            ...data.map(row => columns.map(col => `"${String(row[col] || '').replace(/"/g, '""')}"`).join(','))
        ].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'data.csv';
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="my-3 theme-bg-tertiary rounded-md overflow-hidden theme-border border">
            <div className="flex items-center justify-between px-3 py-2 theme-bg-secondary text-xs">
                <div className="flex items-center gap-2 theme-text-muted">
                    <Table size={14} className="text-blue-400" />
                    <span>{title || 'Data Table'}</span>
                    <span className="text-[10px] px-1.5 py-0.5 bg-blue-600/30 rounded">{data.length} rows</span>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleExportCSV}
                        className="p-1 rounded theme-hover theme-text-muted hover:theme-text-primary"
                        title="Export CSV"
                    >
                        <Download size={14} />
                    </button>
                </div>
            </div>
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                <table className="w-full text-xs">
                    <thead className="sticky top-0 theme-bg-secondary">
                        <tr>
                            {columns.map(col => (
                                <th
                                    key={col}
                                    onClick={() => handleSort(col)}
                                    className="px-3 py-2 text-left theme-text-muted cursor-pointer hover:theme-text-primary border-b theme-border whitespace-nowrap"
                                >
                                    <div className="flex items-center gap-1">
                                        {col}
                                        {sortColumn === col && (
                                            sortDirection === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
                                        )}
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {displayData.map((row, i) => (
                            <tr key={i} className="hover:theme-bg-primary transition-colors">
                                {columns.map(col => (
                                    <td key={col} className="px-3 py-1.5 border-b theme-border theme-text-primary whitespace-nowrap max-w-[300px] truncate" title={String(row[col] || '')}>
                                        {String(row[col] ?? '')}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {data.length > 5 && (
                <div className="px-3 py-2 theme-bg-secondary border-t theme-border">
                    <button
                        onClick={() => setExpanded(!expanded)}
                        className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                    >
                        {expanded ? (
                            <>
                                <ChevronUp size={12} /> Show less
                            </>
                        ) : (
                            <>
                                <ChevronDown size={12} /> Show all {data.length} rows
                            </>
                        )}
                    </button>
                </div>
            )}
        </div>
    );
});

// Export the detection function for use in other components
export { detectTabularData, DataTableComponent };
const customLightStyle = {
  'code[class*="language-"]': {
    color: '#1e293b',
    background: 'transparent',
  },
  'pre[class*="language-"]': {
    color: '#1e293b',
    background: '#fdf2f8',
  },
  'comment': { color: '#64748b', fontStyle: 'italic' },
  'prolog': { color: '#64748b' },
  'doctype': { color: '#64748b' },
  'cdata': { color: '#64748b' },
  'punctuation': { color: '#475569' },
  'property': { color: '#db2777' },
  'tag': { color: '#dc2626' },
  'boolean': { color: '#0891b2' },
  'number': { color: '#0891b2' },
  'constant': { color: '#0891b2' },
  'symbol': { color: '#0891b2' },
  'deleted': { color: '#dc2626' },
  'selector': { color: '#c026d3' },
  'attr-name': { color: '#c026d3' },
  'string': { color: '#059669' },
  'char': { color: '#059669' },
  'builtin': { color: '#7c3aed' },
  'inserted': { color: '#059669' },
  'operator': { color: '#475569' },
  'entity': { color: '#db2777' },
  'url': { color: '#0891b2' },
  'variable': { color: '#dc2626' },
  'atrule': { color: '#c026d3' },
  'attr-value': { color: '#059669' },
  'function': { color: '#2563eb' },
  'class-name': { color: '#ea580c' },
  'keyword': { color: '#db2777', fontWeight: 'bold' },
  'regex': { color: '#059669' },
  'important': { color: '#dc2626', fontWeight: 'bold' },
};

const CodeBlock = memo(({ node, inline, className, children, ...props }) => {
  const [copied, setCopied] = useState(false);
  const [showFloatingButton, setShowFloatingButton] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const scrollContainerRef = useRef(null);
  const expandedScrollContainerRef = useRef(null); 

  const match = /language-(\w+)/.exec(className || '');
  const codeString = String(children).replace(/\n$/, '');

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(codeString).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(err => console.error('Failed to copy code:', err));
  }, [codeString]);

  const handleScroll = useCallback(() => {
    if (scrollContainerRef.current && !isExpanded) {
      const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
      const isScrolled = scrollTop > 0;
      const hasScrollbar = scrollHeight > clientHeight;
      setShowFloatingButton(isScrolled && hasScrollbar);
    }
  }, [isExpanded]);

  const toggleExpand = useCallback(() => {
    setIsExpanded(prev => !prev);
    setShowFloatingButton(false);
  }, []);

  useEffect(() => {
    if (isExpanded && expandedScrollContainerRef.current) {
      const { scrollHeight } = expandedScrollContainerRef.current;
      expandedScrollContainerRef.current.scrollTop = scrollHeight;
    }
  }, [isExpanded, codeString]); 

  const isDarkMode = document.body.classList.contains('dark-mode');

  const shouldRenderInline = inline || codeString.length <= 60;
  if (shouldRenderInline) {
    return (
      <code className="theme-code-inline px-1 py-0.5 rounded-sm font-mono text-xs" {...props}>
        {children}
      </code>
    );
  }

  return (
    <>
      {/* Expanded overlay */}
      {isExpanded && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4">
          {/* Added h-full here to ensure the inner container takes full height */}
          <div className="w-full max-w-6xl h-full max-h-[calc(100vh-2rem)] theme-bg-tertiary rounded-md overflow-hidden theme-border border">
            <div className="flex items-center justify-between px-4 py-2 theme-bg-secondary text-sm theme-text-muted">
              <span>{match?.[1] || 'code'}</span>
              <div className="flex gap-2">
                <button
                  onClick={toggleExpand}
                  className="p-1 rounded theme-hover theme-text-muted hover:theme-text-primary"
                  aria-label="Collapse code"
                >
                  <Minimize2 size={16} />
                </button>
                <button
                  onClick={handleCopy}
                  className="p-1 rounded theme-hover theme-text-muted hover:theme-text-primary"
                  aria-label="Copy code"
                >
                  {copied ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
                </button>
              </div>
            </div>
            <div ref={expandedScrollContainerRef} className="overflow-auto h-[calc(100%-2.25rem)]">
<SyntaxHighlighter
  style={isDarkMode ? atomDark : customLightStyle}
  language={match?.[1]}
  PreTag="div"
  showLineNumbers={true}
  wrapLines={true}
  lineProps={{ style: { wordBreak: 'break-all', whiteSpace: 'pre-wrap' } }}
  {...props}
>
                {codeString}
              </SyntaxHighlighter>
            </div>
          </div>
        </div>
      )}

      {/* Regular code block */}
      <div className="relative group my-2 theme-bg-tertiary rounded-md overflow-hidden theme-border border">
        <div className="flex items-center justify-between px-4 py-1 theme-bg-secondary text-xs theme-text-muted">
          <span>{match?.[1] || 'code'}</span>
          <div className="flex gap-2">
            <button
              onClick={toggleExpand}
              className="p-1 rounded theme-hover theme-text-muted hover:theme-text-primary"
              aria-label="Expand code"
            >
              <Maximize2 size={14} />
            </button>
            <button
              onClick={handleCopy}
              className="p-1 rounded theme-hover theme-text-muted hover:theme-text-primary"
              aria-label="Copy code"
            >
              {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
            </button>
          </div>
        </div>

        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="overflow-auto max-h-[400px]"
        >
          <SyntaxHighlighter
            style={isDarkMode ? atomDark : oneLight}
            language={match?.[1]}
            PreTag="div"
            showLineNumbers={true}
            wrapLines={true}
            lineProps={{ style: { wordBreak: 'break-all', whiteSpace: 'pre-wrap' } }}
            {...props}
          >
            {codeString}
          </SyntaxHighlighter>
        </div>

        {showFloatingButton && (
          <div className="absolute bottom-4 right-4 z-10 transition-opacity opacity-0 group-hover:opacity-100">
            <button
              onClick={handleCopy}
              className="flex items-center gap-2 px-3 py-2 rounded-md shadow-lg theme-bg-secondary theme-border border theme-hover"
              aria-label="Copy code"
            >
              {copied ? (
                <Check size={16} className="text-green-500" />
              ) : (
                <Copy size={16} />
              )}
              <span className="text-xs font-semibold">Copy</span>
            </button>
          </div>
        )}
      </div>
    </>
  );
});

const ImageComponent = memo(({ src, alt, title }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const handleLoad = useCallback(() => {
    console.log('[IMAGE] Image loaded successfully');
    setIsLoading(false);
  }, []);

  const handleError = useCallback((e) => {
    setIsLoading(false);
    setHasError(true);
    console.error('[IMAGE] Image failed to load. Src:', src?.substring(0, 100));
  }, [src]);

  if (hasError) {
    return (
      <div className="max-w-full my-2 p-4 rounded-md border border-red-500 bg-red-900/20 text-red-300 text-sm">
        <div className="font-semibold mb-1">❌ Image Failed to Load</div>
        <div className="text-xs break-all font-mono">{src?.substring(0, 200) || 'No src provided'}</div>
      </div>
    );
  }

  return (
    <figure className="my-2 inline-block max-w-full">
      <div className="relative inline-block max-w-full">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-700/50 rounded-md">
            <div className="animate-spin">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full" />
            </div>
          </div>
        )}
        <img
          src={src || ''}
          alt={alt || title || 'Generated image'}
          title={title || alt}
          className={`max-w-full h-auto rounded-md theme-border border transition-opacity ${
            isLoading ? 'opacity-50' : 'opacity-100'
          }`}
          onLoad={handleLoad}
          onError={handleError}
          loading="lazy"
          style={{
            maxHeight: '600px',
            objectFit: 'contain',
          }}
        />
      </div>
      {alt && (
        <figcaption className="mt-2 text-xs text-gray-400 text-center italic">
          {alt}
        </figcaption>
      )}
    </figure>
  );
});


// Custom component to parse and render HTML img tags manually
const ContentWithImages = memo(({ content, onOpenFile }: { content: string; onOpenFile?: (path: string) => void }) => {
  if (!content || typeof content !== 'string') {
    return null;
  }

  // Split content by <img> tags and process each part
  const parts = [];
  let lastIndex = 0;
  const imgRegex = /<img\s+[^>]*src=["']([^"']+)["'][^>]*alt=["']([^"']*)["'][^>]*>/gi;
  
  let match;
  while ((match = imgRegex.exec(content)) !== null) {
    // Add markdown content before the image
    if (match.index > lastIndex) {
      const markdownPart = content.substring(lastIndex, match.index);
      parts.push({
        type: 'markdown',
        content: markdownPart,
        key: `md-${lastIndex}`
      });
    }
    
    // Add the image
    parts.push({
      type: 'image',
      src: match[1],
      alt: match[2],
      key: `img-${match.index}`
    });
    
    lastIndex = imgRegex.lastIndex;
  }
  
  // Add remaining markdown content
  if (lastIndex < content.length) {
    parts.push({
      type: 'markdown',
      content: content.substring(lastIndex),
      key: `md-${lastIndex}`
    });
  }
  
  // If no images found, return plain markdown
  if (parts.length === 0) {
    parts.push({
      type: 'markdown',
      content: content,
      key: 'md-0'
    });
  }

  return (
    <>
      {parts.map(part => {
        if (part.type === 'image') {
          return <ImageComponent key={part.key} src={part.src} alt={part.alt} />;
        } else {
          return (
            <ReactMarkdown
              key={part.key}
              remarkPlugins={[remarkGfm]}
              components={{
                code: ({ node, inline, className, children, ...props }: any) => {
                  // For inline code that looks like a file path, make it clickable
                  const text = String(children).replace(/\n$/, '');
                  // In react-markdown v9, detect inline by: no className AND no newlines in content
                  const isInline = inline !== false && !className && !text.includes('\n');
                  // More permissive file path regex - allows common path characters
                  const isFilePath = /^(\/[^\s<>"'`]+|~\/[^\s<>"'`]+|[A-Za-z]:\\[^\s<>"'`]+)$/.test(text) && text.length > 2;

                  if (isInline && isFilePath && onOpenFile) {
                    return (
                      <code
                        className="theme-code-inline px-1 py-0.5 rounded-sm font-mono text-xs text-blue-400 hover:text-blue-300 cursor-pointer hover:underline"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onOpenFile(text);
                        }}
                        title={`Open ${text}`}
                        {...props}
                      >
                        {children}
                      </code>
                    );
                  }

                  // Use the regular CodeBlock for non-path code
                  return <CodeBlock node={node} inline={isInline} className={className} {...props}>{children}</CodeBlock>;
                },
                img: ImageComponent,
                p: ({ node, children, ...props }) => {
                  // Process children to make file paths clickable
                  const processChildren = (child: any): any => {
                    if (typeof child === 'string') {
                      return <TextWithPaths text={child} onOpenFile={onOpenFile} />;
                    }
                    if (Array.isArray(child)) {
                      return child.map((c, i) => <React.Fragment key={i}>{processChildren(c)}</React.Fragment>);
                    }
                    return child;
                  };
                  return <p className="mb-2 theme-text-primary" {...props}>{processChildren(children)}</p>;
                },
                a: ({ node, ...props }) => (
                  <a className="theme-text-link hover:underline font-medium" target="_blank" rel="noopener noreferrer" {...props} />
                ),
                ul: ({ node, ...props }) => (
                  <ul className="list-disc list-outside pl-5 mb-3 theme-text-primary" {...props} />
                ),
                ol: ({ node, ...props }) => (
                  <ol className="list-decimal list-outside pl-5 mb-3 theme-text-primary" {...props} />
                ),
                li: ({ node, children, ...props }) => (
                  <li className="mb-1" {...props}>{children}</li>
                ),
                h1: ({ node, ...props }) => <h1 className="text-xl font-bold mb-2 mt-4 theme-text-primary" {...props} />,
                h2: ({ node, ...props }) => <h2 className="text-lg font-bold mb-2 mt-3 theme-text-primary" {...props} />,
                h3: ({ node, ...props }) => <h3 className="text-base font-bold mb-2 mt-2 theme-text-primary" {...props} />,
                blockquote: ({ node, ...props }) => (
                  <blockquote className="border-l-4 theme-border-accent pl-4 italic theme-text-secondary my-2 theme-bg-secondary p-3 rounded-r" {...props} />
                ),
                table: ({ node, ...props }) => <table className="border-collapse w-full my-3 theme-border border rounded overflow-hidden" {...props} />,
                th: ({ node, ...props }) => <th className="theme-border border p-2 text-left theme-text-primary theme-bg-secondary font-semibold" {...props} />,
                td: ({ node, ...props }) => <td className="theme-border border p-2 theme-text-primary" {...props} />,
                tr: ({ node, ...props }) => <tr className="even:theme-bg-secondary" {...props} />,
              }}
              className="theme-text-primary"
            >
              {part.content}
            </ReactMarkdown>
          );
        }
      })}
    </>
  );
});


// Regex to detect file paths (Unix and Windows styles) - more permissive
const FILE_PATH_REGEX = /(?:^|[\s`'"({\[])((?:\/[^\s<>"'`()\[\]{}]+)+|(?:[A-Za-z]:\\[^\s<>"'`()\[\]{}]+)+|~\/[^\s<>"'`()\[\]{}]+)/g;

// Component to render text with clickable file paths
const TextWithPaths = memo(({ text, onOpenFile }: { text: string; onOpenFile?: (path: string) => void }) => {
  if (!onOpenFile || !text) return <>{text}</>;

  const parts: (string | JSX.Element)[] = [];
  let lastIndex = 0;
  let match;

  // Reset regex
  FILE_PATH_REGEX.lastIndex = 0;

  while ((match = FILE_PATH_REGEX.exec(text)) !== null) {
    const fullMatch = match[0];
    const path = match[1];
    const matchStart = match.index + (fullMatch.length - path.length);

    // Add text before the path
    if (matchStart > lastIndex) {
      parts.push(text.slice(lastIndex, matchStart));
    }

    // Add clickable path
    parts.push(
      <span
        key={matchStart}
        className="text-blue-400 hover:text-blue-300 hover:underline cursor-pointer font-mono"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onOpenFile(path);
        }}
        title={`Open ${path}`}
      >
        {path}
      </span>
    );

    lastIndex = matchStart + path.length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return <>{parts.length > 0 ? parts : text}</>;
});

const MarkdownRenderer = ({ content, onOpenFile }: { content: string; onOpenFile?: (path: string) => void }) => {
  // Check for tabular data first
  const { isTabular, data } = detectTabularData(content || '');

  if (isTabular && data) {
    return <DataTableComponent data={data} />;
  }

  return <ContentWithImages content={content} onOpenFile={onOpenFile} />;
};

// Custom comparison to prevent reload on pane resize
const arePropsEqual = (prevProps: any, nextProps: any) => {
    return prevProps.nodeId === nextProps.nodeId;
};

export default memo(MarkdownRenderer, arePropsEqual);