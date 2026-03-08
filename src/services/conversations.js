
export const loadConversations = async (api, dirPath) => {
  const normalizedPath = dirPath.replace(/\\/g, '/').replace(/\/$/, '');
  const response = await api.getConversations(normalizedPath);

  const formattedConversations = response?.conversations?.map(conv => ({
    id: conv.id,
    title: conv.preview?.split('\n')[0]?.substring(0, 30) || 'New Conversation',
    preview: conv.preview || 'No content',
    timestamp: conv.timestamp || Date.now(),
    last_message_timestamp: conv.last_message_timestamp || conv.timestamp || Date.now()
  })) || [];

  formattedConversations.sort((a, b) =>
    new Date(b.last_message_timestamp).getTime() - new Date(a.last_message_timestamp).getTime()
  );

  return formattedConversations;
};

export const createConversation = async (api, directoryPath) => {
  const conversation = await api.createConversation({ directory_path: directoryPath });
  if (!conversation || !conversation.id) {
    throw new Error("Failed to create conversation or received invalid data.");
  }

  return {
    id: conversation.id,
    title: 'New Conversation',
    preview: 'No content',
    timestamp: conversation.timestamp || new Date().toISOString()
  };
};

export const deleteConversation = async (api, conversationId) => {
  return await api.deleteConversation(conversationId);
};

export const getConversationMessages = async (api, conversationId) => {
  const msgs = await api.getConversationMessages(conversationId);
  return (msgs && Array.isArray(msgs))
    ? msgs.map(m => ({ ...m, id: m.id || Math.random().toString(36).substr(2, 9) }))
    : [];
};

export const getLastUsedInConversation = async (api, conversationId) => {
  return await api.getLastUsedInConversation(conversationId);
};

export const getLastUsedInDirectory = async (api, dirPath) => {
  return await api.getLastUsedInDirectory(dirPath);
};