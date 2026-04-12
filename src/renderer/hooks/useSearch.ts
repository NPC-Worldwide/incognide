import { useState, useEffect } from 'react';

export function useSearch() {
    const [searchTerm, setSearchTerm] = useState('');
    const [webSearchTerm, setWebSearchTerm] = useState('');
    const [webSearchProvider, setWebSearchProvider] = useState<string>(() => {
        return (localStorage.getItem('npc-browser-search-engine') as string) || 'sibiji';
    });
    useEffect(() => {
        const onStorage = (e: StorageEvent) => {
            if (e.key === 'npc-browser-search-engine' && e.newValue) setWebSearchProvider(e.newValue);
        };
        window.addEventListener('storage', onStorage);
        const onCustom = (e: any) => { if (e.detail) setWebSearchProvider(e.detail); };
        window.addEventListener('search-engine-changed' as any, onCustom);
        return () => {
            window.removeEventListener('storage', onStorage);
            window.removeEventListener('search-engine-changed' as any, onCustom);
        };
    }, []);
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
