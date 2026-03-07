import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    Activity, Brain, TrendingUp, Clock, FileText, Globe, Terminal,
    Lightbulb, Settings, RefreshCw, Download, Trash2, Eye,
    ChevronRight, BarChart3, Zap
} from 'lucide-react';

export type ActivityType =
    | 'pane_open'
    | 'pane_close'
    | 'file_open'
    | 'file_edit'
    | 'website_visit'
    | 'terminal_command'
    | 'chat_message'
    | 'app_switch'
    | 'search_query'
    | 'model_change';

export interface UserActivity {
    type: ActivityType;
    timestamp: number;
    data: {
        paneType?: string;
        filePath?: string;
        fileType?: string;
        url?: string;
        domain?: string;
        command?: string;
        model?: string;
        provider?: string;
        query?: string;
        duration?: number;
        [key: string]: any;
    };
    sessionId: string;
}

export interface ActivityPrediction {
    type: 'suggestion' | 'pattern' | 'optimization';
    confidence: number;
    title: string;
    description: string;
    actions?: Array<{
        label: string;
        action: () => void;
    }>;
    relatedActivities?: string[];
}

export interface ActivityStats {
    totalActivities: number;
    activitiesByType: Record<ActivityType, number>;
    mostCommonPatterns: Array<{
        pattern: string[];
        count: number;
        avgDuration: number;
    }>;
    sessionDurations: number[];
    peakHours: number[];
}

export const useActivityTracker = () => {
    const sessionIdRef = useRef<string>(`session_${Date.now()}`);

    const trackActivity = useCallback(async (
        type: ActivityType,
        data: UserActivity['data']
    ) => {
        const activity: UserActivity = {
            type,
            timestamp: Date.now(),
            data,
            sessionId: sessionIdRef.current
        };

        try {
            await (window as any).api?.trackActivity?.(activity);
        } catch (err) {
            console.error('Failed to track activity:', err);
        }

        return activity;
    }, []);

    return { trackActivity, sessionId: sessionIdRef.current };
};

const ActivityTrackerDashboard = ({
    isOpen,
    onClose
}: {
    isOpen: boolean;
    onClose: () => void;
}) => {
    const [activities, setActivities] = useState<UserActivity[]>([]);
    const [predictions, setPredictions] = useState<ActivityPrediction[]>([]);
    const [stats, setStats] = useState<ActivityStats | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isTraining, setIsTraining] = useState(false);
    const [activeTab, setActiveTab] = useState<'predictions' | 'history' | 'patterns' | 'settings'>('predictions');

    useEffect(() => {
        if (!isOpen) return;
        loadData();
    }, [isOpen]);

    const loadData = async () => {
        setIsLoading(true);
        try {

            const predResponse = await (window as any).api?.getActivityPredictions?.();
            if (predResponse && !predResponse.error) {
                setPredictions(predResponse.predictions || []);
                setStats(predResponse.stats || null);
                setActivities(predResponse.recentActivities || []);
            }
        } catch (err) {
            console.error('Failed to load activity data:', err);
        }
        setIsLoading(false);
    };

    const handleTrainModel = async () => {
        setIsTraining(true);
        try {
            await (window as any).api?.trainActivityModel?.();
            await loadData();
        } catch (err) {
            console.error('Failed to train model:', err);
        }
        setIsTraining(false);
    };

    const getActivityIcon = (type: ActivityType) => {
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

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div
                className="bg-gray-900 rounded-lg shadow-xl w-full max-w-4xl h-[80vh] flex flex-col border border-gray-700"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between p-4 border-b border-gray-700">
                    <div className="flex items-center gap-3">
                        <Brain className="text-purple-400" size={24} />
                        <div>
                            <h2 className="text-lg font-semibold text-white">Activity Intelligence</h2>
                            <p className="text-xs text-gray-400">RNN-powered workflow predictions</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleTrainModel}
                            disabled={isTraining}
                            className="flex items-center gap-2 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded text-sm disabled:opacity-50"
                        >
                            {isTraining ? (
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
                        <button onClick={onClose} className="p-2 text-gray-400 hover:text-white">
                            ×
                        </button>
                    </div>
                </div>

                <div className="flex border-b border-gray-700">
                    {(['predictions', 'history', 'patterns', 'settings'] as const).map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`px-4 py-2 text-sm font-medium transition-colors ${
                                activeTab === tab
                                    ? 'text-purple-400 border-b-2 border-purple-400'
                                    : 'text-gray-400 hover:text-white'
                            }`}
                        >
                            {tab.charAt(0).toUpperCase() + tab.slice(1)}
                        </button>
                    ))}
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                    {isLoading ? (
                        <div className="flex items-center justify-center h-full">
                            <RefreshCw className="animate-spin text-gray-400" size={32} />
                        </div>
                    ) : (
                        <>
                            {activeTab === 'predictions' && (
                                <div className="space-y-4">
                                    {predictions.length > 0 ? (
                                        predictions.map((pred, idx) => (
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
                                                {pred.actions && (
                                                    <div className="flex gap-2 mt-3">
                                                        {pred.actions.map((action, aidx) => (
                                                            <button
                                                                key={aidx}
                                                                onClick={action.action}
                                                                className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-white rounded"
                                                            >
                                                                {action.label}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
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

                            {activeTab === 'history' && (
                                <div className="space-y-2">
                                    {activities.length > 0 ? (
                                        activities.slice(0, 50).map((activity, idx) => (
                                            <div key={idx} className="flex items-center gap-3 p-2 bg-gray-800 rounded">
                                                {getActivityIcon(activity.type)}
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm text-white truncate">
                                                        {activity.type.replace(/_/g, ' ')}
                                                    </p>
                                                    <p className="text-xs text-gray-400 truncate">
                                                        {activity.data.filePath || activity.data.url || activity.data.command || '-'}
                                                    </p>
                                                </div>
                                                <span className="text-xs text-gray-500">
                                                    {new Date(activity.timestamp).toLocaleTimeString()}
                                                </span>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-center py-12 text-gray-400">
                                            <Clock size={48} className="mx-auto mb-4 opacity-50" />
                                            <p>No activity recorded yet</p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {activeTab === 'patterns' && stats && (
                                <div className="space-y-6">
                                    <div>
                                        <h4 className="text-sm font-medium text-gray-400 mb-3">Activity Distribution</h4>
                                        <div className="grid grid-cols-2 gap-2">
                                            {Object.entries(stats.activitiesByType || {}).map(([type, count]) => (
                                                <div key={type} className="flex items-center justify-between p-2 bg-gray-800 rounded">
                                                    <span className="text-sm text-white">{type.replace(/_/g, ' ')}</span>
                                                    <span className="text-sm font-mono text-gray-400">{count}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {stats.mostCommonPatterns && stats.mostCommonPatterns.length > 0 && (
                                        <div>
                                            <h4 className="text-sm font-medium text-gray-400 mb-3">Common Patterns</h4>
                                            <div className="space-y-2">
                                                {stats.mostCommonPatterns.map((pattern, idx) => (
                                                    <div key={idx} className="p-3 bg-gray-800 rounded">
                                                        <div className="flex items-center gap-1 text-sm">
                                                            {pattern.pattern.map((step, sidx) => (
                                                                <React.Fragment key={sidx}>
                                                                    <span className="px-2 py-0.5 bg-gray-700 rounded text-white">
                                                                        {step}
                                                                    </span>
                                                                    {sidx < pattern.pattern.length - 1 && (
                                                                        <ChevronRight size={12} className="text-gray-500" />
                                                                    )}
                                                                </React.Fragment>
                                                            ))}
                                                        </div>
                                                        <p className="text-xs text-gray-400 mt-2">
                                                            Occurred {pattern.count} times • Avg duration: {(pattern.avgDuration / 1000).toFixed(1)}s
                                                        </p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {activeTab === 'settings' && (
                                <div className="space-y-4">
                                    <div className="p-4 bg-gray-800 rounded-lg">
                                        <h4 className="font-medium text-white mb-2">Activity Tracking</h4>
                                        <p className="text-sm text-gray-400 mb-3">
                                            Control what activities are tracked for RNN predictions
                                        </p>
                                        <div className="space-y-2">
                                            {['file_open', 'website_visit', 'terminal_command', 'pane_open', 'chat_message'].map(type => (
                                                <label key={type} className="flex items-center gap-2">
                                                    <input type="checkbox" defaultChecked className="rounded" />
                                                    <span className="text-sm text-white">{type.replace(/_/g, ' ')}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="p-4 bg-gray-800 rounded-lg">
                                        <h4 className="font-medium text-white mb-2">Model Settings</h4>
                                        <div className="space-y-3">
                                            <div>
                                                <label className="text-xs text-gray-400">Sequence Length</label>
                                                <input
                                                    type="number"
                                                    defaultValue={10}
                                                    className="w-full mt-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-xs text-gray-400">Min Confidence Threshold</label>
                                                <input
                                                    type="range"
                                                    min="0"
                                                    max="100"
                                                    defaultValue={60}
                                                    className="w-full mt-1"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <button className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-900 hover:bg-red-800 text-red-300 rounded">
                                        <Trash2 size={14} />
                                        Clear Activity History
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {stats && (
                    <div className="flex items-center justify-between p-3 border-t border-gray-700 bg-gray-800/50 text-xs text-gray-400">
                        <span>{stats.totalActivities} total activities tracked</span>
                        <span>Session: {activities[0]?.sessionId?.slice(0, 12) || 'N/A'}</span>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ActivityTrackerDashboard;
