import React, { useState, useEffect } from 'react';
import { GitBranch, Globe, X } from 'lucide-react';
import KnowledgeGraphEditor from './KnowledgeGraphEditor';
import BrowserHistoryWeb from './BrowserHistoryWeb';

interface GraphViewerProps {
    isOpen?: boolean;
    onClose?: () => void;
    isPane?: boolean; // When true, renders as pane content (no modal wrapper)
    currentPath?: string;
}

const GraphViewer: React.FC<GraphViewerProps> = ({ isOpen = true, onClose, isPane = false, currentPath }) => {
    const [activeTab, setActiveTab] = useState<'knowledge' | 'browser'>('knowledge');

    // Escape key handler - only for modal mode
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
            {/* Header with tabs */}
            <div className="flex items-center justify-between border-b theme-border flex-shrink-0">
                <div className="flex">
                    <button
                        onClick={() => setActiveTab('knowledge')}
                        className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                            activeTab === 'knowledge'
                                ? 'border-green-500 text-green-400'
                                : 'border-transparent text-gray-400 hover:text-white'
                        }`}
                    >
                        <GitBranch size={16} />
                        Knowledge Graph
                    </button>

                </div>
                {!isPane && onClose && (
                    <button onClick={onClose} className="p-3 hover:bg-gray-700 transition-colors">
                        <X size={18} />
                    </button>
                )}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto">
                {activeTab === 'knowledge' && (
                    <KnowledgeGraphEditor isModal={false} />
                )}
                {activeTab === 'browser' && (
                    <BrowserHistoryWeb isModal={false} currentPath={currentPath} />
                )}
            </div>
        </div>
    );

    // If pane mode, just return content
    if (isPane) {
        return content;
    }

    // Modal mode
    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100]" onClick={onClose}>
            <div
                className="theme-bg-secondary rounded-lg shadow-xl w-[95vw] max-w-7xl max-h-[90vh] overflow-hidden flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                {content}
            </div>
        </div>
    );
};

export default GraphViewer;
