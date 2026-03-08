import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    FileText, Search, Grid, List, RefreshCw, Folder, Book, BookOpen, BookMarked,
    SortAsc, SortDesc, Home, FolderOpen, Star, ChevronRight, ChevronDown,
    Plus, Trash2, Edit3, Save, X, Eye, Download, Upload, Layers, Tag,
    PenTool, AlignLeft, Type, Image, LayoutGrid, Bookmark, MessageSquare,
    Clock, BarChart3, Settings, Archive, Library, Sparkles, FileJson,
    ChevronLeft, MoreVertical, Copy, Move, Check, Hash, Bold, Italic,
    Heading1, Heading2, Heading3, ListOrdered, Quote, Code, Link,
    Minus, CornerDownLeft, Maximize2, Minimize2, Columns, PanelLeft
} from 'lucide-react';
import {
    NovelEditor, ScreenplayEditor, PoetryEditor, JournalEditor, MangaEditor
} from 'npcts';

// ─── Types ───

interface Document {
    name: string;
    path: string;
    type: 'pdf' | 'epub' | 'docx' | 'txt' | 'md';
    size: number;
    modified: string;
    favorite?: boolean;
}

interface WritingProject {
    id: string;
    title: string;
    author: string;
    synopsis: string;
    genre: string;
    type: 'novel' | 'story' | 'manga' | 'screenplay' | 'poetry' | 'journal';
    chapters: WritingChapter[];
    characters: WritingCharacter[];
    notes: string;
    wordGoal: number;
    createdAt: string;
    updatedAt: string;
    coverColor: string;
}

interface MangaPanel {
    id: string;
    position: number;
    imageUrl?: string;
    description: string;
}

interface MangaPage {
    id: string;
    number: number;
    layout: 'full' | 'split-horizontal' | 'split-vertical' | 'quad' | 'three-top' | 'three-bottom' | null;
    panels: MangaPanel[];
}

interface WritingChapter {
    id: string;
    title: string;
    content: string;
    number: number;
    wordCount: number;
    status: 'draft' | 'revision' | 'final';
    notes: string;
    createdAt: string;
    updatedAt: string;
    pages?: MangaPage[];
}

interface WritingCharacter {
    id: string;
    name: string;
    description: string;
    role: 'protagonist' | 'antagonist' | 'supporting' | 'minor';
    notes: string;
}

interface BookAnnotation {
    id: string;
    docPath: string;
    text: string;
    note: string;
    page?: number;
    color: string;
    createdAt: string;
}

interface ReadingProgress {
    docPath: string;
    currentPage: number;
    totalPages: number;
    lastRead: string;
    bookmarks: number[];
}

interface BookCollection {
    id: string;
    name: string;
    description: string;
    color: string;
    docPaths: string[];
}

interface GrimoireProps {
    currentPath: string;
    onOpenDocument: (path: string, type: string) => void;
    onClose?: () => void;
}

// ─── Helpers ───

const formatFileSize = (bytes: number): string => {
    if (!bytes || bytes === 0) return '--';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const formatDate = (isoString: string): string => {
    if (!isoString) return '--';
    try {
        return new Date(isoString).toLocaleDateString();
    } catch { return '--'; }
};

const generateId = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const DOC_EXTENSIONS = ['pdf', 'epub', 'docx', 'txt', 'md'];

const COVER_COLORS = [
    'from-red-800 to-red-950', 'from-blue-800 to-blue-950', 'from-green-800 to-green-950',
    'from-purple-800 to-purple-950', 'from-amber-800 to-amber-950', 'from-cyan-800 to-cyan-950',
    'from-rose-800 to-rose-950', 'from-indigo-800 to-indigo-950', 'from-emerald-800 to-emerald-950',
    'from-orange-800 to-orange-950', 'from-teal-800 to-teal-950', 'from-violet-800 to-violet-950',
];

const HIGHLIGHT_COLORS = ['#fde047', '#86efac', '#93c5fd', '#f9a8d4', '#fdba74', '#c4b5fd'];

const GENRES = ['Fantasy', 'Sci-Fi', 'Mystery', 'Romance', 'Horror', 'Thriller', 'Literary', 'Historical', 'Comedy', 'Drama', 'Poetry', 'Non-Fiction', 'Other'];

const getDocIcon = (type: string, size: number = 20) => {
    const colors: Record<string, string> = { pdf: 'text-red-400', epub: 'text-green-400', docx: 'text-blue-400', txt: 'text-gray-400', md: 'text-purple-400' };
    return <FileText size={size} className={colors[type] || 'text-gray-400'} />;
};

const countWords = (text: string): number => {
    if (!text) return 0;
    return text.trim().split(/\s+/).filter(Boolean).length;
};

// ─── Component ───

const Grimoire: React.FC<GrimoireProps> = ({ currentPath, onOpenDocument }) => {
    // ─── Mode ───
    const [activeMode, setActiveMode] = useState<'browse' | 'write' | 'collections' | 'reading'>(() =>
        (localStorage.getItem('grimoire_mode') as any) || 'browse'
    );
    useEffect(() => { localStorage.setItem('grimoire_mode', activeMode); }, [activeMode]);

    // ─── Browse state ───
    const [documents, setDocuments] = useState<Document[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [sortBy, setSortBy] = useState<'name' | 'size' | 'modified' | 'type'>('name');
    const [sortAsc, setSortAsc] = useState(true);
    const [selectedDoc, setSelectedDoc] = useState<string | null>(null);
    const [favorites, setFavorites] = useState<Set<string>>(() => {
        const saved = localStorage.getItem('grimoire_favorites');
        return saved ? new Set(JSON.parse(saved)) : new Set();
    });
    const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
    const [activeSource, setActiveSource] = useState<'workspace' | 'library' | 'all'>('all');

    // ─── Writing state ───
    const [projects, setProjects] = useState<WritingProject[]>(() => {
        const saved = localStorage.getItem('grimoire_projects');
        return saved ? JSON.parse(saved) : [];
    });
    const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
    const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
    const [showNewProject, setShowNewProject] = useState(false);
    const [newProjectTitle, setNewProjectTitle] = useState('');
    const [newProjectType, setNewProjectType] = useState<WritingProject['type']>('novel');
    const [writeSidebarOpen, setWriteSidebarOpen] = useState(true);
    const [writeView, setWriteView] = useState<'chapter' | 'outline' | 'characters' | 'notes'>('chapter');
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showProjectSettings, setShowProjectSettings] = useState(false);
    const editorRef = useRef<HTMLTextAreaElement>(null);
    const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // ─── Collections state ───
    const [collections, setCollections] = useState<BookCollection[]>(() => {
        const saved = localStorage.getItem('grimoire_collections');
        return saved ? JSON.parse(saved) : [];
    });
    const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null);
    const [showNewCollection, setShowNewCollection] = useState(false);
    const [newCollectionName, setNewCollectionName] = useState('');

    // ─── Reading state ───
    const [annotations, setAnnotations] = useState<BookAnnotation[]>(() => {
        const saved = localStorage.getItem('grimoire_annotations');
        return saved ? JSON.parse(saved) : [];
    });
    const [readingProgress, setReadingProgress] = useState<ReadingProgress[]>(() => {
        const saved = localStorage.getItem('grimoire_reading_progress');
        return saved ? JSON.parse(saved) : [];
    });

    // ─── Persistence ───
    const saveProjects = useCallback((p: WritingProject[]) => {
        setProjects(p);
        localStorage.setItem('grimoire_projects', JSON.stringify(p));
    }, []);

    const saveCollections = useCallback((c: BookCollection[]) => {
        setCollections(c);
        localStorage.setItem('grimoire_collections', JSON.stringify(c));
    }, []);

    const saveAnnotations = useCallback((a: BookAnnotation[]) => {
        setAnnotations(a);
        localStorage.setItem('grimoire_annotations', JSON.stringify(a));
    }, []);

    const saveFavorites = useCallback((favs: Set<string>) => {
        setFavorites(favs);
        localStorage.setItem('grimoire_favorites', JSON.stringify([...favs]));
    }, []);

    // ─── Browse logic ───
    const scanDirectory = useCallback(async (dirPath: string, maxDepth: number = 3): Promise<Document[]> => {
        if (!dirPath) return [];
        const docs: Document[] = [];
        const MAX_DOCS = 500;
        let dirCount = 0;
        const scan = async (path: string, depth: number) => {
            if (depth > maxDepth || docs.length >= MAX_DOCS) return;
            try {
                const items = await (window as any).api?.readDirectory?.(path);
                if (!items || !Array.isArray(items)) return;
                // Yield to UI thread every 20 directories so clicks aren't blocked
                if (++dirCount % 20 === 0) await new Promise(r => setTimeout(r, 0));
                for (const item of items) {
                    if (docs.length >= MAX_DOCS) break;
                    if (item.isDirectory) {
                        if (!['node_modules', '.git', '__pycache__', '.next', 'dist', 'build', '.venv', 'venv'].includes(item.name)) {
                            await scan(item.path, depth + 1);
                        }
                    } else {
                        const ext = item.name.split('.').pop()?.toLowerCase() || '';
                        if (DOC_EXTENSIONS.includes(ext)) {
                            docs.push({
                                name: item.name, path: item.path,
                                type: ext as Document['type'],
                                size: item.size || 0, modified: item.modified || ''
                            });
                        }
                    }
                }
            } catch (e) { console.warn(`Failed to scan ${path}:`, e); }
        };
        await scan(dirPath, 0);
        return docs;
    }, []);

    const loadDocuments = useCallback(async () => {
        setLoading(true);
        try {
            const allDocs: Document[] = [];
            if (activeSource === 'workspace' || activeSource === 'all') {
                allDocs.push(...await scanDirectory(currentPath));
            }
            if (activeSource === 'library' || activeSource === 'all') {
                const homeDir = await (window as any).api?.getHomeDir?.();
                if (homeDir) {
                    try {
                        const libraryPath = `${homeDir}/.npcsh/pdfs`;
                        await (window as any).api?.ensureDir?.(libraryPath);
                        allDocs.push(...await scanDirectory(libraryPath));
                    } catch {}
                }
            }
            setDocuments(Array.from(new Map(allDocs.map(d => [d.path, d])).values()));
        } catch {}
        setLoading(false);
    }, [currentPath, activeSource, scanDirectory]);

    // Load documents when browse tab is active and deps change
    useEffect(() => {
        if (activeMode === 'browse') loadDocuments();
    }, [activeMode, loadDocuments]);

    const toggleFavorite = useCallback((path: string) => {
        const next = new Set(favorites);
        if (next.has(path)) next.delete(path); else next.add(path);
        saveFavorites(next);
    }, [favorites, saveFavorites]);

    const filteredDocs = useMemo(() => {
        let result = [...documents];
        if (showFavoritesOnly) result = result.filter(d => favorites.has(d.path));
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            result = result.filter(d => d.name.toLowerCase().includes(q));
        }
        result.sort((a, b) => {
            let cmp = 0;
            if (sortBy === 'name') cmp = a.name.localeCompare(b.name);
            else if (sortBy === 'size') cmp = (a.size || 0) - (b.size || 0);
            else if (sortBy === 'modified') cmp = (a.modified || '').localeCompare(b.modified || '');
            else if (sortBy === 'type') cmp = a.type.localeCompare(b.type);
            return sortAsc ? cmp : -cmp;
        });
        return result;
    }, [documents, searchQuery, sortBy, sortAsc, showFavoritesOnly, favorites]);

    // ─── Writing logic ───
    const activeProject = useMemo(() => projects.find(p => p.id === activeProjectId) || null, [projects, activeProjectId]);
    const activeChapter = useMemo(() => activeProject?.chapters.find(c => c.id === activeChapterId) || null, [activeProject, activeChapterId]);

    const createProject = useCallback(() => {
        if (!newProjectTitle.trim()) return;
        const project: WritingProject = {
            id: generateId(),
            title: newProjectTitle.trim(),
            author: '',
            synopsis: '',
            genre: '',
            type: newProjectType,
            chapters: [{
                id: generateId(),
                title: newProjectType === 'poetry' ? 'Poem 1' : newProjectType === 'journal' ? 'Journal' : newProjectType === 'manga' ? 'Volume 1' : newProjectType === 'screenplay' ? 'Act 1' : 'Chapter 1',
                content: newProjectType === 'screenplay' ? JSON.stringify([{ id: '1', type: 'scene', text: '' }]) : '',
                number: 1,
                wordCount: 0,
                status: 'draft',
                notes: '',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                ...(newProjectType === 'manga' ? { pages: [] } : {}),
            }],
            characters: [],
            notes: '',
            wordGoal: newProjectType === 'novel' ? 50000 : newProjectType === 'story' ? 5000 : newProjectType === 'screenplay' ? 25000 : newProjectType === 'poetry' ? 1000 : 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            coverColor: COVER_COLORS[Math.floor(Math.random() * COVER_COLORS.length)],
        };
        const updated = [...projects, project];
        saveProjects(updated);
        setActiveProjectId(project.id);
        setActiveChapterId(project.chapters[0].id);
        setShowNewProject(false);
        setNewProjectTitle('');
    }, [newProjectTitle, newProjectType, projects, saveProjects]);

    const deleteProject = useCallback((id: string) => {
        saveProjects(projects.filter(p => p.id !== id));
        if (activeProjectId === id) { setActiveProjectId(null); setActiveChapterId(null); }
    }, [projects, activeProjectId, saveProjects]);

    const updateProject = useCallback((id: string, updates: Partial<WritingProject>) => {
        saveProjects(projects.map(p => p.id === id ? { ...p, ...updates, updatedAt: new Date().toISOString() } : p));
    }, [projects, saveProjects]);

    const addChapter = useCallback(() => {
        if (!activeProject) return;
        const n = activeProject.chapters.length + 1;
        const label = activeProject.type === 'poetry' ? `Poem ${n}` : activeProject.type === 'journal' ? `Journal ${n}` : activeProject.type === 'manga' ? `Volume ${n}` : activeProject.type === 'screenplay' ? `Act ${n}` : `Chapter ${n}`;
        const newChapter: WritingChapter = {
            id: generateId(),
            title: label,
            content: activeProject.type === 'screenplay' ? JSON.stringify([{ id: '1', type: 'scene', text: '' }]) : '',
            number: n,
            wordCount: 0,
            status: 'draft',
            notes: '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            ...(activeProject.type === 'manga' ? { pages: [] } : {}),
        };
        updateProject(activeProject.id, { chapters: [...activeProject.chapters, newChapter] });
        setActiveChapterId(newChapter.id);
    }, [activeProject, updateProject]);

    const deleteChapter = useCallback((chapterId: string) => {
        if (!activeProject || activeProject.chapters.length <= 1) return;
        const updated = activeProject.chapters.filter(c => c.id !== chapterId)
            .map((c, i) => ({ ...c, number: i + 1 }));
        updateProject(activeProject.id, { chapters: updated });
        if (activeChapterId === chapterId) setActiveChapterId(updated[0]?.id || null);
    }, [activeProject, activeChapterId, updateProject]);

    const updateChapter = useCallback((chapterId: string, updates: Partial<WritingChapter>) => {
        if (!activeProject) return;
        const updated = activeProject.chapters.map(c =>
            c.id === chapterId ? { ...c, ...updates, updatedAt: new Date().toISOString() } : c
        );
        updateProject(activeProject.id, { chapters: updated });
    }, [activeProject, updateProject]);

    const handleChapterContentChange = useCallback((content: string) => {
        if (!activeChapterId) return;
        // Debounced auto-save
        if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = setTimeout(() => {
            updateChapter(activeChapterId, { content, wordCount: countWords(content) });
        }, 1500);
    }, [activeChapterId, updateChapter]);

    const totalWords = useMemo(() =>
        activeProject?.chapters.reduce((sum, c) => sum + c.wordCount, 0) || 0,
    [activeProject]);

    const addCharacter = useCallback(() => {
        if (!activeProject) return;
        const char: WritingCharacter = {
            id: generateId(), name: 'New Character', description: '', role: 'supporting', notes: ''
        };
        updateProject(activeProject.id, { characters: [...activeProject.characters, char] });
    }, [activeProject, updateProject]);

    const updateCharacter = useCallback((charId: string, updates: Partial<WritingCharacter>) => {
        if (!activeProject) return;
        updateProject(activeProject.id, {
            characters: activeProject.characters.map(c => c.id === charId ? { ...c, ...updates } : c)
        });
    }, [activeProject, updateProject]);

    const deleteCharacter = useCallback((charId: string) => {
        if (!activeProject) return;
        updateProject(activeProject.id, { characters: activeProject.characters.filter(c => c.id !== charId) });
    }, [activeProject, updateProject]);

    const exportProject = useCallback(async () => {
        if (!activeProject) return;
        // Export as markdown
        let md = `# ${activeProject.title}\n\n`;
        if (activeProject.author) md += `**Author:** ${activeProject.author}\n\n`;
        if (activeProject.synopsis) md += `> ${activeProject.synopsis}\n\n`;
        md += '---\n\n';
        for (const ch of activeProject.chapters) {
            md += `## ${ch.title}\n\n${ch.content}\n\n`;
        }
        const result = await (window as any).api?.showSaveDialog?.({
            title: 'Export Project',
            defaultPath: `${activeProject.title.replace(/\s+/g, '_')}.md`,
            filters: [
                { name: 'Markdown', extensions: ['md'] },
                { name: 'JSON (full project)', extensions: ['json'] },
            ],
        });
        if (result?.filePath) {
            if (result.filePath.endsWith('.json')) {
                await (window as any).api?.writeFileContent?.(result.filePath, JSON.stringify(activeProject, null, 2));
            } else {
                await (window as any).api?.writeFileContent?.(result.filePath, md);
            }
        }
    }, [activeProject]);

    const importProject = useCallback(async () => {
        const result = await (window as any).api?.showOpenDialog?.({
            title: 'Import Project',
            filters: [{ name: 'Grimoire/JSON Project', extensions: ['json'] }],
            properties: ['openFile'],
        });
        if (result?.filePaths?.[0]) {
            const content = await (window as any).api?.readFileContent?.(result.filePaths[0]);
            if (content) {
                try {
                    const proj = JSON.parse(content);
                    if (proj.title && proj.chapters) {
                        proj.id = generateId();
                        saveProjects([...projects, proj]);
                        setActiveProjectId(proj.id);
                        setActiveChapterId(proj.chapters[0]?.id || null);
                    }
                } catch (e) { console.error('Import failed:', e); }
            }
        }
    }, [projects, saveProjects]);

    // ─── Collections logic ───
    const createCollection = useCallback(() => {
        if (!newCollectionName.trim()) return;
        const col: BookCollection = {
            id: generateId(), name: newCollectionName.trim(), description: '',
            color: COVER_COLORS[Math.floor(Math.random() * COVER_COLORS.length)],
            docPaths: [],
        };
        saveCollections([...collections, col]);
        setShowNewCollection(false);
        setNewCollectionName('');
    }, [newCollectionName, collections, saveCollections]);

    const addToCollection = useCallback((collectionId: string, docPath: string) => {
        saveCollections(collections.map(c =>
            c.id === collectionId && !c.docPaths.includes(docPath)
                ? { ...c, docPaths: [...c.docPaths, docPath] }
                : c
        ));
    }, [collections, saveCollections]);

    const removeFromCollection = useCallback((collectionId: string, docPath: string) => {
        saveCollections(collections.map(c =>
            c.id === collectionId ? { ...c, docPaths: c.docPaths.filter(p => p !== docPath) } : c
        ));
    }, [collections, saveCollections]);

    // ─── Render Browse ───
    const renderBrowse = () => (
        <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center gap-2 p-2 border-b theme-border theme-bg-secondary flex-wrap">
                <div className="flex border theme-border rounded overflow-hidden">
                    {(['all', 'workspace', 'library'] as const).map(src => (
                        <button key={src} onClick={() => setActiveSource(src)}
                            className={`px-3 py-1.5 text-xs ${activeSource === src ? 'bg-indigo-600 text-white' : 'theme-hover'}`}>
                            {src === 'workspace' && <FolderOpen size={12} className="inline mr-1" />}
                            {src === 'library' && <Home size={12} className="inline mr-1" />}
                            {src.charAt(0).toUpperCase() + src.slice(1)}
                        </button>
                    ))}
                </div>

                <button onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
                    className={`p-1.5 rounded ${showFavoritesOnly ? 'bg-yellow-500/20 text-yellow-400' : 'theme-hover'}`}>
                    <Star size={16} />
                </button>
                <button onClick={loadDocuments} className="p-1.5 rounded theme-hover">
                    <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                </button>

                <div className="flex-1 relative min-w-[120px]">
                    <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
                    <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search documents..."
                        className="w-full pl-7 pr-2 py-1.5 text-sm rounded theme-bg-tertiary border theme-border focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                </div>

                <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}
                    className="px-2 py-1.5 text-sm theme-bg-tertiary border theme-border rounded">
                    <option value="name">Name</option><option value="type">Type</option>
                    <option value="size">Size</option><option value="modified">Modified</option>
                </select>
                <button onClick={() => setSortAsc(!sortAsc)} className="p-1.5 rounded theme-hover">
                    {sortAsc ? <SortAsc size={16} /> : <SortDesc size={16} />}
                </button>
                <div className="flex border theme-border rounded overflow-hidden">
                    <button onClick={() => setViewMode('grid')} className={`p-1.5 ${viewMode === 'grid' ? 'bg-indigo-600' : 'theme-hover'}`}><Grid size={14} /></button>
                    <button onClick={() => setViewMode('list')} className={`p-1.5 ${viewMode === 'list' ? 'bg-indigo-600' : 'theme-hover'}`}><List size={14} /></button>
                </div>
            </div>

            <div className="flex-1 overflow-auto p-3">
                {loading ? (
                    <div className="flex items-center justify-center h-full text-gray-500">
                        <RefreshCw size={24} className="animate-spin mr-2" /> Scanning for documents...
                    </div>
                ) : filteredDocs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-gray-500">
                        <BookOpen size={48} className="opacity-30 mb-4" />
                        <p>{searchQuery ? 'No matching documents' : 'No documents found'}</p>
                        <p className="text-xs mt-2">PDFs, EPUBs, DOCX, and text files will appear here</p>
                    </div>
                ) : viewMode === 'grid' ? (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-3">
                        {filteredDocs.map(doc => (
                            <div key={doc.path} onClick={() => setSelectedDoc(doc.path)}
                                onDoubleClick={() => onOpenDocument(doc.path, doc.type)}
                                className={`flex flex-col items-center gap-2 p-3 rounded-lg cursor-pointer transition-colors ${
                                    selectedDoc === doc.path ? 'bg-indigo-600/20 ring-1 ring-indigo-500' : 'hover:theme-bg-secondary'
                                }`}>
                                <div className="relative">
                                    <div className={`w-14 h-[72px] rounded flex items-center justify-center ${
                                        doc.type === 'pdf' ? 'bg-red-900/30' : doc.type === 'epub' ? 'bg-green-900/30' : 'bg-gray-800'
                                    }`}>
                                        {getDocIcon(doc.type)}
                                    </div>
                                    <button onClick={(e) => { e.stopPropagation(); toggleFavorite(doc.path); }}
                                        className="absolute -top-1 -right-1 p-0.5">
                                        <Star size={12} className={favorites.has(doc.path) ? 'text-yellow-400 fill-yellow-400' : 'text-gray-600 hover:text-gray-400'} />
                                    </button>
                                </div>
                                <p className="text-[11px] text-center truncate w-full" title={doc.name}>{doc.name}</p>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="space-y-0.5">
                        <div className="flex items-center gap-2 px-2 py-1 text-xs text-gray-500 border-b theme-border">
                            <span className="w-6" /><span className="flex-1">Name</span>
                            <span className="w-12 text-center">Type</span>
                            <span className="w-16 text-right">Size</span>
                            <span className="w-24 text-right">Modified</span>
                        </div>
                        {filteredDocs.map(doc => (
                            <div key={doc.path} onClick={() => setSelectedDoc(doc.path)}
                                onDoubleClick={() => onOpenDocument(doc.path, doc.type)}
                                className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer ${
                                    selectedDoc === doc.path ? 'bg-indigo-600/20 ring-1 ring-indigo-500' : 'hover:theme-bg-secondary'
                                }`}>
                                <button onClick={(e) => { e.stopPropagation(); toggleFavorite(doc.path); }} className="w-6 flex justify-center">
                                    <Star size={12} className={favorites.has(doc.path) ? 'text-yellow-400 fill-yellow-400' : 'text-gray-600 hover:text-gray-400'} />
                                </button>
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                    {getDocIcon(doc.type, 16)}
                                    <span className="text-sm truncate" title={doc.path}>{doc.name}</span>
                                </div>
                                <span className="w-12 text-[10px] text-gray-500 text-center uppercase">{doc.type}</span>
                                <span className="w-16 text-[10px] text-gray-500 text-right">{formatFileSize(doc.size)}</span>
                                <span className="w-24 text-[10px] text-gray-500 text-right">{formatDate(doc.modified)}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="flex items-center justify-between px-3 py-1 text-xs text-gray-500 border-t theme-border theme-bg-secondary">
                <span>{filteredDocs.length} documents</span>
                <span>{favorites.size} favorites</span>
            </div>
        </div>
    );

    // ─── Render Write ───
    const renderWrite = () => {
        if (!activeProject) {
            // Project list
            return (
                <div className="flex-1 flex flex-col min-h-0">
                    <div className="flex items-center gap-2 p-3 border-b theme-border theme-bg-secondary">
                        <PenTool size={18} className="text-indigo-400" />
                        <span className="font-medium text-sm">Writing Projects</span>
                        <div className="flex-1" />
                        <button onClick={importProject} className="px-3 py-1.5 text-xs theme-bg-tertiary theme-hover rounded flex items-center gap-1">
                            <Upload size={12} /> Import
                        </button>
                        <button onClick={() => setShowNewProject(true)} className="px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 rounded flex items-center gap-1">
                            <Plus size={12} /> New Project
                        </button>
                    </div>

                    <div className="flex-1 overflow-auto p-4">
                        {projects.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-gray-500">
                                <PenTool size={48} className="opacity-30 mb-4" />
                                <p>No writing projects yet</p>
                                <p className="text-xs mt-2">Create a novel, story, screenplay, or journal</p>
                                <button onClick={() => setShowNewProject(true)}
                                    className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded text-sm">
                                    Create Your First Project
                                </button>
                            </div>
                        ) : (
                            <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
                                {projects.map(proj => (
                                    <div key={proj.id}
                                        onClick={() => {
                                            setActiveProjectId(proj.id);
                                            setActiveChapterId(proj.chapters[0]?.id || null);
                                        }}
                                        className="group relative cursor-pointer rounded-lg overflow-hidden hover:ring-2 hover:ring-indigo-500 transition-all">
                                        <div className={`h-48 bg-gradient-to-b ${proj.coverColor} p-4 flex flex-col justify-end`}>
                                            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={(e) => { e.stopPropagation(); deleteProject(proj.id); }}
                                                    className="p-1.5 bg-red-600/80 rounded hover:bg-red-600" title="Delete">
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>
                                            <div className="text-[10px] uppercase tracking-wide text-white/60 mb-1">{proj.type}</div>
                                            <h3 className="font-bold text-white text-lg leading-tight">{proj.title}</h3>
                                            {proj.author && <p className="text-xs text-white/70 mt-1">by {proj.author}</p>}
                                        </div>
                                        <div className="p-3 theme-bg-secondary">
                                            <div className="flex items-center justify-between text-[10px] text-gray-400">
                                                <span>{proj.chapters.length} chapter{proj.chapters.length !== 1 ? 's' : ''}</span>
                                                <span>{proj.chapters.reduce((s, c) => s + c.wordCount, 0).toLocaleString()} words</span>
                                            </div>
                                            {proj.wordGoal > 0 && (
                                                <div className="mt-2 h-1 bg-gray-700 rounded overflow-hidden">
                                                    <div className="h-full bg-indigo-500 rounded transition-all"
                                                        style={{ width: `${Math.min(100, (proj.chapters.reduce((s, c) => s + c.wordCount, 0) / proj.wordGoal) * 100)}%` }} />
                                                </div>
                                            )}
                                            <p className="text-[10px] text-gray-500 mt-1">{formatDate(proj.updatedAt)}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {showNewProject && (
                        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={() => setShowNewProject(false)}>
                            <div className="theme-bg-secondary rounded-xl shadow-2xl p-6 w-[420px] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
                                <h3 className="text-lg font-bold mb-4">New Writing Project</h3>
                                <div className="space-y-3">
                                    <input type="text" value={newProjectTitle} onChange={(e) => setNewProjectTitle(e.target.value)}
                                        placeholder="Project title..." autoFocus
                                        onKeyDown={(e) => { if (e.key === 'Enter') createProject(); }}
                                        className="w-full px-3 py-2 theme-bg-tertiary border theme-border rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                                    <div>
                                        <label className="text-xs text-gray-400 mb-1 block">Type</label>
                                        <div className="grid grid-cols-3 gap-2">
                                            {(['novel', 'story', 'manga', 'screenplay', 'poetry', 'journal'] as const).map(t => (
                                                <button key={t} onClick={() => setNewProjectType(t)}
                                                    className={`px-3 py-2 rounded text-xs capitalize ${newProjectType === t ? 'bg-indigo-600 text-white' : 'theme-bg-tertiary theme-hover'}`}>
                                                    {t}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="flex gap-2 justify-end pt-2">
                                        <button onClick={() => setShowNewProject(false)} className="px-4 py-2 theme-bg-tertiary rounded text-sm">Cancel</button>
                                        <button onClick={createProject} disabled={!newProjectTitle.trim()}
                                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded text-sm">Create</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            );
        }

        // Active project editor
        return (
            <div className={`flex-1 flex min-h-0 ${isFullscreen ? 'fixed inset-0 z-50 theme-bg-primary' : ''}`}>
                {/* Writing sidebar */}
                {writeSidebarOpen && (
                    <div className="w-56 flex flex-col border-r theme-border theme-bg-secondary shrink-0">
                        <div className="flex items-center gap-2 p-2 border-b theme-border">
                            <button onClick={() => { setActiveProjectId(null); setActiveChapterId(null); }}
                                className="p-1 theme-hover rounded" title="Back to projects">
                                <ChevronLeft size={14} />
                            </button>
                            <span className="text-xs font-medium truncate flex-1" title={activeProject.title}>{activeProject.title}</span>
                            <button onClick={() => setShowProjectSettings(true)} className="p-1 theme-hover rounded"><Settings size={12} /></button>
                        </div>

                        {/* Chapter list */}
                        <div className="flex-1 overflow-auto">
                            <div className="p-2">
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-[10px] uppercase tracking-wider text-gray-500">
                                        {activeProject.type === 'poetry' ? 'Poems' : activeProject.type === 'journal' ? 'Journals' : activeProject.type === 'manga' ? 'Volumes' : activeProject.type === 'screenplay' ? 'Acts' : 'Chapters'}
                                    </span>
                                    <button onClick={addChapter} className="p-0.5 theme-hover rounded"><Plus size={12} /></button>
                                </div>
                                {activeProject.chapters.map(ch => (
                                    <div key={ch.id}
                                        onClick={() => { setActiveChapterId(ch.id); setWriteView('chapter'); }}
                                        className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs cursor-pointer group ${
                                            activeChapterId === ch.id ? 'bg-indigo-600/20 text-indigo-300' : 'theme-hover theme-text-secondary'
                                        }`}>
                                        <Hash size={10} className="shrink-0 text-gray-500" />
                                        <span className="truncate flex-1">{ch.title}</span>
                                        <span className="text-[9px] text-gray-500">{ch.wordCount}</span>
                                        {activeProject.chapters.length > 1 && (
                                            <button onClick={(e) => { e.stopPropagation(); deleteChapter(ch.id); }}
                                                className="p-0.5 opacity-0 group-hover:opacity-100 hover:text-red-400"><X size={10} /></button>
                                        )}
                                    </div>
                                ))}
                            </div>

                            <div className="border-t theme-border p-2">
                                <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Views</div>
                                {[
                                    { id: 'outline' as const, icon: AlignLeft, label: 'Outline' },
                                    { id: 'characters' as const, icon: BookMarked, label: 'Characters' },
                                    { id: 'notes' as const, icon: MessageSquare, label: 'Notes' },
                                ].map(v => (
                                    <button key={v.id} onClick={() => setWriteView(v.id)}
                                        className={`flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs ${
                                            writeView === v.id ? 'bg-indigo-600/20 text-indigo-300' : 'theme-hover theme-text-secondary'
                                        }`}>
                                        <v.icon size={12} />{v.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Word count footer */}
                        <div className="p-2 border-t theme-border text-[10px] text-gray-500">
                            <div className="flex justify-between">
                                <span>Total: {totalWords.toLocaleString()} words</span>
                                {activeProject.wordGoal > 0 && <span>{Math.round((totalWords / activeProject.wordGoal) * 100)}%</span>}
                            </div>
                            {activeProject.wordGoal > 0 && (
                                <div className="mt-1 h-1 bg-gray-700 rounded overflow-hidden">
                                    <div className="h-full bg-indigo-500 rounded" style={{ width: `${Math.min(100, (totalWords / activeProject.wordGoal) * 100)}%` }} />
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Editor area */}
                <div className="flex-1 flex flex-col min-h-0">
                    <div className="flex items-center gap-2 px-3 py-1.5 border-b theme-border theme-bg-secondary shrink-0">
                        <button onClick={() => setWriteSidebarOpen(!writeSidebarOpen)} className="p-1 theme-hover rounded">
                            <PanelLeft size={14} />
                        </button>
                        {writeView === 'chapter' && activeChapter && (
                            <>
                                <input type="text" value={activeChapter.title}
                                    onChange={(e) => updateChapter(activeChapter.id, { title: e.target.value })}
                                    className="text-sm font-medium bg-transparent border-none outline-none flex-1 min-w-0" />
                                <span className="text-[10px] text-gray-500">{activeChapter.wordCount} words</span>
                            </>
                        )}
                        {writeView !== 'chapter' && (
                            <span className="text-sm font-medium capitalize">{writeView}</span>
                        )}
                        <div className="flex-1" />
                        <button onClick={() => setIsFullscreen(!isFullscreen)} className="p-1 theme-hover rounded">
                            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                        </button>
                        <button onClick={exportProject} className="p-1 theme-hover rounded" title="Export"><Download size={14} /></button>
                    </div>

                    <div className="flex-1 overflow-auto">
                        {writeView === 'chapter' && activeChapter ? (
                            activeProject.type === 'manga' ? (
                                <MangaEditor
                                    key={activeChapter.id}
                                    chapter={activeChapter}
                                    onUpdateChapter={updateChapter}
                                />
                            ) : activeProject.type === 'screenplay' ? (
                                <ScreenplayEditor
                                    key={activeChapter.id}
                                    chapter={activeChapter}
                                    onContentChange={handleChapterContentChange}
                                />
                            ) : activeProject.type === 'poetry' ? (
                                <PoetryEditor
                                    key={activeChapter.id}
                                    chapter={activeChapter}
                                    onContentChange={handleChapterContentChange}
                                />
                            ) : activeProject.type === 'journal' ? (
                                <JournalEditor
                                    key={activeChapter.id}
                                    chapter={activeChapter}
                                    onContentChange={handleChapterContentChange}
                                    onUpdateChapter={updateChapter}
                                />
                            ) : (
                                <NovelEditor
                                    key={activeChapter.id}
                                    chapter={activeChapter}
                                    onContentChange={handleChapterContentChange}
                                    wordGoal={activeProject.wordGoal}
                                />
                            )
                        ) : writeView === 'outline' ? (
                            <div className="max-w-3xl mx-auto p-6">
                                <h2 className="text-lg font-bold mb-4">Outline</h2>
                                {activeProject.chapters.map(ch => (
                                    <div key={ch.id} className="mb-4 p-3 theme-bg-secondary rounded-lg">
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="text-xs text-indigo-400 font-mono">Ch. {ch.number}</span>
                                            <span className="text-sm font-medium">{ch.title}</span>
                                            <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                                                ch.status === 'final' ? 'bg-green-600/30 text-green-400' :
                                                ch.status === 'revision' ? 'bg-yellow-600/30 text-yellow-400' :
                                                'bg-gray-600/30 text-gray-400'
                                            }`}>{ch.status}</span>
                                            <span className="text-[10px] text-gray-500 ml-auto">{ch.wordCount} words</span>
                                        </div>
                                        <p className="text-xs text-gray-400">
                                            {ch.content ? ch.content.slice(0, 200) + (ch.content.length > 200 ? '...' : '') : 'Empty'}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        ) : writeView === 'characters' ? (
                            <div className="max-w-3xl mx-auto p-6">
                                <div className="flex items-center justify-between mb-4">
                                    <h2 className="text-lg font-bold">Characters</h2>
                                    <button onClick={addCharacter} className="px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 rounded flex items-center gap-1">
                                        <Plus size={12} /> Add Character
                                    </button>
                                </div>
                                {activeProject.characters.length === 0 ? (
                                    <p className="text-gray-500 text-sm">No characters yet. Add your first character to track them.</p>
                                ) : (
                                    <div className="space-y-3">
                                        {activeProject.characters.map(char => (
                                            <div key={char.id} className="p-4 theme-bg-secondary rounded-lg">
                                                <div className="flex items-center gap-3 mb-2">
                                                    <input type="text" value={char.name}
                                                        onChange={(e) => updateCharacter(char.id, { name: e.target.value })}
                                                        className="text-sm font-bold bg-transparent border-none outline-none flex-1" />
                                                    <select value={char.role}
                                                        onChange={(e) => updateCharacter(char.id, { role: e.target.value as any })}
                                                        className="text-[10px] px-2 py-0.5 theme-bg-tertiary rounded border theme-border">
                                                        <option value="protagonist">Protagonist</option>
                                                        <option value="antagonist">Antagonist</option>
                                                        <option value="supporting">Supporting</option>
                                                        <option value="minor">Minor</option>
                                                    </select>
                                                    <button onClick={() => deleteCharacter(char.id)} className="p-1 hover:text-red-400"><Trash2 size={12} /></button>
                                                </div>
                                                <textarea value={char.description}
                                                    onChange={(e) => updateCharacter(char.id, { description: e.target.value })}
                                                    placeholder="Description..."
                                                    className="w-full text-xs bg-transparent border-none outline-none resize-none theme-text-secondary" rows={2} />
                                                <textarea value={char.notes}
                                                    onChange={(e) => updateCharacter(char.id, { notes: e.target.value })}
                                                    placeholder="Notes..."
                                                    className="w-full text-xs bg-transparent border-none outline-none resize-none text-gray-500 mt-1" rows={1} />
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ) : writeView === 'notes' ? (
                            <div className="max-w-3xl mx-auto p-6">
                                <h2 className="text-lg font-bold mb-4">Project Notes</h2>
                                <textarea
                                    value={activeProject.notes}
                                    onChange={(e) => updateProject(activeProject.id, { notes: e.target.value })}
                                    placeholder="Freeform notes, ideas, worldbuilding..."
                                    className="w-full min-h-[50vh] bg-transparent border theme-border rounded-lg p-4 outline-none resize-none text-sm"
                                    spellCheck
                                />
                            </div>
                        ) : null}
                    </div>
                </div>

                {/* Project settings modal */}
                {showProjectSettings && (
                    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={() => setShowProjectSettings(false)}>
                        <div className="theme-bg-secondary rounded-xl shadow-2xl p-6 w-[480px] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
                            <h3 className="text-lg font-bold mb-4">Project Settings</h3>
                            <div className="space-y-3">
                                <div>
                                    <label className="text-xs text-gray-400 block mb-1">Title</label>
                                    <input type="text" value={activeProject.title}
                                        onChange={(e) => updateProject(activeProject.id, { title: e.target.value })}
                                        className="w-full px-3 py-2 theme-bg-tertiary border theme-border rounded text-sm" />
                                </div>
                                <div>
                                    <label className="text-xs text-gray-400 block mb-1">Author</label>
                                    <input type="text" value={activeProject.author}
                                        onChange={(e) => updateProject(activeProject.id, { author: e.target.value })}
                                        className="w-full px-3 py-2 theme-bg-tertiary border theme-border rounded text-sm" />
                                </div>
                                <div>
                                    <label className="text-xs text-gray-400 block mb-1">Synopsis</label>
                                    <textarea value={activeProject.synopsis}
                                        onChange={(e) => updateProject(activeProject.id, { synopsis: e.target.value })}
                                        className="w-full px-3 py-2 theme-bg-tertiary border theme-border rounded text-sm" rows={3} />
                                </div>
                                <div className="flex gap-3">
                                    <div className="flex-1">
                                        <label className="text-xs text-gray-400 block mb-1">Genre</label>
                                        <select value={activeProject.genre}
                                            onChange={(e) => updateProject(activeProject.id, { genre: e.target.value })}
                                            className="w-full px-3 py-2 theme-bg-tertiary border theme-border rounded text-sm">
                                            <option value="">Select...</option>
                                            {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
                                        </select>
                                    </div>
                                    <div className="flex-1">
                                        <label className="text-xs text-gray-400 block mb-1">Word Goal</label>
                                        <input type="number" value={activeProject.wordGoal}
                                            onChange={(e) => updateProject(activeProject.id, { wordGoal: parseInt(e.target.value) || 0 })}
                                            className="w-full px-3 py-2 theme-bg-tertiary border theme-border rounded text-sm" />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-xs text-gray-400 block mb-1">Cover Color</label>
                                    <div className="flex gap-2 flex-wrap">
                                        {COVER_COLORS.map(c => (
                                            <button key={c} onClick={() => updateProject(activeProject.id, { coverColor: c })}
                                                className={`w-8 h-8 rounded bg-gradient-to-b ${c} ${activeProject.coverColor === c ? 'ring-2 ring-white' : ''}`} />
                                        ))}
                                    </div>
                                </div>
                                <div className="flex justify-end pt-2">
                                    <button onClick={() => setShowProjectSettings(false)} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded text-sm">Done</button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    // ─── Render Collections ───
    const renderCollections = () => (
        <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center gap-2 p-3 border-b theme-border theme-bg-secondary">
                <Layers size={18} className="text-indigo-400" />
                <span className="font-medium text-sm">Collections</span>
                <div className="flex-1" />
                <button onClick={() => setShowNewCollection(true)} className="px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 rounded flex items-center gap-1">
                    <Plus size={12} /> New Collection
                </button>
            </div>

            <div className="flex-1 flex min-h-0">
                {/* Collections list */}
                <div className="w-56 border-r theme-border overflow-auto">
                    {collections.length === 0 ? (
                        <div className="p-4 text-center text-gray-500 text-xs">
                            <Archive size={32} className="mx-auto opacity-30 mb-2" />
                            Create shelves to organize your documents
                        </div>
                    ) : collections.map(col => (
                        <div key={col.id}
                            onClick={() => setActiveCollectionId(col.id)}
                            className={`flex items-center gap-2 px-3 py-2 cursor-pointer ${
                                activeCollectionId === col.id ? 'bg-indigo-600/20' : 'theme-hover'
                            }`}>
                            <div className={`w-3 h-3 rounded bg-gradient-to-b ${col.color}`} />
                            <span className="text-sm truncate flex-1">{col.name}</span>
                            <span className="text-[10px] text-gray-500">{col.docPaths.length}</span>
                        </div>
                    ))}
                </div>

                {/* Collection contents */}
                <div className="flex-1 overflow-auto p-4">
                    {activeCollectionId ? (() => {
                        const col = collections.find(c => c.id === activeCollectionId);
                        if (!col) return null;
                        const colDocs = documents.filter(d => col.docPaths.includes(d.path));
                        return (
                            <div>
                                <div className="flex items-center gap-3 mb-4">
                                    <h2 className="text-lg font-bold">{col.name}</h2>
                                    <span className="text-xs text-gray-500">{colDocs.length} documents</span>
                                    <div className="flex-1" />
                                    <button onClick={() => {
                                        saveCollections(collections.filter(c => c.id !== col.id));
                                        setActiveCollectionId(null);
                                    }} className="px-2 py-1 text-xs text-red-400 hover:bg-red-600/20 rounded">Delete Collection</button>
                                </div>
                                {colDocs.length === 0 ? (
                                    <p className="text-gray-500 text-sm">No documents in this collection. Drag documents here or use the browse tab.</p>
                                ) : (
                                    <div className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-3">
                                        {colDocs.map(doc => (
                                            <div key={doc.path}
                                                onDoubleClick={() => onOpenDocument(doc.path, doc.type)}
                                                className="flex flex-col items-center gap-2 p-3 rounded-lg cursor-pointer hover:theme-bg-secondary group">
                                                <div className="relative">
                                                    <div className={`w-14 h-[72px] rounded flex items-center justify-center ${
                                                        doc.type === 'pdf' ? 'bg-red-900/30' : 'bg-gray-800'
                                                    }`}>
                                                        {getDocIcon(doc.type)}
                                                    </div>
                                                    <button onClick={() => removeFromCollection(col.id, doc.path)}
                                                        className="absolute -top-1 -right-1 p-0.5 bg-red-600 rounded opacity-0 group-hover:opacity-100">
                                                        <X size={10} />
                                                    </button>
                                                </div>
                                                <p className="text-[11px] text-center truncate w-full">{doc.name}</p>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Add documents to collection */}
                                <div className="mt-6 border-t theme-border pt-4">
                                    <h3 className="text-sm font-medium mb-2">Add Documents</h3>
                                    <div className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-2">
                                        {documents.filter(d => !col.docPaths.includes(d.path)).slice(0, 20).map(doc => (
                                            <button key={doc.path}
                                                onClick={() => addToCollection(col.id, doc.path)}
                                                className="flex items-center gap-2 p-2 rounded theme-bg-tertiary theme-hover text-xs text-left">
                                                {getDocIcon(doc.type, 12)}
                                                <span className="truncate">{doc.name}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        );
                    })() : (
                        <div className="flex flex-col items-center justify-center h-full text-gray-500">
                            <Layers size={48} className="opacity-30 mb-4" />
                            <p>Select a collection to view its contents</p>
                        </div>
                    )}
                </div>
            </div>

            {showNewCollection && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={() => setShowNewCollection(false)}>
                    <div className="theme-bg-secondary rounded-xl shadow-2xl p-6 w-[360px]" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-lg font-bold mb-4">New Collection</h3>
                        <input type="text" value={newCollectionName} onChange={(e) => setNewCollectionName(e.target.value)}
                            placeholder="Collection name..." autoFocus
                            onKeyDown={(e) => { if (e.key === 'Enter') createCollection(); }}
                            className="w-full px-3 py-2 theme-bg-tertiary border theme-border rounded text-sm mb-3" />
                        <div className="flex gap-2 justify-end">
                            <button onClick={() => setShowNewCollection(false)} className="px-4 py-2 theme-bg-tertiary rounded text-sm">Cancel</button>
                            <button onClick={createCollection} disabled={!newCollectionName.trim()}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded text-sm">Create</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );

    // ─── Render Reading Activity ───
    const renderReading = () => {
        const recentlyRead = [...readingProgress].sort((a, b) => b.lastRead.localeCompare(a.lastRead)).slice(0, 20);
        const docAnnotations = annotations.reduce((acc, a) => {
            if (!acc[a.docPath]) acc[a.docPath] = [];
            acc[a.docPath].push(a);
            return acc;
        }, {} as Record<string, BookAnnotation[]>);

        return (
            <div className="flex-1 flex flex-col min-h-0">
                <div className="flex items-center gap-2 p-3 border-b theme-border theme-bg-secondary">
                    <Clock size={18} className="text-indigo-400" />
                    <span className="font-medium text-sm">Reading Activity</span>
                </div>

                <div className="flex-1 overflow-auto p-4">
                    {recentlyRead.length === 0 && annotations.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-500">
                            <Eye size={48} className="opacity-30 mb-4" />
                            <p>No reading activity yet</p>
                            <p className="text-xs mt-2">Open documents from the Browse tab to start reading</p>
                        </div>
                    ) : (
                        <div className="max-w-3xl mx-auto space-y-6">
                            {recentlyRead.length > 0 && (
                                <div>
                                    <h2 className="text-lg font-bold mb-3">Recently Read</h2>
                                    <div className="space-y-2">
                                        {recentlyRead.map(rp => {
                                            const doc = documents.find(d => d.path === rp.docPath);
                                            const progress = rp.totalPages > 0 ? (rp.currentPage / rp.totalPages) * 100 : 0;
                                            return (
                                                <div key={rp.docPath}
                                                    onClick={() => doc && onOpenDocument(doc.path, doc.type)}
                                                    className="flex items-center gap-3 p-3 theme-bg-secondary rounded-lg cursor-pointer hover:ring-1 hover:ring-indigo-500">
                                                    {getDocIcon(doc?.type || 'pdf', 16)}
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm truncate">{doc?.name || rp.docPath.split('/').pop()}</p>
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <div className="flex-1 h-1 bg-gray-700 rounded overflow-hidden">
                                                                <div className="h-full bg-indigo-500 rounded" style={{ width: `${progress}%` }} />
                                                            </div>
                                                            <span className="text-[10px] text-gray-500">
                                                                Page {rp.currentPage}/{rp.totalPages}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <span className="text-[10px] text-gray-500">{formatDate(rp.lastRead)}</span>
                                                    {rp.bookmarks.length > 0 && (
                                                        <span className="text-[10px] text-indigo-400 flex items-center gap-0.5">
                                                            <Bookmark size={10} />{rp.bookmarks.length}
                                                        </span>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {Object.keys(docAnnotations).length > 0 && (
                                <div>
                                    <h2 className="text-lg font-bold mb-3">Annotations</h2>
                                    {Object.entries(docAnnotations).map(([path, annots]) => {
                                        const doc = documents.find(d => d.path === path);
                                        return (
                                            <div key={path} className="mb-4">
                                                <div className="flex items-center gap-2 mb-2">
                                                    {getDocIcon(doc?.type || 'pdf', 14)}
                                                    <span className="text-sm font-medium">{doc?.name || path.split('/').pop()}</span>
                                                    <span className="text-[10px] text-gray-500">{annots.length} annotations</span>
                                                </div>
                                                <div className="space-y-1 ml-5">
                                                    {annots.slice(0, 5).map(a => (
                                                        <div key={a.id} className="flex gap-2 text-xs p-2 theme-bg-secondary rounded">
                                                            <div className="w-1 rounded shrink-0" style={{ backgroundColor: a.color }} />
                                                            <div>
                                                                <p className="italic text-gray-400">"{a.text}"</p>
                                                                {a.note && <p className="mt-0.5 theme-text-secondary">{a.note}</p>}
                                                                {a.page !== undefined && <span className="text-[9px] text-gray-500">Page {a.page}</span>}
                                                            </div>
                                                            <button onClick={() => saveAnnotations(annotations.filter(an => an.id !== a.id))}
                                                                className="ml-auto p-0.5 hover:text-red-400 shrink-0"><X size={10} /></button>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        );
    };

    // ─── Main Render ───
    return (
        <div className="flex-1 flex flex-col min-h-0 theme-bg-primary">
            {/* Top nav */}
            <div className="flex items-center gap-1 px-2 py-1.5 border-b theme-border theme-bg-secondary shrink-0">
                <BookOpen size={18} className="text-indigo-400 mr-1" />
                <span className="text-sm font-bold text-indigo-400 mr-3">Grimoire</span>
                {([
                    { id: 'browse' as const, icon: Search, label: 'Browse' },
                    { id: 'write' as const, icon: PenTool, label: 'Write' },
                    { id: 'collections' as const, icon: Layers, label: 'Collections' },
                    { id: 'reading' as const, icon: Eye, label: 'Reading' },
                ]).map(tab => (
                    <button key={tab.id} onClick={() => setActiveMode(tab.id)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs ${
                            activeMode === tab.id
                                ? 'bg-indigo-600/20 text-indigo-300 font-medium'
                                : 'theme-hover theme-text-secondary'
                        }`}>
                        <tab.icon size={13} />{tab.label}
                    </button>
                ))}
                <div className="flex-1" />
                <span className="text-[10px] text-gray-500">
                    {documents.length} docs | {projects.length} projects | {collections.length} shelves
                </span>
            </div>

            {activeMode === 'browse' && renderBrowse()}
            {activeMode === 'write' && renderWrite()}
            {activeMode === 'collections' && renderCollections()}
            {activeMode === 'reading' && renderReading()}
        </div>
    );
};

export default Grimoire;
