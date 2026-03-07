import React, { useState, useEffect, useCallback } from 'react';
import { Brain, RefreshCw, Zap, Activity, FileText, Globe, Terminal, Eye, Lightbulb, BarChart3, ChevronsRight } from 'lucide-react';

interface ActivityIntelligenceProps {
    isModal?: boolean;
    onClose?: () => void;
}

const ActivityIntelligence: React.FC<ActivityIntelligenceProps> = ({ isModal = false, onClose }) => {
    const [activityData, setActivityData] = useState<any[]>([]);
    const [activityPredictions, setActivityPredictions] = useState<any[]>([]);
    const [activityStats, setActivityStats] = useState<any>(null);
    const [activityLoading, setActivityLoading] = useState(false);
    const [activityTraining, setActivityTraining] = useState(false);
    const [activityTab, setActivityTab] = useState<'predictions' | 'history' | 'patterns'>('predictions');

    const loadActivityData = useCallback(async () => {
        setActivityLoading(true);
        try {
            const predResponse = await (window as any).api?.getActivityPredictions?.();
            if (predResponse && !predResponse.error) {
                setActivityPredictions(predResponse.predictions || []);
                setActivityStats(predResponse.stats || null);
                setActivityData(predResponse.recentActivities || []);
            }
        } catch (err) {
            console.error('Failed to load activity data:', err);
        }
        setActivityLoading(false);
    }, []);

    const handleTrainActivityModel = async () => {
        setActivityTraining(true);
        try {
            await (window as any).api?.trainActivityModel?.();
            await loadActivityData();
        } catch (err) {
            console.error('Failed to train activity model:', err);
        }
        setActivityTraining(false);
    };

    const getActivityIcon = (type: string) => {
        switch (type) {
            case 'file_open':
            case 'file_edit':
                return <FileText size={14} className="text-blue-400" />;
            case 'website_visit':
                return <Globe size={14} className="text-green-400" />;
            case 'terminal_command':
                return <Terminal size={14} className="text-yellow-400" />;
            case 'pane_open':
            case 'pane_close':
                return <Eye size={14} className="text-purple-400" />;
            case 'chat_message':
                return <Activity size={14} className="text-cyan-400" />;
            default:
                return <Activity size={14} className="text-gray-400" />;
        }
    };

    useEffect(() => {
        loadActivityData();
    }, [loadActivityData]);

    useEffect(() => {
        if (!isModal) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && onClose) onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isModal, onClose]);

    const content = (
        <div className="p-4">
            <div className="flex justify-between items-center mb-4">
                <h4 className="text-lg font-semibold flex items-center gap-3 text-white">
                    <Brain className="text-purple-400" />
                    Activity Intelligence
                </h4>
                <button
                    onClick={handleTrainActivityModel}
                    disabled={activityTraining}
                    className="flex items-center gap-2 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded text-sm disabled:opacity-50"
                >
                    {activityTraining ? (
                        <>
                            <RefreshCw size={14} className="animate-spin" />
                            Training...
                        </>
                    ) : (
                        <>
                            <Zap size={14} />
                            Train Model
                        </>
                    )}
                </button>
            </div>

            <div className="flex border-b border-gray-700 mb-4">
                {(['predictions', 'history', 'patterns'] as const).map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActivityTab(tab)}
                        className={`px-4 py-2 text-sm font-medium transition-colors ${
                            activityTab === tab
                                ? 'text-purple-400 border-b-2 border-purple-400'
                                : 'text-gray-400 hover:text-white'
                        }`}
                    >
                        {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </button>
                ))}
            </div>

            {activityLoading ? (
                <div className="flex items-center justify-center py-12">
                    <RefreshCw className="animate-spin text-gray-400" size={32} />
                </div>
            ) : (
                <>
                    {activityTab === 'predictions' && (
                        <div className="space-y-4">
                            {activityPredictions.length > 0 ? (
                                activityPredictions.map((pred, idx) => (
                                    <div
                                        key={idx}
                                        className={`p-4 rounded-lg border ${
                                            pred.type === 'suggestion' ? 'border-green-600 bg-green-900/20' :
                                            pred.type === 'pattern' ? 'border-blue-600 bg-blue-900/20' :
                                            'border-yellow-600 bg-yellow-900/20'
                                        }`}
                                    >
                                        <div className="flex items-start justify-between">
                                            <div className="flex items-center gap-2">
                                                <Lightbulb size={18} className={
                                                    pred.type === 'suggestion' ? 'text-green-400' :
                                                    pred.type === 'pattern' ? 'text-blue-400' :
                                                    'text-yellow-400'
                                                } />
                                                <h4 className="font-medium text-white">{pred.title}</h4>
                                            </div>
                                            <span className="text-xs text-gray-400">
                                                {(pred.confidence * 100).toFixed(0)}% confidence
                                            </span>
                                        </div>
                                        <p className="text-sm text-gray-300 mt-2">{pred.description}</p>
                                    </div>
                                ))
                            ) : (
                                <div className="text-center py-12 text-gray-400">
                                    <Brain size={48} className="mx-auto mb-4 opacity-50" />
                                    <p>No predictions yet</p>
                                    <p className="text-xs mt-2">Use the app more to generate activity patterns</p>
                                </div>
                            )}
                        </div>
                    )}

                    {activityTab === 'history' && (
                        <div className="space-y-2 max-h-96 overflow-y-auto">
                            {activityData.length > 0 ? (
                                activityData.slice(0, 50).map((activity, idx) => (
                                    <div key={idx} className="flex items-center gap-3 p-2 bg-gray-800 rounded">
                                        {getActivityIcon(activity.type)}
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm text-white truncate">
                                                {activity.type?.replace(/_/g, ' ')}
                                            </p>
                                            <p className="text-xs text-gray-400 truncate">
                                                {activity.data?.filePath || activity.data?.url || activity.data?.command || '-'}
                                            </p>
                                        </div>
                                        <span className="text-xs text-gray-500">
                                            {activity.timestamp ? new Date(activity.timestamp).toLocaleTimeString() : '-'}
                                        </span>
                                    </div>
                                ))
                            ) : (
                                <div className="text-center py-12 text-gray-400">
                                    <Activity size={48} className="mx-auto mb-4 opacity-50" />
                                    <p>No activity history yet</p>
                                </div>
                            )}
                        </div>
                    )}

                    {activityTab === 'patterns' && (
                        <div className="space-y-4">
                            {activityStats?.mostCommonPatterns?.length > 0 ? (
                                <>
                                    <div className="grid grid-cols-3 gap-4 mb-4">
                                        <div className="p-4 bg-gray-800 rounded-lg text-center">
                                            <div className="text-2xl font-bold text-purple-400">{activityStats.totalActivities || 0}</div>
                                            <div className="text-xs text-gray-400">Total Activities</div>
                                        </div>
                                        <div className="p-4 bg-gray-800 rounded-lg text-center">
                                            <div className="text-2xl font-bold text-blue-400">{activityStats.mostCommonPatterns?.length || 0}</div>
                                            <div className="text-xs text-gray-400">Patterns Found</div>
                                        </div>
                                        <div className="p-4 bg-gray-800 rounded-lg text-center">
                                            <div className="text-2xl font-bold text-green-400">{activityStats.peakHours?.[0] ?? '-'}</div>
                                            <div className="text-xs text-gray-400">Peak Hour</div>
                                        </div>
                                    </div>
                                    {activityStats.mostCommonPatterns.map((pattern: any, idx: number) => (
                                        <div key={idx} className="p-3 bg-gray-800 rounded-lg">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                {pattern.pattern.map((step: string, sidx: number) => (
                                                    <React.Fragment key={sidx}>
                                                        <span className="px-2 py-1 bg-gray-700 rounded text-sm text-gray-300">
                                                            {step.replace(/_/g, ' ')}
                                                        </span>
                                                        {sidx < pattern.pattern.length - 1 && (
                                                            <ChevronsRight size={14} className="text-gray-500" />
                                                        )}
                                                    </React.Fragment>
                                                ))}
                                            </div>
                                            <div className="flex gap-4 mt-2 text-xs text-gray-400">
                                                <span>Occurrences: {pattern.count}</span>
                                                <span>Avg Duration: {Math.round(pattern.avgDuration / 1000)}s</span>
                                            </div>
                                        </div>
                                    ))}
                                </>
                            ) : (
                                <div className="text-center py-12 text-gray-400">
                                    <BarChart3 size={48} className="mx-auto mb-4 opacity-50" />
                                    <p>No patterns detected yet</p>
                                    <p className="text-xs mt-2">Keep using the app to build pattern recognition</p>
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );

    if (isModal) {
        return (
            <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100]" onClick={onClose}>
                <div
                    className="theme-bg-secondary rounded-lg shadow-xl w-[90vw] max-w-4xl max-h-[85vh] overflow-hidden flex flex-col"
                    onClick={e => e.stopPropagation()}
                >
                    <div className="flex items-center justify-between p-4 border-b theme-border">
                        <h3 className="text-lg font-semibold flex items-center gap-2">
                            <Brain className="text-purple-400" size={20} />
                            Activity Intelligence
                        </h3>
                        <button onClick={onClose} className="p-1 hover:bg-gray-700 rounded">
                            <span className="text-xl">&times;</span>
                        </button>
                    </div>
                    <div className="flex-1 overflow-auto">
                        {content}
                    </div>
                </div>
            </div>
        );
    }

    return content;
};

export default ActivityIntelligence;
