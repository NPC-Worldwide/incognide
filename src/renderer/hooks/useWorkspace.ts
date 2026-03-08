import { useState, useCallback } from 'react';
import { normalizePath, loadDirectoryStructure as loadDirectoryStructureUtil } from '../components/utils';

export function useWorkspace() {
    const [currentPath, setCurrentPath] = useState('');
    const [folderStructure, setFolderStructure] = useState({});
    const [baseDir, setBaseDir] = useState('');
    const [expandedFolders, setExpandedFolders] = useState(new Set());
    const [directoryConversations, setDirectoryConversations] = useState([]);
    const [activeConversationId, setActiveConversationId] = useState(null);
    const [currentFile, setCurrentFile] = useState(null);
    const [workspaces, setWorkspaces] = useState(new Map());
    const [isLoadingWorkspace, setIsLoadingWorkspace] = useState(false);
    const [windowId] = useState(() => {
        let id = sessionStorage.getItem('incognideWindowId');
        if (!id) {
            id = `window_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            sessionStorage.setItem('incognideWindowId', id);
        }
        console.log('[WINDOW_ID] Using window ID:', id);
        return id;
    });

    const WORKSPACES_STORAGE_KEY = 'incognideWorkspaces_v2';
    const ACTIVE_WINDOWS_KEY = 'incognideActiveWindows';
    const WINDOW_WORKSPACES_KEY = 'incognideWindowWorkspaces';
    const MAX_WORKSPACES = 50;

    const loadConversationsWithoutAutoSelect = useCallback(async (dirPath: string) => {
        try {
            const normalizedPath = normalizePath(dirPath);
            if (!normalizedPath) return;
            const response = await (window as any).api.getConversations(normalizedPath);
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
            setDirectoryConversations([]);
        }
    }, []);

    const loadDirectoryStructureWithoutConversationLoad = useCallback(async (dirPath: string) => {
        try {
            if (!dirPath) {
                console.error('No directory path provided');
                return {};
            }
            const structureResult = await (window as any).api.readDirectoryStructure(dirPath);
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
            setFolderStructure({ error: err.message });
            return { error: err.message };
        }
    }, [loadConversationsWithoutAutoSelect]);

    const loadDirectoryStructure = useCallback(async (dirPath: string) => {
        await loadDirectoryStructureUtil(
            dirPath,
            setFolderStructure,
            loadConversationsWithoutAutoSelect,
            () => {}
        );
    }, [loadConversationsWithoutAutoSelect]);

    return {

        currentPath, setCurrentPath,
        folderStructure, setFolderStructure,
        baseDir, setBaseDir,
        expandedFolders, setExpandedFolders,
        directoryConversations, setDirectoryConversations,
        activeConversationId, setActiveConversationId,
        currentFile, setCurrentFile,
        workspaces, setWorkspaces,
        isLoadingWorkspace, setIsLoadingWorkspace,
        windowId,

        WORKSPACES_STORAGE_KEY,
        ACTIVE_WINDOWS_KEY,
        WINDOW_WORKSPACES_KEY,
        MAX_WORKSPACES,

        loadConversationsWithoutAutoSelect,
        loadDirectoryStructureWithoutConversationLoad,
        loadDirectoryStructure,
    };
}
