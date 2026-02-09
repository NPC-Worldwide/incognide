import { useState } from 'react';

export function useSearch() {
    const [searchTerm, setSearchTerm] = useState('');
    const [webSearchTerm, setWebSearchTerm] = useState('');
    const [webSearchProvider, setWebSearchProvider] = useState<string>(() => {
        return (localStorage.getItem('web-search-provider') as string) || 'duckduckgo';
    });
    const [isSearching, setIsSearching] = useState(false);
    const [isGlobalSearch, setIsGlobalSearch] = useState(false);
    const [searchLoading, setSearchLoading] = useState(false);
    const [deepSearchResults, setDeepSearchResults] = useState([]);
    const [messageSearchResults, setMessageSearchResults] = useState([]);
    const [activeSearchResult, setActiveSearchResult] = useState(null);
    const [searchResultsModalOpen, setSearchResultsModalOpen] = useState(false);
    const [localSearch, setLocalSearch] = useState({
        isActive: false,
        term: '',
        paneId: null as string | null,
        results: [] as any[],
        currentIndex: -1
    });

    return {
        searchTerm,
        setSearchTerm,
        webSearchTerm,
        setWebSearchTerm,
        webSearchProvider,
        setWebSearchProvider,
        isSearching,
        setIsSearching,
        isGlobalSearch,
        setIsGlobalSearch,
        searchLoading,
        setSearchLoading,
        deepSearchResults,
        setDeepSearchResults,
        messageSearchResults,
        setMessageSearchResults,
        activeSearchResult,
        setActiveSearchResult,
        searchResultsModalOpen,
        setSearchResultsModalOpen,
        localSearch,
        setLocalSearch,
    };
}
