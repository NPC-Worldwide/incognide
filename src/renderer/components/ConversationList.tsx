import React, { useState } from 'react';
import { File, MessageSquarePlus, ListFilter } from 'lucide-react';

const ConversationList = ({ conversations, onConversationSelect, activeConversationId }) => {
    const [selectedConvos, setSelectedConvos] = useState(new Set());
    const [contextMenuPos, setContextMenuPos] = useState(null);
    const [lastClickedIndex, setLastClickedIndex] = useState(null);

    const handleClick = (conv, e) => {
        const currentIndex = conversations.findIndex(c => c.id === conv.id);

        if (e.shiftKey && lastClickedIndex !== null) {

            e.preventDefault();
            e.stopPropagation();
            const start = Math.min(lastClickedIndex, currentIndex);
            const end = Math.max(lastClickedIndex, currentIndex);
            const newSelected = new Set(selectedConvos);

            for (let i = start; i <= end; i++) {
                if (conversations[i]) {
                    newSelected.add(conversations[i].id);
                }
            }
            setSelectedConvos(newSelected);

            onConversationSelect(conv.id);
        } else if (e.ctrlKey || e.metaKey) {

            e.preventDefault();
            e.stopPropagation();
            const newSelected = new Set(selectedConvos);
            if (newSelected.has(conv.id)) {
                newSelected.delete(conv.id);
            } else {
                newSelected.add(conv.id);
            }
            setSelectedConvos(newSelected);
            setLastClickedIndex(currentIndex);

        } else {

            setSelectedConvos(new Set([conv.id]));
            onConversationSelect(conv.id);
            setLastClickedIndex(currentIndex);
        }
    };

    const handleContextMenu = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenuPos({ x: e.clientX, y: e.clientY });
    };

    const handleClickOutside = (e) => {
        if (contextMenuPos) {
            setContextMenuPos(null);
        }
    };

    React.useEffect(() => {
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, [contextMenuPos]);

    return (
        <div onContextMenu={handleContextMenu} className="relative">
            {conversations.map((conv) => {
                const isSelected = selectedConvos.has(conv.id);

                return (
                    <button
                        key={conv.id}
                        onClick={(e) => handleClick(conv, e)}
                        onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (!selectedConvos.has(conv.id)) {
                                setSelectedConvos(new Set([conv.id]));
                            }
                            setContextMenuPos({ x: e.clientX, y: e.clientY });
                        }}
                        className={`flex items-center gap-2 px-2 py-1 w-full theme-hover text-left transition-all duration-200
                            ${isSelected ? 'conversation-selected' : 'theme-text-primary'}
                            ${activeConversationId === conv.id ? 'border-l-2 border-blue-500' : ''}`}
                    >
                        <File size={16} className="theme-text-muted" />
                        <div className="flex flex-col">
                            <span className="text-sm truncate">
                                {conv.title || conv.id}
                            </span>
                            <span className="text-xs theme-text-muted">
                                {new Date(conv.timestamp).toLocaleString()}
                            </span>
                        </div>
                    </button>
                );
            })}

            {contextMenuPos && (
                <div
                    className="fixed theme-bg-secondary theme-border border rounded shadow-lg py-1 z-50"
                    style={{
                        top: contextMenuPos.y,
                        left: contextMenuPos.x
                    }}
                >
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setContextMenuPos(null);
                        }}
                        className="flex items-center gap-2 px-4 py-2 theme-hover w-full text-left theme-text-primary"
                    >
                        <MessageSquarePlus size={16} />
                        <span>Summarize Selected ({selectedConvos.size})</span>
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setContextMenuPos(null);
                        }}
                        className="flex items-center gap-2 px-4 py-2 theme-hover w-full text-left theme-text-primary"
                    >
                        <ListFilter size={16} />
                        <span>Custom Aggregation...</span>
                    </button>
                </div>
            )}
        </div>
    );
};

export default ConversationList;