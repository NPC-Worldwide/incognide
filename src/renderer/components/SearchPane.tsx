import { getFileName } from './utils';
import React, { useState, useEffect, useCallback } from 'react';
import { Search, FileText, MessageSquare, Database, Network, X, Loader2 } from 'lucide-react';

interface SearchPaneProps {
    initialQuery?: string;
    currentPath?: string;
    onOpenFile?: (path: string) => void;
    onOpenConversation?: (id: string) => void;
}

type SearchCategory = 'all' | 'files' | 'conversations' | 'memories' | 'kg';

interface SearchResult {
    type: 'file' | 'conversation' | 'memory' | 'kg-fact' | 'kg-concept';
    title: string;
    snippet?: string;
    path?: string;
    id?: string;
    metadata?: Record<string, any>;
}

const SearchPane: React.FC<SearchPaneProps> = ({
    initialQuery = '',
    currentPath = '',
    onOpenFile,
    onOpenConversation,
}) => {
    const [query, setQuery] = useState(initialQuery);
    const [category, setCategory] = useState<SearchCategory>('all');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [useSemanticSearch, setUseSemanticSearch] = useState(false);

    // Perform search
    const performSearch = useCallback(async () => {
        if (!query.trim()) {
            setResults([]);
            return;
        }

        setLoading(true);
        setError(null);
        const allResults: SearchResult[] = [];

        try {
            // Search files
            if (category === 'all' || category === 'files') {
                try {
                    const fileResults = await (window as any).api?.searchFiles?.({
                        query: query,
                        path: currentPath,
                        limit: 20
                    });
                    if (fileResults?.files) {
                        allResults.push(...fileResults.files.map((f: any) => ({
                            type: 'file' as const,
                            title: f.name || getFileName(f.path) || 'Unknown',
                            path: f.path,
                            snippet: f.match || f.snippet,
                        })));
                    }
                } catch (e) {
                    console.error('File search error:', e);
                }
            }

            // Search conversations
            if (category === 'all' || category === 'conversations') {
                try {
                    const convoResults = await (window as any).api?.searchConversations?.({
                        query: query,
                        limit: 20
                    });
                    if (convoResults?.conversations) {
                        allResults.push(...convoResults.conversations.map((c: any) => ({
                            type: 'conversation' as const,
                            title: c.title || c.preview?.slice(0, 50) || 'Conversation',
                            id: c.id,
                            snippet: c.preview || c.match,
                            metadata: { date: c.created_at }
                        })));
                    }
                } catch (e) {
                    console.error('Conversation search error:', e);
                }
            }

            // Search memories
            if (category === 'all' || category === 'memories') {
                try {
                    const memoryResults = await (window as any).api?.memory_search?.({
                        q: query,
                        directory_path: currentPath,
                        limit: 20
                    });
                    if (memoryResults?.memories) {
                        allResults.push(...memoryResults.memories.map((m: any) => ({
                            type: 'memory' as const,
                            title: (m.final_memory || m.initial_memory || '').slice(0, 60) + '...',
                            snippet: m.final_memory || m.initial_memory,
                            id: m.id?.toString(),
                            metadata: { status: m.status, npc: m.npc }
                        })));
                    }
                } catch (e) {
                    console.error('Memory search error:', e);
                }
            }

            // Search KG
            if (category === 'all' || category === 'kg') {
                try {
                    const searchFn = useSemanticSearch
                        ? (window as any).api?.kg_search_semantic
                        : (window as any).api?.kg_search;

                    const kgResults = await searchFn?.({
                        q: query,
                        limit: 20,
                        type: 'both'
                    });

                    if (kgResults?.facts) {
                        allResults.push(...kgResults.facts.map((f: any) => ({
                            type: 'kg-fact' as const,
                            title: (f.statement || '').slice(0, 60) + '...',
                            snippet: f.statement,
                            metadata: { generation: f.generation, distance: f.distance }
                        })));
                    }
                    if (kgResults?.concepts) {
                        allResults.push(...kgResults.concepts.map((c: any) => ({
                            type: 'kg-concept' as const,
                            title: c.name,
                            snippet: c.description,
                            metadata: { generation: c.generation }
                        })));
                    }
                } catch (e) {
                    console.error('KG search error:', e);
                }
            }

            setResults(allResults);
        } catch (err: any) {
            setError(err.message || 'Search failed');
        } finally {
            setLoading(false);
        }
    }, [query, category, currentPath, useSemanticSearch]);

    // Search on Enter or when category changes
    useEffect(() => {
        if (query.trim()) {
            const debounce = setTimeout(() => {
                performSearch();
            }, 300);
            return () => clearTimeout(debounce);
        }
    }, [query, category, useSemanticSearch]);

    // Initial search if query provided
    useEffect(() => {
        if (initialQuery) {
            performSearch();
        }
    }, []);

    const handleResultClick = (result: SearchResult) => {
        if (result.type === 'file' && result.path && onOpenFile) {
            onOpenFile(result.path);
        } else if (result.type === 'conversation' && result.id && onOpenConversation) {
            onOpenConversation(result.id);
        }
    };

    const getResultIcon = (type: SearchResult['type']) => {
        switch (type) {
            case 'file': return <FileText size={14} className="text-blue-400" />;
            case 'conversation': return <MessageSquare size={14} className="text-green-400" />;
            case 'memory': return <Database size={14} className="text-amber-400" />;
            case 'kg-fact': return <Network size={14} className="text-purple-400" />;
            case 'kg-concept': return <Network size={14} className="text-cyan-400" />;
        }
    };

    const getResultTypeLabel = (type: SearchResult['type']) => {
        switch (type) {
            case 'file': return 'File';
            case 'conversation': return 'Conversation';
            case 'memory': return 'Memory';
            case 'kg-fact': return 'KG Fact';
            case 'kg-concept': return 'KG Concept';
        }
    };

    const categories: { value: SearchCategory; label: string; icon: React.ReactNode }[] = [
        { value: 'all', label: 'All', icon: <Search size={12} /> },
        { value: 'files', label: 'Files', icon: <FileText size={12} /> },
        { value: 'conversations', label: 'Conversations', icon: <MessageSquare size={12} /> },
        { value: 'memories', label: 'Memories', icon: <Database size={12} /> },
        { value: 'kg', label: 'Knowledge Graph', icon: <Network size={12} /> },
    ];

    return (
        <div className="flex-1 flex flex-col overflow-hidden theme-bg-secondary">
            {/* Header */}
            <div className="p-4 border-b theme-border space-y-3">
                <div className="flex items-center gap-2">
                    <Search size={20} className="text-blue-400" />
                    <h3 className="text-lg font-semibold">Search</h3>
                </div>

                {/* Search input */}
                <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && performSearch()}
                        placeholder="Search files, conversations, memories, knowledge..."
                        className="w-full pl-9 pr-4 py-2 text-sm bg-gray-800 text-white border border-gray-600 rounded-lg focus:border-blue-500 focus:outline-none"
                        autoFocus
                    />
                    {query && (
                        <button
                            onClick={() => { setQuery(''); setResults([]); }}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                        >
                            <X size={14} />
                        </button>
                    )}
                </div>

                {/* Category tabs */}
                <div className="flex flex-wrap gap-1">
                    {categories.map((cat) => (
                        <button
                            key={cat.value}
                            onClick={() => setCategory(cat.value)}
                            className={`flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg transition-colors ${
                                category === cat.value
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                            }`}
                        >
                            {cat.icon}
                            {cat.label}
                        </button>
                    ))}
                </div>

                {/* Options */}
                {category === 'kg' && (
                    <label className="flex items-center gap-2 text-xs text-gray-400">
                        <input
                            type="checkbox"
                            checked={useSemanticSearch}
                            onChange={(e) => setUseSemanticSearch(e.target.checked)}
                            className="rounded"
                        />
                        Use semantic search (vector similarity)
                    </label>
                )}
            </div>

            {/* Results */}
            <div className="flex-1 overflow-y-auto p-4">
                {error && (
                    <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded text-red-300 text-sm">
                        {error}
                    </div>
                )}

                {loading ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 size={24} className="animate-spin text-blue-400" />
                    </div>
                ) : results.length === 0 ? (
                    <div className="text-center py-12 text-gray-400">
                        {query ? 'No results found' : 'Enter a search term to begin'}
                    </div>
                ) : (
                    <div className="space-y-2">
                        <div className="text-xs text-gray-500 mb-3">
                            {results.length} result{results.length !== 1 ? 's' : ''}
                        </div>
                        {results.map((result, i) => (
                            <button
                                key={`${result.type}-${result.id || result.path || i}`}
                                onClick={() => handleResultClick(result)}
                                className="w-full text-left p-3 bg-gray-800 rounded-lg border border-gray-700 hover:border-blue-500/50 transition-colors"
                            >
                                <div className="flex items-start gap-3">
                                    <div className="mt-0.5">
                                        {getResultIcon(result.type)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-400">
                                                {getResultTypeLabel(result.type)}
                                            </span>
                                            {result.metadata?.generation !== undefined && (
                                                <span className="text-xs text-gray-500">
                                                    Gen {result.metadata.generation}
                                                </span>
                                            )}
                                            {result.metadata?.distance !== undefined && (
                                                <span className="text-xs text-gray-500">
                                                    Dist: {result.metadata.distance.toFixed(3)}
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-sm font-medium text-white truncate">
                                            {result.title}
                                        </div>
                                        {result.snippet && (
                                            <div className="text-xs text-gray-400 mt-1 line-clamp-2">
                                                {result.snippet}
                                            </div>
                                        )}
                                        {result.path && (
                                            <div className="text-xs text-gray-500 mt-1 truncate">
                                                {result.path}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="p-3 border-t theme-border text-xs text-gray-500">
                Press Enter to search • Click result to open
            </div>
        </div>
    );
};

export default SearchPane;
