import React from "react";

const Message = ({ message, isSelected, onSelect, isDarkMode }) => {
    const isHuman = message.role === 'human' || message.role === 'user';

    const renderContent = () => {

        if (message.content?.startsWith('data:image')) {
            return (
                <img
                    src={message.content}
                    alt="Attached image"
                    className="max-w-full h-auto rounded-lg border border-gray-700"
                />
            );
        }

        if (message.content?.includes('<img') || message.content?.includes('<p')) {
            return (
                <div
                    dangerouslySetInnerHTML={{ __html: message.content }}
                    className="prose prose-invert max-w-none"
                />
            );
        }

        return (
            <div className="whitespace-pre-wrap text-base leading-relaxed">
                {message.content}
            </div>
        );
    };

    return (
        <div
            className={`flex ${isHuman ? 'justify-end' : 'justify-start'} mb-4`}
            onClick={() => onSelect(message.message_id)}
        >
            <div
                className={`
                    max-w-[80%] rounded-lg px-4 py-3
                    ${isHuman
                        ? 'bg-blue-600 text-white'
                        : isDarkMode
                            ? 'bg-gray-700/90 text-gray-100'
                            : 'bg-white shadow-sm border border-gray-200'
                    }
                    ${isSelected ? 'ring-2 ring-blue-400' : ''}
                    hover:shadow-lg transition-all duration-200
                `}
            >
                <div className="text-sm mb-1 opacity-75 flex items-center gap-2">
                    <span>{isHuman ? 'You' : 'Assistant'}</span>
                    {!isHuman && message.npc && (
                        <span className="text-xs px-2 py-0.5 bg-gray-600 rounded">
                            NPC: {message.npc}
                        </span>
                    )}
                </div>

                {renderContent()}

                <div className="text-xs mt-2 opacity-50 flex items-center gap-2">
                    <span>{new Date(message.timestamp).toLocaleTimeString()}</span>
                    {!isHuman && (
                        <>
                            {message.model && (
                                <span className="border-l border-gray-500 pl-2">
                                    Model: {message.model}
                                </span>
                            )}
                            {message.provider && (
                                <span className="border-l border-gray-500 pl-2">
                                    Provider: {message.provider}
                                </span>
                            )}
                        </>
                    )}
                </div>

                {message.attachments && message.attachments.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                        {message.attachments.map((attachment, index) => (
                            <div
                                key={index}
                                className={`text-xs bg-gray-800 rounded px-2 py-1 ${attachment.path ? 'cursor-pointer hover:bg-gray-700' : ''}`}
                                onDoubleClick={() => attachment.path && (window as any).api?.openFile?.(attachment.path)}
                                title={attachment.path ? `Double-click to open: ${attachment.path}` : attachment.name}
                            >
                                📎 {attachment.name}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Message;