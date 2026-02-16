import React, { useCallback, useState, useEffect } from 'react';
import { BACKEND_URL } from '../config';
import { Code2, FileText, FileJson, BarChart3, File } from 'lucide-react';
import { executeStudioAction, StudioContext } from '../studioActions';

// Auto TTS trigger for voice input responses
export const triggerAutoTTS = async (text: string) => {
    if (!text?.trim()) return;

    try {
        // Get saved TTS settings
        let engine = 'kokoro';
        let voice = 'af_heart';
        try {
            const stored = localStorage.getItem('npcStudio_ttsSettings');
            if (stored) {
                const settings = JSON.parse(stored);
                if (settings.engine) engine = settings.engine;
                if (settings.voice) voice = settings.voice;
            }
        } catch (err) {}

        console.log(`[Voice] Triggering auto-TTS with ${engine}/${voice}`);

        const response = await fetch(`${BACKEND_URL}/api/audio/tts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, engine, voice })
        });

        if (!response.ok) {
            console.error('[Voice] TTS request failed:', await response.text());
            return;
        }

        const result = await response.json();
        if (result.audio) {
            const format = result.format || 'mp3';
            const mimeType = format === 'wav' ? 'audio/wav' : 'audio/mp3';
            const audio = new Audio(`data:${mimeType};base64,${result.audio}`);
            await audio.play();
        }
    } catch (err) {
        console.error('[Voice] Auto-TTS error:', err);
    }
};

export const convertFileToBase64 = (file: File) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
           
            resolve({
                dataUrl: reader.result,
                base64: reader.result.split(',')[1] 
            });
        };
        reader.onerror = (error) => reject(error);
        reader.readAsDataURL(file);
    });
};

export const normalizePath = (path: string | null | undefined) => {
    if (!path) return '';
    let normalizedPath = path.replace(/\\/g, '/');
    if (normalizedPath.endsWith('/') && normalizedPath.length > 1) {
        normalizedPath = normalizedPath.slice(0, -1);
    }
    return normalizedPath;
};

export const getFileName = (filePath: string | null | undefined): string => {
    if (!filePath) return '';
    return filePath.replace(/\\/g, '/').split('/').pop() || '';
};

export const getParentPath = (filePath: string | null | undefined): string => {
    if (!filePath) return '';
    const normalized = filePath.replace(/\\/g, '/');
    return normalized.split('/').slice(0, -1).join('/') || '/';
};

export const generateId = () => Math.random().toString(36).substr(2, 9);

// Strip source prefixes like "project:" or "global:" from NPC names
export const stripSourcePrefix = (name: string | undefined | null): string => {
    if (!name) return '';
    return name.replace(/^(project:|global:)/, '');
};

// Styled extension badge for file icons — distinctive per file type
const ExtBadge = ({ label, color, bg }: { label: string; color: string; bg: string }) => (
    <span className="flex-shrink-0 inline-flex items-center justify-center rounded" style={{
        width: 18, height: 16, fontSize: label.length > 3 ? '7px' : '8px', fontWeight: 700,
        fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
        color, background: bg, letterSpacing: '-0.3px', lineHeight: 1,
    }}>
        {label}
    </span>
);

export const getFileIcon = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const iconProps = { size: 16, className: "flex-shrink-0" };
    switch(ext) {
        case 'py': return <ExtBadge label="py" color="#60a5fa" bg="rgba(96,165,250,0.15)" />;
        case 'js': return <ExtBadge label="js" color="#facc15" bg="rgba(250,204,21,0.15)" />;
        case 'ts': return <ExtBadge label="ts" color="#3b82f6" bg="rgba(59,130,246,0.15)" />;
        case 'tsx': return <ExtBadge label="tsx" color="#38bdf8" bg="rgba(56,189,248,0.12)" />;
        case 'jsx': return <ExtBadge label="jsx" color="#fbbf24" bg="rgba(251,191,36,0.12)" />;
        case 'md': return <ExtBadge label="md" color="#4ade80" bg="rgba(74,222,128,0.12)" />;
        case 'json': return <ExtBadge label="{}" color="#fb923c" bg="rgba(251,146,60,0.15)" />;
        case 'csv': return <ExtBadge label="csv" color="#22c55e" bg="rgba(34,197,94,0.12)" />;
        case 'xlsx': case 'xls': return <ExtBadge label="xls" color="#22c55e" bg="rgba(34,197,94,0.15)" />;
        case 'docx': case 'doc': return <ExtBadge label="doc" color="#3b82f6" bg="rgba(59,130,246,0.15)" />;
        case 'pdf': return <ExtBadge label="pdf" color="#f87171" bg="rgba(248,113,113,0.15)" />;
        case 'pptx': case 'ppt': return <ExtBadge label="ppt" color="#f97316" bg="rgba(249,115,22,0.15)" />;
        case 'html': return <ExtBadge label="htm" color="#f472b6" bg="rgba(244,114,182,0.12)" />;
        case 'css': return <ExtBadge label="css" color="#a78bfa" bg="rgba(167,139,250,0.12)" />;
        case 'yaml': case 'yml': return <ExtBadge label="yml" color="#f9a8d4" bg="rgba(249,168,212,0.12)" />;
        case 'sh': case 'bash': case 'zsh': return <ExtBadge label="sh" color="#a3e635" bg="rgba(163,230,53,0.12)" />;
        case 'sql': return <ExtBadge label="sql" color="#38bdf8" bg="rgba(56,189,248,0.12)" />;
        case 'rs': return <ExtBadge label="rs" color="#fb923c" bg="rgba(251,146,60,0.12)" />;
        case 'go': return <ExtBadge label="go" color="#22d3ee" bg="rgba(34,211,238,0.12)" />;
        case 'c': case 'h': return <ExtBadge label={ext} color="#60a5fa" bg="rgba(96,165,250,0.12)" />;
        case 'cpp': case 'cc': case 'hpp': return <ExtBadge label="c++" color="#818cf8" bg="rgba(129,140,248,0.12)" />;
        case 'java': return <ExtBadge label="java" color="#f97316" bg="rgba(249,115,22,0.12)" />;
        case 'rb': return <ExtBadge label="rb" color="#f87171" bg="rgba(248,113,113,0.12)" />;
        case 'ipynb': return <ExtBadge label="nb" color="#f97316" bg="rgba(249,115,22,0.15)" />;
        case 'exp': return <ExtBadge label="exp" color="#c084fc" bg="rgba(192,132,252,0.15)" />;
        case 'png': case 'jpg': case 'jpeg': case 'gif': case 'svg': case 'webp':
            return <ExtBadge label={ext.slice(0, 3)} color="#e879f9" bg="rgba(232,121,249,0.12)" />;
        case 'tex': case 'latex': case 'sty': case 'cls': case 'bib':
            return <span className="flex-shrink-0 inline-flex items-center justify-center rounded" style={{
                width: 18, height: 16, fontSize: '8px', fontWeight: 800,
                fontFamily: '"CMU Serif", "Computer Modern", Georgia, serif',
                color: '#4ade80', background: 'rgba(74,222,128,0.12)',
                letterSpacing: '-0.5px', lineHeight: 1,
            }}>
                T<span style={{ fontSize: '6px', verticalAlign: 'sub', marginLeft: '-0.5px' }}>E</span>X
            </span>;

        default: return <File {...iconProps}
            className={`${iconProps.className} text-gray-400`} />;
    }
};

// Custom hook for loading website history
export const useLoadWebsiteHistory = (
    currentPath: string | null,
    setWebsiteHistory: (history: any[]) => void,
    setCommonSites: (sites: any[]) => void
) => {
    return useCallback(async () => {
    if (!currentPath) return;
    try {
        const response = await window.api.getBrowserHistory(currentPath);
        if (response?.history) {
            setWebsiteHistory(response.history);
            
            // Calculate common sites based on visit frequency
            const siteMap = new Map();
            response.history.forEach((item: any) => {
                const domain = new URL(item.url).hostname;
                if (!siteMap.has(domain)) {
                    siteMap.set(domain, {
                        domain,
                        count: 0,
                        lastVisited: item.timestamp,
                        favicon: `https://www.google.com/s2/favicons?domain=${domain}&sz=32`
                    });
                }
                const site = siteMap.get(domain);
                site.count++;
                if (new Date(item.timestamp) > new Date(site.lastVisited)) {
                    site.lastVisited = item.timestamp;
                }
            });

            // Sort by visit count and take top 10
            const common = Array.from(siteMap.values())
                .sort((a: any, b: any) => b.count - a.count)
                .slice(0, 10);
            setCommonSites(common);
        }
    } catch (err) {
        console.error('Error loading website history:', err);
    }
}, [currentPath, setWebsiteHistory, setCommonSites]);
};


export const handleBrowserCopyText = (
    browserContextMenu: any,
    setBrowserContextMenu: (menu: any) => void
) => {
    if (browserContextMenu.selectedText) {
        navigator.clipboard.writeText(browserContextMenu.selectedText);
    }

    window.api.browserSetVisibility({ viewId: browserContextMenu.viewId, visible: true });
    setBrowserContextMenu({ isOpen: false, x: 0, y: 0, selectedText: '', viewId: null });
};

export const handleBrowserAddToChat = (
    browserContextMenu: any,
    setBrowserContextMenu: (menu: any) => void,
    setInput: (input: string | ((prev: string) => string)) => void
) => {
    if (browserContextMenu.selectedText) {
        const citation = `[From ${browserContextMenu.pageTitle || 'webpage'}](${browserContextMenu.currentUrl})\n\n> ${browserContextMenu.selectedText}`;
        setInput(prev => `${prev}${prev ? '\n\n' : ''}${citation}`);
    }

    setBrowserContextMenu({
        isOpen: false, x: 0, y: 0,
        selectedText: '', viewId: null,
        currentUrl: '', pageTitle: ''
    });
};

export const handleBrowserAiAction = (
    action: string,
    browserContextMenu: any,
    setBrowserContextMenu: (menu: any) => void,
    setInput: (input: string) => void
) => {
    const { selectedText, viewId } = browserContextMenu;
    if (!selectedText) return;

    let prompt = '';
    switch(action) {
        case 'summarize':
            prompt = `Please summarize the following text from a website:\n\n---\n${selectedText}\n---`;
            break;
        case 'explain':
            prompt = `Please explain the key points of the following text from a website:\n\n---\n${selectedText}\n---`;
            break;
    }
    setInput(prompt);


    setBrowserContextMenu({ isOpen: false, x: 0, y: 0, selectedText: '', viewId: null });
};
    



export const loadAvailableNPCs = async (
    currentPath: string | null,
    setNpcsLoading: (loading: boolean) => void,
    setNpcsError: (error: string | null) => void,
    setAvailableNPCs: (npcs: any[]) => void
) => {
    if (!currentPath) return [];
    setNpcsLoading(true);
    setNpcsError(null);
    try {

        const projectResponse = await window.api.getNPCTeamProject(currentPath);
        const projectNPCs = projectResponse.npcs || [];


        const globalResponse = await window.api.getNPCTeamGlobal();
        const globalNPCs = globalResponse.npcs || [];


        const formattedProjectNPCs = projectNPCs.map(npc => ({
            ...npc,
            value: npc.name,
            display_name: `${npc.name} | Project`,
            source: 'project'
        }));

        const formattedGlobalNPCs = globalNPCs.map(npc => ({
            ...npc,
            value: npc.name,
            display_name: `${npc.name} | Global`,
            source: 'global'
        }));


        const combinedNPCs = [...formattedProjectNPCs, ...formattedGlobalNPCs];
        setAvailableNPCs(combinedNPCs);
        return combinedNPCs;
    } catch (err: any) {
        console.error('Error fetching NPCs:', err);
        setNpcsError(err.message);
        setAvailableNPCs([]);
        return [];
    } finally {
        setNpcsLoading(false);
    }
};


export const hashContext = (contexts: any[]) => {
    const contentString = contexts
        .map(ctx => `${ctx.type}:${ctx.path || ctx.url}:${ctx.content?.substring(0, 100)}`)
        .join('|');
    // Use TextEncoder to handle Unicode characters that btoa can't handle
    const bytes = new TextEncoder().encode(contentString);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
};

export const gatherWorkspaceContext = (contentDataRef: React.MutableRefObject<any>, contextFiles?: any[], excludedPaneIds?: Set<string>) => {
    const contexts: any[] = [];

    // Add open pane contexts
    Object.entries(contentDataRef.current).forEach(([paneId, paneData]: [string, any]) => {
        // Skip panes that are excluded from context
        if (excludedPaneIds && excludedPaneIds.has(paneId)) return;
        const fileContentTypes = ['editor', 'latex', 'csv', 'notebook', 'docx', 'pptx', 'exp', 'mindmap'];
        if (fileContentTypes.includes(paneData.contentType) && (paneData.fileContent || paneData.contentId)) {
            contexts.push({
                type: 'file',
                path: paneData.contentId,
                content: paneData.fileContent || '',
                paneId: paneId,
                source: 'open-pane'
            });
        } else if (paneData.contentType === 'image' && paneData.contentId) {
            contexts.push({
                type: 'image',
                path: paneData.contentId,
                paneId: paneId,
                source: 'open-pane'
            });
        } else if (paneData.contentType === 'browser' && paneData.browserUrl) {
            contexts.push({
                type: 'browser',
                url: paneData.browserUrl,
                viewId: paneData.contentId,
                paneId: paneId
            });
        } else if (paneData.contentType === 'pdf' && paneData.contentId) {
            contexts.push({
                type: 'pdf',
                path: paneData.contentId,
                paneId: paneId
            });
        } else if (paneData.contentType === 'terminal' && paneData.getTerminalContext) {
            // Include terminal output context
            try {
                const terminalOutput = paneData.getTerminalContext();
                if (terminalOutput && terminalOutput.trim()) {
                    contexts.push({
                        type: 'terminal',
                        content: terminalOutput,
                        paneId: paneId,
                        shellType: paneData.shellType || 'system'
                    });
                }
            } catch (err) {
                console.warn('Failed to get terminal context:', err);
            }
        }
    });

    // Add explicit context files (if not already included from open panes)
    if (contextFiles && contextFiles.length > 0) {
        contextFiles.forEach((file: any) => {
            // Don't add duplicates from open panes
            const alreadyIncluded = contexts.some(ctx => ctx.path === file.path);
            if (!alreadyIncluded && file.content) {
                contexts.push({
                    type: 'file',
                    path: file.path,
                    content: file.content,
                    source: file.source || 'context-panel'
                });
            }
        });
    }

    return contexts;
};


export const useSwitchToPath = (
    windowId: string,
    currentPath: string | null,
    rootLayoutNode: any,
    serializeWorkspace: () => any,
    saveWorkspaceToStorage: (path: string, data: any) => void,
    setRootLayoutNode: (node: any) => void,
    setActiveContentPaneId: (id: string | null) => void,
    contentDataRef: React.MutableRefObject<any>,
    setActiveConversationId: (id: string | null) => void,
    setCurrentFile: (file: string | null) => void,
    setCurrentPath: (path: string) => void
) => {
    return useCallback(async (newPath: string) => {
        if (newPath === currentPath) return;

        console.log(`[Window ${windowId}] Switching from ${currentPath} to ${newPath}`);

        // Save current workspace before leaving
        if (currentPath && rootLayoutNode) {
            const workspaceData = serializeWorkspace();
            if (workspaceData) {
                saveWorkspaceToStorage(currentPath, workspaceData);
                console.log(`[Window ${windowId}] Saved workspace for ${currentPath}`);
            }
        }

        // Clear current state
        setRootLayoutNode(null);
        setActiveContentPaneId(null);
        contentDataRef.current = {};
        setActiveConversationId(null);
        setCurrentFile(null);

        // THIS IS THE KEY PART - Actually set the new path
        setCurrentPath(newPath);
    }, [windowId, currentPath, rootLayoutNode, serializeWorkspace, saveWorkspaceToStorage, setRootLayoutNode, setActiveContentPaneId, contentDataRef, setActiveConversationId, setCurrentFile, setCurrentPath]);
};

export const useDebounce = (value: any, delay: number) => {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);
        return () => clearTimeout(handler);
    }, [value, delay]);
    return debouncedValue;
};



export const useAIEditModalStreamHandlers = (
    aiEditModal: any,
    setAiEditModal: (modal: any) => void,
    setPendingMemories: (memories: any) => void,
    setMemoryApprovalModal: (modal: any) => void,
    setError: (error: string) => void,
    parseAgenticResponse: (response: string, contexts: any[]) => any[],
    contentDataRef: React.MutableRefObject<any>
) => {
    return useEffect(() => {
        if (!aiEditModal.isOpen || !aiEditModal.isLoading) return;

        const currentStreamId = aiEditModal.streamId;

        const handleAIStreamData = (_: any, { streamId, chunk }: any) => {
            if (streamId !== currentStreamId) return;

            try {
                let content = '';
                if (typeof chunk === 'string') {
                    if (chunk.startsWith('data:')) {
                        const dataContent = chunk.replace(/^data:\s*/, '').trim();
                        if (dataContent === '[DONE]') {
                            return;
                        }
                        if (dataContent) {
                            const parsed = JSON.parse(dataContent);
                            if (parsed.type === 'memory_approval') {
                                setPendingMemories((prev: any) => [...prev, ...parsed.memories]);
                                setMemoryApprovalModal({
                                    isOpen: true,
                                    memories: parsed.memories
                                });
                                return;
                            }

                            content = parsed.choices?.[0]?.delta?.content || '';
                        }
                    } else {
                        content = chunk;
                    }
                } else if (chunk && chunk.choices) {
                    content = chunk.choices[0]?.delta?.content || '';
                }

                if (content) {
                    setAiEditModal((prev: any) => ({
                        ...prev,
                        aiResponse: (prev.aiResponse || '') + content
                    }));
                }
            } catch (err) {
                console.error('Error processing AI edit stream chunk:', err);
            }
        };

        const handleAIStreamComplete = async (_: any, { streamId }: any) => {
            if (streamId !== currentStreamId) return;

            // First, update isLoading to false, and keep the raw aiResponse
            setAiEditModal((prev: any) => ({
                ...prev,
                isLoading: false,
            }));

            // Now, parse the full aiResponse to get proposedChanges
            const latestAiEditModal = aiEditModal;
            console.log('handleAIStreamComplete: Full AI Response for parsing:', latestAiEditModal.aiResponse);

            if (latestAiEditModal.type === 'agentic' && latestAiEditModal.aiResponse) {
                const contexts = gatherWorkspaceContext(contentDataRef).filter((c: any) => c.type === 'file');
                const proposedChanges = parseAgenticResponse(latestAiEditModal.aiResponse, contexts);

                setAiEditModal((prev: any) => ({
                    ...prev,
                    proposedChanges: proposedChanges,
                    showDiff: proposedChanges.length > 0,
                }));
                console.log('handleAIStreamComplete: Proposed changes set:', proposedChanges);
            }
        };

        const handleAIStreamError = (_: any, { streamId, error }: any) => {
            if (streamId !== currentStreamId) return;

            console.error('AI edit stream error:', error);
            setError(error);
            setAiEditModal((prev: any) => ({ ...prev, isLoading: false }));
        };

        const cleanupStreamData = window.api.onStreamData(handleAIStreamData);
        const cleanupStreamComplete = window.api.onStreamComplete(handleAIStreamComplete);
        const cleanupStreamError = window.api.onStreamError(handleAIStreamError);

        return () => {
            cleanupStreamData();
            cleanupStreamComplete();
            cleanupStreamError();
        };
    }, [aiEditModal.isOpen, aiEditModal.isLoading, aiEditModal.streamId, aiEditModal.aiResponse, setAiEditModal, setPendingMemories, setMemoryApprovalModal, setError, parseAgenticResponse, contentDataRef]);
};


export const handleMemoryDecision = async (
    memoryId: string,
    decision: string,
    setPendingMemories: (fn: (prev: any[]) => any[]) => void,
    setError: (error: string) => void,
    finalMemory: any = null
) => {
    try {
        await window.api.approveMemory({
            memory_id: memoryId,
            decision: decision,
            final_memory: finalMemory
        });

        setPendingMemories(prev => prev.filter(m => m.memory_id !== memoryId));
    } catch (err: any) {
        console.error('Error processing memory decision:', err);
        setError(err.message);
    }
};

export const handleBatchMemoryProcess = (
    memories: any[],
    decisions: Record<string, any>,
    handleMemoryDecisionFn: (memoryId: string, decision: string, finalMemory?: any) => Promise<void>,
    setMemoryApprovalModal: (modal: any) => void
) => {
    memories.forEach(memory => {
        const decision = decisions[memory.memory_id];
        if (decision) {
            handleMemoryDecisionFn(memory.memory_id, decision.decision, decision.final_memory);
        }
    });
    setMemoryApprovalModal({ isOpen: false, memories: [] });
};

export const toggleTheme = (setIsDarkMode: (fn: (prev: boolean) => boolean) => void) => {
    setIsDarkMode((prev) => !prev);
};

export const loadDefaultPath = async (
    setCurrentPath: (path: string) => void,
    callback?: (path: string) => void
) => {
    try {
        const data = await window.api.loadGlobalSettings();
        const defaultFolder = data?.global_settings?.default_folder;
        if (defaultFolder) {
            setCurrentPath(defaultFolder);
            if (callback && typeof callback === 'function') {
                callback(defaultFolder);
            }
        }
        return defaultFolder;
    } catch (error) {
        console.error('Error loading default path:', error);
        return null;
    }
};


export const fetchModels = async (
    currentPath: string | null,
    setModelsLoading: (loading: boolean) => void,
    setModelsError: (error: string | null) => void,
    setAvailableModels: (models: any[]) => void
) => {
    if (!currentPath) return [];
    setModelsLoading(true);
    setModelsError(null);
    try {
        const response = await window.api.getAvailableModels(currentPath);
        if (response?.models && Array.isArray(response.models)) {
            setAvailableModels(response.models);
            return response.models;
        } else {
            throw new Error(response?.error || "Invalid models response");
        }
    } catch (err: any) {
        console.error('Error fetching models:', err);
        setModelsError(err.message);
        setAvailableModels([]);
        return [];
    } finally {
        setModelsLoading(false);
    }
};
export const loadConversations = async (
    dirPath: string,
    activeConversationId: string | null,
    setDirectoryConversations: (conversations: any[]) => void,
    contentDataRef: React.MutableRefObject<any>,
    initialLoadComplete: React.MutableRefObject<boolean>,
    handleConversationSelect: (id: string) => Promise<void>,
    setError: (error: string) => void
) => {
    let currentActiveId = activeConversationId;
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

        formattedConversations.sort((a: any, b: any) =>
            new Date(b.last_message_timestamp).getTime() - new Date(a.last_message_timestamp).getTime()
        );

        setDirectoryConversations(formattedConversations);

        // Check if any conversation is already open in a pane
        const hasOpenConversation = Object.values(contentDataRef.current).some(
            (paneData: any) => paneData?.contentType === 'chat' && paneData?.contentId
        );

        // Only auto-select if conditions are met
        const activeExists = formattedConversations.some((c: any) => c.id === currentActiveId);

        if (!activeExists && !hasOpenConversation && initialLoadComplete.current) {
            if (formattedConversations.length > 0) {
                await handleConversationSelect(formattedConversations[0].id);
            }
        } else if (!currentActiveId && !hasOpenConversation && formattedConversations.length > 0 && initialLoadComplete.current) {
            await handleConversationSelect(formattedConversations[0].id);
        } else {
            console.log('[LOAD_CONVOS] Preserving existing conversation selection');
        }

    } catch (err: any) {
        console.error('Error loading conversations:', err);
        setError(err.message);
        setDirectoryConversations([]);
    }
};
export const loadDirectoryStructure = async (
    dirPath: string,
    setFolderStructure: (structure: any) => void,
    loadConversationsFn: (path: string) => Promise<void>,
    setError: (error: string) => void
) => {
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
        await loadConversationsFn(dirPath);
        return structureResult;
    } catch (err: any) {
        console.error('Error loading structure:', err);
        setError(err.message);
        setFolderStructure({ error: err.message });
        return { error: err.message };
    }
};

export const useHandleOpenFolderAsWorkspace = (
    currentPath: string | null,
    switchToPath: (path: string) => Promise<void>,
    setSidebarItemContextMenuPos: (pos: any) => void
) => {
    return useCallback(async (folderPath: string) => {
        if (folderPath === currentPath) {
            console.log("Already in this workspace, no need to switch!");
            setSidebarItemContextMenuPos(null);
            return;
        }
        console.log(`Opening folder as workspace: ${folderPath} 🔥`);
        await switchToPath(folderPath);
        setSidebarItemContextMenuPos(null);
    }, [currentPath, switchToPath, setSidebarItemContextMenuPos]);
};

export const goUpDirectory = async (
    currentPath: string | null,
    baseDir: string,
    switchToPath: (path: string) => Promise<void>,
    setError: (error: string) => void
) => {
    try {
        if (!currentPath || currentPath === baseDir) return;
        const newPath = await window.api.goUpDirectory(currentPath);
        await switchToPath(newPath);
    } catch (err: any) {
        console.error('Error going up directory:', err);
        setError(err.message);
    }
};

export const usePaneAwareStreamListeners = (
    config: any,
    listenersAttached: React.MutableRefObject<boolean>,
    streamToPaneRef: React.MutableRefObject<Record<string, string>>,
    contentDataRef: React.MutableRefObject<any>,
    setRootLayoutNode: (fn: (prev: any) => any) => void,
    setIsStreaming: (streaming: boolean) => void,
    setAiEditModal: (modal: any) => void,
    parseAgenticResponse: (content: string, contexts: any[]) => any[],
    getConversationStats: (messages: any[]) => any,
    refreshConversations: () => Promise<void>,
    studioContext?: StudioContext | null
) => {
    return useEffect(() => {
        if (!config?.stream || listenersAttached.current) {
            return;
        }

        const handleStreamData = (_: any, { streamId: incomingStreamId, chunk }: any) => {
            const targetPaneId = streamToPaneRef.current[incomingStreamId];
            if (!targetPaneId) {
                return;
            }

            const paneData = contentDataRef.current[targetPaneId];
            if (!paneData || !paneData.chatMessages) return;

            // Helper to process a single parsed event
            const processEvent = (parsed: any, isDecisionFlag: boolean) => {
                let content = '', reasoningContent = '', toolCalls = null, isDecision = isDecisionFlag;

                if (parsed.choices?.[0]?.delta) {
                    isDecision = parsed.choices[0].delta.role === 'decision';
                    content = parsed.choices[0].delta.content || '';
                    reasoningContent = parsed.choices[0].delta.reasoning_content || '';
                }

                if (parsed.type) {
                    const type = parsed.type;
                    if (type === 'tool_execution_start' && Array.isArray(parsed.tool_calls)) {
                        toolCalls = parsed.tool_calls;
                    } else if ((type === 'tool_start' || type === 'tool_complete' || type === 'tool_result' || type === 'tool_error') && parsed.name) {
                        toolCalls = [{
                            id: parsed.id || '',
                            type: 'function',
                            function: {
                                name: parsed.name,
                                arguments: parsed.args ? (typeof parsed.args === 'object' ? JSON.stringify(parsed.args, null, 2) : String(parsed.args)) : ''
                            },
                            status: type === 'tool_error' ? 'error' : ((type === 'tool_complete' || type === 'tool_result') ? 'complete' : 'running'),
                            result_preview: parsed.result_preview || parsed.result || parsed.error || ''
                        }];
                    }
                } else if (!content && parsed.tool_calls) {
                    toolCalls = parsed.tool_calls;
                }

                return { content, reasoningContent, toolCalls, isDecision };
            };

            try {
                let content = '', reasoningContent = '', toolCalls = null, isDecision = false;

                if (typeof chunk === 'string') {
                    // Handle SSE format - may contain multiple events separated by \n\n
                    const events = chunk.split(/\n\n/).filter((e: string) => e.trim());

                    for (const event of events) {
                        const trimmedEvent = event.trim();
                        if (!trimmedEvent) continue;

                        if (trimmedEvent.startsWith('data:')) {
                            const dataContent = trimmedEvent.replace(/^data:\s*/, '').trim();
                            if (dataContent === '[DONE]') continue;
                            if (dataContent) {
                                try {
                                    const parsed = JSON.parse(dataContent);
                                    const result = processEvent(parsed, isDecision);
                                    content += result.content;
                                    reasoningContent += result.reasoningContent;
                                    if (result.toolCalls) toolCalls = result.toolCalls;
                                    isDecision = result.isDecision;
                                } catch (parseErr) {
                                    console.warn('[STREAM] Failed to parse data event:', dataContent, parseErr);
                                }
                            }
                        } else {
                            // Plain text chunk
                            content += trimmedEvent;
                        }
                    }
                } else if (chunk?.choices) {
                    isDecision = chunk.choices[0]?.delta?.role === 'decision';
                    content = chunk.choices[0]?.delta?.content || '';
                    reasoningContent = chunk.choices[0]?.delta?.reasoning_content || '';
                    toolCalls = chunk.tool_calls || null;
                } else if (chunk?.type) {
                    const type = chunk.type;
                    if (type === 'tool_execution_start' && Array.isArray(chunk.tool_calls)) {
                        toolCalls = chunk.tool_calls;
                    } else if ((type === 'tool_start' || type === 'tool_complete' || type === 'tool_result' || type === 'tool_error') && chunk.name) {
                        toolCalls = [{
                            id: chunk.id || '',
                            type: 'function',
                            function: {
                                name: chunk.name,
                                arguments: chunk.args ? (typeof chunk.args === 'object' ? JSON.stringify(chunk.args, null, 2) : String(chunk.args)) : ''
                            },
                            status: type === 'tool_error' ? 'error' : ((type === 'tool_complete' || type === 'tool_result') ? 'complete' : 'running'),
                            result_preview: chunk.result_preview || chunk.result || chunk.error || ''
                        }];
                    }
                }

                const msgIndex = paneData.chatMessages.allMessages.findIndex((m: any) => m.id === incomingStreamId);
                if (msgIndex !== -1) {
                    const message = paneData.chatMessages.allMessages[msgIndex];
                    message.role = isDecision ? 'decision' : 'assistant';
                    message.content = (message.content || '') + content;
                    message.reasoningContent = (message.reasoningContent || '') + reasoningContent;

                    // Initialize contentParts if not present
                    if (!message.contentParts) {
                        message.contentParts = [];
                    }

                    // Add text content to parts
                    if (content) {
                        const lastPart = message.contentParts[message.contentParts.length - 1];
                        if (lastPart && lastPart.type === 'text') {
                            lastPart.content += content;
                        } else {
                            message.contentParts.push({ type: 'text', content });
                        }
                    }

                    if (toolCalls) {
                        const normalizedCalls = (Array.isArray(toolCalls) ? toolCalls : []).map((tc: any) => ({
                            id: tc.id || '',
                            type: tc.type || 'function',
                            function: {
                                name: tc.function?.name || (tc.name || ''),
                                arguments: (() => {
                                    if (tc.args) {
                                        return typeof tc.args === 'object' ? JSON.stringify(tc.args, null, 2) : String(tc.args);
                                    }
                                    const argVal = tc.function?.arguments;
                                    if (typeof argVal === 'object') return JSON.stringify(argVal, null, 2);
                                    return argVal || '';
                                })()
                            },
                            status: tc.status,
                            result_preview: tc.result_preview || ''
                        }));

                        // Intercept and execute studio.* actions
                        if (studioContext) {
                            for (const tc of normalizedCalls) {
                                const funcName = tc.function?.name || '';
                                if (funcName.startsWith('studio.')) {
                                    const actionName = funcName.slice(7); // remove "studio."
                                    let args = {};
                                    try {
                                        args = JSON.parse(tc.function?.arguments || '{}');
                                    } catch (e) {
                                        console.warn('[STUDIO] Failed to parse arguments:', tc.function?.arguments);
                                    }

                                    // Execute the studio action asynchronously
                                    (async () => {
                                        try {
                                            const result = await executeStudioAction(actionName, args, studioContext);

                                            // Update the tool call with the result
                                            tc.status = result.success ? 'complete' : 'error';
                                            tc.result_preview = JSON.stringify(result, null, 2);

                                            // Also send result back to backend for agent continuation
                                            if (incomingStreamId) {
                                                try {
                                                    await fetch(`${BACKEND_URL}/api/studio/action_result`, {
                                                        method: 'POST',
                                                        headers: { 'Content-Type': 'application/json' },
                                                        body: JSON.stringify({
                                                            streamId: incomingStreamId,
                                                            toolId: tc.id,
                                                            result: result
                                                        })
                                                    });
                                                } catch (fetchErr) {
                                                    console.warn('[STUDIO] Failed to send result to backend:', fetchErr);
                                                }
                                            }

                                            // Force re-render to show updated status
                                            setRootLayoutNode(prev => ({ ...prev }));
                                        } catch (err) {
                                            console.error(`[STUDIO] Action ${actionName} failed:`, err);
                                            tc.status = 'error';
                                            tc.result_preview = `Error: ${err}`;
                                            setRootLayoutNode(prev => ({ ...prev }));
                                        }
                                    })();
                                }
                            }
                        }

                        const existing = message.toolCalls || [];
                        const merged = [...existing];
                        normalizedCalls.forEach((tc: any) => {
                            const idx = merged.findIndex((mtc: any) => mtc.id === tc.id || mtc.function.name === tc.function.name);
                            if (idx >= 0) {
                                const existingTc = merged[idx];
                                const newArgs = tc.function?.arguments;
                                const shouldReplaceArgs = newArgs && String(newArgs).trim().length > 0;
                                merged[idx] = {
                                    ...existingTc,
                                    ...tc,
                                    function: {
                                        name: tc.function?.name || existingTc.function?.name || '',
                                        arguments: shouldReplaceArgs ? newArgs : (existingTc.function?.arguments || '')
                                    }
                                };
                                // Update the tool call in contentParts too
                                const partIdx = message.contentParts.findIndex((p: any) =>
                                    p.type === 'tool_call' && (p.call.id === tc.id || p.call.function?.name === tc.function?.name)
                                );
                                if (partIdx >= 0) {
                                    message.contentParts[partIdx].call = merged[idx];
                                }
                            } else {
                                merged.push(tc);
                                // Add tool call to contentParts at current position
                                message.contentParts.push({ type: 'tool_call', call: tc });
                            }
                        });
                        message.toolCalls = merged;
                    }

                    paneData.chatMessages.messages = paneData.chatMessages.allMessages.slice(-(paneData.chatMessages.displayedMessageCount || 20));
                    setRootLayoutNode(prev => ({ ...prev }));
                }
            } catch (err) {
                console.error('[REACT] Error processing stream chunk:', err, 'Raw chunk:', chunk);
            }
        };

        const handleStreamComplete = async (_: any, { streamId: completedStreamId }: any = {}) => {
            const targetPaneId = streamToPaneRef.current[completedStreamId];
            if (targetPaneId) {
                const paneData = contentDataRef.current[targetPaneId];
                if (paneData?.chatMessages) {
                    const msgIndex = paneData.chatMessages.allMessages.findIndex((m: any) => m.id === completedStreamId);
                    if (msgIndex !== -1) {
                        const msg = paneData.chatMessages.allMessages[msgIndex];
                        msg.isStreaming = false;
                        msg.streamId = null;

                        const recentUserMsgs = paneData.chatMessages.allMessages.filter((m: any) => m.role === 'user').slice(-3);
                        const wasAgentMode = recentUserMsgs.some((m: any) => m.executionMode === 'tool_agent');

                        if (wasAgentMode) {
                            const contexts = gatherWorkspaceContext(contentDataRef).filter((c: any) => c.type === 'file');
                            const proposedChanges = parseAgenticResponse(msg.content, contexts);

                            if (proposedChanges.length > 0) {
                                setAiEditModal({
                                    isOpen: true,
                                    type: 'agentic',
                                    proposedChanges: proposedChanges,
                                    isLoading: false,
                                    selectedText: '',
                                    selectionStart: 0,
                                    selectionEnd: 0,
                                    aiResponse: '',
                                    showDiff: false
                                });
                            } else {
                                console.warn('Agent mode but no changes detected. Response format may be wrong.');
                            }
                        }

                        // Auto-TTS if user used voice input
                        const wasVoiceInput = recentUserMsgs.length > 0 && recentUserMsgs[recentUserMsgs.length - 1]?.wasVoiceInput;
                        if (wasVoiceInput && msg.content) {
                            triggerAutoTTS(msg.content);
                        }
                    }
                    paneData.chatStats = getConversationStats(paneData.chatMessages.allMessages);
                }
                delete streamToPaneRef.current[completedStreamId];
            }

            if (Object.keys(streamToPaneRef.current).length === 0) {
                setIsStreaming(false);
            }

            setRootLayoutNode(prev => ({ ...prev }));
            await refreshConversations();
        };

        const handleStreamError = (_: any, { streamId: errorStreamId, error }: any = {}) => {
            const targetPaneId = streamToPaneRef.current[errorStreamId];
            if (targetPaneId) {
                const paneData = contentDataRef.current[targetPaneId];
                if (paneData?.chatMessages) {
                    const msgIndex = paneData.chatMessages.allMessages.findIndex((m: any) => m.id === errorStreamId);
                    if (msgIndex !== -1) {
                        const message = paneData.chatMessages.allMessages[msgIndex];
                        message.content += `\n\n[STREAM ERROR: ${error}]`;
                        message.type = 'error';
                        message.isStreaming = false;
                    }
                }
                delete streamToPaneRef.current[errorStreamId];
            }

            if (Object.keys(streamToPaneRef.current).length === 0) {
                setIsStreaming(false);
            }
            setRootLayoutNode(prev => ({ ...prev }));
        };

        const cleanupStreamData = window.api.onStreamData(handleStreamData);
        const cleanupStreamComplete = window.api.onStreamComplete(handleStreamComplete);
        const cleanupStreamError = window.api.onStreamError(handleStreamError);

        // Safety net: periodically check for stale streams that never received stream-complete
        // This handles cases where the backend fails to send completion (e.g., sender destroyed, connection drop)
        const staleStreamInterval = setInterval(() => {
            const activeStreams = Object.keys(streamToPaneRef.current);
            if (activeStreams.length === 0) return;

            for (const streamId of activeStreams) {
                const targetPaneId = streamToPaneRef.current[streamId];
                if (!targetPaneId) continue;
                const paneData = contentDataRef.current[targetPaneId];
                if (!paneData?.chatMessages) continue;
                const msg = paneData.chatMessages.allMessages.find((m: any) => m.id === streamId);
                if (!msg || !msg.isStreaming) {
                    // Stream ref exists but message isn't streaming - clean up orphan
                    delete streamToPaneRef.current[streamId];
                    continue;
                }
                // If the message has content but hasn't updated in a while, the stream likely dropped
                // We track this by checking if the message timestamp is old
                const msgTime = new Date(msg.timestamp).getTime();
                const elapsed = Date.now() - msgTime;
                // If streaming for more than 5 minutes with content, mark as complete
                if (elapsed > 300000 && msg.content && msg.content.length > 0) {
                    console.warn(`[STREAM] Stale stream detected: ${streamId} (${Math.round(elapsed/1000)}s). Marking as complete.`);
                    msg.isStreaming = false;
                    msg.streamId = null;
                    delete streamToPaneRef.current[streamId];
                    if (Object.keys(streamToPaneRef.current).length === 0) {
                        setIsStreaming(false);
                    }
                    setRootLayoutNode(prev => ({ ...prev }));
                }
            }
        }, 30000); // Check every 30 seconds

        listenersAttached.current = true;

        return () => {
            cleanupStreamData();
            cleanupStreamComplete();
            cleanupStreamError();
            clearInterval(staleStreamInterval);
            listenersAttached.current = false;
        };
    }, [config, listenersAttached, streamToPaneRef, contentDataRef, setRootLayoutNode, setIsStreaming, setAiEditModal, parseAgenticResponse, getConversationStats, refreshConversations, studioContext]);
};





export const useTrackLastActiveChatPane = (
    activeContentPaneId: string | null,
    contentDataRef: React.MutableRefObject<any>,
    setLastActiveChatPaneId: (id: string) => void
) => {
    return useEffect(() => {
        if (activeContentPaneId) {
            const paneData = contentDataRef.current[activeContentPaneId];
            if (paneData && paneData.contentType === 'chat') {
                setLastActiveChatPaneId(activeContentPaneId);
            }
        }
    }, [activeContentPaneId, contentDataRef, setLastActiveChatPaneId]);
};

export const handleInterruptStream = async (
    activeContentPaneId: string | null,
    contentDataRef: React.MutableRefObject<any>,
    isStreaming: boolean,
    streamToPaneRef: React.MutableRefObject<Record<string, string>>,
    setIsStreaming: (streaming: boolean) => void,
    setRootLayoutNode: (fn: (prev: any) => any) => void
) => {
    const activePaneData = contentDataRef.current[activeContentPaneId || ''];
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


export const handleRenameFile = async (
    nodeId: string,
    oldPath: string,
    editedFileName: string,
    setRenamingPaneId: (id: string | null) => void,
    contentDataRef: React.MutableRefObject<any>,
    loadDirectoryStructureFn: (path: string) => Promise<void>,
    currentPath: string | null,
    setRootLayoutNode: (fn: (prev: any) => any) => void,
    setError: (error: string) => void
) => {
    if (!editedFileName.trim() || editedFileName === getFileName(oldPath)) {
        setRenamingPaneId(null);
        return;
    }

    const dirPath = oldPath.substring(0, oldPath.lastIndexOf('/'));
    const newPath = `${dirPath}/${editedFileName}`;

    try {
        const response = await window.api.renameFile(oldPath, newPath);
        if (response?.error) throw new Error(response.error);

        // Update contentData for the pane
        if (contentDataRef.current[nodeId]) {
            contentDataRef.current[nodeId].contentId = newPath;
        }

        // Reload directory structure
        if (currentPath) {
            await loadDirectoryStructureFn(currentPath);
        }

        // Force re-render
        setRootLayoutNode(p => ({ ...p }));

    } catch (err: any) {
        console.error("Error renaming file:", err);
        setError(`Failed to rename: ${err.message}`);
    } finally {
        setRenamingPaneId(null);
    }
};
export const getThumbnailIcon = (fileName: string, fileType?: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    const iconProps = { size: 20, className: "flex-shrink-0" };
    if (fileType?.startsWith('image/')) return null;
    switch(ext) {
        case 'pdf': return <FileText {...iconProps} className="text-red-500" />;
        case 'csv': case 'xlsx': case 'xls': return <BarChart3 {...iconProps} className="text-green-500" />;
        case 'json': return <FileJson {...iconProps} className="text-orange-400" />;
        default: return <File {...iconProps} className="text-gray-400" />;
    }
};

export const createToggleMessageSelectionMode = (
    setMessageSelectionMode: (fn: (prev: boolean) => boolean) => void,
    setSelectedMessages: (set: Set<any>) => void
) => {
    return () => {
        setMessageSelectionMode(prev => !prev);
        setSelectedMessages(new Set());
    };
};

// Layout navigation utility functions
export const findNodeByPath = (node: any, path: number[]): any => {
    if (!node || !path) return null;
    let currentNode = node;
    for (const index of path) {
        if (currentNode && currentNode.children && currentNode.children[index]) {
            currentNode = currentNode.children[index];
        } else {
            return null;
        }
    }
    return currentNode;
};

export const findNodePath = (node: any, id: string, currentPath: number[] = []): number[] | null => {
    if (!node) return null;
    if (node.id === id) return currentPath;
    if (node.type === 'split') {
        for (let i = 0; i < node.children.length; i++) {
            const result = findNodePath(node.children[i], id, [...currentPath, i]);
            if (result) return result;
        }
    }
    return null;
};

