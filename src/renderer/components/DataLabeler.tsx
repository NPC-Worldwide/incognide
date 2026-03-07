import React, { useState, useEffect } from 'react';
import { Brain, Tag, Activity, X } from 'lucide-react';
import MemoryManagement from './MemoryManagement';
import ActivityIntelligence from './ActivityIntelligence';
import { MessageLabel, ConversationLabel } from './MessageLabeling';
import LabeledDataManager from './LabeledDataManager';

interface DataLabelerProps {
    isOpen?: boolean;
    onClose?: () => void;
    isPane?: boolean;
    messageLabels: { [key: string]: MessageLabel };
    setMessageLabels: React.Dispatch<React.SetStateAction<{ [key: string]: MessageLabel }>>;
    conversationLabels: { [key: string]: ConversationLabel };
    setConversationLabels: React.Dispatch<React.SetStateAction<{ [key: string]: ConversationLabel }>>;
}

const DataLabeler: React.FC<DataLabelerProps> = ({
    isOpen = true,
    onClose,
    isPane = false,
    messageLabels,
    setMessageLabels,
    conversationLabels,
    setConversationLabels
}) => {
    const [activeTab, setActiveTab] = useState<'memory' | 'labeled' | 'activity'>('memory');

    useEffect(() => {
        if (isPane || !isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && onClose) onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isPane, isOpen, onClose]);

    if (!isPane && !isOpen) return null;

    const content = (
        <div className={`flex flex-col h-full ${isPane ? '' : 'max-h-[90vh]'}`}>
            <div className="flex items-center justify-between border-b theme-border flex-shrink-0">
                <div className="flex">
                    <button
                        onClick={() => setActiveTab('memory')}
                        className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                            activeTab === 'memory'
                                ? 'border-orange-500 text-orange-400'
                                : 'border-transparent text-gray-400 hover:text-white'
                        }`}
                    >
                        <Brain size={16} />
                        Memory
                    </button>
                    <button
                        onClick={() => setActiveTab('labeled')}
                        className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                            activeTab === 'labeled'
                                ? 'border-blue-500 text-blue-400'
                                : 'border-transparent text-gray-400 hover:text-white'
                        }`}
                    >
                        <Tag size={16} />
                        Labels
                    </button>
                    <button
                        onClick={() => setActiveTab('activity')}
                        className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                            activeTab === 'activity'
                                ? 'border-purple-500 text-purple-400'
                                : 'border-transparent text-gray-400 hover:text-white'
                        }`}
                    >
                        <Activity size={16} />
                        Activity
                    </button>
                </div>
                {!isPane && onClose && (
                    <button onClick={onClose} className="p-3 hover:bg-gray-700 transition-colors">
                        <X size={18} />
                    </button>
                )}
            </div>

            <div className="flex-1 overflow-auto">
                {activeTab === 'memory' && (
                    <MemoryManagement isModal={false} />
                )}
                {activeTab === 'labeled' && (
                    <div className="p-4">
                        <LabeledDataContent
                            messageLabels={messageLabels}
                            setMessageLabels={setMessageLabels}
                            conversationLabels={conversationLabels}
                            setConversationLabels={setConversationLabels}
                        />
                    </div>
                )}
                {activeTab === 'activity' && (
                    <ActivityIntelligence isModal={false} />
                )}
            </div>
        </div>
    );

    if (isPane) {
        return content;
    }

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100]" onClick={onClose}>
            <div
                className="theme-bg-secondary rounded-lg shadow-xl w-[95vw] max-w-6xl max-h-[90vh] overflow-hidden flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                {content}
            </div>
        </div>
    );
};

const LabeledDataContent: React.FC<{
    messageLabels: { [key: string]: MessageLabel };
    setMessageLabels: React.Dispatch<React.SetStateAction<{ [key: string]: MessageLabel }>>;
    conversationLabels: { [key: string]: ConversationLabel };
    setConversationLabels: React.Dispatch<React.SetStateAction<{ [key: string]: ConversationLabel }>>;
}> = ({ messageLabels, setMessageLabels, conversationLabels, setConversationLabels }) => {
    return (
        <LabeledDataManager
            isOpen={true}
            onClose={() => {}}
            isEmbedded={true}
            messageLabels={messageLabels}
            setMessageLabels={setMessageLabels}
            conversationLabels={conversationLabels}
            setConversationLabels={setConversationLabels}
        />
    );
};

export default DataLabeler;
