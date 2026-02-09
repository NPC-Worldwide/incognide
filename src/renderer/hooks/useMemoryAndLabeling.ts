import { useState, useCallback, useMemo, useEffect } from 'react';
import { MessageLabelStorage, MessageLabel, ConversationLabel, ConversationLabelStorage } from '../components/MessageLabeling';

interface UseMemoryAndLabelingParams {
    currentPath: string;
}

export function useMemoryAndLabeling({ currentPath }: UseMemoryAndLabelingParams) {
    // Memory state
    const [pendingMemories, setPendingMemories] = useState([]);
    const [memoryApprovalModal, setMemoryApprovalModal] = useState({
        isOpen: false,
        memories: []
    });
    const [memories, setMemories] = useState<any[]>([]);
    const [memoryLoading, setMemoryLoading] = useState(false);
    const [memoryFilter, setMemoryFilter] = useState('all');
    const [memorySearchTerm, setMemorySearchTerm] = useState('');
    const [pendingMemoryCount, setPendingMemoryCount] = useState(0);
    const [kgGeneration, setKgGeneration] = useState<number | null>(null);

    // Message labeling state
    const [labelingModal, setLabelingModal] = useState<{ isOpen: boolean; message: any | null }>({ isOpen: false, message: null });
    const [messageLabels, setMessageLabels] = useState<{ [key: string]: MessageLabel }>(() => {
        const allLabels = MessageLabelStorage.getAll();
        const labelsMap: { [key: string]: MessageLabel } = {};
        allLabels.forEach(label => {
            labelsMap[label.messageId] = label;
        });
        return labelsMap;
    });

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

    // Load memories from DB
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

    // Fetch pending memory count and KG generation for status bar (30s polling)
    useEffect(() => {
        const fetchStatusBarData = async () => {
            try {
                const pendingResult = await (window as any).api?.memory_pending?.({
                    directory_path: currentPath,
                    limit: 100
                });
                if (pendingResult?.memories) {
                    setPendingMemoryCount(pendingResult.memories.length);
                }

                const kgResult = await (window as any).api?.kg_getStatus?.();
                if (kgResult?.generation !== undefined) {
                    setKgGeneration(kgResult.generation);
                }
            } catch (err) {
                console.error('Error fetching status bar data:', err);
            }
        };

        fetchStatusBarData();
        const interval = setInterval(fetchStatusBarData, 30000);
        return () => clearInterval(interval);
    }, [currentPath]);

    // Message labeling handlers
    const handleLabelMessage = useCallback((message: any) => {
        setLabelingModal({ isOpen: true, message });
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
            conversation: { id: conversationId, messages }
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

    return {
        // Memory state
        pendingMemories,
        setPendingMemories,
        memoryApprovalModal,
        setMemoryApprovalModal,
        memories,
        setMemories,
        memoryLoading,
        memoryFilter,
        setMemoryFilter,
        memorySearchTerm,
        setMemorySearchTerm,
        pendingMemoryCount,
        setPendingMemoryCount,
        kgGeneration,
        setKgGeneration,
        // Memory handlers
        loadMemories,
        filteredMemories,
        // Labeling state
        labelingModal,
        setLabelingModal,
        messageLabels,
        setMessageLabels,
        conversationLabelingModal,
        setConversationLabelingModal,
        conversationLabels,
        setConversationLabels,
        // Labeling handlers
        handleLabelMessage,
        handleSaveLabel,
        handleCloseLabelingModal,
        handleLabelConversation,
        handleSaveConversationLabel,
        handleCloseConversationLabelingModal,
    };
}
