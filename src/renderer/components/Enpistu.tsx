 import React, { useState, useEffect, useRef, useMemo, memo, useCallback } from 'react';
import { BACKEND_URL } from '../config';
import { createPortal } from 'react-dom';
import {
    Folder, File as FileIcon,  Globe, ChevronRight, ChevronLeft, Settings, Edit,
    Terminal, Image, Music, Trash, Users, Plus, ArrowUp, Camera, MessageSquare,
    ListFilter, ArrowDown,X, Wrench, FileText, Code2, FileJson, Paperclip,
    Send, BarChart3,Minimize2,  Maximize2, MessageCircle, BrainCircuit, Star, Origami, ChevronDown, ChevronUp,
    Clock, FolderTree, Search, HardDrive, Brain, GitBranch, Activity, Tag, Sparkles, Code, BookOpen, User,
    RefreshCw, RotateCcw, Check, KeyRound, Bot, Zap, HelpCircle, AlertCircle
} from 'lucide-react';

import { Icon } from 'lucide-react';
import { avocado } from '@lucide/lab';
import Sidebar from './Sidebar';
import StatusBar from './StatusBar';
import CsvViewer from './CsvViewer';
import DocxViewer from './DocxViewer';
import MacroInput from './MacroInput';
import SettingsMenu from './SettingsMenu';
import NPCTeamMenu from './NPCTeamMenu';
import PhotoViewer from './PhotoViewer';
import JinxMenu from './JinxMenu';
import '../../index.css';
import CtxEditor from './CtxEditor';
import TeamManagement from './TeamManagement';
import MarkdownRenderer from './MarkdownRenderer';
import DataDash from './DataDash';
import CodeEditor from './CodeEditor';
import TerminalView from './Terminal';
import PdfViewer, { loadPdfHighlightsForActivePane } from './PdfViewer';
import WebBrowserViewer from './WebBrowserViewer';
import BrowserUrlDialog from './BrowserUrlDialog';
import PptxViewer from './PptxViewer';
import LatexViewer from './LatexViewer';
import NotebookViewer from './NotebookViewer';
import ExpViewer from './ExpViewer';
import PicViewer from './PicViewer';
import MindMapViewer from './MindMapViewer';
import ZipViewer from './ZipViewer';
import Scherzo from './Scherzo';
import DiskUsageAnalyzer from './DiskUsageAnalyzer';
import ProjectEnvEditor from './ProjectEnvEditor';
import DBTool from './DBTool';
import LibraryViewer from './LibraryViewer';
import HelpViewer from './HelpViewer';
import FolderViewer from './FolderViewer';
import PathSwitcher from './PathSwitcher';
import CronDaemonPanel from './CronDaemonPanel';
import MemoryManager from './MemoryManager';
import SearchPane from './SearchPane';
import DownloadManager, { getActiveDownloadsCount, setDownloadToastCallback } from './DownloadManager';
import { LiveProvider, LivePreview, LiveError } from 'react-live';
// Components for tile jinx runtime rendering
import GraphViewer from './GraphViewer';
import BrowserHistoryWeb from './BrowserHistoryWeb';
import KnowledgeGraphEditor from './KnowledgeGraphEditor';
import McpServerMenu from './McpServerMenu';
import MemoryManagement from './MemoryManagement';
import MessageLabeling from './MessageLabeling';
import LabeledDataManager from './LabeledDataManager';
import ActivityIntelligence from './ActivityIntelligence';
import PythonEnvSettings from './PythonEnvSettings';
import AutosizeTextarea from './AutosizeTextarea';
import ForceGraph2D from 'react-force-graph-2d';
import { Pie, Bar, Line } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, PointElement, LineElement } from 'chart.js';
import { Modal, Tabs, Card, Button, Input, Select, createWindowApiDatabaseClient, QueryChart, ImageEditor, WidgetBuilder, WidgetGrid, Widget, DataTable, Lightbox, ImageGrid, StarRating, RangeSlider, SortableList } from 'npcts';

// Register chart.js components for jinx runtime
ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, PointElement, LineElement);
import * as LucideIcons from 'lucide-react';
import { useActivityTracker } from './ActivityTracker';
import {
    serializeWorkspace,
    saveWorkspaceToStorage,
    loadWorkspaceFromStorage,
    deserializeWorkspace,
    createDefaultWorkspace
} from './workspaces';
import {
    generateId,
    normalizePath,
    getFileIcon,
    convertFileToBase64,
    useLoadWebsiteHistory,
    handleBrowserCopyText,
    handleBrowserAddToChat,
    handleBrowserAiAction,
    loadAvailableNPCs,
    hashContext,
    gatherWorkspaceContext,
    useSwitchToPath,
    useDebounce,
    useAIEditModalStreamHandlers,
    handleMemoryDecision,
    handleBatchMemoryProcess,
    toggleTheme,
    loadDefaultPath,
    fetchModels,
    loadConversations,
    loadDirectoryStructure as loadDirectoryStructureUtil,
    goUpDirectory,
    usePaneAwareStreamListeners,
    useTrackLastActiveChatPane,
    handleRenameFile,
    getThumbnailIcon,
    createToggleMessageSelectionMode,
    findNodeByPath,
    findNodePath,
    stripSourcePrefix
} from './utils';
import { BranchingUI, createBranchPoint } from './BranchingUI';
import BranchOptionsModal, { BranchOptions } from './BranchOptionsModal';
import BranchVisualizer from './BranchVisualizer';
import { syncLayoutWithContentData, addPaneToLayout, collectPaneIds } from './LayoutNode';
// Note: Sidebar.tsx, ChatViewer.tsx are code fragments, not proper modules yet
import PaneHeader from './PaneHeader';
import { LayoutNode } from './LayoutNode';
import ConversationList from './ConversationList';
import { ChatMessage } from './ChatMessage';
import BroadcastResponseRow from './BroadcastResponseRow';
import { PredictiveTextOverlay } from './PredictiveTextOverlay';
import { usePredictiveText } from './PredictiveText';
import { CommandPalette } from './CommandPalette';
import { MessageLabelStorage, MessageLabel, ConversationLabel, ConversationLabelStorage, ContextFile, ContextFileStorage } from './MessageLabeling';
import ConversationLabeling from './ConversationLabeling';
import ContextFilesPanel from './ContextFilesPanel';
import DataLabeler from './DataLabeler';
import ChatInput from './ChatInput';
import { StudioContext, executeStudioAction } from '../studioActions';

// Stable TileJinxContent component - defined at module level to prevent state loss on parent re-renders
const TileJinxContentExternal: React.FC<{
    jinxFile: string;
    tileJinxScope: Record<string, any>;
    currentPath: string;
}> = React.memo(({ jinxFile, tileJinxScope, currentPath }) => {
    const [Component, setComponent] = useState<React.ComponentType<any> | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadCompiledComponent = async () => {
            if (!jinxFile) {
                setError('No jinx file specified');
                setLoading(false);
                return;
            }
            try {
                // Load pre-compiled code from cache
                const result = await (window as any).api?.tileJinxCompiled?.(jinxFile);
                if (!result?.success || !result.compiled) {
                    setError(result?.error || `Failed to load compiled ${jinxFile}`);
                    setLoading(false);
                    return;
                }

                // Execute the compiled code with scope
                const scopeKeys = Object.keys(tileJinxScope);
                const scopeValues = Object.values(tileJinxScope);

                // Create function that returns the component
                const fn = new Function(...scopeKeys, `
                    ${result.compiled}
                    return __component;
                `);

                const LoadedComponent = fn(...scopeValues);
                if (LoadedComponent) {
                    setComponent(() => LoadedComponent);
                } else {
                    setError('Component not found in compiled code');
                }
            } catch (err: any) {
                console.error('Failed to load tile jinx:', err);
                setError(err.message);
            }
            setLoading(false);
        };
        loadCompiledComponent();
    }, [jinxFile, tileJinxScope]);

    if (loading) {
        return (
            <div className="flex-1 flex items-center justify-center theme-bg-primary">
                <div className="text-gray-400">Loading {jinxFile}...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex-1 p-4 theme-bg-primary">
                <div className="text-red-400 font-mono text-sm bg-red-900/30 p-4 rounded">
                    Error loading {jinxFile}: {error}
                </div>
            </div>
        );
    }

    if (!Component) {
        return (
            <div className="flex-1 p-4 theme-bg-primary">
                <div className="text-yellow-400">No component found</div>
            </div>
        );
    }

    // Render the loaded component with props
    return (
        <div className="flex-1 overflow-auto theme-bg-primary">
            <Component
                onClose={() => console.log('Tile closed')}
                isPane={true}
                isOpen={true}
                isModal={false}
                embedded={true}
                projectPath={currentPath}
                currentPath={currentPath}
            />
        </div>
    );
});

// Web search providers (privacy-focused options)
type WebSearchProvider = 'duckduckgo' | 'startpage' | 'ecosia' | 'brave' | 'wikipedia' | 'perplexity' | 'google' | 'sibiji';
const WEB_SEARCH_PROVIDERS: Record<WebSearchProvider, { name: string; url: string }> = {
    duckduckgo: { name: 'DDG', url: 'https://duckduckgo.com/?q=' },
    startpage: { name: 'Startpage', url: 'https://www.startpage.com/sp/search?query=' },
    ecosia: { name: 'Ecosia', url: 'https://www.ecosia.org/search?q=' },
    brave: { name: 'Brave', url: 'https://search.brave.com/search?q=' },
    wikipedia: { name: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Special:Search?search=' },
    perplexity: { name: 'Perplexity', url: 'https://www.perplexity.ai/search?q=' },
    google: { name: 'Google', url: 'https://www.google.com/search?q=' },
    sibiji: { name: 'Sibiji', url: 'https://sibiji.com/search?q=' },
};

const ChatInterface = () => {
    const [gitPanelCollapsed, setGitPanelCollapsed] = useState(true);
    const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
    const [pdfHighlightsTrigger, setPdfHighlightsTrigger] = useState(0);
    const [conversationBranches, setConversationBranches] = useState(new Map());
    const [currentBranchId, setCurrentBranchId] = useState('main');
    const [showBranchingUI, setShowBranchingUI] = useState(false);
    const [showBranchVisualizer, setShowBranchVisualizer] = useState(false);
    const [branchOptionsModal, setBranchOptionsModal] = useState<{
        isOpen: boolean;
        messageIndex: number;
        messageContent: string;
    }>({ isOpen: false, messageIndex: -1, messageContent: '' });
    const [isPredictiveTextEnabled, setIsPredictiveTextEnabled] = useState(false);
    const [predictiveTextModel, setPredictiveTextModel] = useState<string | null>(null);
    const [predictiveTextProvider, setPredictiveTextProvider] = useState<string | null>(null);
    const [predictionSuggestion, setPredictionSuggestion] = useState('');
    const [predictionTargetElement, setPredictionTargetElement] = useState<HTMLElement | null>(null);

    // Activity tracking for RNN predictions
    const { trackActivity } = useActivityTracker();

    const [isEditingPath, setIsEditingPath] = useState(false);
    const [editedPath, setEditedPath] = useState('');
    const [isHovering, setIsHovering] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [downloadManagerOpen, setDownloadManagerOpen] = useState(false);
    const [downloadToast, setDownloadToast] = useState<{message: string; filename: string} | null>(null);
    const [updateAvailable, setUpdateAvailable] = useState<{latestVersion: string; releaseUrl: string} | null>(null);
    const [appVersion, setAppVersion] = useState<string>('');
    const [projectEnvEditorOpen, setProjectEnvEditorOpen] = useState(false);
    const [photoViewerOpen, setPhotoViewerOpen] = useState(false);
    const [photoViewerType, setPhotoViewerType] = useState('images');
    const [libraryViewerOpen, setLibraryViewerOpen] = useState(false);
    const [selectedConvos, setSelectedConvos] = useState(new Set());
    const [lastClickedIndex, setLastClickedIndex] = useState(null);
    const [contextMenuPos, setContextMenuPos] = useState(null);

    const [selectedFiles, setSelectedFiles] = useState(new Set());
    const [lastClickedFileIndex, setLastClickedFileIndex] = useState(null);
    const [fileContextMenuPos, setFileContextMenuPos] = useState(null);
    const [currentPath, setCurrentPath] = useState('');
    const [folderStructure, setFolderStructure] = useState({});
    const [activeConversationId, setActiveConversationId] = useState(null);

    const [currentModel, setCurrentModel] = useState(() => {
        const saved = localStorage.getItem('npcStudioCurrentModel');
        return saved ? JSON.parse(saved) : null;
    });
    const [currentProvider, setCurrentProvider] = useState(() => {
        const saved = localStorage.getItem('npcStudioCurrentProvider');
        return saved ? JSON.parse(saved) : null;
    });
    const [currentNPC, setCurrentNPC] = useState(() => {
        const saved = localStorage.getItem('npcStudioCurrentNPC');
        return saved ? JSON.parse(saved) : null;
    });
    // Multi-select for broadcast - initialize with current model/npc if available
    const [selectedModels, setSelectedModels] = useState<string[]>(() => {
        const saved = localStorage.getItem('npcStudioCurrentModel');
        const model = saved ? JSON.parse(saved) : null;
        return model ? [model] : [];
    });
    const [selectedNPCs, setSelectedNPCs] = useState<string[]>(() => {
        const saved = localStorage.getItem('npcStudioCurrentNPC');
        const npc = saved ? JSON.parse(saved) : null;
        return npc ? [npc] : [];
    });
    // Broadcast mode toggle - when OFF, selecting replaces; when ON, selecting adds
    const [broadcastMode, setBroadcastMode] = useState(false);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [config, setConfig] = useState(null);
    const [currentConversation, setCurrentConversation] = useState(null);
    const [npcTeamMenuOpen, setNpcTeamMenuOpen] = useState(false);
    const [jinxMenuOpen, setJinxMenuOpen] = useState(false);
    const [teamManagementOpen, setTeamManagementOpen] = useState(false);
    const [uploadedFiles, setUploadedFiles] = useState([]);
    const [imagePreview, setImagePreview] = useState(null);
    const activeConversationRef = useRef(null);
    const [availableModels, setAvailableModels] = useState([]);
    const [modelsLoading, setModelsLoading] = useState(false);
    const [modelsError, setModelsError] = useState(null);
    const [ollamaToolModels, setOllamaToolModels] = useState(new Set());
    const [currentFile, setCurrentFile] = useState(null);
    const [fileContent, setFileContent] = useState('');
    const [isEditing, setIsEditing] = useState(false);
    const [fileChanged, setFileChanged] = useState(false);
    const [isDarkMode, setIsDarkMode] = useState(true);
    const [isMacroInputOpen, setIsMacroInputOpen] = useState(false);
    const [macroText, setMacroText] = useState('');
    const [baseDir, setBaseDir] = useState('');
    const [promptModal, setPromptModal] = useState<{ isOpen: boolean; title: string; message: string; defaultValue: string; onConfirm: ((value: string) => void) | null }>({ isOpen: false, title: '', message: '', defaultValue: '', onConfirm: null });
    const [promptModalValue, setPromptModalValue] = useState('');
    const [initModal, setInitModal] = useState<{ isOpen: boolean; loading: boolean; npcs: any[]; jinxs: any[]; tab: 'npcs' | 'jinxs'; initializing: boolean }>({
        isOpen: false, loading: false, npcs: [], jinxs: [], tab: 'npcs', initializing: false
    });
    const screenshotHandlingRef = useRef(false);
    const fileInputRef = useRef(null);
    const listenersAttached = useRef(false);
    const initialLoadComplete = useRef(false);
    const [directoryConversations, setDirectoryConversations] = useState([]);
    const [isStreaming, setIsStreaming] = useState(false);
    const streamIdRef = useRef(null);
    const [dashboardMenuOpen, setDashboardMenuOpen] = useState(false);
    const [analysisContext, setAnalysisContext] = useState(null); 
    const [renamingPaneId, setRenamingPaneId] = useState(null);
    const [editedFileName, setEditedFileName] = useState('');
    const [sidebarItemContextMenuPos, setSidebarItemContextMenuPos] = useState(null);

    const [pdfContextMenuPos, setPdfContextMenuPos] = useState(null);
    const [selectedPdfText, setSelectedPdfText] = useState(null);
    const [pdfHighlights, setPdfHighlights] = useState([]);
    const [browserUrlDialogOpen, setBrowserUrlDialogOpen] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    
    const [pendingMemories, setPendingMemories] = useState([]);
    const [memoryApprovalModal, setMemoryApprovalModal] = useState({
        isOpen: false,
        memories: []
    });    
    const [gitStatus, setGitStatus] = useState(null);
    const [gitCommitMessage, setGitCommitMessage] = useState('');
    const [gitLoading, setGitLoading] = useState(false);
    const [gitError, setGitError] = useState(null);
    const [noUpstreamPrompt, setNoUpstreamPrompt] = useState<{ branch: string; command: string } | null>(null);

    const [websiteHistory, setWebsiteHistory] = useState([]);
    const [commonSites, setCommonSites] = useState([]);
    const [openBrowsers, setOpenBrowsers] = useState([]);
    const [websitesCollapsed, setWebsitesCollapsed] = useState(() => {
        const saved = localStorage.getItem('sidebarWebsitesCollapsed');
        return saved !== null ? JSON.parse(saved) : false;
    });
    const [paneContextMenu, setPaneContextMenu] = useState(null);
    const [isInputMinimized, setIsInputMinimized] = useState(false);
    const [showDateTime, setShowDateTime] = useState(() => {
        const saved = localStorage.getItem('npcStudioShowDateTime');
        return saved !== null ? JSON.parse(saved) : false;
    });
    const [currentTime, setCurrentTime] = useState(new Date());
    const [showCronDaemonPanel, setShowCronDaemonPanel] = useState(false);
    const [showMemoryManager, setShowMemoryManager] = useState(false);
    const [pendingMemoryCount, setPendingMemoryCount] = useState(0);
    const [kgGeneration, setKgGeneration] = useState<number | null>(null);
    const [gitModalOpen, setGitModalOpen] = useState(false);
    const [gitModalTab, setGitModalTab] = useState<'status' | 'diff' | 'branches' | 'history'>('status');
    const [gitDiffContent, setGitDiffContent] = useState<{ staged: string; unstaged: string } | null>(null);
    const [gitBranches, setGitBranches] = useState<{ current: string; branches: string[]; local: any } | null>(null);
    const [gitCommitHistory, setGitCommitHistory] = useState<any[]>([]);
    const [gitSelectedFile, setGitSelectedFile] = useState<string | null>(null);
    const [gitNewBranchName, setGitNewBranchName] = useState('');
    const [gitSelectedCommit, setGitSelectedCommit] = useState<any | null>(null);
    const [gitFileDiff, setGitFileDiff] = useState<string | null>(null);
    const [workspaceModalOpen, setWorkspaceModalOpen] = useState(false);
    const [searchResultsModalOpen, setSearchResultsModalOpen] = useState(false);
    const [graphViewerOpen, setGraphViewerOpen] = useState(false);
    const [dataLabelerOpen, setDataLabelerOpen] = useState(false);
    // Memory modal state
    const [memories, setMemories] = useState<any[]>([]);
    const [memoryLoading, setMemoryLoading] = useState(false);
    const [memoryFilter, setMemoryFilter] = useState('all');
    const [memorySearchTerm, setMemorySearchTerm] = useState('');
    const [sidebarWidth, setSidebarWidth] = useState(220); // Compact but usable width
    const [inputHeight, setInputHeight] = useState(200); // Default height in pixels
    const [isResizingSidebar, setIsResizingSidebar] = useState(false);
    const [isResizingInput, setIsResizingInput] = useState(false);
    // Bar heights - resizable and persisted
    const [topBarHeight, setTopBarHeight] = useState<number>(() => {
        const saved = localStorage.getItem('npcStudio_topBarHeight');
        return saved ? parseInt(saved) : 48;
    });
    const [bottomBarHeight, setBottomBarHeight] = useState<number>(() => {
        const saved = localStorage.getItem('npcStudio_bottomBarHeight');
        return saved ? parseInt(saved) : 48;
    });
    const [isResizingTopBar, setIsResizingTopBar] = useState(false);
    const [isResizingBottomBar, setIsResizingBottomBar] = useState(false);
    const [topBarCollapsed, setTopBarCollapsed] = useState<boolean>(() => {
        const saved = localStorage.getItem('npcStudio_topBarCollapsed');
        return saved === 'true';
    });
    const WINDOW_WORKSPACES_KEY = 'npcStudioWindowWorkspaces';

    // Message labeling state
    const [labelingModal, setLabelingModal] = useState<{ isOpen: boolean; message: any | null }>({ isOpen: false, message: null });
    const [messageLabels, setMessageLabels] = useState<{ [key: string]: MessageLabel }>(() => {
        // Load existing labels from storage on mount
        const allLabels = MessageLabelStorage.getAll();
        const labelsMap: { [key: string]: MessageLabel } = {};
        allLabels.forEach(label => {
            labelsMap[label.messageId] = label;
        });
        return labelsMap;
    });

    // Branch/run navigation state - tracks which run is active for each cellId
    const [activeRuns, setActiveRuns] = useState<{ [cellId: string]: number }>({});

    // Expanded branch path per pane - when set, shows that branch as the main view
    // Key is paneId, value is array of message IDs representing the path to follow
    const [expandedBranchPath, setExpandedBranchPath] = useState<{ [paneId: string]: string[] }>({});

    // Selected branches for multi-branch broadcasting
    // Key is paneId, value is a Map of messageId -> message object for all selected branches
    const [selectedBranches, setSelectedBranches] = useState<{ [paneId: string]: Map<string, any> }>({});
    const selectedBranchesRef = useRef(selectedBranches);
    selectedBranchesRef.current = selectedBranches; // Always keep ref in sync

    // Debug: log whenever selectedBranches changes
    useEffect(() => {
        console.log('[STATE] selectedBranches updated:', Object.keys(selectedBranches).map(k => `${k}: ${selectedBranches[k]?.size || 0} items`));
    }, [selectedBranches]);

    // Conversation labeling state
    const [conversationLabelingModal, setConversationLabelingModal] = useState<{ isOpen: boolean; conversation: any | null }>({ isOpen: false, conversation: null });
    const [conversationLabels, setConversationLabels] = useState<{ [key: string]: ConversationLabel }>(() => {
        const allLabels = ConversationLabelStorage.getAll();
        const labelsMap: { [key: string]: ConversationLabel } = {};
        allLabels.forEach(label => {
            labelsMap[label.conversationId] = label;
        });
        return labelsMap;
    });

    // Context files state
    const [contextFiles, setContextFiles] = useState<ContextFile[]>(() => ContextFileStorage.getAll());
    const [contextFilesCollapsed, setContextFilesCollapsed] = useState(true);



    const [localSearch, setLocalSearch] = useState({
        isActive: false,
        term: '',
        paneId: null,
        results: [],
        currentIndex: -1
    });
    const [windowId] = useState(() => {
        let id = sessionStorage.getItem('npcStudioWindowId');        
        if (!id) {
            id = `window_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            sessionStorage.setItem('npcStudioWindowId', id);
        }
        console.log('[WINDOW_ID] Using window ID:', id);
        return id;
    });




    const [workspaces, setWorkspaces] = useState(new Map());
    const [isLoadingWorkspace, setIsLoadingWorkspace] = useState(false);


    const WORKSPACES_STORAGE_KEY = 'npcStudioWorkspaces_v2'; // Per-path workspaces
    const ACTIVE_WINDOWS_KEY = 'npcStudioActiveWindows';

    const MAX_WORKSPACES = 50; // Limit stored workspaces
    
    const [renamingPath, setRenamingPath] = useState(null);
    const [editedSidebarItemName, setEditedSidebarItemName] = useState('');
    
    const [lastActiveChatPaneId, setLastActiveChatPaneId] = useState(null);    
    const [aiEditModal, setAiEditModal] = useState({
        isOpen: false,
        type: '',
        selectedText: '',
        selectionStart: 0,
        selectionEnd: 0,
        aiResponse: '',
        aiResponseDiff: [],
        showDiff: false,
        isLoading: false,
        streamId: null,
        modelForEdit: null,
        npcForEdit: null,
        customEditPrompt: ''
    });    
 
    const [availableNPCs, setAvailableNPCs] = useState([]);
    const [npcsLoading, setNpcsLoading] = useState(false);
    const [npcsError, setNpcsError] = useState(null);

    // Sync currentNPC to selectedNPCs
    useEffect(() => {
        if (currentNPC && availableNPCs.length > 0) {
            setSelectedNPCs(prev => {
                if (prev.includes(currentNPC)) return prev;
                return [...prev, currentNPC];
            });
        }
    }, [currentNPC, availableNPCs]);

    // Sync workspace path to main process for downloads
    useEffect(() => {
        if (currentPath) {
            (window as any).api?.setWorkspacePath?.(currentPath);
        }
    }, [currentPath]);

    // Set up download toast callback
    useEffect(() => {
        setDownloadToastCallback((message, filename) => {
            setDownloadToast({ message, filename });
            // Auto-dismiss after 4 seconds
            setTimeout(() => setDownloadToast(null), 4000);
        });
    }, []);

    // Get app version and check for updates on load
    useEffect(() => {
        const init = async () => {
            try {
                // Get current version
                const version = await (window as any).api?.getAppVersion?.();
                if (version) setAppVersion(version);

                // Check for updates
                const result = await (window as any).api?.checkForUpdates?.();
                if (result?.success) {
                    if (result.hasUpdate) {
                        setUpdateAvailable({
                            latestVersion: result.latestVersion,
                            releaseUrl: result.releaseUrl
                        });
                    }
                    if (!version && result.currentVersion) {
                        setAppVersion(result.currentVersion);
                    }
                }
            } catch (err) {
                console.error('Failed to check for updates:', err);
            }
        };
        // Check after a short delay to not block initial load
        const timer = setTimeout(init, 3000);
        return () => clearTimeout(timer);
    }, []);

    // Function to manually check for updates
    const checkForUpdates = async () => {
        try {
            const result = await (window as any).api?.checkForUpdates?.();
            if (result?.success) {
                if (result.hasUpdate) {
                    setUpdateAvailable({
                        latestVersion: result.latestVersion,
                        releaseUrl: result.releaseUrl
                    });
                } else {
                    setUpdateAvailable(null);
                }
            }
        } catch (err) {
            console.error('Failed to check for updates:', err);
        }
    };

    const [displayedMessageCount, setDisplayedMessageCount] = useState(10);
    const [loadingMoreMessages, setLoadingMoreMessages] = useState(false);
    const streamToPaneRef = useRef({});

    const [selectedMessages, setSelectedMessages] = useState(new Set());
    const [messageSelectionMode, setMessageSelectionMode] = useState(false);
    const toggleMessageSelectionMode = createToggleMessageSelectionMode(setMessageSelectionMode, setSelectedMessages);
    const [messageContextMenuPos, setMessageContextMenuPos] = useState(null);
    const [messageOperationModal, setMessageOperationModal] = useState({
        isOpen: false,
        type: '',
        title: '',
        defaultPrompt: '',
        onConfirm: null
    });
    const [resendModal, setResendModal] = useState({
        isOpen: false,
        message: null,
        selectedModel: '',
        selectedNPC: ''
    });
    const [mcpServerPath, setMcpServerPath] = useState('~/.npcsh/npc_team/mcp_server.py');
    const [selectedMcpTools, setSelectedMcpTools] = useState([]);
    const [availableMcpTools, setAvailableMcpTools] = useState([]);
    const [mcpToolsLoading, setMcpToolsLoading] = useState(false);
    const [mcpToolsError, setMcpToolsError] = useState(null);
    const [availableMcpServers, setAvailableMcpServers] = useState([]);
    const [showMcpServersDropdown, setShowMcpServersDropdown] = useState(false);
    const [browserContextMenu, setBrowserContextMenu] = useState({
        isOpen: false,
        x: 0,
        y: 0,
        selectedText: '',
        viewId: null,
    });
    
    const [expandedFolders, setExpandedFolders] = useState(new Set());

    const [browserContextMenuPos, setBrowserContextMenuPos] = useState(null);


        
    const [workspaceIndicatorExpanded, setWorkspaceIndicatorExpanded] = useState(false);


    const [ctxEditorOpen, setCtxEditorOpen] = useState(false);

   
    const [filesCollapsed, setFilesCollapsed] = useState(() => {
        const saved = localStorage.getItem('sidebarFilesCollapsed');
        return saved !== null ? JSON.parse(saved) : true;
    });
    const [conversationsCollapsed, setConversationsCollapsed] = useState(() => {
        const saved = localStorage.getItem('sidebarConversationsCollapsed');
        return saved !== null ? JSON.parse(saved) : true;
    });
    // Sidebar section order: array of section IDs in display order
    const [sidebarSectionOrder, setSidebarSectionOrder] = useState<string[]>(() => {
        const saved = localStorage.getItem('sidebarSectionOrder');
        if (saved !== null) {
            const parsed = JSON.parse(saved);
            // Ensure 'git' is in the order if it's missing (backwards compat)
            if (!parsed.includes('git')) {
                parsed.push('git');
            }
            return parsed;
        }
        return ['websites', 'files', 'conversations', 'git'];
    });
    const chatContainerRef = useRef(null);

    const [searchTerm, setSearchTerm] = useState('');
    const [webSearchTerm, setWebSearchTerm] = useState('');
    const [webSearchProvider, setWebSearchProvider] = useState<WebSearchProvider>(() => {
        return (localStorage.getItem('web-search-provider') as WebSearchProvider) || 'duckduckgo';
    });
    const [isSearching, setIsSearching] = useState(false);
    const [isGlobalSearch, setIsGlobalSearch] = useState(false);
    const [searchLoading, setSearchLoading] = useState(false);
    const [deepSearchResults, setDeepSearchResults] = useState([]);
    const [messageSearchResults, setMessageSearchResults] = useState([]);
    const [activeSearchResult, setActiveSearchResult] = useState(null);
    const searchInputRef = useRef(null);
   
    const [rootLayoutNode, setRootLayoutNode] = useState(null);
   
    const [activeContentPaneId, setActiveContentPaneId] = useState(null);

    
    const LAST_ACTIVE_PATH_KEY = 'npcStudioLastPath';
    const LAST_ACTIVE_CONVO_ID_KEY = 'npcStudioLastConvoId';

    const [isInputExpanded, setIsInputExpanded] = useState(false);
    const [executionMode, setExecutionMode] = useState(() => {
        const saved = localStorage.getItem('npcStudioExecutionMode');
        return saved ? JSON.parse(saved) : 'chat';
    });
    const [favoriteModels, setFavoriteModels] = useState<Set<string>>(() => {
        const saved = localStorage.getItem('npcStudioFavoriteModels');
        return saved ? new Set(JSON.parse(saved)) : new Set();
    });
    const [showAllModels, setShowAllModels] = useState(true); // Change default to true


    const [availableJinxs, setAvailableJinxs] = useState([]); // [{name, description, path, origin, group}]
    const [favoriteJinxs, setFavoriteJinxs] = useState(new Set());
    const [showAllJinxs, setShowAllJinxs] = useState(false);
    const [showJinxDropdown, setShowJinxDropdown] = useState(false);

    const [contextHash, setContextHash] = useState('');

    const [selectedJinx, setSelectedJinx] = useState(null);
    const [jinxLoadingError, setJinxLoadingError] = useState(null); // This already exists
    
    const [jinxInputValues, setJinxInputValues] = useState({}); // Stores { jinxName: { inputName: value, ... }, ... }

   
    const [jinxInputs, setJinxInputs] = useState({});

    const [draggedItem, setDraggedItem] = useState(null);
    const [dropTarget, setDropTarget] = useState(null);
   
    const contentDataRef = useRef({});
    const currentPathRef = useRef(currentPath);
    currentPathRef.current = currentPath;
    const activeContentPaneIdRef = useRef(activeContentPaneId);
    activeContentPaneIdRef.current = activeContentPaneId;
    const [editorContextMenuPos, setEditorContextMenuPos] = useState(null);
    const rootLayoutNodeRef = useRef(rootLayoutNode);
    const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);

    // Zen mode state - when set to a paneId, that pane renders full-screen
    const [zenModePaneId, setZenModePaneId] = useState<string | null>(null);

    // Global keyboard shortcuts (must be after activeContentPaneId and contentDataRef are defined)
    useEffect(() => {
        const handleGlobalKeyDown = (e: KeyboardEvent) => {
            // Ctrl+R = refresh browser page (when active pane is browser), or reverse search in terminal
            if (e.ctrlKey && !e.shiftKey && e.key === 'r') {
                const activePane = contentDataRef.current[activeContentPaneId];
                if (activePane?.contentType === 'browser') {
                    e.preventDefault();
                    e.stopPropagation();
                    // Find webview in the active pane
                    const activePaneEl = document.querySelector(`[data-pane-id="${activeContentPaneId}"]`);
                    const webview = activePaneEl?.querySelector('webview') as any;
                    if (webview?.reload) {
                        webview.reload();
                    }
                    return;
                }
                // For terminal panes, let Ctrl+R pass through for reverse search (bash/zsh)
                if (activePane?.contentType === 'terminal') {
                    // Don't prevent default - let it reach the terminal
                    return;
                }
                // For non-browser/non-terminal panes, prevent default to avoid Electron refresh
                e.preventDefault();
            }
            // Ctrl+Shift+R = hard refresh browser or refresh Electron window
            if (e.ctrlKey && e.shiftKey && e.key === 'R') {
                const activePane = contentDataRef.current[activeContentPaneId];
                if (activePane?.contentType === 'browser') {
                    e.preventDefault();
                    e.stopPropagation();
                    // Find webview in the active pane and hard reload it
                    const activePaneEl = document.querySelector(`[data-pane-id="${activeContentPaneId}"]`);
                    const webview = activePaneEl?.querySelector('webview') as any;
                    if (webview?.reloadIgnoringCache) {
                        webview.reloadIgnoringCache();
                    }
                    return;
                }
                // For non-browser panes, refresh Electron window
                e.preventDefault();
                e.stopPropagation();
                window.location.reload();
            }
            // Ctrl+J = open download manager
            if (e.ctrlKey && !e.shiftKey && e.key === 'j') {
                e.preventDefault();
                e.stopPropagation();
                setDownloadManagerOpen(prev => !prev);
            }
        };

        document.addEventListener('keydown', handleGlobalKeyDown, true); // Use capture phase
        return () => document.removeEventListener('keydown', handleGlobalKeyDown, true);
    }, [activeContentPaneId]);

    // Resize handlers for sidebar and input area
    const handleSidebarResize = useCallback((e) => {
        if (!isResizingSidebar) return;
        const newWidth = e.clientX;
        // Constrain between 150px and 500px
        if (newWidth >= 150 && newWidth <= 500) {
            setSidebarWidth(newWidth);
        }
    }, [isResizingSidebar]);

    const handleInputResize = useCallback((e) => {
        if (!isResizingInput) return;
        const newHeight = window.innerHeight - e.clientY;
        // Constrain between 100px and 600px
        if (newHeight >= 100 && newHeight <= 600) {
            setInputHeight(newHeight);
        }
    }, [isResizingInput]);

    // Website history loader hook
    const loadWebsiteHistory = useLoadWebsiteHistory(currentPath, setWebsiteHistory, setCommonSites);

    // Predictive text hook
    usePredictiveText({
        isPredictiveTextEnabled,
        predictiveTextModel,
        predictiveTextProvider,
        currentPath,
        predictionSuggestion,
        setPredictionSuggestion,
        predictionTargetElement,
        setPredictionTargetElement,
    });

    useEffect(() => {
        rootLayoutNodeRef.current = rootLayoutNode;
    }, [rootLayoutNode]);

    // Listen for CLI workspace open command (incognide /path/to/folder)
    useEffect(() => {
        const api = window as any;
        if (!api.api?.onCliOpenWorkspace) return;

        const unsubscribe = api.api.onCliOpenWorkspace((data: { folder: string }) => {
            if (data?.folder) {
                console.log('[CLI] Opening workspace from CLI:', data.folder);
                setCurrentPath(data.folder);
            }
        });

        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, []);

    // Listen for Ctrl+Shift+O folder picker shortcut
    useEffect(() => {
        const api = window as any;
        if (!api.api?.onOpenFolderPicker) return;

        const unsubscribe = api.api.onOpenFolderPicker(async () => {
            console.log('[SHORTCUT] Opening folder picker (Ctrl+Shift+O)');
            const selectedPath = await api.api.open_directory_picker();
            if (selectedPath) {
                console.log('[SHORTCUT] Selected folder:', selectedPath);
                setCurrentPath(selectedPath);
            }
        });

        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, []);

    // Listen for external URL open requests (from xdg-open, gcloud auth, etc.)
    useEffect(() => {
        const api = window as any;
        if (!api.api?.onOpenUrlInBrowser) return;

        const unsubscribe = api.api.onOpenUrlInBrowser((data: { url: string }) => {
            if (data?.url) {
                console.log('[EXTERNAL] Opening URL in browser pane:', data.url);
                // Create a new browser pane with the URL
                const newPaneId = generateId();
                const newBrowserId = `browser_${Date.now()}`;
                contentDataRef.current[newPaneId] = {
                    contentType: 'browser',
                    contentId: newBrowserId,
                    browserUrl: data.url
                };
                setRootLayoutNode(oldRoot => addPaneToLayout(oldRoot, newPaneId));
                setActiveContentPaneId(newPaneId);
            }
        });

        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, []);

    // Menu bar event handlers - use refs to access latest function versions
    useEffect(() => {
        const api = window as any;
        const cleanups: (() => void)[] = [];

        // File menu handlers
        if (api.api?.onMenuNewChat) {
            cleanups.push(api.api.onMenuNewChat(() => createNewConversationRef.current?.()));
        }
        if (api.api?.onMenuNewTerminal) {
            cleanups.push(api.api.onMenuNewTerminal(() => createNewTerminalRef.current?.()));
        }
        if (api.api?.onMenuOpenFile) {
            cleanups.push(api.api.onMenuOpenFile(async () => {
                const result = await api.api.open_directory_picker?.();
                if (result) {
                    // Open file in editor
                    const stats = await api.api.readDirectory?.(result);
                    if (stats && !stats.error) {
                        // It's a directory, switch to it
                        setCurrentPath(result);
                    }
                }
            }));
        }
        if (api.api?.onMenuSaveFile) {
            cleanups.push(api.api.onMenuSaveFile(() => {
                // Trigger save on active editor pane - use contentDataRef which is always current
                const activePaneId = activeContentPaneIdRef.current;
                const paneData = contentDataRef.current[activePaneId];
                if (paneData?.contentType === 'editor' && paneData.fileContent !== undefined) {
                    api.api.writeFileContent?.(paneData.contentId, paneData.fileContent);
                    paneData.fileChanged = false;
                    setRootLayoutNode(prev => ({ ...prev }));
                }
            }));
        }
        if (api.api?.onMenuCloseTab) {
            cleanups.push(api.api.onMenuCloseTab(() => {
                const activePaneId = activeContentPaneIdRef.current;
                if (activePaneId) {
                    closeContentPaneRef.current?.(activePaneId, []);
                }
            }));
        }
        if (api.api?.onMenuOpenSettings) {
            cleanups.push(api.api.onMenuOpenSettings(() => createSettingsPaneRef.current?.()));
        }

        // Edit menu handlers
        if (api.api?.onMenuFind) {
            cleanups.push(api.api.onMenuFind(() => {
                // Dispatch custom event for find - browser panes will listen for this
                const activePaneId = activeContentPaneIdRef.current;
                const paneData = contentDataRef.current[activePaneId];
                if (paneData?.contentType === 'browser') {
                    // Dispatch event with the pane ID so only the correct browser opens find
                    window.dispatchEvent(new CustomEvent('incognide-open-find-bar', {
                        detail: { paneId: activePaneId }
                    }));
                }
            }));
        }
        if (api.api?.onMenuGlobalSearch) {
            cleanups.push(api.api.onMenuGlobalSearch(() => {
                // Open search pane
                createSearchPaneRef.current?.('');
            }));
        }
        if (api.api?.onMenuCommandPalette) {
            cleanups.push(api.api.onMenuCommandPalette(() => {
                setCommandPaletteOpen(true);
            }));
        }

        // View menu handlers
        if (api.api?.onMenuToggleSidebar) {
            cleanups.push(api.api.onMenuToggleSidebar(() => {
                setSidebarCollapsed(prev => !prev);
            }));
        }

        // Window menu handlers
        if (api.api?.onMenuNewWindow) {
            cleanups.push(api.api.onMenuNewWindow(() => {
                api.api.openNewWindow?.(currentPathRef.current);
            }));
        }

        // Help menu handlers
        if (api.api?.onMenuOpenHelp) {
            cleanups.push(api.api.onMenuOpenHelp(() => createHelpPaneRef.current?.()));
        }
        if (api.api?.onMenuShowShortcuts) {
            cleanups.push(api.api.onMenuShowShortcuts(() => createHelpPaneRef.current?.()));
        }

        return () => {
            cleanups.forEach(cleanup => cleanup?.());
        };
    }, []);

    // Git functions
    const loadGitStatus = useCallback(async () => {
        if (!currentPath) return;
        try {
            const status = await (window as any).api.gitStatus(currentPath);
            setGitStatus(status);
        } catch (err) {
            console.error('Failed to load git status:', err);
            setGitStatus(null);
        }
    }, [currentPath]);

    const gitStageFile = async (file: string) => {
        setGitLoading(true);
        setGitError(null);
        try {
            await (window as any).api.gitStageFile(currentPath, file);
            await loadGitStatus();
        } catch (err: any) {
            setGitError(err.message || 'Failed to stage file');
        } finally {
            setGitLoading(false);
        }
    };

    const gitUnstageFile = async (file: string) => {
        setGitLoading(true);
        setGitError(null);
        try {
            await (window as any).api.gitUnstageFile(currentPath, file);
            await loadGitStatus();
        } catch (err: any) {
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
            await (window as any).api.gitCommit(currentPath, gitCommitMessage.trim());
            setGitCommitMessage('');
            await loadGitStatus();
        } catch (err: any) {
            setGitError(err.message || 'Failed to commit');
        } finally {
            setGitLoading(false);
        }
    };

    const gitPullChanges = async () => {
        setGitLoading(true);
        setGitError(null);
        try {
            await (window as any).api.gitPull(currentPath);
            await loadGitStatus();
        } catch (err: any) {
            setGitError(err.message || 'Failed to pull');
        } finally {
            setGitLoading(false);
        }
    };

    const gitPushChanges = async () => {
        setGitLoading(true);
        setGitError(null);
        setNoUpstreamPrompt(null);
        try {
            const result = await (window as any).api.gitPush(currentPath);
            if (!result.success) {
                if (result.noUpstream) {
                    setNoUpstreamPrompt({ branch: result.currentBranch, command: result.suggestedCommand });
                } else {
                    setGitError(result.error || 'Failed to push');
                }
            } else {
                await loadGitStatus();
            }
        } catch (err: any) {
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
            const result = await (window as any).api.gitPushSetUpstream(currentPath, noUpstreamPrompt.branch);
            if (result.success) {
                setNoUpstreamPrompt(null);
                await loadGitStatus();
            } else {
                setGitError(result.error || 'Failed to push');
            }
        } catch (err: any) {
            setGitError(err.message || 'Failed to push');
        } finally {
            setGitLoading(false);
        }
    };

    const gitEnableAutoSetupRemote = async () => {
        try {
            await (window as any).api.gitSetAutoSetupRemote();
            await gitPushWithUpstream();
        } catch (err: any) {
            setGitError(err.message || 'Failed to set config');
        }
    };

    // Load git diff for all changes
    const loadGitDiff = useCallback(async () => {
        if (!currentPath) return;
        try {
            const diff = await (window as any).api.gitDiffAll(currentPath);
            setGitDiffContent(diff);
        } catch (err) {
            console.error('Failed to load git diff:', err);
            setGitDiffContent(null);
        }
    }, [currentPath]);

    // Load git branches
    const loadGitBranches = useCallback(async () => {
        if (!currentPath) return;
        try {
            const branches = await (window as any).api.gitBranches(currentPath);
            setGitBranches(branches);
        } catch (err) {
            console.error('Failed to load git branches:', err);
            setGitBranches(null);
        }
    }, [currentPath]);

    // Load git commit history
    const loadGitHistory = useCallback(async () => {
        if (!currentPath) return;
        try {
            const result = await (window as any).api.gitLog(currentPath, { maxCount: 50 });
            if (result?.success && result.commits) {
                setGitCommitHistory(result.commits);
            } else {
                setGitCommitHistory([]);
            }
        } catch (err) {
            console.error('Failed to load git history:', err);
            setGitCommitHistory([]);
        }
    }, [currentPath]);

    // Create a new branch
    const gitCreateBranch = async () => {
        if (!gitNewBranchName.trim()) return;
        setGitLoading(true);
        setGitError(null);
        try {
            await (window as any).api.gitCreateBranch(currentPath, gitNewBranchName.trim());
            setGitNewBranchName('');
            await loadGitBranches();
            await loadGitStatus();
        } catch (err: any) {
            setGitError(err.message || 'Failed to create branch');
        } finally {
            setGitLoading(false);
        }
    };

    // Switch to a branch
    const gitCheckoutBranch = async (branchName: string) => {
        setGitLoading(true);
        setGitError(null);
        try {
            await (window as any).api.gitCheckout(currentPath, branchName);
            await loadGitBranches();
            await loadGitStatus();
        } catch (err: any) {
            setGitError(err.message || 'Failed to checkout branch');
        } finally {
            setGitLoading(false);
        }
    };

    // Delete a branch
    const gitDeleteBranch = async (branchName: string, force: boolean = false) => {
        setGitLoading(true);
        setGitError(null);
        try {
            await (window as any).api.gitDeleteBranch(currentPath, branchName, force);
            await loadGitBranches();
        } catch (err: any) {
            setGitError(err.message || 'Failed to delete branch');
        } finally {
            setGitLoading(false);
        }
    };

    // View a specific commit
    const loadCommitDetails = async (commitHash: string) => {
        try {
            const result = await (window as any).api.gitShowCommit(currentPath, commitHash);
            // Find the commit in history to get metadata
            const commitMeta = gitCommitHistory.find((c: any) => c.hash === commitHash);
            if (result?.success) {
                setGitSelectedCommit({
                    hash: commitHash,
                    author_name: commitMeta?.author_name || 'Unknown',
                    author_email: commitMeta?.author_email || '',
                    date: commitMeta?.date || new Date().toISOString(),
                    message: commitMeta?.message || '',
                    details: result.details,
                    diff: result.diff
                });
            }
        } catch (err) {
            console.error('Failed to load commit details:', err);
        }
    };

    // Load file diff
    const loadFileDiff = async (filePath: string, staged: boolean = false) => {
        try {
            const diff = await (window as any).api.gitDiff(currentPath, filePath, staged);
            setGitSelectedFile(filePath);
            setGitFileDiff(diff);
            return diff;
        } catch (err) {
            console.error('Failed to load file diff:', err);
            setGitFileDiff(null);
            return null;
        }
    };

    // Open a file diff in a new pane
    const openFileDiffPane = (filePath: string, status: string) => {
        const fullPath = filePath.startsWith('/') ? filePath : `${currentPath}/${filePath}`;
        createAndAddPaneNodeToLayout({
            contentType: 'diff',
            contentId: fullPath,
            diffStatus: status
        });
    };

    // Load memories for memory modal
    const loadMemories = useCallback(async () => {
        setMemoryLoading(true);
        try {
            const response = await (window as any).api.executeSQL({
                query: `SELECT id, message_id, conversation_id, npc, team, directory_path,
                       initial_memory, final_memory, status, timestamp, model, provider
                       FROM memory_lifecycle ORDER BY timestamp DESC LIMIT 500`
            });
            if (response.error) throw new Error(response.error);
            setMemories(response.result || []);
        } catch (err) {
            console.error('Error loading memories:', err);
            setMemories([]);
        } finally {
            setMemoryLoading(false);
        }
    }, []);

    // Note: Memory loading is now handled by MemoryManagement component itself

    // Filtered memories
    const filteredMemories = useMemo(() => {
        return memories.filter(memory => {
            const matchesStatus = memoryFilter === 'all' || memory.status === memoryFilter;
            const matchesSearch = !memorySearchTerm ||
                memory.initial_memory?.toLowerCase().includes(memorySearchTerm.toLowerCase()) ||
                memory.final_memory?.toLowerCase().includes(memorySearchTerm.toLowerCase());
            return matchesStatus && matchesSearch;
        });
    }, [memories, memoryFilter, memorySearchTerm]);

    // Fetch pending memory count and KG generation for status bar
    useEffect(() => {
        const fetchStatusBarData = async () => {
            try {
                // Fetch pending memory count
                const pendingResult = await (window as any).api?.memory_pending?.({
                    directory_path: currentPath,
                    limit: 100
                });
                if (pendingResult?.memories) {
                    setPendingMemoryCount(pendingResult.memories.length);
                }

                // Fetch KG generation
                const kgResult = await (window as any).api?.kg_getStatus?.();
                if (kgResult?.generation !== undefined) {
                    setKgGeneration(kgResult.generation);
                }
            } catch (err) {
                console.error('Error fetching status bar data:', err);
            }
        };

        fetchStatusBarData();
        // Refresh every 30 seconds
        const interval = setInterval(fetchStatusBarData, 30000);
        return () => clearInterval(interval);
    }, [currentPath]);

    // Load theme colors from localStorage on startup
    useEffect(() => {
        const darkPrimary = localStorage.getItem('npcStudio_themeDarkPrimary');
        const darkBg = localStorage.getItem('npcStudio_themeDarkBg');
        const darkText = localStorage.getItem('npcStudio_themeDarkText');
        const lightPrimary = localStorage.getItem('npcStudio_themeLightPrimary');
        const lightBg = localStorage.getItem('npcStudio_themeLightBg');
        const lightText = localStorage.getItem('npcStudio_themeLightText');
        const darkMode = localStorage.getItem('npcStudio_darkMode');
        const hueShift = localStorage.getItem('npcStudio_themeHueShift');
        const saturation = localStorage.getItem('npcStudio_themeSaturation');
        const brightness = localStorage.getItem('npcStudio_themeBrightness');

        // Apply dark mode colors
        if (darkPrimary) document.documentElement.style.setProperty('--theme-primary-dark', darkPrimary);
        if (darkBg) document.documentElement.style.setProperty('--theme-bg-dark', darkBg);
        if (darkText) document.documentElement.style.setProperty('--theme-text-dark', darkText);
        // Apply light mode colors
        if (lightPrimary) document.documentElement.style.setProperty('--theme-primary-light', lightPrimary);
        if (lightBg) document.documentElement.style.setProperty('--theme-bg-light', lightBg);
        if (lightText) document.documentElement.style.setProperty('--theme-text-light', lightText);
        // Apply HSB adjustments
        if (hueShift) document.documentElement.style.setProperty('--theme-hue-shift', `${hueShift}deg`);
        if (saturation) document.documentElement.style.setProperty('--theme-saturation', `${saturation}%`);
        if (brightness) document.documentElement.style.setProperty('--theme-brightness', `${brightness}%`);

        // Apply dark/light mode class
        if (darkMode === 'false') {
            document.body.classList.remove('dark-mode');
            document.body.classList.add('light-mode');
            setIsDarkMode(false);
        } else {
            document.body.classList.add('dark-mode');
            document.body.classList.remove('light-mode');
            setIsDarkMode(true);
        }
    }, []);

    // Save showDateTime preference
    useEffect(() => {
        localStorage.setItem('npcStudioShowDateTime', JSON.stringify(showDateTime));
    }, [showDateTime]);

    // Update clock every second
    useEffect(() => {
        const clockInterval = setInterval(() => {
            setCurrentTime(new Date());
        }, 1000);
        return () => clearInterval(clockInterval);
    }, []);

    // Save model/provider/NPC preferences
    useEffect(() => {
        if (currentModel !== null) {
            localStorage.setItem('npcStudioCurrentModel', JSON.stringify(currentModel));
        }
    }, [currentModel]);

    useEffect(() => {
        if (currentProvider !== null) {
            localStorage.setItem('npcStudioCurrentProvider', JSON.stringify(currentProvider));
        }
    }, [currentProvider]);

    useEffect(() => {
        if (currentNPC !== null) {
            localStorage.setItem('npcStudioCurrentNPC', JSON.stringify(currentNPC));
        }
    }, [currentNPC]);

    // Sync selectedModels with currentModel when currentModel changes (e.g., from other UI actions)
    useEffect(() => {
        if (currentModel && !broadcastMode) {
            setSelectedModels(prev => {
                // Only update if not already matching (avoid infinite loops)
                if (prev.length !== 1 || prev[0] !== currentModel) {
                    return [currentModel];
                }
                return prev;
            });
        }
    }, [currentModel, broadcastMode]);

    // Sync selectedNPCs with currentNPC when currentNPC changes
    useEffect(() => {
        if (currentNPC && !broadcastMode) {
            setSelectedNPCs(prev => {
                // Only update if not already matching (avoid infinite loops)
                if (prev.length !== 1 || prev[0] !== currentNPC) {
                    return [currentNPC];
                }
                return prev;
            });
        }
    }, [currentNPC, broadcastMode]);

    // Save execution mode preference
    useEffect(() => {
        localStorage.setItem('npcStudioExecutionMode', JSON.stringify(executionMode));
    }, [executionMode]);

    // Save sidebar collapsed states
    useEffect(() => {
        localStorage.setItem('sidebarFilesCollapsed', JSON.stringify(filesCollapsed));
    }, [filesCollapsed]);

    useEffect(() => {
        localStorage.setItem('sidebarConversationsCollapsed', JSON.stringify(conversationsCollapsed));
    }, [conversationsCollapsed]);

    useEffect(() => {
        localStorage.setItem('sidebarWebsitesCollapsed', JSON.stringify(websitesCollapsed));
    }, [websitesCollapsed]);

    // Save sidebar section order
    useEffect(() => {
        localStorage.setItem('sidebarSectionOrder', JSON.stringify(sidebarSectionOrder));
    }, [sidebarSectionOrder]);

    useEffect(() => {
        const saveCurrentWorkspace = () => {
            if (currentPath && rootLayoutNode) {
                const workspaceData = serializeWorkspace(
                    rootLayoutNode,
                    currentPath,
                    contentDataRef.current,
                    activeContentPaneId
                );
                if (workspaceData) {
                    saveWorkspaceToStorage(currentPath, workspaceData);
                    console.log(`Saved workspace for ${currentPath}`);
                }
            }
        };

        window.addEventListener('beforeunload', saveCurrentWorkspace);

        return () => {
            saveCurrentWorkspace();
            window.removeEventListener('beforeunload', saveCurrentWorkspace);
        };
    }, [currentPath, rootLayoutNode, activeContentPaneId]);

    useEffect(() => {
        const handleMouseUp = () => {
            setIsResizingSidebar(false);
            setIsResizingInput(false);
        };

        if (isResizingSidebar || isResizingInput) {
            document.addEventListener('mousemove', isResizingSidebar ? handleSidebarResize : handleInputResize);
            document.addEventListener('mouseup', handleMouseUp);

            return () => {
                document.removeEventListener('mousemove', isResizingSidebar ? handleSidebarResize : handleInputResize);
                document.removeEventListener('mouseup', handleMouseUp);
            };
        }
    }, [isResizingSidebar, isResizingInput, handleSidebarResize, handleInputResize]);

    // Bar height resize handlers
    useEffect(() => {
        const handleTopBarResize = (e: MouseEvent) => {
            const newHeight = Math.max(32, Math.min(80, e.clientY));
            setTopBarHeight(newHeight);
            localStorage.setItem('npcStudio_topBarHeight', String(newHeight));
        };
        const handleBottomBarResize = (e: MouseEvent) => {
            const newHeight = Math.max(32, Math.min(80, window.innerHeight - e.clientY));
            setBottomBarHeight(newHeight);
            localStorage.setItem('npcStudio_bottomBarHeight', String(newHeight));
        };
        const handleMouseUp = () => {
            setIsResizingTopBar(false);
            setIsResizingBottomBar(false);
        };
        if (isResizingTopBar) {
            document.addEventListener('mousemove', handleTopBarResize);
            document.addEventListener('mouseup', handleMouseUp);
            return () => {
                document.removeEventListener('mousemove', handleTopBarResize);
                document.removeEventListener('mouseup', handleMouseUp);
            };
        }
        if (isResizingBottomBar) {
            document.addEventListener('mousemove', handleBottomBarResize);
            document.addEventListener('mouseup', handleMouseUp);
            return () => {
                document.removeEventListener('mousemove', handleBottomBarResize);
                document.removeEventListener('mouseup', handleMouseUp);
            };
        }
    }, [isResizingTopBar, isResizingBottomBar]);

    // Helper function for conversation stats
    const getConversationStats = (messages: any[]) => {
        if (!messages || messages.length === 0) {
            return { messageCount: 0, tokenCount: 0, models: new Set(), agents: new Set(), providers: new Set() };
        }

        const stats = messages.reduce((acc, msg) => {
            if (msg.content) {
                acc.tokenCount += Math.ceil(msg.content.length / 4);
            }
            if (msg.reasoningContent) {
                acc.tokenCount += Math.ceil(msg.reasoningContent.length / 4);
            }
            if (msg.role !== 'user') {
                if (msg.model) acc.models.add(msg.model);
                if (msg.npc) acc.agents.add(msg.npc);
                if (msg.provider) acc.providers.add(msg.provider);
            }
            return acc;
        }, { messageCount: messages.length, tokenCount: 0, models: new Set(), agents: new Set(), providers: new Set() });

        return stats;
    };

    // Path switching hook
    const switchToPath = useSwitchToPath(
        windowId,
        currentPath,
        rootLayoutNode,
        serializeWorkspace,
        saveWorkspaceToStorage,
        setRootLayoutNode,
        setActiveContentPaneId,
        contentDataRef,
        setActiveConversationId,
        setCurrentFile,
        setCurrentPath
    );

    const toggleFavoriteModel = (modelValue: string) => {
        if (!modelValue) return;
        setFavoriteModels(prev => {
            const newFavorites = new Set(prev);
            if (newFavorites.has(modelValue)) {
                newFavorites.delete(modelValue);
            } else {
                newFavorites.add(modelValue);
            }
            localStorage.setItem('npcStudioFavoriteModels', JSON.stringify(Array.from(newFavorites)));
            return newFavorites;
        });
    };

    const modelsToDisplay = useMemo(() => {
        // If no favorites are set, always show all models
        if (favoriteModels.size === 0) {
            return availableModels;
        }

        // If showing all or no favorites exist, show all
        if (showAllModels) {
            return availableModels;
        }

        // Filter to favorites
        return availableModels.filter((m: any) => favoriteModels.has(m.value));
    }, [availableModels, favoriteModels, showAllModels]);

    const jinxsToDisplay = useMemo(() => {
        if (favoriteJinxs.size === 0 || showAllJinxs) return availableJinxs;
        return availableJinxs.filter(j => favoriteJinxs.has(j.name));
    }, [availableJinxs, favoriteJinxs, showAllJinxs]);

    useEffect(() => {
        const saveCurrentWorkspace = () => {
            if (currentPath && rootLayoutNode) {
                const workspaceData = serializeWorkspace();
                if (workspaceData) {
                    saveWorkspaceToStorage(currentPath, workspaceData);
                    console.log(`Saved workspace for ${currentPath}`);
                }
            }
        };
        return () => {
            saveCurrentWorkspace();
            window.removeEventListener('beforeunload', saveCurrentWorkspace);
        };
    }, [currentPath, rootLayoutNode, serializeWorkspace, saveWorkspaceToStorage]);

    // Fetch tool-capable Ollama models
    useEffect(() => {
        const fetchOllamaToolModels = async () => {
            try {
                const res = await fetch(`${BACKEND_URL}/api/ollama/tool_models`);
                const data = await res.json();
                if (data?.models) {
                    setOllamaToolModels(new Set(data.models));
                }
            } catch (e) {
                console.warn('Failed to fetch Ollama tool-capable models', e);
            }
        };
        fetchOllamaToolModels();
    }, []);

    // In ChatInterface.jsx, update the useEffect that fetches Jinxs
    useEffect(() => {
        const fetchJinxs = async () => {
            try {
                const globalResp = await window.api.getJinxsGlobal(); // { jinxs: [...] }
                let projectResp = { jinxs: [] };
                if (currentPath) {
                    try {
                        projectResp = await window.api.getJinxsProject(currentPath); // { jinxs: [...] }
                    } catch (e) {
                        console.warn('Project jinxs fetch failed:', e?.message || e);
                    }
                }

                // Normalize entries and tag origin
                const normalize = (arr, origin) =>
                    (arr || []).map(j => {
                        let nm, desc = '', pathVal = '', group = '', inputs = [];
                        if (typeof j === 'string') {
                            nm = j;
                        } else if (j) {
                            nm = j.jinx_name || j.name;
                            desc = j.description || '';
                            pathVal = j.path || '';
                            inputs = Array.isArray(j.inputs) ? j.inputs : [];
                        }
                        if (!nm) return null;
                        // group from first path segment (subfolder) or 'root'
                        if (pathVal) {
                            const parts = pathVal.split(/[\\/]/);
                            group = parts.length > 1 ? parts[0] : 'root';
                        } else {
                            group = 'root';
                        }
                        return { name: nm, description: desc, path: pathVal, origin, group, inputs };
                    }).filter(Boolean);

                const merged = [
                    ...normalize(projectResp.jinxs, 'project'),
                    ...normalize(globalResp.jinxs, 'global'),
                ];

                // Deduplicate by name, prefer project over global (project entries come first)
                const seen = new Set();
                const deduped = [];
                for (const j of merged) {
                    const key = j.name;
                    if (seen.has(key)) continue;
                    seen.add(key);
                    deduped.push(j);
                }

                setAvailableJinxs(deduped);
            } catch (err) {
                console.error('Error fetching jinxs:', err);
                setJinxLoadingError(err.message);
                setAvailableJinxs([]);
            }
        };

        fetchJinxs();
    }, [currentPath]);

    // Load MCP tools when in Tool Agent mode or when server path changes
    useEffect(() => {
        const loadMcpTools = async () => {
            if (executionMode !== 'tool_agent') return;
            setMcpToolsLoading(true);
            setMcpToolsError(null);
            const res = await window.api.listMcpTools({ serverPath: mcpServerPath, currentPath });
            setMcpToolsLoading(false);
            if (res.error) {
                setMcpToolsError(res.error);
                setAvailableMcpTools([]);
                return;
            }
            const tools = res.tools || [];
            setAvailableMcpTools(tools);
            const names = tools.map(t => t.function?.name).filter(Boolean);
            setSelectedMcpTools(prev => prev.filter(n => names.includes(n)));
        };
        loadMcpTools();
    }, [executionMode, mcpServerPath, currentPath]);

        


    useEffect(() => {
        if (selectedJinx && Array.isArray(selectedJinx.inputs)) {
            setJinxInputValues(prev => {
                const currentJinxValues = prev[selectedJinx.name] || {};
                const newJinxValues = { ...currentJinxValues };

                // Ensure all inputs defined by the jinx have an entry in currentJinxValues
                selectedJinx.inputs.forEach(inputDef => {
                    let inputName = '';
                    let defaultVal = '';
                    if (typeof inputDef === 'string') {
                        inputName = inputDef;
                    } else if (inputDef && typeof inputDef === 'object') {
                        inputName = Object.keys(inputDef)[0];
                        defaultVal = inputDef[inputName] || '';
                    }
                    if (inputName) {
                        if (newJinxValues[inputName] === undefined) {
                            newJinxValues[inputName] = defaultVal;
                        }
                    }
                });
                return { ...prev, [selectedJinx.name]: newJinxValues };
            });
        }
    }, [selectedJinx]);




    // Refs to hold callbacks for use in keyboard handler and menu handlers
    const handleFileClickRef = useRef<((filePath: string) => void) | null>(null);
    const createNewTerminalRef = useRef<(() => void) | null>(null);
    const createNewConversationRef = useRef<(() => void) | null>(null);
    const createNewBrowserRef = useRef<(() => void) | null>(null);
    const handleCreateNewFolderRef = useRef<(() => void) | null>(null);
    const closeContentPaneRef = useRef<((paneId: string, nodePath: string[]) => void) | null>(null);
    const performSplitRef = useRef<((targetNodePath: number[], side: string, newContentType: string, newContentId: string) => void) | null>(null);
    const updateContentPaneRef = useRef<((paneId: string, contentType: string, contentId: string, skipMessageLoad?: boolean) => void) | null>(null);
    const createSettingsPaneRef = useRef<(() => void) | null>(null);
    const createSearchPaneRef = useRef<((query?: string) => void) | null>(null);
    const createHelpPaneRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        const handleKeyDown = async (e: KeyboardEvent) => {
            // Ctrl+P or Ctrl+Shift+P - Command Palette (file search)
            if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) {
                e.preventDefault();
                setCommandPaletteOpen(true);
                return;
            }

            // Ctrl+Shift+F - Global search
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'f' || e.key === 'F')) {
                e.preventDefault();
                setIsGlobalSearch(true);
                setIsSearching(true);
                setLocalSearch({ isActive: false, term: '', paneId: null, results: [], currentIndex: -1 });
                searchInputRef.current?.focus();
                return;
            }

            // Ctrl+O - Open file dialog
            if ((e.ctrlKey || e.metaKey) && (e.key === 'o' || e.key === 'O') && !e.shiftKey) {
                e.preventDefault();
                try {
                    const fileData = await (window as any).api.showOpenDialog({
                        properties: ['openFile'],
                        filters: [
                            { name: 'All Files', extensions: ['*'] },
                            { name: 'Code', extensions: ['js', 'jsx', 'ts', 'tsx', 'py', 'json', 'html', 'css', 'md'] },
                            { name: 'Documents', extensions: ['pdf', 'docx', 'txt'] },
                            { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'] },
                        ],
                    });
                    if (fileData && fileData.length > 0 && handleFileClickRef.current) {
                        handleFileClickRef.current(fileData[0].path);
                    }
                } catch (error) {
                    console.error('Error opening file dialog:', error);
                }
                return;
            }

            // Ctrl+F - Local search in chat
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                const activePane = contentDataRef.current[activeContentPaneId];                // Let browser panes handle Ctrl+F natively
                if (activePane?.contentType === 'browser') {
                    return;
                }
                if ((activePane as any)?.contentType === 'chat') {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsGlobalSearch(false);
                    setIsSearching(false);
                    setLocalSearch(prev => ({ ...prev, isActive: true, paneId: activeContentPaneId }));
                }
            }

            // Ctrl+B - New Browser
            if ((e.ctrlKey || e.metaKey) && e.key === 'b' && !e.shiftKey) {
                e.preventDefault();
                createNewBrowserRef.current?.();
                return;
            }

            // Ctrl+Shift+T - New Terminal
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 't' || e.key === 'T')) {
                e.preventDefault();
                createNewTerminalRef.current?.();
                return;
            }

            // Ctrl+Shift+C - New Conversation/Chat (but not when in terminal - let terminal handle copy)
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'c' || e.key === 'C')) {
                // Check if focus is inside a terminal - if so, let the terminal handle the copy
                const activeElement = document.activeElement;
                const isInTerminal = activeElement?.closest('.xterm') || activeElement?.closest('[data-terminal]');
                if (isInTerminal) {
                    // Don't prevent default - let the terminal's copy handler work
                    return;
                }
                e.preventDefault();
                createNewConversationRef.current?.();
                return;
            }

            // Ctrl+Shift+B - New Browser
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'b' || e.key === 'B')) {
                e.preventDefault();
                createNewBrowserRef.current?.();
                return;
            }

            // Ctrl+Shift+N - New Workspace/Window
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'n' || e.key === 'N')) {
                e.preventDefault();
                if ((window as any).api?.openNewWindow) {
                    (window as any).api.openNewWindow(currentPath);
                } else {
                    window.open(window.location.href, '_blank');
                }
                return;
            }

            // Ctrl+N - New Folder
            if ((e.ctrlKey || e.metaKey) && (e.key === 'n' || e.key === 'N') && !e.shiftKey) {
                e.preventDefault();
                handleCreateNewFolderRef.current?.();
                return;
            }

            // Ctrl+W - Close current tab/pane (prevent closing window)
            if ((e.ctrlKey || e.metaKey) && (e.key === 'w' || e.key === 'W') && !e.shiftKey) {
                e.preventDefault();
                e.stopPropagation();
                if (activeContentPaneId) {
                    const nodePath = findNodePath(rootLayoutNodeRef.current, activeContentPaneId);
                    if (nodePath) {
                        closeContentPane(activeContentPaneId, nodePath);
                    }
                }
                return;
            }

            // Ctrl+Shift+R - Hard refresh browser pane, or reload chat messages for chat panes
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'r' || e.key === 'R')) {
                const activePane = contentDataRef.current[activeContentPaneId];
                if (activePane?.contentType === 'browser' && activePane?.contentId) {
                    e.preventDefault();
                    e.stopPropagation();
                    (window as any).api?.browserHardRefresh?.({ viewId: activePane.contentId });
                    return;
                }
                // For chat panes, reload the conversation messages
                if (activePane?.contentType === 'chat' && activePane?.contentId) {
                    e.preventDefault();
                    e.stopPropagation();
                    (async () => {
                        try {
                            const msgs = await window.api.getConversationMessages(activePane.contentId);
                            const formatted = (msgs && Array.isArray(msgs))
                                ? msgs.map((m: any) => ({ ...m, id: m.message_id || m.id || generateId() }))
                                : [];
                            if (!activePane.chatMessages) {
                                activePane.chatMessages = { messages: [], allMessages: [], displayedMessageCount: 20 };
                            }
                            activePane.chatMessages.allMessages = formatted;
                            activePane.chatMessages.messages = formatted.slice(-activePane.chatMessages.displayedMessageCount);
                            setRootLayoutNode(prev => ({ ...prev }));
                            console.log('[REFRESH] Reloaded', formatted.length, 'messages for conversation', activePane.contentId);
                        } catch (err) {
                            console.error('[REFRESH] Failed to reload messages:', err);
                        }
                    })();
                    return;
                }
                // For non-browser/non-chat panes, prevent Electron refresh
                e.preventDefault();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [activeContentPaneId]);
    

    
    
    
    useEffect(() => {
        const cleanup = window.api.onBrowserShowContextMenu(({ x, y, selectedText, linkURL, pageURL, srcURL, isEditable, mediaType, canSaveImage }) => {
            setBrowserContextMenuPos({ x, y, selectedText, linkURL, pageURL, srcURL, isEditable, mediaType, canSaveImage });
        });
        return () => cleanup();
    }, []);
    
    useEffect(() => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    }, [ activeConversationId]);

   

    
    
    const handlePathChange = useCallback(async (newPath) => {
        // Save current workspace before switching
        if (currentPath && rootLayoutNode) {
            const workspaceData = serializeWorkspace();
            if (workspaceData) {
                saveWorkspaceToStorage(currentPath, workspaceData);
            }
        }
        
        // Switch to new path
        setCurrentPath(newPath);
    }, [currentPath, rootLayoutNode, serializeWorkspace, saveWorkspaceToStorage]);


const validateWorkspaceData = (workspaceData) => {
    if (!workspaceData || typeof workspaceData !== 'object') return false;
    if (!workspaceData.layoutNode || !workspaceData.contentData) return false;
    
    // Validate that referenced files/conversations still exist
    // You might want to add API calls to verify this
    
    return true;
};


const [pdfSelectionIndicator, setPdfSelectionIndicator] = useState(null);

// Update content pane with new content type and ID
const updateContentPane = useCallback(async (paneId, newContentType, newContentId, skipMessageLoad = false) => {
    if (!contentDataRef.current[paneId]) {
        contentDataRef.current[paneId] = {};
    }
    const paneData = contentDataRef.current[paneId];

    // Track activity for RNN predictions
    trackActivity('pane_open', {
        paneType: newContentType,
        filePath: newContentType === 'editor' ? newContentId : undefined,
        url: newContentType === 'browser' ? newContentId : undefined,
        fileType: newContentType === 'editor' ? newContentId?.split('.').pop() : undefined,
    });

    paneData.contentType = newContentType;
    paneData.contentId = newContentId;

    if (newContentType === 'editor') {
        try {
            const response = await window.api.readFileContent(newContentId);
            paneData.fileContent = response.error ? `Error: ${response.error}` : response.content;
            paneData.fileChanged = false;
        } catch (err) {
            paneData.fileContent = `Error loading file: ${err.message}`;
        }
    } else if (newContentType === 'browser') {
        paneData.chatMessages = null;
        paneData.fileContent = null;
        paneData.browserUrl = newContentId;
    } else if (newContentType === 'chat') {
        if (!paneData.chatMessages) {
            paneData.chatMessages = { messages: [], allMessages: [], displayedMessageCount: 20 };
        }
        // Initialize per-pane execution mode if not set - use globally persisted mode
        if (paneData.executionMode === undefined) {
            const savedMode = localStorage.getItem('npcStudioExecutionMode');
            paneData.executionMode = savedMode ? JSON.parse(savedMode) : 'chat';
            paneData.selectedJinx = null;
            paneData.showJinxDropdown = false;
        }
        if (skipMessageLoad) {
            paneData.chatMessages.messages = [];
            paneData.chatMessages.allMessages = [];
            paneData.chatStats = getConversationStats([]);
        } else {
            try {
                const msgs = await window.api.getConversationMessages(newContentId);
                const assistantMsgs = msgs?.filter((m: any) => m.role === 'assistant') || [];
                console.log('[LOAD_MSGS] Total:', msgs?.length, 'Assistant msgs:', assistantMsgs.length,
                    'With parentMessageId:', assistantMsgs.filter((m: any) => m.parentMessageId).length);
                // Log all assistant messages to trace grouping
                if (assistantMsgs.length > 0) {
                    console.log('[LOAD_MSGS] Assistant message details:', assistantMsgs.map((m: any) => ({
                        id: String(m.message_id || '').slice(0, 8),
                        parent: String(m.parentMessageId || 'NONE').slice(0, 8),
                        npc: m.npc
                    })));
                }
                const formatted = (msgs && Array.isArray(msgs))
                    ? msgs.map((m) => {
                        const msg = { ...m, id: m.message_id || m.id || generateId() };
                        // Reconstruct contentParts for assistant messages with tool calls
                        if (msg.role === 'assistant' && msg.toolCalls && Array.isArray(msg.toolCalls)) {
                            const contentParts: any[] = [];
                            // Add text content first
                            if (msg.content) {
                                contentParts.push({ type: 'text', content: msg.content });
                            }
                            // Add tool calls
                            msg.toolCalls.forEach((tc: any) => {
                                contentParts.push({
                                    type: 'tool_call',
                                    call: {
                                        id: tc.id,
                                        function_name: tc.function_name,
                                        arguments: tc.arguments,
                                        status: 'complete'
                                    }
                                });
                            });
                            msg.contentParts = contentParts;
                        }
                        return msg;
                    })
                    : [];
                paneData.chatMessages.allMessages = formatted;
                paneData.chatMessages.messages = formatted.slice(-paneData.chatMessages.displayedMessageCount);
                paneData.chatStats = getConversationStats(formatted);
            } catch (err) {
                paneData.chatMessages.messages = [];
                paneData.chatMessages.allMessages = [];
                paneData.chatStats = getConversationStats([]);
            }
        }
    } else if (newContentType === 'terminal' || newContentType === 'pdf') {
        paneData.chatMessages = null;
        paneData.fileContent = null;
    }

    // Force re-render without calling syncLayoutWithContentData to avoid race condition
    // The existing useEffect will handle any necessary sync
    setRootLayoutNode(prev => ({ ...prev }));
}, [trackActivity]);

// Perform split on a pane - creates a new pane and splits the layout
const performSplit = useCallback((targetNodePath, side, newContentType, newContentId) => {
    // Generate the new pane ID first so we can use it outside the state updater
    const newPaneId = generateId();

    // Set content data synchronously BEFORE layout updates to avoid race condition
    // This ensures the content is available when LayoutNode first renders
    contentDataRef.current[newPaneId] = {
        contentType: newContentType,
        contentId: newContentId
    };

    setRootLayoutNode(oldRoot => {
        if (!oldRoot) return oldRoot;

        const newRoot = JSON.parse(JSON.stringify(oldRoot));
        let targetNode = newRoot;

        for (let i = 0; i < targetNodePath.length; i++) {
            targetNode = targetNode.children[targetNodePath[i]];
        }

        const newPaneNode = { id: newPaneId, type: 'content' };

        const isHorizontalSplit = side === 'left' || side === 'right';
        const newSplitNode = {
            id: generateId(),
            type: 'split',
            direction: isHorizontalSplit ? 'horizontal' : 'vertical',
            children: side === 'left' || side === 'top' ? [newPaneNode, targetNode] : [targetNode, newPaneNode],
            sizes: [50, 50]
        };

        if (targetNodePath.length === 0) {
            return newSplitNode;
        }

        let parentNode = newRoot;
        for (let i = 0; i < targetNodePath.length - 1; i++) {
            parentNode = parentNode.children[targetNodePath[i]];
        }
        parentNode.children[targetNodePath[targetNodePath.length - 1]] = newSplitNode;

        return newRoot;
    });

    // Set active pane and do any additional async setup AFTER layout state update
    setActiveContentPaneId(newPaneId);

    // Call updateContentPane for content types that need additional async setup
    // (e.g., loading file content for editors, initializing chat messages)
    // Skip for simple viewers like PDF that just need contentId
    if (newContentType === 'editor' || newContentType === 'chat') {
        updateContentPane(newPaneId, newContentType, newContentId);
    }
}, [updateContentPane]);

const closeContentPane = useCallback((paneId, nodePath) => {
    // Track pane close activity
    const paneData = contentDataRef.current[paneId];
    if (paneData) {
        trackActivity('pane_close', {
            paneType: paneData.contentType,
            filePath: paneData.contentId,
        });
    }

    setRootLayoutNode(oldRoot => {
        if (!oldRoot) return oldRoot;

        // If this is the root node and it's a content pane, allow closing it (returns null)
        if (oldRoot.type === 'content' && oldRoot.id === paneId) {
            console.log('[CLOSE_PANE] Closing the last pane');
            delete contentDataRef.current[paneId];
            return null;
        }

        const newRoot = JSON.parse(JSON.stringify(oldRoot));

        // If path is empty, this is the root node - allow closing
        if (nodePath.length === 0) {
            console.log('[CLOSE_PANE] Closing root pane');
            delete contentDataRef.current[paneId];
            return null;
        }

        // Navigate to parent of the node we want to remove
        let parentNode = newRoot;
        for (let i = 0; i < nodePath.length - 1; i++) {
            parentNode = parentNode.children[nodePath[i]];
        }

        const indexToRemove = nodePath[nodePath.length - 1];

        // If parent is a split node with 2 children, replace parent with the sibling
        if (parentNode.type === 'split' && parentNode.children.length === 2) {
            const siblingIndex = indexToRemove === 0 ? 1 : 0;
            const sibling = parentNode.children[siblingIndex];

            // Replace parent with sibling
            if (nodePath.length === 1) {
                // Parent is root, replace root with sibling
                delete contentDataRef.current[paneId];
                return sibling;
            } else {
                // Navigate to grandparent and replace parent with sibling
                let grandParentNode = newRoot;
                for (let i = 0; i < nodePath.length - 2; i++) {
                    grandParentNode = grandParentNode.children[nodePath[i]];
                }
                grandParentNode.children[nodePath[nodePath.length - 2]] = sibling;
            }
        } else if (parentNode.type === 'split' && parentNode.children.length > 2) {
            // Remove the child and redistribute sizes
            parentNode.children.splice(indexToRemove, 1);
            const equalSize = 100 / parentNode.children.length;
            parentNode.sizes = parentNode.children.map(() => equalSize);
        }

        // Clean up contentDataRef
        delete contentDataRef.current[paneId];

        // If we closed the active pane, switch to a different pane
        if (activeContentPaneId === paneId) {
            // Find first content pane in the tree
            const findFirstContentPane = (node) => {
                if (!node) return null;
                if (node.type === 'content') return node.id;
                if (node.type === 'split') {
                    for (const child of node.children) {
                        const found = findFirstContentPane(child);
                        if (found) return found;
                    }
                }
                return null;
            };
            const firstPaneId = findFirstContentPane(newRoot);
            if (firstPaneId) {
                setActiveContentPaneId(firstPaneId);
            }
        }

        return newRoot;
    });
}, [activeContentPaneId, setActiveContentPaneId]);

// Keep refs updated for MCP polling useEffect
useEffect(() => {
    performSplitRef.current = performSplit;
}, [performSplit]);

useEffect(() => {
    closeContentPaneRef.current = closeContentPane;
}, [closeContentPane]);

useEffect(() => {
    updateContentPaneRef.current = updateContentPane;
}, [updateContentPane]);

// Listen for external studio action execution (CLI/LLM control)
// NOTE: This must be after performSplit and closeContentPane are defined
useEffect(() => {
    const api = window as any;
    if (!api.api?.onExecuteStudioAction) return;

    const unsubscribe = api.api.onExecuteStudioAction(async (data: { action: string, args: any }) => {
        console.log('[EXTERNAL] Executing studio action:', data.action, data.args);

        const ctx: StudioContext = {
            rootLayoutNode,
            contentDataRef,
            activeContentPaneId,
            setActiveContentPaneId,
            setRootLayoutNode,
            performSplit,
            closeContentPane,
            updateContentPane,
            generateId,
            findPanePath: (node: any, paneId: string, path: number[] = []) => findNodePath(node, paneId),
        };

        const result = await executeStudioAction(data.action, data.args || {}, ctx);
        console.log('[EXTERNAL] Action result:', result);
    });

    return () => {
        if (unsubscribe) unsubscribe();
    };
}, [rootLayoutNode, activeContentPaneId, performSplit, closeContentPane, updateContentPane]);

// SSE connection for MCP studio actions from the backend
useEffect(() => {
    let eventSource: EventSource | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;

    const executeAction = async (actionId: string, actionData: any) => {
        // Wait for refs to be initialized
        if (!performSplitRef.current || !closeContentPaneRef.current || !updateContentPaneRef.current) {
            console.log('[MCP] Refs not ready yet, skipping action:', actionId);
            return;
        }

        console.log('[MCP] Executing action:', actionId, actionData.action);

        const ctx: StudioContext = {
            rootLayoutNode: rootLayoutNodeRef.current,
            contentDataRef,
            activeContentPaneId: activeContentPaneIdRef.current,
            setActiveContentPaneId,
            setRootLayoutNode,
            performSplit: performSplitRef.current,
            closeContentPane: closeContentPaneRef.current,
            updateContentPane: updateContentPaneRef.current,
            generateId,
            findPanePath: (node: any, paneId: string) => findNodePath(node, paneId),
        };

        try {
            const result = await executeStudioAction(actionData.action, actionData.args || {}, ctx);
            await fetch(`${BACKEND_URL}/api/studio/action_complete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ actionId, result })
            });
            console.log('[MCP] Action complete:', actionId, result.success);
        } catch (err) {
            console.error('[MCP] Action failed:', actionId, err);
            await fetch(`${BACKEND_URL}/api/studio/action_complete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ actionId, result: { success: false, error: String(err) } })
            });
        }
    };

    const connect = () => {
        eventSource = new EventSource(`${BACKEND_URL}/api/studio/actions_stream`);

        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.id && data.action && data.status === 'pending') {
                    executeAction(data.id, data);
                }
            } catch (err) {
                // Ignore parse errors
            }
        };

        eventSource.onerror = () => {
            eventSource?.close();
            // Reconnect after 2 seconds
            reconnectTimeout = setTimeout(connect, 2000);
        };
    };

    connect();

    return () => {
        eventSource?.close();
        if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
}, []);

// Message labeling handlers (defined before renderChatView to avoid reference errors)
const handleLabelMessage = useCallback((message: any) => {
    setLabelingModal({
        isOpen: true,
        message: message
    });
}, []);

const handleSaveLabel = useCallback((label: MessageLabel) => {
    MessageLabelStorage.save(label);
    setMessageLabels(prev => ({
        ...prev,
        [label.messageId]: label
    }));
    setLabelingModal({ isOpen: false, message: null });
}, []);

const handleCloseLabelingModal = useCallback(() => {
    setLabelingModal({ isOpen: false, message: null });
}, []);

// Conversation labeling handlers
const handleLabelConversation = useCallback((conversationId: string, messages: any[]) => {
    setConversationLabelingModal({
        isOpen: true,
        conversation: {
            id: conversationId,
            messages: messages
        }
    });
}, []);

const handleSaveConversationLabel = useCallback((label: ConversationLabel) => {
    ConversationLabelStorage.save(label);
    setConversationLabels(prev => ({
        ...prev,
        [label.conversationId]: label
    }));
    setConversationLabelingModal({ isOpen: false, conversation: null });
}, []);

const handleCloseConversationLabelingModal = useCallback(() => {
    setConversationLabelingModal({ isOpen: false, conversation: null });
}, []);

// Handle resend message - opens resend modal
const handleResendMessage = useCallback((messageToResend: any) => {
    if (isStreaming) {
        console.warn('Cannot resend while streaming');
        return;
    }

    // If this is an assistant message, find the parent user message
    let targetMessage = messageToResend;
    if (messageToResend.role === 'assistant') {
        const activePaneData = contentDataRef.current[activeContentPaneId];
        if (activePaneData?.chatMessages?.allMessages) {
            // Look for the parent user message by parentMessageId or cellId
            const parentId = messageToResend.parentMessageId || messageToResend.cellId;
            if (parentId) {
                const userMsg = activePaneData.chatMessages.allMessages.find(
                    (m: any) => (m.id === parentId || m.timestamp === parentId) && m.role === 'user'
                );
                if (userMsg) {
                    targetMessage = userMsg;
                }
            }
            // Fallback: find the user message just before this assistant message
            if (targetMessage.role === 'assistant') {
                const idx = activePaneData.chatMessages.allMessages.findIndex(
                    (m: any) => m.id === messageToResend.id || m.timestamp === messageToResend.timestamp
                );
                if (idx > 0) {
                    for (let i = idx - 1; i >= 0; i--) {
                        if (activePaneData.chatMessages.allMessages[i].role === 'user') {
                            targetMessage = activePaneData.chatMessages.allMessages[i];
                            break;
                        }
                    }
                }
            }
        }
    }

    setResendModal({
        isOpen: true,
        message: targetMessage,
        selectedModel: messageToResend.model || currentModel,
        selectedNPC: messageToResend.npc || currentNPC
    });
}, [isStreaming, currentModel, currentNPC, activeContentPaneId]);

// Handle broadcast - send same message to multiple model/NPC combinations
const handleBroadcast = useCallback(async (messageToResend: any, models: string[], npcs: string[]) => {
    const activePaneData = contentDataRef.current[activeContentPaneId];
    if (!activePaneData || activePaneData.contentType !== 'chat' || !activePaneData.contentId) {
        setError("Cannot broadcast: The active pane is not a valid chat window.");
        return;
    }
    if (isStreaming) {
        console.warn('Cannot broadcast while another operation is in progress.');
        return;
    }

    // Find the user message (same logic as handleResendMessage)
    let targetMessage = messageToResend;
    if (messageToResend.role === 'assistant') {
        const parentId = messageToResend.parentMessageId || messageToResend.cellId;
        if (parentId) {
            const userMsg = activePaneData.chatMessages.allMessages.find(
                (m: any) => (m.id === parentId || m.timestamp === parentId) && m.role === 'user'
            );
            if (userMsg) targetMessage = userMsg;
        }
        if (targetMessage.role === 'assistant') {
            const idx = activePaneData.chatMessages.allMessages.findIndex(
                (m: any) => m.id === messageToResend.id || m.timestamp === messageToResend.timestamp
            );
            for (let i = idx - 1; i >= 0; i--) {
                if (activePaneData.chatMessages.allMessages[i].role === 'user') {
                    targetMessage = activePaneData.chatMessages.allMessages[i];
                    break;
                }
            }
        }
    }

    const conversationId = activePaneData.contentId;
    const cellId = targetMessage.cellId || targetMessage.id || targetMessage.timestamp;
    const allMessages = activePaneData.chatMessages.allMessages;

    // Ensure user message has cellId
    const userMsgIndex = allMessages.findIndex((m: any) =>
        (m.id === targetMessage.id || m.timestamp === targetMessage.timestamp) && m.role === 'user'
    );
    if (userMsgIndex !== -1 && !allMessages[userMsgIndex].cellId) {
        allMessages[userMsgIndex].cellId = cellId;
    }

    // Create branches for each model × NPC combination
    const combinations: Array<{model: string, npc: string}> = [];
    for (const model of models) {
        for (const npc of npcs) {
            combinations.push({ model, npc });
        }
    }

    // Count existing runs
    const existingRuns = allMessages.filter((m: any) => m.cellId === cellId && m.role === 'assistant').length;

    // Launch all branches
    setIsStreaming(true);
    const newStreamIds: string[] = [];

    for (let i = 0; i < combinations.length; i++) {
        const { model, npc } = combinations[i];
        const newStreamId = generateId();
        newStreamIds.push(newStreamId);
        streamToPaneRef.current[newStreamId] = activeContentPaneId;

        const runNumber = existingRuns + i + 1;
        const selectedModelObj = availableModels.find((m: any) => m.value === model);
        const selectedNpc = availableNPCs.find((n: any) => n.value === npc);
        const providerToUse = selectedModelObj?.provider || currentProvider;

        // Create placeholder message
        const assistantPlaceholder = {
            id: newStreamId,
            role: 'assistant',
            content: '',
            isStreaming: true,
            timestamp: new Date().toISOString(),
            streamId: newStreamId,
            model: model,
            provider: providerToUse,
            npc: npc,
            cellId: cellId,
            parentMessageId: targetMessage.id || targetMessage.timestamp,
            runNumber: runNumber,
            runCount: existingRuns + combinations.length,
        };

        allMessages.push(assistantPlaceholder);

        // Update runCount on all related messages
        allMessages.forEach((m: any) => {
            if (m.cellId === cellId) {
                m.runCount = existingRuns + combinations.length;
            }
        });
    }

    activePaneData.chatMessages.messages = activePaneData.chatMessages.allMessages.slice(
        -(activePaneData.chatMessages.displayedMessageCount || 20)
    );
    setRootLayoutNode(prev => ({ ...prev }));

    // Execute all in parallel
    const executePromises = combinations.map(async ({ model, npc }, i) => {
        const newStreamId = newStreamIds[i];
        const selectedModelObj = availableModels.find((m: any) => m.value === model);
        const selectedNpc = availableNPCs.find((n: any) => n.value === npc);
        const providerToUse = selectedModelObj?.provider || currentProvider;

        try {
            await window.api.executeCommandStream({
                commandstr: targetMessage.content,
                currentPath,
                conversationId,
                model,
                provider: providerToUse,
                npc: selectedNpc?.name || npc,
                npcSource: selectedNpc?.source || 'global',
                attachments: targetMessage.attachments?.map((att: any) => ({
                    name: att.name, path: att.path, size: att.size, type: att.type
                })) || [],
                streamId: newStreamId,
                isRerun: true,
                parentMessageId: targetMessage.id || targetMessage.timestamp,
                // Pass frontend message IDs
                assistantMessageId: newStreamId,
                // Use original message's params or defaults
                temperature: targetMessage.temperature ?? 0.7,
                top_p: targetMessage.top_p ?? 0.9,
                top_k: targetMessage.top_k ?? 40,
                max_tokens: targetMessage.max_tokens ?? 4096,
            });
        } catch (err: any) {
            console.error('[BROADCAST] Error for', model, npc, err);
            const msgIndex = activePaneData.chatMessages.allMessages.findIndex((m: any) => m.id === newStreamId);
            if (msgIndex !== -1) {
                const message = activePaneData.chatMessages.allMessages[msgIndex];
                message.content = `[Error: ${err.message}]`;
                message.type = 'error';
                message.isStreaming = false;
            }
        }
    });

    await Promise.all(executePromises);
}, [isStreaming, activeContentPaneId, currentProvider, currentPath, availableModels, availableNPCs]);

// Handle switching active run for a cell - also updates expandedBranchPath
const handleSwitchRun = useCallback((cellId: string, runIndex: number) => {
    setActiveRuns(prev => ({ ...prev, [cellId]: runIndex }));

    // Get the selected run and update expandedBranchPath
    const activePaneData = contentDataRef.current[activeContentPaneId];
    if (!activePaneData?.chatMessages?.allMessages) return;

    const allMessages = activePaneData.chatMessages.allMessages;
    const siblingRuns = allMessages.filter((m: any) =>
        m.role === 'assistant' && (m.cellId === cellId || m.parentMessageId === cellId)
    );

    if (runIndex === 0) {
        // First/default branch - clear path to show tree view
        setExpandedBranchPath(prev => {
            const next = { ...prev };
            delete next[activeContentPaneId];
            return next;
        });
    } else if (siblingRuns[runIndex]) {
        // Non-default branch - build path to this run
        const selectedRun = siblingRuns[runIndex];
        const msgById = new Map(allMessages.map((m: any) => [m.id, m]));
        const path: string[] = [];
        let cur = selectedRun;
        while (cur) {
            path.unshift(cur.id);
            cur = cur.parentMessageId ? msgById.get(cur.parentMessageId) : null;
        }
        setExpandedBranchPath(prev => ({ ...prev, [activeContentPaneId]: path }));
    }
}, [activeContentPaneId]);

// Handle expanding branches to tiles
const handleExpandBranches = useCallback((cellId: string) => {
    const activePaneData = contentDataRef.current[activeContentPaneId];
    if (!activePaneData?.chatMessages?.allMessages) return;

    // Find all runs for this cell
    const siblingRuns = activePaneData.chatMessages.allMessages.filter(
        (m: any) => m.cellId === cellId && m.role === 'assistant'
    );

    if (siblingRuns.length <= 1) return;

    // Find the original user message (parent)
    const firstRun = siblingRuns[0];
    const userMessage = activePaneData.chatMessages.allMessages.find(
        (m: any) => m.id === firstRun.parentMessageId
    );

    // Get node path for the split
    const nodePath = findNodePath(rootLayoutNodeRef.current, activeContentPaneId);
    if (!nodePath) return;

    // Create a unique content ID for the branches view
    const branchesContentId = `branches_${cellId}_${Date.now()}`;

    // Store branch data that will be picked up by the new pane
    const branchData = {
        cellId,
        userMessage: userMessage || { content: 'Original prompt', role: 'user' },
        runs: siblingRuns.map((run: any) => ({
            id: run.id,
            model: run.model,
            npc: run.npc,
            provider: run.provider,
            content: run.content,
            runNumber: run.runNumber,
            timestamp: run.timestamp
        }))
    };

    // Perform split to the right with branches content type
    performSplit(nodePath, 'right', 'branches', branchesContentId);

    // After split, update the new pane's data with branch info
    setTimeout(() => {
        // Find the pane that was just created
        const newPaneId = Object.keys(contentDataRef.current).find(
            id => contentDataRef.current[id]?.contentId === branchesContentId
        );
        if (newPaneId) {
            contentDataRef.current[newPaneId].branchData = branchData;
            setRootLayoutNode(prev => ({ ...prev })); // Trigger re-render
        }
    }, 50);

}, [activeContentPaneId, findNodePath, performSplit]);

// Handle creating a conversation branch from a specific message
const handleCreateBranch = useCallback((messageIndex: number) => {
    // Get the message content to show in the modal
    const activePaneData = contentDataRef.current[activeContentPaneId!];
    if (!activePaneData || !activePaneData.chatMessages) return;

    const message = activePaneData.chatMessages.allMessages[messageIndex];
    const messageContent = typeof message?.content === 'string'
        ? message.content
        : message?.content?.[0]?.text || '';

    // Show the branch options modal instead of immediately creating a branch
    setBranchOptionsModal({
        isOpen: true,
        messageIndex,
        messageContent
    });
}, [activeContentPaneId, contentDataRef]);

// Handle branch options modal confirmation
const handleBranchOptionsConfirm = useCallback(async (options: BranchOptions) => {
    const { messageIndex, messageContent } = branchOptionsModal;
    const activePaneData = contentDataRef.current[activeContentPaneId!];
    if (!activePaneData || !activePaneData.chatMessages) return;

    // Get the user message to resend
    const userMessage = activePaneData.chatMessages.allMessages[messageIndex];

    // Helper function to send message to a model
    const sendToModel = async (modelToUse: string) => {
        const conversationId = activePaneData.contentId;
        const newStreamId = generateId();
        streamToPaneRef.current[newStreamId] = activeContentPaneId;

        const selectedModelObj = availableModels.find((m: any) => m.value === modelToUse);
        const providerToUse = selectedModelObj ? selectedModelObj.provider : currentProvider;
        const selectedNpc = availableNPCs.find((npc: any) => npc.value === currentNPC);

        // Create assistant placeholder message
        const assistantPlaceholderMessage = {
            id: newStreamId,
            role: 'assistant',
            content: '',
            isStreaming: true,
            timestamp: new Date().toISOString(),
            streamId: newStreamId,
            model: modelToUse,
            npc: currentNPC,
        };

        activePaneData.chatMessages.allMessages.push(assistantPlaceholderMessage);
        activePaneData.chatMessages.messages = activePaneData.chatMessages.allMessages.slice(
            -(activePaneData.chatMessages.displayedMessageCount || 20)
        );
        setRootLayoutNode(prev => ({ ...prev }));

        try {
            await (window as any).api.executeCommandStream({
                commandstr: messageContent,
                currentPath,
                conversationId,
                model: modelToUse,
                provider: providerToUse,
                npc: selectedNpc ? selectedNpc.name : currentNPC,
                npcSource: selectedNpc ? selectedNpc.source : 'global',
                attachments: userMessage?.attachments?.map((att: any) => ({
                    name: att.name, path: att.path, size: att.size, type: att.type
                })) || [],
                streamId: newStreamId,
                isResend: true,
                parentMessageId: userMessage?.id,
                // Pass frontend message IDs
                assistantMessageId: newStreamId,
                // Use original message's params or defaults
                temperature: userMessage?.temperature ?? 0.7,
                top_p: userMessage?.top_p ?? 0.9,
                top_k: userMessage?.top_k ?? 40,
                max_tokens: userMessage?.max_tokens ?? 4096,
            });
        } catch (err: any) {
            console.error('[BRANCH RESEND] Error:', err);
            setError(err.message);
        }
    };

    // Create the branch first
    createBranchPoint(
        messageIndex,
        activeContentPaneId,
        currentBranchId,
        conversationBranches,
        contentDataRef,
        setConversationBranches,
        setCurrentBranchId,
        setRootLayoutNode
    );

    setBranchOptionsModal({ isOpen: false, messageIndex: -1, messageContent: '' });

    // Determine which model(s) to use
    let modelToUse = currentModel;
    if (options.mode === 'different' && options.models[0]) {
        modelToUse = options.models[0];
        setCurrentModel(modelToUse);
    }

    if (options.mode === 'broadcast' && options.models.length > 1) {
        // TODO: For broadcast, we'd need to create multiple branches
        // For now, just send to first model
        setIsStreaming(true);
        await sendToModel(options.models[0]);
    } else if (options.mode === 'jinx' && options.jinxName) {
        // TODO: Execute the jinx with the message
        console.log('Applying jinx:', options.jinxName);
    } else {
        // Same model or different model - just resend
        setIsStreaming(true);
        await sendToModel(modelToUse);
    }
}, [branchOptionsModal, activeContentPaneId, currentBranchId, conversationBranches, contentDataRef,
    setConversationBranches, setCurrentBranchId, setRootLayoutNode, setCurrentModel, currentModel,
    currentProvider, currentNPC, availableModels, availableNPCs, currentPath, setError, setIsStreaming]);

// Track terminals associated with scripts for reuse
const scriptTerminalMapRef = useRef<Map<string, string>>(new Map());

// Handle running a Python script - saves first, reuses terminal if available
const handleRunScript = useCallback(async (scriptPath: string) => {
    if (!scriptPath) return;

    // First, save the file if it has unsaved changes
    const editorPaneId = Object.keys(contentDataRef.current).find(
        id => contentDataRef.current[id]?.contentId === scriptPath && contentDataRef.current[id]?.contentType === 'editor'
    );
    if (editorPaneId) {
        const paneData = contentDataRef.current[editorPaneId];
        if (paneData?.fileChanged && paneData?.fileContent) {
            await window.api?.writeFileContent?.(scriptPath, paneData.fileContent);
            paneData.fileChanged = false;
            setRootLayoutNode(p => ({ ...p }));
        }
    }

    // Check if we have an existing terminal for this script
    let terminalPaneId = scriptTerminalMapRef.current.get(scriptPath);

    // Verify the terminal still exists
    if (terminalPaneId && !contentDataRef.current[terminalPaneId]) {
        scriptTerminalMapRef.current.delete(scriptPath);
        terminalPaneId = undefined;
    }

    // If no existing terminal, create a new one
    if (!terminalPaneId) {
        terminalPaneId = `pane-${Date.now()}`;

        // Add terminal to content data
        contentDataRef.current[terminalPaneId] = {
            contentType: 'terminal',
            contentId: terminalPaneId,
            terminalId: terminalPaneId
        };

        // Add pane to layout using balanced grid
        setRootLayoutNode((prev) => addPaneToLayout(prev, terminalPaneId));

        // Track this terminal for this script
        scriptTerminalMapRef.current.set(scriptPath, terminalPaneId);
    }

    setActiveContentPaneId(terminalPaneId);

    // Wait for terminal to initialize (if new) then send the run command
    const delay = contentDataRef.current[terminalPaneId]?.terminalInitialized ? 50 : 500;
    const paneId = terminalPaneId; // Capture for closure

    setTimeout(async () => {
        // Get the script directory and filename
        const scriptDir = scriptPath.substring(0, scriptPath.lastIndexOf('/'));
        const scriptName = scriptPath.split('/').pop();

        // Get configured Python environment or use system default
        let pythonCmd = 'python3';
        try {
            const resolved = await window.api?.pythonEnvResolve?.(currentPath);
            if (resolved?.pythonPath) {
                pythonCmd = resolved.pythonPath;
            }
        } catch (e) {
            console.warn('Failed to resolve Python environment, using system python:', e);
        }

        // Send the command to run the script
        const runCommand = `cd "${scriptDir}" && ${pythonCmd} "${scriptName}"\n`;
        window.api?.writeToTerminal?.({ id: paneId, data: runCommand });

        // Mark terminal as initialized for faster re-runs
        if (contentDataRef.current[paneId]) {
            contentDataRef.current[paneId].terminalInitialized = true;
        }
    }, delay);
}, [currentPath, setRootLayoutNode, setActiveContentPaneId]);

// Handle sending selected code to an open terminal (Ctrl+Enter)
const handleSendToTerminal = useCallback((text: string) => {
    if (!text) return;

    // Find the first open terminal pane
    const terminalPaneId = Object.keys(contentDataRef.current).find(
        id => contentDataRef.current[id]?.contentType === 'terminal'
    );

    if (!terminalPaneId) {
        console.warn('No terminal pane open. Please open a terminal first.');
        return;
    }

    // Get the terminal session ID (contentId), not the pane ID
    const terminalSessionId = contentDataRef.current[terminalPaneId]?.contentId;
    if (!terminalSessionId) {
        console.warn('Terminal session not ready');
        return;
    }

    // Use bracketed paste mode so multiline code is treated as a single block
    const bracketedPaste = '\x1b[200~' + text + '\x1b[201~\n';
    window.api?.writeToTerminal?.({ id: terminalSessionId, data: bracketedPaste });
}, []);

// Render functions for different content pane types
const renderChatView = useCallback(({ nodeId }) => {
    const paneData = contentDataRef.current[nodeId];
    if (!paneData || !paneData.chatMessages) {
        return <div className="flex-1 flex items-center justify-center theme-text-muted">No messages</div>;
    }

    const allMessages = paneData.chatMessages.allMessages || [];
    const messages = paneData.chatMessages.messages || [];

    // Build a map of parentMessageId (or cellId) -> sibling runs for branch navigation
    // parentMessageId is used for loaded messages, cellId for freshly created ones
    const siblingRunsMap: { [key: string]: any[] } = {};

    allMessages.forEach((m: any) => {
        const groupKey = m.parentMessageId || m.cellId;
        if (groupKey && m.role === 'assistant') {
            if (!siblingRunsMap[groupKey]) {
                siblingRunsMap[groupKey] = [];
            }
            siblingRunsMap[groupKey].push(m);
        }
    });

    // Debug: Log broadcast groups with more than 1 sibling
    const broadcastGroups = Object.entries(siblingRunsMap).filter(([_, runs]) => runs.length > 1);
    if (broadcastGroups.length > 0) {
        console.log('[TREE DEBUG] Broadcast groups found:', broadcastGroups.length,
            'Groups:', broadcastGroups.map(([key, runs]) => ({
                groupKey: String(key || '').slice(0, 8),
                count: runs.length,
                ids: runs.map((r: any) => String(r.id || '').slice(0, 8))
            })));
    }

    // Track which group keys have been rendered as broadcast groups to avoid duplicates
    const renderedBroadcastKeys = new Set<string>();

    // Handler for toggling branch selection (multi-select)
    const handleToggleBranchSelection = (message: any, selected: boolean) => {
        console.log('[BRANCH] Toggle selection for nodeId:', nodeId, 'message:', message.id, message.npc || message.model, 'selected:', selected);
        setSelectedBranches(prev => {
            const paneMap = new Map(prev[nodeId] || []);
            if (selected) {
                paneMap.set(message.id, message);
            } else {
                paneMap.delete(message.id);
            }
            return {
                ...prev,
                [nodeId]: paneMap
            };
        });
    };

    // Get selected branch IDs for this pane - use ref to avoid stale closure
    const currentSelectedBranches = selectedBranchesRef.current;
    console.log('[DEBUG] selectedBranches ref:', Object.keys(currentSelectedBranches), 'nodeId:', nodeId, 'has entry:', !!currentSelectedBranches[nodeId], 'size:', currentSelectedBranches[nodeId]?.size);
    const selectedBranchIds = new Set(currentSelectedBranches[nodeId]?.keys() || []);

    // Handler for copying all broadcast responses
    const handleCopyAllBroadcast = (messages: any[]) => {
        const content = messages.map((m, i) =>
            `--- Response ${i + 1} (${m.npc || m.model || 'Unknown'}) ---\n${m.content || ''}`
        ).join('\n\n');
        navigator.clipboard.writeText(content);
    };

    // Build the main chain by following parentMessageId links
    const msgById = new Map(allMessages.map((m: any) => [m.id, m]));

    // Check if we have an expanded branch path for this pane
    const branchPath = expandedBranchPath[nodeId] || [];
    const isInBranch = branchPath.length > 0;

    // Handler to expand into a branch (enter a sub-chain as main view)
    const handleExpandBranch = (assistantMsgId: string) => {
        // Build path from root to this assistant message
        const path: string[] = [];
        let current = msgById.get(assistantMsgId);
        while (current) {
            path.unshift(current.id);
            current = current.parentMessageId ? msgById.get(current.parentMessageId) : null;
        }
        setExpandedBranchPath(prev => ({ ...prev, [nodeId]: path }));
    };

    // Build the chain - either from root or from branch path
    const mainChain: any[] = [];
    const processed = new Set<string>();

    // Build the chain following a specific path when expanded, or default path when not
    // branchPath contains message IDs we must follow through
    const branchPathSet = new Set(branchPath);

    // Find root user message
    const rootUserMsgs = allMessages.filter((m: any) =>
        m.role === 'user' && (!m.parentMessageId || !msgById.has(m.parentMessageId))
    );
    let current: any = rootUserMsgs[0];

    while (current) {
        if (processed.has(current.id)) break;
        processed.add(current.id);
        mainChain.push(current);

        if (current.role === 'user') {
            // Find assistant responses to this user message
            const responses = allMessages.filter((m: any) =>
                m.role === 'assistant' && m.parentMessageId === current.id
            );
            if (responses.length > 0) {
                // If expanded, prefer the response in our branch path
                if (isInBranch) {
                    const pathResponse = responses.find((r: any) => branchPathSet.has(r.id));
                    current = pathResponse || responses[0];
                } else {
                    current = responses[0];
                }
            } else {
                break;
            }
        } else {
            // Find next message - user following up on this assistant (sub-chain)
            const subChainUser = allMessages.find((m: any) =>
                m.role === 'user' && m.parentMessageId === current.id
            );
            if (subChainUser) {
                current = subChainUser;
            } else if (!isInBranch) {
                // Only continue to next main chain user if NOT in a branch
                const nextUser = allMessages.find((m: any) =>
                    m.role === 'user' &&
                    !processed.has(m.id) &&
                    (!m.parentMessageId || msgById.get(m.parentMessageId)?.role === 'user')
                );
                current = nextUser || null;
            } else {
                break;
            }
        }
    }

    // Note: The scrollable container is in LayoutNode.tsx, we just render the messages here
    return (
        <div className="p-4 space-y-4">
            {mainChain.map((msg: any, idx: number) => {
                // Get sibling runs for this message using parentMessageId or cellId
                const groupKey = msg.parentMessageId || msg.cellId;
                const siblingRuns = groupKey ? siblingRunsMap[groupKey] || [] : [];
                const activeRunIndex = groupKey ? (activeRuns[groupKey] ?? siblingRuns.findIndex((r: any) => r.id === msg.id)) : 0;

                // For assistant messages, check if this is a broadcast group OR has sub-chains
                // But skip tree view when we're in an expanded branch (show linear instead)
                if (msg.role === 'assistant' && groupKey && !isInBranch) {
                    // Skip if we've already rendered this group
                    if (renderedBroadcastKeys.has(groupKey)) {
                        return null;
                    }

                    // Check if this message has any sub-chain children
                    const hasSubChain = allMessages.some((m: any) =>
                        m.role === 'user' && m.parentMessageId === msg.id
                    );

                    // Use BroadcastResponseRow for broadcasts OR messages with sub-chains
                    if (siblingRuns.length > 1 || hasSubChain) {
                        renderedBroadcastKeys.add(groupKey);

                        // Find the user message that triggered this
                        const userMsgIdx = messages.findIndex((m: any, i: number) =>
                            i < idx && m.role === 'user'
                        );
                        const userMessage = userMsgIdx >= 0 ? messages[userMsgIdx] : null;

                        return (
                            <BroadcastResponseRow
                                key={`broadcast-${groupKey}`}
                                siblingRuns={siblingRuns}
                                userMessage={userMessage}
                                allMessages={allMessages}
                                onCopyAll={handleCopyAllBroadcast}
                                onToggleBranchSelection={handleToggleBranchSelection}
                                selectedBranchIds={selectedBranchIds}
                                onExpandBranch={handleExpandBranch}
                            />
                        );
                    }
                }

                return (
                    <ChatMessage
                        key={msg.id || msg.timestamp || idx}
                        message={msg}
                        isSelected={selectedMessages.has(msg.id || msg.timestamp)}
                        messageSelectionMode={messageSelectionMode}
                        toggleMessageSelection={(msgId) => {
                            const newSet = new Set(selectedMessages);
                            if (newSet.has(msgId)) {
                                newSet.delete(msgId);
                            } else {
                                newSet.add(msgId);
                            }
                            setSelectedMessages(newSet);
                        }}
                        handleMessageContextMenu={(e: React.MouseEvent) => handleMessageContextMenu(e, msg)}
                        searchTerm={searchTerm}
                        isCurrentSearchResult={false}
                        onResendMessage={() => handleResendMessage(msg)}
                        onBroadcast={handleBroadcast}
                        onExpandBranches={handleExpandBranches}
                        onSwitchRun={handleSwitchRun}
                        siblingRuns={siblingRuns}
                        activeRunIndex={activeRunIndex >= 0 ? activeRunIndex : 0}
                        onCreateBranch={handleCreateBranch}
                        messageIndex={idx}
                        onLabelMessage={handleLabelMessage}
                        messageLabel={messageLabels[msg.id || msg.timestamp]}
                        conversationId={paneData.contentId}
                    availableModels={availableModels}
                    availableNPCs={availableNPCs}
                    onOpenFile={(path: string) => {
                        const ext = path.split('.').pop()?.toLowerCase();
                        let contentType = 'editor';
                        if (ext === 'pdf') contentType = 'pdf';
                        else if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext || '')) contentType = 'image';
                        else if (['csv', 'xlsx', 'xls'].includes(ext || '')) contentType = 'csv';
                        else if (['docx', 'doc'].includes(ext || '')) contentType = 'docx';
                        else if (ext === 'pptx') contentType = 'pptx';
                        // Open in new tile to the right
                        const nodePath = findNodePath(rootLayoutNodeRef.current, nodeId);
                        if (nodePath) {
                            performSplit(nodePath, 'right', contentType, path);
                        }
                    }}
                />
                );
            })}
        </div>
    );
}, [selectedMessages, messageSelectionMode, searchTerm, handleLabelMessage, messageLabels, handleResendMessage, handleBroadcast, handleExpandBranches, handleSwitchRun, activeRuns, handleCreateBranch, findNodePath, performSplit, availableModels, availableNPCs, expandedBranchPath, rootLayoutNode]);

// Render branch comparison view - shows all branches side by side
const renderBranchComparisonPane = useCallback(({ nodeId }) => {
    const paneData = contentDataRef.current[nodeId];
    const branchData = paneData?.branchData;

    if (!branchData || !branchData.runs || branchData.runs.length === 0) {
        return (
            <div className="flex-1 flex items-center justify-center theme-text-muted p-4">
                <div className="text-center">
                    <GitBranch size={32} className="mx-auto mb-2 text-gray-500" />
                    <p>No branch data available</p>
                </div>
            </div>
        );
    }

    const { userMessage, runs } = branchData;
    const userContent = typeof userMessage.content === 'string'
        ? userMessage.content
        : userMessage.content?.[0]?.text || '';

    return (
        <div className="flex-1 flex flex-col overflow-hidden theme-bg-secondary">
            {/* User message header */}
            <div className="p-3 border-b theme-border bg-gray-800/50">
                <div className="flex items-center gap-2 mb-1">
                    <User size={14} className="text-blue-400" />
                    <span className="text-xs text-gray-400 uppercase">Original Prompt</span>
                </div>
                <div className="text-sm text-gray-200 whitespace-pre-wrap line-clamp-3">
                    {userContent.slice(0, 300)}{userContent.length > 300 ? '...' : ''}
                </div>
            </div>

            {/* Branch count indicator */}
            <div className="px-3 py-2 border-b theme-border bg-gray-900/50 flex items-center gap-2">
                <GitBranch size={14} className="text-purple-400" />
                <span className="text-xs text-gray-400">
                    {runs.length} Branches
                </span>
            </div>

            {/* Branches grid */}
            <div className="flex-1 overflow-auto p-2">
                <div className={`grid gap-2 h-full ${
                    runs.length <= 2 ? 'grid-cols-2' :
                    runs.length <= 4 ? 'grid-cols-2 grid-rows-2' :
                    'grid-cols-3'
                }`}>
                    {runs.map((run: any, idx: number) => {
                        const content = typeof run.content === 'string'
                            ? run.content
                            : run.content?.[0]?.text || '';

                        return (
                            <div
                                key={run.id || idx}
                                className="flex flex-col border theme-border rounded-lg overflow-hidden bg-gray-900"
                            >
                                {/* Branch header */}
                                <div className="px-2 py-1.5 bg-gray-800 border-b theme-border flex items-center gap-2 flex-shrink-0">
                                    <span className="text-xs font-semibold text-purple-400">
                                        #{idx + 1}
                                    </span>
                                    <span className="text-[10px] px-1.5 py-0.5 bg-blue-600/20 text-blue-300 rounded">
                                        {run.model?.slice(0, 20) || 'unknown'}
                                    </span>
                                    {run.npc && run.npc !== 'agent' && (
                                        <span className="text-[10px] px-1.5 py-0.5 bg-green-600/20 text-green-300 rounded">
                                            {stripSourcePrefix(run.npc)}
                                        </span>
                                    )}
                                </div>
                                {/* Branch content */}
                                <div className="flex-1 overflow-auto p-2">
                                    <div className="text-xs text-gray-300 whitespace-pre-wrap">
                                        <MarkdownRenderer content={content} />
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}, []);

const handleAICodeAction = useCallback(async (type: string, selectedText: string) => {
    if (!selectedText) return;

    const prompts = {
        ask: `Explain this code:\n\n\`\`\`\n${selectedText}\n\`\`\``,
        document: `Add comments and documentation to this code:\n\n\`\`\`\n${selectedText}\n\`\`\``,
        edit: `Refactor and improve this code:\n\n\`\`\`\n${selectedText}\n\`\`\``
    };

    const streamId = `ai-action-${Date.now()}`;

    setAiEditModal({
        isOpen: true,
        type,
        selectedText,
        selectionStart: 0,
        selectionEnd: 0,
        aiResponse: '',
        aiResponseDiff: [],
        showDiff: false,
        isLoading: true,
        streamId,
        modelForEdit: null,
        npcForEdit: null,
        customEditPrompt: prompts[type] || ''
    });

    const prompt = prompts[type];

    // Set up stream listeners
    const cleanupData = window.api?.onStreamData?.((_, data) => {
        if (data.streamId === streamId && data.chunk) {
            try {
                const chunk = data.chunk;
                let content = '';
                if (typeof chunk === 'string') {
                    if (chunk.startsWith('data:')) {
                        const dataContent = chunk.slice(5).trim();
                        if (dataContent === '[DONE]') return;
                        try {
                            const parsed = JSON.parse(dataContent);
                            content = parsed.choices?.[0]?.delta?.content || parsed.content || '';
                        } catch {
                            content = dataContent;
                        }
                    } else {
                        content = chunk;
                    }
                }
                if (content) {
                    setAiEditModal(prev => ({
                        ...prev,
                        aiResponse: (prev.aiResponse || '') + content
                    }));
                }
            } catch (e) {
                // Partial chunk, ignore
            }
        }
    });

    const cleanupComplete = window.api?.onStreamComplete?.((_, data) => {
        if (data.streamId === streamId) {
            setAiEditModal(prev => ({ ...prev, isLoading: false }));
            cleanupData?.();
            cleanupComplete?.();
        }
    });

    const cleanupError = window.api?.onStreamError?.((_, data) => {
        if (data.streamId === streamId) {
            setAiEditModal(prev => ({
                ...prev,
                aiResponse: prev.aiResponse || `Error: ${data.error}`,
                isLoading: false
            }));
            cleanupData?.();
            cleanupComplete?.();
            cleanupError?.();
        }
    });

    // Create a temporary conversation and start the stream
    const conversation = await window.api?.createConversation?.({ directory_path: currentPath });
    if (!conversation?.id) {
        setAiEditModal(prev => ({
            ...prev,
            aiResponse: 'Error: Failed to create conversation',
            isLoading: false
        }));
        return;
    }

    window.api?.executeCommandStream?.({
        streamId,
        commandstr: prompt,
        currentPath,
        conversationId: conversation.id,
        model: currentModel,
        provider: currentProvider,
        executionMode: 'chat'
    });
}, [currentModel, currentProvider, currentPath]);

const renderFileEditor = useCallback(({ nodeId }) => {
    const paneData = contentDataRef.current[nodeId];
    if (!paneData || !paneData.contentId) {
        return <div className="flex-1 flex items-center justify-center theme-text-muted">No file selected</div>;
    }

    return (
        <CodeEditor
            nodeId={nodeId}
            contentDataRef={contentDataRef}
            setRootLayoutNode={setRootLayoutNode}
            activeContentPaneId={activeContentPaneId}
            editorContextMenuPos={editorContextMenuPos}
            setEditorContextMenuPos={setEditorContextMenuPos}
            aiEditModal={aiEditModal}
            renamingPaneId={renamingPaneId}
            setRenamingPaneId={setRenamingPaneId}
            editedFileName={editedFileName}
            setEditedFileName={setEditedFileName}
            handleTextSelection={() => {}}
            handleEditorCopy={() => {}}
            handleEditorPaste={() => {}}
            handleAddToChat={() => {}}
            handleAIEdit={handleAICodeAction}
            startAgenticEdit={() => {}}
            onGitBlame={() => {}}
            setPromptModal={setPromptModal}
            currentPath={currentPath}
            onRunScript={handleRunScript}
            onSendToTerminal={handleSendToTerminal}
        />
    );
}, [activeContentPaneId, editorContextMenuPos, aiEditModal, renamingPaneId, editedFileName, setRootLayoutNode, currentPath, handleRunScript, handleSendToTerminal, handleAICodeAction]);

const renderTerminalView = useCallback(({ nodeId, shell }: { nodeId: string, shell?: string }) => {
    return (
        <TerminalView
            nodeId={nodeId}
            contentDataRef={contentDataRef}
            currentPath={currentPath}
            activeContentPaneId={activeContentPaneId}
            shell={shell}
            isDarkMode={isDarkMode}
        />
    );
}, [currentPath, activeContentPaneId, isDarkMode]);

// PDF highlight handlers
const handleCopyPdfText = useCallback((text: string) => {
    if (text) {
        navigator.clipboard.writeText(text);
    }
}, []);

const handleHighlightPdfSelection = useCallback(async (text: string, position: any, color: string = 'yellow') => {
    if (!text || !position || !activeContentPaneId) return;

    const paneData = contentDataRef.current[activeContentPaneId];
    if (!paneData || paneData.contentType !== 'pdf') return;

    const filePath = paneData.contentId;
    try {
        await (window as any).api.addPdfHighlight({
            filePath,
            text,
            position,
            annotation: '',
            color
        });
        // Trigger reload of highlights
        setPdfHighlightsTrigger(prev => prev + 1);
    } catch (err) {
        console.error('Failed to save highlight:', err);
    }
}, [activeContentPaneId]);

const handleApplyPromptToPdfText = useCallback((promptType: string, text: string) => {
    if (!text) return;
    // Could integrate with chat or AI features here
    console.log(`Apply ${promptType} to:`, text);
}, []);

const renderPdfViewer = useCallback(({ nodeId }) => {
    return (
        <PdfViewer
            nodeId={nodeId}
            contentDataRef={contentDataRef}
            currentPath={currentPath}
            activeContentPaneId={activeContentPaneId}
            pdfContextMenuPos={pdfContextMenuPos}
            setPdfContextMenuPos={setPdfContextMenuPos}
            handleCopyPdfText={handleCopyPdfText}
            handleHighlightPdfSelection={handleHighlightPdfSelection}
            handleApplyPromptToPdfText={handleApplyPromptToPdfText}
            pdfHighlights={pdfHighlights}
            setPdfHighlights={setPdfHighlights}
            pdfHighlightsTrigger={pdfHighlightsTrigger}
        />
    );
}, [currentPath, activeContentPaneId, pdfContextMenuPos, pdfHighlights, pdfHighlightsTrigger, handleCopyPdfText, handleHighlightPdfSelection, handleApplyPromptToPdfText]);

const renderCsvViewer = useCallback(({ nodeId }) => {
    return (
        <CsvViewer
            nodeId={nodeId}
            contentDataRef={contentDataRef}
            currentPath={currentPath}
            findNodePath={findNodePath}
            rootLayoutNode={rootLayoutNode}
            setDraggedItem={setDraggedItem}
            setPaneContextMenu={setPaneContextMenu}
            closeContentPane={closeContentPane}
        />
    );
}, [currentPath, rootLayoutNode, closeContentPane]);

const renderDocxViewer = useCallback(({ nodeId }) => {
    return (
        <DocxViewer
            nodeId={nodeId}
            contentDataRef={contentDataRef}
            findNodePath={findNodePath}
            rootLayoutNode={rootLayoutNode}
            setDraggedItem={setDraggedItem}
            setPaneContextMenu={setPaneContextMenu}
            closeContentPane={closeContentPane}
        />
    );
}, [closeContentPane]);

const renderPptxViewer = useCallback(({ nodeId }) => {
    return (
        <PptxViewer
            nodeId={nodeId}
            contentDataRef={contentDataRef}
            findNodePath={findNodePath}
            rootLayoutNode={rootLayoutNode}
            setDraggedItem={setDraggedItem}
            setPaneContextMenu={setPaneContextMenu}
            closeContentPane={closeContentPane}
        />
    );
}, [rootLayoutNode, closeContentPane]);

const renderLatexViewer = useCallback(({ nodeId }) => {
    return (
        <LatexViewer
            nodeId={nodeId}
            contentDataRef={contentDataRef}
            findNodePath={findNodePath}
            rootLayoutNode={rootLayoutNode}
            setDraggedItem={setDraggedItem}
            setPaneContextMenu={setPaneContextMenu}
            closeContentPane={closeContentPane}
            performSplit={performSplit}
        />
    );
}, [rootLayoutNode, closeContentPane, performSplit]);

const renderNotebookViewer = useCallback(({ nodeId }) => {
    return (
        <NotebookViewer
            nodeId={nodeId}
            contentDataRef={contentDataRef}
            findNodePath={findNodePath}
            rootLayoutNode={rootLayoutNode}
            setDraggedItem={setDraggedItem}
            setPaneContextMenu={setPaneContextMenu}
            closeContentPane={closeContentPane}
            performSplit={performSplit}
        />
    );
}, [rootLayoutNode, closeContentPane, performSplit]);

const renderExpViewer = useCallback(({ nodeId }) => {
    const paneData = contentDataRef.current[nodeId];
    const filePath = paneData?.contentId;
    return (
        <ExpViewer
            filePath={filePath}
            currentPath={currentPath}
            modelsToDisplay={modelsToDisplay}
            availableNPCs={availableNPCs}
            jinxsToDisplay={jinxsToDisplay}
        />
    );
}, [currentPath, modelsToDisplay, availableNPCs, jinxsToDisplay]);

const renderZipViewer = useCallback(({ nodeId }) => {
    return (
        <ZipViewer
            nodeId={nodeId}
            contentDataRef={contentDataRef}
            findNodePath={findNodePath}
            rootLayoutNode={rootLayoutNode}
            setDraggedItem={setDraggedItem}
            setPaneContextMenu={setPaneContextMenu}
            closeContentPane={closeContentPane}
        />
    );
}, [rootLayoutNode, closeContentPane]);

const renderPicViewer = useCallback(({ nodeId }) => {
    return (
        <PicViewer
            nodeId={nodeId}
            contentDataRef={contentDataRef}
        />
    );
}, []);

const renderMindMapViewer = useCallback(({ nodeId }) => {
    return (
        <MindMapViewer
            nodeId={nodeId}
            contentDataRef={contentDataRef}
            findNodePath={findNodePath}
            rootLayoutNode={rootLayoutNode}
            setDraggedItem={setDraggedItem}
            setPaneContextMenu={setPaneContextMenu}
            closeContentPane={closeContentPane}
        />
    );
}, [rootLayoutNode, closeContentPane]);

// Render DataLabeler pane (for pane-based viewing)
const renderDataLabelerPane = useCallback(({ nodeId }) => {
    return (
        <DataLabeler
            isPane={true}
            messageLabels={messageLabels}
            setMessageLabels={setMessageLabels}
            conversationLabels={conversationLabels}
            setConversationLabels={setConversationLabels}
        />
    );
}, [messageLabels, setMessageLabels, conversationLabels, setConversationLabels]);

// Render GraphViewer pane (for pane-based viewing)
const renderGraphViewerPane = useCallback(({ nodeId }) => {
    return (
        <GraphViewer
            isPane={true}
            currentPath={currentPath}
        />
    );
}, [currentPath]);

// Render BrowserHistoryWeb pane (browser navigation graph)
const renderBrowserGraphPane = useCallback(({ nodeId }: { nodeId: string }) => {
    return (
        <BrowserHistoryWeb
            currentPath={currentPath}
        />
    );
}, [currentPath]);

// Handle starting conversation from a viewer (PhotoViewer, etc.)
const handleStartConversationFromViewer = useCallback(async (images?: Array<{ path: string }>) => {
    console.log('[handleStartConversationFromViewer] Called with images:', images);
    if (!images || images.length === 0) {
        console.log('[handleStartConversationFromViewer] No images provided, returning');
        return;
    }

    // Helper to get mime type from extension
    const getMimeType = (filePath: string): string => {
        const ext = filePath.split('.').pop()?.toLowerCase() || '';
        const mimeTypes: { [key: string]: string } = {
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'gif': 'image/gif',
            'webp': 'image/webp',
            'bmp': 'image/bmp',
            'svg': 'image/svg+xml',
        };
        return mimeTypes[ext] || 'image/jpeg';
    };

    const attachmentsToAdd = images.map(img => ({
        id: generateId(),
        name: img.path.split('/').pop() || 'image',
        type: getMimeType(img.path),
        path: img.path,
        size: 0,
        preview: `file://${img.path}`
    }));

    console.log('[handleStartConversationFromViewer] Adding attachments:', attachmentsToAdd);
    setUploadedFiles(prev => {
        const newFiles = [...prev, ...attachmentsToAdd];
        console.log('[handleStartConversationFromViewer] New uploadedFiles:', newFiles);
        return newFiles;
    });
}, [setUploadedFiles]);

// Render DataDash pane (for pane-based viewing)
const renderDataDashPane = useCallback(({ nodeId }: { nodeId: string }) => {
    return (
        <DataDash
            initialAnalysisContext={analysisContext}
            currentPath={currentPath}
            currentModel={currentModel}
            currentProvider={currentProvider}
            currentNPC={currentNPC}
            messageLabels={messageLabels}
            setMessageLabels={setMessageLabels}
            conversationLabels={conversationLabels}
            setConversationLabels={setConversationLabels}
        />
    );
}, [analysisContext, currentPath, currentModel, currentProvider, currentNPC, messageLabels, setMessageLabels, conversationLabels, setConversationLabels]);

// Render PhotoViewer pane (for pane-based viewing)
const renderPhotoViewerPane = useCallback(({ nodeId }: { nodeId: string }) => {
    return (
        <PhotoViewer
            currentPath={currentPathRef.current}
            onStartConversation={handleStartConversationFromViewer}
        />
    );
}, [handleStartConversationFromViewer]);

// Render Scherzo (audio studio) pane
const renderScherzoPane = useCallback(({ nodeId }: { nodeId: string }) => {
    return (
        <Scherzo
            currentPath={currentPathRef.current}
        />
    );
}, []);

// Handle opening a document from the library viewer
const handleOpenDocumentFromLibrary = useCallback(async (path: string, type: 'pdf' | 'epub') => {
    // Open the document in a new pane
    const newPaneId = generateId();

    // Set content BEFORE creating layout node - never create empty panes
    contentDataRef.current[newPaneId] = {
        contentType: type,
        contentId: path
    };

    // Use balanced grid layout
    setRootLayoutNode(oldRoot => addPaneToLayout(oldRoot, newPaneId));

    setTimeout(async () => {
        await updateContentPane(newPaneId, type, path);
        setRootLayoutNode(prev => ({ ...prev }));
    }, 0);

    setActiveContentPaneId(newPaneId);
}, [updateContentPane]);

// Render LibraryViewer pane (for pane-based viewing)
const renderLibraryViewerPane = useCallback(({ nodeId }: { nodeId: string }) => {
    return (
        <LibraryViewer
            currentPath={currentPathRef.current}
            onOpenDocument={handleOpenDocumentFromLibrary}
        />
    );
}, [handleOpenDocumentFromLibrary]);

// Render HelpViewer pane
const renderHelpPane = useCallback(({ nodeId }: { nodeId: string }) => {
    return <HelpViewer appVersion={appVersion} />;
}, [appVersion]);

// Render Git pane (embedded git panel)
const renderGitPane = useCallback(({ nodeId }: { nodeId: string }) => {
    return (
        <div className="flex flex-col h-full theme-bg-primary overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b theme-border">
                <div className="flex items-center gap-3">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-purple-400">
                        <line x1="6" y1="3" x2="6" y2="15"></line>
                        <circle cx="18" cy="6" r="3"></circle>
                        <circle cx="6" cy="18" r="3"></circle>
                        <path d="M18 9a9 9 0 0 1-9 9"></path>
                    </svg>
                    <h2 className="text-lg font-semibold theme-text-primary">Git</h2>
                    {gitStatus?.branch && <span className="text-sm theme-text-muted">({gitStatus.branch})</span>}
                </div>
                <button onClick={() => loadGitStatus()} className="p-2 theme-hover rounded-lg" title="Refresh">
                    <RefreshCw size={16} />
                </button>
            </div>

            {/* Tab Bar */}
            <div className="flex border-b theme-border px-4">
                {(['status', 'diff', 'branches', 'history'] as const).map(tab => (
                    <button
                        key={tab}
                        onClick={() => {
                            setGitModalTab(tab);
                            if (tab === 'diff') loadGitDiff();
                            if (tab === 'branches') loadGitBranches();
                            if (tab === 'history') loadGitHistory();
                        }}
                        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                            gitModalTab === tab
                                ? 'border-purple-500 text-purple-400'
                                : 'border-transparent theme-text-muted hover:theme-text-primary'
                        }`}
                    >
                        {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-auto p-4">
                {!gitStatus ? (
                    <div className="text-center theme-text-muted py-8">No git repository in this directory</div>
                ) : gitModalTab === 'status' ? (
                    /* Status Tab */
                    <div className="space-y-4">
                        <div className="flex items-center gap-4 text-sm">
                            <span className="theme-text-primary font-medium">Branch: {gitStatus.branch}</span>
                            {gitStatus.ahead > 0 && <span className="text-green-400">↑{gitStatus.ahead} ahead</span>}
                            {gitStatus.behind > 0 && <span className="text-yellow-400">↓{gitStatus.behind} behind</span>}
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="theme-bg-secondary rounded-lg p-3">
                                <h3 className="text-sm font-medium text-yellow-400 mb-2">Unstaged ({(gitStatus.unstaged || []).length + (gitStatus.untracked || []).length})</h3>
                                <div className="space-y-1 max-h-48 overflow-y-auto">
                                    {(gitStatus.unstaged || []).length + (gitStatus.untracked || []).length === 0 ? (
                                        <div className="text-xs theme-text-muted">No changes</div>
                                    ) : [...(gitStatus.unstaged || []), ...(gitStatus.untracked || [])].map((file: any) => (
                                        <div key={file.path} className="flex items-center justify-between text-xs group">
                                            <button
                                                onClick={() => openFileDiffPane(file.path, file.status || 'modified')}
                                                className={`truncate flex-1 text-left hover:underline ${file.isUntracked ? 'text-gray-400' : 'text-yellow-300'}`}
                                                title="Click to view diff"
                                            >
                                                {file.path}
                                            </button>
                                            <button onClick={() => gitStageFile(file.path)} className="text-green-400 hover:text-green-300 px-2 opacity-0 group-hover:opacity-100">Stage</button>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="theme-bg-secondary rounded-lg p-3">
                                <h3 className="text-sm font-medium text-green-400 mb-2">Staged ({(gitStatus.staged || []).length})</h3>
                                <div className="space-y-1 max-h-48 overflow-y-auto">
                                    {(gitStatus.staged || []).length === 0 ? (
                                        <div className="text-xs theme-text-muted">No staged files</div>
                                    ) : (gitStatus.staged || []).map((file: any) => (
                                        <div key={file.path} className="flex items-center justify-between text-xs group">
                                            <button
                                                onClick={() => openFileDiffPane(file.path, file.status || 'staged')}
                                                className="text-green-300 truncate flex-1 text-left hover:underline"
                                                title="Click to view diff"
                                            >
                                                {file.path}
                                            </button>
                                            <button onClick={() => gitUnstageFile(file.path)} className="text-red-400 hover:text-red-300 px-2 opacity-0 group-hover:opacity-100">Unstage</button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Commit Section */}
                        <div className="theme-bg-secondary rounded-lg p-3">
                            <h3 className="text-sm font-medium theme-text-primary mb-2">Commit</h3>
                            <textarea
                                value={gitCommitMessage}
                                onChange={(e) => setGitCommitMessage(e.target.value)}
                                placeholder="Commit message..."
                                className="w-full px-3 py-2 text-sm theme-bg-primary border theme-border rounded-lg resize-none h-20"
                            />
                            <div className="flex gap-2 mt-2">
                                <button
                                    onClick={gitCommitChanges}
                                    disabled={!gitCommitMessage.trim() || (gitStatus.staged || []).length === 0}
                                    className="px-3 py-1.5 text-xs bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg"
                                >
                                    Commit
                                </button>
                                <button
                                    onClick={gitPushChanges}
                                    className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 rounded-lg"
                                >
                                    Push
                                </button>
                                <button
                                    onClick={gitPullChanges}
                                    className="px-3 py-1.5 text-xs bg-purple-600 hover:bg-purple-500 rounded-lg"
                                >
                                    Pull
                                </button>
                            </div>
                        </div>
                    </div>
                ) : gitModalTab === 'diff' ? (
                    /* Diff Tab */
                    <div className="space-y-2">
                        {gitDiffContent ? (
                            <pre className="text-xs font-mono whitespace-pre-wrap theme-bg-secondary p-3 rounded-lg overflow-auto max-h-[60vh]">
                                {(gitDiffContent.staged + '\n' + gitDiffContent.unstaged).split('\n').map((line, i) => (
                                    <div key={i} className={
                                        line.startsWith('+') && !line.startsWith('+++') ? 'text-green-400' :
                                        line.startsWith('-') && !line.startsWith('---') ? 'text-red-400' :
                                        line.startsWith('@@') ? 'text-blue-400' :
                                        'theme-text-muted'
                                    }>{line}</div>
                                ))}
                            </pre>
                        ) : (
                            <div className="text-center theme-text-muted py-8">No diff available</div>
                        )}
                    </div>
                ) : gitModalTab === 'branches' ? (
                    /* Branches Tab */
                    <div className="space-y-4">
                        <div className="flex gap-2">
                            <input
                                type="text"
                                placeholder="New branch name..."
                                value={gitNewBranchName}
                                onChange={(e) => setGitNewBranchName(e.target.value)}
                                className="flex-1 px-3 py-2 text-sm theme-bg-secondary border theme-border rounded-lg"
                            />
                            <button
                                onClick={gitCreateBranch}
                                disabled={!gitNewBranchName.trim()}
                                className="px-4 py-2 text-sm bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-lg"
                            >
                                Create
                            </button>
                        </div>

                        {/* Local Branches */}
                        <div>
                            <div className="text-xs font-medium theme-text-muted mb-2 flex items-center gap-2">
                                <span>Local Branches</span>
                                <span className="text-purple-400">({gitBranches?.all?.filter((b: string) => !b.startsWith('remotes/')).length || 0})</span>
                            </div>
                            <div className="space-y-1">
                                {gitBranches?.all?.filter((branch: string) => !branch.startsWith('remotes/')).map((branch: string) => (
                                    <div
                                        key={branch}
                                        className={`flex items-center justify-between p-2 rounded text-sm group ${
                                            branch === gitBranches.current ? 'bg-purple-900/30 border border-purple-500/30' : 'hover:bg-white/5'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2">
                                            {branch === gitBranches.current && <span className="text-purple-400">●</span>}
                                            <span className={branch === gitBranches.current ? 'text-purple-400 font-medium' : 'theme-text-primary'}>
                                                {branch}
                                            </span>
                                        </div>
                                        {branch !== gitBranches.current && (
                                            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => gitCheckoutBranch(branch)}
                                                    className="text-xs text-blue-400 hover:text-blue-300 px-2 py-0.5 rounded hover:bg-blue-900/30"
                                                >
                                                    Checkout
                                                </button>
                                                <button
                                                    onClick={() => gitDeleteBranch(branch)}
                                                    className="text-xs text-red-400 hover:text-red-300 px-2 py-0.5 rounded hover:bg-red-900/30"
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Remote Branches */}
                        {gitBranches?.all?.some((b: string) => b.startsWith('remotes/')) && (
                            <div>
                                <div className="text-xs font-medium theme-text-muted mb-2 flex items-center gap-2">
                                    <span>Remote Branches</span>
                                    <span className="text-orange-400">({gitBranches?.all?.filter((b: string) => b.startsWith('remotes/')).length || 0})</span>
                                </div>
                                <div className="space-y-1 max-h-48 overflow-y-auto">
                                    {gitBranches?.all?.filter((branch: string) => branch.startsWith('remotes/')).map((branch: string) => (
                                        <div
                                            key={branch}
                                            className="flex items-center justify-between p-2 rounded text-sm group hover:bg-white/5"
                                        >
                                            <span className="theme-text-muted text-xs">{branch.replace('remotes/', '')}</span>
                                            <button
                                                onClick={() => gitCheckoutBranch(branch.replace('remotes/origin/', ''))}
                                                className="text-xs text-blue-400 hover:text-blue-300 opacity-0 group-hover:opacity-100"
                                            >
                                                Checkout
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        {gitError && <div className="text-red-500 text-xs mt-2">{gitError}</div>}
                        {noUpstreamPrompt && (
                            <div className="mt-2 p-2 bg-amber-900/30 border border-amber-600/50 rounded text-xs">
                                <div className="text-amber-400 mb-2">Branch has no upstream. Push to origin/{noUpstreamPrompt.branch}?</div>
                                <div className="flex gap-2">
                                    <button onClick={gitPushWithUpstream} disabled={gitLoading} className="px-2 py-1 bg-blue-600 hover:bg-blue-500 rounded text-white text-[10px]">Push</button>
                                    <button onClick={gitEnableAutoSetupRemote} disabled={gitLoading} className="px-2 py-1 bg-green-600 hover:bg-green-500 rounded text-white text-[10px]" title="Sets git config push.autoSetupRemote true">Always Auto-Push</button>
                                    <button onClick={() => setNoUpstreamPrompt(null)} className="px-2 py-1 bg-gray-600 hover:bg-gray-500 rounded text-white text-[10px]">Cancel</button>
                                </div>
                            </div>
                        )}
                    </div>
                ) : gitModalTab === 'history' ? (
                    /* History Tab */
                    <div className="flex gap-4 h-full min-h-[400px]">
                        {/* Commit List */}
                        <div className="w-1/2 theme-bg-secondary rounded-lg p-3 flex flex-col">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-medium theme-text-muted">Commits</span>
                                <button onClick={loadGitHistory} className="text-xs theme-text-muted hover:theme-text-primary">
                                    <RefreshCw size={12} />
                                </button>
                            </div>
                            <div className="flex-1 overflow-y-auto space-y-1">
                                {gitCommitHistory?.length > 0 ? gitCommitHistory.map((commit: any) => (
                                    <button
                                        key={commit.hash}
                                        onClick={() => loadCommitDetails(commit.hash)}
                                        className={`w-full text-left p-2 rounded text-xs hover:bg-white/5 transition-colors ${
                                            gitSelectedCommit?.hash === commit.hash ? 'bg-purple-900/30 border border-purple-500/30' : ''
                                        }`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <span className="text-purple-400 font-mono">{commit.hash?.slice(0, 7)}</span>
                                            <span className="theme-text-muted">{new Date(commit.date).toLocaleDateString()}</span>
                                        </div>
                                        <div className="theme-text-primary truncate mt-1">{commit.message}</div>
                                        <div className="theme-text-muted mt-0.5">{commit.author_name || commit.author}</div>
                                    </button>
                                )) : (
                                    <div className="text-center theme-text-muted py-4">No commits</div>
                                )}
                            </div>
                        </div>

                        {/* Commit Details */}
                        <div className="w-1/2 theme-bg-secondary rounded-lg p-3 flex flex-col">
                            <span className="text-xs font-medium theme-text-muted mb-2">Details</span>
                            {gitSelectedCommit ? (
                                <div className="flex-1 overflow-y-auto">
                                    <div className="space-y-1 text-xs mb-3 pb-3 border-b theme-border">
                                        <div className="font-mono text-purple-400">{gitSelectedCommit.hash}</div>
                                        <div className="theme-text-primary">{gitSelectedCommit.author_name} &lt;{gitSelectedCommit.author_email}&gt;</div>
                                        <div className="theme-text-muted">{new Date(gitSelectedCommit.date).toLocaleString()}</div>
                                        <div className="theme-text-primary mt-2 whitespace-pre-wrap">{gitSelectedCommit.message}</div>
                                    </div>
                                    {gitSelectedCommit.diff && (
                                        <pre className="text-xs font-mono overflow-auto p-2 bg-black/30 rounded whitespace-pre-wrap">
                                            {gitSelectedCommit.diff.split('\n').map((line: string, i: number) => (
                                                <div
                                                    key={i}
                                                    className={
                                                        line.startsWith('+') && !line.startsWith('+++') ? 'text-green-400 bg-green-900/20' :
                                                        line.startsWith('-') && !line.startsWith('---') ? 'text-red-400 bg-red-900/20' :
                                                        line.startsWith('@@') ? 'text-cyan-400' :
                                                        line.startsWith('diff ') ? 'text-purple-400 font-bold mt-2' :
                                                        'theme-text-muted'
                                                    }
                                                >
                                                    {line}
                                                </div>
                                            ))}
                                        </pre>
                                    )}
                                </div>
                            ) : (
                                <div className="flex-1 flex items-center justify-center theme-text-muted text-sm">
                                    Select a commit to view details
                                </div>
                            )}
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    );
}, [gitStatus, gitModalTab, gitDiffContent, gitBranches, gitCommitHistory, gitCommitMessage, gitNewBranchName, gitSelectedCommit, gitError,
    setGitCommitMessage, setGitNewBranchName, setGitModalTab,
    loadGitStatus, loadGitDiff, loadGitBranches, loadGitHistory, loadFileDiff, loadCommitDetails,
    gitStageFile, gitUnstageFile, gitCommitChanges, gitPushChanges, gitPullChanges, gitCreateBranch, gitCheckoutBranch, gitDeleteBranch, openFileDiffPane]);

// Render FolderViewer pane (for pane-based folder browsing)
const renderFolderViewerPane = useCallback(({ nodeId }: { nodeId: string }) => {
    const paneData = contentDataRef.current[nodeId];
    const folderPath = paneData?.contentId || currentPathRef.current;

    const handleOpenFile = (filePath: string) => {
        // Open the file in a new pane or tab
        const ext = filePath.split('.').pop()?.toLowerCase();
        let contentType = 'editor';
        if (ext === 'pdf') contentType = 'pdf';
        else if (['csv', 'xlsx', 'xls'].includes(ext || '')) contentType = 'csv';
        else if (['docx', 'doc'].includes(ext || '')) contentType = 'docx';
        else if (ext === 'pptx') contentType = 'pptx';
        else if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext || '')) contentType = 'image';

        // Add as a new tab in the current pane
        if (paneData) {
            if (!paneData.tabs || paneData.tabs.length === 0) {
                paneData.tabs = [{
                    id: `tab_${Date.now()}_0`,
                    contentType: 'folder',
                    contentId: folderPath,
                    title: folderPath.split('/').pop() || 'Folder'
                }];
                paneData.activeTabIndex = 0;
            }
            const newTab = {
                id: `tab_${Date.now()}_${paneData.tabs.length}`,
                contentType,
                contentId: filePath,
                title: filePath.split('/').pop() || 'File'
            };
            paneData.tabs.push(newTab);
            paneData.activeTabIndex = paneData.tabs.length - 1;
            paneData.contentType = contentType;
            paneData.contentId = filePath;
            setRootLayoutNode(prev => ({ ...prev }));
        }
    };

    const handleNavigate = (newPath: string) => {
        if (paneData) {
            paneData.contentId = newPath;
            setRootLayoutNode(prev => ({ ...prev }));
        }
    };

    return (
        <FolderViewer
            folderPath={folderPath}
            onOpenFile={handleOpenFile}
            onNavigate={handleNavigate}
        />
    );
}, []);

// Render ProjectEnvEditor pane (for pane-based viewing)
const renderProjectEnvPane = useCallback(({ nodeId }: { nodeId: string }) => {
    return (
        <ProjectEnvEditor
            currentPath={currentPathRef.current}
        />
    );
}, []);

// Render DiskUsageAnalyzer pane (for pane-based viewing)
const renderDiskUsagePane = useCallback(({ nodeId }: { nodeId: string }) => {
    return (
        <DiskUsageAnalyzer
            path={currentPathRef.current}
            isDarkMode={isDarkMode}
            isPane={true}
        />
    );
}, [isDarkMode]);

// Render MemoryManager pane (for pane-based viewing)
const renderMemoryManagerPane = useCallback(({ nodeId }: { nodeId: string }) => {
    return (
        <MemoryManager
            isPane={true}
            currentPath={currentPathRef.current}
            currentNpc={currentNPC}
        />
    );
}, [currentNPC]);

// Render CronDaemonPanel pane (for pane-based viewing)
const renderCronDaemonPane = useCallback(({ nodeId }: { nodeId: string }) => {
    return (
        <CronDaemonPanel
            isPane={true}
            currentPath={currentPathRef.current}
            npcList={availableNPCs}
            jinxList={availableJinxs}
        />
    );
}, [availableNPCs, availableJinxs]);

// Markdown Preview Component (needs to be a proper component for hooks)
const MarkdownPreviewContent: React.FC<{ filePath: string }> = ({ filePath }) => {
    const [content, setContent] = useState<string>('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (filePath) {
            setLoading(true);
            window.api.readFileContent(filePath).then((result: any) => {
                setContent(result.content || '');
                setLoading(false);
            }).catch(() => {
                setContent('Error loading file');
                setLoading(false);
            });
        }
    }, [filePath]);

    if (loading) {
        return (
            <div className="flex-1 flex items-center justify-center theme-text-muted">
                Loading...
            </div>
        );
    }

    return (
        <div className="flex-1 overflow-auto p-4 theme-bg-primary">
            <div className="prose prose-invert max-w-none">
                <MarkdownRenderer content={content} />
            </div>
        </div>
    );
};

// Render Markdown Preview pane
const renderMarkdownPreviewPane = useCallback(({ nodeId }: { nodeId: string }) => {
    const paneData = contentDataRef.current[nodeId];
    const filePath = paneData?.contentId;

    if (!filePath) {
        return (
            <div className="flex-1 flex items-center justify-center theme-text-muted">
                No file selected
            </div>
        );
    }

    return <MarkdownPreviewContent filePath={filePath} />;
}, []);

// Render HTML Preview pane - renders HTML file in an iframe
const renderHtmlPreviewPane = useCallback(({ nodeId }: { nodeId: string }) => {
    const paneData = contentDataRef.current[nodeId];
    const filePath = paneData?.contentId;

    if (!filePath) {
        return (
            <div className="flex-1 flex items-center justify-center theme-text-muted">
                No file selected
            </div>
        );
    }

    // Use file:// protocol to load local HTML files
    const fileUrl = `file://${filePath}`;

    return (
        <div className="flex-1 flex flex-col min-h-0">
            <div className="px-3 py-1.5 theme-bg-tertiary border-b theme-border flex items-center gap-2">
                <Globe size={14} className="text-orange-400" />
                <span className="text-xs theme-text-primary truncate">{filePath.split('/').pop()}</span>
                <button
                    onClick={() => {
                        // Reload the iframe
                        const iframe = document.querySelector(`iframe[data-html-preview="${nodeId}"]`) as HTMLIFrameElement;
                        if (iframe) iframe.src = iframe.src;
                    }}
                    className="ml-auto p-1 theme-hover rounded"
                    title="Reload"
                >
                    <RotateCcw size={12} />
                </button>
            </div>
            <iframe
                data-html-preview={nodeId}
                src={fileUrl}
                className="flex-1 w-full bg-white"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                title={`HTML Preview: ${filePath.split('/').pop()}`}
            />
        </div>
    );
}, []);

// Render DBTool pane (for pane-based viewing)
const renderDBToolPane = useCallback(({ nodeId }: { nodeId: string }) => {
    return (
        <DBTool
            currentPath={currentPath}
            currentModel={currentModel}
            currentProvider={currentProvider}
            currentNPC={currentNPC}
        />
    );
}, [currentPath, currentModel, currentProvider, currentNPC]);

// Tile Jinx runtime scope - dependencies available to compiled jinx code
// NOTE: Don't include the MAIN tile components (the ones defined by jinx files themselves)
// DO include utility components and sub-components that tiles may depend on
const tileJinxScope = useMemo(() => ({
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
    // npcts UI components and utilities
    Modal, Tabs, Card, Button, Input, Select, ImageEditor,
    createWindowApiDatabaseClient, QueryChart,
    WidgetBuilder, WidgetGrid, Widget, DataTable,
    Lightbox, ImageGrid, StarRating, RangeSlider, SortableList,
    // Chart.js components (Chart is alias for ChartJS)
    Pie, Bar, Line, ChartJS, Chart: ChartJS,
    ArcElement, Tooltip, Legend,
    CategoryScale, LinearScale, BarElement, PointElement, LineElement,
    // Utility components jinx files may use
    AutosizeTextarea,
    ForceGraph2D,
    // Sub-components that tiles may USE (not the main tile components they DEFINE)
    MemoryManagement,
    ActivityIntelligence,
    LabeledDataManager,
    KnowledgeGraphEditor,
    CtxEditor,
    PythonEnvSettings,
    NPCTeamMenu,
    JinxMenu,
    McpServerMenu,
    // All lucide icons
    ...LucideIcons,
    // Real window, console, and JS built-ins (in case icons shadow them)
    window,
    console,
    Map: globalThis.Map,
    Set: globalThis.Set,
}), []);

// Compile tile jinx code for runtime rendering
const compileTileJinx = useCallback(async (code: string): Promise<string> => {
    try {
        // Find the exported component name
        const exportDefaultMatch = code.match(/export\s+default\s+(\w+)\s*;?\s*$/m);
        const exportDefaultFuncMatch = code.match(/export\s+default\s+(?:function|const)\s+(\w+)/);
        let componentName = exportDefaultMatch?.[1] || exportDefaultFuncMatch?.[1];
        if (!componentName) {
            const funcMatch = code.match(/(?:const|function)\s+(\w+)\s*(?::\s*React\.FC)?[=(:]/);
            componentName = funcMatch?.[1] || 'Component';
        }

        // Clean the code
        let cleaned = code.replace(/\/\*\*[\s\S]*?\*\/\s*\n?/, '');
        cleaned = cleaned.replace(/^#[^\n]*\n/gm, '');
        cleaned = cleaned.replace(/^import\s+.*?['"];?\s*$/gm, '');
        cleaned = cleaned.replace(/^export\s+(default\s+)?/gm, '');

        // Compile TypeScript
        const result = await (window as any).api?.transformTsx?.(cleaned);
        if (!result?.success) {
            return `render(<div className="p-4 text-red-400">Compile Error: ${result?.error || 'Unknown error'}</div>)`;
        }

        let compiled = result.output || '';
        // Remove module artifacts
        compiled = compiled.replace(/["']use strict["'];?\n?/g, '');
        compiled = compiled.replace(/Object\.defineProperty\(exports[\s\S]*?\);/g, '');
        compiled = compiled.replace(/exports\.\w+\s*=\s*/g, '');
        compiled = compiled.replace(/exports\.default\s*=\s*\w+;?/g, '');
        compiled = compiled.replace(/(?:var|const|let)\s+\w+\s*=\s*require\([^)]+\);?\n?/g, '');
        compiled = compiled.replace(/require\([^)]+\)/g, '{}');
        compiled = compiled.replace(/\w+_\d+\.(\w+)/g, '$1');
        compiled = compiled.replace(/react_1\.(\w+)/g, '$1');

        // Render with real props
        const propsCode = `{
            onClose: () => console.log('Tile closed'),
            isPane: true,
            isOpen: true,
            isModal: false,
            embedded: true,
            projectPath: '${currentPath || ''}',
            currentPath: '${currentPath || ''}',
            theme: { bg: '#1a1a2e', fg: '#fff', accent: '#4a9eff' }
        }`;
        return `${compiled}\n\nrender(<${componentName} {...${propsCode}} />)`;
    } catch (err: any) {
        return `render(<div className="p-4 text-red-400">Error: ${err.message}</div>)`;
    }
}, [currentPath]);

// Render Tile Jinx pane - uses external stable component to prevent state loss
const renderTileJinxPane = useCallback(({ nodeId }: { nodeId: string }) => {
    const paneData = contentDataRef.current[nodeId];
    const jinxFile = paneData?.jinxFile;

    return (
        <TileJinxContentExternal
            key={nodeId}
            jinxFile={jinxFile}
            tileJinxScope={tileJinxScope}
            currentPath={currentPathRef.current}
        />
    );
}, [tileJinxScope]);

// Use the PDF highlights loader from PdfViewer module
useEffect(() => {
    loadPdfHighlightsForActivePane(activeContentPaneId, contentDataRef, setPdfHighlights);
}, [activeContentPaneId, pdfHighlightsTrigger]);

    useEffect(() => {
        if (currentPath) {
            loadAvailableNPCs(currentPath, setNpcsLoading, setNpcsError, setAvailableNPCs);
        }
    }, [currentPath]);
    useEffect(() => {
        const handleGlobalDismiss = (e) => {
            if (e.key === 'Escape') {
                // Close context menus
                setContextMenuPos(null);
                setFileContextMenuPos(null);
                setMessageContextMenuPos(null);
                setEditorContextMenuPos(null);
                setBrowserContextMenu({ isOpen: false, x: 0, y: 0, selectedText: '' });
                // Close status bar modals
                setGitModalOpen(false);
                setWorkspaceModalOpen(false);
                setSearchResultsModalOpen(false);
                // Exit zen mode
                setZenModePaneId(null);
            }
        };

        window.addEventListener('keydown', handleGlobalDismiss);
        return () => {
            window.removeEventListener('keydown', handleGlobalDismiss);
        };
    }, []);

    const directoryConversationsRef = useRef(directoryConversations);
    useEffect(() => {
        directoryConversationsRef.current = directoryConversations;
    }, [directoryConversations]);

    useEffect(() => {
        activeConversationRef.current = activeConversationId;
    }, [activeConversationId]);

    useEffect(() => {
        document.body.classList.toggle('dark-mode', isDarkMode);
        document.body.classList.toggle('light-mode', !isDarkMode);
    }, [isDarkMode]);



    // Load history when path changes
    useEffect(() => {
        if (currentPath) {
            loadWebsiteHistory();
        }
    }, [currentPath, loadWebsiteHistory]);

    // Track open browsers - only update if actually changed
    useEffect(() => {
        const browsers = Object.entries(contentDataRef.current)
            .filter(([_, data]) => data.contentType === 'browser')
            .map(([paneId, data]) => ({
                paneId,
                url: data.browserUrl,
                viewId: data.contentId,
                title: data.browserTitle || 'Loading...'
            }));
        // Only update if browser list actually changed (compare by stringifying)
        setOpenBrowsers(prev => {
            const prevStr = JSON.stringify(prev);
            const newStr = JSON.stringify(browsers);
            return prevStr === newStr ? prev : browsers;
        });
    }, [rootLayoutNode]); // Re-check when layout changes



const renderMessageContextMenu = () => (
    messageContextMenuPos && (
        <>
            {/* Backdrop to catch outside clicks */}
            <div
                className="fixed inset-0 z-40"
                onClick={() => setMessageContextMenuPos(null)}
            />
            <div
                className="fixed theme-bg-secondary theme-border border rounded shadow-lg py-1 z-50"
                style={{ top: messageContextMenuPos.y, left: messageContextMenuPos.x }}
                onMouseLeave={() => setMessageContextMenuPos(null)}
            >
                {/* Show copy option if there's selected text */}
                {messageContextMenuPos.selectedText && (
                    <>
                        <button
                            onClick={() => {
                                navigator.clipboard.writeText(messageContextMenuPos.selectedText);
                                setMessageContextMenuPos(null);
                            }}
                            className="flex items-center gap-2 px-4 py-2 theme-hover w-full text-left theme-text-primary text-xs"
                        >
                            <Edit size={14} />
                            <span>Copy Selected Text</span>
                        </button>
                        <div className="border-t theme-border my-1"></div>
                    </>
                )}
                
                <button
                    onClick={() => handleApplyPromptToMessages('summarize')}
                    className="flex items-center gap-2 px-4 py-2 theme-hover w-full text-left theme-text-primary text-xs"
                >
                    <MessageSquare size={14} />
                    <span>Summarize in New Convo ({selectedMessages.size})</span>
                </button>


                {/* Delete option */}
                <div className="border-t theme-border my-1"></div>
                <button
                    onClick={handleDeleteSelectedMessages}
                    className="flex items-center gap-2 px-4 py-2 theme-hover w-full text-left text-red-400 text-xs"
                >
                    <Trash size={14} />
                    <span>Delete Messages ({selectedMessages.size})</span>
                </button>
            </div>
        </>
    )
);


  // Helper to find an empty pane that can be reused (kept for backwards compat but should not be used)
  const findEmptyPaneId = useCallback(() => {
    // DISABLED - we should never have empty panes
    return null;
  }, []);

  const createAndAddPaneNodeToLayout = useCallback((contentTypeOrOptions: string | { contentType: string; contentId?: string | null; diffStatus?: string; [key: string]: any }, contentId?: string | null) => {
  // Support both (contentType, contentId) and ({ contentType, contentId, ...extras })
  let contentType: string;
  let finalContentId: string | null;
  let extraProps: Record<string, any> = {};

  if (typeof contentTypeOrOptions === 'object') {
    contentType = contentTypeOrOptions.contentType;
    finalContentId = contentTypeOrOptions.contentId || null;
    // Extract any extra properties (exclude id since we generate our own)
    const { contentType: _, contentId: __, id: ___, ...rest } = contentTypeOrOptions;
    extraProps = rest;
  } else {
    contentType = contentTypeOrOptions;
    finalContentId = contentId || null;
  }

  // NEVER create a pane without contentType
  if (!contentType) {
    console.error('[createAndAddPaneNodeToLayout] Cannot create pane without contentType!');
    return null;
  }

  const newPaneId = generateId();

  // Set content BEFORE creating layout node - never create empty panes
  contentDataRef.current[newPaneId] = {
    contentType,
    contentId: finalContentId,
    ...extraProps
  };

  setRootLayoutNode(oldRoot => {
    if (!oldRoot) {
      return { id: newPaneId, type: 'content' };
    }

    // Collect all existing pane IDs from the layout
    const collectPaneIds = (node: any): string[] => {
      if (!node) return [];
      if (node.type === 'content') return [node.id];
      if (node.type === 'split') {
        return node.children.flatMap((child: any) => collectPaneIds(child));
      }
      return [];
    };

    const existingPaneIds = collectPaneIds(oldRoot);
    const allPaneIds = [...existingPaneIds, newPaneId];
    const totalPanes = allPaneIds.length;

    // Calculate balanced grid dimensions (rows and cols differ by at most 1)
    const cols = Math.ceil(Math.sqrt(totalPanes));
    const rows = Math.ceil(totalPanes / cols);

    // Build a balanced grid layout
    // Structure: vertical split of rows, each row is horizontal split of columns
    const buildGridLayout = (paneIds: string[], numRows: number, numCols: number): any => {
      if (paneIds.length === 0) return null;
      if (paneIds.length === 1) {
        return { id: paneIds[0], type: 'content' };
      }

      // Create rows
      const rowNodes: any[] = [];
      let paneIndex = 0;

      for (let r = 0; r < numRows && paneIndex < paneIds.length; r++) {
        // Calculate how many panes in this row (distribute evenly)
        const panesInThisRow = Math.min(numCols, paneIds.length - paneIndex);
        const rowPaneIds = paneIds.slice(paneIndex, paneIndex + panesInThisRow);
        paneIndex += panesInThisRow;

        if (rowPaneIds.length === 1) {
          // Single pane in row - just the content node
          rowNodes.push({ id: rowPaneIds[0], type: 'content' });
        } else {
          // Multiple panes in row - horizontal split
          rowNodes.push({
            id: generateId(),
            type: 'split',
            direction: 'horizontal',
            children: rowPaneIds.map(id => ({ id, type: 'content' })),
            sizes: new Array(rowPaneIds.length).fill(100 / rowPaneIds.length)
          });
        }
      }

      if (rowNodes.length === 1) {
        return rowNodes[0];
      }

      // Multiple rows - vertical split
      return {
        id: generateId(),
        type: 'split',
        direction: 'vertical',
        children: rowNodes,
        sizes: new Array(rowNodes.length).fill(100 / rowNodes.length)
      };
    };

    return buildGridLayout(allPaneIds, rows, cols);
  });

  setActiveContentPaneId(newPaneId);
  return newPaneId;
}, []);
  
  
   



    useEffect(() => {
        // This effect ensures contentDataRef.current is always in sync with rootLayoutNode.
        // It runs whenever rootLayoutNode changes.
        if (rootLayoutNode) {
            // Create a temporary object to hold the synchronized content data.
            const synchronizedContentData = { ...contentDataRef.current };

            // Call the sync function. It will modify synchronizedContentData in place.
            const originalContentDataKeys = Object.keys(contentDataRef.current);

            const updatedLayoutNode = syncLayoutWithContentData(rootLayoutNode, synchronizedContentData);

            const newContentDataKeys = Object.keys(synchronizedContentData);

            // Check if contentDataRef.current actually changed (added/removed keys)
            if (originalContentDataKeys.length !== newContentDataKeys.length ||
                !originalContentDataKeys.every(key => synchronizedContentData.hasOwnProperty(key)) ||
                !newContentDataKeys.every(key => contentDataRef.current.hasOwnProperty(key))
            ) {
                console.log('[EFFECT] Updating contentDataRef.current and forcing re-render after sync.');
                contentDataRef.current = synchronizedContentData;
                // Force a re-render since contentDataRef.current (a ref) was updated.
                setRootLayoutNode(prev => ({ ...prev }));
            }

            // Only update layout if the NUMBER of panes actually changed
            // (Don't overwrite based on reference inequality alone - that causes issues)
            const originalPaneCount = collectPaneIds(rootLayoutNode).length;
            const updatedPaneCount = collectPaneIds(updatedLayoutNode).length;
            if (updatedPaneCount !== originalPaneCount) {
                console.log('[EFFECT] Layout pane count changed, updating layout:', originalPaneCount, '->', updatedPaneCount);
                setRootLayoutNode(updatedLayoutNode);
            }

        } else {
            // If rootLayoutNode is null, ensure contentDataRef is also empty.
            if (Object.keys(contentDataRef.current).length > 0) {
                console.log('[EFFECT] rootLayoutNode is null, clearing contentDataRef.current.');
                contentDataRef.current = {};
                setRootLayoutNode(prev => ({ ...prev })); // Force re-render
            }
        }
    }, [rootLayoutNode, syncLayoutWithContentData]);


    const handleCreateNewFolder = () => {
        setPromptModal({
            isOpen: true,
            title: 'Create New Folder',
            message: 'Enter the name for the new folder.',
            defaultValue: 'new-folder',
            onConfirm: async (folderName) => {
                if (!folderName || !folderName.trim()) return;
    
                const newFolderPath = normalizePath(`${currentPath}/${folderName}`);
                
                try {
                    const response = await window.api.createDirectory(newFolderPath);
                    
                    if (response?.error) {
                        throw new Error(response.error);
                    }
    
                   
                    await loadDirectoryStructure(currentPath);
    
                } catch (err) {
                    console.error('Error creating new folder:', err);
                    setError(`Failed to create folder: ${err.message}`);
                }
            },
        });
    };

    // Handle file rename from PaneHeader
    const handleConfirmRename = useCallback(async (paneId: string, oldFilePath: string) => {
        if (!editedFileName || !oldFilePath) {
            setRenamingPaneId(null);
            return;
        }

        const directory = oldFilePath.substring(0, oldFilePath.lastIndexOf('/'));
        const newFilePath = normalizePath(`${directory}/${editedFileName}`);

        if (newFilePath === oldFilePath) {
            setRenamingPaneId(null);
            return;
        }

        try {
            const result = await window.api.renameFile(oldFilePath, newFilePath);
            if (result?.error) throw new Error(result.error);

            // Update the content pane with new file path
            if (contentDataRef.current[paneId]) {
                contentDataRef.current[paneId].contentId = newFilePath;
            }

            // Refresh directory structure directly
            if (currentPath) {
                const structureResult = await window.api.readDirectoryStructure(currentPath);
                if (structureResult && !structureResult.error) {
                    setFolderStructure(structureResult);
                }
            }
            setRootLayoutNode(p => ({ ...p }));
        } catch (err: any) {
            setError(`Failed to rename file: ${err.message}`);
        } finally {
            setRenamingPaneId(null);
            setEditedFileName('');
        }
    }, [editedFileName, currentPath]);

    const createNewTerminal = useCallback(async (shellType: 'system' | 'npcsh' | 'guac' | 'python3' = 'system') => {
        const newTerminalId = `term_${generateId()}`;

        // Check for empty pane to reuse first
        const emptyPaneId = findEmptyPaneId();
        if (emptyPaneId) {
            // Set contentType immediately to prevent sync from removing pane
            contentDataRef.current[emptyPaneId] = { shellType, contentType: 'terminal', contentId: newTerminalId };
            await updateContentPane(emptyPaneId, 'terminal', newTerminalId);
            setActiveContentPaneId(emptyPaneId);
            setRootLayoutNode(prev => ({ ...prev }));
            return;
        }

        const newPaneId = generateId();

        // Set content data with contentType BEFORE layout update to prevent sync removal
        contentDataRef.current[newPaneId] = { shellType, contentType: 'terminal', contentId: newTerminalId };

        // Use balanced grid layout
        setRootLayoutNode(oldRoot => addPaneToLayout(oldRoot, newPaneId));

        // Then update content (shellType is already in paneData from above)
        setTimeout(async () => {
            await updateContentPane(newPaneId, 'terminal', newTerminalId);
            setRootLayoutNode(prev => ({ ...prev }));
        }, 0);

        setActiveContentPaneId(newPaneId);
        setActiveConversationId(null);
        setCurrentFile(null);
    }, [updateContentPane, findEmptyPaneId]);

    // Create a new experiment (.exp)
    const createNewExperiment = useCallback(async () => {
        // Create a new untitled experiment in the current directory
        const timestamp = Date.now();
        const notebookName = `experiment-${timestamp}.exp`;
        const notebookPath = `${currentPath}/${notebookName}`;

        // Create empty experiment structure with scientific method sections
        const emptyExp = {
            exp_version: '1.0',
            created_at: new Date().toISOString(),
            modified_at: new Date().toISOString(),
            hypothesis: '',
            sections: [
                { id: 'hypothesis', type: 'hypothesis', title: 'Hypothesis', order: 0, blocks: [] },
                { id: 'methods', type: 'methods', title: 'Methods', order: 1, blocks: [] },
                { id: 'data', type: 'data', title: 'Data', order: 2, blocks: [] },
                { id: 'results', type: 'results', title: 'Results', order: 3, blocks: [] },
                { id: 'discussion', type: 'discussion', title: 'Discussion', order: 4, blocks: [] },
                { id: 'conclusion', type: 'conclusion', title: 'Conclusion', order: 5, blocks: [] },
            ],
            status: 'draft',
            conclusion: null,
            tags: [],
            session_ids: [],
            notes: [],
            artifacts: []
        };

        try {
            await (window as any).api.writeFileContent(notebookPath, JSON.stringify(emptyExp, null, 2));

            // Check for empty pane to reuse first
            const emptyPaneId = findEmptyPaneId();
            if (emptyPaneId) {
                await updateContentPane(emptyPaneId, 'exp', notebookPath);
                setActiveContentPaneId(emptyPaneId);
                setRootLayoutNode(prev => ({ ...prev }));
                return;
            }

            const newPaneId = generateId();

            // Set content BEFORE layout to prevent empty pane
            contentDataRef.current[newPaneId] = { contentType: 'exp', contentId: notebookPath };

            // Use balanced grid layout
            setRootLayoutNode(oldRoot => addPaneToLayout(oldRoot, newPaneId));

            setActiveContentPaneId(newPaneId);
            setActiveConversationId(null);
            setCurrentFile(notebookPath);
        } catch (err: any) {
            setError(`Failed to create notebook: ${err.message}`);
        }
    }, [currentPath, updateContentPane, findEmptyPaneId]);

    // Create DataLabeler pane
    const createDataLabelerPane = useCallback(async () => {
        const newPaneId = generateId();
        contentDataRef.current[newPaneId] = { contentType: 'data-labeler', contentId: 'data-labeler' };
        setRootLayoutNode(oldRoot => addPaneToLayout(oldRoot, newPaneId));
        setActiveContentPaneId(newPaneId);
    }, []);

    // Create GraphViewer pane
    const createGraphViewerPane = useCallback(async () => {
        const newPaneId = generateId();
        contentDataRef.current[newPaneId] = { contentType: 'graph-viewer', contentId: 'graph-viewer' };
        setRootLayoutNode(oldRoot => addPaneToLayout(oldRoot, newPaneId));
        setActiveContentPaneId(newPaneId);
    }, []);

    // Create MemoryManager pane
    const createMemoryManagerPane = useCallback(async () => {
        const newPaneId = generateId();
        contentDataRef.current[newPaneId] = { contentType: 'memory-manager', contentId: 'memory-manager' };
        setRootLayoutNode(oldRoot => addPaneToLayout(oldRoot, newPaneId));
        setActiveContentPaneId(newPaneId);
    }, []);

    // Create CronDaemon pane
    const createCronDaemonPane = useCallback(async () => {
        const newPaneId = generateId();
        contentDataRef.current[newPaneId] = { contentType: 'cron-daemon', contentId: 'cron-daemon' };
        setRootLayoutNode(oldRoot => addPaneToLayout(oldRoot, newPaneId));
        setActiveContentPaneId(newPaneId);
    }, []);

    // Create Search pane
    const createSearchPane = useCallback(async (initialQuery?: string) => {
        const newPaneId = generateId();
        contentDataRef.current[newPaneId] = { contentType: 'search', contentId: 'search', initialQuery: initialQuery || '' };
        setRootLayoutNode(oldRoot => addPaneToLayout(oldRoot, newPaneId));
        setActiveContentPaneId(newPaneId);
    }, []);

    // Create BrowserHistoryWeb pane (browser navigation graph)
    const createBrowserGraphPane = useCallback(async () => {
        const newPaneId = generateId();
        contentDataRef.current[newPaneId] = { contentType: 'browsergraph', contentId: 'browsergraph' };
        setRootLayoutNode(oldRoot => addPaneToLayout(oldRoot, newPaneId));
        setActiveContentPaneId(newPaneId);
    }, []);

    // Create DataDash pane
    const createDataDashPane = useCallback(async () => {
        const newPaneId = generateId();
        contentDataRef.current[newPaneId] = { contentType: 'datadash', contentId: 'datadash' };
        setRootLayoutNode(oldRoot => addPaneToLayout(oldRoot, newPaneId));
        setActiveContentPaneId(newPaneId);
    }, []);

    // Create DBTool pane
    const createDBToolPane = useCallback(async () => {
        const newPaneId = generateId();
        contentDataRef.current[newPaneId] = { contentType: 'dbtool', contentId: 'dbtool' };
        setRootLayoutNode(oldRoot => addPaneToLayout(oldRoot, newPaneId));
        setTimeout(async () => {
            await updateContentPane(newPaneId, 'dbtool', 'dbtool');
            setRootLayoutNode(prev => ({ ...prev }));
        }, 0);
        setActiveContentPaneId(newPaneId);
    }, [updateContentPane]);

    // Create Tile Jinx pane - loads and runs a jinx file at runtime
    const createTileJinxPane = useCallback(async (jinxFile: string) => {
        const newPaneId = generateId();
        contentDataRef.current[newPaneId] = {
            contentType: 'tilejinx',
            contentId: jinxFile,
            jinxFile: jinxFile,
        };
        setRootLayoutNode(oldRoot => addPaneToLayout(oldRoot, newPaneId));
        setActiveContentPaneId(newPaneId);
    }, []);

    // Create PhotoViewer pane
    const createPhotoViewerPane = useCallback(async () => {
        const newPaneId = generateId();
        contentDataRef.current[newPaneId] = { contentType: 'photoviewer', contentId: 'photoviewer' };
        setRootLayoutNode(oldRoot => addPaneToLayout(oldRoot, newPaneId));
        setActiveContentPaneId(newPaneId);
    }, []);

    // Create Scherzo (audio studio) pane
    const createScherzoPane = useCallback(async () => {
        const newPaneId = generateId();
        contentDataRef.current[newPaneId] = { contentType: 'scherzo', contentId: 'scherzo' };
        setRootLayoutNode(oldRoot => addPaneToLayout(oldRoot, newPaneId));
        setActiveContentPaneId(newPaneId);
    }, []);

    // Create LibraryViewer pane
    const createLibraryViewerPane = useCallback(async () => {
        const newPaneId = generateId();
        contentDataRef.current[newPaneId] = { contentType: 'library', contentId: 'library' };
        setRootLayoutNode(oldRoot => addPaneToLayout(oldRoot, newPaneId));
        setActiveContentPaneId(newPaneId);
    }, []);

    // Create ProjectEnv pane
    const createProjectEnvPane = useCallback(async () => {
        const newPaneId = generateId();
        contentDataRef.current[newPaneId] = { contentType: 'projectenv', contentId: 'projectenv' };
        setRootLayoutNode(oldRoot => addPaneToLayout(oldRoot, newPaneId));
        setActiveContentPaneId(newPaneId);
    }, []);

    // Create DiskUsage pane
    const createDiskUsagePane = useCallback(async () => {
        const newPaneId = generateId();
        contentDataRef.current[newPaneId] = { contentType: 'diskusage', contentId: 'diskusage' };
        setRootLayoutNode(oldRoot => addPaneToLayout(oldRoot, newPaneId));
        setActiveContentPaneId(newPaneId);
    }, []);

    // Create Help pane
    const createHelpPane = useCallback(async () => {
        const newPaneId = generateId();
        contentDataRef.current[newPaneId] = { contentType: 'help', contentId: 'help' };
        setRootLayoutNode(oldRoot => addPaneToLayout(oldRoot, newPaneId));
        setActiveContentPaneId(newPaneId);
    }, []);

    const handleGlobalDragStart = useCallback((e, item) => {
    Object.values(contentDataRef.current).forEach(paneData => {
        if (paneData.contentType === 'browser' && paneData.contentId) {
        window.api.browserSetVisibility({ viewId: paneData.contentId, visible: false });
        }
  });

    // Set data transfer for context files panel
    if (item.type === 'file' && item.id) {
        e.dataTransfer.setData('text/plain', item.id);
        e.dataTransfer.setData('application/json', JSON.stringify({
            type: 'sidebar-file',
            path: item.id
        }));
    }

    if (item.type === 'pane') {
        const paneNodePath = findNodePath(rootLayoutNode, item.id);
        if (paneNodePath) {
        setDraggedItem({ type: 'pane', id: item.id, nodePath: paneNodePath });
        } else {
        setDraggedItem(null);
        }
    } else {
        setDraggedItem(item);
    }
    }, [rootLayoutNode, findNodePath]);

const handleGlobalDragEnd = () => {
  setDraggedItem(null);
  setDropTarget(null);

  Object.values(contentDataRef.current).forEach(paneData => {
    if (paneData.contentType === 'browser' && paneData.contentId) {
      window.api.browserSetVisibility({ viewId: paneData.contentId, visible: true });
    }
  });
};    
  

  const createNewBrowser = useCallback(async (url = null) => {
    // Check for workspace-specific homepage in .env file
    let defaultHomepage = 'https://wikipedia.org';
    if (currentPath) {
        try {
            const envResult = await (window as any).api?.readFileContent?.(`${currentPath}/.env`);
            if (envResult?.content) {
                const match = envResult.content.match(/^BROWSER_HOMEPAGE=(.+)$/m);
                if (match) {
                    defaultHomepage = match[1].trim().replace(/^["']|["']$/g, '');
                }
            }
        } catch {
            // Ignore errors, use default
        }
    }
    const targetUrl = url || defaultHomepage;

    const newBrowserId = `browser_${generateId()}`;

    // Check for empty pane to reuse first
    const emptyPaneId = findEmptyPaneId();
    if (emptyPaneId) {
        await updateContentPane(emptyPaneId, 'browser', newBrowserId);
        if (contentDataRef.current[emptyPaneId]) {
            contentDataRef.current[emptyPaneId].browserUrl = targetUrl;
        }
        setActiveContentPaneId(emptyPaneId);
        setActiveConversationId(null);
        setCurrentFile(null);
        setRootLayoutNode(prev => ({ ...prev }));
        return;
    }

    const newPaneId = generateId();

    // Set content BEFORE layout to prevent empty pane
    contentDataRef.current[newPaneId] = { contentType: 'browser', contentId: newBrowserId, browserUrl: targetUrl };

    // Use balanced grid layout
    setRootLayoutNode(oldRoot => addPaneToLayout(oldRoot, newPaneId));

    setActiveContentPaneId(newPaneId);
    setActiveConversationId(null);
    setCurrentFile(null);
}, [currentPath, updateContentPane, findEmptyPaneId]);

// Handle opening a new browser tab/pane with a URL
// If paneId is provided and it's a browser pane, adds a tab to that pane
// Otherwise creates a new browser pane
const handleNewBrowserTab = useCallback((url: string, paneId?: string) => {
    const targetUrl = url || 'about:blank';

    // If paneId is provided, try to add tab to that existing browser pane
    if (paneId) {
        const paneData = contentDataRef.current[paneId];
        if (paneData?.contentType === 'browser') {
            // Initialize tabs array if needed
            if (!paneData.tabs || paneData.tabs.length === 0) {
                paneData.tabs = [{
                    id: `tab_${Date.now()}_0`,
                    contentType: 'browser',
                    contentId: paneData.browserUrl || 'about:blank',
                    browserUrl: paneData.browserUrl || 'about:blank',
                    browserTitle: paneData.browserTitle || 'Browser'
                }];
                paneData.activeTabIndex = 0;
            }

            // Save current tab's state before switching
            const currentTabIndex = paneData.activeTabIndex || 0;
            if (paneData.tabs[currentTabIndex]) {
                paneData.tabs[currentTabIndex].browserUrl = paneData.browserUrl;
                paneData.tabs[currentTabIndex].browserTitle = paneData.browserTitle;
            }

            // Create and add new tab
            const newTab = {
                id: `tab_${Date.now()}_${paneData.tabs.length}`,
                contentType: 'browser',
                contentId: targetUrl,
                browserUrl: targetUrl,
                browserTitle: 'New Tab'
            };
            paneData.tabs.push(newTab);
            paneData.activeTabIndex = paneData.tabs.length - 1;

            // Update main paneData for the new active tab
            paneData.browserUrl = targetUrl;
            paneData.browserTitle = 'New Tab';

            // Trigger re-render
            setRootLayoutNode(prev => ({ ...prev }));
            return;
        }
    }

    // No paneId or pane isn't a browser - create new browser pane
    createNewBrowser(url || null);
}, [createNewBrowser]);

// Listen for ctrl+click / middle-click on browser links from main process
useEffect(() => {
    const cleanup = (window as any).api?.onBrowserOpenInNewTab?.(({ url }: { url: string }) => {
        if (url) {
            createNewBrowser(url);
        }
    });
    return () => cleanup?.();
}, [createNewBrowser]);

// Listen for Ctrl+T from main process - create new browser tab in active browser pane
useEffect(() => {
    const cleanup = (window as any).api?.onBrowserNewTab?.(() => {
        // Check if active pane is a browser
        const paneData = contentDataRef.current[activeContentPaneId];

        if (paneData?.contentType === 'browser') {
            // Active pane is browser - add new tab to it
            // Initialize tabs array if needed (convert current content to first tab)
            if (!paneData.tabs || paneData.tabs.length === 0) {
                paneData.tabs = [{
                    id: `tab_${Date.now()}_0`,
                    contentType: 'browser',
                    contentId: paneData.browserUrl || 'about:blank',
                    browserUrl: paneData.browserUrl || 'about:blank',
                    browserTitle: paneData.browserTitle || 'Browser'
                }];
                paneData.activeTabIndex = 0;
            }

            // Save current tab's state before switching
            const currentTabIndex = paneData.activeTabIndex || 0;
            if (paneData.tabs[currentTabIndex]) {
                paneData.tabs[currentTabIndex].browserUrl = paneData.browserUrl;
                paneData.tabs[currentTabIndex].browserTitle = paneData.browserTitle;
            }

            // Create and add new tab
            const newTab = {
                id: `tab_${Date.now()}_${paneData.tabs.length}`,
                contentType: 'browser',
                contentId: 'about:blank',
                browserUrl: 'about:blank',
                browserTitle: 'New Tab'
            };
            paneData.tabs.push(newTab);
            paneData.activeTabIndex = paneData.tabs.length - 1;

            // Update main paneData for the new active tab
            paneData.browserUrl = 'about:blank';
            paneData.browserTitle = 'New Tab';

            // Trigger re-render
            setRootLayoutNode(prev => ({ ...prev }));
        } else {
            // No active browser - create a new browser pane
            createNewBrowser('about:blank');
        }
    });
    return () => cleanup?.();
}, [activeContentPaneId, createNewBrowser]);

// Render SearchPane (for pane-based unified search)
const renderSearchPane = useCallback(({ nodeId, initialQuery }: { nodeId: string; initialQuery?: string }) => {
    return (
        <SearchPane
            initialQuery={initialQuery || ''}
            currentPath={currentPathRef.current}
        />
    );
}, []);

const renderBrowserViewer = useCallback(({ nodeId, hasTabBar, onToggleZen, isZenMode }) => {
    return (
        <WebBrowserViewer
            nodeId={nodeId}
            contentDataRef={contentDataRef}
            currentPath={currentPath}
            setBrowserContextMenuPos={setBrowserContextMenuPos}
            handleNewBrowserTab={handleNewBrowserTab}
            setRootLayoutNode={setRootLayoutNode}
            findNodePath={findNodePath}
            rootLayoutNode={rootLayoutNode}
            setDraggedItem={setDraggedItem}
            setPaneContextMenu={setPaneContextMenu}
            closeContentPane={closeContentPane}
            performSplit={performSplit}
            hasTabBar={hasTabBar}
            onToggleZen={onToggleZen}
            isZenMode={isZenMode}
        />
    );
}, [currentPath, rootLayoutNode, closeContentPane, handleNewBrowserTab, performSplit]);

const handleBrowserDialogNavigate = (url) => {
        createNewBrowser(url);
        setBrowserUrlDialogOpen(false);
    };
const moveContentPane = useCallback((draggedId, draggedPath, targetPath, dropSide) => {
    setRootLayoutNode(oldRoot => {
        if (!oldRoot) return oldRoot;

        // --- Step 1: Deep copy the layout to avoid mutation issues ---
        let newRoot = JSON.parse(JSON.stringify(oldRoot));

        // --- Step 2: Find the node being dragged ---
        const draggedNode = findNodeByPath(newRoot, draggedPath);
        if (!draggedNode) {
            console.error("Could not find dragged node in layout copy.");
            return oldRoot; // Abort
        }

        // --- Step 3: Remove the dragged node from its original position ---
        const removeNode = (root, path) => {
            if (path.length === 1) { // The node to remove is a direct child of the root
                root.children.splice(path[0], 1);
                root.sizes.splice(path[0], 1);
                return root;
            }

            const parent = findNodeByPath(root, path.slice(0, -1));
            const childIndex = path[path.length - 1];
            if (parent && parent.children) {
                parent.children.splice(childIndex, 1);
                parent.sizes.splice(childIndex, 1);
            }
            return root;
        };
        
        newRoot = removeNode(newRoot, draggedPath);

        // --- Step 4: Clean up any split nodes that now have only one child ---
        const cleanup = (node) => {
            if (!node) return null;
            if (node.type === 'split') {
                if (node.children.length === 1) {
                    return cleanup(node.children[0]);
                }
                node.children = node.children.map(cleanup).filter(Boolean);
                if (node.children.length === 0) return null;
                const equalSize = 100 / node.children.length;
                node.sizes = new Array(node.children.length).fill(equalSize);
            }
            return node;
        };

        newRoot = cleanup(newRoot);
        if (!newRoot) return draggedNode; // If everything was removed, the dragged node becomes the new root

        // --- Step 5: Recalculate the target path in the now-modified tree ---
        // This is the critical fix to prevent the crash
        const newTargetPath = findNodePath(newRoot, findNodeByPath(oldRoot, targetPath)?.id);
        if (!newTargetPath) {
            console.error("Could not find target node path after removal. Aborting drop.");
            return oldRoot;
        }

        // --- Step 6: Insert the dragged node at the new target position ---
        const insertNode = (root, path, nodeToInsert, side) => {
            const targetNode = findNodeByPath(root, path);
            if (!targetNode) return root;

            const isHorizontal = side === 'left' || side === 'right';
            const newSplit = {
                id: generateId(),
                type: 'split',
                direction: isHorizontal ? 'horizontal' : 'vertical',
                children: [],
                sizes: [50, 50],
            };

            if (side === 'left' || side === 'top') {
                newSplit.children = [nodeToInsert, targetNode];
            } else {
                newSplit.children = [targetNode, nodeToInsert];
            }
            
            if (path.length === 0) { // Target was the root
                return newSplit;
            }

            const parent = findNodeByPath(root, path.slice(0, -1));
            const childIndex = path[path.length - 1];
            if (parent && parent.children) {
                parent.children[childIndex] = newSplit;
            }
            return root;
        };

        newRoot = insertNode(newRoot, newTargetPath, draggedNode, dropSide);

        // --- Step 7: Final state update ---
        setActiveContentPaneId(draggedId);
        return newRoot;
    });
}, [findNodeByPath, findNodePath]);







    // Directory and conversation loading functions
    const loadConversationsWithoutAutoSelect = async (dirPath: string) => {
        try {
            const normalizedPath = normalizePath(dirPath);
            if (!normalizedPath) return;
            const response = await window.api.getConversations(normalizedPath);
            const formattedConversations = response?.conversations?.map((conv: any) => ({
                id: conv.id,
                title: conv.preview?.split('\n')[0]?.substring(0, 30) || 'New Conversation',
                preview: conv.preview || 'No content',
                timestamp: conv.timestamp || Date.now(),
                last_message_timestamp: conv.last_message_timestamp || conv.timestamp || Date.now()
            })) || [];
            setDirectoryConversations(formattedConversations);
            console.log('[loadConversationsWithoutAutoSelect] Loaded conversations without selecting');
        } catch (err: any) {
            console.error('Error loading conversations:', err);
            setError(err.message);
            setDirectoryConversations([]);
        }
    };

    const loadDirectoryStructureWithoutConversationLoad = async (dirPath: string) => {
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
            await loadConversationsWithoutAutoSelect(dirPath);
            return structureResult;
        } catch (err: any) {
            console.error('Error loading structure:', err);
            setError(err.message);
            setFolderStructure({ error: err.message });
            return { error: err.message };
        }
    };

    const loadDirectoryStructure = async (dirPath: string) => {
        await loadDirectoryStructureUtil(
            dirPath,
            setFolderStructure,
            loadConversationsWithoutAutoSelect,
            setError
        );
    };

    // Create a new Jupyter notebook (.ipynb)
    const createNewJupyterNotebook = useCallback(async () => {
        const timestamp = Date.now();
        const notebookName = `notebook-${timestamp}.ipynb`;
        const notebookPath = `${currentPath}/${notebookName}`;

        // Create empty Jupyter notebook structure
        const emptyNotebook = {
            nbformat: 4,
            nbformat_minor: 5,
            metadata: {
                kernelspec: {
                    display_name: 'Python 3',
                    language: 'python',
                    name: 'python3'
                },
                language_info: {
                    name: 'python',
                    version: '3.9.0'
                }
            },
            cells: [
                {
                    cell_type: 'code',
                    execution_count: null,
                    metadata: {},
                    outputs: [],
                    source: ['']
                }
            ]
        };

        try {
            await (window as any).api.writeFileContent(notebookPath, JSON.stringify(emptyNotebook, null, 2));

            // Check for empty pane to reuse first
            const emptyPaneId = findEmptyPaneId();
            if (emptyPaneId) {
                await updateContentPane(emptyPaneId, 'notebook', notebookPath);
                setActiveContentPaneId(emptyPaneId);
                setRootLayoutNode(prev => ({ ...prev }));
                loadDirectoryStructure(currentPath);
                return;
            }

            const newPaneId = generateId();
            contentDataRef.current[newPaneId] = { contentType: 'notebook', contentId: notebookPath };
            setRootLayoutNode(oldRoot => addPaneToLayout(oldRoot, newPaneId));
            setActiveContentPaneId(newPaneId);
            setActiveConversationId(null);
            setCurrentFile(null);
            loadDirectoryStructure(currentPath);
        } catch (err: any) {
            console.error('Error creating notebook:', err);
            setError(err.message);
        }
    }, [currentPath, updateContentPane, findEmptyPaneId]);

    // File drag and drop handler
    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        setIsHovering(false);

        // Check for sidebar file drag (add to context files)
        const jsonData = e.dataTransfer.getData('application/json');
        const textData = e.dataTransfer.getData('text/plain');

        if (jsonData) {
            try {
                const data = JSON.parse(jsonData);
                if (data.type === 'sidebar-file' && data.path) {
                    // Add to context files
                    const response = await window.api?.readFileContent?.(data.path);
                    const content = response?.content || '';
                    const name = data.path.split('/').pop() || data.path;

                    const newFile = {
                        id: crypto.randomUUID(),
                        path: data.path,
                        name: name,
                        content: content,
                        size: content.length,
                        addedAt: new Date().toISOString(),
                        source: 'sidebar' as const
                    };

                    setContextFiles(prev => {
                        if (prev.find(f => f.path === data.path)) return prev;
                        return [...prev, newFile];
                    });
                    return;
                }
            } catch (err) {
                console.error('Failed to parse drag data:', err);
            }
        }

        // Check for file path from sidebar (plain text starting with /)
        if (textData && textData.startsWith('/') && !e.dataTransfer.files.length) {
            const response = await window.api?.readFileContent?.(textData);
            const content = response?.content || '';
            const name = textData.split('/').pop() || textData;

            const newFile = {
                id: crypto.randomUUID(),
                path: textData,
                name: name,
                content: content,
                size: content.length,
                addedAt: new Date().toISOString(),
                source: 'sidebar' as const
            };

            setContextFiles(prev => {
                if (prev.find(f => f.path === textData)) return prev;
                return [...prev, newFile];
            });
            return;
        }

        // Handle external file drops (original behavior - add as attachments)
        const files = Array.from(e.dataTransfer.files);

        const existingFileNames = new Set(uploadedFiles.map(f => f.name));
        const newFiles = files.filter(file => !existingFileNames.has(file.name));

        const attachmentPromises = newFiles.map(async (file) => {
            try {
                const { dataUrl, base64 } = await convertFileToBase64(file);
                return {
                    id: generateId(),
                    name: file.name,
                    type: file.type,
                    data: base64,
                    size: file.size,
                    preview: file.type.startsWith('image/') ? dataUrl : null
                };
            } catch (error) {
                console.error(`Failed to process dropped file ${file.name}:`, error);
                return null;
            }
        });

        const attachmentData = (await Promise.all(attachmentPromises)).filter(Boolean);

        if (attachmentData.length > 0) {
            setUploadedFiles(prev => [...prev, ...attachmentData]);
        }
    };

    // File attachment click handler
    const handleAttachFileClick = async () => {
        try {
            const fileData = await window.api.showOpenDialog({
                properties: ['openFile', 'multiSelections'],
            });

            if (fileData && fileData.length > 0) {
                const existingFileNames = new Set(uploadedFiles.map(f => f.name));
                const newFiles = fileData.filter((file: any) => !existingFileNames.has(file.name));

                const attachmentData = newFiles.map((file: any) => ({
                    id: generateId(),
                    name: file.name,
                    type: file.type,
                    path: file.path,
                    size: file.size,
                    preview: file.type.startsWith('image/') ? `file://${file.path}` : null
                }));

                if (attachmentData.length > 0) {
                    setUploadedFiles(prev => [...prev, ...attachmentData]);
                }
            }
        } catch (error) {
            console.error('Error selecting files:', error);
        }
    };

    // Main input submit handler
    const handleInputSubmit = async (e: React.FormEvent, options?: { voiceInput?: boolean; genParams?: { temperature: number; top_p: number; top_k: number; max_tokens: number } }) => {
        e.preventDefault();
        const wasVoiceInput = options?.voiceInput || false;
        const genParams = options?.genParams || { temperature: 0.7, top_p: 0.9, top_k: 40, max_tokens: 4096 };

        // Get pane-specific execution mode and selectedJinx
        const paneExecMode = activeContentPaneId ? (contentDataRef.current[activeContentPaneId]?.executionMode || 'chat') : 'chat';
        const paneSelectedJinx = activeContentPaneId ? (contentDataRef.current[activeContentPaneId]?.selectedJinx || null) : null;

        const isJinxMode = paneExecMode !== 'chat' && paneSelectedJinx;
        const currentJinxInputs = isJinxMode ? (jinxInputValues[paneSelectedJinx.name] || {}) : {};

        const hasContent = (input || '').trim() || uploadedFiles.length > 0 || (isJinxMode && Object.values(currentJinxInputs).some(val => val !== null && String(val).trim()));

        if (!hasContent || (!activeContentPaneId && !isJinxMode)) {
            if (!isJinxMode && !activeContentPaneId) {
                console.error("No active chat pane to send message to.");
            }
            return;
        }

        const paneData = contentDataRef.current[activeContentPaneId];
        if (!paneData || paneData.contentType !== 'chat' || !paneData.contentId) {
            console.error("No active chat pane to send message to.");
            return;
        }

        const conversationId = paneData.contentId;
        const newStreamId = generateId();

        streamToPaneRef.current[newStreamId] = activeContentPaneId;
        setIsStreaming(true);

        let finalPromptForUserMessage = input;
        let jinxName = null;
        let jinxArgsForApi: any[] = [];

        if (isJinxMode) {
            jinxName = paneSelectedJinx.name;

            paneSelectedJinx.inputs.forEach((inputDef: any) => {
                const inputName = typeof inputDef === 'string' ? inputDef : Object.keys(inputDef)[0];
                const value = currentJinxInputs[inputName];
                if (value !== null && String(value).trim()) {
                    jinxArgsForApi.push(value);
                } else {
                    const defaultValue = typeof inputDef === 'object' ? inputDef[inputName] : '';
                    jinxArgsForApi.push(defaultValue || '');
                }
            });

            console.log(`[Jinx Submit] Jinx Name: ${jinxName}`);
            console.log(`[Jinx Submit] jinxArgsForApi (ordered array before API call):`, JSON.stringify(jinxArgsForApi, null, 2));

            const jinxCommandParts = [`/${paneSelectedJinx.name}`];
            paneSelectedJinx.inputs.forEach((inputDef: any) => {
                const inputName = typeof inputDef === 'string' ? inputDef : Object.keys(inputDef)[0];
                const value = currentJinxInputs[inputName];
                if (value !== null && String(value).trim()) {
                    jinxCommandParts.push(`${inputName}="${String(value).replace(/"/g, '\\"')}"`);
                }
            });
            finalPromptForUserMessage = jinxCommandParts.join(' ');

        } else {
            const contexts = gatherWorkspaceContext(contentDataRef, contextFiles);
            const newHash = hashContext(contexts);
            const contextChanged = newHash !== contextHash;

            if (contexts.length > 0 && contextChanged) {
                const fileContexts = contexts.filter((c: any) => c.type === 'file');
                const browserContexts = contexts.filter((c: any) => c.type === 'browser');
                const terminalContexts = contexts.filter((c: any) => c.type === 'terminal');
                let contextPrompt = '';

                if (fileContexts.length > 0) {
                    contextPrompt += fileContexts.map((ctx: any) =>
                        `File: ${ctx.path}\n\`\`\`\n${ctx.content}\n\`\`\``
                    ).join('\n\n');
                }

                if (browserContexts.length > 0) {
                    if (contextPrompt) contextPrompt += '\n\n';

                    const browserContentPromises = browserContexts.map(async (ctx: any) => {
                        // Try to get content directly from the webview via contentDataRef
                        const browserPaneData = contentDataRef.current[ctx.paneId];
                        if (browserPaneData?.getPageContent) {
                            try {
                                const result = await browserPaneData.getPageContent();
                                if (result.success && result.content) {
                                    return `Webpage: ${result.title} (${result.url})\n\`\`\`\n${result.content}\n\`\`\``;
                                }
                            } catch (err) {
                                console.error('[Context] Failed to get browser content:', err);
                            }
                        }
                        // Fallback to just showing URL
                        return `Currently viewing: ${ctx.url}`;
                    });

                    const browserContents = await Promise.all(browserContentPromises);
                    contextPrompt += browserContents.join('\n\n');
                }

                // Add terminal context
                if (terminalContexts.length > 0) {
                    if (contextPrompt) contextPrompt += '\n\n';
                    contextPrompt += terminalContexts.map((ctx: any) =>
                        `Terminal output (${ctx.shellType}):\n\`\`\`\n${ctx.content}\n\`\`\``
                    ).join('\n\n');
                }

                if (paneExecMode === 'tool_agent') {
                    finalPromptForUserMessage = `${input}

Available context:
${contextPrompt}

IMPORTANT: Propose changes as unified diffs, NOT full file contents.`;
                } else {
                    finalPromptForUserMessage = `${input}

Context - currently open:
${contextPrompt}`;
                }

                setContextHash(newHash);
            }
        }

        // Check if we have selected branches for sub-branching
        const branchMap = selectedBranches[activeContentPaneId];
        const branchTargets = branchMap && branchMap.size > 0 ? Array.from(branchMap.values()) : [null];
        console.log('[BRANCH] Reading selectedBranches for activeContentPaneId:', activeContentPaneId, 'targets:', branchTargets.length, branchTargets.map((b: any) => b?.id + ' ' + (b?.npc || b?.model)));

        // Clear selected branches after using them
        if (branchMap && branchMap.size > 0) {
            setSelectedBranches(prev => {
                const next = { ...prev };
                delete next[activeContentPaneId];
                return next;
            });
        }

        if (!paneData.chatMessages) {
            paneData.chatMessages = { messages: [], allMessages: [], displayedMessageCount: 20 };
        }

        // IMMEDIATELY clear input and files so user can type next message
        const savedInput = input;
        const savedFiles = [...uploadedFiles];
        setInput('');
        setUploadedFiles([]);
        if (isJinxMode) {
            setJinxInputValues(prev => ({
                ...prev,
                [paneSelectedJinx.name]: {}
            }));
        }

        // For each selected branch (or null if none), send a message
        for (const branchParent of branchTargets) {
            const branchStreamId = branchTargets.length > 1 ? generateId() : newStreamId;

            // When continuing a branch, inherit NPC/model from the branch, otherwise use selector
            const useNpc = branchParent?.npc || currentNPC;
            const useModel = branchParent?.model || currentModel;
            const useProvider = branchParent?.provider || currentProvider;
            const useNpcSource = branchParent?.npcSource || 'global';

            // For sub-branches, use the branch parent's ID as cellId to group them
            const cellId = branchParent ? branchParent.id : generateId();

            const userMessage = {
                id: generateId(),
                role: 'user',
                content: finalPromptForUserMessage,
                timestamp: new Date().toISOString(),
                attachments: savedFiles,
                executionMode: paneExecMode,
                isJinxCall: isJinxMode,
                jinxName: isJinxMode ? jinxName : null,
                jinxInputs: isJinxMode ? jinxArgsForApi : null,
                wasVoiceInput: wasVoiceInput,
                parentMessageId: branchParent?.id || null, // Link to branch parent if sub-branching
                cellId: cellId,
            };

            const assistantPlaceholder = {
                id: branchStreamId, role: 'assistant', content: '', timestamp: new Date().toISOString(),
                isStreaming: true, streamId: branchStreamId,
                npc: useNpc, model: useModel, provider: useProvider, npcSource: useNpcSource,
                parentMessageId: userMessage.id, // Link assistant response to its user message
                cellId: cellId,
                // Model parameters
                temperature: genParams.temperature,
                top_p: genParams.top_p,
                top_k: genParams.top_k,
                max_tokens: genParams.max_tokens,
            };

            console.log('[BRANCH] Sending to branch:', branchParent?.id, 'using NPC:', useNpc, 'model:', useModel);

            paneData.chatMessages.allMessages.push(userMessage, assistantPlaceholder);
            paneData.chatMessages.messages = paneData.chatMessages.allMessages.slice(-(paneData.chatMessages.displayedMessageCount || 20));
            streamToPaneRef.current[branchStreamId] = activeContentPaneId;

            // Trigger render immediately so messages show before API call
            setRootLayoutNode(prev => ({ ...prev }));

            try {
                // For sub-branching, use the branch's NPC info
                const npcName = useNpc?.replace(/^(project:|global:)/, '') || 'agent';

                if (isJinxMode) {
                    await window.api.executeJinx({
                        jinxName: jinxName,
                        jinxArgs: jinxArgsForApi,
                        currentPath,
                        conversationId,
                        model: useModel,
                        provider: useProvider,
                        npc: npcName,
                        npcSource: useNpcSource,
                        streamId: branchStreamId,
                        temperature: genParams.temperature,
                        top_p: genParams.top_p,
                        top_k: genParams.top_k,
                        max_tokens: genParams.max_tokens,
                    });
                } else {
                    const commandData = {
                        commandstr: finalPromptForUserMessage,
                        currentPath,
                        conversationId,
                        model: useModel,
                        provider: useProvider,
                        npc: npcName,
                        npcSource: useNpcSource,
                        attachments: savedFiles.map((f: any) => {
                            if (f.path) return { name: f.name, path: f.path, size: f.size, type: f.type };
                            else if (f.data) return { name: f.name, data: f.data, size: f.size, type: f.type };
                            return { name: f.name, type: f.type };
                        }),
                        streamId: branchStreamId,
                        executionMode: paneExecMode,
                        mcpServerPath: paneExecMode === 'tool_agent' ? mcpServerPath : undefined,
                        selectedMcpTools: paneExecMode === 'tool_agent' ? selectedMcpTools : undefined,
                        userParentMessageId: userMessage.parentMessageId, // For sub-branching
                        // Pass frontend-generated message IDs so backend uses the same IDs
                        userMessageId: userMessage.id,
                        assistantMessageId: branchStreamId,
                        parentMessageId: userMessage.id, // Assistant's parent is the user message
                        // Generation parameters
                        temperature: genParams.temperature,
                        top_p: genParams.top_p,
                        top_k: genParams.top_k,
                        max_tokens: genParams.max_tokens,
                    };
                    await window.api.executeCommandStream(commandData);
                }
            } catch (err: any) {
                setError(err.message);
                delete streamToPaneRef.current[branchStreamId];
            }
        }

        paneData.chatMessages.messages = paneData.chatMessages.allMessages.slice(-(paneData.chatMessages.displayedMessageCount || 20));
        paneData.chatStats = getConversationStats(paneData.chatMessages.allMessages);

        setRootLayoutNode(prev => ({ ...prev }));

        // Set streaming false only when all streams complete (handled by stream listeners)
        if (branchTargets.length === 1 && branchTargets[0] === null) {
            // Normal single message case - streaming state managed normally
        }
    };

    const handleInterruptStream = async () => {
        const activePaneData = contentDataRef.current[activeContentPaneId];
        if (!activePaneData || !activePaneData.chatMessages) {
            console.warn("Interrupt clicked but no active chat pane found.");
            return;
        }

        const streamingMessage = activePaneData.chatMessages.allMessages.find((m: any) => m.isStreaming);
        if (!streamingMessage || !streamingMessage.streamId) {
            console.warn("Interrupt clicked, but no streaming message found in the active pane.");

            if (isStreaming) {
                const anyStreamId = Object.keys(streamToPaneRef.current)[0];
                if (anyStreamId) {
                    await window.api.interruptStream(anyStreamId);
                    console.log(`Fallback interrupt sent for stream: ${anyStreamId}`);
                }
                setIsStreaming(false);
            }
            return;
        }

        const streamIdToInterrupt = streamingMessage.streamId;
        console.log(`[REACT] handleInterruptStream: Attempting to interrupt stream: ${streamIdToInterrupt}`);

        streamingMessage.content = (streamingMessage.content || '') + `\n\n[Stream Interrupted by User]`;
        streamingMessage.isStreaming = false;
        streamingMessage.streamId = null;

        delete streamToPaneRef.current[streamIdToInterrupt];
        if (Object.keys(streamToPaneRef.current).length === 0) {
            setIsStreaming(false);
        }

        setRootLayoutNode(prev => ({ ...prev }));

        try {
            await window.api.interruptStream(streamIdToInterrupt);
            console.log(`[REACT] handleInterruptStream: API call to interrupt stream ${streamIdToInterrupt} successful.`);
        } catch (error) {
            console.error(`[REACT] handleInterruptStream: API call to interrupt stream ${streamIdToInterrupt} failed:`, error);
            streamingMessage.content += " [Interruption API call failed]";
            setRootLayoutNode(prev => ({ ...prev }));
        }
    };

    const handleMessageContextMenu = (e: React.MouseEvent, message: any) => {
        e.preventDefault();
        const selection = window.getSelection();
        const selectedText = selection?.toString() || '';

        setMessageContextMenuPos({
            x: e.clientX,
            y: e.clientY,
            selectedText,
            messageId: message.id || message.timestamp
        });
    };

    const handleApplyPromptToMessages = async (operationType: string, customPrompt = '') => {
        const selectedIds = Array.from(selectedMessages);
        if (selectedIds.length === 0) return;

        const activePaneData = contentDataRef.current[activeContentPaneId];
        if (!activePaneData || !activePaneData.chatMessages) {
            console.error("No active chat pane data found for message operation.");
            return;
        }
        const allMessagesInPane = activePaneData.chatMessages.allMessages;
        const selectedMsgs = allMessagesInPane.filter((msg: any) => selectedIds.includes(msg.id || msg.timestamp));

        if (selectedMsgs.length === 0) return;

        let prompt = '';
        switch (operationType) {
            case 'summarize':
                prompt = `Summarize these ${selectedMsgs.length} messages:\n\n`;
                break;
            case 'analyze':
                prompt = `Analyze these ${selectedMsgs.length} messages for key insights:\n\n`;
                break;
            case 'extract':
                prompt = `Extract the key information from these ${selectedMsgs.length} messages:\n\n`;
                break;
            case 'custom':
                prompt = customPrompt + `\n\nApply this to these ${selectedMsgs.length} messages:\n\n`;
                break;
            default:
                prompt = `Process these ${selectedMsgs.length} messages:\n\n`;
                break;
        }

        const messagesText = selectedMsgs.map((msg: any, idx: number) =>
            `Message ${idx + 1} (${msg.role}):\n${msg.content}`
        ).join('\n\n');

        const fullPrompt = prompt + messagesText;

        try {
            console.log('Creating new conversation for message operation:', operationType);
            await createNewConversation();
            setInput(fullPrompt);
        } catch (err: any) {
            console.error('Error processing messages:', err);
            setError(err.message);
            setInput(fullPrompt);
        } finally {
            setSelectedMessages(new Set());
            setMessageContextMenuPos(null);
            setMessageSelectionMode(false);
        }
    };

    const handleDeleteSelectedMessages = async () => {
        const selectedIds = Array.from(selectedMessages);
        if (selectedIds.length === 0) return;

        const activePaneData = contentDataRef.current[activeContentPaneId];
        if (!activePaneData || !activePaneData.chatMessages) {
            console.error("No active chat pane for deletion.");
            return;
        }

        const conversationId = activePaneData.contentId;
        if (!conversationId) return;

        try {
            const messageIdsToDelete = activePaneData.chatMessages.allMessages
                .filter((m: any) => selectedIds.includes(m.id || m.timestamp))
                .map((m: any) => m.message_id || m.id)
                .filter(Boolean);

            if (messageIdsToDelete.length > 0) {
                await window.api.deleteMessages({
                    conversationId,
                    messageIds: messageIdsToDelete
                });
            }

            activePaneData.chatMessages.allMessages = activePaneData.chatMessages.allMessages.filter(
                (m: any) => !selectedIds.includes(m.id || m.timestamp)
            );
            activePaneData.chatMessages.messages = activePaneData.chatMessages.allMessages.slice(-(activePaneData.chatMessages.displayedMessageCount || 20));
            activePaneData.chatStats = getConversationStats(activePaneData.chatMessages.allMessages);

            setRootLayoutNode(prev => ({ ...prev }));
            setSelectedMessages(new Set());
            setMessageContextMenuPos(null);
            setMessageSelectionMode(false);
        } catch (err: any) {
            console.error('Error deleting messages:', err);
            setError(err.message);
        }
    };

    const handleResendWithSettings = async (messageToResend: any, selectedModel: string, selectedNPC: string) => {
        const activePaneData = contentDataRef.current[activeContentPaneId];
        if (!activePaneData || activePaneData.contentType !== 'chat' || !activePaneData.contentId) {
            setError("Cannot resend: The active pane is not a valid chat window.");
            return;
        }
        if (isStreaming) {
            console.warn('Cannot resend while another operation is in progress.');
            return;
        }

        const conversationId = activePaneData.contentId;
        let newStreamId: string | null = null;

        try {
            // Find the user message that we're re-running
            const messageIdToResend = messageToResend.id || messageToResend.timestamp;
            const allMessages = activePaneData.chatMessages.allMessages;
            const userMsgIndex = allMessages.findIndex((m: any) =>
                (m.id || m.timestamp) === messageIdToResend
            );

            // Get or create cellId - this groups all runs for the same prompt
            // cellId is the ID of the original user message
            const cellId = messageToResend.cellId || messageToResend.id || messageToResend.timestamp;

            // Count existing runs for this cell
            const existingRuns = allMessages.filter((m: any) =>
                m.cellId === cellId && m.role === 'assistant'
            ).length;
            const newRunNumber = existingRuns + 1;

            // If the user message doesn't have a cellId yet, update it
            if (userMsgIndex !== -1 && !allMessages[userMsgIndex].cellId) {
                allMessages[userMsgIndex].cellId = cellId;
            }

            // Update runCount on the original user message
            if (userMsgIndex !== -1) {
                allMessages[userMsgIndex].runCount = newRunNumber;
            }

            // Also update runCount on all existing assistant responses for this cell
            allMessages.forEach((m: any) => {
                if (m.cellId === cellId && m.role === 'assistant') {
                    m.runCount = newRunNumber;
                }
            });

            // Now create the new run (don't delete old messages - keep them as run history)
            newStreamId = generateId();
            streamToPaneRef.current[newStreamId] = activeContentPaneId;
            setIsStreaming(true);

            const selectedNpc = availableNPCs.find((npc: any) => npc.value === selectedNPC);

            // Create new assistant placeholder message for this run
            const assistantPlaceholderMessage = {
                id: newStreamId,
                role: 'assistant',
                content: '',
                isStreaming: true,
                timestamp: new Date().toISOString(),
                streamId: newStreamId,
                model: selectedModel,
                provider: availableModels.find((m: any) => m.value === selectedModel)?.provider || currentProvider,
                npc: selectedNPC,
                // Run tracking fields
                cellId: cellId,
                parentMessageId: messageIdToResend,  // Links to original user message
                runNumber: newRunNumber,
                runCount: newRunNumber,
            };

            // Insert the new run after the last response for this cell
            // Find the last assistant message with this cellId
            let insertIndex = allMessages.length;
            for (let i = allMessages.length - 1; i >= 0; i--) {
                if (allMessages[i].cellId === cellId) {
                    insertIndex = i + 1;
                    break;
                }
            }

            // If no matching cellId found, insert after the user message
            if (insertIndex === allMessages.length && userMsgIndex !== -1) {
                insertIndex = userMsgIndex + 1;
                // Skip past any immediate assistant response
                while (insertIndex < allMessages.length && allMessages[insertIndex].role === 'assistant') {
                    // Mark it with cellId if not already
                    if (!allMessages[insertIndex].cellId) {
                        allMessages[insertIndex].cellId = cellId;
                        allMessages[insertIndex].runNumber = 1;
                        allMessages[insertIndex].runCount = newRunNumber;
                    }
                    insertIndex++;
                }
            }

            // Insert the new message
            allMessages.splice(insertIndex, 0, assistantPlaceholderMessage);
            activePaneData.chatMessages.messages = activePaneData.chatMessages.allMessages.slice(
                -(activePaneData.chatMessages.displayedMessageCount || 20)
            );

            setRootLayoutNode(prev => ({ ...prev }));

            const selectedModelObj = availableModels.find((m: any) => m.value === selectedModel);
            const providerToUse = selectedModelObj ? selectedModelObj.provider : currentProvider;

            await window.api.executeCommandStream({
                commandstr: messageToResend.content,
                currentPath,
                conversationId: conversationId,
                model: selectedModel,
                provider: providerToUse,
                npc: selectedNpc ? selectedNpc.name : selectedNPC,
                npcSource: selectedNpc ? selectedNpc.source : 'global',
                attachments: messageToResend.attachments?.map((att: any) => ({
                    name: att.name, path: att.path, size: att.size, type: att.type
                })) || [],
                streamId: newStreamId,
                isRerun: true,  // Flag this as a re-run
                parentMessageId: messageIdToResend,
                // Pass frontend message IDs
                assistantMessageId: newStreamId,
                // Use original message's params or defaults
                temperature: messageToResend.temperature ?? 0.7,
                top_p: messageToResend.top_p ?? 0.9,
                top_k: messageToResend.top_k ?? 40,
                max_tokens: messageToResend.max_tokens ?? 4096,
            });

            setResendModal({ isOpen: false, message: null, selectedModel: '', selectedNPC: '' });
        } catch (err: any) {
            console.error('[RESEND] Error resending message:', err);
            setError(err.message);

            if (activePaneData.chatMessages && newStreamId) {
                const msgIndex = activePaneData.chatMessages.allMessages.findIndex((m: any) => m.id === newStreamId);
                if (msgIndex !== -1) {
                    const message = activePaneData.chatMessages.allMessages[msgIndex];
                    message.content = `[Error resending message: ${err.message}]`;
                    message.type = 'error';
                    message.isStreaming = false;
                }
            }

            if (newStreamId) delete streamToPaneRef.current[newStreamId];
            if (Object.keys(streamToPaneRef.current).length === 0) {
                setIsStreaming(false);
            }

            setRootLayoutNode(prev => ({ ...prev }));
        }
    };

    const createNewConversation = useCallback(async (skipMessageLoad = false) => {
        try {
            const conversation = await window.api.createConversation({ directory_path: currentPath });
            if (!conversation || !conversation.id) {
                throw new Error("Failed to create conversation or received invalid data.");
            }

            const formattedNewConversation = {
                id: conversation.id,
                title: 'New Conversation',
                preview: 'No content',
                timestamp: conversation.timestamp || new Date().toISOString()
            };

            setDirectoryConversations(prev => [formattedNewConversation, ...prev]);

            // CRITICAL: Create pane and layout synchronously in one step
            const newPaneId = generateId();

            // Set content BEFORE layout to prevent empty pane
            contentDataRef.current[newPaneId] = {
                contentType: 'chat',
                contentId: conversation.id,
                chatMessages: { messages: [], allMessages: [], displayedMessageCount: 20 }
            };

            // Update the layout with the new pane using balanced grid
            setRootLayoutNode(oldRoot => addPaneToLayout(oldRoot, newPaneId));

            setActiveContentPaneId(newPaneId);
            setActiveConversationId(conversation.id);
            setCurrentFile(null);

            return { conversation, paneId: newPaneId };

        } catch (err) {
            console.error("Error creating new conversation:", err);
            setError(err.message);
            return { conversation: null, paneId: null };
        }
    }, [currentPath, activeContentPaneId, findNodePath, findNodeByPath, updateContentPane]);

    // Keep refs updated for keyboard handler
    useEffect(() => {
        createNewTerminalRef.current = createNewTerminal;
        createNewConversationRef.current = createNewConversation;
        createNewBrowserRef.current = createNewBrowser;
        handleCreateNewFolderRef.current = handleCreateNewFolder;
    }, [createNewTerminal, createNewConversation, createNewBrowser, handleCreateNewFolder]);

    // Render NPC Team pane (embedded version for pane layout)
    const renderNPCTeamPane = useCallback(({ nodeId }: { nodeId: string }) => {
        return (
            <NPCTeamMenu
                isOpen={true}
                onClose={() => {}}
                currentPath={currentPath}
                startNewConversation={(npc) => {
                    setCurrentNPC(npc.name || npc);
                    createNewConversation();
                }}
                embedded={true}
            />
        );
    }, [currentPath, createNewConversation]);

    // Create NPC Team pane
    const createNPCTeamPane = useCallback(async () => {
        const newPaneId = generateId();
        contentDataRef.current[newPaneId] = { contentType: 'npcteam', contentId: 'npcteam' };
        setRootLayoutNode(oldRoot => addPaneToLayout(oldRoot, newPaneId));
        setActiveContentPaneId(newPaneId);
    }, []);

    // Render Jinx Menu pane (embedded version for pane layout)
    const renderJinxPane = useCallback(({ nodeId }: { nodeId: string }) => {
        return (
            <JinxMenu
                isOpen={true}
                onClose={() => {}}
                currentPath={currentPath}
                embedded={true}
            />
        );
    }, [currentPath]);

    // Create Jinx pane
    const createJinxPane = useCallback(async () => {
        const newPaneId = generateId();
        contentDataRef.current[newPaneId] = { contentType: 'jinx', contentId: 'jinx' };
        setRootLayoutNode(oldRoot => addPaneToLayout(oldRoot, newPaneId));
        setActiveContentPaneId(newPaneId);
    }, []);

    // Render Team Management pane (embedded version for pane layout)
    const renderTeamManagementPane = useCallback(({ nodeId }: { nodeId: string }) => {
        return (
            <TeamManagement
                isOpen={true}
                onClose={() => {}}
                currentPath={currentPath}
                startNewConversation={(npc) => {
                    setCurrentNPC(npc.name || npc);
                    createNewConversation();
                }}
                embedded={true}
            />
        );
    }, [currentPath, createNewConversation]);

    // Create Team Management pane
    const createTeamManagementPane = useCallback(async () => {
        const newPaneId = generateId();
        contentDataRef.current[newPaneId] = { contentType: 'teammanagement', contentId: 'teammanagement' };
        setRootLayoutNode(oldRoot => addPaneToLayout(oldRoot, newPaneId));
        setActiveContentPaneId(newPaneId);
    }, []);

    // Render Settings pane (embedded version for pane layout)
    const renderSettingsPane = useCallback(({ nodeId }: { nodeId: string }) => {
        return (
            <SettingsMenu
                isOpen={true}
                onClose={() => {}}
                currentPath={currentPath}
                onPathChange={handlePathChange}
                availableModels={availableModels}
                embedded={true}
            />
        );
    }, [currentPath, handlePathChange, availableModels]);

    // Create Settings pane
    const createSettingsPane = useCallback(async () => {
        const newPaneId = generateId();
        contentDataRef.current[newPaneId] = { contentType: 'settings', contentId: 'settings' };
        setRootLayoutNode(oldRoot => addPaneToLayout(oldRoot, newPaneId));
        setActiveContentPaneId(newPaneId);
    }, []);

    // Keep menu handler refs updated
    useEffect(() => {
        closeContentPaneRef.current = closeContentPane;
        createSettingsPaneRef.current = createSettingsPane;
        createSearchPaneRef.current = createSearchPane;
        createHelpPaneRef.current = createHelpPane;
    }, [closeContentPane, createSettingsPane, createSearchPane, createHelpPane]);

    // Create Git pane
    const createGitPane = useCallback(async () => {
        const newPaneId = generateId();
        contentDataRef.current[newPaneId] = { contentType: 'git', contentId: 'git' };
        setRootLayoutNode(oldRoot => addPaneToLayout(oldRoot, newPaneId));
        setActiveContentPaneId(newPaneId);
    }, []);

    const createNewTextFile = useCallback((defaultFilename?: string) => {
        const filename = defaultFilename || localStorage.getItem('npcStudio_defaultCodeFileType') || 'untitled.py';
        const finalDefault = filename.includes('.') ? filename : `untitled.${filename}`;
        setPromptModalValue(finalDefault);
        setPromptModal({
            isOpen: true,
            title: 'Create New File',
            message: 'Enter filename with extension (e.g., script.py, index.js, notes.md)',
            defaultValue: finalDefault,
            onConfirm: async (inputFilename) => {
                try {
                    if (!inputFilename || inputFilename.trim() === '') return;
                    const cleanName = inputFilename.trim();
                    const filepath = normalizePath(`${currentPath}/${cleanName}`);
                    await window.api.writeFileContent(filepath, '');
                    await loadDirectoryStructure(currentPath);
                    // Use ref to avoid forward reference issue
                    if (handleFileClickRef.current) {
                        handleFileClickRef.current(filepath);
                    }
                } catch (err) {
                    setError(err.message);
                }
            }
        });
    }, [currentPath, loadDirectoryStructure, normalizePath, setError, setPromptModal, setPromptModalValue]);

    // Listen for custom event to create file with specific name
    useEffect(() => {
        const handleCreateNewFileWithName = (e: CustomEvent<{ filename: string }>) => {
            createNewTextFile(e.detail.filename);
        };
        window.addEventListener('createNewFileWithName', handleCreateNewFileWithName as EventListener);
        return () => window.removeEventListener('createNewFileWithName', handleCreateNewFileWithName as EventListener);
    }, [createNewTextFile]);

    const createNewDocument = async (docType: 'docx' | 'xlsx' | 'pptx' | 'mapx') => {
        try {
            const ext = docType === 'mapx' ? 'mapx' : docType;
            const filename = `untitled-${Date.now()}.${ext}`;
            const filepath = normalizePath(`${currentPath}/${filename}`);
            // Create empty document - the viewer components will handle creating proper structure
            // For mindmap (.mapx), create initial JSON structure
            if (docType === 'mapx') {
                const initialMindMap = {
                    nodes: [{ id: 'root', label: 'Central Idea', x: 400, y: 300, color: '#3b82f6' }],
                    links: []
                };
                await window.api.writeFileContent(filepath, JSON.stringify(initialMindMap, null, 2));
            } else {
                await window.api.writeFileContent(filepath, '');
            }
            await loadDirectoryStructure(currentPath);
            await handleFileClick(filepath);
        } catch (err) {
            setError(err.message);
        }
    };

    // Refresh conversations list
    const refreshConversations = useCallback(async () => {
        if (currentPath) {
            console.log('[REFRESH] Starting conversation refresh for path:', currentPath);
            try {
                const normalizedPath = normalizePath(currentPath);
                const response = await window.api.getConversations(normalizedPath);
                console.log('[REFRESH] Got response:', response);

                if (response?.conversations) {
                    const formattedConversations = response.conversations.map((conv: any) => ({
                        id: conv.id,
                        title: conv.preview?.split('\n')[0]?.substring(0, 30) || 'New Conversation',
                        preview: conv.preview || 'No content',
                        timestamp: conv.timestamp || Date.now(),
                        last_message_timestamp: conv.last_message_timestamp || conv.timestamp || Date.now()
                    }));

                    formattedConversations.sort((a: any, b: any) =>
                        new Date(b.last_message_timestamp).getTime() - new Date(a.last_message_timestamp).getTime()
                    );

                    console.log('[REFRESH] Setting conversations:', formattedConversations.length);
                    setDirectoryConversations([...formattedConversations]);
                    console.log('[REFRESH] Refresh complete, preserving current selection');
                } else {
                    console.error('[REFRESH] No conversations in response');
                    setDirectoryConversations([]);
                }
            } catch (err: any) {
                console.error('[REFRESH] Error:', err);
                setDirectoryConversations([]);
            }
        }
    }, [currentPath, normalizePath]);

    // Parse agentic responses for file changes
    const parseAgenticResponse = useCallback((response: string, contexts: any[]) => {
        const changes = [];
        const fileRegex = /FILE:\s*(.+?)\s*\nREASONING:\s*(.+?)\s*\n```diff\n([\s\S]*?)```/gi;

        let match;
        while ((match = fileRegex.exec(response)) !== null) {
            const filePath = match[1].trim();
            const reasoning = match[2].trim();
            const rawUnifiedDiffText = match[3].trim();

            const context = contexts.find((c: any) =>
                c.path.includes(filePath) || filePath.includes(c.path.split('/').pop())
            );

            if (context) {
                changes.push({
                    paneId: context.paneId,
                    filePath: context.path,
                    reasoning: reasoning,
                    originalCode: context.content,
                    newCode: rawUnifiedDiffText,
                    diff: []
                });
            }
        }

        return changes;
    }, []);

    // Build studioContext for agent-controlled UI actions
    const studioContext: StudioContext = useMemo(() => ({
        rootLayoutNode,
        contentDataRef,
        activeContentPaneId: activeContentPaneId || '',
        setActiveContentPaneId,
        setRootLayoutNode,
        performSplit,
        closeContentPane,
        updateContentPane,
        toggleZenMode: (paneId: string) => {
            setZenModePaneId(prev => prev === paneId ? null : paneId);
        },
        generateId,
        findPanePath: findNodePath
    }), [rootLayoutNode, contentDataRef, activeContentPaneId, setActiveContentPaneId, performSplit, closeContentPane, updateContentPane]);

    usePaneAwareStreamListeners(
        config,
        listenersAttached,
        streamToPaneRef,
        contentDataRef,
        setRootLayoutNode,
        setIsStreaming,
        setAiEditModal,
        parseAgenticResponse,
        getConversationStats,
        refreshConversations,
        studioContext
    );


    const [isSaving, setIsSaving] = useState(false);

   

   
    const [isRenamingFile, setIsRenamingFile] = useState(false);
    const [newFileName, setNewFileName] = useState('');





    const [activeWindowsExpanded, setActiveWindowsExpanded] = useState(false);
    const extractCodeFromMarkdown = (text) => {
    const codeBlockRegex = /```(?:\w+)?\n([\s\S]*?)```/g;
    const matches = [...text.matchAll(codeBlockRegex)];
    if (matches.length > 0) return matches[matches.length - 1][1].trim();
    const thinkingRegex = /<think>[\s\S]*?<\/think>/g;
    return text.replace(thinkingRegex, '').trim();
    };




    useEffect(() => {
        if (currentPath) {
            // Save to BOTH:
            // - localStorage: for persistence across app restarts
            // - sessionStorage: for window-specific isolation during hot-reload
            localStorage.setItem(LAST_ACTIVE_PATH_KEY, currentPath);
            sessionStorage.setItem(LAST_ACTIVE_PATH_KEY, currentPath);
        }
    }, [currentPath]);

    
   
   
    useEffect(() => {
        if (activeConversationId) {
            localStorage.setItem(LAST_ACTIVE_CONVO_ID_KEY, activeConversationId);
        } else {
            localStorage.removeItem(LAST_ACTIVE_CONVO_ID_KEY);
        }
    }, [activeConversationId]);    

    useEffect(() => {
        window.api.onShowMacroInput(() => {
            setIsMacroInputOpen(true);
            setMacroText('');
        });
    }, []);

    // Screenshot capture handler - creates new conversation with screenshot attachment
    useEffect(() => {
        const cleanup = window.api.onScreenshotCaptured(async (screenshotPath: string) => {
            console.log('[Screenshot] Captured:', screenshotPath);

            // Create the conversation in the backend
            const conversation = await window.api.createConversation({
                title: `Screenshot ${new Date().toLocaleString()}`,
                type: 'conversation',
                directory_path: currentPath
            });

            // Create the attachment from the screenshot path
            const fileName = screenshotPath.split('/').pop() || 'screenshot.png';
            const attachment = {
                id: generateId(),
                name: fileName,
                type: 'image/png',
                path: screenshotPath,
                size: 0,
                preview: `file://${screenshotPath}`
            };

            // Set the uploaded files with the screenshot
            setUploadedFiles([attachment]);

            // Get or create a pane for the conversation
            let paneId = activeContentPaneId;
            const existingPaneIds = Object.keys(contentDataRef.current);

            if (!paneId && existingPaneIds.length > 0) {
                paneId = existingPaneIds[0];
            }

            if (!paneId) {
                // No panes exist - create a new layout with a single pane
                paneId = generateId();
                contentDataRef.current[paneId] = {
                    contentType: 'chat',
                    contentId: conversation.id,
                    chatMessages: { messages: [], allMessages: [], displayedMessageCount: 20 }
                };
                setRootLayoutNode({ id: paneId, type: 'content' });
            } else {
                // Update existing pane
                contentDataRef.current[paneId] = {
                    contentType: 'chat',
                    contentId: conversation.id,
                    chatMessages: { messages: [], allMessages: [], displayedMessageCount: 20 }
                };
                setRootLayoutNode(prev => prev ? { ...prev } : { id: paneId, type: 'content' });
            }

            setActiveContentPaneId(paneId);
            setActiveConversationId(conversation.id);

            // Refresh the sidebar
            refreshConversations();

            // Focus the window
            window.focus();
        });

        return cleanup;
    }, [currentPath, generateId, activeContentPaneId, refreshConversations]);

        
    useEffect(() => {
        const registerWindow = () => {
            try {
                const activeWindows = JSON.parse(localStorage.getItem(ACTIVE_WINDOWS_KEY) || '{}');
                activeWindows[windowId] = {
                    currentPath: currentPath || '',
                    lastActive: Date.now(),
                    created: Date.now()
                };
                localStorage.setItem(ACTIVE_WINDOWS_KEY, JSON.stringify(activeWindows));
            } catch (error) {
                console.error('Error registering window:', error);
            }
        };

        const updateActivity = () => {
            try {
                const activeWindows = JSON.parse(localStorage.getItem(ACTIVE_WINDOWS_KEY) || '{}');
                if (activeWindows[windowId]) {
                    activeWindows[windowId].lastActive = Date.now();
                    activeWindows[windowId].currentPath = currentPath || '';
                    localStorage.setItem(ACTIVE_WINDOWS_KEY, JSON.stringify(activeWindows));
                }
            } catch (error) {
                console.error('Error updating window activity:', error);
            }
        };

        registerWindow();
        
        // Update activity periodically and on focus
        const activityInterval = setInterval(updateActivity, 30000); // Every 30 seconds
        const handleFocus = () => updateActivity();
        const handleVisibilityChange = () => {
            if (!document.hidden) updateActivity();
        };

        window.addEventListener('focus', handleFocus);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            clearInterval(activityInterval);
            window.removeEventListener('focus', handleFocus);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [windowId, currentPath]);

    // Cleanup on window close
    useEffect(() => {
        const handleBeforeUnload = () => {
            // Save current workspace
            if (currentPath && rootLayoutNode) {
                const workspaceData = serializeWorkspace();
                if (workspaceData) {
                    saveWorkspaceToStorage(currentPath, workspaceData);
                }
            }
            
            // Mark window as closed but don't remove immediately
            // (in case it's just a refresh)
            try {
                const activeWindows = JSON.parse(localStorage.getItem(ACTIVE_WINDOWS_KEY) || '{}');
                if (activeWindows[windowId]) {
                    activeWindows[windowId].closing = true;
                    activeWindows[windowId].lastActive = Date.now();
                    localStorage.setItem(ACTIVE_WINDOWS_KEY, JSON.stringify(activeWindows));
                }
            } catch (error) {
                console.error('Error marking window as closing:', error);
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [windowId, currentPath, rootLayoutNode, serializeWorkspace, saveWorkspaceToStorage]);
    // Remove the separate workspace loading useEffect completely
    // Instead, integrate it directly into initApplicationData

    useEffect(() => {
        const initApplicationData = async () => {
            setLoading(true);
            setError(null);

            if (!config) {
                try {
                    const loadedConfig = await window.api.getDefaultConfig();
                    if (!loadedConfig || !loadedConfig.baseDir) throw new Error('Invalid config');
                    setConfig(loadedConfig);
                    setBaseDir(loadedConfig.baseDir);
                    return;
                } catch (err) {
                    console.error('Initial config load error:', err);
                    setError(err.message);
                    setLoading(false);
                    return;
                }
            }
            const globalSettings = await window.api.loadGlobalSettings();
            if (globalSettings) {
                // ... (existing global settings loading) ...
                setIsPredictiveTextEnabled(globalSettings.global_settings?.is_predictive_text_enabled || false);
                setPredictiveTextModel(globalSettings.global_settings?.predictive_text_model || 'llama3.2'); // Default to a reasonable model
                setPredictiveTextProvider(globalSettings.global_settings?.predictive_text_provider || 'ollama'); // Default to a reasonable provider
            }

            // Check if npcsh is initialized
            try {
                const npcshStatus = await window.api.npcshCheck();
                if (npcshStatus && !npcshStatus.error && !npcshStatus.initialized) {
                    // Open init modal and fetch package contents
                    setInitModal({ isOpen: true, loading: true, npcs: [], jinxs: [], tab: 'npcs', initializing: false });
                    try {
                        const packageContents = await window.api.npcshPackageContents();
                        if (packageContents && !packageContents.error) {
                            setInitModal(prev => ({
                                ...prev,
                                loading: false,
                                npcs: (packageContents.npcs || []).map((n: any) => ({ ...n, enabled: true })),
                                jinxs: (packageContents.jinxs || []).map((j: any) => ({ ...j, enabled: true }))
                            }));
                        } else {
                            console.error('Failed to get package contents:', packageContents?.error);
                            setInitModal(prev => ({ ...prev, loading: false }));
                        }
                    } catch (e) {
                        console.error('Error fetching package contents:', e);
                        setInitModal(prev => ({ ...prev, loading: false }));
                    }
                }
            } catch (err) {
                console.warn('Could not check npcsh status:', err);
            }

            // Only determine initial path on first load (when currentPath is empty)
            if (!currentPath) {
                let initialPathToLoad = config.baseDir;
                // Check sessionStorage first (for hot-reload within same window),
                // then localStorage (for persistence across app restarts)
                const storedPath = sessionStorage.getItem(LAST_ACTIVE_PATH_KEY) || localStorage.getItem(LAST_ACTIVE_PATH_KEY);
                if (storedPath) {
                    const pathExistsResponse = await window.api.readDirectoryStructure(storedPath);
                    if (!pathExistsResponse?.error) {
                        initialPathToLoad = storedPath;
                    } else {
                        console.warn(`Stored path "${storedPath}" is invalid or inaccessible. Falling back to default.`);
                        sessionStorage.removeItem(LAST_ACTIVE_PATH_KEY);
                        localStorage.removeItem(LAST_ACTIVE_PATH_KEY);
                    }
                } else if (config.default_folder) {
                    initialPathToLoad = config.default_folder;
                }

                setCurrentPath(initialPathToLoad);
                return;
            }

            initialLoadComplete.current = true;

            // CRITICAL: Try to load workspace FIRST, before anything else
            setIsLoadingWorkspace(true);

            let workspaceRestored = false;
            try {
                const savedWorkspace = loadWorkspaceFromStorage(currentPath);
                if (savedWorkspace) {
                    // Load directory structure WITHOUT triggering conversation selection
                    await loadDirectoryStructureWithoutConversationLoad(currentPath);

                    workspaceRestored = await deserializeWorkspace(
                        savedWorkspace,
                        contentDataRef,
                        setRootLayoutNode,
                        setActiveContentPaneId,
                        setIsLoadingWorkspace,
                        generateId,
                        getConversationStats
                    );
                }
            } catch (error) {
                console.error(`Error loading workspace:`, error);
            } finally {
                setIsLoadingWorkspace(false);
            }

            // Now check if workspace was restored
            const workspaceAlreadyLoaded = workspaceRestored && rootLayoutNode && Object.keys(contentDataRef.current).length > 0;

            // Only load directory structure if workspace wasn't restored
            if (!workspaceAlreadyLoaded) {
                await loadDirectoryStructure(currentPath);
            } else {
                await loadConversationsWithoutAutoSelect(currentPath);
            }

            const fetchedModels = await fetchModels(currentPath, setModelsLoading, setModelsError, setAvailableModels);
            const fetchedNPCs = await loadAvailableNPCs(currentPath, setNpcsLoading, setNpcsError, setAvailableNPCs);

            // Get project-level ctx settings (model/provider/npc from .ctx files or env)
            const projectCtx = await window.api.getProjectCtx(currentPath);

            // Priority order for model selection:
            // 1. Project ctx (from npc_team/*.ctx or env vars)
            // 2. Previously saved model in localStorage
            // 3. Global config default
            let modelToSet = projectCtx.model || config.model || 'llama3.2';
            let providerToSet = projectCtx.provider || config.provider || 'ollama';
            let npcToSet = projectCtx.npc || config.npc || 'sibiji';

            // Validate that the model exists in available models
            const projectModelExists = fetchedModels.find(m => m.value === modelToSet);
            if (projectModelExists) {
                providerToSet = projectModelExists.provider;
            } else {
                // Project model not found - try saved localStorage model
                const savedModel = localStorage.getItem('npcStudioCurrentModel');
                const savedProvider = localStorage.getItem('npcStudioCurrentProvider');
                if (savedModel) {
                    const parsedSavedModel = JSON.parse(savedModel);
                    const savedModelExists = fetchedModels.find(m => m.value === parsedSavedModel);
                    if (savedModelExists) {
                        modelToSet = parsedSavedModel;
                        providerToSet = savedProvider ? JSON.parse(savedProvider) : savedModelExists.provider;
                    }
                }

                // If still no valid model, pick first available
                if (!fetchedModels.find(m => m.value === modelToSet) && fetchedModels.length > 0) {
                    modelToSet = fetchedModels[0].value;
                    providerToSet = fetchedModels[0].provider;
                }
            }

            const storedConvoId = localStorage.getItem(LAST_ACTIVE_CONVO_ID_KEY);
            let targetConvoId = null;

            const currentConversations = directoryConversationsRef.current;
            
            if (storedConvoId) {
                const convoInCurrentDir = currentConversations.find(conv => conv.id === storedConvoId);
                if (convoInCurrentDir) {
                    targetConvoId = storedConvoId;
                    // Only use conversation's last model if projectCtx didn't specify one
                    if (!projectCtx.model) {
                        const lastUsedInConvo = await window.api.getLastUsedInConversation(targetConvoId);
                        if (lastUsedInConvo?.model) {
                            const validModel = fetchedModels.find(m => m.value === lastUsedInConvo.model);
                            if (validModel) {
                                modelToSet = validModel.value;
                                providerToSet = validModel.provider;
                            }
                        }
                        if (lastUsedInConvo?.npc) {
                            const validNpc = fetchedNPCs.find(n => n.value === lastUsedInConvo.npc);
                            if (validNpc) {
                                npcToSet = validNpc.value;
                            }
                        }
                    }
                } else {
                    localStorage.removeItem(LAST_ACTIVE_CONVO_ID_KEY);
                }
            }

            // Only use directory's last model if projectCtx didn't specify one
            if (!targetConvoId && !projectCtx.model) {
                const lastUsedInDir = await window.api.getLastUsedInDirectory(currentPath);
                if (lastUsedInDir?.model) {
                    const validModel = fetchedModels.find(m => m.value === lastUsedInDir.model);
                    if (validModel) {
                        modelToSet = validModel.value;
                        providerToSet = validModel.provider;
                    }
                }
                if (lastUsedInDir?.npc) {
                    const validNpc = fetchedNPCs.find(n => n.value === lastUsedInDir.npc);
                    if (validNpc) {
                        npcToSet = validNpc.value;
                    }
                }
            }
            
            if (!fetchedModels.some(m => m.value === modelToSet) && fetchedModels.length > 0) {
                // Config model not found - try favorites first, then fall back to a reasonable default
                // Load favorites from localStorage (since state might be stale in closure)
                const savedFavorites = localStorage.getItem('npcStudioFavoriteModels');
                const favModels = savedFavorites ? new Set(JSON.parse(savedFavorites)) : new Set();

                // Find first favorite that exists in available models
                const firstFavorite = fetchedModels.find(m => favModels.has(m.value));
                if (firstFavorite) {
                    modelToSet = firstFavorite.value;
                    providerToSet = firstFavorite.provider;
                } else {
                    // No favorites found, try to pick a reasonable default (not first alphabetical)
                    // Prefer local models, then cheap cloud models - avoid expensive ones like claude-opus
                    const preferredDefaults = [
                        'llama3.2', 'llama3.2:latest', 'llama3.1', 'llama3', 'mistral', 'mixtral',  // Local
                        'gpt-4o-mini', 'gpt-3.5-turbo',  // Cheap OpenAI
                        'claude-3-5-sonnet', 'claude-3-sonnet', 'claude-3-haiku', 'claude-sonnet-4-20250514',  // Cheaper Claude
                        'gemini-pro', 'gemini-1.5-flash',  // Google
                    ];
                    const preferredModel = fetchedModels.find(m =>
                        preferredDefaults.some(pref => m.value.includes(pref))
                    );
                    if (preferredModel) {
                        modelToSet = preferredModel.value;
                        providerToSet = preferredModel.provider;
                    } else {
                        // Last resort: pick one that's NOT opus/expensive
                        const notExpensive = fetchedModels.find(m =>
                            !m.value.toLowerCase().includes('opus') &&
                            !m.value.toLowerCase().includes('gpt-4-turbo') &&
                            !m.value.toLowerCase().includes('gpt-4-32k')
                        );
                        if (notExpensive) {
                            modelToSet = notExpensive.value;
                            providerToSet = notExpensive.provider;
                        } else {
                            modelToSet = fetchedModels[0].value;
                            providerToSet = fetchedModels[0].provider;
                        }
                    }
                }
            } else if (fetchedModels.length === 0) {
                modelToSet = 'llama3.2';
                providerToSet = 'ollama';
            }

            if (!fetchedNPCs.some(n => n.value === npcToSet) && fetchedNPCs.length > 0) {
                npcToSet = fetchedNPCs[0].value;
            } else if (fetchedNPCs.length === 0) {
                npcToSet = 'sibiji';
            }

            setCurrentModel(modelToSet);
            setCurrentProvider(providerToSet);
            setCurrentNPC(npcToSet);
            // Sync selectedModels/selectedNPCs with currentModel/currentNPC
            setSelectedModels(modelToSet ? [modelToSet] : []);
            setSelectedNPCs(npcToSet ? [npcToSet] : []);

            if (!workspaceRestored) {
                if (targetConvoId && currentConversations.find(c => c.id === targetConvoId)) {
                    await handleConversationSelect(targetConvoId, false, false);
                }
            } else {
                if (targetConvoId) {
                    setActiveConversationId(targetConvoId);
                }
            }

            setLoading(false);
        };

        initApplicationData();

    }, [currentPath, config]);






    const PRED_PLACEHOLDER = 'Generating...';
    const streamBuffersRef = useRef(new Map()); // streamId -> pending buffer

    
    
    const renderSearchResults = () => {
        if (searchLoading) {
           

            return <div className="p-4 text-center theme-text-muted">Searching...</div>;
        }

        if (!deepSearchResults || deepSearchResults.length === 0) {
            return <div className="p-4 text-center theme-text-muted">No results for "{searchTerm}".</div>;
        }

        return (
            <div className="mt-4">
                <div className="px-4 py-2 text-xs text-gray-500">Search Results ({deepSearchResults.length})</div>
                {deepSearchResults.map(result => (
                    <button
                        key={result.conversationId}
                        onClick={() => handleSearchResultSelect(result.conversationId, searchTerm)}
                        className={`flex flex-col gap-1 px-4 py-2 w-full theme-hover text-left rounded-lg transition-all ${
                            activeConversationId === result.conversationId ? 'border-l-2 border-blue-500' : ''
                        }`}
                    >
                        <div className="flex items-center gap-2">
                            <FileIcon size={16} className="text-gray-400 flex-shrink-0" />
                            <div className="flex flex-col overflow-hidden">
                                <span className="text-sm truncate font-semibold">{result.conversationTitle || 'Conversation'}</span>
                                <span className="text-xs text-gray-500">{new Date(result.timestamp).toLocaleString()}</span>
                            </div>
                        </div>
                        <div className="text-xs text-gray-400 pl-6">
                            {result.matches.length} match{result.matches.length !== 1 ? 'es' : ''}
                        </div>
                        {result.matches[0] && (
                            <div
                                className="text-xs text-gray-500 pl-6 mt-1 italic truncate"
                                title={result.matches[0].snippet}
                            >
                                ...{result.matches[0].snippet}...
                                                       </div>
                        )}
                    </button>
                ))}
            </div>
        );
    };

    const handleRefreshFilesAndFolders = () => {
        if (currentPath) {
            loadDirectoryStructure(currentPath);
        }
    }

    // Periodic refresh for files/folders and conversations (every 15 seconds)
    useEffect(() => {
        if (!currentPath) return;

        const refreshInterval = setInterval(() => {
            // Refresh files if not collapsed
            if (!filesCollapsed) {
                loadDirectoryStructure(currentPath);
            }
            // Refresh conversations if not collapsed
            if (!conversationsCollapsed) {
                loadConversationsWithoutAutoSelect(currentPath);
            }
        }, 15000);

        return () => clearInterval(refreshInterval);
    }, [currentPath, filesCollapsed, conversationsCollapsed, loadDirectoryStructure, loadConversationsWithoutAutoSelect]);



                            
                            

    // Update the existing useEffect for resize to include body class management
    useEffect(() => {
        const handleMouseUp = () => {
            setIsResizingSidebar(false);
            setIsResizingInput(false);
            document.body.classList.remove('resizing-sidebar', 'resizing-input');
        };

        if (isResizingSidebar) {
            document.body.classList.add('resizing-sidebar');
            document.addEventListener('mousemove', handleSidebarResize);
            document.addEventListener('mouseup', handleMouseUp);
            
            return () => {
                document.body.classList.remove('resizing-sidebar');
                document.removeEventListener('mousemove', handleSidebarResize);
                document.removeEventListener('mouseup', handleMouseUp);
            };
        }
        
        if (isResizingInput) {
            document.body.classList.add('resizing-input');
            document.addEventListener('mousemove', handleInputResize);
            document.addEventListener('mouseup', handleMouseUp);
            
            return () => {
                document.body.classList.remove('resizing-input');
                document.removeEventListener('mousemove', handleInputResize);
                document.removeEventListener('mouseup', handleMouseUp);
            };
        }
    }, [isResizingSidebar, isResizingInput, handleSidebarResize, handleInputResize]);




    const renderModals = () => 
    {
        
    return     (
        <>
            <NPCTeamMenu isOpen={npcTeamMenuOpen} onClose={handleCloseNpcTeamMenu} currentPath={currentPath} startNewConversation={startNewConversationWithNpc}/>
            <JinxMenu isOpen={jinxMenuOpen} onClose={() => setJinxMenuOpen(false)} currentPath={currentPath}/>

<SettingsMenu
    isOpen={settingsOpen}
    onClose={() => setSettingsOpen(false)}
    currentPath={currentPath}
    onPathChange={(newPath) => { setCurrentPath(newPath); }}
    // NEW PROPS FOR PREDICTIVE TEXT:
    isPredictiveTextEnabled={isPredictiveTextEnabled}
    setIsPredictiveTextEnabled={setIsPredictiveTextEnabled}
    predictiveTextModel={predictiveTextModel}
    setPredictiveTextModel={setPredictiveTextModel}
    predictiveTextProvider={predictiveTextProvider}
    setPredictiveTextProvider={setPredictiveTextProvider}
    availableModels={availableModels} // Pass available models for dropdown
/>

<DownloadManager
    isOpen={downloadManagerOpen}
    onClose={() => setDownloadManagerOpen(false)}
    currentPath={currentPath}
/>

{/* Download toast notification */}
{downloadToast && (
    <div
        className="fixed bottom-4 right-4 z-50 flex items-center gap-3 px-4 py-3 bg-blue-600 text-white rounded-lg shadow-lg animate-in slide-in-from-bottom-5"
        onClick={() => setDownloadManagerOpen(true)}
        style={{ cursor: 'pointer' }}
    >
        <div className="animate-spin">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
            </svg>
        </div>
        <div>
            <div className="text-sm font-medium">{downloadToast.message}</div>
            <div className="text-xs opacity-80 truncate max-w-[200px]">{downloadToast.filename}</div>
        </div>
        <button
            onClick={(e) => { e.stopPropagation(); setDownloadToast(null); }}
            className="p-1 hover:bg-white/20 rounded"
        >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
        </button>
    </div>
)}

        {messageContextMenuPos && (
            <>
                {/* Backdrop to catch outside clicks */}
                <div
                    className="fixed inset-0 z-40"
                    onClick={() => setMessageContextMenuPos(null)}
                />
                <div
                    className="fixed theme-bg-secondary theme-border border rounded shadow-lg py-1 z-50"
                    style={{ top: messageContextMenuPos.y, left: messageContextMenuPos.x }}
                    onMouseLeave={() => setMessageContextMenuPos(null)}
                >
                    {/* Show copy option if there's selected text */}
                    {messageContextMenuPos.selectedText && (
                        <>
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText(messageContextMenuPos.selectedText);
                                    setMessageContextMenuPos(null);
                                }}
                                className="flex items-center gap-2 px-4 py-2 theme-hover w-full text-left theme-text-primary text-xs"
                            >
                                <Edit size={14} />
                                <span>Copy Selected Text</span>
                            </button>
                            <div className="border-t theme-border my-1"></div>
                        </>
                    )}

                    {/* Delete option */}
                    <div className="border-t theme-border my-1"></div>
                    <button
                        onClick={handleDeleteSelectedMessages}
                        className="flex items-center gap-2 px-4 py-2 theme-hover w-full text-left text-red-400 text-xs"
                    >
                        <Trash size={14} />
                        <span>Delete Messages ({selectedMessages.size})</span>
                    </button>
                </div>
            </>
        )}

        {resendModal.isOpen && (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
                <div className="theme-bg-secondary p-6 theme-border border rounded-lg shadow-xl max-w-md w-full">
                    <h3 className="text-lg font-medium mb-4 theme-text-primary">Resend Message</h3>
                    
                    <div className="mb-4">
                        <label className="block text-sm font-medium mb-2 theme-text-primary">Model:</label>
                        <select
                            value={resendModal.selectedModel}
                            onChange={(e) => setResendModal(prev => ({ ...prev, selectedModel: e.target.value }))}
                            className="w-full theme-input text-sm rounded px-3 py-2 border"
                            disabled={modelsLoading || !!modelsError}
                        >
                            {modelsLoading && <option value="">Loading...</option>}
                            {modelsError && <option value="">Error loading models</option>}
                            {!modelsLoading && !modelsError && availableModels.length === 0 && (<option value="">No models</option>)}
                            {!modelsLoading && !modelsError && availableModels.map(model => (
                                <option key={model.value} value={model.value}>{model.display_name}</option>
                            ))}
                        </select>
                    </div>
                    
                    <div className="mb-6">
                        <label className="block text-sm font-medium mb-2 theme-text-primary">NPC:</label>
                        <select
                            value={resendModal.selectedNPC}
                            onChange={(e) => setResendModal(prev => ({ ...prev, selectedNPC: e.target.value }))}
                            className="w-full theme-input text-sm rounded px-3 py-2 border"
                            disabled={npcsLoading || !!npcsError}
                        >
                            {npcsLoading && <option value="">Loading NPCs...</option>}
                            {npcsError && <option value="">Error loading NPCs</option>}
                            {!npcsLoading && !npcsError && availableNPCs.length === 0 && (
                                <option value="">No NPCs available</option>
                            )}
                            {!npcsLoading && !npcsError && availableNPCs.map(npc => (
                                <option key={`${npc.source}-${npc.value}`} value={npc.value}>
                                    {npc.display_name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="mb-4 p-3 theme-bg-tertiary rounded border">
                        <div className="text-xs theme-text-muted mb-1">Message to resend:</div>
                        <div className="text-sm theme-text-primary max-h-20 overflow-y-auto">
                            {resendModal.message?.content?.substring(0, 200)}
                            {resendModal.message?.content?.length > 200 && '...'}
                        </div>
                    </div>
                    
                    <div className="flex justify-end gap-3">
                        <button
                            className="px-4 py-2 theme-button theme-hover rounded text-sm"
                            onClick={() => setResendModal({ isOpen: false, message: null, selectedModel: '', selectedNPC: '' })}
                        >
                            Cancel
                        </button>
                        <button
                            className="px-4 py-2 theme-button-primary rounded text-sm"
                            onClick={() => {
                                handleResendWithSettings(
                                    resendModal.message, 
                                    resendModal.selectedModel, 
                                    resendModal.selectedNPC
                                );
                                setResendModal({ isOpen: false, message: null, selectedModel: '', selectedNPC: '' });
                            }}
                            disabled={!resendModal.selectedModel || !resendModal.selectedNPC}
                        >
                            Resend
                        </button>
                    </div>
                </div>

            </div>
        )}
        {memoryApprovalModal.isOpen && (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
        <div className="theme-bg-secondary p-6 theme-border border rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <h3 className="text-lg font-medium mb-4">New Memories Extracted</h3>
            
            <div className="space-y-4 mb-6">
                {memoryApprovalModal.memories.map(memory => (
                    <div key={memory.memory_id} className="p-3 theme-bg-tertiary rounded border">
                        <p className="text-sm theme-text-primary mb-2">{memory.content}</p>
                        <div className="text-xs theme-text-muted mb-3">{memory.context}</div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => handleMemoryDecision(memory.memory_id, 'human-approved')}
                                className="px-3 py-1 theme-button-success rounded text-xs"
                            >
                                Approve
                            </button>
                            <button
                                onClick={() => handleMemoryDecision(memory.memory_id, 'human-rejected')}
                                className="px-3 py-1 theme-button-danger rounded text-xs"
                            >
                                Reject
                            </button>
                            <button
                                onClick={() => {
                                    const edited = prompt('Edit memory:', memory.content);
                                    if (edited && edited !== memory.content) {
                                        handleMemoryDecision(memory.memory_id, 'human-edited', edited);
                                    }
                                }}
                                className="px-3 py-1 theme-button rounded text-xs"
                            >
                                Edit
                            </button>
                        </div>
                    </div>
                ))}
            </div>
            
            <div className="flex justify-end gap-3">
                <button
                    onClick={() => setMemoryApprovalModal({ isOpen: false, memories: [] })}
                    className="px-4 py-2 theme-button rounded text-sm"
                >
                    Ignore for Now
                </button>
            </div>
        </div>
    </div>
)}
{promptModal.isOpen && (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
        <div className="theme-bg-secondary p-6 theme-border border rounded-lg shadow-xl max-w-lg w-full">
            <div className="flex flex-col items-center text-center">
                <div className="theme-bg-tertiary p-3 rounded-full mb-4">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="theme-text-primary">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14,2 14,8 20,8"/>
                        <line x1="12" y1="18" x2="12" y2="12"/>
                        <line x1="9" y1="15" x2="15" y2="15"/>
                    </svg>
                </div>
                <h3 className="text-lg font-medium mb-2 theme-text-primary">{promptModal.title}</h3>
                <p className="theme-text-muted mb-4 text-sm">{promptModal.message}</p>
            </div>
            <input
                type="text"
                value={promptModalValue}
                onChange={(e) => setPromptModalValue(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        promptModal.onConfirm?.(promptModalValue);
                        setPromptModal({ isOpen: false, title: '', message: '', defaultValue: '', onConfirm: null });
                        setPromptModalValue('');
                    } else if (e.key === 'Escape') {
                        setPromptModal({ isOpen: false, title: '', message: '', defaultValue: '', onConfirm: null });
                        setPromptModalValue('');
                    }
                }}
                placeholder="Enter filename..."
                className="w-full theme-input text-sm rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
                autoFocus
            />
            <div className="flex justify-end gap-3">
                <button
                    className="px-4 py-2 theme-button theme-hover rounded text-sm"
                    onClick={() => {
                        setPromptModal({ isOpen: false, title: '', message: '', defaultValue: '', onConfirm: null });
                        setPromptModalValue('');
                    }}
                >
                    Cancel
                </button>
                <button
                    className="px-4 py-2 theme-button-primary rounded text-sm"
                    onClick={() => {
                        promptModal.onConfirm?.(promptModalValue);
                        setPromptModal({ isOpen: false, title: '', message: '', defaultValue: '', onConfirm: null });
                        setPromptModalValue('');
                    }}
                >
                    Create
                </button>
            </div>
        </div>
    </div>
)}
{initModal.isOpen && (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
        <div className="theme-bg-primary border theme-border rounded-xl shadow-2xl max-w-3xl w-full max-h-[85vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b theme-border flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center">
                    <Sparkles size={20} className="text-purple-400" />
                </div>
                <div>
                    <h2 className="text-lg font-semibold theme-text-primary">Welcome to Incognide</h2>
                    <p className="text-xs theme-text-muted">Set up your global NPC team with agents and jinxs</p>
                </div>
                <button
                    onClick={() => setInitModal({ isOpen: false, loading: false, npcs: [], jinxs: [], tab: 'npcs', initializing: false })}
                    className="ml-auto p-2 theme-hover rounded-lg"
                >
                    <X size={18} />
                </button>
            </div>

            {/* Tab Navigation */}
            <div className="flex border-b theme-border px-4">
                <button
                    onClick={() => setInitModal(prev => ({ ...prev, tab: 'npcs' }))}
                    className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                        initModal.tab === 'npcs' ? 'border-purple-500 text-purple-400' : 'border-transparent theme-text-muted hover:theme-text-primary'
                    }`}
                >
                    <Users size={16} /> NPCs ({initModal.npcs.filter(n => n.enabled).length})
                </button>
                <button
                    onClick={() => setInitModal(prev => ({ ...prev, tab: 'jinxs' }))}
                    className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                        initModal.tab === 'jinxs' ? 'border-yellow-500 text-yellow-400' : 'border-transparent theme-text-muted hover:theme-text-primary'
                    }`}
                >
                    <Wrench size={16} /> Jinxs ({initModal.jinxs.filter(j => j.enabled).length})
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">
                {initModal.loading ? (
                    <div className="flex items-center justify-center h-48">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
                        <span className="ml-3 theme-text-muted">Loading package contents...</span>
                    </div>
                ) : initModal.tab === 'npcs' ? (
                    <div className="space-y-2">
                        {initModal.npcs.length === 0 ? (
                            <p className="text-center theme-text-muted py-8">No NPCs found in package</p>
                        ) : initModal.npcs.map((npc, i) => (
                            <div key={i} className={`p-3 rounded-lg border theme-border flex items-center gap-3 ${npc.enabled ? 'bg-purple-500/10' : 'opacity-50'}`}>
                                <input
                                    type="checkbox"
                                    checked={npc.enabled}
                                    onChange={() => setInitModal(prev => ({
                                        ...prev,
                                        npcs: prev.npcs.map((n, idx) => idx === i ? { ...n, enabled: !n.enabled } : n)
                                    }))}
                                    className="w-4 h-4 accent-purple-500"
                                />
                                <div className="flex-1 min-w-0">
                                    <div className="font-medium theme-text-primary text-sm">{npc.name}</div>
                                    <div className="text-xs theme-text-muted truncate">{npc.primary_directive}</div>
                                </div>
                                {npc.model && (
                                    <span className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-300">{npc.model}</span>
                                )}
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="space-y-2">
                        {initModal.jinxs.length === 0 ? (
                            <p className="text-center theme-text-muted py-8">No jinxs found in package</p>
                        ) : initModal.jinxs.map((jinx, i) => (
                            <div key={i} className={`p-3 rounded-lg border theme-border flex items-center gap-3 ${jinx.enabled ? 'bg-yellow-500/10' : 'opacity-50'}`}>
                                <input
                                    type="checkbox"
                                    checked={jinx.enabled}
                                    onChange={() => setInitModal(prev => ({
                                        ...prev,
                                        jinxs: prev.jinxs.map((j, idx) => idx === i ? { ...j, enabled: !j.enabled } : j)
                                    }))}
                                    className="w-4 h-4 accent-yellow-500"
                                />
                                <div className="flex-1 min-w-0">
                                    <div className="font-medium theme-text-primary text-sm">{jinx.name}</div>
                                    <div className="text-xs theme-text-muted truncate">{jinx.description || jinx.path}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t theme-border flex justify-between items-center">
                <div className="text-xs theme-text-muted">
                    {initModal.npcs.filter(n => n.enabled).length} NPCs, {initModal.jinxs.filter(j => j.enabled).length} jinxs selected
                </div>
                <div className="flex gap-3">
                    <button
                        className="px-4 py-2 theme-button theme-hover rounded text-sm"
                        onClick={() => setInitModal({ isOpen: false, loading: false, npcs: [], jinxs: [], tab: 'npcs', initializing: false })}
                    >
                        Skip
                    </button>
                    <button
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded text-sm flex items-center gap-2"
                        disabled={initModal.initializing || initModal.loading}
                        onClick={async () => {
                            setInitModal(prev => ({ ...prev, initializing: true }));
                            const result = await window.api.npcshInit();
                            if (result.error) {
                                console.error('Init failed:', result.error);
                            }
                            setInitModal({ isOpen: false, loading: false, npcs: [], jinxs: [], tab: 'npcs', initializing: false });
                        }}
                    >
                        {initModal.initializing ? (
                            <>
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                Initializing...
                            </>
                        ) : (
                            <>
                                <Sparkles size={16} />
                                Initialize
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    </div>
)}
            {aiEditModal.isOpen && aiEditModal.type === 'agentic' && !aiEditModal.isLoading && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
                    <div className="theme-bg-secondary p-6 theme-border border rounded-lg shadow-xl max-w-6xl w-full max-h-[85vh] overflow-hidden flex flex-col">
                        <h3 className="text-lg font-medium mb-4">Proposed Changes ({aiEditModal.proposedChanges?.length || 0} files)</h3>
                        
                        <div className="flex-1 overflow-y-auto space-y-4">
                            {aiEditModal.proposedChanges?.map((change, idx) => {
                                console.log(`Rendering change for ${change.filePath}. Diff length: ${change.diff.length}`);
                                return (
                                    <div key={idx} className="border theme-border rounded p-4">
                                        <div className="flex justify-between items-start mb-2">
                                            <div>
                                                <h4 className="font-semibold">{change.filePath.split('/').pop()}</h4>
                                                <p className="text-xs theme-text-muted mt-1">{change.reasoning}</p>
                                            </div>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={async () => {
                                                        console.log(`Attempting to apply and save single change for: ${change.filePath}`); // <--- LAVANZARO'S LOGGING!
                                                        const paneData = contentDataRef.current[change.paneId];
                                                        if (paneData) {
                                                            paneData.fileContent = change.newCode;
                                                            paneData.fileChanged = true;
                                                            setRootLayoutNode(p => ({...p}));
                                                            try {
                                                                await window.api.writeFileContent(change.filePath, change.newCode);
                                                                paneData.fileChanged = false;
                                                                setRootLayoutNode(p => ({...p}));
                                                                console.log(`Successfully applied and saved file: ${change.filePath}`);
                                                            } catch (saveError) {
                                                                console.error(`Error saving file ${change.filePath} after agentic apply:`, saveError); // <--- LAVANZARO'S LOGGING!
                                                                setError(`Failed to save ${change.filePath}: ${saveError.message}`);
                                                            }
                                                        }
                                                        setAiEditModal(prev => ({
                                                            ...prev,
                                                            proposedChanges: prev.proposedChanges.filter((_, i) => i !== idx)
                                                        }));
                                                    }}
                                                    className="px-3 py-1 theme-button-success rounded text-xs"
                                                >
                                                    Apply
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setAiEditModal(prev => ({
                                                            ...prev,
                                                            proposedChanges: prev.proposedChanges.filter((_, i) => i !== idx)
                                                        }));
                                                    }}
                                                    className="px-3 py-1 theme-button-danger rounded text-xs"
                                                >
                                                    Reject
                                                </button>
                                            </div>
                                        </div>
                                        
                                        <div className="mt-2 text-xs font-mono overflow-x-auto border border-yellow-500 rounded p-2">
                                            <div className="text-center theme-text-muted mb-2">--- DIFF CONTENT BELOW (IF AVAILABLE) ---</div>
                                            {change.diff.length > 0 ? (
                                                <table className="w-full">
                                                    <tbody>
                                                        {change.diff.map((line, lineIdx) => (
                                                            <tr key={lineIdx} className={`
                                                                ${line.type === 'added' ? 'bg-green-900/20' : ''}
                                                                ${line.type === 'removed' ? 'bg-red-900/20' : ''}
                                                            `}>
                                                                <td className="px-2 text-gray-600 w-8">{line.originalLine || ''}</td>
                                                                <td className="px-2 text-gray-600 w-8">{line.modifiedLine || ''}</td>
                                                                <td className="px-2">
                                                                    <span className={line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}>
                                                                        {line.content}
                                                                    </span>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            ) : (
                                                <div className="text-center theme-text-muted">No diff content available for this file.</div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        
                        <div className="flex justify-end gap-3 mt-4">
                            <button onClick={() => setAiEditModal({ isOpen: false })} className="px-4 py-2 theme-button rounded">
                                Close
                            </button>
                            <button 
                                onClick={async () => {
                                    console.log('Attempting to apply and save ALL changes.'); // <--- LAVANZARO'S LOGGING!
                                    const savePromises = [];
                                    aiEditModal.proposedChanges?.forEach(change => {
                                        const paneData = contentDataRef.current[change.paneId];
                                        if (paneData) {
                                            paneData.fileContent = change.newCode;
                                            paneData.fileChanged = true;
                                            savePromises.push(
                                                window.api.writeFileContent(change.filePath, change.newCode)
                                                    .then(() => {
                                                        paneData.fileChanged = false;
                                                        console.log(`Successfully applied and saved file: ${change.filePath}`);
                                                    })
                                                    .catch(saveError => {
                                                        console.error(`Error saving file ${change.filePath} after agentic apply all:`, saveError); // <--- LAVANZARO'S LOGGING!
                                                        setError(`Failed to save ${change.filePath}: ${saveError.message}`);
                                                    })
                                            );
                                        }
                                    });
                                    await Promise.allSettled(savePromises);
                                    setRootLayoutNode(p => ({...p}));
                                    setAiEditModal({ isOpen: false });
                                }}
                                className="px-4 py-2 theme-button-success rounded"
                            >
                                Apply All
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* AI Code Action Modal (Explain, Add Comments, Refactor) */}
            {aiEditModal.isOpen && ['ask', 'document', 'edit'].includes(aiEditModal.type) && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
                    <div className="theme-bg-secondary p-6 theme-border border rounded-lg shadow-xl max-w-3xl w-full max-h-[80vh] overflow-hidden flex flex-col">
                        <h3 className="text-lg font-medium mb-4">
                            {aiEditModal.type === 'ask' ? 'Explanation' : aiEditModal.type === 'document' ? 'Comments' : 'Refactored Code'}
                        </h3>
                        <div className="flex-1 overflow-y-auto">
                            {aiEditModal.isLoading ? (
                                <div className="flex items-center justify-center py-8">
                                    <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full"></div>
                                    <span className="ml-2 theme-text-muted">Generating...</span>
                                </div>
                            ) : (
                                <pre className="whitespace-pre-wrap text-sm theme-text-primary bg-black/20 p-4 rounded overflow-auto">
                                    {aiEditModal.aiResponse || 'No response'}
                                </pre>
                            )}
                        </div>
                        <div className="flex justify-end gap-3 mt-4">
                            <button
                                onClick={() => {
                                    if (aiEditModal.aiResponse) {
                                        navigator.clipboard.writeText(aiEditModal.aiResponse);
                                    }
                                }}
                                className="px-4 py-2 theme-button rounded"
                            >
                                Copy
                            </button>
                            <button onClick={() => setAiEditModal({ isOpen: false })} className="px-4 py-2 theme-button rounded">
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}


                    {renderPaneContextMenu()}

        {renderPdfContextMenu()}
        {renderBrowserContextMenu()}
        

        {renderMessageContextMenu()}


            {isMacroInputOpen && (
                <MacroInput
                    isOpen={isMacroInputOpen}
                    currentPath={currentPath}
                    onClose={() => {
                        setIsMacroInputOpen(false);
                        window.api?.hideMacro?.();
                    }}
                    onSubmit={async ({ macro, conversationId, model, provider }) => {
                        // Open or create a chat pane for this conversation and get the pane ID
                        const paneId = await handleConversationSelect(conversationId);
                        console.log('[MacroInput onSubmit] Got paneId:', paneId);

                        if (!paneId || !contentDataRef.current[paneId]) {
                            console.error('[MacroInput onSubmit] No paneData found for paneId:', paneId);
                            return;
                        }

                        const paneData = contentDataRef.current[paneId];
                        const newStreamId = generateId();

                        // Register stream to pane mapping
                        streamToPaneRef.current[newStreamId] = paneId;
                        setIsStreaming(true);

                        // Add user message
                        const userMsg = {
                            id: generateId(),
                            role: 'user',
                            content: macro,
                            timestamp: new Date().toISOString(),
                            type: 'message'
                        };

                        // Add placeholder assistant message
                        const assistantMsg = {
                            id: newStreamId,
                            role: 'assistant',
                            content: '',
                            timestamp: new Date().toISOString(),
                            type: 'message',
                            isStreaming: true,
                            parentMessageId: userMsg.id,
                        };

                        if (paneData.chatMessages) {
                            paneData.chatMessages.allMessages = [
                                ...(paneData.chatMessages.allMessages || []),
                                userMsg,
                                assistantMsg
                            ];
                            paneData.chatMessages.messages = paneData.chatMessages.allMessages.slice(
                                -(paneData.chatMessages.displayedMessageCount || 20)
                            );
                        }

                        setRootLayoutNode(prev => ({ ...prev }));

                        try {
                            // Execute streaming command
                            await window.api.executeCommandStream({
                                commandstr: macro,
                                currentPath,
                                conversationId,
                                model,
                                provider,
                                npc: currentNPC,
                                npcSource: 'global',
                                attachments: [],
                                streamId: newStreamId,
                                // Pass frontend message IDs
                                userMessageId: userMsg.id,
                                assistantMessageId: newStreamId,
                                parentMessageId: userMsg.id,
                                // Default generation params for macros
                                temperature: 0.7,
                                top_p: 0.9,
                                top_k: 40,
                                max_tokens: 4096,
                            });
                        } catch (err: any) {
                            console.error('[MacroInput onSubmit] Error:', err);
                            // Update message with error
                            if (paneData.chatMessages) {
                                const msgIndex = paneData.chatMessages.allMessages.findIndex((m: any) => m.id === newStreamId);
                                if (msgIndex !== -1) {
                                    paneData.chatMessages.allMessages[msgIndex].content = `Error: ${err.message}`;
                                    paneData.chatMessages.allMessages[msgIndex].isStreaming = false;
                                    paneData.chatMessages.allMessages[msgIndex].type = 'error';
                                }
                            }
                            delete streamToPaneRef.current[newStreamId];
                            if (Object.keys(streamToPaneRef.current).length === 0) {
                                setIsStreaming(false);
                            }
                            setRootLayoutNode(prev => ({ ...prev }));
                        }

                        refreshConversations();
                    }}
                />
            )}

            <CtxEditor
                isOpen={ctxEditorOpen}
                onClose={() => setCtxEditorOpen(false)}
                currentPath={currentPath}
                npcList={availableNPCs.map(npc => ({ name: npc.name, display_name: npc.display_name }))}
                jinxList={availableJinxs.map(jinx => ({ jinx_name: jinx.name, description: jinx.description }))}
            />

            <TeamManagement
                isOpen={teamManagementOpen}
                onClose={() => setTeamManagementOpen(false)}
                currentPath={currentPath}
                startNewConversation={startNewConversationWithNpc}
                npcList={availableNPCs.map(npc => ({ name: npc.name, display_name: npc.display_name }))}
                jinxList={availableJinxs.map(jinx => ({ jinx_name: jinx.name, description: jinx.description }))}
            />

            {/* Git Modal - Enhanced with tabs */}
            {gitModalOpen && (
                <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setGitModalOpen(false)}>
                    <div className="w-full max-w-5xl max-h-[85vh] theme-bg-primary rounded-lg border theme-border flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                        {/* Header */}
                        <div className="flex items-center justify-between p-4 border-b theme-border">
                            <div className="flex items-center gap-3">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-purple-400">
                                    <line x1="6" y1="3" x2="6" y2="15"></line>
                                    <circle cx="18" cy="6" r="3"></circle>
                                    <circle cx="6" cy="18" r="3"></circle>
                                    <path d="M18 9a9 9 0 0 1-9 9"></path>
                                </svg>
                                <h2 className="text-lg font-semibold theme-text-primary">Git</h2>
                                {gitStatus?.branch && <span className="text-sm theme-text-muted">({gitStatus.branch})</span>}
                            </div>
                            <button onClick={() => setGitModalOpen(false)} className="p-2 theme-hover rounded-lg">
                                <X size={20} />
                            </button>
                        </div>

                        {/* Tab Bar */}
                        <div className="flex border-b theme-border px-4">
                            {(['status', 'diff', 'branches', 'history'] as const).map(tab => (
                                <button
                                    key={tab}
                                    onClick={() => {
                                        setGitModalTab(tab);
                                        if (tab === 'diff') loadGitDiff();
                                        if (tab === 'branches') loadGitBranches();
                                        if (tab === 'history') loadGitHistory();
                                    }}
                                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                                        gitModalTab === tab
                                            ? 'border-purple-500 text-purple-400'
                                            : 'border-transparent theme-text-muted hover:theme-text-primary'
                                    }`}
                                >
                                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                                </button>
                            ))}
                        </div>

                        {/* Tab Content */}
                        <div className="flex-1 overflow-auto p-4">
                            {!gitStatus ? (
                                <div className="text-center theme-text-muted py-8">No git repository in this directory</div>
                            ) : gitModalTab === 'status' ? (
                                /* Status Tab */
                                <div className="space-y-4">
                                    <div className="flex items-center gap-4 text-sm">
                                        <span className="theme-text-primary font-medium">Branch: {gitStatus.branch}</span>
                                        {gitStatus.ahead > 0 && <span className="text-green-400">↑{gitStatus.ahead} ahead</span>}
                                        {gitStatus.behind > 0 && <span className="text-yellow-400">↓{gitStatus.behind} behind</span>}
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="theme-bg-secondary rounded-lg p-3">
                                            <h3 className="text-sm font-medium text-green-400 mb-2">Staged ({(gitStatus.staged || []).length})</h3>
                                            <div className="space-y-1 max-h-48 overflow-y-auto">
                                                {(gitStatus.staged || []).length === 0 ? (
                                                    <div className="text-xs theme-text-muted">No staged files</div>
                                                ) : (gitStatus.staged || []).map((file: any) => (
                                                    <div key={file.path} className="flex items-center justify-between text-xs group">
                                                        <button
                                                            onClick={() => loadFileDiff(file.path, true)}
                                                            className="text-green-300 truncate flex-1 text-left hover:underline"
                                                        >
                                                            {file.path}
                                                        </button>
                                                        <button onClick={() => gitUnstageFile(file.path)} className="text-red-400 hover:text-red-300 px-2 opacity-0 group-hover:opacity-100">Unstage</button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="theme-bg-secondary rounded-lg p-3">
                                            <h3 className="text-sm font-medium text-yellow-400 mb-2">Unstaged ({(gitStatus.unstaged || []).length + (gitStatus.untracked || []).length})</h3>
                                            <div className="space-y-1 max-h-48 overflow-y-auto">
                                                {(gitStatus.unstaged || []).length + (gitStatus.untracked || []).length === 0 ? (
                                                    <div className="text-xs theme-text-muted">No changes</div>
                                                ) : [...(gitStatus.unstaged || []), ...(gitStatus.untracked || [])].map((file: any) => (
                                                    <div key={file.path} className="flex items-center justify-between text-xs group">
                                                        <button
                                                            onClick={() => loadFileDiff(file.path, false)}
                                                            className={`truncate flex-1 text-left hover:underline ${file.isUntracked ? 'text-gray-400' : 'text-yellow-300'}`}
                                                        >
                                                            {file.path}
                                                        </button>
                                                        <button onClick={() => gitStageFile(file.path)} className="text-green-400 hover:text-green-300 px-2 opacity-0 group-hover:opacity-100">Stage</button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    {/* File Diff Preview */}
                                    {gitSelectedFile && gitFileDiff && (
                                        <div className="theme-bg-secondary rounded-lg p-3">
                                            <div className="flex items-center justify-between mb-2">
                                                <h3 className="text-sm font-medium theme-text-primary">{gitSelectedFile}</h3>
                                                <button onClick={() => { setGitSelectedFile(null); setGitFileDiff(null); }} className="text-xs theme-text-muted hover:theme-text-primary">Close</button>
                                            </div>
                                            <pre className="text-xs font-mono overflow-auto max-h-60 p-2 bg-black/30 rounded">
                                                {gitFileDiff.split('\n').map((line, i) => (
                                                    <div
                                                        key={i}
                                                        className={
                                                            line.startsWith('+') && !line.startsWith('+++') ? 'text-green-400 bg-green-900/20' :
                                                            line.startsWith('-') && !line.startsWith('---') ? 'text-red-400 bg-red-900/20' :
                                                            line.startsWith('@@') ? 'text-cyan-400' :
                                                            'theme-text-muted'
                                                        }
                                                    >
                                                        {line}
                                                    </div>
                                                ))}
                                            </pre>
                                        </div>
                                    )}

                                    <div className="space-y-2">
                                        <input
                                            type="text"
                                            className="w-full theme-input text-sm rounded px-3 py-2"
                                            placeholder="Commit message..."
                                            value={gitCommitMessage}
                                            onChange={e => setGitCommitMessage(e.target.value)}
                                        />
                                        <div className="flex gap-2">
                                            <button
                                                disabled={gitLoading || !gitCommitMessage.trim()}
                                                onClick={gitCommitChanges}
                                                className="theme-button-primary px-4 py-2 rounded text-sm flex-1 disabled:opacity-50"
                                            >
                                                Commit
                                            </button>
                                            <button disabled={gitLoading} onClick={gitPullChanges} className="theme-button px-4 py-2 rounded text-sm flex-1">
                                                Pull
                                            </button>
                                            <button disabled={gitLoading} onClick={gitPushChanges} className="theme-button px-4 py-2 rounded text-sm flex-1">
                                                Push
                                            </button>
                                            <button disabled={gitLoading} onClick={loadGitStatus} className="theme-button px-4 py-2 rounded text-sm">
                                                Refresh
                                            </button>
                                        </div>
                                        {gitError && <div className="text-red-500 text-xs">{gitError}</div>}
                                        {noUpstreamPrompt && (
                                            <div className="mt-2 p-2 bg-amber-900/30 border border-amber-600/50 rounded text-xs">
                                                <div className="text-amber-400 mb-2">Branch has no upstream. Push to origin/{noUpstreamPrompt.branch}?</div>
                                                <div className="flex gap-2">
                                                    <button onClick={gitPushWithUpstream} disabled={gitLoading} className="px-2 py-1 bg-blue-600 hover:bg-blue-500 rounded text-white text-[10px]">Push</button>
                                                    <button onClick={gitEnableAutoSetupRemote} disabled={gitLoading} className="px-2 py-1 bg-green-600 hover:bg-green-500 rounded text-white text-[10px]" title="Sets git config push.autoSetupRemote true">Always Auto-Push</button>
                                                    <button onClick={() => setNoUpstreamPrompt(null)} className="px-2 py-1 bg-gray-600 hover:bg-gray-500 rounded text-white text-[10px]">Cancel</button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ) : gitModalTab === 'diff' ? (
                                /* Diff Tab */
                                <div className="space-y-4">
                                    <div className="flex gap-2 mb-4">
                                        <button onClick={loadGitDiff} className="theme-button px-3 py-1 rounded text-sm">Refresh Diff</button>
                                    </div>
                                    {gitDiffContent ? (
                                        <div className="space-y-4">
                                            {gitDiffContent.staged && (
                                                <div className="theme-bg-secondary rounded-lg p-3">
                                                    <h3 className="text-sm font-medium text-green-400 mb-2">Staged Changes</h3>
                                                    <pre className="text-xs font-mono overflow-auto max-h-64 p-2 bg-black/30 rounded whitespace-pre-wrap">
                                                        {gitDiffContent.staged.split('\n').map((line, i) => (
                                                            <div
                                                                key={i}
                                                                className={
                                                                    line.startsWith('+') && !line.startsWith('+++') ? 'text-green-400 bg-green-900/20' :
                                                                    line.startsWith('-') && !line.startsWith('---') ? 'text-red-400 bg-red-900/20' :
                                                                    line.startsWith('@@') ? 'text-cyan-400' :
                                                                    line.startsWith('diff ') ? 'text-purple-400 font-bold mt-2' :
                                                                    'theme-text-muted'
                                                                }
                                                            >
                                                                {line}
                                                            </div>
                                                        ))}
                                                    </pre>
                                                </div>
                                            )}
                                            {gitDiffContent.unstaged && (
                                                <div className="theme-bg-secondary rounded-lg p-3">
                                                    <h3 className="text-sm font-medium text-yellow-400 mb-2">Unstaged Changes</h3>
                                                    <pre className="text-xs font-mono overflow-auto max-h-64 p-2 bg-black/30 rounded whitespace-pre-wrap">
                                                        {gitDiffContent.unstaged.split('\n').map((line, i) => (
                                                            <div
                                                                key={i}
                                                                className={
                                                                    line.startsWith('+') && !line.startsWith('+++') ? 'text-green-400 bg-green-900/20' :
                                                                    line.startsWith('-') && !line.startsWith('---') ? 'text-red-400 bg-red-900/20' :
                                                                    line.startsWith('@@') ? 'text-cyan-400' :
                                                                    line.startsWith('diff ') ? 'text-purple-400 font-bold mt-2' :
                                                                    'theme-text-muted'
                                                                }
                                                            >
                                                                {line}
                                                            </div>
                                                        ))}
                                                    </pre>
                                                </div>
                                            )}
                                            {!gitDiffContent.staged && !gitDiffContent.unstaged && (
                                                <div className="text-center theme-text-muted py-8">No changes to display</div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="text-center theme-text-muted py-8">Loading diff...</div>
                                    )}
                                </div>
                            ) : gitModalTab === 'branches' ? (
                                /* Branches Tab */
                                <div className="space-y-4">
                                    {/* Create New Branch */}
                                    <div className="theme-bg-secondary rounded-lg p-3">
                                        <h3 className="text-sm font-medium theme-text-primary mb-2">Create New Branch</h3>
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                className="flex-1 theme-input text-sm rounded px-3 py-2"
                                                placeholder="Branch name..."
                                                value={gitNewBranchName}
                                                onChange={e => setGitNewBranchName(e.target.value)}
                                            />
                                            <button
                                                disabled={gitLoading || !gitNewBranchName.trim()}
                                                onClick={gitCreateBranch}
                                                className="theme-button-primary px-4 py-2 rounded text-sm disabled:opacity-50"
                                            >
                                                Create
                                            </button>
                                        </div>
                                    </div>

                                    {/* Branch List */}
                                    <div className="theme-bg-secondary rounded-lg p-3">
                                        <div className="flex items-center justify-between mb-2">
                                            <h3 className="text-sm font-medium theme-text-primary">Branches</h3>
                                            <button onClick={loadGitBranches} className="text-xs theme-text-muted hover:theme-text-primary">Refresh</button>
                                        </div>
                                        {gitBranches?.branches ? (
                                            <div className="space-y-1 max-h-80 overflow-y-auto">
                                                {gitBranches.branches.map((branch: string) => (
                                                    <div
                                                        key={branch}
                                                        className={`flex items-center justify-between p-2 rounded text-sm ${
                                                            branch === gitBranches.current ? 'bg-purple-900/30 border border-purple-500/30' : 'hover:bg-white/5'
                                                        }`}
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            {branch === gitBranches.current && (
                                                                <span className="text-purple-400">●</span>
                                                            )}
                                                            <span className={branch === gitBranches.current ? 'text-purple-400 font-medium' : 'theme-text-primary'}>
                                                                {branch}
                                                            </span>
                                                        </div>
                                                        {branch !== gitBranches.current && (
                                                            <div className="flex gap-2">
                                                                <button
                                                                    onClick={() => gitCheckoutBranch(branch)}
                                                                    disabled={gitLoading}
                                                                    className="text-xs text-blue-400 hover:text-blue-300"
                                                                >
                                                                    Checkout
                                                                </button>
                                                                <button
                                                                    onClick={() => gitDeleteBranch(branch)}
                                                                    disabled={gitLoading}
                                                                    className="text-xs text-red-400 hover:text-red-300"
                                                                >
                                                                    Delete
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="text-center theme-text-muted py-4">Loading branches...</div>
                                        )}
                                    </div>
                                    {gitError && <div className="text-red-500 text-xs">{gitError}</div>}
                                    {noUpstreamPrompt && (
                                        <div className="mt-2 p-2 bg-amber-900/30 border border-amber-600/50 rounded text-xs">
                                            <div className="text-amber-400 mb-2">Branch has no upstream. Push to origin/{noUpstreamPrompt.branch}?</div>
                                            <div className="flex gap-2">
                                                <button onClick={gitPushWithUpstream} disabled={gitLoading} className="px-2 py-1 bg-blue-600 hover:bg-blue-500 rounded text-white text-[10px]">Push</button>
                                                <button onClick={gitEnableAutoSetupRemote} disabled={gitLoading} className="px-2 py-1 bg-green-600 hover:bg-green-500 rounded text-white text-[10px]" title="Sets git config push.autoSetupRemote true">Always Auto-Push</button>
                                                <button onClick={() => setNoUpstreamPrompt(null)} className="px-2 py-1 bg-gray-600 hover:bg-gray-500 rounded text-white text-[10px]">Cancel</button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : gitModalTab === 'history' ? (
                                /* History Tab */
                                <div className="flex gap-4 h-full">
                                    {/* Commit List */}
                                    <div className="w-1/2 theme-bg-secondary rounded-lg p-3 flex flex-col">
                                        <div className="flex items-center justify-between mb-2">
                                            <h3 className="text-sm font-medium theme-text-primary">Commit History</h3>
                                            <button onClick={loadGitHistory} className="text-xs theme-text-muted hover:theme-text-primary">Refresh</button>
                                        </div>
                                        <div className="flex-1 overflow-y-auto space-y-1">
                                            {gitCommitHistory.length > 0 ? gitCommitHistory.map((commit: any) => (
                                                <button
                                                    key={commit.hash}
                                                    onClick={() => loadCommitDetails(commit.hash)}
                                                    className={`w-full text-left p-2 rounded text-xs hover:bg-white/5 ${
                                                        gitSelectedCommit?.hash === commit.hash ? 'bg-purple-900/30 border border-purple-500/30' : ''
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-purple-400 font-mono">{commit.hash.slice(0, 7)}</span>
                                                        <span className="theme-text-muted">{new Date(commit.date).toLocaleDateString()}</span>
                                                    </div>
                                                    <div className="theme-text-primary truncate mt-1">{commit.message}</div>
                                                    <div className="theme-text-muted text-xs mt-1">{commit.author_name}</div>
                                                </button>
                                            )) : (
                                                <div className="text-center theme-text-muted py-4">Loading history...</div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Commit Details */}
                                    <div className="w-1/2 theme-bg-secondary rounded-lg p-3 flex flex-col">
                                        <h3 className="text-sm font-medium theme-text-primary mb-2">Commit Details</h3>
                                        {gitSelectedCommit ? (
                                            <div className="flex-1 overflow-y-auto">
                                                <div className="space-y-2 text-xs mb-4">
                                                    <div><span className="theme-text-muted">Hash:</span> <span className="font-mono text-purple-400">{gitSelectedCommit.hash}</span></div>
                                                    <div><span className="theme-text-muted">Author:</span> <span className="theme-text-primary">{gitSelectedCommit.author_name} &lt;{gitSelectedCommit.author_email}&gt;</span></div>
                                                    <div><span className="theme-text-muted">Date:</span> <span className="theme-text-primary">{new Date(gitSelectedCommit.date).toLocaleString()}</span></div>
                                                    <div className="theme-text-primary whitespace-pre-wrap">{gitSelectedCommit.message}</div>
                                                </div>
                                                {gitSelectedCommit.diff && (
                                                    <pre className="text-xs font-mono overflow-auto max-h-64 p-2 bg-black/30 rounded whitespace-pre-wrap">
                                                        {gitSelectedCommit.diff.split('\n').map((line: string, i: number) => (
                                                            <div
                                                                key={i}
                                                                className={
                                                                    line.startsWith('+') && !line.startsWith('+++') ? 'text-green-400 bg-green-900/20' :
                                                                    line.startsWith('-') && !line.startsWith('---') ? 'text-red-400 bg-red-900/20' :
                                                                    line.startsWith('@@') ? 'text-cyan-400' :
                                                                    line.startsWith('diff ') ? 'text-purple-400 font-bold mt-2' :
                                                                    'theme-text-muted'
                                                                }
                                                            >
                                                                {line}
                                                            </div>
                                                        ))}
                                                    </pre>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="text-center theme-text-muted py-8">Select a commit to view details</div>
                                        )}
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    </div>
                </div>
            )}

            {/* Workspace Modal */}
            {workspaceModalOpen && (
                <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setWorkspaceModalOpen(false)}>
                    <div className="w-full max-w-2xl max-h-[70vh] theme-bg-primary rounded-lg border theme-border flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-4 border-b theme-border">
                            <div className="flex items-center gap-3">
                                <Folder size={20} className="text-blue-400" />
                                <h2 className="text-lg font-semibold theme-text-primary">Workspace</h2>
                            </div>
                            <button onClick={() => setWorkspaceModalOpen(false)} className="p-2 theme-hover rounded-lg">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="flex-1 overflow-auto p-4">
                            <div className="space-y-3">
                                <div className="theme-bg-secondary rounded-lg p-3">
                                    <div className="text-xs theme-text-muted mb-1">Current Path</div>
                                    <div className="text-sm theme-text-primary font-mono">{currentPath || 'Not set'}</div>
                                </div>
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="theme-bg-secondary rounded-lg p-3 text-center">
                                        <div className="text-2xl font-bold theme-text-primary">{Object.keys(contentDataRef.current).length}</div>
                                        <div className="text-xs theme-text-muted">Open Panes</div>
                                    </div>
                                    <div className="theme-bg-secondary rounded-lg p-3 text-center">
                                        <div className="text-2xl font-bold theme-text-primary">{directoryConversations.length}</div>
                                        <div className="text-xs theme-text-muted">Conversations</div>
                                    </div>
                                    <div className="theme-bg-secondary rounded-lg p-3 text-center">
                                        <div className="text-2xl font-bold theme-text-primary">{Object.keys(folderStructure || {}).length}</div>
                                        <div className="text-xs theme-text-muted">Files/Folders</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Search Results Modal */}
            {searchResultsModalOpen && (deepSearchResults.length > 0 || messageSearchResults.length > 0) && (
                <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setSearchResultsModalOpen(false)}>
                    <div className="w-full max-w-4xl max-h-[80vh] theme-bg-primary rounded-lg border theme-border flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-4 border-b theme-border">
                            <div className="flex items-center gap-3">
                                <Search size={20} className="text-blue-400" />
                                <h2 className="text-lg font-semibold theme-text-primary">Search Results</h2>
                                <span className="text-sm theme-text-muted">({deepSearchResults.length + messageSearchResults.length} results)</span>
                            </div>
                            <button onClick={() => setSearchResultsModalOpen(false)} className="p-2 theme-hover rounded-lg">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="flex-1 overflow-auto p-4">
                            <div className="space-y-2">
                                {deepSearchResults.map((result: any, idx: number) => (
                                    <button
                                        key={`deep-${idx}`}
                                        onClick={() => {
                                            if (result.type === 'conversation') {
                                                handleConversationSelect(result.id);
                                            } else if (result.type === 'file') {
                                                handleFileClick(result.path);
                                            }
                                            setSearchResultsModalOpen(false);
                                        }}
                                        className="w-full text-left p-3 theme-bg-secondary rounded-lg theme-hover"
                                    >
                                        <div className="flex items-center gap-2">
                                            {result.type === 'conversation' ? <MessageSquare size={14} className="text-blue-400" /> : <FileIcon size={14} className="text-gray-400" />}
                                            <span className="text-sm theme-text-primary">{result.title || result.name || result.path}</span>
                                        </div>
                                        {result.snippet && <div className="text-xs theme-text-muted mt-1 truncate">{result.snippet}</div>}
                                    </button>
                                ))}
                                {messageSearchResults.map((result: any, idx: number) => (
                                    <button
                                        key={`msg-${idx}`}
                                        onClick={() => {
                                            handleConversationSelect(result.conversationId);
                                            setSearchResultsModalOpen(false);
                                        }}
                                        className="w-full text-left p-3 theme-bg-secondary rounded-lg theme-hover"
                                    >
                                        <div className="flex items-center gap-2">
                                            <MessageSquare size={14} className="text-green-400" />
                                            <span className="text-sm theme-text-primary">{result.content?.slice(0, 100)}...</span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Message Labeling Modal */}
            {labelingModal.isOpen && labelingModal.message && (
                <MessageLabeling
                    message={labelingModal.message}
                    existingLabel={messageLabels[labelingModal.message.id]}
                    onSave={handleSaveLabel}
                    onClose={handleCloseLabelingModal}
                />
            )}

            {/* Conversation Labeling Modal */}
            {conversationLabelingModal.isOpen && conversationLabelingModal.conversation && (
                <ConversationLabeling
                    conversation={conversationLabelingModal.conversation}
                    existingLabel={conversationLabels[conversationLabelingModal.conversation.id]}
                    onSave={handleSaveConversationLabel}
                    onClose={handleCloseConversationLabelingModal}
                />
            )}

        </>

    );
};




// Per-pane execution mode getter/setter
const getPaneExecutionMode = useCallback((paneId: string) => {
    return contentDataRef.current[paneId]?.executionMode || 'chat';
}, []);

const setPaneExecutionMode = useCallback(async (paneId: string, mode: string) => {
    if (!contentDataRef.current[paneId]) {
        contentDataRef.current[paneId] = { executionMode: mode, selectedJinx: null, showJinxDropdown: false };
    } else {
        contentDataRef.current[paneId].executionMode = mode;
    }

    // Load MCP servers when switching to tool_agent mode
    if (mode === 'tool_agent' && currentPath) {
        const res = await window.api.getMcpServers(currentPath);
        if (res && Array.isArray(res.servers)) {
            setAvailableMcpServers(res.servers);
            if (!res.servers.find(s => s.serverPath === mcpServerPath) && res.servers.length > 0) {
                setMcpServerPath(res.servers[0].serverPath);
            }
        }
    }

    // Trigger re-render
    setRootLayoutNode(prev => ({ ...prev }));
}, [currentPath, mcpServerPath]);

const getPaneSelectedJinx = useCallback((paneId: string) => {
    return contentDataRef.current[paneId]?.selectedJinx || null;
}, []);

const setPaneSelectedJinx = useCallback((paneId: string, jinx: any) => {
    if (!contentDataRef.current[paneId]) {
        contentDataRef.current[paneId] = { executionMode: 'chat', selectedJinx: jinx, showJinxDropdown: false };
    } else {
        contentDataRef.current[paneId].selectedJinx = jinx;
    }
    // Trigger re-render
    setRootLayoutNode(prev => ({ ...prev }));
}, []);

// Per-pane dropdown state
const getPaneShowJinxDropdown = useCallback((paneId: string) => {
    return contentDataRef.current[paneId]?.showJinxDropdown || false;
}, []);

const setPaneShowJinxDropdown = useCallback((paneId: string, show: boolean) => {
    if (!contentDataRef.current[paneId]) {
        contentDataRef.current[paneId] = { executionMode: 'chat', selectedJinx: null, showJinxDropdown: show };
    } else {
        contentDataRef.current[paneId].showJinxDropdown = show;
    }
    // Trigger re-render
    setRootLayoutNode(prev => ({ ...prev }));
}, []);

// Build chatInputProps function that returns props for a specific pane
const getChatInputProps = useCallback((paneId: string) => ({
    input, setInput, inputHeight, setInputHeight,
    isInputMinimized, setIsInputMinimized, isInputExpanded, setIsInputExpanded,
    isResizingInput, setIsResizingInput,
    isStreaming, handleInputSubmit, handleInterruptStream,
    uploadedFiles, setUploadedFiles, contextFiles, setContextFiles,
    contextFilesCollapsed, setContextFilesCollapsed, currentPath,
    // Per-pane execution mode
    executionMode: getPaneExecutionMode(paneId),
    setExecutionMode: (mode: string) => setPaneExecutionMode(paneId, mode),
    selectedJinx: getPaneSelectedJinx(paneId),
    setSelectedJinx: (jinx: any) => setPaneSelectedJinx(paneId, jinx),
    jinxInputValues, setJinxInputValues, jinxsToDisplay,
    // Per-pane dropdown state
    showJinxDropdown: getPaneShowJinxDropdown(paneId),
    setShowJinxDropdown: (show: boolean) => setPaneShowJinxDropdown(paneId, show),
    availableModels, modelsLoading, modelsError, currentModel, setCurrentModel,
    currentProvider, setCurrentProvider, favoriteModels, toggleFavoriteModel,
    showAllModels, setShowAllModels, modelsToDisplay, ollamaToolModels, setError,
    availableNPCs, npcsLoading, npcsError, currentNPC, setCurrentNPC,
    // Multi-select for broadcast - persisted at Enpistu level
    selectedModels, setSelectedModels, selectedNPCs, setSelectedNPCs,
    broadcastMode, setBroadcastMode,
    availableMcpServers, mcpServerPath, setMcpServerPath,
    selectedMcpTools, setSelectedMcpTools, availableMcpTools, setAvailableMcpTools,
    mcpToolsLoading, setMcpToolsLoading, mcpToolsError, setMcpToolsError,
    showMcpServersDropdown, setShowMcpServersDropdown,
    activeConversationId,
    onOpenFile: (path: string) => {
        const ext = path.split('.').pop()?.toLowerCase();
        let contentType = 'editor';
        if (ext === 'pdf') contentType = 'pdf';
        else if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext || '')) contentType = 'image';
        else if (['csv', 'xlsx', 'xls'].includes(ext || '')) contentType = 'csv';
        else if (['docx', 'doc'].includes(ext || '')) contentType = 'docx';
        else if (ext === 'pptx') contentType = 'pptx';
        // Open in new tile to the right
        const nodePath = findNodePath(rootLayoutNodeRef.current, paneId);
        if (nodePath) {
            performSplit(nodePath, 'right', contentType, path);
        }
    },
    // Broadcast new message to multiple models/NPCs
    onBroadcast: async (models: string[], npcs: string[]) => {
        const activePaneData = contentDataRef.current[paneId];
        if (!activePaneData || activePaneData.contentType !== 'chat' || !activePaneData.contentId) {
            setError("Cannot broadcast: The active pane is not a valid chat window.");
            return;
        }
        if (isStreaming || !input.trim()) return;

        // Deduplicate models and npcs
        const uniqueModels = [...new Set(models)];
        const uniqueNpcs = [...new Set(npcs)];

        const conversationId = activePaneData.contentId;
        const allMessages = activePaneData.chatMessages?.allMessages || [];

        // Check if we have selected branches for sub-branching
        const branchMap = selectedBranches[paneId];
        const branchTargets = branchMap && branchMap.size > 0 ? Array.from(branchMap.values()) : [null];
        console.log('[BROADCAST] branchTargets:', branchTargets.length, branchTargets.map((b: any) => b?.id));

        // Clear selected branches after using them
        if (branchMap && branchMap.size > 0) {
            setSelectedBranches(prev => {
                const next = { ...prev };
                delete next[paneId];
                return next;
            });
        }

        // For each branch target (or null if none), create user message and responses
        const allUserMessageIds: string[] = [];
        for (const branchParent of branchTargets) {
            const userMessageId = generateId();
            const cellId = userMessageId;
            allUserMessageIds.push(userMessageId);

            const userMessage = {
                id: userMessageId,
                role: 'user',
                content: input,
                timestamp: new Date().toISOString(),
                attachments: uploadedFiles.map(f => ({ name: f.name, path: f.path, size: f.size, type: f.type })),
                cellId: cellId,
                parentMessageId: branchParent?.id || null, // Link to branch parent if sub-branching
            };
            allMessages.push(userMessage);
        }

        // Create combinations for each branch target × model × npc
        // For each branch target × each model/npc combination
        const allExecutions: Array<{
            branchIdx: number,
            userMessageId: string,
            cellId: string,
            model: string,
            npcKey: string,
            npcName: string,
            npcSource: string,
            streamId: string
        }> = [];

        for (let branchIdx = 0; branchIdx < branchTargets.length; branchIdx++) {
            const userMessageId = allUserMessageIds[branchIdx];
            const cellId = userMessageId;

            for (const model of uniqueModels) {
                for (const npcName of uniqueNpcs) {
                    // Look up NPC source from availableNPCs
                    const npcObj = availableNPCs.find((n: any) => n.value === npcName);
                    const npcSource = npcObj?.source || 'global';
                    const streamId = generateId();

                    allExecutions.push({
                        branchIdx,
                        userMessageId,
                        cellId,
                        model,
                        npcKey: npcName,
                        npcName,
                        npcSource,
                        streamId
                    });
                }
            }
        }
        console.log('[BROADCAST] executions:', allExecutions.length, 'branches:', branchTargets.length);

        setIsStreaming(true);

        // Create assistant placeholders for all executions
        for (const exec of allExecutions) {
            streamToPaneRef.current[exec.streamId] = paneId;

            const selectedModelObj = availableModels.find((m: any) => m.value === exec.model);
            const providerToUse = selectedModelObj?.provider || currentProvider;

            const assistantPlaceholder = {
                id: exec.streamId,
                role: 'assistant',
                content: '',
                isStreaming: true,
                timestamp: new Date().toISOString(),
                streamId: exec.streamId,
                model: exec.model,
                provider: providerToUse,
                npc: exec.npcName,
                npcSource: exec.npcSource,
                cellId: exec.cellId,
                parentMessageId: exec.userMessageId,
            };
            allMessages.push(assistantPlaceholder);
        }

        activePaneData.chatMessages.allMessages = allMessages;
        activePaneData.chatMessages.messages = allMessages.slice(-(activePaneData.chatMessages.displayedMessageCount || 20));
        setInput('');
        setUploadedFiles([]);
        setRootLayoutNode(prev => ({ ...prev }));

        // Execute all in parallel
        const executePromises = allExecutions.map(async (exec) => {
            const selectedModelObj = availableModels.find((m: any) => m.value === exec.model);
            const providerToUse = selectedModelObj?.provider || currentProvider;

            try {
                await window.api.executeCommandStream({
                    commandstr: input,
                    currentPath,
                    conversationId,
                    model: exec.model,
                    provider: providerToUse,
                    npc: exec.npcName,
                    npcSource: exec.npcSource,
                    attachments: uploadedFiles.map(f => ({ name: f.name, path: f.path, size: f.size, type: f.type })),
                    streamId: exec.streamId,
                    isResend: branchTargets[exec.branchIdx] !== null, // Skip saving user msg if sub-branching
                    parentMessageId: exec.userMessageId, // Assistant's parent is the user message
                    userParentMessageId: branchTargets[exec.branchIdx]?.id || null,
                    // Pass frontend-generated message IDs so backend uses the same IDs
                    userMessageId: exec.userMessageId,
                    assistantMessageId: exec.streamId,
                    // Default generation params for broadcast
                    temperature: 0.7,
                    top_p: 0.9,
                    top_k: 40,
                    max_tokens: 4096,
                });
            } catch (err: any) {
                console.error('[BROADCAST] Error for', exec.model, exec.npcKey, err);
            }
        });

        await Promise.all(executePromises);

        // Reset broadcast mode and selections after sending
        setBroadcastMode(false);
        setSelectedModels(currentModel ? [currentModel] : []);
        setSelectedNPCs([]);
    },
}), [
    input, inputHeight, isInputMinimized, isInputExpanded, isResizingInput,
    isStreaming, handleInputSubmit, handleInterruptStream,
    uploadedFiles, contextFiles, contextFilesCollapsed, currentPath,
    getPaneExecutionMode, setPaneExecutionMode, getPaneSelectedJinx, setPaneSelectedJinx,
    getPaneShowJinxDropdown, setPaneShowJinxDropdown,
    jinxInputValues, jinxsToDisplay,
    availableModels, modelsLoading, modelsError, currentModel, currentProvider,
    favoriteModels, showAllModels, modelsToDisplay, ollamaToolModels,
    availableNPCs, npcsLoading, npcsError, currentNPC,
    selectedModels, setSelectedModels, selectedNPCs, setSelectedNPCs,
    broadcastMode, setBroadcastMode,
    availableMcpServers, mcpServerPath, selectedMcpTools, availableMcpTools,
    mcpToolsLoading, mcpToolsError, showMcpServersDropdown, activeConversationId, findNodePath, performSplit,
]);

const layoutComponentApi = useMemo(() => ({
    rootLayoutNode,
    setRootLayoutNode,
    findNodeByPath,
    findNodePath,
    activeContentPaneId, setActiveContentPaneId,
    draggedItem, setDraggedItem, dropTarget, setDropTarget,
    contentDataRef, updateContentPane, performSplit,
    closeContentPane,
    moveContentPane,
    createAndAddPaneNodeToLayout,
    renderChatView,
    renderFileEditor,
    renderTerminalView,
    renderPdfViewer,
    renderCsvViewer,
    renderDocxViewer,
    renderBrowserViewer,
    renderPptxViewer,
    renderLatexViewer,
    renderNotebookViewer,
    renderExpViewer,
    renderPicViewer,
    renderMindMapViewer,
    renderZipViewer,
    renderDataLabelerPane,
    renderGraphViewerPane,
    renderBrowserGraphPane,
    renderDataDashPane,
    renderDBToolPane,
    renderNPCTeamPane,
    renderJinxPane,
    renderTeamManagementPane,
    renderSettingsPane,
    renderPhotoViewerPane,
    renderScherzoPane,
    renderLibraryViewerPane,
    renderHelpPane,
    renderGitPane,
    renderFolderViewerPane,
    renderProjectEnvPane,
    renderDiskUsagePane,
    renderMemoryManagerPane,
    renderCronDaemonPane,
    renderSearchPane,
    renderMarkdownPreviewPane,
    renderHtmlPreviewPane,
    renderTileJinxPane,
    renderBranchComparisonPane,
    setPaneContextMenu,
    // Chat-specific props:
    autoScrollEnabled, setAutoScrollEnabled,
    messageSelectionMode, toggleMessageSelectionMode, selectedMessages,
    conversationBranches, showBranchingUI, setShowBranchingUI,
    // ChatInput props function for rendering input in chat panes (takes paneId)
    getChatInputProps,
    // Zen mode props
    zenModePaneId,
    toggleZenMode: (paneId: string) => {
        setZenModePaneId(prev => prev === paneId ? null : paneId);
    },
    // Renaming props
    renamingPaneId,
    setRenamingPaneId,
    editedFileName,
    setEditedFileName,
    handleConfirmRename,
    // Script running
    onRunScript: handleRunScript,
    // Browser tab creation
    handleNewBrowserTab,
    // Top bar collapse for expand button in pane header
    topBarCollapsed,
    onExpandTopBar: () => { setTopBarCollapsed(false); localStorage.setItem('npcStudio_topBarCollapsed', 'false'); },
    // Current working directory
    currentPath,
}), [
    rootLayoutNode,
    findNodeByPath, findNodePath, activeContentPaneId,
    draggedItem, dropTarget, updateContentPane, performSplit, closeContentPane,
    moveContentPane, createAndAddPaneNodeToLayout,
    renderChatView, renderFileEditor, renderTerminalView, renderPdfViewer,
    renderCsvViewer, renderDocxViewer, renderBrowserViewer,
    renderPptxViewer,
    renderLatexViewer,
    renderNotebookViewer,
    renderExpViewer,
    renderPicViewer,
    renderMindMapViewer,
    renderZipViewer,
    renderDataLabelerPane,
    renderGraphViewerPane,
    renderBrowserGraphPane,
    renderDataDashPane,
    renderDBToolPane,
    renderNPCTeamPane,
    renderJinxPane,
    renderTeamManagementPane,
    renderSettingsPane,
    renderPhotoViewerPane,
    renderScherzoPane,
    renderLibraryViewerPane,
    renderHelpPane,
    renderGitPane,
    renderFolderViewerPane,
    renderProjectEnvPane,
    renderDiskUsagePane,
    renderMemoryManagerPane,
    renderCronDaemonPane,
    renderSearchPane,
    renderMarkdownPreviewPane,
    renderHtmlPreviewPane,
    renderTileJinxPane,
    renderBranchComparisonPane,
    setActiveContentPaneId, setDraggedItem, setDropTarget,
    setPaneContextMenu,
    autoScrollEnabled, setAutoScrollEnabled,
    messageSelectionMode, toggleMessageSelectionMode, selectedMessages,
    conversationBranches, showBranchingUI, setShowBranchingUI,
    getChatInputProps,
    zenModePaneId,
    renamingPaneId, editedFileName, handleConfirmRename,
    handleRunScript, handleNewBrowserTab, topBarCollapsed,
    currentPath,
]);

// Handle conversation selection - opens conversation in a pane
const handleConversationSelect = async (conversationId: string, skipMessageLoad = false) => {
    setActiveConversationId(conversationId);
    setCurrentFile(null);

    // CRITICAL: Don't create/update panes if workspace is being restored
    if (isLoadingWorkspace) {
        return null;
    }

    // Check if this conversation is already open in a pane
    const existingPaneId = Object.keys(contentDataRef.current).find(paneId => {
        const paneData = contentDataRef.current[paneId];
        return paneData?.contentType === 'chat' && paneData?.contentId === conversationId;
    });

    if (existingPaneId) {
        setActiveContentPaneId(existingPaneId);
        return existingPaneId;
    }

    let paneIdToUpdate;

    if (!rootLayoutNode) {
        const newPaneId = generateId();
        const newLayout = { id: newPaneId, type: 'content' };

        // Initialize contentData SYNCHRONOUSLY with layout
        contentDataRef.current[newPaneId] = {
            contentType: 'chat',
            contentId: conversationId,
            chatMessages: { messages: [], allMessages: [], displayedMessageCount: 20 }
        };
        setRootLayoutNode(newLayout);

        // NOW update the content
        await updateContentPane(newPaneId, 'chat', conversationId, skipMessageLoad);

        setActiveContentPaneId(newPaneId);
        paneIdToUpdate = newPaneId;
    }
    else {
        paneIdToUpdate = activeContentPaneId || Object.keys(contentDataRef.current)[0];

        // ADD THIS CHECK: Only update if the pane exists and is not empty
        if (paneIdToUpdate && contentDataRef.current[paneIdToUpdate]) {
            await updateContentPane(paneIdToUpdate, 'chat', conversationId, skipMessageLoad);
            setActiveContentPaneId(paneIdToUpdate);
            setRootLayoutNode(prev => ({...prev}));
        } else {
            console.warn('[SELECT_CONVO] No valid pane to update, creating new one');
            const newPaneId = createAndAddPaneNodeToLayout('chat', conversationId);
            if (newPaneId) {
                await updateContentPane(newPaneId, 'chat', conversationId, skipMessageLoad);
                setActiveContentPaneId(newPaneId);
                paneIdToUpdate = newPaneId;
            }
        }
    }
    return paneIdToUpdate;
};

// Handle file click - opens file in a new pane
const handleFileClick = useCallback(async (filePath: string) => {
    setCurrentFile(filePath);
    setActiveConversationId(null);

    const extension = filePath.split('.').pop()?.toLowerCase();
    let contentType = 'editor';

    if (extension === 'pdf') contentType = 'pdf';
    else if (['csv', 'xlsx', 'xls'].includes(extension)) contentType = 'csv';
    else if (extension === 'pptx') contentType = 'pptx';
    else if (extension === 'tex') contentType = 'latex';
    else if (extension === 'ipynb') contentType = 'notebook';
    else if (extension === 'exp') contentType = 'exp';
    else if (['docx', 'doc'].includes(extension)) contentType = 'docx';
    else if (extension === 'mapx') contentType = 'mindmap';
    else if (extension === 'zip') contentType = 'zip';
    else if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(extension)) contentType = 'image';

    // Check for empty pane to reuse first
    const emptyPaneId = findEmptyPaneId();
    if (emptyPaneId) {
        await updateContentPane(emptyPaneId, contentType, filePath);
        setActiveContentPaneId(emptyPaneId);
        setRootLayoutNode(prev => ({ ...prev }));
        return;
    }

    const newPaneId = generateId();

    // Set content BEFORE layout to prevent empty pane
    contentDataRef.current[newPaneId] = { contentType: contentType, contentId: filePath };

    setRootLayoutNode(oldRoot => {
        if (!oldRoot) {
            return { id: newPaneId, type: 'content' };
        }

        // Collect all existing pane IDs from the layout
        const collectPaneIds = (node: any): string[] => {
            if (!node) return [];
            if (node.type === 'content') return [node.id];
            if (node.type === 'split') {
                return node.children.flatMap((child: any) => collectPaneIds(child));
            }
            return [];
        };

        const existingPaneIds = collectPaneIds(oldRoot);
        const allPaneIds = [...existingPaneIds, newPaneId];
        const totalPanes = allPaneIds.length;

        // Calculate balanced grid dimensions (rows and cols differ by at most 1)
        const cols = Math.ceil(Math.sqrt(totalPanes));
        const rows = Math.ceil(totalPanes / cols);

        // Build a balanced grid layout
        const buildGridLayout = (paneIds: string[], numRows: number, numCols: number): any => {
            if (paneIds.length === 0) return null;
            if (paneIds.length === 1) {
                return { id: paneIds[0], type: 'content' };
            }

            const rowNodes: any[] = [];
            let paneIndex = 0;

            for (let r = 0; r < numRows && paneIndex < paneIds.length; r++) {
                const panesInThisRow = Math.min(numCols, paneIds.length - paneIndex);
                const rowPaneIds = paneIds.slice(paneIndex, paneIndex + panesInThisRow);
                paneIndex += panesInThisRow;

                if (rowPaneIds.length === 1) {
                    rowNodes.push({ id: rowPaneIds[0], type: 'content' });
                } else {
                    rowNodes.push({
                        id: generateId(),
                        type: 'split',
                        direction: 'horizontal',
                        children: rowPaneIds.map(id => ({ id, type: 'content' })),
                        sizes: new Array(rowPaneIds.length).fill(100 / rowPaneIds.length)
                    });
                }
            }

            if (rowNodes.length === 1) {
                return rowNodes[0];
            }

            return {
                id: generateId(),
                type: 'split',
                direction: 'vertical',
                children: rowNodes,
                sizes: new Array(rowNodes.length).fill(100 / rowNodes.length)
            };
        };

        return buildGridLayout(allPaneIds, rows, cols);
    });

    setActiveContentPaneId(newPaneId);

    // Load the actual file content after layout is set
    await updateContentPane(newPaneId, contentType, filePath);
}, [updateContentPane, findEmptyPaneId]);

// Update ref for keyboard handler access
handleFileClickRef.current = handleFileClick;

// Open NPC Team Menu
const handleOpenNpcTeamMenu = () => {
    setNpcTeamMenuOpen(true);
};

// Close NPC Team Menu
const handleCloseNpcTeamMenu = () => {
    setNpcTeamMenuOpen(false);
};

// Start new conversation with NPC
const startNewConversationWithNpc = async (npcName: string) => {
    setCurrentNPC(npcName);
    await createNewConversation();
    setNpcTeamMenuOpen(false);
};

// Render pane context menu
const renderPaneContextMenu = () => {
    if (!paneContextMenu?.isOpen) return null;
    const { x, y, nodeId, nodePath } = paneContextMenu;

    const closePane = () => {
        closeContentPane(nodeId, nodePath);
        setPaneContextMenu(null);
    };

    const splitPane = (side: string) => {
        performSplit(nodePath, side, 'chat', null);
        setPaneContextMenu(null);
    };

    const handleNewChat = () => {
        createNewConversation();
        setPaneContextMenu(null);
    };

    const handleNewTerminal = (shellType: 'system' | 'npcsh' | 'guac' = 'system') => {
        createNewTerminal(shellType);
        setPaneContextMenu(null);
    };

    const handleNewBrowser = () => {
        setBrowserUrlDialogOpen(true);
        setPaneContextMenu(null);
    };

    const handleNewFolder = () => {
        handleCreateNewFolder();
        setPaneContextMenu(null);
    };

    const handleNewTextFile = () => {
        createNewTextFile();
        setPaneContextMenu(null);
    };

    const handleNewLibrary = () => {
        createLibraryViewerPane();
        setPaneContextMenu(null);
    };

    return (
        <>
            <div className="fixed inset-0 z-40" onClick={() => setPaneContextMenu(null)} />
            <div
                className="fixed theme-bg-secondary theme-border border rounded shadow-lg py-1 z-50 text-sm min-w-[160px]"
                style={{ top: y, left: x }}
            >
                {/* Close Pane at top */}
                <button onClick={closePane} className="block px-4 py-2 w-full text-left theme-hover text-red-400">
                    Close Pane
                </button>

                <div className="border-t theme-border my-1" />

                {/* Create New Section */}
                <div className="px-3 py-1 text-[10px] text-gray-500 uppercase tracking-wider">Create New</div>
                <button onClick={handleNewChat} className="flex items-center gap-2 px-4 py-2 w-full text-left theme-hover">
                    <MessageSquare size={14} className="text-blue-400" /> Chat
                </button>
                {/* Terminal submenu */}
                <div className="relative group">
                    <button className="flex items-center gap-2 px-4 py-2 w-full text-left theme-hover justify-between">
                        <span className="flex items-center gap-2">
                            <Terminal size={14} className="text-green-400" /> Terminal
                        </span>
                        <ChevronRight size={14} className="opacity-50" />
                    </button>
                    <div className="absolute left-full top-0 ml-1 theme-bg-secondary theme-border border rounded shadow-lg py-1 min-w-[140px] hidden group-hover:block">
                        <button onClick={() => handleNewTerminal('system')} className="flex items-center gap-2 px-4 py-2 w-full text-left theme-hover">
                            <Terminal size={14} className="text-gray-400" /> Shell
                        </button>
                        <button onClick={() => handleNewTerminal('npcsh')} className="flex items-center gap-2 px-4 py-2 w-full text-left theme-hover">
                            <Sparkles size={14} className="text-purple-400" /> npcsh
                        </button>
                        <button onClick={() => handleNewTerminal('guac')} className="flex items-center gap-2 px-4 py-2 w-full text-left theme-hover">
                            <Code size={14} className="text-yellow-400" /> guac
                        </button>
                    </div>
                </div>
                <button onClick={handleNewBrowser} className="flex items-center gap-2 px-4 py-2 w-full text-left theme-hover">
                    <Globe size={14} className="text-cyan-400" /> Browser
                </button>
                <button onClick={handleNewLibrary} className="flex items-center gap-2 px-4 py-2 w-full text-left theme-hover">
                    <BookOpen size={14} className="text-red-400" /> Library
                </button>
                <button onClick={handleNewFolder} className="flex items-center gap-2 px-4 py-2 w-full text-left theme-hover">
                    <Folder size={14} className="text-yellow-400" /> Folder
                </button>
                <button onClick={handleNewTextFile} className="flex items-center gap-2 px-4 py-2 w-full text-left theme-hover">
                    <Code2 size={14} className="text-purple-400" /> Text File
                </button>

                <div className="border-t theme-border my-1" />

                {/* Split Section */}
                <div className="px-3 py-1 text-[10px] text-gray-500 uppercase tracking-wider">Split Pane</div>
                <button onClick={() => splitPane('left')} className="block px-4 py-2 w-full text-left theme-hover">
                    ← Split Left
                </button>
                <button onClick={() => splitPane('right')} className="block px-4 py-2 w-full text-left theme-hover">
                    → Split Right
                </button>
                <button onClick={() => splitPane('top')} className="block px-4 py-2 w-full text-left theme-hover">
                    ↑ Split Top
                </button>
                <button onClick={() => splitPane('bottom')} className="block px-4 py-2 w-full text-left theme-hover">
                    ↓ Split Bottom
                </button>
            </div>
        </>
    );
};

// Render PDF context menu
const renderPdfContextMenu = () => {
    if (!pdfContextMenuPos) return null;
    return <div>PDF Context Menu</div>;
};

// Render browser context menu
const renderBrowserContextMenu = () => {
    if (!browserContextMenuPos) return null;

    const closeMenu = () => setBrowserContextMenuPos(null);

    // Find the active browser pane
    const activeBrowserPaneId = Object.keys(contentDataRef.current).find(
        id => contentDataRef.current[id]?.contentType === 'browser'
    );
    const paneData = activeBrowserPaneId ? contentDataRef.current[activeBrowserPaneId] : null;

    // Get webview for navigation actions
    const getWebview = () => document.querySelector('[data-pane-type="browser"] webview') as any;

    const handleBack = () => {
        const webview = getWebview();
        if (webview?.canGoBack?.()) webview.goBack();
        closeMenu();
    };

    const handleForward = () => {
        const webview = getWebview();
        if (webview?.canGoForward?.()) webview.goForward();
        closeMenu();
    };

    const handleReload = () => {
        const webview = getWebview();
        webview?.reload?.();
        closeMenu();
    };

    const handleSaveImage = async () => {
        if (browserContextMenuPos.srcURL) {
            try {
                // Trigger download via main process
                (window as any).api?.downloadFile?.(browserContextMenuPos.srcURL);
            } catch (err) {
                console.error('Failed to save image:', err);
            }
        }
        closeMenu();
    };

    const handleCopyImage = async () => {
        if (browserContextMenuPos.srcURL) {
            try {
                const response = await fetch(browserContextMenuPos.srcURL);
                const blob = await response.blob();
                await navigator.clipboard.write([
                    new ClipboardItem({ [blob.type]: blob })
                ]);
            } catch (err) {
                console.error('Failed to copy image:', err);
            }
        }
        closeMenu();
    };

    const handleSearch = () => {
        if (browserContextMenuPos.selectedText) {
            // Use configured search engine (stored in localStorage)
            const searchEngines: Record<string, string> = {
                duckduckgo: 'https://duckduckgo.com/?q=',
                google: 'https://www.google.com/search?q=',
                bing: 'https://www.bing.com/search?q=',
                brave: 'https://search.brave.com/search?q=',
                startpage: 'https://www.startpage.com/do/search?q=',
                ecosia: 'https://www.ecosia.org/search?q='
            };
            const engine = localStorage.getItem('npc-browser-search-engine') || 'duckduckgo';
            const searchBase = searchEngines[engine] || searchEngines.duckduckgo;
            const searchUrl = searchBase + encodeURIComponent(browserContextMenuPos.selectedText);
            handleNewBrowserTab(searchUrl, activeBrowserPaneId);
        }
        closeMenu();
    };

    // Get search engine name for display
    const getSearchEngineName = () => {
        const names: Record<string, string> = {
            duckduckgo: 'DuckDuckGo',
            google: 'Google',
            bing: 'Bing',
            brave: 'Brave',
            startpage: 'Startpage',
            ecosia: 'Ecosia'
        };
        const engine = localStorage.getItem('npc-browser-search-engine') || 'duckduckgo';
        return names[engine] || 'DuckDuckGo';
    };

    const menuItemClass = "flex items-center gap-2 w-full px-3 py-1.5 text-xs theme-text-primary hover:bg-gray-700/50 text-left cursor-pointer";
    const disabledClass = "flex items-center gap-2 w-full px-3 py-1.5 text-xs text-gray-500 text-left cursor-not-allowed";

    // Use portal to render outside filtered body - directly at document body level
    const menuContent = (
        <>
            <div
                className="z-[9998]"
                style={{ position: 'fixed', inset: 0 }}
                onClick={closeMenu}
            />
            <div
                className="z-[9999] min-w-[200px] theme-bg-secondary border theme-border rounded-lg shadow-xl py-1"
                style={{
                    position: 'fixed',
                    left: browserContextMenuPos.x,
                    top: browserContextMenuPos.y,
                    // Force this element out of any containing block
                    transform: 'none',
                    willChange: 'auto'
                }}
            >
                {/* Navigation */}
                <button onClick={handleBack} className={menuItemClass}>
                    ← Back
                </button>
                <button onClick={handleForward} className={menuItemClass}>
                    → Forward
                </button>
                <button onClick={handleReload} className={menuItemClass}>
                    ↻ Reload
                </button>
                <div className="border-t theme-border my-1" />

                {/* Text selection options */}
                {browserContextMenuPos.selectedText && (
                    <>
                        <button
                            onClick={() => {
                                navigator.clipboard.writeText(browserContextMenuPos.selectedText);
                                closeMenu();
                            }}
                            className={menuItemClass}
                        >
                            Copy
                        </button>
                        <button onClick={handleSearch} className={menuItemClass}>
                            Search {getSearchEngineName()} for "{browserContextMenuPos.selectedText.substring(0, 20)}{browserContextMenuPos.selectedText.length > 20 ? '...' : ''}"
                        </button>
                        <div className="border-t theme-border my-1" />
                    </>
                )}

                {/* Link options */}
                {browserContextMenuPos.linkURL && (
                    <>
                        <button
                            onClick={() => {
                                handleNewBrowserTab(browserContextMenuPos.linkURL, activeBrowserPaneId);
                                closeMenu();
                            }}
                            className={menuItemClass}
                        >
                            Open Link in New Tab
                        </button>
                        <button
                            onClick={() => {
                                handleNewBrowserTab(browserContextMenuPos.linkURL);
                                closeMenu();
                            }}
                            className={menuItemClass}
                        >
                            Open Link in New Pane
                        </button>
                        <button
                            onClick={() => {
                                navigator.clipboard.writeText(browserContextMenuPos.linkURL);
                                closeMenu();
                            }}
                            className={menuItemClass}
                        >
                            Copy Link Address
                        </button>
                        <div className="border-t theme-border my-1" />
                    </>
                )}

                {/* Image options */}
                {browserContextMenuPos.mediaType === 'image' && browserContextMenuPos.srcURL && (
                    <>
                        <button onClick={handleSaveImage} className={menuItemClass}>
                            Save Image As...
                        </button>
                        <button onClick={handleCopyImage} className={menuItemClass}>
                            Copy Image
                        </button>
                        <button
                            onClick={() => {
                                navigator.clipboard.writeText(browserContextMenuPos.srcURL);
                                closeMenu();
                            }}
                            className={menuItemClass}
                        >
                            Copy Image Address
                        </button>
                        <button
                            onClick={() => {
                                handleNewBrowserTab(browserContextMenuPos.srcURL, activeBrowserPaneId);
                                closeMenu();
                            }}
                            className={menuItemClass}
                        >
                            Open Image in New Tab
                        </button>
                        <div className="border-t theme-border my-1" />
                    </>
                )}

                {/* Page options */}
                <button
                    onClick={() => {
                        const url = browserContextMenuPos.pageURL || paneData?.browserUrl;
                        if (url) navigator.clipboard.writeText(url);
                        closeMenu();
                    }}
                    className={menuItemClass}
                >
                    Copy Page URL
                </button>
                <button
                    onClick={() => {
                        const url = browserContextMenuPos.pageURL || paneData?.browserUrl;
                        if (url) handleNewBrowserTab(url);
                        closeMenu();
                    }}
                    className={menuItemClass}
                >
                    Open Page in New Pane
                </button>
            </div>
        </>
    );
    return createPortal(menuContent, document.body);
};

// Sidebar rendering function
// Render attachment thumbnails in the input area
const renderAttachmentThumbnails = () => {
    if (uploadedFiles.length === 0) return null;

    return (
        <div className="flex flex-wrap gap-2 p-2 border-b theme-border">
            {uploadedFiles.map((file: any) => (
                <div key={file.id} className="relative group">
                    {file.preview ? (
                        <img
                            src={file.preview}
                            alt={file.name}
                            className="w-16 h-16 object-cover rounded border theme-border"
                        />
                    ) : (
                        <div className="w-16 h-16 rounded border theme-border bg-gray-700 flex items-center justify-center text-xs text-gray-400 text-center p-1">
                            {file.name.split('.').pop()?.toUpperCase()}
                        </div>
                    )}
                    <button
                        onClick={() => setUploadedFiles(prev => prev.filter((f: any) => f.id !== file.id))}
                        className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Remove attachment"
                    >
                        ×
                    </button>
                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[8px] px-1 truncate rounded-b">
                        {file.name.length > 10 ? file.name.slice(0, 8) + '...' : file.name}
                    </div>
                </div>
            ))}
        </div>
    );
};

// Input area rendering function


const renderMainContent = () => {

    // Top bar component - collapsible, resizable
    const topBar = topBarCollapsed ? null : (
        <div className="flex-shrink-0 relative" style={{ height: topBarHeight }}>
            <div className="h-full px-3 flex items-center gap-3 text-[12px] theme-bg-secondary border-b theme-border">
            {/* Settings - left of path */}
            <button
                onClick={() => createSettingsPane?.()}
                className="p-2 theme-hover rounded theme-text-muted"
                title="Settings"
            >
                <Settings size={18} />
            </button>

            {/* Help button - after settings */}
            <button
                onClick={() => createHelpPane?.()}
                className="p-2 theme-hover rounded theme-text-muted"
                title="Help"
            >
                <HelpCircle size={18} />
            </button>

            {/* DataDash button - after help */}
            <button
                onClick={() => createDataDashPane?.()}
                className="p-2 theme-hover rounded theme-text-muted"
                title="Data Dashboard"
            >
                <BarChart3 size={18} />
            </button>

            <div className="flex-1" />

            {/* App Search */}
            <div
                className="flex items-center gap-2 px-2 py-1 bg-black/40 border border-gray-600 rounded focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-400/30 transition-all"
                style={{ width: Math.max(100, topBarHeight * 4) }}
            >
                {/* Custom app search icon - magnifying glass with document */}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400 flex-shrink-0">
                    <circle cx="10" cy="10" r="6" />
                    <line x1="14.5" y1="14.5" x2="20" y2="20" />
                    <rect x="7" y="7" width="6" height="6" rx="1" className="opacity-50" strokeWidth="1.5" />
                </svg>
                <input
                    ref={searchInputRef}
                    type="text"
                    value={searchTerm}
                    onChange={(e) => {
                        setSearchTerm(e.target.value);
                        if (!e.target.value.trim()) {
                            setIsSearching(false);
                            setDeepSearchResults([]);
                            setMessageSearchResults([]);
                            setSearchResultsModalOpen(false);
                        }
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && searchTerm.trim()) {
                            e.preventDefault();
                            createSearchPane(searchTerm.trim());
                            setSearchTerm('');
                        }
                    }}
                    className="flex-1 bg-transparent text-gray-100 text-xs focus:outline-none min-w-0"
                />
                {(deepSearchResults.length > 0 || messageSearchResults.length > 0) && (
                    <button
                        onClick={() => setSearchResultsModalOpen(true)}
                        className="px-1.5 py-0.5 text-[9px] bg-blue-500 text-white rounded"
                    >
                        {deepSearchResults.length + messageSearchResults.length}
                    </button>
                )}
                {searchTerm && (
                    <button
                        onClick={() => {
                            setSearchTerm('');
                            setIsSearching(false);
                            setDeepSearchResults([]);
                            setMessageSearchResults([]);
                            setSearchResultsModalOpen(false);
                        }}
                        className="p-0.5 hover:bg-gray-600 rounded"
                    >
                        <X size={10} className="text-gray-300" />
                    </button>
                )}
            </div>

            {/* Web Search */}
            <div className="flex items-center gap-2 w-40 px-2 py-1 bg-black/40 border border-gray-600 rounded focus-within:border-cyan-400 focus-within:ring-1 focus-within:ring-cyan-400/30 transition-all">
                <Globe size={14} className="text-cyan-400 flex-shrink-0" />
                <input
                    type="text"
                    value={webSearchTerm}
                    onChange={(e) => setWebSearchTerm(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && webSearchTerm.trim()) {
                            e.preventDefault();
                            const provider = WEB_SEARCH_PROVIDERS[webSearchProvider];
                            const url = provider.url + encodeURIComponent(webSearchTerm.trim());
                            createNewBrowser(url);
                            setWebSearchTerm('');
                        }
                    }}
                    className="flex-1 bg-transparent text-gray-100 text-xs focus:outline-none min-w-0"
                />
            </div>

            <div className="flex-1" />

            {/* Right side - Library, Photo, Disk Usage, Cron/Daemon, DateTime */}
            <div className="flex items-center gap-2">
                <button
                    onClick={() => createLibraryViewerPane?.()}
                    className="p-2 theme-hover rounded theme-text-muted"
                    title="Library"
                >
                    <BookOpen size={18} />
                </button>
                <button
                    onClick={() => createPhotoViewerPane?.()}
                    className="p-2 theme-hover rounded theme-text-muted"
                    title="Vixynt"
                >
                    <Image size={18} />
                </button>
                <button
                    onClick={() => createScherzoPane?.()}
                    className="p-2 theme-hover rounded theme-text-muted"
                    title="Scherzo"
                >
                    <Music size={18} />
                </button>
                <button
                    onClick={() => createDiskUsagePane?.()}
                    className="p-2 theme-hover rounded theme-text-muted"
                    title="Disk Usage Analyzer"
                >
                    <HardDrive size={18} />
                </button>
                <button
                    onClick={() => createCronDaemonPane()}
                    className="p-2 theme-hover rounded theme-text-muted"
                    title="Assembly Line (Cron, Daemons, SQL Models)"
                >
                    {/* Smokestack / Factory icon */}
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        {/* Main smokestack */}
                        <rect x="5" y="10" width="5" height="12" rx="0.5" />
                        {/* Smoke puffs rising */}
                        <circle cx="7.5" cy="6" r="2" />
                        <circle cx="9" cy="3" r="1.5" />
                        {/* Second stack */}
                        <rect x="12" y="14" width="4" height="8" rx="0.5" />
                        {/* Third smaller stack */}
                        <rect x="18" y="16" width="3" height="6" rx="0.5" />
                        {/* Ground line */}
                        <path d="M2 22h20" />
                    </svg>
                </button>
                <span
                    className="theme-text-muted tabular-nums cursor-pointer hover:text-gray-300"
                    onClick={() => setShowDateTime(!showDateTime)}
                    title={showDateTime ? "Hide date/time" : "Show date/time"}
                >
                    {showDateTime ? (
                        `${currentTime.toLocaleDateString()} ${currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                    ) : (
                        currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    )}
                </span>
            </div>
            </div>
            {/* Resize handle for top bar */}
            <div
                className="absolute bottom-0 left-0 right-0 h-1 cursor-ns-resize hover:bg-blue-500/50 transition-colors"
                onMouseDown={(e) => { e.preventDefault(); setIsResizingTopBar(true); }}
            />
        </div>
    );

    if (!rootLayoutNode) {
        return (
            <main className={`flex-1 flex flex-col bg-gray-900 ${isDarkMode ? 'dark-mode' : 'light-mode'} overflow-hidden`}>
                {topBar}
                <div
                    className="flex-1 flex items-center justify-center border-2 border-dashed border-gray-400 m-4"
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    onDrop={async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!draggedItem) return;

                        const newPaneId = generateId();
                        const newLayout = { id: newPaneId, type: 'content' };

                        let contentType;
                        if (draggedItem.type === 'conversation') {
                            contentType = 'chat';
                        } else if (draggedItem.type === 'browser') {
                            contentType = 'browser';
                        } else if (draggedItem.type === 'terminal') {
                            contentType = 'terminal';
                        } else if (draggedItem.type === 'file') {
                            const extension = draggedItem.id.split('.').pop()?.toLowerCase();
                            if (extension === 'pdf') contentType = 'pdf';
                            else if (['csv', 'xlsx', 'xls'].includes(extension)) contentType = 'csv';
                            else if (extension === 'pptx') contentType = 'pptx';
                            else if (extension === 'tex') contentType = 'latex';
                            else if (extension === 'ipynb') contentType = 'notebook';
    else if (extension === 'exp') contentType = 'exp';
                            else if (['docx', 'doc'].includes(extension)) contentType = 'docx';
                            else if (extension === 'mapx') contentType = 'mindmap';
                            else if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(extension)) contentType = 'image';
                            else contentType = 'editor';
                        } else {
                            contentType = 'editor';
                        }

                        // Set content BEFORE layout to prevent empty pane
                        if (draggedItem.type === 'browser' && draggedItem.url) {
                            contentDataRef.current[newPaneId] = { contentType: contentType, contentId: draggedItem.id, browserUrl: draggedItem.url };
                        } else {
                            contentDataRef.current[newPaneId] = { contentType: contentType, contentId: draggedItem.id };
                        }

                        setRootLayoutNode(newLayout);
                        setActiveContentPaneId(newPaneId);
                        setDraggedItem(null);
                    }}  >
                    <div className="text-center text-gray-400 max-w-md mx-auto">
                        <div className="mb-6">
                            <div className="text-[11px] uppercase tracking-wider text-gray-500 mb-3">Keyboard Shortcuts</div>
                            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[11px]">
                                <div className="text-right text-gray-500">⌘ P</div><div className="text-left">Command palette</div>
                                <div className="text-right text-gray-500">⌘ ⇧ C</div><div className="text-left">New chat</div>
                                <div className="text-right text-gray-500">⌘ ⇧ T</div><div className="text-left">New terminal</div>
                                <div className="text-right text-gray-500">⌘ O</div><div className="text-left">Open file</div>
                                <div className="text-right text-gray-500">⌘ B</div><div className="text-left">New browser</div>
                                <div className="text-right text-gray-500">⌘ ⇧ F</div><div className="text-left">Global search</div>
                            </div>
                        </div>
                        <div className="text-[10px] text-gray-600">
                            <span className="text-gray-500 not-italic">Tip of the day: </span>
                            <span className="italic">{(() => {
                                const tips = [
                                    // Drag & Drop
                                    "Drag files from the sidebar to create new panes",
                                    "Drag tabs between panes to reorganize your workspace",
                                    "Drag pane edges to resize them",
                                    "Drag a tab to the edge of a pane to split it",
                                    "Drag images directly into chat to share them",
                                    "Drag folders from finder into the sidebar to add them",
                                    // Pane Management
                                    "Double-click a tab to maximize that pane",
                                    "Click a maximized pane's tab again to restore it",
                                    "Close unused panes to simplify your workspace",
                                    "Use ⌘W to close the current tab",
                                    // Context Menus
                                    "Right-click on tabs for more options",
                                    "Right-click files in the sidebar for context actions",
                                    "Right-click in the editor for code actions",
                                    "Right-click on folders to create new files",
                                    // Sidebar Features
                                    "Click the folder icon in the sidebar to open a new project",
                                    "Use the search bar in the sidebar to filter files",
                                    "Toggle folders open/closed by clicking their arrows",
                                    "Pin frequently used files by starring them",
                                    // Terminal Features
                                    "Use ⌘⇧T to open a new terminal quickly",
                                    "Terminal supports multiple shells and sessions",
                                    "Run npcsh commands directly in the terminal",
                                    "Use Ctrl+C to cancel running commands",
                                    // Editor Features
                                    "Use ⌘F to search within the current file",
                                    "Use ⌘⇧F for global search across all files",
                                    "Click line numbers to set breakpoints",
                                    "Use multiple cursors with ⌘+click",
                                    // Git Features
                                    "View git status with the diff viewer",
                                    "Stage changes directly from the diff viewer",
                                    "Commit messages support markdown formatting",
                                    "View file history through the context menu",
                                    // Notebook & Experiment Features
                                    "Open .ipynb files for Jupyter notebook editing",
                                    "Create .exp files for reproducible experiments",
                                    "Run notebook cells with Shift+Enter",
                                    "Export notebooks to various formats",
                                    // Browser Features
                                    "Use ⌘B to open a new browser pane",
                                    "Use Ctrl+R to refresh the browser",
                                    "Use Ctrl+J to open the download manager",
                                    "Browser panes can be split for side-by-side viewing",
                                    // File Management
                                    "Use ⌘N to create a new folder",
                                    "Use ⌘O to quickly open any file",
                                    "Double-click files in the sidebar to open them",
                                    "Supported formats: PDF, CSV, Excel, images, and more",
                                    // Command Palette
                                    "Use ⌘P to access all commands quickly",
                                    "Type '>' in the command palette for commands",
                                    "Type '@' in the command palette to search symbols",
                                    // Misc Tips
                                    "Use ⌘⇧N to open a new window",
                                    "Press Escape to close menus and dialogs",
                                    "Hover over icons for tooltips",
                                    "Check the status bar for git and system info",
                                ];
                                // Use day of year to pick tip - only changes once per day
                                const now = new Date();
                                const start = new Date(now.getFullYear(), 0, 0);
                                const diff = now.getTime() - start.getTime();
                                const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));
                                return tips[dayOfYear % tips.length];
                            })()}</span>
                        </div>
                        {/* Version info */}
                        {updateAvailable && (
                            <div className="mt-6 text-[10px] text-amber-500/80">
                                <div className="mb-1">
                                    You are on version {appVersion || 'unknown'}. Latest is {updateAvailable.latestVersion}.
                                </div>
                                <div>
                                    <a
                                        href="#"
                                        onClick={(e) => { e.preventDefault(); createNewBrowser('https://enpisi.com/downloads'); }}
                                        className="text-blue-400 hover:text-blue-300 underline"
                                    >
                                        Get the latest at enpisi.com/downloads
                                    </a>
                                </div>
                            </div>
                        )}
                        {/* Support info */}
                        <div className="mt-4 text-[9px] text-gray-600">
                            Experiencing issues? Report at{' '}
                            <a
                                href="#"
                                onClick={(e) => { e.preventDefault(); createNewBrowser('https://github.com/npc-worldwide/incognide'); }}
                                className="text-gray-500 hover:text-gray-400 underline"
                            >
                                github.com/npc-worldwide/incognide
                            </a>
                            {' '}or email{' '}
                            <a
                                href="#"
                                onClick={(e) => { e.preventDefault(); (window as any).api?.openExternal?.('mailto:info@npcworldwi.de'); }}
                                className="text-gray-500 hover:text-gray-400 underline"
                            >
                                info@npcworldwi.de
                            </a>
                        </div>
                    </div>
                </div>
                <StatusBar
                    createDBToolPane={createDBToolPane}
                    createTeamManagementPane={createTeamManagementPane}
                    paneItems={[]}
                    setActiveContentPaneId={setActiveContentPaneId}
                    pendingMemoryCount={pendingMemoryCount}
                    createMemoryManagerPane={createMemoryManagerPane}
                    kgGeneration={kgGeneration}
                    createGraphViewerPane={createGraphViewerPane}
                    createNPCTeamPane={createNPCTeamPane}
                    createJinxPane={createJinxPane}
                    height={bottomBarHeight}
                    onStartResize={() => setIsResizingBottomBar(true)}
                    sidebarCollapsed={sidebarCollapsed}
                    onExpandSidebar={() => setSidebarCollapsed(false)}
                    topBarCollapsed={topBarCollapsed}
                    onExpandTopBar={() => { setTopBarCollapsed(false); localStorage.setItem('npcStudio_topBarCollapsed', 'false'); }}
                />
            </main>
        );
    }

    // Pane items for dock
    const paneItems = Object.entries(contentDataRef.current).map(([paneId, data]: [string, any]) => ({
        id: paneId,
        type: data?.contentType || 'empty',
        title: data?.contentType === 'chat'
            ? `Chat ${data?.contentId?.slice(-6) || ''}`
            : data?.contentType === 'editor'
                ? data?.contentId?.split('/').pop() || 'File'
                : data?.contentType || 'Pane',
        isActive: paneId === activeContentPaneId
    }));

    return (
        <main className={`flex-1 flex flex-col bg-gray-900 ${isDarkMode ? 'dark-mode' : 'light-mode'} overflow-hidden`}>
            {topBar}
            <div className="flex-1 flex overflow-hidden">
                {rootLayoutNode ? (
                    <LayoutNode node={rootLayoutNode} path={[]} component={layoutComponentApi} />
                ) : (
                    <div className="flex-1 flex items-center justify-center theme-text-muted">
                        {loading ? "Loading..." : "Drag a conversation or file to start."}
                    </div>
                )}
            </div>
            <StatusBar
                createDBToolPane={createDBToolPane}
                createTeamManagementPane={createTeamManagementPane}
                paneItems={paneItems}
                setActiveContentPaneId={setActiveContentPaneId}
                pendingMemoryCount={pendingMemoryCount}
                createMemoryManagerPane={createMemoryManagerPane}
                kgGeneration={kgGeneration}
                createGraphViewerPane={createGraphViewerPane}
                createNPCTeamPane={createNPCTeamPane}
                createJinxPane={createJinxPane}
                height={bottomBarHeight}
                onStartResize={() => setIsResizingBottomBar(true)}
                sidebarCollapsed={sidebarCollapsed}
                onExpandSidebar={() => setSidebarCollapsed(false)}
                topBarCollapsed={topBarCollapsed}
                onExpandTopBar={() => { setTopBarCollapsed(false); localStorage.setItem('npcStudio_topBarCollapsed', 'false'); }}
            />
        </main>
    );
};


    return (
        <div className={`chat-container ${isDarkMode ? 'dark-mode' : 'light-mode'} h-screen flex flex-col bg-gray-900 text-gray-100 font-mono`}>
<div className="flex flex-1 overflow-hidden">
    <Sidebar
        // Pass all necessary state and functions as props
        sidebarCollapsed={sidebarCollapsed}
        sidebarWidth={sidebarWidth}
        isResizingSidebar={isResizingSidebar}
        contentDataRef={contentDataRef}
        isDarkMode={isDarkMode}
        currentPath={currentPath}
        baseDir={baseDir}
        selectedFiles={selectedFiles}
        selectedConvos={selectedConvos}
        windowId={windowId}
        activeWindowsExpanded={activeWindowsExpanded}
        workspaceIndicatorExpanded={workspaceIndicatorExpanded}
        expandedFolders={expandedFolders}
        renamingPath={renamingPath}
        editedSidebarItemName={editedSidebarItemName}
        currentFile={currentFile}
        lastClickedIndex={lastClickedIndex}
        lastClickedFileIndex={lastClickedFileIndex}
        activeContentPaneId={activeContentPaneId}
        activeConversationId={activeConversationId}
        folderStructure={folderStructure}
        directoryConversations={directoryConversations}
        gitStatus={gitStatus}
        gitPanelCollapsed={gitPanelCollapsed}
        gitCommitMessage={gitCommitMessage}
        gitLoading={gitLoading}
        gitError={gitError}
        rootLayoutNode={rootLayoutNode}
        openBrowsers={openBrowsers}
        commonSites={commonSites}
        websiteHistory={websiteHistory}
        filesCollapsed={filesCollapsed}
        conversationsCollapsed={conversationsCollapsed}
        websitesCollapsed={websitesCollapsed}
        isGlobalSearch={isGlobalSearch}
        searchTerm={searchTerm}
        searchInputRef={searchInputRef}
        loading={loading}
        isSearching={isSearching}
        contextMenuPos={contextMenuPos}
        sidebarItemContextMenuPos={sidebarItemContextMenuPos}
        fileContextMenuPos={fileContextMenuPos}
        isEditingPath={isEditingPath}
        editedPath={editedPath}
        setSidebarWidth={setSidebarWidth}
        setIsResizingSidebar={setIsResizingSidebar}
        setSelectedFiles={setSelectedFiles}
        setFileContextMenuPos={setFileContextMenuPos}
        setError={setError}
        setIsStreaming={setIsStreaming}
        setRootLayoutNode={setRootLayoutNode}
        setActiveWindowsExpanded={setActiveWindowsExpanded}
        setWorkspaceIndicatorExpanded={setWorkspaceIndicatorExpanded}
        setGitPanelCollapsed={setGitPanelCollapsed}
        setExpandedFolders={setExpandedFolders}
        setRenamingPath={setRenamingPath}
        setEditedSidebarItemName={setEditedSidebarItemName}
        setLastClickedIndex={setLastClickedIndex}
        setLastClickedFileIndex={setLastClickedFileIndex}
        setSelectedConvos={setSelectedConvos}
        setActiveContentPaneId={setActiveContentPaneId}
        setCurrentFile={setCurrentFile}
        setActiveConversationId={setActiveConversationId}
        setDirectoryConversations={setDirectoryConversations}
        setFolderStructure={setFolderStructure}
        setGitCommitMessage={setGitCommitMessage}
        setGitLoading={setGitLoading}
        setGitError={setGitError}
        setGitStatus={setGitStatus}
        setFilesCollapsed={setFilesCollapsed}
        setConversationsCollapsed={setConversationsCollapsed}
        setWebsitesCollapsed={setWebsitesCollapsed}
        sidebarSectionOrder={sidebarSectionOrder}
        setSidebarSectionOrder={setSidebarSectionOrder}
        setInput={setInput}
        setContextMenuPos={setContextMenuPos}
        setSidebarItemContextMenuPos={setSidebarItemContextMenuPos}
        setSearchTerm={setSearchTerm}
        setIsSearching={setIsSearching}
        setDeepSearchResults={setDeepSearchResults}
        setMessageSearchResults={setMessageSearchResults}
        setIsEditingPath={setIsEditingPath}
        setEditedPath={setEditedPath}
        setSettingsOpen={setSettingsOpen}
        setProjectEnvEditorOpen={setProjectEnvEditorOpen}
        setBrowserUrlDialogOpen={setBrowserUrlDialogOpen}
        setPhotoViewerOpen={setPhotoViewerOpen}
        setDashboardMenuOpen={setDashboardMenuOpen}
        setJinxMenuOpen={setJinxMenuOpen}
        setCtxEditorOpen={setCtxEditorOpen}
        setTeamManagementOpen={setTeamManagementOpen}
        setNpcTeamMenuOpen={setNpcTeamMenuOpen}
        setSidebarCollapsed={setSidebarCollapsed}
        createGraphViewerPane={createGraphViewerPane}
        createBrowserGraphPane={createBrowserGraphPane}
        createDataLabelerPane={createDataLabelerPane}
        createDataDashPane={createDataDashPane}
        createDBToolPane={createDBToolPane}
        createNPCTeamPane={createNPCTeamPane}
        createJinxPane={createJinxPane}
        createTeamManagementPane={createTeamManagementPane}
        createSettingsPane={createSettingsPane}
        createPhotoViewerPane={createPhotoViewerPane}
        createScherzoPane={createScherzoPane}
        createProjectEnvPane={createProjectEnvPane}
        createDiskUsagePane={createDiskUsagePane}
        createLibraryViewerPane={createLibraryViewerPane}
        createHelpPane={createHelpPane}
        createTileJinxPane={createTileJinxPane}
        createGitPane={createGitPane}
        createAndAddPaneNodeToLayout={createAndAddPaneNodeToLayout}
        createNewConversation={createNewConversation}
        generateId={generateId}
        streamToPaneRef={streamToPaneRef}
        availableNPCs={availableNPCs}
        currentNPC={currentNPC}
        currentModel={currentModel}
        currentProvider={currentProvider}
        executionMode={executionMode}
        mcpServerPath={mcpServerPath}
        selectedMcpTools={selectedMcpTools}
        updateContentPane={updateContentPane}
        loadDirectoryStructure={loadDirectoryStructure}
        loadWebsiteHistory={loadWebsiteHistory}
        createNewBrowser={createNewBrowser}
        handleGlobalDragStart={handleGlobalDragStart}
        handleGlobalDragEnd={handleGlobalDragEnd}
        normalizePath={normalizePath}
        getFileIcon={getFileIcon}
        serializeWorkspace={serializeWorkspace}
        saveWorkspaceToStorage={saveWorkspaceToStorage}
        handleConversationSelect={handleConversationSelect}
        handleFileClick={handleFileClick}
        handleInputSubmit={handleInputSubmit}
        toggleTheme={() => toggleTheme(setIsDarkMode)}
        goUpDirectory={() => goUpDirectory(currentPath, baseDir, switchToPath, setError)}
        switchToPath={switchToPath}
        handleCreateNewFolder={handleCreateNewFolder}
        createNewTextFile={createNewTextFile}
        createNewTerminal={createNewTerminal}
        createNewNotebook={createNewJupyterNotebook}
        createNewExperiment={createNewExperiment}
        createNewDocument={createNewDocument}
        handleOpenNpcTeamMenu={handleOpenNpcTeamMenu}
        renderSearchResults={renderSearchResults}
        isPredictiveTextEnabled={isPredictiveTextEnabled}
        setIsPredictiveTextEnabled={setIsPredictiveTextEnabled}
        topBarHeight={topBarHeight}
        bottomBarHeight={bottomBarHeight}
        topBarCollapsed={topBarCollapsed}
        onExpandTopBar={() => { setTopBarCollapsed(false); localStorage.setItem('npcStudio_topBarCollapsed', 'false'); }}
        onCollapseTopBar={() => { setTopBarCollapsed(true); localStorage.setItem('npcStudio_topBarCollapsed', 'true'); }}
        setDownloadManagerOpen={setDownloadManagerOpen}
    />
    {renderMainContent()}
        <PredictiveTextOverlay
            predictionSuggestion={predictionSuggestion}
            predictionTargetElement={predictionTargetElement}
            isPredictiveTextEnabled={isPredictiveTextEnabled}
            setPredictionSuggestion={setPredictionSuggestion}
            setPredictionTargetElement={setPredictionTargetElement}
        />
        <CommandPalette
            isOpen={commandPaletteOpen}
            onClose={() => setCommandPaletteOpen(false)}
            onFileSelect={handleFileClick}
            currentPath={currentPath}
            folderStructure={folderStructure}
        />

</div>
            {renderModals()}

            {/* Zen Mode Overlay */}
            {zenModePaneId && contentDataRef.current[zenModePaneId] && (
                <div className="fixed inset-0 z-[200] bg-gray-900 flex flex-col">
                    {/* Zen mode header with minimize/close */}
                    <div className="p-2 border-b theme-border text-xs theme-text-muted flex-shrink-0 theme-bg-secondary flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            <span className="font-semibold">Zen Mode</span>
                            <span className="text-gray-500">-</span>
                            <span>{contentDataRef.current[zenModePaneId]?.contentId?.split('/').pop() || 'Focused View'}</span>
                        </div>
                        <button
                            onClick={() => setZenModePaneId(null)}
                            className="p-1 theme-hover rounded-full flex-shrink-0 transition-all hover:bg-blue-500/20"
                            title="Exit zen mode (Esc)"
                        >
                            <X size={16} />
                        </button>
                    </div>
                    {/* Zen mode content */}
                    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                        {(() => {
                            const paneData = contentDataRef.current[zenModePaneId];
                            const contentType = paneData?.contentType;
                            switch (contentType) {
                                case 'chat':
                                    const zenChatInputProps = getChatInputProps(zenModePaneId);
                                    return (
                                        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                                            <div className="flex-1 min-h-0 overflow-y-auto">
                                                {renderChatView({ nodeId: zenModePaneId })}
                                            </div>
                                            {zenChatInputProps && (
                                                <ChatInput
                                                    {...zenChatInputProps}
                                                    paneId={zenModePaneId}
                                                    onFocus={() => setActiveContentPaneId(zenModePaneId)}
                                                />
                                            )}
                                        </div>
                                    );
                                case 'editor':
                                    return renderFileEditor({ nodeId: zenModePaneId });
                                case 'terminal':
                                    return renderTerminalView({ nodeId: zenModePaneId });
                                case 'pdf':
                                    return renderPdfViewer({ nodeId: zenModePaneId });
                                case 'csv':
                                    return renderCsvViewer({ nodeId: zenModePaneId });
                                case 'docx':
                                    return renderDocxViewer({ nodeId: zenModePaneId });
                                case 'browser':
                                    return renderBrowserViewer({ nodeId: zenModePaneId });
                                case 'pptx':
                                    return renderPptxViewer({ nodeId: zenModePaneId });
                                case 'latex':
                                    return renderLatexViewer({ nodeId: zenModePaneId });
                                case 'image':
                                    return renderPicViewer({ nodeId: zenModePaneId });
                                case 'mindmap':
                                    return renderMindMapViewer({ nodeId: zenModePaneId });
                                case 'notebook':
                                    return renderNotebookViewer({ nodeId: zenModePaneId });
                                case 'exp':
                                    return renderExpViewer({ nodeId: zenModePaneId });
                                case 'data-labeler':
                                    return renderDataLabelerPane({ nodeId: zenModePaneId });
                                case 'graph-viewer':
                                    return renderGraphViewerPane({ nodeId: zenModePaneId });
                                case 'datadash':
                                    return renderDataDashPane({ nodeId: zenModePaneId });
                                case 'photoviewer':
                                    return renderPhotoViewerPane({ nodeId: zenModePaneId });
                                case 'library':
                                    return renderLibraryViewerPane({ nodeId: zenModePaneId });
                                case 'projectenv':
                                    return renderProjectEnvPane({ nodeId: zenModePaneId });
                                case 'diskusage':
                                    return renderDiskUsagePane({ nodeId: zenModePaneId });
                                case 'memory-manager':
                                    return renderMemoryManagerPane({ nodeId: zenModePaneId });
                                case 'cron-daemon':
                                    return renderCronDaemonPane({ nodeId: zenModePaneId });
                                case 'search':
                                    return renderSearchPane({ nodeId: zenModePaneId, initialQuery: zenPaneData?.initialQuery });
                                case 'markdown-preview':
                                    return renderMarkdownPreviewPane({ nodeId: zenModePaneId });
                                case 'html-preview':
                                    return renderHtmlPreviewPane({ nodeId: zenModePaneId });
                                case 'help':
                                    return renderHelpPane({ nodeId: zenModePaneId });
                                default:
                                    return <div className="flex-1 flex items-center justify-center theme-text-muted">Unknown content type</div>;
                            }
                        })()}
                    </div>
                </div>
            )}

        <BranchingUI
            showBranchingUI={showBranchingUI}
            setShowBranchingUI={setShowBranchingUI}
            conversationBranches={conversationBranches}
            currentBranchId={currentBranchId}
            setCurrentBranchId={setCurrentBranchId}
            setConversationBranches={setConversationBranches}
            activeContentPaneId={activeContentPaneId}
            contentDataRef={contentDataRef}
            setRootLayoutNode={setRootLayoutNode}
            onOpenVisualizer={() => setShowBranchVisualizer(true)}
            expandedBranchPath={expandedBranchPath}
            onCollapseBranch={(paneId) => {
                setExpandedBranchPath(prev => {
                    const next = { ...prev };
                    delete next[paneId];
                    return next;
                });
            }}
            onExpandBranch={(paneId, path) => {
                setExpandedBranchPath(prev => ({ ...prev, [paneId]: path }));
            }}
        />

        <BranchOptionsModal
            isOpen={branchOptionsModal.isOpen}
            onClose={() => setBranchOptionsModal({ isOpen: false, messageIndex: -1, messageContent: '' })}
            onConfirm={handleBranchOptionsConfirm}
            messageContent={branchOptionsModal.messageContent}
            currentModel={currentModel}
            availableModels={availableModels}
        />

        <BranchVisualizer
            isOpen={showBranchVisualizer}
            onClose={() => setShowBranchVisualizer(false)}
            conversationBranches={conversationBranches}
            currentBranchId={currentBranchId}
            onSwitchBranch={(branchId) => {
                const activePaneData = contentDataRef.current[activeContentPaneId!];
                if (!activePaneData || !activePaneData.chatMessages) return;
                const branch = conversationBranches.get(branchId);
                if (branch) {
                    setCurrentBranchId(branchId);
                    activePaneData.chatMessages.allMessages = [...branch.messages];
                    activePaneData.chatMessages.messages = branch.messages.slice(-(activePaneData.chatMessages.displayedMessageCount || 50));
                    setRootLayoutNode(prev => ({ ...prev }));
                } else if (branchId === 'main') {
                    setCurrentBranchId('main');
                    setRootLayoutNode(prev => ({ ...prev }));
                }
            }}
            allMessages={activeContentPaneId ? contentDataRef.current[activeContentPaneId]?.chatMessages?.allMessages || [] : []}
            expandedBranchPath={activeContentPaneId ? expandedBranchPath[activeContentPaneId] || [] : []}
            onExpandBranch={(path) => {
                if (activeContentPaneId) {
                    setExpandedBranchPath(prev => ({
                        ...prev,
                        [activeContentPaneId]: path
                    }));
                    setRootLayoutNode(prev => ({ ...prev }));
                }
            }}
        />

        </div>
    );
};

export default ChatInterface;
