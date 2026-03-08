    const getConversationStats = (messages) => {
        if (!messages || messages.length === 0) {
            return { messageCount: 0, inputTokens: 0, outputTokens: 0, totalCost: 0, models: new Set(), agents: new Set(), providers: new Set() };
        }

        const stats = messages.reduce((acc, msg) => {
            acc.inputTokens += (msg.input_tokens || 0);
            acc.outputTokens += (msg.output_tokens || 0);
            if (msg.cost) acc.totalCost += msg.cost;
            if (msg.role !== 'user') {
                if (msg.model) acc.models.add(msg.model);
                if (msg.npc) acc.agents.add(msg.npc);
                if (msg.provider) acc.providers.add(msg.provider);
            }
            return acc;
        }, { inputTokens: 0, outputTokens: 0, totalCost: 0, models: new Set(), agents: new Set(), providers: new Set() });

        return {
            messageCount: messages.length,
            ...stats
        };
    };

const renderAttachmentThumbnails = () => {
    if (uploadedFiles.length === 0) return null;
    return (
        <div className="px-2 pb-2">
            <div className="flex flex-wrap gap-2">
                {uploadedFiles.map((file, index) => (
                    <div key={file.id} className="relative group">
                        <div className="flex items-center gap-2 bg-gray-800 rounded-lg p-2 border border-gray-600 min-w-0">
                            <div className="w-10 h-10 rounded bg-gray-700 flex items-center justify-center flex-shrink-0">
                                {file.preview ?
                                    <img src={file.preview} alt={file.name} className="w-full h-full object-cover rounded" /> :
                                    getThumbnailIcon(file.name, file.type)}
                            </div>
                            <div className="flex flex-col min-w-0 flex-1">
                                <span className="text-xs text-gray-300 truncate font-medium" title={file.name}>{file.name}</span>
                                <span className="text-xs text-gray-500">{file.size ? `${Math.round(file.size / 1024)} KB` : ''}</span>
                            </div>
                            <button
                                onClick={() => setUploadedFiles(prev => prev.filter((_, i) => i !== index))}
                                className="flex-shrink-0 p-1 hover:bg-gray-600 rounded-full transition-colors opacity-0 group-hover:opacity-100"
                                title="Remove file"
                            >
                                <X size={14} className="text-gray-400" />
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

    const handleDeleteSelectedMessages = async () => {
    const selectedIds = Array.from(selectedMessages);
    if (selectedIds.length === 0) return;

    const activePaneData = contentDataRef.current[activeContentPaneId];
    if (!activePaneData || !activePaneData.chatMessages) {
        console.error("No active chat pane data found for message deletion.");
        return;
    }

    const conversationId = activePaneData.contentId;

    try {

        const messagesToDelete = activePaneData.chatMessages.allMessages.filter(
            msg => selectedIds.includes(msg.id || msg.timestamp)
        );

        console.log('Attempting to delete messages:', messagesToDelete.map(m => ({
            frontendId: m.id,
            message_id: m.message_id,
            timestamp: m.timestamp
        })));

        const deleteResults = await Promise.all(
            messagesToDelete.map(async msg => {
                const idToUse = msg.message_id || msg.id || msg.timestamp;
                console.log(`Deleting message with ID: ${idToUse}`);
                const result = await window.api.deleteMessage({
                    conversationId,
                    messageId: idToUse
                });
                return { ...result, frontendId: msg.id };
            })
        );

        console.log('Delete results:', deleteResults);

        const successfulDeletes = deleteResults.filter(r => r.success && r.rowsAffected > 0);
        if (successfulDeletes.length === 0) {
            setError("Failed to delete messages from database");
            console.error("No messages were deleted from DB");
            return;
        }

        activePaneData.chatMessages.allMessages = activePaneData.chatMessages.allMessages.filter(
            msg => !selectedIds.includes(msg.id || msg.timestamp)
        );
        activePaneData.chatMessages.messages = activePaneData.chatMessages.allMessages.slice(
            -activePaneData.chatMessages.displayedMessageCount
        );
        activePaneData.chatStats = getConversationStats(activePaneData.chatMessages.allMessages);

        setRootLayoutNode(prev => ({ ...prev }));
        setSelectedMessages(new Set());
        setMessageContextMenuPos(null);
        setMessageSelectionMode(false);

        console.log(`Successfully deleted ${successfulDeletes.length} of ${selectedIds.length} messages`);
    } catch (err) {
        console.error('Error deleting messages:', err);
        setError(err.message);
    }
};

const handleSummarizeAndStart = async () => {
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

            const newConversation = await createNewConversation();
            if (!newConversation) {
                throw new Error('Failed to create a new conversation for the summary.');
            }

            setActiveConversationId(newConversation.id);
            setCurrentConversation(newConversation);
            setMessages([]);
            setAllMessages([]);
            setDisplayedMessageCount(10);

            const newStreamId = generateId();
            streamIdRef.current = newStreamId;
            setIsStreaming(true);

            const selectedNpc = availableNPCs.find(npc => npc.value === currentNPC);

            const userMessage = {
                id: generateId(),
                role: 'user',
                content: fullPrompt,
                timestamp: new Date().toISOString(),
                type: 'message'
            };

            const assistantPlaceholderMessage = {
                id: newStreamId,
                role: 'assistant',
                content: '',
                reasoningContent: '',
                toolCalls: [],
                timestamp: new Date().toISOString(),
                streamId: newStreamId,
                model: currentModel,
                npc: currentNPC
            };

            setMessages([userMessage, assistantPlaceholderMessage]);
            setAllMessages([userMessage, assistantPlaceholderMessage]);

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
            console.error('Error summarizing and starting new conversation:', err);
            setError(err.message);
            setIsStreaming(false);
            streamIdRef.current = null;
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

        if (!activeConversationId) {
            await createNewConversation();
        }

        setInput(fullPrompt);

    } catch (err) {
        console.error('Error summarizing conversations for draft:', err);
        setError(err.message);
    } finally {
        setSelectedConvos(new Set());
    }
};
const handleSummarizeAndPrompt = async () => {
    const selectedIds = Array.from(selectedConvos);
    if (selectedIds.length === 0) return;
    setContextMenuPos(null);

    setPromptModal({
        isOpen: true,
        title: 'Custom Summary Prompt',
        message: `Enter a custom prompt for summarizing these ${selectedIds.length} conversation(s):`,
        defaultValue: 'Provide a detailed analysis of the key themes and insights from these conversations',
        onConfirm: async (customPrompt) => {
            try {
                const convosContentPromises = selectedIds.map(async (id, index) => {
                    const messages = await window.api.getConversationMessages(id);
                    if (!Array.isArray(messages)) {
                        return `Conversation ${index + 1} (ID: ${id}): [Error fetching content]`;
                    }
                    const messagesText = messages.map(msg => `${msg.role}: ${msg.content}`).join('\n');
                    return `Conversation ${index + 1} (ID: ${id}):\n---\n${messagesText}\n---`;
                });
                const convosContent = await Promise.all(convosContentPromises);

                const fullPrompt = `${customPrompt}\n\nConversations to analyze:\n\n` + convosContent.join('\n\n');

                const { conversation: newConversation, paneId: newPaneId } = await createNewConversation(true);
                if (!newConversation || !newPaneId) {
                    throw new Error('Failed to create new conversation');
                }

                const paneData = contentDataRef.current[newPaneId];
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
                console.error('Error processing custom summary:', err);
                setError(err.message);
                setIsStreaming(false);
            } finally {
                setSelectedConvos(new Set());
            }
        }
    });
};

const handleResendMessage = (messageToResend) => {
    if (isStreaming) {
        console.warn('Cannot resend while streaming');
        return;
    }

    setResendModal({
        isOpen: true,
        message: messageToResend,
        selectedModel: currentModel,
        selectedNPC: currentNPC
    });
};

const handleResendWithSettings = async (messageToResend, selectedModel, selectedNPC) => {
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
    let newStreamId = null;

    try {

        const messageIdToResend = messageToResend.id || messageToResend.timestamp;
        const allMessages = activePaneData.chatMessages.allMessages;
        const userMsgIndex = allMessages.findIndex(m =>
            (m.id || m.timestamp) === messageIdToResend
        );

        console.log('[RESEND] Found user message at index:', userMsgIndex);

        if (userMsgIndex !== -1) {

            const messagesToDelete = [];

            const userMsg = allMessages[userMsgIndex];
            if (userMsg.message_id || userMsg.id) {
                messagesToDelete.push(userMsg.message_id || userMsg.id);
            }

            if (userMsgIndex + 1 < allMessages.length &&
                allMessages[userMsgIndex + 1].role === 'assistant') {
                const assistantMsg = allMessages[userMsgIndex + 1];
                if (assistantMsg.message_id || assistantMsg.id) {
                    messagesToDelete.push(assistantMsg.message_id || assistantMsg.id);
                }
            }

            console.log('[RESEND] Messages to delete:', messagesToDelete);

            for (const msgId of messagesToDelete) {
                try {
                    const result = await window.api.deleteMessage({
                        conversationId,
                        messageId: msgId
                    });
                    console.log('[RESEND] Deleted message:', msgId, 'Result:', result);
                } catch (err) {
                    console.error('[RESEND] Error deleting message:', msgId, err);
                }
            }

            activePaneData.chatMessages.allMessages = allMessages.slice(0, userMsgIndex);
            activePaneData.chatMessages.messages = activePaneData.chatMessages.allMessages.slice(
                -activePaneData.chatMessages.displayedMessageCount
            );

            console.log('[RESEND] Messages after deletion:', activePaneData.chatMessages.allMessages.length);
        }

        newStreamId = generateId();
        streamToPaneRef.current[newStreamId] = activeContentPaneId;
        setIsStreaming(true);

        const selectedNpc = availableNPCs.find(npc => npc.value === selectedNPC);

        const newUserMessage = {
            id: generateId(),
            role: 'user',
            content: messageToResend.content,
            timestamp: new Date().toISOString(),
            attachments: messageToResend.attachments || [],
        };

        const assistantPlaceholderMessage = {
            id: newStreamId,
            role: 'assistant',
            content: '',
            isStreaming: true,
            timestamp: new Date().toISOString(),
            streamId: newStreamId,
            model: selectedModel,
            npc: selectedNPC,
        };

        activePaneData.chatMessages.allMessages.push(newUserMessage, assistantPlaceholderMessage);
        activePaneData.chatMessages.messages = activePaneData.chatMessages.allMessages.slice(
            -activePaneData.chatMessages.displayedMessageCount
        );

        console.log('[RESEND] Added new messages, total now:', activePaneData.chatMessages.allMessages.length);

        setRootLayoutNode(prev => ({ ...prev }));

        const selectedModelObj = availableModels.find(m => m.value === selectedModel);
        const providerToUse = selectedModelObj ? selectedModelObj.provider : currentProvider;

        await window.api.executeCommandStream({
            commandstr: messageToResend.content,
            currentPath,
            conversationId: conversationId,
            model: selectedModel,
            provider: providerToUse,
            npc: selectedNpc ? selectedNpc.name : selectedNPC,
            npcSource: selectedNpc ? selectedNpc.source : 'global',
            attachments: messageToResend.attachments?.map(att => ({
                name: att.name, path: att.path, size: att.size, type: att.type
            })) || [],
            streamId: newStreamId,
    isResend: true

        });

    } catch (err) {
        console.error('[RESEND] Error resending message:', err);
        setError(err.message);

        if (activePaneData.chatMessages) {
            const msgIndex = activePaneData.chatMessages.allMessages.findIndex(m => m.id === newStreamId);
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
