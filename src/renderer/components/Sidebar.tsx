import { getFileName } from './utils';
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
    Folder, File, Globe, ChevronRight, Settings, Edit,
    Terminal, Image, Trash, Users, Plus, Minus, ArrowUp, MessageSquare,
    X, Wrench, FileText, FileJson, BarChart3, Code2, HardDrive, ChevronDown, ChevronUp, ChevronLeft,
    Sun, Moon, FileStack, Share2, Bot, Zap, GitBranch, Tag, KeyRound, Database, Network,
    Star, Clock, Activity, Lock, Archive, BookOpen, Sparkles, Box, GripVertical, Play,
    Search, RefreshCw, Download, Upload, Copy, Check, AlertCircle, Info, Eye, EyeOff,
    Palette, Code, Save, FolderOpen, FolderPlus, Home, ArrowLeft, ArrowRight, Menu, MoreVertical,
    Loader2, ExternalLink, Link, Unlink, Filter, SortAsc, SortDesc, Table, Grid,
    List, Maximize2, Minimize2, Move, RotateCcw, ZoomIn, ZoomOut, Layers, Layout,
    Pause, Server, Mail, Cpu, Wifi, WifiOff, Power, PowerOff, Hash, AtSign, FlaskConical,
    BrainCircuit, Music
} from 'lucide-react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { EditorView } from '@codemirror/view';
import { LiveProvider, LivePreview, LiveError } from 'react-live';
import { Modal, Tabs, Card, Button, Input, Select } from 'npcts';
import DiskUsageAnalyzer from './DiskUsageAnalyzer';
import AutosizeTextarea from './AutosizeTextarea';
import ForceGraph2D from 'react-force-graph-2d';
// ALL components used by tile jinxes - for REAL live preview
import ActivityIntelligence from './ActivityIntelligence';
import BrowserHistoryWeb from './BrowserHistoryWeb';
import CtxEditor from './CtxEditor';
import JinxMenu from './JinxMenu';
import KnowledgeGraphEditor from './KnowledgeGraphEditor';
import LabeledDataManager from './LabeledDataManager';
import McpServerMenu from './McpServerMenu';
import MemoryManagement from './MemoryManagement';
import MemoryIcon from './MemoryIcon';
import MessageLabeling from './MessageLabeling';
import NPCTeamMenu from './NPCTeamMenu';
import PythonEnvSettings from './PythonEnvSettings';
import DBTool from './DBTool';
import DataDash from './DataDash';
import LibraryViewer from './LibraryViewer';
import GraphViewer from './GraphViewer';
import PhotoViewer from './PhotoViewer';
import SettingsMenu from './SettingsMenu';
import npcLogo from '../../assets/icon.png';

const Sidebar = (props: any) => {
    // Destructure all props from Enpistu
    const {
        // State
        sidebarCollapsed, sidebarWidth, isResizingSidebar, contentDataRef, isDarkMode,
        currentPath, baseDir, selectedFiles, selectedConvos, windowId, activeWindowsExpanded,
        workspaceIndicatorExpanded, expandedFolders, renamingPath, editedSidebarItemName,
        currentFile, lastClickedIndex, lastClickedFileIndex, activeContentPaneId,
        folderStructure, directoryConversations, gitStatus, gitPanelCollapsed,
        gitCommitMessage, gitLoading, gitError, rootLayoutNode, openBrowsers, commonSites,
        websiteHistory, filesCollapsed, conversationsCollapsed, websitesCollapsed,
        isGlobalSearch, searchTerm, searchInputRef, loading, isSearching,
        contextMenuPos, sidebarItemContextMenuPos, fileContextMenuPos,
        isEditingPath, editedPath, isLoadingWorkspace, activeConversationId,
        // Setters
        setSidebarWidth, setIsResizingSidebar, setSelectedFiles, setFileContextMenuPos,
        setError, setIsStreaming, setRootLayoutNode, setActiveWindowsExpanded,
        setWorkspaceIndicatorExpanded, setGitPanelCollapsed, setExpandedFolders,
        setRenamingPath, setEditedSidebarItemName, setLastClickedIndex, setLastClickedFileIndex,
        setSelectedConvos, setActiveContentPaneId, setCurrentFile, setActiveConversationId,
        setDirectoryConversations, setFolderStructure, setGitCommitMessage, setGitLoading,
        setGitError, setGitStatus, setFilesCollapsed, setConversationsCollapsed, setWebsitesCollapsed,
        sidebarSectionOrder, setSidebarSectionOrder,
        setInput, setContextMenuPos, setSidebarItemContextMenuPos, setSearchTerm,
        setIsSearching, setDeepSearchResults, setMessageSearchResults,
        setIsEditingPath, setEditedPath, setSettingsOpen, setProjectEnvEditorOpen, setBrowserUrlDialogOpen,
        setPhotoViewerOpen, setDashboardMenuOpen, setJinxMenuOpen,
        setCtxEditorOpen, setTeamManagementOpen, setNpcTeamMenuOpen, setSidebarCollapsed,
        createGraphViewerPane, createBrowserGraphPane, createDataLabelerPane,
        createDataDashPane, createDBToolPane, createNPCTeamPane, createJinxPane, createTeamManagementPane, createSettingsPane, createPhotoViewerPane, createScherzoPane, createProjectEnvPane, createDiskUsagePane, createLibraryViewerPane, createHelpPane, createTileJinxPane, createGitPane,
        // Functions from Enpistu
        createNewConversation, generateId, streamToPaneRef, availableNPCs, currentNPC, currentModel,
        currentProvider, executionMode, mcpServerPath, selectedMcpTools, updateContentPane,
        loadDirectoryStructure, loadWebsiteHistory, createNewBrowser,
        handleGlobalDragStart, handleGlobalDragEnd, normalizePath, getFileIcon,
        serializeWorkspace, saveWorkspaceToStorage, handleConversationSelect, handleFileClick,
        handleInputSubmit, toggleTheme, goUpDirectory, switchToPath,
        handleCreateNewFolder, createNewTextFile, createUntitledTextFile, createNewTerminal, createNewNotebook, createNewExperiment, createNewDocument,
        handleOpenNpcTeamMenu, renderSearchResults,
        createAndAddPaneNodeToLayout, findNodePath, findNodeByPath,
        isPredictiveTextEnabled, setIsPredictiveTextEnabled,
        topBarHeight = 48, bottomBarHeight = 48, topBarCollapsed = false,
        onExpandTopBar, onCollapseTopBar, setDownloadManagerOpen
    } = props;

    const WINDOW_WORKSPACES_KEY = 'npcStudioWorkspaces';
    const ACTIVE_WINDOWS_KEY = 'npcStudioActiveWindows';

    // Local state for disk usage panel
    const [diskUsageCollapsed, setDiskUsageCollapsed] = useState(true);
    // State for bottom grid collapse
    const [bottomGridCollapsed, setBottomGridCollapsed] = useState<boolean>(() => {
        const stored = localStorage.getItem('npcStudio_bottomGridCollapsed');
        return stored === 'true';
    });
    // Search state for sidebar sections
    const [convoSearch, setConvoSearch] = useState('');
    const [fileSearch, setFileSearch] = useState('');
    const [fileTypeFilter, setFileTypeFilter] = useState<string>(() => localStorage.getItem('npcStudio_fileTypeFilter') || '');

    // Drag state for section reordering
    const [draggedSection, setDraggedSection] = useState<string | null>(null);
    const [dropTargetSection, setDropTargetSection] = useState<string | null>(null);

    // Section drag handlers
    const handleSectionDragStart = (sectionId: string) => (e: React.DragEvent) => {
        setDraggedSection(sectionId);
        e.dataTransfer.setData('text/plain', sectionId);
        e.dataTransfer.effectAllowed = 'move';
        // Set drag image
        if (e.currentTarget.parentElement) {
            e.dataTransfer.setDragImage(e.currentTarget.parentElement, 0, 0);
        }
    };

    const handleSectionDragOver = (targetSectionId: string) => (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (draggedSection && draggedSection !== targetSectionId) {
            setDropTargetSection(targetSectionId);
        }
    };

    const handleSectionDragLeave = () => {
        setDropTargetSection(null);
    };

    const handleSectionDrop = (targetSectionId: string) => (e: React.DragEvent) => {
        e.preventDefault();
        const draggedId = e.dataTransfer.getData('text/plain');
        setDraggedSection(null);
        setDropTargetSection(null);
        if (draggedId === targetSectionId || !setSidebarSectionOrder) return;

        const currentOrder = sidebarSectionOrder || ['websites', 'files', 'conversations', 'git'];
        const newOrder = [...currentOrder];
        const draggedIndex = newOrder.indexOf(draggedId);
        const targetIndex = newOrder.indexOf(targetSectionId);

        newOrder.splice(draggedIndex, 1);
        newOrder.splice(targetIndex, 0, draggedId);
        setSidebarSectionOrder(newOrder);
    };

    const handleSectionDragEnd = () => {
        setDraggedSection(null);
        setDropTargetSection(null);
    };

    const [showFileTypeFilter, setShowFileTypeFilter] = useState(false);
    const [websiteSearch, setWebsiteSearch] = useState('');

    // Section settings panels
    const [showFilesSettings, setShowFilesSettings] = useState(false);
    const [showWebsitesSettings, setShowWebsitesSettings] = useState(false);
    const [showConversationsSettings, setShowConversationsSettings] = useState(false);

    // Files settings
    const [filesSettings, setFilesSettings] = useState(() => {
        const saved = localStorage.getItem('npcStudio_filesSettings');
        return saved ? JSON.parse(saved) : {
            showHidden: false,
            allowedExtensions: '',  // comma-separated, empty = all
            excludedExtensions: '.pyc,.pyo,.git,.DS_Store,__pycache__',
            excludedFolders: 'node_modules,.git,__pycache__,.venv,venv',
            maxDepth: 10
        };
    });

    // Websites settings
    const [websitesSettings, setWebsitesSettings] = useState(() => {
        const saved = localStorage.getItem('npcStudio_websitesSettings');
        return saved ? JSON.parse(saved) : {
            groupByDomain: true,
            maxHistory: 100,
            excludedDomains: '',  // comma-separated
            timeRangeDays: 30  // 0 = all time
        };
    });

    // Conversation filters
    const [showConvoFilters, setShowConvoFilters] = useState(false);
    const [convoNpcFilter, setConvoNpcFilter] = useState<string>(() => localStorage.getItem('npcStudio_convoNpcFilter') || '');
    const [convoModelFilter, setConvoModelFilter] = useState<string>(() => localStorage.getItem('npcStudio_convoModelFilter') || '');
    const [convoDateFrom, setConvoDateFrom] = useState<string>(() => localStorage.getItem('npcStudio_convoDateFrom') || '');
    const [convoDateTo, setConvoDateTo] = useState<string>(() => localStorage.getItem('npcStudio_convoDateTo') || '');

    // Conversations settings
    const [conversationsSettings, setConversationsSettings] = useState(() => {
        const saved = localStorage.getItem('npcStudio_conversationsSettings');
        return saved ? JSON.parse(saved) : {
            sortBy: 'date',  // date, title, npc, model
            sortOrder: 'desc',
            showEmpty: true,
            maxDisplay: 100
        };
    });

    // Persist file type filter to localStorage
    useEffect(() => {
        localStorage.setItem('npcStudio_fileTypeFilter', fileTypeFilter);
    }, [fileTypeFilter]);

    // Persist section settings
    useEffect(() => {
        localStorage.setItem('npcStudio_filesSettings', JSON.stringify(filesSettings));
    }, [filesSettings]);
    useEffect(() => {
        localStorage.setItem('npcStudio_websitesSettings', JSON.stringify(websitesSettings));
    }, [websitesSettings]);
    useEffect(() => {
        localStorage.setItem('npcStudio_conversationsSettings', JSON.stringify(conversationsSettings));
    }, [conversationsSettings]);

    // Persist conversation filters to localStorage
    useEffect(() => {
        localStorage.setItem('npcStudio_convoNpcFilter', convoNpcFilter);
    }, [convoNpcFilter]);
    useEffect(() => {
        localStorage.setItem('npcStudio_convoModelFilter', convoModelFilter);
    }, [convoModelFilter]);
    useEffect(() => {
        localStorage.setItem('npcStudio_convoDateFrom', convoDateFrom);
    }, [convoDateFrom]);
    useEffect(() => {
        localStorage.setItem('npcStudio_convoDateTo', convoDateTo);
    }, [convoDateTo]);
    // Persist bottom grid collapsed state
    useEffect(() => {
        localStorage.setItem('npcStudio_bottomGridCollapsed', String(bottomGridCollapsed));
    }, [bottomGridCollapsed]);

    // Load git status for current path
    const loadGitStatus = useCallback(async () => {
        if (!currentPath) return;
        setGitLoading(true);
        setGitError(null);
        try {
            const response = await (window as any).api.gitStatus(currentPath);
            setGitStatus(response);
        } catch (err: any) {
            setGitError(err.message || 'Failed to get git status');
            setGitStatus(null);
        } finally {
            setGitLoading(false);
        }
    }, [currentPath, setGitLoading, setGitError, setGitStatus]);

    useEffect(() => {
        if (currentPath) {
            loadGitStatus();
        }
        // Set up periodic refresh for git status (every 10 seconds)
        const gitRefreshInterval = setInterval(() => {
            if (currentPath && !gitPanelCollapsed) {
                loadGitStatus();
            }
        }, 10000);

        return () => clearInterval(gitRefreshInterval);
    }, [currentPath, loadGitStatus, gitPanelCollapsed]);

    // Periodic refresh for website history (every 15 seconds)
    useEffect(() => {
        const websiteRefreshInterval = setInterval(() => {
            if (!websitesCollapsed) {
                loadWebsiteHistory?.();
            }
        }, 15000);

        return () => clearInterval(websiteRefreshInterval);
    }, [websitesCollapsed, loadWebsiteHistory]);

    // Memory and Knowledge Graph sections
    const [memoriesCollapsed, setMemoriesCollapsed] = useState(true);
    const [knowledgeCollapsed, setKnowledgeCollapsed] = useState(true);
    const [memorySearch, setMemorySearch] = useState('');
    const [knowledgeSearch, setKnowledgeSearch] = useState('');
    const [memories, setMemories] = useState<any[]>([]);
    const [knowledgeEntities, setKnowledgeEntities] = useState<any[]>([]);
    const [loadingMemories, setLoadingMemories] = useState(false);
    const [loadingKnowledge, setLoadingKnowledge] = useState(false);
    // Local state for header actions expanded/collapsed (persisted)
    const [headerActionsExpanded, setHeaderActionsExpanded] = useState(() => {
        const saved = localStorage.getItem('npcStudio_headerActionsExpanded');
        return saved !== null ? JSON.parse(saved) : true;
    });
    // Persist headerActionsExpanded to localStorage
    useEffect(() => {
        localStorage.setItem('npcStudio_headerActionsExpanded', JSON.stringify(headerActionsExpanded));
    }, [headerActionsExpanded]);

    // Doc dropdown state (click-based instead of hover)
    const [docDropdownOpen, setDocDropdownOpen] = useState(false);
    // Terminal dropdown state (click-based)
    const [terminalDropdownOpen, setTerminalDropdownOpen] = useState(false);
    // Chat+ dropdown state (click-based)
    const [chatPlusDropdownOpen, setChatPlusDropdownOpen] = useState(false);
    // Code file dropdown state
    const [codeFileDropdownOpen, setCodeFileDropdownOpen] = useState(false);
    // Folder dropdown state
    const [folderDropdownOpen, setFolderDropdownOpen] = useState(false);
    const [folderDropdownPos, setFolderDropdownPos] = useState({ top: 0, left: 0 });
    const folderButtonRef = React.useRef<HTMLButtonElement>(null);
    // Recent paths for folder dropdown
    const [recentPaths, setRecentPaths] = useState<string[]>(() => {
        try {
            const stored = localStorage.getItem('incognide-recent-paths');
            return stored ? JSON.parse(stored) : [];
        } catch { return []; }
    });
    const [defaultCodeFileType, setDefaultCodeFileType] = useState<string>(() =>
        localStorage.getItem('npcStudio_defaultCodeFileType') || 'py'
    );
    
    // Persist default code file type
    useEffect(() => {
        localStorage.setItem('npcStudio_defaultCodeFileType', defaultCodeFileType);
    }, [defaultCodeFileType]);

    // Common file types for quick access
    const commonFileTypes = [
        { ext: 'py', label: 'Python', icon: '🐍' },
        { ext: 'js', label: 'JavaScript', icon: '📜' },
        { ext: 'ts', label: 'TypeScript', icon: '📘' },
        { ext: 'jsx', label: 'React JSX', icon: '⚛️' },
        { ext: 'tsx', label: 'React TSX', icon: '⚛️' },
        { ext: 'md', label: 'Markdown', icon: '📝' },
        { ext: 'txt', label: 'Text', icon: '📄' },
        { ext: 'sh', label: 'Shell Script', icon: '🖥️' },
        { ext: 'json', label: 'JSON', icon: '{}' },
        { ext: 'html', label: 'HTML', icon: '🌐' },
        { ext: 'css', label: 'CSS', icon: '🎨' },
        { ext: 'yaml', label: 'YAML', icon: '📋' },
        { ext: 'sql', label: 'SQL', icon: '🗃️' },
        { ext: 'go', label: 'Go', icon: '🐹' },
        { ext: 'rs', label: 'Rust', icon: '🦀' },
        { ext: 'c', label: 'C', icon: '©️' },
        { ext: 'cpp', label: 'C++', icon: '➕' },
        { ext: 'java', label: 'Java', icon: '☕' },
    ];

    // Create file with specific extension - just create untitled file directly
    const createFileWithExtension = (ext: string) => {
        setCodeFileDropdownOpen(false);
        if (createUntitledTextFile) {
            createUntitledTextFile();
        }
    };

    // Save to recent paths when currentPath changes
    useEffect(() => {
        if (currentPath && currentPath !== baseDir) {
            setRecentPaths(prev => {
                const filtered = prev.filter(p => p !== currentPath);
                const updated = [currentPath, ...filtered].slice(0, 10);
                localStorage.setItem('incognide-recent-paths', JSON.stringify(updated));
                return updated;
            });
        }
    }, [currentPath, baseDir]);

    // Close dropdowns when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            // Close code file dropdown if clicking outside
            if (codeFileDropdownOpen && !target.closest('[data-dropdown="code-file"]')) {
                setCodeFileDropdownOpen(false);
            }
            // Close doc dropdown if clicking outside
            if (docDropdownOpen && !target.closest('[data-dropdown="doc"]')) {
                setDocDropdownOpen(false);
            }
            // Close terminal dropdown if clicking outside
            if (terminalDropdownOpen && !target.closest('[data-dropdown="terminal"]')) {
                setTerminalDropdownOpen(false);
            }
            // Close folder dropdown if clicking outside
            if (folderDropdownOpen && !target.closest('[data-dropdown="folder"]')) {
                setFolderDropdownOpen(false);
            }
        };
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, [codeFileDropdownOpen, docDropdownOpen, terminalDropdownOpen, folderDropdownOpen]);
    // Website context menu state
    const [websiteContextMenu, setWebsiteContextMenu] = useState<{ x: number; y: number; url: string; title: string } | null>(null);
    // Zip modal state
    const [zipModal, setZipModal] = useState<{ items: string[]; defaultName: string } | null>(null);
    const [zipName, setZipName] = useState('');
    const [isZipping, setIsZipping] = useState(false);
    // Bookmarks state (from database, path-specific)
    const [bookmarks, setBookmarks] = useState<Array<{ id: number; url: string; title: string; folder_path: string; is_global: number }>>([]);
    // Default new pane type from global settings
    const [defaultNewPaneType, setDefaultNewPaneType] = useState<string>('chat');
    // Default new terminal type (system/bash, npcsh, guac)
    const [defaultNewTerminalType, setDefaultNewTerminalType] = useState<string>(() =>
        localStorage.getItem('npcStudio_defaultNewTerminalType') || 'system'
    );
    const [defaultNewNotebookType, setDefaultNewNotebookType] = useState<string>(() =>
        localStorage.getItem('npcStudio_defaultNewNotebookType') || 'notebook'
    );
    // Default new document type (docx, xlsx, pptx, mapx)
    const [defaultNewDocumentType, setDefaultNewDocumentType] = useState<string>(() =>
        localStorage.getItem('npcStudio_defaultNewDocumentType') || 'docx'
    );

    // Load default terminal/document types from global settings and listen for changes
    useEffect(() => {
        const loadDefaults = async () => {
            try {
                const data = await (window as any).api.loadGlobalSettings();
                if (data?.global_settings?.default_new_terminal_type) {
                    setDefaultNewTerminalType(data.global_settings.default_new_terminal_type);
                    localStorage.setItem('npcStudio_defaultNewTerminalType', data.global_settings.default_new_terminal_type);
                }
                if (data?.global_settings?.default_new_document_type) {
                    setDefaultNewDocumentType(data.global_settings.default_new_document_type);
                    localStorage.setItem('npcStudio_defaultNewDocumentType', data.global_settings.default_new_document_type);
                }
            } catch (err) {
                console.error('Failed to load default types:', err);
            }
        };
        loadDefaults();

        const handleTerminalTypeChanged = (e: CustomEvent) => {
            if (e.detail) setDefaultNewTerminalType(e.detail);
        };
        const handleDocumentTypeChanged = (e: CustomEvent) => {
            if (e.detail) setDefaultNewDocumentType(e.detail);
        };
        window.addEventListener('defaultTerminalTypeChanged', handleTerminalTypeChanged as EventListener);
        window.addEventListener('defaultDocumentTypeChanged', handleDocumentTypeChanged as EventListener);
        return () => {
            window.removeEventListener('defaultTerminalTypeChanged', handleTerminalTypeChanged as EventListener);
            window.removeEventListener('defaultDocumentTypeChanged', handleDocumentTypeChanged as EventListener);
        };
    }, []);

    // Load bookmarks from database
    const loadBookmarks = useCallback(async () => {
        if (!currentPath) return;
        try {
            const result = await (window as any).api.browserGetBookmarks({ folderPath: currentPath });
            if (result?.success) {
                setBookmarks(result.bookmarks || []);
            }
        } catch (err) {
            console.error('Error loading bookmarks:', err);
        }
    }, [currentPath]);

    useEffect(() => {
        loadBookmarks();
    }, [loadBookmarks]);

    // Website subsection collapse states (persisted to localStorage)
    const [bookmarksCollapsed, setBookmarksCollapsed] = useState(() => localStorage.getItem('sidebar_bookmarksCollapsed') === 'true');
    const [openBrowsersCollapsed, setOpenBrowsersCollapsed] = useState(() => localStorage.getItem('sidebar_openBrowsersCollapsed') === 'true');
    const [commonSitesCollapsed, setCommonSitesCollapsed] = useState(() => localStorage.getItem('sidebar_commonSitesCollapsed') === 'true');
    const [recentHistoryCollapsed, setRecentHistoryCollapsed] = useState(() => localStorage.getItem('sidebar_recentHistoryCollapsed') === 'true');

    // Persist collapse states
    useEffect(() => { localStorage.setItem('sidebar_bookmarksCollapsed', String(bookmarksCollapsed)); }, [bookmarksCollapsed]);
    useEffect(() => { localStorage.setItem('sidebar_openBrowsersCollapsed', String(openBrowsersCollapsed)); }, [openBrowsersCollapsed]);
    useEffect(() => { localStorage.setItem('sidebar_commonSitesCollapsed', String(commonSitesCollapsed)); }, [commonSitesCollapsed]);
    useEffect(() => { localStorage.setItem('sidebar_recentHistoryCollapsed', String(recentHistoryCollapsed)); }, [recentHistoryCollapsed]);

    // Load default new pane type from global settings
    useEffect(() => {
        const loadDefaultPaneType = async () => {
            // First check localStorage for immediate value
            const cached = localStorage.getItem('npcStudio_defaultNewPaneType');
            if (cached) {
                setDefaultNewPaneType(cached);
            }
            // Then load from settings file
            try {
                const data = await (window as any).api.loadGlobalSettings();
                if (data?.global_settings?.default_new_pane_type) {
                    setDefaultNewPaneType(data.global_settings.default_new_pane_type);
                    localStorage.setItem('npcStudio_defaultNewPaneType', data.global_settings.default_new_pane_type);
                }
            } catch (err) {
                console.error('Failed to load default pane type:', err);
            }
        };
        loadDefaultPaneType();

        // Listen for storage changes (when settings are saved from other tabs)
        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === 'npcStudio_defaultNewPaneType' && e.newValue) {
                setDefaultNewPaneType(e.newValue);
            }
        };
        // Listen for custom event (same window updates)
        const handleCustomEvent = (e: CustomEvent) => {
            if (e.detail) {
                setDefaultNewPaneType(e.detail);
            }
        };
        window.addEventListener('storage', handleStorageChange);
        window.addEventListener('defaultPaneTypeChanged', handleCustomEvent as EventListener);
        return () => {
            window.removeEventListener('storage', handleStorageChange);
            window.removeEventListener('defaultPaneTypeChanged', handleCustomEvent as EventListener);
        };
    }, []);

    // Limit input dialog state
    const [limitDialog, setLimitDialog] = useState<{ domain: string; hourlyTime: string; dailyTime: string; hourlyVisits: string; dailyVisits: string } | null>(null);

    // Permission dialog state (chmod/chown)
    const [permissionDialog, setPermissionDialog] = useState<{ path: string; type: 'chmod' | 'chown'; mode?: string; owner?: string; group?: string; recursive?: boolean; useSudo?: boolean } | null>(null);

    // Tile configuration state
    interface TileConfig {
        id: string;
        label: string;
        icon: string;
        enabled: boolean;
        order: number;
        subTypes?: string[];
    }
    const [tilesConfig, setTilesConfig] = useState<{ tiles: TileConfig[]; customTiles: TileConfig[] }>({
        tiles: [
            { id: 'theme', label: 'Theme', icon: 'theme', enabled: true, order: 0 },
            { id: 'chat', label: 'Chat', icon: 'plus', enabled: true, order: 1 },
            { id: 'folder', label: 'Folder', icon: 'folder', enabled: true, order: 2 },
            { id: 'browser', label: 'Browser', icon: 'globe', enabled: true, order: 3 },
            { id: 'terminal', label: 'Terminal', icon: 'terminal', enabled: true, order: 4, subTypes: ['system', 'npcsh', 'guac'] },
            { id: 'code', label: 'Code', icon: 'code', enabled: true, order: 5 },
            { id: 'document', label: 'Doc', icon: 'file-text', enabled: true, order: 6, subTypes: ['docx', 'xlsx', 'pptx', 'mapx'] },
            { id: 'workspace', label: 'Incognide', icon: 'incognide', enabled: true, order: 7 }
        ],
        customTiles: []
    });
    const [tileEditMode, setTileEditMode] = useState(false);
    const [bottomGridEditMode, setBottomGridEditMode] = useState(false);
    // Tile jinx state - loaded from ~/.npcsh/incognide/tiles/*.jinx
    const [tileJinxes, setTileJinxes] = useState<Array<{
        filename: string;
        jinx_name: string;
        label: string;
        icon: string;
        order: number;
        enabled: boolean;
        action?: string;
        rawContent: string;
    }>>([]);
    const [tileJinxesLoaded, setTileJinxesLoaded] = useState(false);
    const [editingTileJinx, setEditingTileJinx] = useState<string | null>(null);
    const [draggedTileIdx, setDraggedTileIdx] = useState<number | null>(null);
    const [tileJinxEditContent, setTileJinxEditContent] = useState('');
    const [showLivePreview, setShowLivePreview] = useState(false);
    const [livePreviewCode, setLivePreviewCode] = useState('');

    // Fallback config (used until jinxes load) - 2x2 grid
    // Moved: settings/env to top bar, npc/jinx to bottom right, datadash to top bar
    const [bottomGridConfig, setBottomGridConfig] = useState<Array<{id: string; label: string; icon: string; enabled: boolean; order: number}>>([]);
    const [draggedBottomTileId, setDraggedBottomTileId] = useState<string | null>(null);
    const [draggedTileId, setDraggedTileId] = useState<string | null>(null);

    // Load tile configuration on mount
    useEffect(() => {
        const loadTilesConfig = async () => {
            try {
                const config = await (window as any).api?.tilesConfigGet?.();
                if (config) {
                    setTilesConfig(config);
                }
            } catch (err) {
                console.error('Failed to load tiles config:', err);
            }
        };
        loadTilesConfig();
    }, []);

    // Load tile jinxes on mount
    useEffect(() => {
        const loadTileJinxes = async () => {
            try {
                const result = await (window as any).api?.tileJinxList?.();
                if (result?.success && result.tiles) {
                    const parsed = result.tiles.map((tile: { filename: string; content: string }) => {
                        const content = tile.content;
                        let jinx_name = '', label = '', icon = '', order = 0, enabled = true;

                        // Try JSDoc format first: @key value
                        let jinxMatch = content.match(/@jinx\s+(\S+)/);
                        let labelMatch = content.match(/@label\s+(.+)/);
                        let iconMatch = content.match(/@icon\s+(\S+)/);
                        let orderMatch = content.match(/@order\s+(\d+)/);
                        let enabledMatch = content.match(/@enabled\s+(\S+)/);

                        // Fallback to old # comment format: # key: value
                        if (!labelMatch) {
                            const oldLabel = content.match(/^#\s*label:\s*(.+)/m);
                            if (oldLabel) label = oldLabel[1].trim();
                        }
                        if (!iconMatch) {
                            const oldIcon = content.match(/^#\s*icon:\s*(\S+)/m);
                            if (oldIcon) icon = oldIcon[1].trim();
                        }
                        if (!orderMatch) {
                            const oldOrder = content.match(/^#\s*order:\s*(\d+)/m);
                            if (oldOrder) order = parseInt(oldOrder[1]) || 0;
                        }
                        if (!enabledMatch) {
                            const oldEnabled = content.match(/^#\s*enabled:\s*(\S+)/m);
                            if (oldEnabled) enabled = oldEnabled[1].trim() !== 'false';
                        }
                        if (!jinxMatch) {
                            const oldJinx = content.match(/^#\s*jinx_name:\s*(\S+)/m);
                            if (oldJinx) jinx_name = oldJinx[1].trim();
                        }

                        if (jinxMatch) jinx_name = jinxMatch[1].trim();
                        if (labelMatch) label = labelMatch[1].trim();
                        if (iconMatch) icon = iconMatch[1].trim();
                        if (orderMatch) order = parseInt(orderMatch[1]) || 0;
                        if (enabledMatch) enabled = enabledMatch[1].trim() !== 'false';

                        // Derive action from filename (db.jinx -> db)
                        const action = tile.filename.replace('.jinx', '');

                        return {
                            filename: tile.filename,
                            jinx_name,
                            label: label || action,
                            icon: icon || 'Box',
                            order,
                            enabled,
                            action,
                            rawContent: tile.content
                        };
                    });

                    // Filter out example/disabled and sort
                    setTileJinxes(parsed.filter((t: any) => !t.filename.startsWith('_')).sort((a: any, b: any) => a.order - b.order));
                    setTileJinxesLoaded(true);
                }
            } catch (err) {
                console.error('Failed to load tile jinxes:', err);
            }
        };
        loadTileJinxes();
    }, []);

    // Save a tile jinx after editing
    const saveTileJinx = useCallback(async (filename: string, content: string) => {
        try {
            await (window as any).api?.tileJinxWrite?.(filename, content);
            // Reload jinxes
            const result = await (window as any).api?.tileJinxList?.();
            if (result?.success && result.tiles) {
                const parsed = result.tiles.map((tile: { filename: string; content: string }) => {
                    const content = tile.content;
                    let jinx_name = '', label = '', icon = '', order = 0, enabled = true;

                    // Try JSDoc format: @key value
                    let m = content.match(/@jinx\s+(\S+)/); if (m) jinx_name = m[1].trim();
                    m = content.match(/@label\s+(.+)/); if (m) label = m[1].trim();
                    m = content.match(/@icon\s+(\S+)/); if (m) icon = m[1].trim();
                    m = content.match(/@order\s+(\d+)/); if (m) order = parseInt(m[1]) || 0;
                    m = content.match(/@enabled\s+(\S+)/); if (m) enabled = m[1].trim() !== 'false';

                    // Fallback to old # format
                    if (!label) { m = content.match(/^#\s*label:\s*(.+)/m); if (m) label = m[1].trim(); }
                    if (!icon) { m = content.match(/^#\s*icon:\s*(\S+)/m); if (m) icon = m[1].trim(); }
                    if (!order) { m = content.match(/^#\s*order:\s*(\d+)/m); if (m) order = parseInt(m[1]) || 0; }
                    if (!jinx_name) { m = content.match(/^#\s*jinx_name:\s*(\S+)/m); if (m) jinx_name = m[1].trim(); }

                    const action = tile.filename.replace('.jinx', '');
                    return { filename: tile.filename, jinx_name, label: label || action, icon: icon || 'Box', order, enabled, action, rawContent: tile.content };
                });
                setTileJinxes(parsed.filter((t: any) => !t.filename.startsWith('_')).sort((a: any, b: any) => a.order - b.order));
            }
            setEditingTileJinx(null);
            setTileJinxEditContent('');
            setBottomGridEditMode(false);
        } catch (err) {
            console.error('Failed to save tile jinx:', err);
        }
    }, []);

    // Reorder tiles via drag and drop
    const handleTileReorder = useCallback(async (fromIdx: number, toIdx: number) => {
        if (fromIdx === toIdx) return;
        const newTiles = [...tileJinxes];
        const [moved] = newTiles.splice(fromIdx, 1);
        newTiles.splice(toIdx, 0, moved);

        // Update order values in each tile's metadata and save
        for (let i = 0; i < newTiles.length; i++) {
            const tile = newTiles[i];
            // Update order in the rawContent header
            // Update order - try JSDoc format first, then old # format
            let updatedContent = tile.rawContent;
            if (/@order\s+\d+/.test(updatedContent)) {
                updatedContent = updatedContent.replace(/(@order\s+)\d+/, `$1${i}`);
            } else {
                updatedContent = updatedContent.replace(/^(#\s*order:\s*)\d+/m, `$1${i}`);
            }
            tile.order = i;
            tile.rawContent = updatedContent;
            await (window as any).api?.tileJinxWrite?.(tile.filename, updatedContent);
        }
        setTileJinxes(newTiles);
        setDraggedTileIdx(null);
    }, [tileJinxes]);

    // Compile TSX and prepare for react-live preview
    const compileForPreview = useCallback(async (code: string): Promise<string> => {
        try {
            // Find the EXPORTED component name BEFORE stripping exports
            // Look for "export default ComponentName" at end of file
            const exportDefaultMatch = code.match(/export\s+default\s+(\w+)\s*;?\s*$/m);
            // Or "export default function/const ComponentName"
            const exportDefaultFuncMatch = code.match(/export\s+default\s+(?:function|const)\s+(\w+)/);

            let componentName = exportDefaultMatch?.[1] || exportDefaultFuncMatch?.[1];

            // Fallback: find first component definition
            if (!componentName) {
                const funcMatch = code.match(/(?:const|function)\s+(\w+)\s*(?::\s*React\.FC)?[=(:]/);
                componentName = funcMatch?.[1] || 'Component';
            }

            console.log('[PREVIEW] Detected component:', componentName);

            // Remove JSDoc metadata and imports
            let cleaned = code.replace(/\/\*\*[\s\S]*?\*\/\s*\n?/, '');
            cleaned = cleaned.replace(/^#[^\n]*\n/gm, '');
            cleaned = cleaned.replace(/^import\s+.*?['"];?\s*$/gm, '');
            cleaned = cleaned.replace(/^export\s+(default\s+)?/gm, '');

            // Compile TypeScript to JavaScript via IPC
            const result = await (window as any).api?.transformTsx?.(cleaned);
            if (!result?.success) {
                return `render(<div className="p-4 text-red-400">Compile Error: ${result?.error || 'Unknown error'}</div>)`;
            }

            let compiled = result.output || '';
            if (!compiled) {
                return `render(<div className="p-4 text-red-400">No output from compiler</div>)`;
            }
            // Remove module system artifacts
            compiled = compiled.replace(/["']use strict["'];?\n?/g, '');
            compiled = compiled.replace(/Object\.defineProperty\(exports[\s\S]*?\);/g, '');
            compiled = compiled.replace(/exports\.\w+\s*=\s*/g, '');
            compiled = compiled.replace(/exports\.default\s*=\s*\w+;?/g, '');
            // Remove require() calls - dependencies come from scope
            compiled = compiled.replace(/(?:var|const|let)\s+\w+\s*=\s*require\([^)]+\);?\n?/g, '');
            compiled = compiled.replace(/require\([^)]+\)/g, '{}');
            // Replace module prefixes like lucide_react_1.Play with just Play
            compiled = compiled.replace(/\w+_\d+\.(\w+)/g, '$1');
            // Also handle react_1.useState etc
            compiled = compiled.replace(/react_1\.(\w+)/g, '$1');

            // Add render call with realistic props - embedded:true to prevent modal wrapper
            const mockProps = `{
                onClose: () => console.log('Preview: onClose called'),
                isPane: true,
                isOpen: true,
                isModal: false,
                embedded: true,
                projectPath: '/mock',
                currentPath: '/mock',
                theme: { bg: '#1a1a2e', fg: '#fff', accent: '#4a9eff' }
            }`;
            const finalCode = `${compiled}\n\nrender(<${componentName} {...${mockProps}} />)`;
            console.log('[PREVIEW] Compiled code (first 500 chars):', finalCode.slice(0, 500));
            return finalCode;
        } catch (err: any) {
            return `render(<div className="p-4 text-red-400">Error: ${err.message}</div>)`;
        }
    }, []);

    // Toggle live preview
    const toggleLivePreview = useCallback(async () => {
        if (!showLivePreview) {
            setLivePreviewCode('render(<div className="p-4 text-gray-400">Compiling...</div>)');
            setShowLivePreview(true);
            const compiled = await compileForPreview(tileJinxEditContent);
            setLivePreviewCode(compiled);
        } else {
            setShowLivePreview(false);
        }
    }, [showLivePreview, tileJinxEditContent, compileForPreview]);

    // Update preview when code changes (debounced)
    useEffect(() => {
        if (showLivePreview && tileJinxEditContent) {
            const timeoutId = setTimeout(async () => {
                const compiled = await compileForPreview(tileJinxEditContent);
                setLivePreviewCode(compiled);
            }, 800); // debounce
            return () => clearTimeout(timeoutId);
        }
    }, [tileJinxEditContent, showLivePreview, compileForPreview]);

    // Live preview scope - REAL components and REAL window.api
    const liveScope = useMemo(() => ({
        // React
        React,
        useState,
        useEffect,
        useCallback,
        useRef,
        useMemo,
        useLayoutEffect: React.useLayoutEffect,
        useContext: React.useContext,
        createContext: React.createContext,
        forwardRef: React.forwardRef,
        memo: React.memo,
        Fragment: React.Fragment,
        // REAL npcts components
        Modal, Tabs, Card, Button, Input, Select,
        // ALL REAL tile components - exactly what gets rendered
        DiskUsageAnalyzer,
        AutosizeTextarea,
        ForceGraph2D,
        ActivityIntelligence,
        BrowserHistoryWeb,
        CtxEditor,
        JinxMenu,
        KnowledgeGraphEditor,
        LabeledDataManager,
        McpServerMenu,
        MemoryManagement,
        MessageLabeling,
        NPCTeamMenu,
        PythonEnvSettings,
        DBTool,
        DataDash,
        LibraryViewer,
        GraphViewer,
        PhotoViewer,
        SettingsMenu,
        SettingsPanel: SettingsMenu, // alias
        // ALL lucide icons
        Database, Image, BookOpen, BarChart3, GitBranch, Network, Users, Bot, Zap,
        Settings, KeyRound, HardDrive, Box, Folder, File, Globe, ChevronRight, Edit,
        Terminal, Trash, Plus, X, Star, Clock, Activity, Lock, Archive, Sparkles,
        ChevronDown, ChevronUp, Play, GripVertical, Search, RefreshCw, Download,
        Upload, Copy, Check, AlertCircle, Info, Eye, EyeOff, Moon, Sun, Palette,
        Code, Save, FolderOpen, FileText, Home, ArrowLeft, ArrowRight, Menu, MoreVertical,
        Loader2, ExternalLink, Link, Unlink, Filter, SortAsc, SortDesc, Table, Grid,
        List, Maximize2, Minimize2, Move, RotateCcw, ZoomIn, ZoomOut, Layers, Layout,
        Pause, Server, Mail, Cpu, Wifi, WifiOff, Power, PowerOff, Hash, AtSign,
        FileJson, Wrench, Code2, FileStack, Share2, Tag, MessageSquare, ArrowUp,
        // Icon aliases
        DownloadCloud: Download, Trash2: Trash, Square: Box, Volume2: Activity, Mic: Activity, Keyboard: Settings,
        // REAL window with REAL api
        window,
        // Console
        console,
    }), []);

    // Save tile configuration
    const saveTilesConfig = useCallback(async (newConfig: typeof tilesConfig) => {
        try {
            await (window as any).api?.tilesConfigSave?.(newConfig);
            setTilesConfig(newConfig);
        } catch (err) {
            console.error('Failed to save tiles config:', err);
        }
    }, []);

    // Toggle tile enabled/disabled
    const toggleTileEnabled = useCallback((tileId: string) => {
        const newConfig = { ...tilesConfig };
        const tile = newConfig.tiles.find(t => t.id === tileId);
        if (tile) {
            tile.enabled = !tile.enabled;
            saveTilesConfig(newConfig);
        }
    }, [tilesConfig, saveTilesConfig]);

    // Reorder tiles via drag and drop
    const handleTileDragStart = useCallback((e: React.DragEvent, tileId: string) => {
        setDraggedTileId(tileId);
        e.dataTransfer.effectAllowed = 'move';
    }, []);

    const handleTileDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    }, []);

    const handleTileDrop = useCallback((e: React.DragEvent, targetTileId: string) => {
        e.preventDefault();
        if (!draggedTileId || draggedTileId === targetTileId) return;

        const newConfig = { ...tilesConfig };
        const allTiles = [...newConfig.tiles];
        const draggedIndex = allTiles.findIndex(t => t.id === draggedTileId);
        const targetIndex = allTiles.findIndex(t => t.id === targetTileId);

        if (draggedIndex !== -1 && targetIndex !== -1) {
            const [draggedTile] = allTiles.splice(draggedIndex, 1);
            allTiles.splice(targetIndex, 0, draggedTile);
            // Update order values
            allTiles.forEach((tile, idx) => { tile.order = idx; });
            newConfig.tiles = allTiles;
            saveTilesConfig(newConfig);
        }
        setDraggedTileId(null);
    }, [draggedTileId, tilesConfig, saveTilesConfig]);

    // Get sorted enabled tiles
    const enabledTiles = useMemo(() => {
        return [...tilesConfig.tiles, ...tilesConfig.customTiles]
            .filter(t => t.enabled)
            .sort((a, b) => a.order - b.order);
    }, [tilesConfig]);

// ===== ALL THE SIDEBAR FUNCTIONS BELOW =====

const handleSidebarResize = useCallback((e) => {
    if (!isResizingSidebar) return;

    const newWidth = e.clientX;
    // Constrain between 150px and 500px
    if (newWidth >= 150 && newWidth <= 500) {
        setSidebarWidth(newWidth);
    }
}, [isResizingSidebar, setSidebarWidth]);

const handleApplyPromptToFiles = async (operationType, customPrompt = '') => {
    const selectedFilePaths = Array.from(selectedFiles);
    if (selectedFilePaths.length === 0) return;

    try {
       
        const filesContentPromises = selectedFilePaths.map(async (filePath) => {
            const response = await window.api.readFileContent(filePath);
            if (response.error) {
                console.warn(`Could not read file ${filePath}:`, response.error);
                return `File (${getFileName(filePath)}): [Error reading content]`;
            }
            const fileName = getFileName(filePath);
            return `File (${fileName}):\n---\n${response.content}\n---`;
        });
        const filesContent = await Promise.all(filesContentPromises);

        let prompt = '';
        switch (operationType) {
            case 'summarize':
                prompt = `Summarize the content of these ${selectedFilePaths.length} file(s):\n\n`;
                break;
           
            default:
                 prompt = customPrompt + `\n\nApply this to these ${selectedFilePaths.length} file(s):\n\n`;
                 break;
        }
        const fullPrompt = prompt + filesContent.join('\n\n');

        const { conversation: newConversation, paneId: newPaneId } = await createNewConversation();

        if (!newConversation || !newPaneId) {
            throw new Error('Failed to create and retrieve new conversation pane details.');
        }

        const paneData = contentDataRef.current[newPaneId];
        if (!paneData || paneData.contentType !== 'chat') {
            throw new Error("Target pane is not a chat pane.");
        }

        const newStreamId = generateId();
        streamToPaneRef.current[newStreamId] = newPaneId;
        setIsStreaming(true);

        const selectedNpc = availableNPCs.find(npc => npc.value === currentNPC);
        const userMessage = { id: generateId(), role: 'user', content: fullPrompt, timestamp: new Date().toISOString() };
        const assistantPlaceholderMessage = { id: newStreamId, role: 'assistant', content: '', isStreaming: true, timestamp: new Date().toISOString(), streamId: newStreamId, model: currentModel, npc: currentNPC };

        paneData.chatMessages.allMessages.push(userMessage, assistantPlaceholderMessage);
        paneData.chatMessages.messages = paneData.chatMessages.allMessages.slice(-paneData.chatMessages.displayedMessageCount);

        setRootLayoutNode(prev => ({ ...prev }));


        await window.api.executeCommandStream({
            commandstr: fullPrompt,
            currentPath,
            conversationId: newConversation.id,
            model: currentModel,
            provider: currentProvider,
            npc: selectedNpc ? selectedNpc.name : currentNPC,
            npcSource: selectedNpc ? selectedNpc.source : 'global',
            attachments: [],
            streamId: newStreamId,
            executionMode,
            mcpServerPath: executionMode === 'tool_agent' ? mcpServerPath : undefined,
            selectedMcpTools: executionMode === 'tool_agent' ? selectedMcpTools : undefined,
        });

    } catch (err) {
        console.error('Error processing files:', err);
        setError(err.message);
        setIsStreaming(false);
    } finally {
        setSelectedFiles(new Set());
        setFileContextMenuPos(null);
    }
};

const handleApplyPromptToFilesInInput = async (operationType, customPrompt = '') => {
    const selectedFilePaths = Array.from(selectedFiles);
    if (selectedFilePaths.length === 0) return;
    
    try {
        const filesContentPromises = selectedFilePaths.map(async (filePath, index) => {
            const response = await window.api.readFileContent(filePath);
            if (response.error) {
                console.warn(`Could not read file ${filePath}:`, response.error);
                return `File ${index + 1} (${filePath}): [Error reading content: ${response.error}]`;
            }
            const fileName = getFileName(filePath);
            return `File ${index + 1} (${fileName}):\n---\n${response.content}\n---`;
        });
        const filesContent = await Promise.all(filesContentPromises);
        
        let prompt = '';
        switch (operationType) {
            case 'summarize':
                prompt = `Summarize the content of these ${selectedFilePaths.length} file(s):\n\n`;
                break;
            case 'analyze':
                prompt = `Analyze the content of these ${selectedFilePaths.length} file(s) for key insights:\n\n`;
                break;
            case 'refactor':
                prompt = `Refactor and improve the code in these ${selectedFilePaths.length} file(s):\n\n`;
                break;
            case 'document':
                prompt = `Generate documentation for these ${selectedFilePaths.length} file(s):\n\n`;
                break;
            case 'custom':
                prompt = customPrompt + `\n\nApply this to these ${selectedFilePaths.length} file(s):\n\n`;
                break;
        }

        const fullPrompt = prompt + filesContent.join('\n\n');

        if (!activeConversationId) {
            await createNewConversation();
        }

        setInput(fullPrompt);
        
    } catch (err) {
        console.error('Error preparing file prompt for input field:', err);
        setError(err.message);
    } finally {
        setSelectedFiles(new Set());
        setFileContextMenuPos(null);
    }
};

const handleFileContextMenu = (e, filePath) => {
    e.preventDefault();
    if (!selectedFiles.has(filePath) && selectedFiles.size > 0) {
        setSelectedFiles(prev => new Set([...prev, filePath]));
    } else if (selectedFiles.size === 0) {
        setSelectedFiles(new Set([filePath]));
    }
    setFileContextMenuPos({ x: e.clientX, y: e.clientY, filePath });
};

const handleOpenFolderAsWorkspace = useCallback(async (folderPath) => {
    console.log(`[handleOpenFolderAsWorkspace] Received folderPath: "${folderPath}", currentPath: "${currentPath}"`);
    if (folderPath === currentPath) {
        console.log("Already in this workspace, no need to switch!");
        setSidebarItemContextMenuPos(null);
        return;
    }
    // If folderPath doesn't start with /, it's a relative path - make it absolute
    let fullPath = folderPath;
    if (!folderPath.startsWith('/') && currentPath) {
        fullPath = `${currentPath}/${folderPath}`;
        console.log(`[handleOpenFolderAsWorkspace] Converted relative path to absolute: "${fullPath}"`);
    }
    console.log(`Opening folder as workspace: ${fullPath}`);
    await switchToPath(fullPath);
    setSidebarItemContextMenuPos(null);
}, [currentPath, switchToPath]);

const handleSidebarItemContextMenu = (e, path, type, isInaccessible = false) => {
    e.preventDefault();
    e.stopPropagation();
    if (type === 'file' && !selectedFiles.has(path)) {
        setSelectedFiles(new Set([path]));
    }
    setSidebarItemContextMenuPos({ x: e.clientX, y: e.clientY, path, type, isInaccessible });
};

const handleAnalyzeInDashboard = () => {
    const selectedIds = Array.from(selectedConvos);
    if (selectedIds.length === 0) return;
    console.log(`Analyzing ${selectedIds.length} conversations in dashboard.`);
    setDashboardMenuOpen(true);
    setContextMenuPos(null);
};

const handleSummarizeAndStart = async () => {
    const selectedIds = Array.from(selectedConvos);
    if (selectedIds.length === 0) return;
    setContextMenuPos(null);

    try {
        const { conversation: newConversation, paneId: newPaneId } = await createNewConversation();
        if (!newConversation || !newPaneId) {
            throw new Error('Failed to create new conversation');
        }

        const paneData = contentDataRef.current[newPaneId];
        if (!paneData || paneData.contentType !== 'chat') {
            throw new Error("Target pane is not a chat pane.");
        }

        const convosContentPromises = selectedIds.map(async (id, index) => {
            const messages = await window.api.getConversationMessages(id);
            if (!Array.isArray(messages)) {
                console.warn(`Could not fetch messages for conversation ${id}`);
                return `Conversation ${index + 1} (ID: ${id}): [Error fetching content]`;
            }
            const messagesText = messages.map(msg => `${msg.role}: ${msg.content}`).join('\n');
            return `Conversation ${index + 1} (ID: ${id}):\n---\n${messagesText}\n---`;
        });
        const convosContent = await Promise.all(convosContentPromises);
        const fullPrompt = `Please provide a concise summary of the following ${selectedIds.length} conversation(s):\n\n` + convosContent.join('\n\n');

        const newStreamId = generateId();
        streamToPaneRef.current[newStreamId] = newPaneId;
        setIsStreaming(true);

        const selectedNpc = availableNPCs.find(npc => npc.value === currentNPC);
        const userMessage = { id: generateId(), role: 'user', content: fullPrompt, timestamp: new Date().toISOString() };
        const assistantPlaceholderMessage = { id: newStreamId, role: 'assistant', content: '', isStreaming: true, timestamp: new Date().toISOString(), streamId: newStreamId, model: currentModel, npc: currentNPC };

        paneData.chatMessages.allMessages.push(userMessage, assistantPlaceholderMessage);
        paneData.chatMessages.messages = paneData.chatMessages.allMessages.slice(-paneData.chatMessages.displayedMessageCount);
        setRootLayoutNode(prev => ({ ...prev }));

        await window.api.executeCommandStream({
            commandstr: fullPrompt,
            currentPath,
            conversationId: newConversation.id,
            model: currentModel,
            provider: currentProvider,
            npc: selectedNpc ? selectedNpc.name : currentNPC,
            npcSource: selectedNpc ? selectedNpc.source : 'global',
            attachments: [],
            streamId: newStreamId,
            executionMode,
            mcpServerPath: executionMode === 'tool_agent' ? mcpServerPath : undefined,
            selectedMcpTools: executionMode === 'tool_agent' ? selectedMcpTools : undefined,
        });
    } catch (err) {
        console.error('Error summarizing:', err);
        setError(err.message);
        setIsStreaming(false);
    } finally {
        setSelectedConvos(new Set());
    }
};

const handleSummarizeAndDraft = async () => {
    const selectedIds = Array.from(selectedConvos);
    if (selectedIds.length === 0) return;
    setContextMenuPos(null);

    try {
        const convosContentPromises = selectedIds.map(async (id, index) => {
            const messages = await window.api.getConversationMessages(id);
            if (!Array.isArray(messages)) {
                console.warn(`Could not fetch messages for conversation ${id}`);
                return `Conversation ${index + 1} (ID: ${id}): [Error fetching content]`;
            }
            const messagesText = messages.map(msg => `${msg.role}: ${msg.content}`).join('\n');
            return `Conversation ${index + 1} (ID: ${id}):\n---\n${messagesText}\n---`;
        });
        const convosContent = await Promise.all(convosContentPromises);
        const fullPrompt = `Please provide a concise summary of the following ${selectedIds.length} conversation(s):\n\n` + convosContent.join('\n\n');
        setInput(fullPrompt);
    } catch (err) {
        console.error('Error summarizing for draft:', err);
        setError(err.message);
    } finally {
        setSelectedConvos(new Set());
    }
};

const handleSummarizeAndPrompt = async () => {
    const selectedIds = Array.from(selectedConvos);
    if (selectedIds.length === 0) return;
    setContextMenuPos(null);

    try {
        const { conversation: newConversation, paneId: newPaneId } = await createNewConversation();
        if (!newConversation || !newPaneId) {
            throw new Error('Failed to create new conversation');
        }

        const paneData = contentDataRef.current[newPaneId];
        const convosContentPromises = selectedIds.map(async (id, index) => {
            const messages = await window.api.getConversationMessages(id);
            if (!Array.isArray(messages)) {
                return `Conversation ${index + 1} (ID: ${id}): [Error fetching content]`;
            }
            const messagesText = messages.map(msg => `${msg.role}: ${msg.content}`).join('\n');
            return `Conversation ${index + 1} (ID: ${id}):\n---\n${messagesText}\n---`;
        });
        const convosContent = await Promise.all(convosContentPromises);
        const customPrompt = 'Provide a detailed analysis of the key themes and insights from these conversations';
        const fullPrompt = `${customPrompt}\n\nConversations to analyze:\n\n` + convosContent.join('\n\n');
        setInput(fullPrompt);
    } catch (err) {
        console.error('Error:', err);
        setError(err.message);
    } finally {
        setSelectedConvos(new Set());
    }
};

const handleSidebarItemDelete = async () => {
    if (!sidebarItemContextMenuPos) return;
    const { path, type } = sidebarItemContextMenuPos;
    
   
    const confirmation = window.confirm(`Are you sure you want to delete this ${type}? This action cannot be undone.`);
    if (!confirmation) {
        setSidebarItemContextMenuPos(null);
        return;
    }

    try {
        let response;
        if (type === 'file') {
            response = await window.api.deleteFile(path);
        } else if (type === 'directory') {
            response = await window.api.deleteDirectory(path);
        }

        if (response?.error) throw new Error(response.error);
        
        await loadDirectoryStructure(currentPath);

    } catch (err) {
        setError(`Failed to delete: ${err.message}`);
    } finally {
        setSidebarItemContextMenuPos(null);
    }
};

const handleSidebarRenameStart = () => {
    if (!sidebarItemContextMenuPos) return;
    const { path } = sidebarItemContextMenuPos;
    const currentName = getFileName(path);

    setRenamingPath(path);
    setEditedSidebarItemName(currentName);
    setSidebarItemContextMenuPos(null);
};

const handleZipItems = () => {
    if (!sidebarItemContextMenuPos) return;
    const { path: itemPath } = sidebarItemContextMenuPos;

    // Get all selected items or just the right-clicked one
    const selectedFilePaths = Array.from(selectedFiles);
    const itemsToZip = selectedFilePaths.length > 0 ? selectedFilePaths : [itemPath];

    // Generate default name
    const defaultName = itemsToZip.length === 1
        ? getFileName(itemsToZip[0])?.replace(/\.[^/.]+$/, '') || 'archive'
        : 'archive';

    // Show modal
    setZipName(defaultName);
    setZipModal({ items: itemsToZip, defaultName });
    setSidebarItemContextMenuPos(null);
};

const executeZip = async () => {
    if (!zipModal) return;

    const itemsToZip = zipModal.items;
    const name = zipName;

    setIsZipping(true);

    try {
        const response = await (window as any).api.zipItems(itemsToZip, name);
        if (response?.error) throw new Error(response.error);

        // Refresh to show the new zip file
        await refreshDirectoryStructureOnly();
    } catch (err: any) {
        setError(`Failed to create zip: ${err.message}`);
    } finally {
        setIsZipping(false);
        setZipModal(null);
        setZipName('');
    }
};

const handleFolderOverview = async () => {
    if (!sidebarItemContextMenuPos || sidebarItemContextMenuPos.type !== 'directory') return;
    const { path } = sidebarItemContextMenuPos;
    setSidebarItemContextMenuPos(null);

    try {
       
        const response = await window.api.getDirectoryContentsRecursive(path);
        if (response.error) throw new Error(response.error);
        if (response.files.length === 0) {
            setError("This folder contains no files to analyze.");
            return;
        }

       
        const filesContentPromises = response.files.map(async (filePath) => {
            const fileResponse = await window.api.readFileContent(filePath);
            const fileName = getFileName(filePath);
            return fileResponse.error 
                ? `File (${fileName}): [Error reading content]`
                : `File (${fileName}):\n---\n${fileResponse.content}\n---`;
        });
        const filesContent = await Promise.all(filesContentPromises);
        
        const fullPrompt = `Provide a high-level overview of the following ${response.files.length} file(s) from the '${getFileName(path)}' folder:\n\n` + filesContent.join('\n\n');

        const { conversation, paneId } = await createNewConversation();
        if (!conversation) throw new Error("Failed to create conversation for overview.");

       
        handleInputSubmit(new Event('submit'), fullPrompt, paneId, conversation.id);

    } catch (err) {
        setError(`Failed to get folder overview: ${err.message}`);
    }
};

const renderActiveWindowsIndicator = () => {
    const [otherWindows, setOtherWindows] = useState([]);
    
    useEffect(() => {
        const checkOtherWindows = () => {
            try {
                const activeWindows = JSON.parse(localStorage.getItem(ACTIVE_WINDOWS_KEY) || '{}');
                const now = Date.now();
                const others = Object.entries(activeWindows)
                    .filter(([wId]) => wId !== windowId) // Not this window
                    .filter(([, data]) => !data.closing) // Not marked as closing
                    .filter(([, data]) => (now - data.lastActive) < 30000) // Active in last 30 seconds
                    .map(([wId, data]) => ({
                        id: wId,
                        path: data.currentPath,
                        lastActive: data.lastActive
                    }));
                setOtherWindows(others);
            } catch (error) {
                console.error('Error checking other windows:', error);
                setOtherWindows([]);
            }
        };
        
        checkOtherWindows();
        const interval = setInterval(checkOtherWindows, 5000); // Check every 5 seconds
        return () => clearInterval(interval);
    }, [windowId]);
    
    // Don't render if no other windows - this prevents the "Other Windows (1)" issue
    if (otherWindows.length === 0) return null;
    
    return (
        <div className="px-4 py-1 border-b theme-border">
            <div 
                className="flex items-center justify-between cursor-pointer"
                onClick={() => setActiveWindowsExpanded(!activeWindowsExpanded)}
            >
                <div className="text-xs theme-text-muted">
                    Other Windows ({otherWindows.length})
                </div>
                <ChevronRight 
                    size={12} 
                    className={`transform transition-transform ${activeWindowsExpanded ? 'rotate-90' : ''}`} 
                />
            </div>
            
            {activeWindowsExpanded && (
                <div className="mt-1 pl-2 space-y-1">
                    {otherWindows.map(window => (
                        <div key={window.id} className="text-xs theme-text-muted truncate">
                            📁 {getFileName(window.path) || 'No folder'}
                            <span className="text-gray-600 ml-2">
                                ({Math.round((Date.now() - window.lastActive) / 1000)}s ago)
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
const renderWorkspaceIndicator = () => {
    // Check if current path has a saved workspace
    const allWorkspaces = JSON.parse(localStorage.getItem(WINDOW_WORKSPACES_KEY) || '{}');
    const windowWorkspaces = allWorkspaces[windowId] || {};
    const hasWorkspace = !!windowWorkspaces[currentPath];
    
    // Count ONLY currently active panes
    const activePaneCount = Object.keys(contentDataRef.current).length;
    
    // Let's also count from the layout tree to double-check
    const countPanesInLayout = (node) => {
        if (!node) return 0;
        if (node.type === 'content') return 1;
        if (node.type === 'split') {
            return node.children.reduce((count, child) => count + countPanesInLayout(child), 0);
        }
        return 0;
    };
    const layoutPaneCount = countPanesInLayout(rootLayoutNode);

    const workspaceData = windowWorkspaces[currentPath];
    const workspaceInfo = workspaceData ? {
        paneCount: layoutPaneCount, // Use the layout count instead
        lastSaved: new Date(workspaceData.lastAccessed).toLocaleTimeString(),
        timestamp: workspaceData.timestamp
    } : null;
    
    return (
        <div className="px-4 py-1 border-b theme-border">
            <div 
                className="flex items-center justify-between cursor-pointer" 
                onClick={() => setWorkspaceIndicatorExpanded(!workspaceIndicatorExpanded)}
            >
                <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${hasWorkspace ? 'bg-green-400' : 'bg-gray-500'}`} />
                    <span className="text-xs theme-text-muted">
                        {hasWorkspace ? `Workspace (${layoutPaneCount} panes)` : 'No Workspace'}
                    </span>
                </div>
                <ChevronRight 
                    size={12} 
                    className={`transform transition-transform ${workspaceIndicatorExpanded ? 'rotate-90' : ''}`} 
                />
            </div>
            
            {workspaceIndicatorExpanded && (
                <div className="mt-2 pl-4 space-y-2">
                    <div className="text-xs theme-text-muted">
                        Layout panes: {layoutPaneCount} | ContentData panes: {activePaneCount}
                    </div>
                    {hasWorkspace ? (
                        <>
                            <div className="text-xs theme-text-muted">
                                Last saved: {workspaceInfo?.lastSaved}
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        const workspaceData = serializeWorkspace();
                                        if (workspaceData) {
                                            saveWorkspaceToStorage(currentPath, workspaceData);
                                            setRootLayoutNode(p => ({ ...p }));
                                        }
                                    }}
                                    className="text-xs theme-button theme-hover px-2 py-1 rounded"
                                    title="Save current workspace"
                                >
                                    Save Now
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        // Clear workspace AND clean up contentDataRef
                                        const stored = JSON.parse(localStorage.getItem(WINDOW_WORKSPACES_KEY) || '{}');
                                        if (stored[windowId] && stored[windowId][currentPath]) {
                                            delete stored[windowId][currentPath];
                                            localStorage.setItem(WINDOW_WORKSPACES_KEY, JSON.stringify(stored));
                                        }
                                        
                                        // Clean up phantom panes in contentDataRef
                                        const validPaneIds = new Set();
                                        const collectPaneIds = (node) => {
                                            if (!node) return;
                                            if (node.type === 'content') validPaneIds.add(node.id);
                                            if (node.type === 'split') {
                                                node.children.forEach(collectPaneIds);
                                            }
                                        };
                                        collectPaneIds(rootLayoutNode);
                                        
                                        // Remove any contentDataRef entries that don't exist in the layout
                                        Object.keys(contentDataRef.current).forEach(paneId => {
                                            if (!validPaneIds.has(paneId)) {
                                                delete contentDataRef.current[paneId];
                                            }
                                        });
                                        
                                        setRootLayoutNode(p => ({ ...p }));
                                    }}
                                    className="text-xs theme-text-muted hover:text-red-400 transition-colors px-2 py-1 rounded"
                                    title="Clear saved workspace and clean up phantom panes"
                                >
                                    Clear & Clean
                                </button>
                            </div>
                        </>
                    ) : (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                const workspaceData = serializeWorkspace();
                                if (workspaceData) {
                                    saveWorkspaceToStorage(currentPath, workspaceData);
                                    setRootLayoutNode(p => ({ ...p }));
                                }
                            }}
                            className="text-xs theme-button theme-hover px-2 py-1 rounded"
                            title="Save current layout as workspace"
                        >
                            Save Current Layout
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};
    const deleteSelectedConversations = async () => {
    const selectedConversationIds = Array.from(selectedConvos);
    const selectedFilePaths = Array.from(selectedFiles);
    
    if (selectedConversationIds.length === 0 && selectedFilePaths.length === 0) {
        return;
    }
    
    try {
        if (selectedConversationIds.length > 0) {
            await Promise.all(selectedConversationIds.map(id => window.api.deleteConversation(id)));
        }

        if (selectedFilePaths.length > 0) {
            await Promise.all(selectedFilePaths.map(filePath => window.api.deleteFile(filePath)));
        }

        
        await loadDirectoryStructure(currentPath);

    } catch (err) {
        console.error('Error deleting items:', err);
        setError(err.message);
    } finally {
        
        setSelectedConvos(new Set());
        setSelectedFiles(new Set());
    }
    };

const handleRefreshFilesAndFolders = () => {
    if (currentPath) {
        refreshDirectoryStructureOnly();
    }
};

const refreshDirectoryStructureOnly = async () => {
    try {
        if (!currentPath) {
            console.error('No directory path provided');
            return {};
        }
        const structureResult = await window.api.readDirectoryStructure(currentPath);
        if (structureResult && !structureResult.error) {
            setFolderStructure(structureResult);
        } else {
            console.error('Error loading structure:', structureResult?.error);
            setFolderStructure({ error: structureResult?.error || 'Failed' });
        }
        
        // DON'T load conversations - just refresh the file structure
        return structureResult;
    } catch (err) {
        console.error('Error loading structure:', err);
        setError(err.message);
        setFolderStructure({ error: err.message });
        return { error: err.message };
    }
};
const refreshConversations = async () => {
    if (currentPath) {
        try {
            const normalizedPath = normalizePath(currentPath);
            const response = await window.api.getConversations(normalizedPath);

            if (response?.conversations) {
                const formattedConversations = response.conversations.map(conv => ({
                    id: conv.id,
                    title: conv.preview?.split('\n')[0]?.substring(0, 30) || 'New Conversation',
                    preview: conv.preview || 'No content',
                    timestamp: conv.timestamp || Date.now(),
                    last_message_timestamp: conv.last_message_timestamp || conv.timestamp || Date.now(),
                    npc: conv.npc || conv.assistant_name || conv.npc_name || '',
                    model: conv.model || conv.model_name || '',
                    provider: conv.provider || '',
                }));

                formattedConversations.sort((a, b) =>
                    new Date(b.last_message_timestamp).getTime() - new Date(a.last_message_timestamp).getTime()
                );

                setDirectoryConversations([...formattedConversations]);
            } else {
                setDirectoryConversations([]);
            }
        } catch (err) {
            console.error('Error refreshing conversations:', err);
            setDirectoryConversations([]);
        }
    }
};


const renderWebsiteList = () => {
    // Filter websites by search
    const allWebsites = [...(websiteHistory || []), ...(bookmarks || [])];
    const filteredWebsites = websiteSearch.trim()
        ? allWebsites.filter(site =>
            (site.title || '').toLowerCase().includes(websiteSearch.toLowerCase()) ||
            (site.url || '').toLowerCase().includes(websiteSearch.toLowerCase())
        )
        : allWebsites;

    const header = (
        <div
            className={`transition-all duration-150 ${draggedSection === 'websites' ? 'opacity-50' : ''} ${dropTargetSection === 'websites' ? 'ring-2 ring-purple-500' : ''}`}
            onDragOver={handleSectionDragOver('websites')}
            onDragLeave={handleSectionDragLeave}
            onDrop={handleSectionDrop('websites')}
        >
            <div
                draggable
                onDragStart={handleSectionDragStart('websites')}
                onDragEnd={handleSectionDragEnd}
                onClick={() => setWebsitesCollapsed(!websitesCollapsed)}
                className="flex items-stretch w-full py-4 bg-gradient-to-r from-purple-800/40 to-indigo-700/35 cursor-pointer hover:bg-white/5"
            >
                {/* Left: chevron, then conditional controls */}
                <div className="flex items-center pl-1 gap-0">
                    <ChevronRight size={14} className={`transform transition-transform text-gray-600 dark:text-gray-400 ${websitesCollapsed ? "" : "rotate-90"}`} />
                    {!websitesCollapsed && (
                        <>
                            <button
                                onClick={(e) => { e.stopPropagation(); loadWebsiteHistory(); }}
                                className="p-1.5 hover:bg-white/10 rounded transition-all text-gray-400 hover:text-purple-400"
                                title="Refresh"
                            >
                                <RefreshCw size={12} />
                            </button>
                            <button
                                onClick={(e) => { e.stopPropagation(); setShowWebsitesSettings(!showWebsitesSettings); }}
                                className={`p-1.5 hover:bg-white/10 rounded transition-all ${showWebsitesSettings ? 'text-purple-400' : 'text-gray-400 hover:text-purple-400'}`}
                                title="Settings"
                            >
                                <Settings size={12} />
                            </button>
                            <button
                                onClick={(e) => { e.stopPropagation(); createBrowserGraphPane?.(); }}
                                className="p-1.5 hover:bg-white/10 rounded transition-all text-gray-400 hover:text-cyan-400"
                                title="Browser History Graph"
                            >
                                <Network size={12} />
                            </button>
                        </>
                    )}
                </div>
                {/* Right: main icon - full height clickable area */}
                <button
                    onClick={(e) => { e.stopPropagation(); createNewBrowser?.(); setWebsitesCollapsed(false); }}
                    className="ml-auto flex items-center justify-center w-1/4 py-4 -my-4 hover:bg-white/10 transition-all"
                    title="New Browser"
                >
                    <Globe size={12} className="text-purple-300" />
                </button>
            </div>
            {/* Websites Settings Panel */}
            {showWebsitesSettings && (
                <div className="p-2 bg-purple-900/20 border-y border-purple-500/30 text-[10px] space-y-2">
                    <div className="flex items-center justify-between">
                        <label className="text-gray-300">Group by domain</label>
                        <input
                            type="checkbox"
                            checked={websitesSettings.groupByDomain}
                            onChange={(e) => setWebsitesSettings(s => ({ ...s, groupByDomain: e.target.checked }))}
                            className="rounded"
                        />
                    </div>
                    <div>
                        <label className="text-gray-400 block mb-1">Time range (days, 0=all)</label>
                        <input
                            type="number"
                            value={websitesSettings.timeRangeDays}
                            onChange={(e) => setWebsitesSettings(s => ({ ...s, timeRangeDays: parseInt(e.target.value) || 0 }))}
                            className="w-full bg-black/30 border border-white/10 rounded px-2 py-1 text-gray-200"
                            min="0"
                        />
                    </div>
                    <div>
                        <label className="text-gray-400 block mb-1">Max history items</label>
                        <input
                            type="number"
                            value={websitesSettings.maxHistory}
                            onChange={(e) => setWebsitesSettings(s => ({ ...s, maxHistory: parseInt(e.target.value) || 100 }))}
                            className="w-full bg-black/30 border border-white/10 rounded px-2 py-1 text-gray-200"
                            min="10"
                        />
                    </div>
                    <div>
                        <label className="text-gray-400 block mb-1">Excluded domains (comma-sep)</label>
                        <input
                            type="text"
                            value={websitesSettings.excludedDomains}
                            onChange={(e) => setWebsitesSettings(s => ({ ...s, excludedDomains: e.target.value }))}
                            placeholder="facebook.com,twitter.com"
                            className="w-full bg-black/30 border border-white/10 rounded px-2 py-1 text-gray-200 placeholder-gray-600"
                        />
                    </div>
                </div>
            )}
            {!websitesCollapsed && allWebsites.length > 0 && (
                <div className="px-1 py-1 bg-black/20 border-b border-white/5">
                    <div className="relative">
                        <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
                        <input
                            type="text"
                            value={websiteSearch}
                            onChange={(e) => setWebsiteSearch(e.target.value)}
                            placeholder="Search websites..."
                            className="w-full bg-white/5 border border-white/10 rounded pl-7 pr-2 py-1 text-[11px] text-gray-300 placeholder-gray-600 focus:outline-none focus:border-purple-500/50"
                        />
                        {websiteSearch && (
                            <button onClick={() => setWebsiteSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                                <X size={10} />
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );

    if (websitesCollapsed && openBrowsers.length === 0) {
        return <div>{header}</div>;
    }

    return (
        <div className="flex flex-col h-full">
            {header}

            {!websitesCollapsed && (
                <div className="bg-black/10 flex-1 min-h-0 overflow-y-auto">
                    {/* Currently Open Browsers */}
                    {openBrowsers.length > 0 && (
                        <div className="border-b border-white/5">
                            <div
                                className="text-[10px] text-gray-500 px-2 py-1 font-medium flex items-center justify-between cursor-pointer hover:bg-white/5"
                                onClick={() => setOpenBrowsersCollapsed(!openBrowsersCollapsed)}
                            >
                                <span className="flex items-center gap-1"><Globe size={10} className="text-blue-400" /> Open ({openBrowsers.length})</span>
                                <ChevronRight size={10} className={`transform transition-transform ${openBrowsersCollapsed ? '' : 'rotate-90'}`} />
                            </div>
                            {!openBrowsersCollapsed && openBrowsers.map(browser => (
                                <button
                                    key={browser.paneId}
                                    onClick={() => setActiveContentPaneId(browser.paneId)}
                                    onContextMenu={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setWebsiteContextMenu({
                                            x: e.clientX,
                                            y: e.clientY,
                                            url: browser.url,
                                            title: browser.title || new URL(browser.url).hostname
                                        });
                                    }}
                                    className={`flex items-center gap-2 px-2 py-1.5 w-full text-left transition-all group ${
                                        activeContentPaneId === browser.paneId
                                            ? 'bg-teal-500/20 border-l-2 border-teal-500'
                                            : 'hover:bg-white/5 border-l-2 border-transparent'
                                    }`}
                                >
                                    <Globe size={13} className="text-blue-400 flex-shrink-0" />
                                    <div className="flex flex-col overflow-hidden min-w-0 flex-1">
                                        <span className="text-[11px] truncate text-gray-200">{browser.title}</span>
                                        <span className="text-[9px] text-gray-600 truncate">{browser.url}</span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Bookmarks */}
                    {bookmarks.length > 0 && (
                        <div className="border-b border-white/5">
                            <div
                                className="text-[10px] text-gray-500 px-2 py-1.5 font-medium flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors"
                                onClick={() => setBookmarksCollapsed(!bookmarksCollapsed)}
                            >
                                <span className="flex items-center gap-1.5">
                                    <Star size={10} className="text-yellow-400" />
                                    Bookmarks ({bookmarks.length})
                                </span>
                                <ChevronRight size={10} className={`transform transition-transform text-gray-600 ${bookmarksCollapsed ? '' : 'rotate-90'}`} />
                            </div>
                            {!bookmarksCollapsed && bookmarks.map((bookmark, idx) => (
                                <button
                                    key={`${bookmark.url}-${idx}`}
                                    onClick={() => createNewBrowser(bookmark.url)}
                                    onContextMenu={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setWebsiteContextMenu({
                                            x: e.clientX,
                                            y: e.clientY,
                                            url: bookmark.url,
                                            title: bookmark.title
                                        });
                                    }}
                                    className="flex items-center gap-2 px-2 py-1.5 w-full text-left hover:bg-white/5 transition-all group border-l-2 border-transparent hover:border-yellow-500/50"
                                >
                                    <Star size={12} className="text-yellow-400 flex-shrink-0" />
                                    <div className="flex flex-col overflow-hidden min-w-0 flex-1">
                                        <span className="text-[11px] truncate text-gray-200">{bookmark.title}</span>
                                        <span className="text-[9px] text-gray-600 truncate">{bookmark.url}</span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Common Sites */}
                    {commonSites.length > 0 && (
                        <div className="border-b border-white/5">
                            <div
                                className="text-[10px] text-gray-500 px-2 py-1.5 font-medium flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors"
                                onClick={() => setCommonSitesCollapsed(!commonSitesCollapsed)}
                            >
                                <span className="flex items-center gap-1.5">
                                    <Globe size={10} className="text-green-400" />
                                    Frequent ({commonSites.length})
                                </span>
                                <ChevronRight size={10} className={`transform transition-transform text-gray-600 ${commonSitesCollapsed ? '' : 'rotate-90'}`} />
                            </div>
                            {!commonSitesCollapsed && commonSites.map(site => (
                                <button
                                    key={site.domain}
                                    draggable="true"
                                    onDragStart={(e) => {
                                        e.dataTransfer.effectAllowed = 'copyMove';
                                        handleGlobalDragStart(e, {
                                            type: 'browser',
                                            id: `browser_${generateId()}`,
                                            url: `https://${site.domain}`
                                        });
                                    }}
                                    onDragEnd={handleGlobalDragEnd}
                                    onClick={() => createNewBrowser(`https://${site.domain}`)}
                                    onContextMenu={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setWebsiteContextMenu({
                                            x: e.clientX,
                                            y: e.clientY,
                                            url: `https://${site.domain}`,
                                            title: site.domain
                                        });
                                    }}
                                    className="flex items-center gap-2 px-2 py-1.5 w-full text-left hover:bg-white/5 transition-all group border-l-2 border-transparent hover:border-green-500/50"
                                >
                                    <img
                                        src={site.favicon}
                                        alt=""
                                        className="w-3.5 h-3.5 flex-shrink-0 rounded"
                                        onError={(e) => {
                                            e.target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="gray" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>';
                                        }}
                                    />
                                    <div className="flex flex-col overflow-hidden min-w-0 flex-1">
                                        <span className="text-[11px] truncate text-gray-200">{site.domain}</span>
                                        <span className="text-[9px] text-gray-600">
                                            {site.count} visits
                                        </span>
                                    </div>
                                    <Plus
                                        size={10}
                                        className="text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity hover:text-green-400"
                                    />
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Recent History */}
                    {websiteHistory.length > 0 && (
                        <div>
                            <div
                                className="text-[10px] text-gray-500 px-2 py-1.5 font-medium flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors"
                                onClick={() => setRecentHistoryCollapsed(!recentHistoryCollapsed)}
                            >
                                <span className="flex items-center gap-1.5">
                                    <Clock size={10} className="text-cyan-400" />
                                    History ({websiteHistory.length})
                                </span>
                                <ChevronRight size={10} className={`transform transition-transform text-gray-600 ${recentHistoryCollapsed ? '' : 'rotate-90'}`} />
                            </div>
                            {!recentHistoryCollapsed && <div className="max-h-48 overflow-y-auto">
                                {websiteHistory.slice(0, 20).map((item, idx) => (
                                    <button
                                        key={`${item.url}-${idx}`}
                                        draggable="true"
                                        onDragStart={(e) => {
                                            e.dataTransfer.effectAllowed = 'copyMove';
                                            handleGlobalDragStart(e, {
                                                type: 'browser',
                                                id: `browser_${generateId()}`,
                                                url: item.url
                                            });
                                        }}
                                        onDragEnd={handleGlobalDragEnd}
                                        onClick={() => createNewBrowser(item.url)}
                                        onContextMenu={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            setWebsiteContextMenu({
                                                x: e.clientX,
                                                y: e.clientY,
                                                url: item.url,
                                                title: item.title || new URL(item.url).hostname
                                            });
                                        }}
                                        className="flex items-center gap-2 px-2 py-1.5 w-full text-left hover:bg-white/5 transition-all group border-l-2 border-transparent hover:border-cyan-500/50"
                                    >
                                        <Globe size={11} className="text-gray-500 flex-shrink-0" />
                                        <div className="flex flex-col overflow-hidden min-w-0 flex-1">
                                            <span className="text-[11px] truncate text-gray-300">
                                                {item.title || new URL(item.url).hostname}
                                            </span>
                                            <span className="text-[9px] text-gray-600 truncate">
                                                {new Date(item.timestamp).toLocaleString()}
                                            </span>
                                        </div>
                                    </button>
                                ))}
                            </div>}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

    // Load memories for the current path
    const loadMemories = useCallback(async () => {
        if (!currentPath) return;
        setLoadingMemories(true);
        try {
            // Try to fetch memories from the API
            const response = await window.api.getMemories?.({ path: currentPath, limit: 50 });
            if (response?.memories) {
                setMemories(response.memories);
            }
        } catch (err) {
            console.error('[Sidebar] Failed to load memories:', err);
        } finally {
            setLoadingMemories(false);
        }
    }, [currentPath]);

    // Load knowledge graph entities for the current path
    const loadKnowledgeEntities = useCallback(async () => {
        if (!currentPath) return;
        setLoadingKnowledge(true);
        try {
            // Try to fetch knowledge graph from the API
            const response = await window.api.getKnowledgeGraph?.({ path: currentPath, limit: 50 });
            if (response?.entities) {
                setKnowledgeEntities(response.entities);
            }
        } catch (err) {
            console.error('[Sidebar] Failed to load knowledge graph:', err);
        } finally {
            setLoadingKnowledge(false);
        }
    }, [currentPath]);

    // Load memories and knowledge when path changes or sections expand
    useEffect(() => {
        if (!memoriesCollapsed && currentPath) {
            loadMemories();
        }
    }, [memoriesCollapsed, currentPath, loadMemories]);

    useEffect(() => {
        if (!knowledgeCollapsed && currentPath) {
            loadKnowledgeEntities();
        }
    }, [knowledgeCollapsed, currentPath, loadKnowledgeEntities]);

    // Render Memory section
    const renderMemorySection = () => {
        const filteredMemories = memorySearch.trim()
            ? memories.filter(m =>
                (m.content || '').toLowerCase().includes(memorySearch.toLowerCase()) ||
                (m.type || '').toLowerCase().includes(memorySearch.toLowerCase())
            )
            : memories;

        return (
            <div className="mt-3">
                <div className="flex w-full bg-gradient-to-r from-purple-900/20 to-pink-900/20 border-b border-purple-500/20">
                    {/* Left side: Icon + action buttons */}
                    <div className="flex items-center gap-0.5 px-2">
                        <MemoryIcon size={12} className="text-purple-400 mr-1" />
                        <button
                            onClick={(e) => { e.stopPropagation(); loadMemories(); }}
                            className="p-1.5 hover:bg-white/10 rounded transition-all text-gray-400 hover:text-purple-400"
                            title="Refresh memories"
                        >
                            <RefreshCw size={12} />
                        </button>
                    </div>
                    {/* Right side: Clickable dropdown area */}
                    <div
                        onClick={() => setMemoriesCollapsed(!memoriesCollapsed)}
                        className="flex-1 flex items-center justify-end gap-1.5 px-2 py-4 cursor-pointer hover:bg-white/5"
                    >
                        <ChevronRight size={14} className={`transform transition-transform text-gray-600 dark:text-gray-400 ${memoriesCollapsed ? "" : "rotate-90"}`} />
                    </div>
                </div>

                {!memoriesCollapsed && (
                    <>
                        {/* Search */}
                        <div className="px-1 py-1 bg-black/20 border-b border-white/5">
                            <div className="relative">
                                <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
                                <input
                                    type="text"
                                    value={memorySearch}
                                    onChange={(e) => setMemorySearch(e.target.value)}
                                    placeholder="Search memories..."
                                    className="w-full bg-white/5 border border-white/10 rounded pl-7 pr-2 py-1 text-[11px] text-gray-300 placeholder-gray-600 focus:outline-none focus:border-purple-500/50"
                                />
                                {memorySearch && (
                                    <button onClick={() => setMemorySearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                                        <X size={10} />
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Memory list */}
                        <div className="bg-black/10 max-h-[200px] overflow-y-auto">
                            {loadingMemories ? (
                                <div className="px-3 py-3 text-[11px] text-gray-500 text-center">Loading...</div>
                            ) : filteredMemories.length === 0 ? (
                                <div className="px-3 py-3 text-[11px] text-gray-500 text-center">
                                    {memorySearch ? `No matches for "${memorySearch}"` : 'No memories yet'}
                                </div>
                            ) : (
                                filteredMemories.map((memory, index) => (
                                    <div
                                        key={memory.id || index}
                                        className="px-2 py-1.5 hover:bg-white/5 border-l-2 border-transparent hover:border-purple-500/50 cursor-pointer"
                                        onClick={() => {
                                            // Could open memory in a viewer pane
                                            console.log('Memory clicked:', memory);
                                        }}
                                    >
                                        <div className="text-[11px] text-gray-200 truncate">{memory.content || memory.summary || 'Memory'}</div>
                                        <div className="text-[9px] text-gray-500 flex items-center gap-1 mt-0.5">
                                            <span className="px-1 py-0.5 bg-purple-500/20 rounded text-purple-400">{memory.type || 'general'}</span>
                                            {memory.timestamp && <span>{new Date(memory.timestamp).toLocaleDateString()}</span>}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </>
                )}
            </div>
        );
    };

    // Render Knowledge Graph section
    const renderKnowledgeSection = () => {
        const filteredEntities = knowledgeSearch.trim()
            ? knowledgeEntities.filter(e =>
                (e.name || '').toLowerCase().includes(knowledgeSearch.toLowerCase()) ||
                (e.type || '').toLowerCase().includes(knowledgeSearch.toLowerCase())
            )
            : knowledgeEntities;

        return (
            <div className="mt-3">
                <div className="flex w-full bg-gradient-to-r from-cyan-900/20 to-blue-900/20 border-b border-cyan-500/20">
                    {/* Left side: Icon + action buttons */}
                    <div className="flex items-center gap-0.5 px-2">
                        <Network size={12} className="text-cyan-400 mr-1" />
                        <button
                            onClick={(e) => { e.stopPropagation(); loadKnowledgeEntities(); }}
                            className="p-1.5 hover:bg-white/10 rounded transition-all text-gray-400 hover:text-cyan-400"
                            title="Refresh knowledge graph"
                        >
                            <RefreshCw size={12} />
                        </button>
                    </div>
                    {/* Right side: Clickable dropdown area */}
                    <div
                        onClick={() => setKnowledgeCollapsed(!knowledgeCollapsed)}
                        className="flex-1 flex items-center justify-end gap-1.5 px-2 py-4 cursor-pointer hover:bg-white/5"
                    >
                        <ChevronRight size={14} className={`transform transition-transform text-gray-600 dark:text-gray-400 ${knowledgeCollapsed ? "" : "rotate-90"}`} />
                    </div>
                </div>

                {!knowledgeCollapsed && (
                    <>
                        {/* Search */}
                        <div className="px-1 py-1 bg-black/20 border-b border-white/5">
                            <div className="relative">
                                <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
                                <input
                                    type="text"
                                    value={knowledgeSearch}
                                    onChange={(e) => setKnowledgeSearch(e.target.value)}
                                    placeholder="Search entities..."
                                    className="w-full bg-white/5 border border-white/10 rounded pl-7 pr-2 py-1 text-[11px] text-gray-300 placeholder-gray-600 focus:outline-none focus:border-cyan-500/50"
                                />
                                {knowledgeSearch && (
                                    <button onClick={() => setKnowledgeSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                                        <X size={10} />
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Entity list */}
                        <div className="bg-black/10 max-h-[200px] overflow-y-auto">
                            {loadingKnowledge ? (
                                <div className="px-3 py-3 text-[11px] text-gray-500 text-center">Loading...</div>
                            ) : filteredEntities.length === 0 ? (
                                <div className="px-3 py-3 text-[11px] text-gray-500 text-center">
                                    {knowledgeSearch ? `No matches for "${knowledgeSearch}"` : 'No knowledge entries yet'}
                                </div>
                            ) : (
                                filteredEntities.map((entity, index) => (
                                    <div
                                        key={entity.id || index}
                                        className="px-2 py-1.5 hover:bg-white/5 border-l-2 border-transparent hover:border-cyan-500/50 cursor-pointer"
                                        onClick={() => {
                                            // Could open entity in knowledge graph viewer
                                            createGraphViewerPane?.();
                                        }}
                                    >
                                        <div className="text-[11px] text-gray-200 truncate flex items-center gap-1">
                                            <Share2 size={10} className="text-cyan-400" />
                                            {entity.name || 'Entity'}
                                        </div>
                                        <div className="text-[9px] text-gray-500 flex items-center gap-1 mt-0.5">
                                            <span className="px-1 py-0.5 bg-cyan-500/20 rounded text-cyan-400">{entity.type || 'node'}</span>
                                            {entity.connections && <span>{entity.connections} connections</span>}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </>
                )}
            </div>
        );
    };

    const renderDiskUsagePanel = () => {
        console.log('[DiskUsage] renderDiskUsagePanel called, currentPath:', currentPath, 'diskUsageCollapsed:', diskUsageCollapsed);
        if (!currentPath) {
            console.log('[DiskUsage] No currentPath, returning null');
            return null;
        }

        return (
            <div className="mt-4 border-t theme-border pt-2">
                {/* Header with collapse toggle */}
                <div className="flex items-center justify-between px-4 py-1">
                    <div className="text-xs text-gray-500 font-medium flex items-center gap-2">
                        <HardDrive size={14} />
                        Disk Usage
                    </div>
                    <button
                        onClick={() => setDiskUsageCollapsed(!diskUsageCollapsed)}
                        className="p-1 theme-hover rounded"
                        title={diskUsageCollapsed ? "Expand disk usage" : "Collapse disk usage"}
                    >
                        <ChevronRight
                            size={14}
                            className={`transform transition-transform ${diskUsageCollapsed ? "" : "rotate-90"}`}
                        />
                    </button>
                </div>
                {!diskUsageCollapsed && (
                    <div className="px-2">
                        <DiskUsageAnalyzer path={currentPath} isDarkMode={isDarkMode} />
                    </div>
                )}
            </div>
        );
    };

    const renderGitPanel = () => {
        // Only render the panel if gitStatus is available
        if (!gitStatus) return null;

        const staged = Array.isArray(gitStatus.staged) ? gitStatus.staged : [];
        const unstaged = Array.isArray(gitStatus.unstaged) ? gitStatus.unstaged : [];
        const untracked = Array.isArray(gitStatus.untracked) ? gitStatus.untracked : [];

        // Helper to open diff viewer for a file
        const openFileDiff = (filePath: string, status: string) => {
            const paneId = generateId();
            const fullPath = filePath.startsWith('/') ? filePath : `${currentPath}/${filePath}`;
            if (createAndAddPaneNodeToLayout) {
                createAndAddPaneNodeToLayout({
                    id: paneId,
                    contentType: 'diff',
                    contentId: fullPath,
                    diffStatus: status
                });
            }
        };

        return (
            <div className="p-4 border-t theme-border text-xs theme-text-muted">
                {/* Header for the Git Panel with a toggle */}
                <div
                    className="flex items-center w-full cursor-pointer py-1"
                    onClick={() => setGitPanelCollapsed(!gitPanelCollapsed)}
                >
                    {/* Left: chevron, then conditional controls */}
                    <div className="flex items-center pl-1 gap-0">
                        <ChevronRight
                            size={14}
                            className={`transform transition-transform text-gray-600 dark:text-gray-400 ${gitPanelCollapsed ? "" : "rotate-90"}`}
                        />
                        {!gitPanelCollapsed && (
                            <button
                                onClick={(e) => { e.stopPropagation(); refreshGitStatus?.(); }}
                                className="p-1.5 hover:bg-white/10 rounded transition-all text-gray-400 hover:text-blue-400"
                                title="Refresh git status"
                            >
                                <RefreshCw size={12} />
                            </button>
                        )}
                    </div>
                    {/* Spacer */}
                    <div className="flex-1" />
                    {/* Right: main icon */}
                    <div className="flex items-center gap-0 pr-1">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                console.log('[Sidebar] Opening git pane, createGitPane:', typeof createGitPane);
                                if (createGitPane) {
                                    createGitPane();
                                } else {
                                    console.error('[Sidebar] createGitPane is not defined!');
                                }
                            }}
                            className="p-1.5 hover:bg-white/10 rounded transition-all text-gray-400 hover:text-blue-400"
                            title="Open full Git pane"
                        >
                            <ExternalLink size={12} />
                        </button>
                    </div>
                </div>
    
                {/* Conditional rendering of the Git panel content */}
                {!gitPanelCollapsed && (
                    <div className="overflow-auto max-h-64 mt-2">
                        {/* Open Full Git Pane button */}
                        <button
                            onClick={() => createGitPane?.()}
                            className="w-full mb-2 px-2 py-1.5 rounded bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium flex items-center justify-center gap-2"
                        >
                            <Maximize2 size={12} />
                            Open Full Git View
                        </button>
                        <div className="mb-2 font-semibold">
                            Git Branch: {gitStatus.branch} {gitStatus.ahead > 0 && <span>↑{gitStatus.ahead}</span>} {gitStatus.behind > 0 && <span>↓{gitStatus.behind}</span>}
                        </div>
        
                        <div>
                            <div className="mb-1 font-semibold">Unstaged / Untracked Files</div>
                            {(unstaged.length + untracked.length === 0) ? <div className="text-gray-600">No unstaged or untracked files</div> :
                            [...unstaged, ...untracked].map(file => (
                                <div key={file.path} className="flex justify-between items-center group">
                                <button
                                    onClick={() => openFileDiff(file.path, file.status)}
                                    className={`text-left truncate hover:underline flex-1 ${file.isUntracked ? "text-gray-400" : "text-yellow-300"}`}
                                    title={`Click to view diff: ${file.path}`}
                                >
                                    {file.path} (<span className="font-medium">{file.status}</span>)
                                </button>
                                <button
                                    onClick={() => gitStageFile(file.path)}
                                    className="p-1 text-teal-400 px-1 rounded hover:bg-teal-600 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    Stage
                                </button>
                                </div>
                            ))
                            }
                        </div>

                        <div className="mt-3">
                            <div className="mb-1 font-semibold">Staged Files</div>
                            {(staged.length === 0) ? <div className="text-gray-600">No staged files</div> :
                            staged.map(file => (
                                <div key={file.path} className="flex justify-between items-center text-teal-300 group">
                                <button
                                    onClick={() => openFileDiff(file.path, file.status)}
                                    className="text-left truncate hover:underline flex-1"
                                    title={`Click to view diff: ${file.path}`}
                                >
                                    {file.path} (<span className="text-teal-500 font-medium">{file.status}</span>)
                                </button>
                                <button
                                    onClick={() => gitUnstageFile(file.path)}
                                    className="p-1 text-pink-400 hover:bg-pink-600 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    Unstage
                                </button>
                                </div>
                            ))
                            }
                        </div>
        
                        <div className="mt-4">
                            <input
                                type="text"
                                className="w-full theme-input text-xs rounded px-2 py-1 mb-2"
                                placeholder="Commit message"
                                value={gitCommitMessage}
                                onChange={e => setGitCommitMessage(e.target.value)}
                            />
                            <div className="flex gap-2">
                                <button
                                disabled={gitLoading || !gitCommitMessage.trim()}
                                onClick={gitCommitChanges}
                                className="theme-button-primary px-3 py-1 rounded text-xs flex-1 disabled:opacity-50"
                                >
                                Commit
                                </button>
                                <button
                                disabled={gitLoading}
                                onClick={gitPullChanges}
                                className="theme-button px-3 py-1 rounded text-xs flex-1"
                                >
                                Pull
                                </button>
                                <button
                                disabled={gitLoading}
                                onClick={gitPushChanges}
                                className="theme-button px-3 py-1 rounded text-xs flex-1"
                                >
                                Push
                                </button>
                            </div>
                            {gitError && <div className="mt-2 text-pink-500 text-xs">{gitError}</div>}
                            {noUpstreamPrompt && (
                                <div className="mt-2 p-2 bg-amber-900/30 border border-amber-600/50 rounded text-xs">
                                    <div className="text-amber-400 mb-2">Branch has no upstream. Push to origin/{noUpstreamPrompt.branch}?</div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={gitPushWithUpstream}
                                            disabled={gitLoading}
                                            className="px-2 py-1 bg-blue-600 hover:bg-blue-500 rounded text-white text-[10px]"
                                        >
                                            Push
                                        </button>
                                        <button
                                            onClick={gitEnableAutoSetupRemote}
                                            disabled={gitLoading}
                                            className="px-2 py-1 bg-teal-600 hover:bg-teal-500 rounded text-white text-[10px]"
                                            title="Sets git config push.autoSetupRemote true"
                                        >
                                            Always Auto-Push
                                        </button>
                                        <button
                                            onClick={() => setNoUpstreamPrompt(null)}
                                            className="px-2 py-1 bg-gray-600 hover:bg-gray-500 rounded text-white text-[10px]"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    const gitStageFile = async (file) => {
        setGitLoading(true);
        setGitError(null);
        try {
          await window.api.gitStageFile(currentPath, file);
          await loadGitStatus();
        } catch (err) {
          setGitError(err.message || 'Failed to stage file');
        } finally {
          setGitLoading(false);
        }
      };
      
      const gitUnstageFile = async (file) => {
        setGitLoading(true);
        setGitError(null);
        try {
          await window.api.gitUnstageFile(currentPath, file);
          await loadGitStatus();
        } catch (err) {
          setGitError(err.message || 'Failed to unstage file');
        } finally {
          setGitLoading(false);
        }
      };
      
      const gitCommitChanges = async () => {
        if (!gitCommitMessage.trim()) return;
        setGitLoading(true);
        setGitError(null);
        try {
          await window.api.gitCommit(currentPath, gitCommitMessage.trim());
          setGitCommitMessage('');
          await loadGitStatus();
        } catch (err) {
          setGitError(err.message || 'Failed to commit');
        } finally {
          setGitLoading(false);
        }
      };
      
      const gitPullChanges = async () => {
        setGitLoading(true);
        setGitError(null);
        try {
          await window.api.gitPull(currentPath);
          await loadGitStatus();
        } catch (err) {
          setGitError(err.message || 'Failed to pull');
        } finally {
          setGitLoading(false);
        }
      };
      
      const [noUpstreamPrompt, setNoUpstreamPrompt] = useState<{ branch: string; command: string } | null>(null);

      const gitPushChanges = async () => {
        setGitLoading(true);
        setGitError(null);
        setNoUpstreamPrompt(null);
        try {
          const result = await window.api.gitPush(currentPath);
          if (!result.success) {
            if (result.noUpstream) {
              setNoUpstreamPrompt({ branch: result.currentBranch, command: result.suggestedCommand });
            } else {
              setGitError(result.error || 'Failed to push');
            }
          } else {
            await loadGitStatus();
          }
        } catch (err) {
          setGitError(err.message || 'Failed to push');
        } finally {
          setGitLoading(false);
        }
      };

      const gitPushWithUpstream = async () => {
        if (!noUpstreamPrompt) return;
        setGitLoading(true);
        setGitError(null);
        try {
          const result = await window.api.gitPushSetUpstream(currentPath, noUpstreamPrompt.branch);
          if (result.success) {
            setNoUpstreamPrompt(null);
            await loadGitStatus();
          } else {
            setGitError(result.error || 'Failed to push');
          }
        } catch (err) {
          setGitError(err.message || 'Failed to push');
        } finally {
          setGitLoading(false);
        }
      };

      const gitEnableAutoSetupRemote = async () => {
        try {
          await window.api.gitSetAutoSetupRemote();
          await gitPushWithUpstream();
        } catch (err) {
          setGitError(err.message || 'Failed to set config');
        }
      };



      
      const loadDirectoryStructureWithoutConversationLoad = async (dirPath) => {
          try {
              if (!dirPath) {
                  console.error('No directory path provided');
                  return {};
              }
              const structureResult = await window.api.readDirectoryStructure(dirPath);
              if (structureResult && !structureResult.error) {
                  setFolderStructure(structureResult);
              } else {
                  console.error('Error loading structure:', structureResult?.error);
                  setFolderStructure({ error: structureResult?.error || 'Failed' });
              }
              
              // Load conversations but DON'T auto-select any
              await loadConversationsWithoutAutoSelect(dirPath);
              return structureResult;
          } catch (err) {
              console.error('Error loading structure:', err);
              setError(err.message);
              setFolderStructure({ error: err.message });
              return { error: err.message };
          }
      };
      const loadConversationsWithoutAutoSelect = async (dirPath) => {
          try {
              const normalizedPath = normalizePath(dirPath);
              if (!normalizedPath) return;
              const response = await window.api.getConversations(normalizedPath);
              const formattedConversations = response?.conversations?.map(conv => ({
                  id: conv.id,
                  title: conv.preview?.split('\n')[0]?.substring(0, 30) || 'New Conversation',
                  preview: conv.preview || 'No content',
                  timestamp: conv.timestamp || Date.now(),
                  last_message_timestamp: conv.last_message_timestamp || conv.timestamp || Date.now(),
                  npc: conv.npc || conv.assistant_name || conv.npc_name || '',
                  model: conv.model || conv.model_name || '',
                  provider: conv.provider || '',
              })) || [];
      
              formattedConversations.sort((a, b) => 
                  new Date(b.last_message_timestamp).getTime() - new Date(a.last_message_timestamp).getTime()
              );
              
              setDirectoryConversations(formattedConversations);
              
              // DON'T auto-select any conversations
              console.log('[loadConversationsWithoutAutoSelect] Loaded conversations without selecting');
      
          } catch (err) {
              console.error('Error loading conversations:', err);
              setError(err.message);
              setDirectoryConversations([]);
          }
      };

          const handleSearchSubmit = async () => {
              if (!isGlobalSearch || !searchTerm.trim()) {
                  setIsSearching(false);
                  setDeepSearchResults([]);
                  return;
              }

              setIsSearching(true);
              setDeepSearchResults([]);
              setError(null);
          
              try {
                  console.log("Performing GLOBAL search for:", searchTerm);
                  const backendResults = await window.api.performSearch({
                      query: searchTerm,
                      path: currentPath,
                      global: true,
                  });
                  
                  if (backendResults && !backendResults.error) {
                      const sortedResults = (backendResults || []).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                      setDeepSearchResults(sortedResults);
                  } else {
                      throw new Error(backendResults?.error || "Global search failed.");
                  }
              } catch (err) {
                  console.error("Error during global search:", err);
                  setError(err.message);
                  setDeepSearchResults([]);
              } finally {
                  setIsSearching(false);
              }
          };
      
              const handleSearchChange = (e) => {
                  const searchValue = e.target.value;
                  setSearchTerm(searchValue);
          
                 
                  if (!searchValue.trim()) {
                      setIsSearching(false);
                      setDeepSearchResults([]);
                      setMessageSearchResults([]);
                  }
                 
              };
          
          



              // Update handleSidebarRenameSubmit for sidebar file renaming
              const handleSidebarRenameSubmit = async () => {
                  if (!renamingPath || !editedSidebarItemName.trim()) {
                      setRenamingPath(null);
                      setEditedSidebarItemName('');
                      return;
                  }
                  
                  const oldName = getFileName(renamingPath);
                  if (editedSidebarItemName === oldName) {
                      setRenamingPath(null);
                      setEditedSidebarItemName('');
                      return;
                  }
                  
                  const dir = renamingPath.substring(0, renamingPath.lastIndexOf('/'));
                  const newPath = `${dir}/${editedSidebarItemName}`;
              
                  try {
                      const response = await window.api.renameFile(renamingPath, newPath);
                      if (response?.error) throw new Error(response.error);
              
                      // Update any open panes with this file
                      Object.entries(contentDataRef.current).forEach(([paneId, paneData]) => {
                          if (paneData.contentType === 'editor' && paneData.contentId === renamingPath) {
                              paneData.contentId = newPath;
                          }
                      });
              
                      await loadDirectoryStructure(currentPath);
                      setRootLayoutNode(p => ({ ...p }));
              
                  } catch (err) {
                      setError(`Failed to rename: ${err.message}`);
                  } finally {
                      setRenamingPath(null);
                      setEditedSidebarItemName('');
                  }
              };
              

              const renderSidebarItemContextMenu = () => {
    if (!sidebarItemContextMenuPos) return null;
    const { x, y, path, type, isInaccessible } = sidebarItemContextMenuPos;

    const selectedFilePaths = Array.from(selectedFiles);

    return (
        <>
            <div
                className="fixed inset-0 z-40"
                onClick={() => setSidebarItemContextMenuPos(null)}
            />
            <div
                className="fixed theme-bg-secondary theme-border border rounded shadow-lg py-1 z-50 text-sm"
                style={{ top: y, left: x }}
            >
                {type === 'file' && !isInaccessible && (
                    <>
                        <button
                            onClick={() => {
                                handleApplyPromptToFilesInInput('custom', `Here is the content of the file(s):`);
                                setSidebarItemContextMenuPos(null);
                            }}
                            className="flex items-center gap-2 px-4 py-3 theme-hover w-full text-left theme-text-primary"
                        >
                            <MessageSquare size={16} />
                            <span>Add Content to Chat ({selectedFilePaths.length})</span>
                        </button>
                        <button
                            onClick={() => {
                                const fileNames = selectedFilePaths.map(p => getFileName(p)).join(', ');
                                setInput(prev => `${prev}${prev ? ' ' : ''}${fileNames}`);
                                setSidebarItemContextMenuPos(null);
                            }}
                            className="flex items-center gap-2 px-4 py-3 theme-hover w-full text-left theme-text-primary"
                        >
                            <File size={16} />
                            <span>Add Filename(s) to Chat</span>
                        </button>
                        <div className="border-t theme-border my-1"></div>
                    </>
                )}

                {type === 'directory' && !isInaccessible && (
                    <>
                        <button
                            onClick={() => handleOpenFolderAsWorkspace(path)}
                            className="flex items-center gap-2 px-4 py-3 theme-hover w-full text-left theme-text-primary"
                        >
                            <Folder size={16} />
                            <span>Open as Workspace</span>
                        </button>
                        <button
                            onClick={async () => {
                                const newFolderName = prompt('New folder name:');
                                if (newFolderName && newFolderName.trim()) {
                                    const newPath = `${path}/${newFolderName.trim()}`;
                                    try {
                                        await (window as any).api?.createDirectory?.(newPath);
                                        refreshFolderStructure?.();
                                    } catch (err) {
                                        console.error('Failed to create folder:', err);
                                    }
                                }
                                setSidebarItemContextMenuPos(null);
                            }}
                            className="flex items-center gap-2 px-4 py-3 theme-hover w-full text-left theme-text-primary"
                        >
                            <FolderPlus size={16} />
                            <span>New Folder Here</span>
                        </button>
                        <div className="border-t theme-border my-1"></div>
                    </>
                )}

                {/* Permission options - always show for both files and directories */}
                <button
                    onClick={() => {
                        setPermissionDialog({ path, type: 'chmod' });
                        setSidebarItemContextMenuPos(null);
                    }}
                    className="flex items-center gap-2 px-4 py-3 theme-hover w-full text-left theme-text-primary"
                >
                    <KeyRound size={16} />
                    <span>Change Permissions (chmod)</span>
                </button>
                <button
                    onClick={() => {
                        setPermissionDialog({ path, type: 'chown' });
                        setSidebarItemContextMenuPos(null);
                    }}
                    className="flex items-center gap-2 px-4 py-3 theme-hover w-full text-left theme-text-primary"
                >
                    <Users size={16} />
                    <span>Change Owner (chown)</span>
                </button>
                <div className="border-t theme-border my-1"></div>

                {!isInaccessible && (
                    <>
                        <button
                            onClick={handleSidebarRenameStart}
                            className="flex items-center gap-2 px-4 py-3 theme-hover w-full text-left theme-text-primary"
                        >
                            <Edit size={16} />
                            <span>Rename</span>
                        </button>

                        <button
                            onClick={handleZipItems}
                            className="flex items-center gap-2 px-4 py-3 theme-hover w-full text-left theme-text-primary"
                        >
                            <Archive size={16} />
                            <span>Zip{selectedFiles.size > 1 ? ` (${selectedFiles.size} items)` : ''}</span>
                        </button>

                        <div className="border-t theme-border my-1"></div>
                    </>
                )}

                <button
                    onClick={handleSidebarItemDelete}
                    className="flex items-center gap-2 px-4 py-3 theme-hover w-full text-left text-red-400"
                >
                    <Trash size={16} />
                    <span>Delete</span>
                </button>
            </div>
        </>
    );
};
const renderFolderList = (structure) => {
    if (!structure || typeof structure !== 'object' || structure.error) {
        return <div className="p-2 text-xs text-red-500">Error: {structure?.error || 'Failed to load'}</div>;
    }

    // Count files for display
    const countItems = (struct) => {
        let count = 0;
        Object.values(struct).forEach((item: any) => {
            if (item?.type === 'file') count++;
            else if (item?.type === 'directory' && item?.children) count += countItems(item.children);
        });
        return count;
    };
    const fileCount = countItems(structure);

    // Parse file type filter into array of extensions
    const parseFileTypeFilter = (filter: string): string[] => {
        if (!filter.trim()) return [];
        return filter.split(/[,\s]+/)
            .map(ext => ext.trim().toLowerCase())
            .filter(ext => ext.length > 0)
            .map(ext => ext.startsWith('.') ? ext : `.${ext}`);
    };
    const activeTypeFilters = parseFileTypeFilter(fileTypeFilter);

    // Check if a file matches the type filter
    const matchesTypeFilter = (name: string): boolean => {
        if (activeTypeFilters.length === 0) return true;
        const lowerName = name.toLowerCase();
        return activeTypeFilters.some(ext => lowerName.endsWith(ext));
    };

    // Filter files by search and type
    const filterStructure = (struct, query) => {
        const q = query.toLowerCase().trim();
        const hasQuery = q.length > 0;
        const hasTypeFilter = activeTypeFilters.length > 0;

        if (!hasQuery && !hasTypeFilter) return struct;

        const filtered = {};
        Object.entries(struct).forEach(([name, item]: [string, any]) => {
            const isDirectory = item?.type === 'directory';
            const isFile = item?.type === 'file';

            if (isDirectory && item?.children) {
                // For directories, recursively filter children
                const filteredChildren = filterStructure(item.children, query);
                if (Object.keys(filteredChildren).length > 0) {
                    filtered[name] = { ...item, children: filteredChildren };
                }
                // Also include directory if name matches search query (even if empty after filter)
                else if (hasQuery && name.toLowerCase().includes(q)) {
                    filtered[name] = item;
                }
            } else if (isFile) {
                // For files, check both search query and type filter
                const matchesQuery = !hasQuery || name.toLowerCase().includes(q);
                const matchesType = matchesTypeFilter(name);
                if (matchesQuery && matchesType) {
                    filtered[name] = item;
                }
            }
        });
        return filtered;
    };
    const filteredStructure = filterStructure(structure, fileSearch);
    const isEmpty = Object.keys(structure).length === 0;

    const header = (
        <div
            className={`transition-all duration-150 ${draggedSection === 'files' ? 'opacity-50' : ''} ${dropTargetSection === 'files' ? 'ring-2 ring-yellow-500' : ''}`}
            onDragOver={handleSectionDragOver('files')}
            onDragLeave={handleSectionDragLeave}
            onDrop={handleSectionDrop('files')}
            data-dropdown="folder"
        >
            <div
                draggable
                onDragStart={handleSectionDragStart('files')}
                onDragEnd={handleSectionDragEnd}
                onClick={() => setFilesCollapsed(!filesCollapsed)}
                className="flex items-stretch w-full py-4 bg-gradient-to-r from-yellow-800/40 to-amber-700/35 cursor-pointer hover:bg-white/5"
            >
                {/* Left: chevron, then conditional controls */}
                <div className="flex items-center gap-0 pl-1">
                    <ChevronRight size={14} className={`transform transition-transform text-gray-600 dark:text-gray-400 ${filesCollapsed ? "" : "rotate-90"}`} />
                    {!filesCollapsed && (
                        <>
                            <button
                                onClick={(e) => { e.stopPropagation(); handleRefreshFilesAndFolders(); }}
                                className="p-1.5 hover:bg-white/10 rounded transition-all text-gray-400 hover:text-yellow-400"
                                title="Refresh files"
                            >
                                <RefreshCw size={12} />
                            </button>
                            <button
                                onClick={(e) => { e.stopPropagation(); setShowFilesSettings(!showFilesSettings); }}
                                className={`p-1.5 hover:bg-white/10 rounded transition-all ${showFilesSettings ? 'text-yellow-400' : 'text-gray-400 hover:text-yellow-400'}`}
                                title="Settings"
                            >
                                <Settings size={12} />
                            </button>
                            <button
                                onClick={(e) => { e.stopPropagation(); handleCreateNewFolder?.(); }}
                                className="p-1.5 hover:bg-white/10 rounded transition-all text-gray-400 hover:text-yellow-400"
                                title="New Folder"
                            >
                                <Plus size={12} />
                            </button>
                        </>
                    )}
                </div>
                {/* Middle: folder nav buttons */}
                <div className="ml-auto flex items-center" style={{ position: 'relative', overflow: 'visible' }}>
                    <button
                        onClick={(e) => { e.stopPropagation(); if (currentPath !== baseDir) goUpDirectory(currentPath, baseDir, switchToPath, setError); }}
                        disabled={currentPath === baseDir}
                        className={`p-1 pr-0 hover:bg-white/10 rounded transition-all ${currentPath === baseDir ? 'opacity-40' : 'text-gray-400 hover:text-yellow-400'}`}
                        title="Go up one folder"
                    >
                        <ArrowUp size={10} />
                    </button>
                    <button
                        ref={folderButtonRef}
                        onClick={(e) => {
                            e.stopPropagation();
                            if (!folderDropdownOpen && folderButtonRef.current) {
                                const rect = folderButtonRef.current.getBoundingClientRect();
                                setFolderDropdownPos({ top: rect.bottom + 4, left: rect.left });
                            }
                            setFolderDropdownOpen(!folderDropdownOpen);
                        }}
                        className="flex items-center gap-0.5 p-1 hover:bg-white/10 transition-colors rounded text-gray-400 hover:text-yellow-400"
                        title={currentPath}
                    >
                        <span className="text-[9px] font-medium truncate max-w-[100px]">{(() => { const name = getFileName(currentPath) || 'Root'; return name.length > 7 ? name.slice(0, 7) + '…' : name; })()}</span>
                        <ChevronDown size={8} className={`flex-shrink-0 transition-transform text-gray-600 dark:text-gray-400 ${folderDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                </div>
                {/* Right: browse + folder pane icons */}
                <div className="flex items-center">
                    <button
                        onClick={async (e) => {
                            e.stopPropagation();
                            try {
                                const result = await (window as any).api.open_directory_picker();
                                if (result) { switchToPath(result); }
                            } catch {}
                        }}
                        className="flex items-center justify-center px-1.5 py-4 -my-4 hover:bg-white/10 transition-all"
                        title="Browse for folder"
                    >
                        <FolderPlus size={11} className="text-blue-400" />
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); createAndAddPaneNodeToLayout?.({ contentType: 'folder', contentId: currentPath }); setFilesCollapsed(false); }}
                        className="flex items-center justify-center px-1.5 py-4 -my-4 hover:bg-white/10 transition-all"
                        title="Open folder pane"
                    >
                        <FolderOpen size={12} className="text-yellow-300" />
                    </button>
                </div>
                {/* Folder dropdown container */}
                <div style={{ position: 'relative', overflow: 'visible' }}>
                    {/* Folder dropdown - fixed positioning to show over pane content */}
                    {folderDropdownOpen && (
                        <div
                            className="fixed bg-gray-800 border border-gray-700 rounded shadow-xl py-1 min-w-[220px]"
                            style={{ top: folderDropdownPos.top, left: folderDropdownPos.left, zIndex: 99999 }}
                        >
                            <div className="px-2 py-1 border-b border-gray-700">
                                <div className="text-[9px] text-gray-500 truncate" title={currentPath}>{currentPath}</div>
                            </div>
                            {/* Action buttons - Key and Native Explorer only */}
                            <div className="flex gap-1 p-1.5 border-b border-gray-700">
                                <button
                                    onClick={() => { createProjectEnvPane?.(); setFolderDropdownOpen(false); }}
                                    className="flex-1 flex items-center justify-center gap-1 px-2 py-1 text-[10px] bg-amber-600/20 text-amber-400 rounded hover:bg-amber-600/30"
                                    title="Project Environment"
                                >
                                    <KeyRound size={10} /> Env
                                </button>
                                <button
                                    onClick={() => { (window as any).api?.openInNativeExplorer?.(currentPath); setFolderDropdownOpen(false); }}
                                    className="flex-1 flex items-center justify-center gap-1 px-2 py-1 text-[10px] bg-teal-600/20 text-teal-400 rounded hover:bg-teal-600/30"
                                    title="Open in Finder/Explorer"
                                >
                                    <ExternalLink size={10} /> Native
                                </button>
                            </div>
                            {/* Recent paths */}
                            {recentPaths.filter(p => p !== currentPath).length > 0 && (
                                <>
                                    <div className="px-2 py-0.5 text-[8px] text-gray-500 uppercase">Recent</div>
                                    {recentPaths.filter(p => p !== currentPath).slice(0, 5).map((path, i) => (
                                        <button
                                            key={i}
                                            onClick={() => { switchToPath(path); setFolderDropdownOpen(false); }}
                                            className="w-full flex items-center gap-2 px-2 py-1 text-[10px] text-gray-300 hover:bg-gray-700"
                                        >
                                            <Folder size={10} className="text-yellow-400" />
                                            <span className="truncate">{getFileName(path)}</span>
                                        </button>
                                    ))}
                                </>
                            )}
                            {currentPath !== baseDir && (
                                <button
                                    onClick={() => { switchToPath(baseDir); setFolderDropdownOpen(false); }}
                                    className="w-full flex items-center gap-2 px-2 py-1 text-[10px] text-purple-400 hover:bg-gray-700 border-t border-gray-700"
                                >
                                    <Folder size={10} /> {getFileName(baseDir) || 'root'}
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
            {/* Files Settings Panel */}
            {showFilesSettings && (
                <div className="p-2 bg-yellow-900/20 border-y border-yellow-500/30 text-[10px] space-y-2">
                    <div className="flex items-center justify-between">
                        <label className="text-gray-300">Show hidden files</label>
                        <input
                            type="checkbox"
                            checked={filesSettings.showHidden}
                            onChange={(e) => setFilesSettings(s => ({ ...s, showHidden: e.target.checked }))}
                            className="rounded"
                        />
                    </div>
                    <div>
                        <label className="text-gray-400 block mb-1">Allowed extensions (empty=all)</label>
                        <input
                            type="text"
                            value={filesSettings.allowedExtensions}
                            onChange={(e) => setFilesSettings(s => ({ ...s, allowedExtensions: e.target.value }))}
                            placeholder=".py,.js,.tsx,.md"
                            className="w-full bg-black/30 border border-white/10 rounded px-2 py-1 text-gray-200 placeholder-gray-600"
                        />
                    </div>
                    <div>
                        <label className="text-gray-400 block mb-1">Excluded extensions</label>
                        <input
                            type="text"
                            value={filesSettings.excludedExtensions}
                            onChange={(e) => setFilesSettings(s => ({ ...s, excludedExtensions: e.target.value }))}
                            placeholder=".pyc,.git"
                            className="w-full bg-black/30 border border-white/10 rounded px-2 py-1 text-gray-200 placeholder-gray-600"
                        />
                    </div>
                    <div>
                        <label className="text-gray-400 block mb-1">Excluded folders</label>
                        <input
                            type="text"
                            value={filesSettings.excludedFolders}
                            onChange={(e) => setFilesSettings(s => ({ ...s, excludedFolders: e.target.value }))}
                            placeholder="node_modules,.git"
                            className="w-full bg-black/30 border border-white/10 rounded px-2 py-1 text-gray-200 placeholder-gray-600"
                        />
                    </div>
                    <div>
                        <label className="text-gray-400 block mb-1">Max folder depth</label>
                        <input
                            type="number"
                            value={filesSettings.maxDepth}
                            onChange={(e) => setFilesSettings(s => ({ ...s, maxDepth: parseInt(e.target.value) || 10 }))}
                            className="w-full bg-black/30 border border-white/10 rounded px-2 py-1 text-gray-200"
                            min="1"
                            max="50"
                        />
                    </div>
                </div>
            )}
            {!filesCollapsed && (
                <div className="bg-black/20 border-b border-white/5">
                    {/* Search input */}
                    {fileCount > 5 && (
                        <div className="px-1 py-1">
                            <div className="relative">
                                <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
                                <input
                                    type="text"
                                    value={fileSearch}
                                    onChange={(e) => setFileSearch(e.target.value)}
                                    placeholder="Search files..."
                                    className="w-full bg-white/5 border border-white/10 rounded pl-7 pr-2 py-1 text-[11px] text-gray-300 placeholder-gray-600 focus:outline-none focus:border-yellow-500/50"
                                />
                                {fileSearch && (
                                    <button onClick={() => setFileSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                                        <X size={10} />
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                    {/* File type filter */}
                    {showFileTypeFilter && (
                        <div className="px-1 py-1 border-t border-white/5">
                            <div className="relative">
                                <Filter size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
                                <input
                                    type="text"
                                    value={fileTypeFilter}
                                    onChange={(e) => setFileTypeFilter(e.target.value)}
                                    placeholder=".py .js .tsx (comma or space separated)"
                                    className="w-full bg-white/5 border border-white/10 rounded pl-7 pr-6 py-1 text-[11px] text-gray-300 placeholder-gray-600 focus:outline-none focus:border-yellow-500/50"
                                />
                                {fileTypeFilter && (
                                    <button onClick={() => setFileTypeFilter('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                                        <X size={10} />
                                    </button>
                                )}
                            </div>
                            {/* Quick filter presets */}
                            <div className="flex flex-wrap gap-1 mt-1.5 px-1">
                                {[
                                    { label: 'Python', ext: '.py' },
                                    { label: 'JS/TS', ext: '.js .ts .jsx .tsx' },
                                    { label: 'Docs', ext: '.md .txt .docx .pdf' },
                                    { label: 'Data', ext: '.json .csv .xlsx' },
                                    { label: 'Images', ext: '.png .jpg .jpeg .gif .svg' },
                                ].map(preset => (
                                    <button
                                        key={preset.label}
                                        onClick={() => setFileTypeFilter(fileTypeFilter ? `${fileTypeFilter} ${preset.ext}` : preset.ext)}
                                        className="text-[9px] px-1.5 py-0.5 bg-white/5 hover:bg-white/10 rounded text-gray-400 hover:text-yellow-400 transition-colors"
                                        title={`Add ${preset.ext}`}
                                    >
                                        {preset.label}
                                    </button>
                                ))}
                                {fileTypeFilter && (
                                    <button
                                        onClick={() => setFileTypeFilter('')}
                                        className="text-[9px] px-1.5 py-0.5 bg-red-500/10 hover:bg-red-500/20 rounded text-red-400 hover:text-red-300 transition-colors"
                                        title="Clear all filters"
                                    >
                                        Clear
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );

    if (filesCollapsed) {
        const findCurrentFile = (struct) => {
            for (const [name, content] of Object.entries(struct)) {
                if (content?.path === currentFile && content?.type === 'file') {
                    return { name, content };
                }
            }
            return null;
        };
        const activeFile = currentFile ? findCurrentFile(structure) : null;
        return (
            <div>
                {header}
                {activeFile && (
                    <div className="bg-black/10 p-1">
                        <button
                            onClick={() => handleFileClick(activeFile.content.path)}
                            className="flex items-center gap-2 px-2 py-1.5 w-full hover:bg-white/5 text-left rounded transition-all border-l-2 border-yellow-500"
                            title={`Edit ${activeFile.name}`}
                        >
                            {getFileIcon(activeFile.name)}
                            <span className="text-[11px] text-gray-200 truncate">{activeFile.name}</span>
                        </button>
                    </div>
                )}
            </div>
        );
    }

    const renderFolderContents = (currentStructure, parentPath = '') => {
        if (!currentStructure) return null;

        let items = [];
        if (Array.isArray(currentStructure)) {
            items = currentStructure;
        } else if (typeof currentStructure === 'object') {
            items = Object.values(currentStructure);
        }

        items = items.filter(Boolean).sort((a, b) => {
            // Extract name from path if name property doesn't exist
            const aName = a.name || getFileName(a.path) || '';
            const bName = b.name || getFileName(b.path) || '';
            const aHidden = aName.startsWith('.');
            const bHidden = bName.startsWith('.');
            const aIsDir = a.type === 'directory';
            const bIsDir = b.type === 'directory';

            // Hidden items always last
            if (aHidden !== bHidden) return aHidden ? 1 : -1;

            // Folders before files
            if (aIsDir !== bIsDir) return aIsDir ? -1 : 1;

            // Alphabetical within same type
            return aName.localeCompare(bName);
        });

        return items.map(content => {
            const name = content.name || getFileName(content.path) || 'Unknown';
            const fullPath = content.path || (parentPath ? `${parentPath}/${name}` : name);
            const isFolder = content.type === 'directory';
            const isFile = content.type === 'file';
            const isRenaming = renamingPath === fullPath;

            if (isFolder) {
                const isInaccessible = content.inaccessible === true;
                return (
                    <div
                        key={fullPath}
                        className="pl-4 border-l border-gray-700/30 ml-2"
                        onDragOver={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            e.dataTransfer.dropEffect = 'move';
                            (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(59, 130, 246, 0.2)';
                        }}
                        onDragLeave={(e) => {
                            (e.currentTarget as HTMLElement).style.backgroundColor = '';
                        }}
                        onDrop={async (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            (e.currentTarget as HTMLElement).style.backgroundColor = '';
                            try {
                                const data = JSON.parse(e.dataTransfer.getData('application/json') || '{}');
                                if (data.type === 'file' || data.type === 'folder') {
                                    const sourcePath = data.id;
                                    const fileName = getFileName(sourcePath);
                                    const destPath = `${fullPath}/${fileName}`;
                                    if (sourcePath !== destPath && !destPath.startsWith(sourcePath + '/')) {
                                        await (window as any).api?.renameFile?.(sourcePath, destPath);
                                        refreshFolderStructure?.();
                                    }
                                }
                            } catch (err) {
                                console.error('Failed to move item:', err);
                            }
                        }}
                    >
                        <button
                            draggable={!isInaccessible}
                            onDragStart={(e) => { if (isInaccessible) { e.preventDefault(); return; } e.dataTransfer.effectAllowed = 'copyMove'; e.dataTransfer.setData('application/json', JSON.stringify({ type: 'folder', id: fullPath })); handleGlobalDragStart(e, { type: 'folder', id: fullPath }); }}
                            onDragEnd={handleGlobalDragEnd}
                            onClick={(e) => {
                                if (isInaccessible) return; // Don't allow expanding inaccessible folders
                                // Check for Ctrl or Meta key (Command on Mac)
                                if (e.ctrlKey || e.metaKey) {
                                    handleOpenFolderAsWorkspace(fullPath);
                                } else {
                                    setExpandedFolders(prev => {
                                        const newSet = new Set(prev);
                                        if (newSet.has(fullPath)) newSet.delete(fullPath);
                                        else newSet.add(fullPath);
                                        return newSet;
                                    });
                                }
                            }}
                            onDoubleClick={() => !isInaccessible && handleOpenFolderAsWorkspace(fullPath)}
                            onContextMenu={(e) => handleSidebarItemContextMenu(e, fullPath, 'directory', isInaccessible)}
                            className={`flex items-center gap-2 px-2 py-1 w-full hover:bg-gray-800 text-left rounded ${isInaccessible ? 'opacity-60' : ''}`}
                            title={isInaccessible ? `Permission denied: ${fullPath}` : `Drag to open as folder viewer, Click to expand, Ctrl+Click to open as workspace`}
                        >
                            {isInaccessible ? (
                                <div className="relative flex-shrink-0">
                                    <Folder size={16} className="text-gray-500" />
                                    <Lock size={8} className="absolute -bottom-0.5 -right-0.5 text-red-400" />
                                </div>
                            ) : (
                                <Folder size={16} className="text-blue-400 flex-shrink-0" />
                            )}
                            {isRenaming ? (
                                <input
                                    type="text"
                                    value={editedSidebarItemName}
                                    onChange={(e) => setEditedSidebarItemName(e.target.value)}
                                    onBlur={handleSidebarRenameSubmit}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleSidebarRenameSubmit();
                                        if (e.key === 'Escape') {
                                            setRenamingPath(null);
                                            setEditedSidebarItemName('');
                                        }
                                    }}
                                    className="theme-input text-xs rounded px-1 py-0.5 border focus:outline-none flex-1"
                                    autoFocus
                                    onClick={(e) => e.stopPropagation()}
                                    onMouseDown={(e) => e.stopPropagation()}
                                />
                            ) : (
                                <span className="text-gray-300 truncate">{name}</span>
                            )}
                            <ChevronRight
                                size={14}
                                className={`ml-auto transition-transform ${expandedFolders.has(fullPath) ? 'rotate-90' : ''}`}
                            />
                        </button>
                        {expandedFolders.has(fullPath) && renderFolderContents(content.children || content.contents || [], fullPath)}
                    </div>
                );
            } else if (isFile) {
                const fileIcon = getFileIcon(name);
                const isActiveFile = currentFile === fullPath;
                const isSelected = selectedFiles.has(fullPath);
                return (
                    <button
                        key={fullPath}
                        draggable="true"
                        onDragStart={(e) => { e.dataTransfer.effectAllowed = 'copyMove'; e.dataTransfer.setData('application/json', JSON.stringify({ type: 'file', id: fullPath })); handleGlobalDragStart(e, { type: 'file', id: fullPath }); }}
                        onDragEnd={handleGlobalDragEnd}
                        onClick={(e) => {
                            if (e.ctrlKey || e.metaKey) {
                                const newSelected = new Set(selectedFiles);
                                if (newSelected.has(fullPath)) newSelected.delete(fullPath);
                                else newSelected.add(fullPath);
                                setSelectedFiles(newSelected);
                            } else if (e.shiftKey && lastClickedFileIndex !== null) {
                                const fileEntries = items.filter(item => item.type === 'file');
                                const currentFileIndex = fileEntries.findIndex(item => item.path === fullPath);
                                const newSelected = new Set();
                                const start = Math.min(lastClickedFileIndex, currentFileIndex);
                                const end = Math.max(lastClickedFileIndex, currentFileIndex);
                                for (let i = start; i <= end; i++) {
                                    if (fileEntries[i]) newSelected.add(fileEntries[i].path);
                                }
                                setSelectedFiles(newSelected);
                            } else {
                                setSelectedFiles(new Set([fullPath]));
                                handleFileClick(fullPath);
                                const fileEntries = items.filter(item => item.type === 'file');
                                setLastClickedFileIndex(fileEntries.findIndex(item => item.path === fullPath));
                            }
                        }}
                        onContextMenu={(e) => handleSidebarItemContextMenu(e, fullPath, 'file')}
                        className={`flex items-center gap-2 px-2 py-1 w-full text-left rounded transition-all duration-200
                            ${isActiveFile ? 'conversation-selected border-l-2 border-teal-500' : 
                              isSelected ? 'conversation-selected' : 'hover:bg-gray-800'}`}
                        title={`Edit ${name}`}
                    >
                        {fileIcon}
                        {isRenaming ? (
                            <input
                                type="text"
                                value={editedSidebarItemName}
                                onChange={(e) => setEditedSidebarItemName(e.target.value)}
                                onBlur={handleSidebarRenameSubmit}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSidebarRenameSubmit();
                                    if (e.key === 'Escape') {
                                        setRenamingPath(null);
                                        setEditedSidebarItemName('');
                                    }
                                }}
                                className="theme-input text-xs rounded px-1 py-0.5 border focus:outline-none flex-1"
                                autoFocus
                                onClick={(e) => e.stopPropagation()}
                                onMouseDown={(e) => e.stopPropagation()}
                            />
                        ) : (
                            <span className="text-gray-300 truncate">{name}</span>
                        )}
                    </button>
                );
            }
            return null;
        });
    };

    return (
        <div className="flex flex-col h-full">
            {header}
            {!filesCollapsed && (
                <div className="bg-black/10 flex-1 min-h-0 overflow-y-auto">
                    {isEmpty ? (
                        <div className="px-3 py-3 text-[11px] text-gray-500 text-center">Empty directory</div>
                    ) : fileSearch.trim() && Object.keys(filteredStructure).length === 0 ? (
                        <div className="px-3 py-3 text-[11px] text-gray-500 text-center">No files match "{fileSearch}"</div>
                    ) : (
                        <div className="py-1">{renderFolderContents(fileSearch.trim() ? filteredStructure : structure)}</div>
                    )}
                </div>
            )}
        </div>
    );
};

    const renderConversationList = (conversations) => {
        const sortedConversations = conversations?.length
            ? [...conversations].sort((a, b) => {
                const aTimestamp = new Date(a.last_message_timestamp || a.timestamp).getTime();
                const bTimestamp = new Date(b.last_message_timestamp || b.timestamp).getTime();
                return bTimestamp - aTimestamp;
            })
            : [];

        // Count active filters
        const activeFilterCount = [convoNpcFilter, convoModelFilter, convoDateFrom, convoDateTo].filter(f => f.trim()).length;

        // Apply all filters
        let filteredConversations = sortedConversations;

        // Text search filter
        if (convoSearch.trim()) {
            const q = convoSearch.toLowerCase();
            filteredConversations = filteredConversations.filter(conv =>
                (conv.title || conv.id || '').toLowerCase().includes(q) ||
                (conv.preview || '').toLowerCase().includes(q) ||
                (conv.npc || '').toLowerCase().includes(q) ||
                (conv.model || '').toLowerCase().includes(q)
            );
        }

        // NPC filter
        if (convoNpcFilter.trim()) {
            const npcFilters = convoNpcFilter.toLowerCase().split(/[,\s]+/).filter(f => f);
            filteredConversations = filteredConversations.filter(conv =>
                npcFilters.some(npc => (conv.npc || '').toLowerCase().includes(npc))
            );
        }

        // Model/Provider filter
        if (convoModelFilter.trim()) {
            const modelFilters = convoModelFilter.toLowerCase().split(/[,\s]+/).filter(f => f);
            filteredConversations = filteredConversations.filter(conv =>
                modelFilters.some(model => (conv.model || conv.provider || '').toLowerCase().includes(model))
            );
        }

        // Date range filter
        if (convoDateFrom) {
            const fromDate = new Date(convoDateFrom).getTime();
            filteredConversations = filteredConversations.filter(conv => {
                const convDate = new Date(conv.last_message_timestamp || conv.timestamp).getTime();
                return convDate >= fromDate;
            });
        }
        if (convoDateTo) {
            const toDate = new Date(convoDateTo).setHours(23, 59, 59, 999);
            filteredConversations = filteredConversations.filter(conv => {
                const convDate = new Date(conv.last_message_timestamp || conv.timestamp).getTime();
                return convDate <= toDate;
            });
        }

        // Get unique NPCs and models for filter dropdowns
        const uniqueNpcs = [...new Set(sortedConversations.map(c => c.npc).filter(Boolean))];
        const uniqueModels = [...new Set(sortedConversations.map(c => c.model || c.provider).filter(Boolean))];

        const header = (
            <div
                className={`transition-all duration-150 ${draggedSection === 'conversations' ? 'opacity-50' : ''} ${dropTargetSection === 'conversations' ? 'ring-2 ring-green-500' : ''}`}
                onDragOver={handleSectionDragOver('conversations')}
                onDragLeave={handleSectionDragLeave}
                onDrop={handleSectionDrop('conversations')}
            >
                <div
                    draggable
                    onDragStart={handleSectionDragStart('conversations')}
                    onDragEnd={handleSectionDragEnd}
                    onClick={() => setConversationsCollapsed(!conversationsCollapsed)}
                    className="flex items-stretch w-full py-4 bg-gradient-to-r from-green-800/40 to-emerald-700/35 cursor-pointer hover:bg-white/5"
                >
                    {/* Left: chevron, then conditional controls */}
                    <div className="flex items-center pl-1 gap-0">
                        <ChevronRight size={14} className={`transform transition-transform text-gray-600 dark:text-gray-400 ${conversationsCollapsed ? "" : "rotate-90"}`} />
                        {!conversationsCollapsed && (
                            <>
                                <button
                                    onClick={(e) => { e.stopPropagation(); refreshConversations(); }}
                                    className="p-1.5 hover:bg-white/10 rounded transition-all text-gray-400 hover:text-green-400"
                                    title="Refresh conversations"
                                >
                                    <RefreshCw size={12} />
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); setShowConversationsSettings(!showConversationsSettings); }}
                                    className={`p-1.5 hover:bg-white/10 rounded transition-all ${showConversationsSettings ? 'text-green-400' : 'text-gray-400 hover:text-green-400'}`}
                                    title="Settings"
                                >
                                    <Settings size={12} />
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (showConvoFilters) {
                                            setConvoNpcFilter('');
                                            setConvoModelFilter('');
                                            setConvoDateFrom('');
                                            setConvoDateTo('');
                                        }
                                        setShowConvoFilters(!showConvoFilters);
                                    }}
                                    className={`p-1.5 hover:bg-white/10 rounded transition-all ${activeFilterCount > 0 || showConvoFilters ? 'text-green-400' : 'text-gray-400 hover:text-green-400'}`}
                                    title="Filter conversations"
                                >
                                    <Filter size={12} />
                                </button>
                            </>
                        )}
                    </div>
                    {/* Right: main icon - full height clickable area */}
                    <button
                        onClick={(e) => { e.stopPropagation(); createNewConversation?.(); setConversationsCollapsed(false); }}
                        className="ml-auto flex items-center justify-center w-1/4 py-4 -my-4 hover:bg-white/10 transition-all"
                        title="New Chat"
                    >
                        <MessageSquare size={12} className="text-green-300" />
                    </button>
                </div>
                {/* Conversations Settings Panel */}
                {showConversationsSettings && (
                    <div className="p-2 bg-green-900/20 border-y border-green-500/30 text-[10px] space-y-2">
                        <div>
                            <label className="text-gray-400 block mb-1">Sort by</label>
                            <select
                                value={conversationsSettings.sortBy}
                                onChange={(e) => setConversationsSettings(s => ({ ...s, sortBy: e.target.value }))}
                                className="w-full bg-black/30 border border-white/10 rounded px-2 py-1 text-gray-200"
                            >
                                <option value="date">Date</option>
                                <option value="title">Title</option>
                                <option value="npc">NPC</option>
                                <option value="model">Model</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-gray-400 block mb-1">Sort order</label>
                            <select
                                value={conversationsSettings.sortOrder}
                                onChange={(e) => setConversationsSettings(s => ({ ...s, sortOrder: e.target.value }))}
                                className="w-full bg-black/30 border border-white/10 rounded px-2 py-1 text-gray-200"
                            >
                                <option value="desc">Newest first</option>
                                <option value="asc">Oldest first</option>
                            </select>
                        </div>
                        <div className="flex items-center justify-between">
                            <label className="text-gray-300">Show empty conversations</label>
                            <input
                                type="checkbox"
                                checked={conversationsSettings.showEmpty}
                                onChange={(e) => setConversationsSettings(s => ({ ...s, showEmpty: e.target.checked }))}
                                className="rounded"
                            />
                        </div>
                        <div>
                            <label className="text-gray-400 block mb-1">Max display count</label>
                            <input
                                type="number"
                                value={conversationsSettings.maxDisplay}
                                onChange={(e) => setConversationsSettings(s => ({ ...s, maxDisplay: parseInt(e.target.value) || 100 }))}
                                className="w-full bg-black/30 border border-white/10 rounded px-2 py-1 text-gray-200"
                                min="10"
                            />
                        </div>
                    </div>
                )}
                {!conversationsCollapsed && (
                    <div className="bg-black/20 border-b border-white/5">
                        {/* Search input */}
                        {sortedConversations.length > 0 && (
                            <div className="px-1 py-1">
                                <div className="relative">
                                    <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
                                    <input
                                        type="text"
                                        value={convoSearch}
                                        onChange={(e) => setConvoSearch(e.target.value)}
                                        placeholder="Search conversations..."
                                        className="w-full bg-white/5 border border-white/10 rounded pl-7 pr-2 py-1 text-[11px] text-gray-300 placeholder-gray-600 focus:outline-none focus:border-green-500/50"
                                    />
                                    {convoSearch && (
                                        <button onClick={() => setConvoSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                                            <X size={10} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                        {/* Advanced filters */}
                        {showConvoFilters && (
                            <div className="px-1 py-1 border-t border-white/5 space-y-1.5">
                                {/* NPC filter */}
                                <div className="relative">
                                    <Bot size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
                                    <input
                                        type="text"
                                        value={convoNpcFilter}
                                        onChange={(e) => setConvoNpcFilter(e.target.value)}
                                        placeholder="Filter by NPC (comma separated)..."
                                        className="w-full bg-white/5 border border-white/10 rounded pl-7 pr-6 py-1 text-[11px] text-gray-300 placeholder-gray-600 focus:outline-none focus:border-green-500/50"
                                        list="npc-suggestions"
                                    />
                                    {uniqueNpcs.length > 0 && (
                                        <datalist id="npc-suggestions">
                                            {uniqueNpcs.map(npc => <option key={npc} value={npc} />)}
                                        </datalist>
                                    )}
                                    {convoNpcFilter && (
                                        <button onClick={() => setConvoNpcFilter('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                                            <X size={10} />
                                        </button>
                                    )}
                                </div>
                                {/* Model/Provider filter */}
                                <div className="relative">
                                    <Cpu size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
                                    <input
                                        type="text"
                                        value={convoModelFilter}
                                        onChange={(e) => setConvoModelFilter(e.target.value)}
                                        placeholder="Filter by model/provider..."
                                        className="w-full bg-white/5 border border-white/10 rounded pl-7 pr-6 py-1 text-[11px] text-gray-300 placeholder-gray-600 focus:outline-none focus:border-green-500/50"
                                        list="model-suggestions"
                                    />
                                    {uniqueModels.length > 0 && (
                                        <datalist id="model-suggestions">
                                            {uniqueModels.map(model => <option key={model} value={model} />)}
                                        </datalist>
                                    )}
                                    {convoModelFilter && (
                                        <button onClick={() => setConvoModelFilter('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                                            <X size={10} />
                                        </button>
                                    )}
                                </div>
                                {/* Date range */}
                                <div className="flex gap-1">
                                    <div className="relative flex-1">
                                        <Clock size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
                                        <input
                                            type="date"
                                            value={convoDateFrom}
                                            onChange={(e) => setConvoDateFrom(e.target.value)}
                                            className="w-full bg-white/5 border border-white/10 rounded pl-7 pr-1 py-1 text-[11px] text-gray-300 placeholder-gray-600 focus:outline-none focus:border-green-500/50"
                                            title="From date"
                                        />
                                    </div>
                                    <span className="text-gray-500 text-[10px] self-center">to</span>
                                    <div className="relative flex-1">
                                        <input
                                            type="date"
                                            value={convoDateTo}
                                            onChange={(e) => setConvoDateTo(e.target.value)}
                                            className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-[11px] text-gray-300 placeholder-gray-600 focus:outline-none focus:border-green-500/50"
                                            title="To date"
                                        />
                                    </div>
                                </div>
                                {/* Quick date presets + clear */}
                                <div className="flex flex-wrap gap-1 px-1">
                                    {[
                                        { label: 'Today', days: 0 },
                                        { label: '7 days', days: 7 },
                                        { label: '30 days', days: 30 },
                                        { label: '90 days', days: 90 },
                                    ].map(preset => (
                                        <button
                                            key={preset.label}
                                            onClick={() => {
                                                const today = new Date();
                                                const from = new Date(today);
                                                from.setDate(from.getDate() - preset.days);
                                                setConvoDateFrom(from.toISOString().split('T')[0]);
                                                setConvoDateTo(today.toISOString().split('T')[0]);
                                            }}
                                            className="text-[9px] px-1.5 py-0.5 bg-white/5 hover:bg-white/10 rounded text-gray-400 hover:text-green-400 transition-colors"
                                        >
                                            {preset.label}
                                        </button>
                                    ))}
                                    {activeFilterCount > 0 && (
                                        <button
                                            onClick={() => { setConvoNpcFilter(''); setConvoModelFilter(''); setConvoDateFrom(''); setConvoDateTo(''); }}
                                            className="text-[9px] px-1.5 py-0.5 bg-red-500/10 hover:bg-red-500/20 rounded text-red-400 hover:text-red-300 transition-colors"
                                            title="Clear all filters"
                                        >
                                            Clear all
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        );

        // Always show the header, even when empty
        if (!sortedConversations.length) {
            return (
                <div>
                    {header}
                    {/* Empty state - no message needed */}
                </div>
            );
        }

        if (conversationsCollapsed) {
            const activeConversation = activeConversationId ? sortedConversations.find(conv => conv.id === activeConversationId) : null;
            return (
                <div>
                    {header}
                    {activeConversation && !currentFile && (
                        <div className="bg-black/10 p-1">
                            <button
                                onClick={() => handleConversationSelect(activeConversation.id)}
                                className="flex items-center gap-2 px-2 py-1.5 w-full hover:bg-white/5 text-left rounded transition-all border-l-2 border-green-500"
                            >
                                <MessageSquare size={14} className="text-green-400 flex-shrink-0" />
                                <div className="flex flex-col overflow-hidden min-w-0">
                                    <span className="text-[11px] truncate text-gray-200">{activeConversation.title || 'Untitled'}</span>
                                </div>
                            </button>
                        </div>
                    )}
                </div>
            );
        }

        return (
            <div className="flex flex-col h-full">
                {header}
                {!conversationsCollapsed && (
                    <div className="bg-black/10 flex-1 min-h-0 overflow-y-auto">
                        {filteredConversations.length === 0 ? (
                            <div className="px-3 py-3 text-[11px] text-gray-500 text-center">No matches for "{convoSearch}"</div>
                        ) : (
                            filteredConversations.map((conv, index) => {
                            const isSelected = selectedConvos?.has(conv.id);
                            const isActive = conv.id === activeConversationId && !currentFile;
                            return (
                                <button
                                    key={conv.id}
                                    draggable="true"
                                    onDragStart={(e) => { e.dataTransfer.effectAllowed = 'copyMove'; handleGlobalDragStart(e, { type: 'conversation', id: conv.id }); }}
                                    onDragEnd={handleGlobalDragEnd}
                                    onClick={(e) => {
                                        if (e.ctrlKey || e.metaKey) {
                                            const newSelected = new Set(selectedConvos || new Set());
                                            if (newSelected.has(conv.id)) newSelected.delete(conv.id);
                                            else newSelected.add(conv.id);
                                            setSelectedConvos(newSelected);
                                            setLastClickedIndex(index);
                                        } else if (e.shiftKey && lastClickedIndex !== null) {
                                            const newSelected = new Set();
                                            const start = Math.min(lastClickedIndex, index);
                                            const end = Math.max(lastClickedIndex, index);
                                            for (let i = start; i <= end; i++) {
                                                if (filteredConversations[i]) newSelected.add(filteredConversations[i].id);
                                            }
                                            setSelectedConvos(newSelected);
                                        } else {
                                            setSelectedConvos(new Set([conv.id]));
                                            handleConversationSelect(conv.id);
                                            setLastClickedIndex(index);
                                        }
                                    }}
                                    onContextMenu={(e) => {
                                        e.preventDefault();
                                        if (!selectedConvos?.has(conv.id)) setSelectedConvos(new Set([conv.id]));
                                        setContextMenuPos({ x: e.clientX, y: e.clientY });
                                    }}
                                    className={`flex items-center gap-2 px-2 py-1.5 w-full text-left transition-all group
                                        ${isActive ? 'bg-green-500/20 border-l-2 border-green-500' : 'hover:bg-white/5 border-l-2 border-transparent'}
                                        ${isSelected ? 'bg-teal-500/10' : ''}`}
                                >
                                    <MessageSquare size={13} className={`flex-shrink-0 ${isActive ? 'text-green-400' : 'text-gray-500 group-hover:text-gray-400'}`} />
                                    <div className="flex flex-col overflow-hidden min-w-0 flex-1">
                                        <span className={`text-[11px] truncate ${isActive ? 'text-green-200' : 'text-gray-300'}`}>{conv.title || 'Untitled'}</span>
                                        <span className="text-[9px] text-gray-600 truncate">{conv.preview?.substring(0, 40) || new Date(conv.timestamp).toLocaleDateString()}</span>
                                    </div>
                                </button>
                            );
                        })
                    )}
                    </div>
                )}
            </div>
        );
    };

    // Git section - only shows when git is detected
    const renderGitSection = () => {
        // Show loading state while checking for git
        if (!gitStatus) {
            return (
                <div>
                    <div className="flex items-stretch w-full py-4 bg-gradient-to-r from-orange-900/20 to-amber-900/20">
                        <div className="flex items-center pl-1 gap-0">
                            <ChevronRight size={14} className="text-gray-600 dark:text-gray-400" />
                        </div>
                        <button
                            onClick={(e) => { e.stopPropagation(); createGitPane?.(); }}
                            className="ml-auto flex items-center justify-center w-1/4 py-4 -my-4 hover:bg-white/10 transition-all"
                            title="Open full Git pane"
                        >
                            <GitBranch size={12} className="text-orange-400" />
                        </button>
                    </div>
                </div>
            );
        }

        // If gitStatus is an error or not a git repo, don't show the section
        if (gitStatus.success === false) return null;

        const staged = Array.isArray(gitStatus.staged) ? gitStatus.staged : [];
        const unstaged = Array.isArray(gitStatus.unstaged) ? gitStatus.unstaged : [];
        const untracked = Array.isArray(gitStatus.untracked) ? gitStatus.untracked : [];
        const conflicted = Array.isArray(gitStatus.conflicted) ? gitStatus.conflicted : [];
        const totalChanges = staged.length + unstaged.length + untracked.length + conflicted.length;

        const openDiffViewer = (filePath: string, status: string) => {
            // Open a diff pane for this file
            const paneId = generateId();
            const fullPath = filePath.startsWith('/') ? filePath : `${currentPath}/${filePath}`;
            const newPane = {
                id: paneId,
                contentType: 'diff',
                contentId: fullPath,
                diffStatus: status
            };

            // Add pane to layout
            if (createAndAddPaneNodeToLayout) {
                createAndAddPaneNodeToLayout(newPane);
            }
        };

        const header = (
            <div
                className={`transition-all duration-150 ${draggedSection === 'git' ? 'opacity-50' : ''} ${dropTargetSection === 'git' ? 'ring-2 ring-orange-500' : ''}`}
                onDragOver={handleSectionDragOver('git')}
                onDragLeave={handleSectionDragLeave}
                onDrop={handleSectionDrop('git')}
            >
                <div
                    draggable
                    onDragStart={handleSectionDragStart('git')}
                    onDragEnd={handleSectionDragEnd}
                    onClick={() => setGitPanelCollapsed(!gitPanelCollapsed)}
                    className="flex items-stretch w-full py-4 bg-gradient-to-r from-orange-900/20 to-amber-900/20 cursor-pointer hover:bg-white/5"
                >
                    {/* Left: chevron, then conditional controls */}
                    <div className="flex items-center pl-1 gap-0">
                        <ChevronRight size={14} className={`transform transition-transform text-gray-600 dark:text-gray-400 ${!gitPanelCollapsed ? 'rotate-90' : ''}`} />
                        {!gitPanelCollapsed && (
                            <button
                                onClick={(e) => { e.stopPropagation(); loadGitStatus(); }}
                                className="p-1.5 hover:bg-white/10 rounded transition-all text-gray-400 hover:text-orange-400"
                                title="Refresh git status"
                            >
                                <RefreshCw size={12} />
                            </button>
                        )}
                    </div>
                    {/* Right: GitBranch button - full height clickable area */}
                    <button
                        onClick={(e) => { e.stopPropagation(); createGitPane?.(); }}
                        className="ml-auto flex items-center justify-center w-1/4 py-4 -my-4 hover:bg-white/10 transition-all"
                        title="Open full Git pane"
                    >
                        <GitBranch size={12} className="text-orange-400" />
                    </button>
                </div>
            </div>
        );

        return (
            <div className="flex flex-col h-full">
                {header}
                {!gitPanelCollapsed && (
                    <div className="theme-bg-secondary overflow-hidden flex-1 min-h-0">
                        <div className="overflow-auto h-full p-2 space-y-2">
                            {/* Open Full Git Pane button */}
                            <button
                                onClick={() => createGitPane?.()}
                                className="w-full px-2 py-1.5 rounded bg-purple-600 hover:bg-purple-500 text-white text-[11px] font-medium flex items-center justify-center gap-2"
                            >
                                <Maximize2 size={12} />
                                Open Full Git View
                            </button>

                            {/* Stage All / Unstage All buttons - moved above file list */}
                            {(unstaged.length > 0 || untracked.length > 0 || staged.length > 0) && (
                                <div className="flex gap-1">
                                    {(unstaged.length > 0 || untracked.length > 0) && (
                                        <button
                                            disabled={gitLoading}
                                            onClick={async () => {
                                                for (const file of [...unstaged, ...untracked]) {
                                                    await (window as any).api?.gitStageFile?.(currentPath, file.path);
                                                }
                                                await loadGitStatus();
                                            }}
                                            className="flex-1 px-2 py-1 text-[10px] bg-teal-600/20 text-teal-400 hover:bg-teal-600/30 rounded flex items-center justify-center gap-1"
                                            title="Stage all changes"
                                        >
                                            <Plus size={10} /> Stage All
                                        </button>
                                    )}
                                    {staged.length > 0 && (
                                        <button
                                            disabled={gitLoading}
                                            onClick={async () => {
                                                for (const file of staged) {
                                                    await (window as any).api?.gitUnstageFile?.(currentPath, file.path);
                                                }
                                                await loadGitStatus();
                                            }}
                                            className="flex-1 px-2 py-1 text-[10px] bg-pink-600/20 text-pink-400 hover:bg-pink-600/30 rounded flex items-center justify-center gap-1"
                                            title="Unstage all changes"
                                        >
                                            <Minus size={10} /> Unstage All
                                        </button>
                                    )}
                                </div>
                            )}

                            {/* Commit input and button */}
                            <div className="flex gap-1">
                                <input
                                    type="text"
                                    value={gitCommitMessage}
                                    onChange={e => setGitCommitMessage(e.target.value)}
                                    placeholder="Commit message..."
                                    className="flex-1 px-2 py-1 text-[10px] rounded theme-bg-primary theme-border border"
                                />
                                <button
                                    disabled={gitLoading || !gitCommitMessage.trim() || staged.length === 0}
                                    onClick={gitCommitChanges}
                                    className="px-2 py-1 text-[10px] bg-teal-600 hover:bg-teal-700 disabled:opacity-50 rounded"
                                    title="Commit staged changes"
                                >
                                    Commit
                                </button>
                            </div>

                            {/* Pull/Push buttons */}
                            <div className="flex gap-1">
                                <button
                                    disabled={gitLoading}
                                    onClick={gitPullChanges}
                                    className="flex-1 px-2 py-1 text-[10px] theme-hover rounded border theme-border"
                                >
                                    Pull
                                </button>
                                <button
                                    disabled={gitLoading}
                                    onClick={gitPushChanges}
                                    className="flex-1 px-2 py-1 text-[10px] theme-hover rounded border theme-border"
                                >
                                    Push
                                </button>
                            </div>

                            {gitError && <div className="text-[9px] text-pink-400">{gitError}</div>}

                            {/* Separator before file list */}
                            {totalChanges > 0 && <div className="border-t border-gray-700/50" />}

                            {/* Merge conflicts */}
                            {conflicted.length > 0 && (
                                <div className="bg-pink-900/20 rounded p-1.5 border border-pink-500/30">
                                    <div className="text-[10px] font-medium text-pink-400 mb-1 flex items-center justify-between">
                                        <span className="flex items-center gap-1">
                                            <AlertCircle size={10} /> Conflicts ({conflicted.length})
                                        </span>
                                        <button
                                            onClick={async () => {
                                                if (confirm('Abort merge and discard all merge changes?')) {
                                                    await (window as any).api?.gitAbortMerge?.(currentPath);
                                                    await loadGitStatus();
                                                }
                                            }}
                                            className="text-[9px] px-1.5 py-0.5 bg-pink-600/30 hover:bg-pink-600/50 rounded text-pink-300"
                                            title="Abort merge"
                                        >
                                            Abort
                                        </button>
                                    </div>
                                    {conflicted.map(file => (
                                        <div key={file.path} className="flex flex-col w-full px-1 py-1 text-[10px] hover:bg-pink-500/10 rounded">
                                            <button
                                                onClick={() => openDiffViewer(file.path, 'conflict')}
                                                className="text-pink-300 truncate text-left hover:underline mb-1"
                                            >
                                                {file.path}
                                            </button>
                                            <div className="flex items-center gap-1">
                                                <button
                                                    onClick={async () => { await (window as any).api?.gitAcceptOurs?.(currentPath, file.path); await loadGitStatus(); }}
                                                    className="flex-1 px-1 py-0.5 text-[9px] bg-blue-600/30 hover:bg-blue-600/50 rounded text-blue-300"
                                                    title="Keep our version"
                                                >Ours</button>
                                                <button
                                                    onClick={async () => { await (window as any).api?.gitAcceptTheirs?.(currentPath, file.path); await loadGitStatus(); }}
                                                    className="flex-1 px-1 py-0.5 text-[9px] bg-purple-600/30 hover:bg-purple-600/50 rounded text-purple-300"
                                                    title="Accept their version"
                                                >Theirs</button>
                                                <button
                                                    onClick={async () => { await (window as any).api?.gitMarkResolved?.(currentPath, file.path); await loadGitStatus(); }}
                                                    className="flex-1 px-1 py-0.5 text-[9px] bg-teal-600/30 hover:bg-teal-600/50 rounded text-teal-300"
                                                    title="Mark as resolved (after manual edit)"
                                                >Resolved</button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Unstaged files */}
                            {unstaged.length > 0 && (
                                <div>
                                    <div className="text-[10px] font-medium text-yellow-400 mb-1 flex items-center gap-1">
                                        <Edit size={10} /> Modified ({unstaged.length})
                                    </div>
                                    {unstaged.map(file => {
                                        const shortStatus = file.status?.toLowerCase().includes('modif') ? 'M' :
                                            file.status?.toLowerCase().includes('delet') ? 'D' :
                                            file.status?.toLowerCase().includes('renam') ? 'R' :
                                            file.status?.toLowerCase().includes('unknown') ? '?' :
                                            file.status?.charAt(0)?.toUpperCase() || '?';
                                        return (
                                        <div
                                            key={file.path}
                                            className="flex items-center justify-between w-full px-2 py-1 text-[10px] hover:bg-yellow-500/10 rounded group"
                                        >
                                            <button
                                                onClick={() => openDiffViewer(file.path, file.status)}
                                                className="text-yellow-300 truncate flex-1 text-left hover:underline"
                                            >
                                                {file.path}
                                            </button>
                                            <div className="flex items-center gap-1">
                                                <span className="text-yellow-500 text-[9px] opacity-60" title={file.status}>{shortStatus}</span>
                                                <button
                                                    onClick={async (e) => {
                                                        e.stopPropagation();
                                                        await (window as any).api?.gitStageFile?.(currentPath, file.path);
                                                        await loadGitStatus();
                                                    }}
                                                    className="p-0.5 hover:bg-teal-500/20 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                                                    title="Stage file"
                                                >
                                                    <Plus size={10} className="text-teal-400" />
                                                </button>
                                                <button
                                                    onClick={async (e) => {
                                                        e.stopPropagation();
                                                        if (confirm(`Discard changes to ${file.path}?`)) {
                                                            await (window as any).api?.gitDiscardFile?.(currentPath, file.path);
                                                            await loadGitStatus();
                                                        }
                                                    }}
                                                    className="p-0.5 hover:bg-pink-500/20 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                                                    title="Discard changes"
                                                >
                                                    <X size={10} className="text-pink-400" />
                                                </button>
                                            </div>
                                        </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Staged files */}
                            {staged.length > 0 && (
                                <div>
                                    <div className="text-[10px] font-medium text-teal-400 mb-1 flex items-center gap-1">
                                        <Check size={10} /> Staged ({staged.length})
                                    </div>
                                    {staged.map(file => (
                                        <div
                                            key={file.path}
                                            className="flex items-center justify-between w-full px-2 py-1 text-[10px] hover:bg-teal-500/10 rounded group"
                                        >
                                            <button
                                                onClick={() => openDiffViewer(file.path, file.status)}
                                                className="text-teal-300 truncate flex-1 text-left hover:underline"
                                            >
                                                {file.path}
                                            </button>
                                            <div className="flex items-center gap-1">
                                                <span className="text-teal-500 text-[9px] opacity-60">{file.status}</span>
                                                <button
                                                    onClick={async (e) => {
                                                        e.stopPropagation();
                                                        await (window as any).api?.gitUnstageFile?.(currentPath, file.path);
                                                        await loadGitStatus();
                                                    }}
                                                    className="p-0.5 hover:bg-pink-500/20 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                                                    title="Unstage file"
                                                >
                                                    <Minus size={10} className="text-pink-400" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Untracked files */}
                            {untracked.length > 0 && (
                                <div>
                                    <div className="text-[10px] font-medium text-gray-400 mb-1 flex items-center gap-1">
                                        <Plus size={10} /> Untracked ({untracked.length})
                                    </div>
                                    {untracked.map(file => (
                                        <div
                                            key={file.path}
                                            className="flex items-center justify-between w-full px-2 py-1 text-[10px] hover:bg-white/5 rounded group"
                                        >
                                            <button
                                                onClick={() => handleFileClick(`${currentPath}/${file.path}`)}
                                                className="text-gray-400 truncate flex-1 text-left hover:underline"
                                            >
                                                {file.path}
                                            </button>
                                            <div className="flex items-center gap-1">
                                                <span className="text-gray-500 text-[9px] opacity-60">new</span>
                                                <button
                                                    onClick={async (e) => {
                                                        e.stopPropagation();
                                                        await (window as any).api?.gitStageFile?.(currentPath, file.path);
                                                        loadGitStatus();
                                                    }}
                                                    className="p-0.5 hover:bg-teal-500/20 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                                                    title="Stage file"
                                                >
                                                    <Plus size={10} className="text-teal-400" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {totalChanges === 0 && (
                                <div className="text-[10px] text-gray-500 text-center py-1">
                                    No changes
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        );
    };

        const renderContextMenu = () => (
        contextMenuPos && (
            <>
                {/* Backdrop to catch outside clicks */}
                <div
                    className="fixed inset-0 z-40"
                    onClick={() => setContextMenuPos(null)}
                />
                <div
                    className="fixed theme-bg-secondary theme-border border rounded shadow-lg py-1 z-50"
                    style={{ top: contextMenuPos.y, left: contextMenuPos.x }}
                    onMouseLeave={() => setContextMenuPos(null)}
                >
                    <button
                        onClick={() => handleSummarizeAndStart()}
                        className="flex items-center gap-2 px-4 py-3 theme-hover w-full text-left theme-text-primary"
                    >
                        <MessageSquare size={16} />
                        <span>Summarize & Start ({selectedConvos?.size || 0})</span>
                    </button>
                    <button
                        onClick={() => handleSummarizeAndDraft()}
                        className="flex items-center gap-2 px-4 py-3 theme-hover w-full text-left theme-text-primary"
                    >
                        <Edit size={16} />
                        <span>Summarize & Draft ({selectedConvos?.size || 0})</span>
                    </button>
                    <button
                        onClick={() => handleSummarizeAndPrompt()}
                        className="flex items-center gap-2 px-4 py-3 theme-hover w-full text-left theme-text-primary"
                    >
                        <MessageSquare size={16} />
                        <span>Summarize & Prompt ({selectedConvos?.size || 0})</span>
                    </button>
                <div className="border-t theme-border my-1"></div>
                <button
                    onClick={handleAnalyzeInDashboard}
                    className="flex items-center gap-2 px-4 py-3 theme-hover w-full text-left theme-text-primary"
                >
                    <BarChart3 size={16} />
                    <span>Analyze in Dashboard ({selectedConvos?.size || 0})</span>
                </button>
                </div>
            </>
        )
    );

    const renderFileContextMenu = () => (
        fileContextMenuPos && (
            <>
                {/* Backdrop to catch outside clicks */}
                <div
                    className="fixed inset-0 z-40"
                    onClick={() => setFileContextMenuPos(null)}
                />
                <div
                    className="fixed theme-bg-secondary theme-border border rounded shadow-lg py-1 z-50"
                    style={{ top: fileContextMenuPos.y, left: fileContextMenuPos.x }}
                    onMouseLeave={() => setFileContextMenuPos(null)}
                >
                    <button
                        onClick={() => handleApplyPromptToFiles('summarize')}
                        className="flex items-center gap-2 px-4 py-3 theme-hover w-full text-left theme-text-primary"
                    >
                        <MessageSquare size={16} />
                        <span>Summarize Files ({selectedFiles.size})</span>
                    </button>
                    <button
                        onClick={() => handleApplyPromptToFilesInInput('summarize')}
                        className="flex items-center gap-2 px-4 py-3 theme-hover w-full text-left theme-text-primary"
                    >
                        <MessageSquare size={16} />
                        <span>Summarize in Input Field ({selectedFiles.size})</span>
                    </button>
                    <div className="border-t theme-border my-1"></div>
                    <button
                        onClick={() => handleApplyPromptToFiles('analyze')}
                        className="flex items-center gap-2 px-4 py-3 theme-hover w-full text-left theme-text-primary"
                    >
                        <Edit size={16} />
                        <span>Analyze Files ({selectedFiles.size})</span>
                    </button>
                    <button
                        onClick={() => handleApplyPromptToFilesInInput('analyze')}
                        className="flex items-center gap-2 px-4 py-3 theme-hover w-full text-left theme-text-primary"
                    >
                        <Edit size={16} />
                        <span>Analyze in Input Field ({selectedFiles.size})</span>
                    </button>
                    <div className="border-t theme-border my-1"></div>
                    <button
                        onClick={() => handleApplyPromptToFiles('refactor')}
                        className="flex items-center gap-2 px-4 py-3 theme-hover w-full text-left theme-text-primary"
                    >
                        <Code2 size={16} />
                        <span>Refactor Code ({selectedFiles.size})</span>
                    </button>
                    <button
                        onClick={() => handleApplyPromptToFiles('document')}
                        className="flex items-center gap-2 px-4 py-3 theme-hover w-full text-left theme-text-primary"
                    >
                        <FileText size={16} />
                        <span>Document Code ({selectedFiles.size})</span>
                    </button>
                </div>
            </>
        )
    );

    const renderWebsiteContextMenu = () => (
        websiteContextMenu && (
            <>
                <div
                    className="fixed inset-0 z-40"
                    onClick={() => setWebsiteContextMenu(null)}
                />
                <div
                    className="fixed theme-bg-secondary theme-border border rounded shadow-lg py-1 z-50 min-w-[200px]"
                    style={{ top: websiteContextMenu.y, left: websiteContextMenu.x }}
                >
                    <div className="px-3 py-1 text-xs text-gray-400 border-b theme-border truncate max-w-[250px]">
                        {websiteContextMenu.title}
                    </div>
                    <button
                        onClick={() => {
                            createNewBrowser(websiteContextMenu.url);
                            setWebsiteContextMenu(null);
                        }}
                        className="flex items-center gap-2 px-4 py-3 theme-hover w-full text-left theme-text-primary"
                    >
                        <Globe size={16} />
                        <span>Open</span>
                    </button>
                    <div className="border-t theme-border my-1"></div>
                    {bookmarks.find(b => b.url === websiteContextMenu.url) ? (
                        <button
                            onClick={async () => {
                                const bookmark = bookmarks.find(b => b.url === websiteContextMenu.url);
                                if (bookmark) {
                                    await (window as any).api.browserDeleteBookmark({ bookmarkId: bookmark.id });
                                    loadBookmarks();
                                }
                                setWebsiteContextMenu(null);
                            }}
                            className="flex items-center gap-2 px-4 py-3 theme-hover w-full text-left text-red-400"
                        >
                            <Star size={16} className="fill-current" />
                            <span>Remove Bookmark</span>
                        </button>
                    ) : (
                        <button
                            onClick={async () => {
                                await (window as any).api.browserAddBookmark({
                                    url: websiteContextMenu.url,
                                    title: websiteContextMenu.title,
                                    folderPath: currentPath,
                                    isGlobal: false
                                });
                                loadBookmarks();
                                setWebsiteContextMenu(null);
                            }}
                            className="flex items-center gap-2 px-4 py-3 theme-hover w-full text-left theme-text-primary"
                        >
                            <Star size={16} />
                            <span>Add to Bookmarks</span>
                        </button>
                    )}
                    <div className="border-t theme-border my-1"></div>
                    <button
                        onClick={() => {
                            try {
                                const domain = new URL(websiteContextMenu.url).hostname;
                                setLimitDialog({ domain, hourlyTime: '0', dailyTime: '0', hourlyVisits: '0', dailyVisits: '0' });
                            } catch (e) {
                                console.error('Invalid URL:', e);
                            }
                            setWebsiteContextMenu(null);
                        }}
                        className="flex items-center gap-2 px-4 py-3 theme-hover w-full text-left theme-text-primary"
                    >
                        <Clock size={16} />
                        <span>Set Limits</span>
                    </button>
                    <div className="border-t theme-border my-1"></div>
                    <button
                        onClick={() => {
                            navigator.clipboard.writeText(websiteContextMenu.url);
                            setWebsiteContextMenu(null);
                        }}
                        className="flex items-center gap-2 px-4 py-3 theme-hover w-full text-left theme-text-primary"
                    >
                        <FileText size={16} />
                        <span>Copy URL</span>
                    </button>
                </div>
            </>
        )
    );

// Main Sidebar render
const getPlaceholderText = () => {
    if (isGlobalSearch) {
        return "Global search (Ctrl+Shift+F)...";
    }
    const activePaneData = contentDataRef.current[activeContentPaneId];
    if (activePaneData) {
        switch (activePaneData.contentType) {
            case 'editor':
                return "Search in current file (Ctrl+F)...";
            case 'chat':
                return "Search in conversation (Ctrl+F)...";
            default:
                return "Local search (Ctrl+F)...";
        }
    }
    return "Search (Ctrl+F)...";
};

return (
    <>
    <div
        className="border-r theme-border flex flex-col flex-shrink-0 theme-sidebar relative"
        style={{
            width: sidebarCollapsed ? '0px' : `${sidebarWidth}px`,
            transition: 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
            overflow: sidebarCollapsed ? 'hidden' : 'visible'
        }}
    >
        {!sidebarCollapsed && (
            <div
                className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-blue-500 transition-colors z-50"
                onMouseDown={(e) => {
                    e.preventDefault();
                    setIsResizingSidebar(true);
                }}
                style={{
                    backgroundColor: isResizingSidebar ? '#3b82f6' : 'transparent'
                }}
            />
        )}

        {/* Expand top bar hover button - shows when top bar is collapsed */}
        {topBarCollapsed && !sidebarCollapsed && (
            <div
                className="group h-6 flex items-center justify-center border-b border-gray-700 hover:bg-blue-500/20 cursor-pointer transition-all"
                onClick={onExpandTopBar}
                title="Show top bar"
            >
                <ChevronDown size={14} className="text-gray-600 group-hover:text-blue-400 transition-colors" />
            </div>
        )}

        {/* Header Actions - hidden when sidebar or top bar is collapsed */}
        <div className={`border-b border-gray-700 flex-shrink-0 relative group/header ${sidebarCollapsed || topBarCollapsed ? 'hidden' : ''}`} style={{ height: topBarHeight }}>
            <div className="grid grid-cols-4 divide-x divide-gray-700 h-full">
                {/* Terminals dropdown */}
                <div className="relative" data-dropdown="terminal">
                    <button
                        onClick={() => createNewTerminal?.(defaultNewTerminalType)}
                        className="w-full h-full flex items-center justify-center hover:bg-teal-500/20 relative transition-colors"
                        title={`New ${defaultNewTerminalType === 'system' ? 'Bash' : defaultNewTerminalType} Terminal`}
                    >
                        {defaultNewTerminalType === 'system' && <Terminal size={18} className="text-green-400" />}
                        {defaultNewTerminalType === 'npcsh' && <Sparkles size={18} className="text-purple-400" />}
                        {defaultNewTerminalType === 'guac' && <Code2 size={18} className="text-yellow-400" />}
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); setTerminalDropdownOpen(!terminalDropdownOpen); }}
                        className="absolute top-0 right-0 w-1/2 h-1/2 flex items-center justify-center hover:bg-white/10 rounded-bl transition-colors"
                        title="More terminal options"
                    >
                        <ChevronDown size={7} className="text-gray-500" />
                    </button>
                    {terminalDropdownOpen && (
                        <div className="absolute left-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded shadow-xl z-[9999] py-1 min-w-[110px]">
                            <div className="px-2 py-0.5 text-[8px] text-gray-500 uppercase">Right-click to set default</div>
                            <button
                                onClick={() => { createNewTerminal?.('system'); setTerminalDropdownOpen(false); }}
                                onContextMenu={(e) => { e.preventDefault(); setDefaultNewTerminalType('system'); setTerminalDropdownOpen(false); }}
                                className={`flex items-center gap-2 px-2 py-1 w-full text-left hover:bg-gray-700 text-xs ${defaultNewTerminalType === 'system' ? 'bg-green-900/30 text-green-300' : 'text-gray-200'}`}
                            >
                                <Terminal size={11} className="text-green-400" /><span>Bash</span>
                                {defaultNewTerminalType === 'system' && <Star size={8} className="text-yellow-400 ml-auto" />}
                            </button>
                            <button
                                onClick={() => { createNewTerminal?.('npcsh'); setTerminalDropdownOpen(false); }}
                                onContextMenu={(e) => { e.preventDefault(); setDefaultNewTerminalType('npcsh'); setTerminalDropdownOpen(false); }}
                                className={`flex items-center gap-2 px-2 py-1 w-full text-left hover:bg-gray-700 text-xs ${defaultNewTerminalType === 'npcsh' ? 'bg-purple-900/30 text-purple-300' : 'text-gray-200'}`}
                            >
                                <Sparkles size={11} className="text-purple-400" /><span>npcsh</span>
                                {defaultNewTerminalType === 'npcsh' && <Star size={8} className="text-yellow-400 ml-auto" />}
                            </button>
                            <button
                                onClick={() => { createNewTerminal?.('guac'); setTerminalDropdownOpen(false); }}
                                onContextMenu={(e) => { e.preventDefault(); setDefaultNewTerminalType('guac'); setTerminalDropdownOpen(false); }}
                                className={`flex items-center gap-2 px-2 py-1 w-full text-left hover:bg-gray-700 text-xs ${defaultNewTerminalType === 'guac' ? 'bg-yellow-900/30 text-yellow-300' : 'text-gray-200'}`}
                            >
                                <Code2 size={11} className="text-yellow-400" /><span>guac</span>
                                {defaultNewTerminalType === 'guac' && <Star size={8} className="text-yellow-400 ml-auto" />}
                            </button>
                        </div>
                    )}
                </div>
                {/* Notebooks/Experiments dropdown */}
                <div className="relative" data-dropdown="notebook">
                    <button
                        onClick={() => defaultNewNotebookType === 'notebook' ? createNewNotebook?.() : createNewExperiment?.()}
                        className="w-full h-full flex items-center justify-center hover:bg-teal-500/20 py-4 relative transition-colors"
                        title={`New ${defaultNewNotebookType === 'notebook' ? 'Notebook' : 'Experiment'}`}
                    >
                        {defaultNewNotebookType === 'notebook' ? <FileText size={18} className="text-orange-400" /> : <FlaskConical size={18} className="text-purple-400" />}
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); setChatPlusDropdownOpen(!chatPlusDropdownOpen); }}
                        className="absolute top-0 right-0 w-1/2 h-1/2 flex items-center justify-center hover:bg-white/10 rounded-bl transition-colors"
                        title="More options"
                    >
                        <ChevronDown size={7} className="text-gray-500" />
                    </button>
                    {chatPlusDropdownOpen && (
                        <div className="absolute left-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded shadow-xl z-[9999] py-1 min-w-[120px]">
                            <div className="px-2 py-0.5 text-[8px] text-gray-500 uppercase">Right-click to set default</div>
                            <button
                                onClick={() => { createNewNotebook?.(); setChatPlusDropdownOpen(false); }}
                                onContextMenu={(e) => { e.preventDefault(); setDefaultNewNotebookType('notebook'); setChatPlusDropdownOpen(false); }}
                                className={`flex items-center gap-2 px-2 py-1 w-full text-left hover:bg-gray-700 text-xs ${defaultNewNotebookType === 'notebook' ? 'bg-orange-900/30 text-orange-300' : 'text-gray-200'}`}
                            >
                                <FileText size={11} className="text-orange-400" /><span>Notebook</span>
                                {defaultNewNotebookType === 'notebook' && <Star size={8} className="text-yellow-400 ml-auto" />}
                            </button>
                            <button
                                onClick={() => { createNewExperiment?.(); setChatPlusDropdownOpen(false); }}
                                onContextMenu={(e) => { e.preventDefault(); setDefaultNewNotebookType('experiment'); setChatPlusDropdownOpen(false); }}
                                className={`flex items-center gap-2 px-2 py-1 w-full text-left hover:bg-gray-700 text-xs ${defaultNewNotebookType === 'experiment' ? 'bg-purple-900/30 text-purple-300' : 'text-gray-200'}`}
                            >
                                <FlaskConical size={11} className="text-purple-400" /><span>Experiment</span>
                                {defaultNewNotebookType === 'experiment' && <Star size={8} className="text-yellow-400 ml-auto" />}
                            </button>
                        </div>
                    )}
                </div>
                {/* Code Files dropdown */}
                <div className="relative" data-dropdown="code-file">
                    <button
                        onClick={() => createFileWithExtension(defaultCodeFileType)}
                        className="w-full h-full flex items-center justify-center hover:bg-teal-500/20 py-4 relative transition-colors"
                        title={`New .${defaultCodeFileType} file`}
                    >
                        <Code2 size={18} className="text-cyan-400" />
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); setCodeFileDropdownOpen(!codeFileDropdownOpen); }}
                        className="absolute top-0 right-0 w-1/2 h-1/2 flex items-center justify-center hover:bg-white/10 rounded-bl transition-colors"
                        title="More file types"
                    >
                        <ChevronDown size={7} className="text-gray-500" />
                    </button>
                    {codeFileDropdownOpen && (
                        <div className="absolute left-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded shadow-xl z-[9999] py-1 min-w-[150px] max-h-60 overflow-y-auto">
                            <div className="px-2 py-0.5 text-[8px] text-gray-500 uppercase">Right-click to set default</div>
                            {commonFileTypes.map(type => (
                                <button
                                    key={type.ext}
                                    onClick={() => { createFileWithExtension(type.ext); setCodeFileDropdownOpen(false); }}
                                    onContextMenu={(e) => { e.preventDefault(); setDefaultCodeFileType(type.ext); setCodeFileDropdownOpen(false); }}
                                    className={`flex items-center gap-2 px-2 py-1 w-full text-left hover:bg-gray-700 text-xs ${defaultCodeFileType === type.ext ? 'bg-cyan-900/30 text-cyan-300' : 'text-gray-200'}`}
                                >
                                    <span className="w-3 text-center text-[10px]">{type.icon}</span>
                                    <span className="flex-1">{type.label}</span>
                                    <span className="text-[9px] text-gray-500">.{type.ext}</span>
                                    {defaultCodeFileType === type.ext && <Star size={8} className="text-yellow-400" />}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
                {/* Business Documents dropdown */}
                <div className="relative" data-dropdown="doc">
                    <button
                        onClick={() => createNewDocument?.(defaultNewDocumentType)}
                        className="w-full h-full flex items-center justify-center hover:bg-teal-500/20 py-4 relative transition-colors"
                        title={`New ${defaultNewDocumentType.toUpperCase()} document`}
                    >
                        <FileStack size={18} className="text-rose-400" />
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); setDocDropdownOpen(!docDropdownOpen); }}
                        className="absolute top-0 right-0 w-1/2 h-1/2 flex items-center justify-center hover:bg-white/10 rounded-bl transition-colors"
                        title="More document types"
                    >
                        <ChevronDown size={7} className="text-gray-500" />
                    </button>
                    {docDropdownOpen && (
                        <div className="absolute right-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded shadow-xl z-[9999] py-1 min-w-[130px]">
                            <div className="px-2 py-0.5 text-[8px] text-gray-500 uppercase">Right-click to set default</div>
                            <button
                                onClick={() => { createNewDocument?.('docx'); setDocDropdownOpen(false); }}
                                onContextMenu={(e) => { e.preventDefault(); setDefaultNewDocumentType('docx'); setDocDropdownOpen(false); }}
                                className={`flex items-center gap-2 px-2 py-1 w-full text-left hover:bg-gray-700 text-xs ${defaultNewDocumentType === 'docx' ? 'bg-blue-900/30 text-blue-300' : 'text-gray-200'}`}
                            >
                                <FileText size={11} className="text-blue-300" /><span>Word</span>
                                {defaultNewDocumentType === 'docx' && <Star size={8} className="text-yellow-400 ml-auto" />}
                            </button>
                            <button
                                onClick={() => { createNewDocument?.('xlsx'); setDocDropdownOpen(false); }}
                                onContextMenu={(e) => { e.preventDefault(); setDefaultNewDocumentType('xlsx'); setDocDropdownOpen(false); }}
                                className={`flex items-center gap-2 px-2 py-1 w-full text-left hover:bg-gray-700 text-xs ${defaultNewDocumentType === 'xlsx' ? 'bg-green-900/30 text-green-300' : 'text-gray-200'}`}
                            >
                                <FileJson size={11} className="text-green-300" /><span>Excel</span>
                                {defaultNewDocumentType === 'xlsx' && <Star size={8} className="text-yellow-400 ml-auto" />}
                            </button>
                            <button
                                onClick={() => { createNewDocument?.('pptx'); setDocDropdownOpen(false); }}
                                onContextMenu={(e) => { e.preventDefault(); setDefaultNewDocumentType('pptx'); setDocDropdownOpen(false); }}
                                className={`flex items-center gap-2 px-2 py-1 w-full text-left hover:bg-gray-700 text-xs ${defaultNewDocumentType === 'pptx' ? 'bg-orange-900/30 text-orange-300' : 'text-gray-200'}`}
                            >
                                <BarChart3 size={11} className="text-orange-300" /><span>PowerPoint</span>
                                {defaultNewDocumentType === 'pptx' && <Star size={8} className="text-yellow-400 ml-auto" />}
                            </button>
                            <button
                                onClick={() => { createNewDocument?.('mapx'); setDocDropdownOpen(false); }}
                                onContextMenu={(e) => { e.preventDefault(); setDefaultNewDocumentType('mapx'); setDocDropdownOpen(false); }}
                                className={`flex items-center gap-2 px-2 py-1 w-full text-left hover:bg-gray-700 text-xs ${defaultNewDocumentType === 'mapx' ? 'bg-pink-900/30 text-pink-300' : 'text-gray-200'}`}
                            >
                                <Share2 size={11} className="text-pink-300" /><span>Mind Map</span>
                                {defaultNewDocumentType === 'mapx' && <Star size={8} className="text-yellow-400 ml-auto" />}
                            </button>
                        </div>
                    )}
                </div>
            </div>
            {/* Tile edit mode panel */}
            {tileEditMode && (
                <div className="mt-2 p-2 bg-gray-800/50 rounded-lg border border-gray-700">
                    <div className="text-[10px] text-gray-400 mb-2">Drag to reorder • Click eye to toggle</div>
                    <div className="space-y-1">
                        {[...tilesConfig.tiles].sort((a, b) => a.order - b.order).map((tile) => (
                            <div
                                key={tile.id}
                                draggable
                                onDragStart={(e) => handleTileDragStart(e, tile.id)}
                                onDragOver={handleTileDragOver}
                                onDrop={(e) => handleTileDrop(e, tile.id)}
                                className={`flex items-center gap-2 px-2 py-1 rounded text-xs cursor-move ${
                                    draggedTileId === tile.id ? 'bg-blue-600/30 border border-teal-500' : 'bg-gray-700/50 hover:bg-gray-700'
                                }`}
                            >
                                <span className="text-gray-500">⋮⋮</span>
                                <span className="flex-1">{tile.label}</span>
                                <button
                                    onClick={() => toggleTileEnabled(tile.id)}
                                    className={`p-0.5 rounded ${tile.enabled ? 'text-green-400' : 'text-gray-600'}`}
                                    title={tile.enabled ? 'Visible' : 'Hidden'}
                                >
                                    {tile.enabled ? '👁' : '👁‍🗨'}
                                </button>
                            </div>
                        ))}
                    </div>
                    <button
                        onClick={async () => {
                            const result = await (window as any).api?.tilesConfigReset?.();
                            if (result?.config) setTilesConfig(result.config);
                        }}
                        className="w-full mt-2 py-1 text-[10px] text-gray-500 hover:text-red-400"
                    >
                        Reset to defaults
                    </button>
                </div>
            )}
            {/* Hover zone at bottom of header to collapse top bar */}
            <div
                className="absolute bottom-0 left-0 right-0 h-3 flex items-center justify-center opacity-0 group-hover/header:opacity-100 hover:bg-blue-500/30 cursor-pointer transition-all z-10"
                onClick={onCollapseTopBar}
                title="Hide top bar"
            >
                <ChevronUp size={10} className="text-gray-500 hover:text-blue-400" />
            </div>
        </div>

        <div className={`flex-1 flex flex-col overflow-hidden ${sidebarCollapsed ? 'hidden' : ''}`}>
            {loading ? (
                <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
                    {/* Show files section header with folder dropdown even during loading */}
                    <div data-section-id="files" className="flex-shrink-0">
                        {renderFolderList(folderStructure || {})}
                    </div>
                    <div className="p-4 theme-text-muted">Loading...</div>
                </div>
            ) : isSearching ? (
                renderSearchResults()
            ) : (
                <div
                    className="flex flex-col flex-1 min-h-0 overflow-y-auto"
                    onDragOver={(e) => {
                        if (!draggedSection) return;
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        // Find which section we're over based on Y position
                        const container = e.currentTarget;
                        const sections = container.querySelectorAll('[data-section-id]');
                        const y = e.clientY;
                        let targetSection: string | null = null;
                        sections.forEach((section) => {
                            const rect = section.getBoundingClientRect();
                            if (y >= rect.top && y <= rect.bottom) {
                                targetSection = section.getAttribute('data-section-id');
                            }
                        });
                        // If we're below all sections, target the last one
                        if (!targetSection && sections.length > 0) {
                            const lastRect = sections[sections.length - 1].getBoundingClientRect();
                            if (y > lastRect.bottom) {
                                targetSection = sections[sections.length - 1].getAttribute('data-section-id');
                            } else if (y < sections[0].getBoundingClientRect().top) {
                                targetSection = sections[0].getAttribute('data-section-id');
                            }
                        }
                        if (targetSection && targetSection !== draggedSection) {
                            setDropTargetSection(targetSection);
                        }
                    }}
                    onDragLeave={(e) => {
                        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                            setDropTargetSection(null);
                        }
                    }}
                    onDrop={(e) => {
                        e.preventDefault();
                        if (!draggedSection || !dropTargetSection || draggedSection === dropTargetSection || !setSidebarSectionOrder) {
                            setDraggedSection(null);
                            setDropTargetSection(null);
                            return;
                        }
                        const currentOrder = sidebarSectionOrder || ['websites', 'files', 'conversations', 'git'];
                        const newOrder = [...currentOrder];
                        const draggedIndex = newOrder.indexOf(draggedSection);
                        const targetIndex = newOrder.indexOf(dropTargetSection);
                        newOrder.splice(draggedIndex, 1);
                        newOrder.splice(targetIndex, 0, draggedSection);
                        setSidebarSectionOrder(newOrder);
                        setDraggedSection(null);
                        setDropTargetSection(null);
                    }}
                >
                    {/* Render sections in user-defined order */}
                    {(sidebarSectionOrder || ['websites', 'files', 'conversations', 'git']).map((sectionId: string) => {
                        const sectionColors: Record<string, string> = {
                            websites: 'ring-purple-500',
                            files: 'ring-yellow-500',
                            conversations: 'ring-green-500',
                            git: 'ring-orange-500'
                        };
                        const isCollapsed = (sectionId === 'websites' && websitesCollapsed) ||
                                           (sectionId === 'files' && filesCollapsed) ||
                                           (sectionId === 'conversations' && conversationsCollapsed) ||
                                           (sectionId === 'git' && gitPanelCollapsed);
                        return (
                            <div
                                key={sectionId}
                                data-section-id={sectionId}
                                className={`transition-all duration-150 ${isCollapsed ? 'flex-shrink-0' : 'min-h-0'} ${draggedSection === sectionId ? 'opacity-50 scale-95' : ''} ${dropTargetSection === sectionId && draggedSection !== sectionId ? `ring-2 ${sectionColors[sectionId]} rounded-lg bg-white/5` : ''}`}
                                style={isCollapsed ? {} : { flex: sectionId === 'websites' ? '1 1 0%' : '1.4 1 0%' }}
                            >
                                {sectionId === 'websites' && renderWebsiteList()}
                                {sectionId === 'files' && renderFolderList(folderStructure)}
                                {sectionId === 'conversations' && renderConversationList(directoryConversations)}
                                {sectionId === 'git' && renderGitSection()}
                            </div>
                        );
                    })}
                </div>
            )}
            {contextMenuPos && renderContextMenu()}
            {sidebarItemContextMenuPos && renderSidebarItemContextMenu()}
            {fileContextMenuPos && renderFileContextMenu()}
            {websiteContextMenu && renderWebsiteContextMenu()}
            {/* Limit Input Dialog */}
            {limitDialog && (
                <>
                    <div className="fixed inset-0 bg-black/50 z-50" onClick={() => setLimitDialog(null)} />
                    <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 theme-bg-secondary border theme-border rounded-lg shadow-xl p-4 min-w-[320px]">
                        <h3 className="text-sm font-medium mb-1">Set Site Limits</h3>
                        <p className="text-xs text-gray-400 mb-4">{limitDialog.domain}</p>

                        <div className="space-y-3">
                            <div>
                                <label className="text-xs text-gray-400 block mb-1">Time Limits (minutes)</label>
                                <div className="flex gap-2">
                                    <div className="flex-1">
                                        <input
                                            type="number"
                                            min="0"
                                            value={limitDialog.hourlyTime}
                                            onChange={(e) => setLimitDialog({ ...limitDialog, hourlyTime: e.target.value })}
                                            className="w-full px-2 py-1.5 rounded border theme-border theme-bg-primary text-sm"
                                            placeholder="0"
                                        />
                                        <span className="text-xs text-gray-500">per hour</span>
                                    </div>
                                    <div className="flex-1">
                                        <input
                                            type="number"
                                            min="0"
                                            value={limitDialog.dailyTime}
                                            onChange={(e) => setLimitDialog({ ...limitDialog, dailyTime: e.target.value })}
                                            className="w-full px-2 py-1.5 rounded border theme-border theme-bg-primary text-sm"
                                            placeholder="0"
                                        />
                                        <span className="text-xs text-gray-500">per day</span>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label className="text-xs text-gray-400 block mb-1">Visit Limits</label>
                                <div className="flex gap-2">
                                    <div className="flex-1">
                                        <input
                                            type="number"
                                            min="0"
                                            value={limitDialog.hourlyVisits}
                                            onChange={(e) => setLimitDialog({ ...limitDialog, hourlyVisits: e.target.value })}
                                            className="w-full px-2 py-1.5 rounded border theme-border theme-bg-primary text-sm"
                                            placeholder="0"
                                        />
                                        <span className="text-xs text-gray-500">per hour</span>
                                    </div>
                                    <div className="flex-1">
                                        <input
                                            type="number"
                                            min="0"
                                            value={limitDialog.dailyVisits}
                                            onChange={(e) => setLimitDialog({ ...limitDialog, dailyVisits: e.target.value })}
                                            className="w-full px-2 py-1.5 rounded border theme-border theme-bg-primary text-sm"
                                            placeholder="0"
                                        />
                                        <span className="text-xs text-gray-500">per day</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <p className="text-xs text-gray-500 mt-3 mb-3">Set to 0 for no limit</p>

                        <div className="flex gap-2 justify-end">
                            <button
                                onClick={() => setLimitDialog(null)}
                                className="px-3 py-1.5 text-sm rounded theme-hover"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => {
                                    (window as any).api.browserSetSiteLimit({
                                        domain: limitDialog.domain,
                                        folderPath: currentPath,
                                        hourlyTimeLimit: parseInt(limitDialog.hourlyTime, 10) || 0,
                                        dailyTimeLimit: parseInt(limitDialog.dailyTime, 10) || 0,
                                        hourlyVisitLimit: parseInt(limitDialog.hourlyVisits, 10) || 0,
                                        dailyVisitLimit: parseInt(limitDialog.dailyVisits, 10) || 0,
                                        isGlobal: false
                                    });
                                    setLimitDialog(null);
                                }}
                                className="px-3 py-1.5 text-sm rounded bg-blue-600 hover:bg-blue-700"
                            >
                                Save
                            </button>
                        </div>
                    </div>
                </>
            )}
            {/* Permission Dialog (chmod/chown) */}
            {permissionDialog && (
                <>
                    <div className="fixed inset-0 bg-black/50 z-50" onClick={() => setPermissionDialog(null)} />
                    <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 theme-bg-secondary border theme-border rounded-lg shadow-xl p-4 min-w-[380px]">
                        <h3 className="text-sm font-medium mb-1 flex items-center gap-2">
                            {permissionDialog.type === 'chmod' ? (
                                <><KeyRound size={16} className="text-yellow-400" /> Change Permissions</>
                            ) : (
                                <><Users size={16} className="text-blue-400" /> Change Owner</>
                            )}
                        </h3>
                        <p className="text-xs text-gray-400 mb-4 truncate" title={permissionDialog.path}>{permissionDialog.path}</p>

                        {permissionDialog.type === 'chmod' ? (
                            <div className="space-y-3">
                                <div>
                                    <label className="text-xs text-gray-400 block mb-1">Quick Presets</label>
                                    <select
                                        value={permissionDialog.mode || ''}
                                        onChange={(e) => setPermissionDialog({ ...permissionDialog, mode: e.target.value })}
                                        className="w-full px-2 py-1.5 rounded border theme-border theme-bg-primary text-sm"
                                    >
                                        <option value="">-- Select preset or enter custom --</option>
                                        <optgroup label="Files">
                                            <option value="644">644 - Read/write owner, read others (rw-r--r--)</option>
                                            <option value="664">664 - Read/write owner+group, read others (rw-rw-r--)</option>
                                            <option value="600">600 - Private file, owner only (rw-------)</option>
                                            <option value="666">666 - Read/write everyone (rw-rw-rw-)</option>
                                        </optgroup>
                                        <optgroup label="Directories / Executables">
                                            <option value="755">755 - Standard directory/executable (rwxr-xr-x)</option>
                                            <option value="775">775 - Group writable directory (rwxrwxr-x)</option>
                                            <option value="700">700 - Private directory, owner only (rwx------)</option>
                                            <option value="777">777 - Full access everyone (rwxrwxrwx)</option>
                                        </optgroup>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs text-gray-400 block mb-1">Custom Mode (octal)</label>
                                    <input
                                        type="text"
                                        value={permissionDialog.mode || ''}
                                        onChange={(e) => setPermissionDialog({ ...permissionDialog, mode: e.target.value })}
                                        className="w-full px-2 py-1.5 rounded border theme-border theme-bg-primary text-sm font-mono"
                                        placeholder="755"
                                        maxLength={4}
                                    />
                                </div>
                                <div className="text-xs text-gray-500 space-y-1">
                                    <div className="flex gap-4">
                                        <span><strong>7</strong> = rwx</span>
                                        <span><strong>6</strong> = rw-</span>
                                        <span><strong>5</strong> = r-x</span>
                                        <span><strong>4</strong> = r--</span>
                                    </div>
                                    <div>Format: [owner][group][others]</div>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <div>
                                    <label className="text-xs text-gray-400 block mb-1">Owner (username or UID)</label>
                                    <input
                                        type="text"
                                        value={permissionDialog.owner || ''}
                                        onChange={(e) => setPermissionDialog({ ...permissionDialog, owner: e.target.value })}
                                        className="w-full px-2 py-1.5 rounded border theme-border theme-bg-primary text-sm"
                                        placeholder="username"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-gray-400 block mb-1">Group (groupname or GID, optional)</label>
                                    <input
                                        type="text"
                                        value={permissionDialog.group || ''}
                                        onChange={(e) => setPermissionDialog({ ...permissionDialog, group: e.target.value })}
                                        className="w-full px-2 py-1.5 rounded border theme-border theme-bg-primary text-sm"
                                        placeholder="groupname"
                                    />
                                </div>
                            </div>
                        )}

                        <div className="flex items-center gap-4 mt-3">
                            <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={permissionDialog.recursive || false}
                                    onChange={(e) => setPermissionDialog({ ...permissionDialog, recursive: e.target.checked })}
                                    className="rounded border-gray-600"
                                />
                                Recursive (-R)
                            </label>
                            <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={permissionDialog.useSudo || false}
                                    onChange={(e) => setPermissionDialog({ ...permissionDialog, useSudo: e.target.checked })}
                                    className="rounded border-gray-600"
                                />
                                Use sudo
                            </label>
                        </div>

                        <div className="flex gap-2 justify-end mt-4">
                            <button
                                onClick={() => setPermissionDialog(null)}
                                className="px-3 py-1.5 text-sm rounded theme-hover"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={async () => {
                                    try {
                                        if (permissionDialog.type === 'chmod') {
                                            if (!permissionDialog.mode || !/^[0-7]{3,4}$/.test(permissionDialog.mode)) {
                                                setError('Invalid mode. Use octal format (e.g., 755)');
                                                return;
                                            }
                                            const result = await (window as any).api.chmod({
                                                path: permissionDialog.path,
                                                mode: permissionDialog.mode,
                                                recursive: permissionDialog.recursive,
                                                useSudo: permissionDialog.useSudo
                                            });
                                            if (result?.error) throw new Error(result.error);
                                        } else {
                                            if (!permissionDialog.owner) {
                                                setError('Owner is required');
                                                return;
                                            }
                                            const result = await (window as any).api.chown({
                                                path: permissionDialog.path,
                                                owner: permissionDialog.owner,
                                                group: permissionDialog.group,
                                                recursive: permissionDialog.recursive,
                                                useSudo: permissionDialog.useSudo
                                            });
                                            if (result?.error) throw new Error(result.error);
                                        }
                                        setPermissionDialog(null);
                                        // Refresh directory to see updated permissions
                                        await loadDirectoryStructure(currentPath);
                                    } catch (err: any) {
                                        setError(err.message || 'Failed to change permissions');
                                    }
                                }}
                                className="px-3 py-1.5 text-sm rounded bg-blue-600 hover:bg-blue-700"
                            >
                                Apply
                            </button>
                        </div>
                    </div>
                </>
            )}
            {/* Zip Name Modal */}
            {zipModal && (
                <>
                    <div className="fixed inset-0 bg-black/50 z-50" onClick={() => { if (!isZipping) { setZipModal(null); setZipName(''); } }} />
                    <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 theme-bg-secondary border theme-border rounded-lg shadow-xl p-4 min-w-[320px]">
                        <h3 className="text-sm font-medium mb-3">Create Zip Archive</h3>
                        <p className="text-xs text-gray-400 mb-3">{zipModal.items.length} item{zipModal.items.length > 1 ? 's' : ''} selected</p>
                        {isZipping ? (
                            <div className="flex items-center gap-3 py-4">
                                <svg className="animate-spin h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                <span className="text-sm">Creating archive...</span>
                            </div>
                        ) : (
                            <>
                                <input
                                    type="text"
                                    value={zipName}
                                    onChange={(e) => setZipName(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && zipName.trim()) executeZip();
                                        if (e.key === 'Escape') { setZipModal(null); setZipName(''); }
                                    }}
                                    autoFocus
                                    className="w-full px-3 py-1 rounded border theme-border theme-bg-primary text-sm mb-4"
                                    placeholder="Archive name"
                                />
                                <div className="flex gap-2 justify-end">
                                    <button
                                        onClick={() => { setZipModal(null); setZipName(''); }}
                                        className="px-3 py-1.5 text-sm rounded theme-hover"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={executeZip}
                                        disabled={!zipName.trim()}
                                        className="px-3 py-1.5 text-sm rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                                    >
                                        Create Zip
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </>
            )}
        </div>

        {sidebarCollapsed && <div className="flex-1"></div>}

        {/* Collapse controls row: Down arrow (left) | Sidebar collapse (right) */}
        {!sidebarCollapsed && (
        <div className="flex items-center border-t border-gray-700" style={{ height: bottomBarHeight }}>
            <button
                onClick={() => setBottomGridCollapsed(!bottomGridCollapsed)}
                className="flex-1 flex items-center justify-center h-full hover:bg-teal-500/20 transition-all border-r border-gray-700"
                title={bottomGridCollapsed ? "Show quick actions" : "Hide quick actions"}
            >
                {bottomGridCollapsed ? (
                    <ChevronUp size={16} className="text-gray-600 dark:text-gray-400" />
                ) : (
                    <ChevronDown size={16} className="text-gray-600 dark:text-gray-400" />
                )}
            </button>
            <button
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="flex-1 flex items-center justify-center h-full hover:bg-teal-500/20 transition-all"
                title="Collapse sidebar"
            >
                <ChevronLeft size={16} className="text-gray-600 dark:text-gray-400" />
            </button>
        </div>
        )}

        {/* Download + Theme + Predictive Text + Delete + Incognide buttons - at very bottom when expanded */}
        {!bottomGridCollapsed && !sidebarCollapsed && (
        <div className="flex justify-center items-center gap-2 border-t border-gray-700" style={{ height: bottomBarHeight }}>
            <button
                onClick={() => setDownloadManagerOpen?.(true)}
                className="p-2 rounded-full hover:bg-teal-500/20 transition-all text-gray-400 hover:text-blue-400"
                title="Download Manager (Alt+D)"
            >
                <Download size={18} />
            </button>
            <button
                onClick={toggleTheme}
                className="p-2 rounded-full hover:bg-teal-500/20 transition-all"
                aria-label="Toggle Theme"
                title="Toggle Theme"
            >
                {isDarkMode ? <Moon size={18} className="text-blue-400" /> : <Sun size={18} className="text-yellow-400" />}
            </button>
            <button
                onClick={() => setIsPredictiveTextEnabled?.(!isPredictiveTextEnabled)}
                className={`p-2 rounded-full transition-all ${isPredictiveTextEnabled ? 'bg-purple-600 text-white' : 'hover:bg-teal-500/20 text-gray-400 hover:text-purple-400'}`}
                title={isPredictiveTextEnabled ? "Disable Predictive Text" : "Enable Predictive Text"}
            >
                <BrainCircuit size={18} />
            </button>
            <button
                onClick={deleteSelectedConversations}
                className={`p-2 rounded-full hover:bg-teal-500/20 transition-all ${(selectedFiles?.size > 0 || selectedConvos?.size > 0) ? 'text-red-400' : 'text-gray-400'}`}
                title="Delete selected items"
            >
                <Trash size={18} />
            </button>
            <button
                onClick={() => { if ((window as any).api?.openNewWindow) (window as any).api.openNewWindow(currentPath); else window.open(window.location.href, '_blank'); }}
                className="p-2 rounded-full hover:bg-teal-500/20 text-gray-400 hover:text-white transition-all"
                title="New Incognide Window (Alt+N)"
            >
                <img src={npcLogo} alt="Incognide" style={{ width: 18, height: 18 }} className="rounded-full" />
            </button>
        </div>
        )}

    </div>


</>
);

};

export default Sidebar;
