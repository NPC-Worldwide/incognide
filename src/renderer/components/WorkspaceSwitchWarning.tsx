import React from 'react';
import { AlertTriangle, ExternalLink, ArrowRight, X } from 'lucide-react';

interface WorkspaceSwitchWarningProps {
    isOpen: boolean;
    onClose: () => void;
    currentPath: string;
    newPath: string;
    activePaneCount: number;
    hasTerminals: boolean;
    hasChats: boolean;
    onSwitchAnyway: () => void;
    onOpenInNewWindow: () => void;
}

export const WorkspaceSwitchWarning: React.FC<WorkspaceSwitchWarningProps> = ({
    isOpen,
    onClose,
    currentPath,
    newPath,
    activePaneCount,
    hasTerminals,
    hasChats,
    onSwitchAnyway,
    onOpenInNewWindow,
}) => {
    if (!isOpen) return null;

    const getFolderName = (path: string) => {
        const parts = path.split(/[\\/]/).filter(Boolean);
        return parts[parts.length - 1] || path;
    };

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-md">
                {/* Header */}
                <div className="flex items-center gap-3 p-4 border-b border-gray-700">
                    <div className="p-2 bg-amber-500/20 rounded-lg">
                        <AlertTriangle size={24} className="text-amber-400" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-white">Switch Workspace?</h2>
                        <p className="text-sm text-gray-400">You have active sessions</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="ml-auto p-1.5 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-4 space-y-4">
                    <div className="text-sm text-gray-300">
                        Switching from <span className="font-medium text-white">{getFolderName(currentPath)}</span> to{' '}
                        <span className="font-medium text-white">{getFolderName(newPath)}</span> will affect:
                    </div>

                    <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm">
                            <span className="w-6 h-6 flex items-center justify-center bg-blue-500/20 rounded text-blue-400 text-xs font-bold">
                                {activePaneCount}
                            </span>
                            <span className="text-gray-300">open pane{activePaneCount !== 1 ? 's' : ''}</span>
                        </div>
                        {hasTerminals && (
                            <div className="flex items-center gap-2 text-sm text-amber-400">
                                <AlertTriangle size={14} />
                                <span>Terminal sessions will be disconnected</span>
                            </div>
                        )}
                        {hasChats && (
                            <div className="flex items-center gap-2 text-sm text-gray-400">
                                <span className="w-4" />
                                <span>Chat context will change to new workspace</span>
                            </div>
                        )}
                    </div>

                    <div className="bg-gray-800 rounded-lg p-3 text-xs text-gray-400">
                        Your workspace state will be saved and can be restored later.
                    </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3 p-4 border-t border-gray-700">
                    <button
                        onClick={onOpenInNewWindow}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                    >
                        <ExternalLink size={16} />
                        Open in New Window
                    </button>
                    <button
                        onClick={onSwitchAnyway}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                    >
                        <ArrowRight size={16} />
                        Switch Anyway
                    </button>
                </div>
            </div>
        </div>
    );
};

export default WorkspaceSwitchWarning;
