

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    Activity, Eye, Coffee, Clock, AlertTriangle,
    CheckCircle, Settings, Play, Pause, BarChart3,
    Monitor, Target, TrendingUp, RefreshCw
} from 'lucide-react';

interface ScreenGeometry {
    screenWidth: number;
    screenHeight: number;
    screenDiagonalInches: number;
    viewingDistanceInches: number;
}

interface PanePosition {
    x: number;
    y: number;
    width: number;
    height: number;
}

interface PostureEstimate {
    horizontalAngle: number;
    verticalAngle: number;
    neckStrain: number;
    eyeStrain: number;
    isStrained: boolean;
    description: string;
}

interface BreakState {
    lastMicroBreak: number;
    lastShortBreak: number;
    lastLongBreak: number;
    microBreaksDue: boolean;
    shortBreaksDue: boolean;
    longBreaksDue: boolean;
}

interface SessionStats {
    sessionDuration: number;
    strainedTime: number;
    strainPercentage: number;
    breaksTaken: { micro: number; short: number; long: number };
    postureAlerts: number;
}

interface PostureGuardianProps {
    activePanePosition?: PanePosition | null;
    isEnabled?: boolean;
    onPostureAlert?: (message: string) => void;
    onBreakDue?: (breakType: string, message: string) => void;
}

const DEFAULT_GEOMETRY: ScreenGeometry = {
    screenWidth: window.innerWidth || 1920,
    screenHeight: window.innerHeight || 1080,
    screenDiagonalInches: 24,
    viewingDistanceInches: 24
};

const BREAK_INTERVALS = {
    micro: 20 * 60 * 1000,
    short: 50 * 60 * 1000,
    long: 2 * 60 * 60 * 1000
};

const STRAIN_THRESHOLDS = {
    maxHorizontalAngle: 30,
    maxVerticalAngle: 25,
    maxNeckStrain: 0.6
};

const calculateGazeAngle = (
    targetPx: number,
    screenSizePx: number,
    geometry: ScreenGeometry,
    isHorizontal: boolean
): number => {
    const centerPx = screenSizePx / 2;
    const offsetPx = targetPx - centerPx;

    const diagonalPx = Math.sqrt(geometry.screenWidth ** 2 + geometry.screenHeight ** 2);
    const ppi = diagonalPx / geometry.screenDiagonalInches;

    const offsetInches = offsetPx / ppi;

    const angleRad = Math.atan(offsetInches / geometry.viewingDistanceInches);
    return angleRad * (180 / Math.PI);
};

const estimatePostureFromPane = (
    pane: PanePosition,
    geometry: ScreenGeometry
): PostureEstimate => {
    const centerX = pane.x + pane.width / 2;
    const centerY = pane.y + pane.height / 2;

    const horizontalAngle = calculateGazeAngle(centerX, geometry.screenWidth, geometry, true);
    const verticalAngle = calculateGazeAngle(centerY, geometry.screenHeight, geometry, false);

    const horizontalStrain = Math.abs(horizontalAngle) * 0.02;
    const verticalStrain = Math.max(0, verticalAngle) * 0.025;

    const paneArea = pane.width * pane.height;
    const screenArea = geometry.screenWidth * geometry.screenHeight;
    const areaRatio = paneArea / screenArea;
    const smallPaneBonus = Math.max(0, (0.25 - areaRatio) / 0.25) * 0.1;

    const neckStrain = Math.min(1, horizontalStrain + Math.max(0, verticalStrain) + smallPaneBonus);
    const eyeStrain = Math.min(1,
        (1 - areaRatio) * 0.3 +
        (Math.abs(horizontalAngle) / 60) * 0.3 +
        (Math.abs(verticalAngle) / 45) * 0.2
    );

    const isStrained = (
        Math.abs(horizontalAngle) > STRAIN_THRESHOLDS.maxHorizontalAngle ||
        Math.abs(verticalAngle) > STRAIN_THRESHOLDS.maxVerticalAngle ||
        neckStrain > STRAIN_THRESHOLDS.maxNeckStrain
    );

    const issues: string[] = [];
    if (Math.abs(horizontalAngle) > 30) {
        issues.push(`looking far ${horizontalAngle > 0 ? 'right' : 'left'}`);
    }
    if (verticalAngle > 25) {
        issues.push('looking down');
    } else if (verticalAngle < -15) {
        issues.push('looking up');
    }
    if (neckStrain > 0.6) {
        issues.push('likely neck strain');
    }

    return {
        horizontalAngle,
        verticalAngle,
        neckStrain,
        eyeStrain,
        isStrained,
        description: issues.length > 0 ? issues.join(', ') : 'comfortable position'
    };
};

const StatusIndicator: React.FC<{ isStrained: boolean; isEnabled: boolean }> = ({ isStrained, isEnabled }) => {
    if (!isEnabled) {
        return (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-full theme-bg-secondary opacity-50">
                <Pause className="w-3 h-3" />
                <span className="text-xs">Paused</span>
            </div>
        );
    }

    return (
        <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full ${
            isStrained
                ? 'bg-red-500/20 text-red-400'
                : 'bg-green-500/20 text-green-400'
        }`}>
            {isStrained ? (
                <AlertTriangle className="w-3 h-3" />
            ) : (
                <CheckCircle className="w-3 h-3" />
            )}
            <span className="text-xs">{isStrained ? 'Check Posture' : 'Good'}</span>
        </div>
    );
};

const BreakTimer: React.FC<{ breakState: BreakState }> = ({ breakState }) => {
    const now = Date.now();
    const nextMicro = Math.max(0, (breakState.lastMicroBreak + BREAK_INTERVALS.micro - now) / 60000);
    const nextShort = Math.max(0, (breakState.lastShortBreak + BREAK_INTERVALS.short - now) / 60000);

    return (
        <div className="flex items-center gap-3 text-xs theme-text-secondary">
            <div className="flex items-center gap-1">
                <Eye className="w-3 h-3" />
                <span>{nextMicro.toFixed(0)}m</span>
            </div>
            <div className="flex items-center gap-1">
                <Coffee className="w-3 h-3" />
                <span>{nextShort.toFixed(0)}m</span>
            </div>
        </div>
    );
};

const StatsPanel: React.FC<{ stats: SessionStats; isExpanded: boolean }> = ({ stats, isExpanded }) => {
    if (!isExpanded) return null;

    const formatDuration = (ms: number) => {
        const minutes = Math.floor(ms / 60000);
        if (minutes < 60) return `${minutes}m`;
        const hours = Math.floor(minutes / 60);
        return `${hours}h ${minutes % 60}m`;
    };

    return (
        <div className="mt-2 p-2 rounded theme-bg-secondary text-xs space-y-1">
            <div className="flex justify-between">
                <span className="theme-text-secondary">Session</span>
                <span>{formatDuration(stats.sessionDuration)}</span>
            </div>
            <div className="flex justify-between">
                <span className="theme-text-secondary">Strain Time</span>
                <span className={stats.strainPercentage > 30 ? 'text-red-400' : ''}>
                    {stats.strainPercentage.toFixed(0)}%
                </span>
            </div>
            <div className="flex justify-between">
                <span className="theme-text-secondary">Breaks</span>
                <span>
                    {stats.breaksTaken.micro}👀 {stats.breaksTaken.short}☕ {stats.breaksTaken.long}🚶
                </span>
            </div>
            <div className="flex justify-between">
                <span className="theme-text-secondary">Alerts</span>
                <span>{stats.postureAlerts}</span>
            </div>
        </div>
    );
};

export const PostureGuardian: React.FC<PostureGuardianProps> = ({
    activePanePosition,
    isEnabled: initialEnabled = true,
    onPostureAlert,
    onBreakDue
}) => {
    const [isEnabled, setIsEnabled] = useState(initialEnabled);
    const [isExpanded, setIsExpanded] = useState(false);
    const [geometry, setGeometry] = useState<ScreenGeometry>(DEFAULT_GEOMETRY);
    const [currentEstimate, setCurrentEstimate] = useState<PostureEstimate | null>(null);
    const [breakState, setBreakState] = useState<BreakState>({
        lastMicroBreak: Date.now(),
        lastShortBreak: Date.now(),
        lastLongBreak: Date.now(),
        microBreaksDue: false,
        shortBreaksDue: false,
        longBreaksDue: false
    });
    const [stats, setStats] = useState<SessionStats>({
        sessionDuration: 0,
        strainedTime: 0,
        strainPercentage: 0,
        breaksTaken: { micro: 0, short: 0, long: 0 },
        postureAlerts: 0
    });

    const sessionStartRef = useRef(Date.now());
    const strainStartRef = useRef<number | null>(null);
    const totalStrainTimeRef = useRef(0);
    const lastAlertTimeRef = useRef(0);
    const checkIntervalRef = useRef<NodeJS.Timer | null>(null);

    useEffect(() => {
        const handleResize = () => {
            setGeometry(prev => ({
                ...prev,
                screenWidth: window.innerWidth,
                screenHeight: window.innerHeight
            }));
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        if (!isEnabled || !activePanePosition) {
            setCurrentEstimate(null);
            return;
        }

        const estimate = estimatePostureFromPane(activePanePosition, geometry);
        setCurrentEstimate(estimate);

        const now = Date.now();
        if (estimate.isStrained) {
            if (strainStartRef.current === null) {
                strainStartRef.current = now;
            }

            const strainDuration = now - strainStartRef.current;
            if (strainDuration >= 60000 && now - lastAlertTimeRef.current > 120000) {
                lastAlertTimeRef.current = now;
                const message = `Posture strain detected: ${estimate.description}`;
                onPostureAlert?.(message);
                setStats(prev => ({ ...prev, postureAlerts: prev.postureAlerts + 1 }));
            }
        } else {
            if (strainStartRef.current !== null) {
                totalStrainTimeRef.current += now - strainStartRef.current;
                strainStartRef.current = null;
            }
        }
    }, [activePanePosition, isEnabled, geometry, onPostureAlert]);

    useEffect(() => {
        if (!isEnabled) {
            if (checkIntervalRef.current) {
                clearInterval(checkIntervalRef.current);
            }
            return;
        }

        const checkBreaks = () => {
            const now = Date.now();

            const sessionDuration = now - sessionStartRef.current;
            const strainedTime = totalStrainTimeRef.current +
                (strainStartRef.current ? now - strainStartRef.current : 0);

            setStats(prev => ({
                ...prev,
                sessionDuration,
                strainedTime,
                strainPercentage: sessionDuration > 0 ? (strainedTime / sessionDuration) * 100 : 0
            }));

            const microDue = now - breakState.lastMicroBreak >= BREAK_INTERVALS.micro;
            const shortDue = now - breakState.lastShortBreak >= BREAK_INTERVALS.short;
            const longDue = now - breakState.lastLongBreak >= BREAK_INTERVALS.long;

            if (longDue && !breakState.longBreaksDue) {
                onBreakDue?.('long', "You've been working for 2 hours! Take a 15-minute break.");
                setBreakState(prev => ({ ...prev, longBreaksDue: true }));
            } else if (shortDue && !breakState.shortBreaksDue) {
                onBreakDue?.('short', 'Time for a 5-minute break! Stand up and stretch.');
                setBreakState(prev => ({ ...prev, shortBreaksDue: true }));
            } else if (microDue && !breakState.microBreaksDue) {
                onBreakDue?.('micro', 'Eye break: Look at something 20 feet away for 20 seconds.');
                setBreakState(prev => ({ ...prev, microBreaksDue: true }));

                setTimeout(() => {
                    setBreakState(prev => ({
                        ...prev,
                        lastMicroBreak: Date.now(),
                        microBreaksDue: false
                    }));
                }, 30000);
            }
        };

        checkIntervalRef.current = setInterval(checkBreaks, 30000);
        checkBreaks();

        return () => {
            if (checkIntervalRef.current) {
                clearInterval(checkIntervalRef.current);
            }
        };
    }, [isEnabled, breakState, onBreakDue]);

    const takeBreak = useCallback((type: 'micro' | 'short' | 'long') => {
        const now = Date.now();
        setBreakState(prev => ({
            ...prev,
            [`last${type.charAt(0).toUpperCase() + type.slice(1)}Break`]: now,
            [`${type}BreaksDue`]: false,

            ...(type === 'long' && { lastShortBreak: now, lastMicroBreak: now }),
            ...(type === 'short' && { lastMicroBreak: now })
        }));
        setStats(prev => ({
            ...prev,
            breaksTaken: {
                ...prev.breaksTaken,
                [type]: prev.breaksTaken[type] + 1
            }
        }));
    }, []);

    const resetSession = useCallback(() => {
        sessionStartRef.current = Date.now();
        strainStartRef.current = null;
        totalStrainTimeRef.current = 0;
        lastAlertTimeRef.current = 0;
        setBreakState({
            lastMicroBreak: Date.now(),
            lastShortBreak: Date.now(),
            lastLongBreak: Date.now(),
            microBreaksDue: false,
            shortBreaksDue: false,
            longBreaksDue: false
        });
        setStats({
            sessionDuration: 0,
            strainedTime: 0,
            strainPercentage: 0,
            breaksTaken: { micro: 0, short: 0, long: 0 },
            postureAlerts: 0
        });
    }, []);

    return (
        <div className="posture-guardian theme-bg-primary theme-border border rounded-lg p-2">
            <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 theme-text-accent" />
                    <span className="text-sm font-medium">Posture Guardian</span>
                </div>
                <div className="flex items-center gap-2">
                    <StatusIndicator
                        isStrained={currentEstimate?.isStrained ?? false}
                        isEnabled={isEnabled}
                    />
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsEnabled(!isEnabled);
                        }}
                        className="p-1 rounded theme-hover"
                        title={isEnabled ? 'Pause monitoring' : 'Resume monitoring'}
                    >
                        {isEnabled ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                    </button>
                </div>
            </div>

            {isExpanded && (
                <div className="mt-2 space-y-2">
                    {currentEstimate && isEnabled && (
                        <div className="p-2 rounded theme-bg-secondary text-xs">
                            <div className="flex items-center gap-2 mb-1">
                                <Target className="w-3 h-3" />
                                <span className="font-medium">Current Position</span>
                            </div>
                            <div className="grid grid-cols-2 gap-1 theme-text-secondary">
                                <span>H: {currentEstimate.horizontalAngle.toFixed(1)}°</span>
                                <span>V: {currentEstimate.verticalAngle.toFixed(1)}°</span>
                                <span>Neck: {(currentEstimate.neckStrain * 100).toFixed(0)}%</span>
                                <span>Eye: {(currentEstimate.eyeStrain * 100).toFixed(0)}%</span>
                            </div>
                            <p className="mt-1 italic">{currentEstimate.description}</p>
                        </div>
                    )}

                    <div className="flex items-center justify-between">
                        <BreakTimer breakState={breakState} />
                        <div className="flex gap-1">
                            <button
                                onClick={() => takeBreak('micro')}
                                className="px-2 py-1 text-xs rounded theme-bg-secondary theme-hover"
                                title="Take eye break"
                            >
                                👀
                            </button>
                            <button
                                onClick={() => takeBreak('short')}
                                className="px-2 py-1 text-xs rounded theme-bg-secondary theme-hover"
                                title="Take short break"
                            >
                                ☕
                            </button>
                            <button
                                onClick={() => takeBreak('long')}
                                className="px-2 py-1 text-xs rounded theme-bg-secondary theme-hover"
                                title="Take long break"
                            >
                                🚶
                            </button>
                        </div>
                    </div>

                    <StatsPanel stats={stats} isExpanded={true} />

                    <div className="flex justify-end">
                        <button
                            onClick={resetSession}
                            className="flex items-center gap-1 px-2 py-1 text-xs rounded theme-bg-secondary theme-hover"
                        >
                            <RefreshCw className="w-3 h-3" />
                            Reset Session
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export const usePostureGuardian = (activePaneId: string | null, rootLayoutNode: any) => {
    const [panePosition, setPanePosition] = useState<PanePosition | null>(null);

    useEffect(() => {
        if (!activePaneId || !rootLayoutNode) {
            setPanePosition(null);
            return;
        }

        const paneElement = document.querySelector(`[data-pane-id="${activePaneId}"]`);
        if (paneElement) {
            const rect = paneElement.getBoundingClientRect();
            setPanePosition({
                x: rect.left,
                y: rect.top,
                width: rect.width,
                height: rect.height
            });
        }
    }, [activePaneId, rootLayoutNode]);

    return panePosition;
};

export default PostureGuardian;
