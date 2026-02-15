import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, ChevronRight, ChevronLeft, SkipForward } from 'lucide-react';
import { useAiEnabled, useUserPath } from './AiFeatureContext';

type UserPath = 'no-ai' | 'cloud-ai' | 'local-ai';

interface TutorialStep {
    selector: string;
    title: string;
    description: string;
    paths: UserPath[];
    position?: 'top' | 'bottom' | 'left' | 'right' | 'auto';
}

const TUTORIAL_STEPS: TutorialStep[] = [
    {
        selector: '[data-tutorial="sidebar"]',
        title: 'Sidebar',
        description: 'Your command center. Browse files, manage websites, and access conversations from here.',
        paths: ['no-ai', 'cloud-ai', 'local-ai'],
        position: 'right',
    },
    {
        selector: '[data-tutorial="terminal-button"]',
        title: 'Terminal',
        description: 'Open a terminal to run commands directly. Click the dropdown arrow for shell options.',
        paths: ['no-ai', 'cloud-ai', 'local-ai'],
        position: 'bottom',
    },
    {
        selector: '[data-tutorial="file-browser"]',
        title: 'File Browser',
        description: 'Browse and manage your files and folders. Click to open, right-click for more options.',
        paths: ['no-ai', 'cloud-ai', 'local-ai'],
        position: 'right',
    },
    {
        selector: '[data-tutorial="pane-area"]',
        title: 'Workspace Panes',
        description: 'Your workspace area. Open multiple panes side by side — editors, terminals, browsers, and more. Drag tabs to rearrange.',
        paths: ['no-ai', 'cloud-ai', 'local-ai'],
        position: 'left',
    },
    {
        selector: '[data-tutorial="settings-button"]',
        title: 'Settings',
        description: 'Configure your environment — appearance, keybindings, models, and more.',
        paths: ['no-ai', 'cloud-ai', 'local-ai'],
        position: 'bottom',
    },
    {
        selector: '[data-tutorial="kg-button"]',
        title: 'Knowledge Graph',
        description: 'Your personal knowledge base. Organize concepts, facts, and relationships visually.',
        paths: ['no-ai', 'cloud-ai', 'local-ai'],
        position: 'top',
    },
    {
        selector: '[data-tutorial="conversations"]',
        title: 'AI Conversations',
        description: 'Start AI conversations. Your chat history is saved per directory so context stays relevant.',
        paths: ['cloud-ai', 'local-ai'],
        position: 'right',
    },
    {
        selector: '[data-tutorial="npc-team-button"]',
        title: 'NPC Team',
        description: 'Meet your AI team. Each NPC agent has specialized skills and personality. Ledbi is your UI assistant.',
        paths: ['cloud-ai', 'local-ai'],
        position: 'top',
    },
    {
        selector: '[data-tutorial="team-management-button"]',
        title: 'Team Management',
        description: 'Manage your NPC team, jinxs (AI tools), databases, MCP servers, and more — all in one place.',
        paths: ['cloud-ai', 'local-ai'],
        position: 'top',
    },
];

interface TooltipPosition {
    top: number;
    left: number;
    arrowSide: 'top' | 'bottom' | 'left' | 'right';
}

function computeTooltipPosition(
    targetRect: DOMRect,
    tooltipWidth: number,
    tooltipHeight: number,
    preferred: TutorialStep['position']
): TooltipPosition {
    const gap = 12;
    const padding = 16;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const positions = {
        bottom: {
            top: targetRect.bottom + gap,
            left: Math.max(padding, Math.min(targetRect.left + targetRect.width / 2 - tooltipWidth / 2, vw - tooltipWidth - padding)),
            arrowSide: 'top' as const,
        },
        top: {
            top: targetRect.top - tooltipHeight - gap,
            left: Math.max(padding, Math.min(targetRect.left + targetRect.width / 2 - tooltipWidth / 2, vw - tooltipWidth - padding)),
            arrowSide: 'bottom' as const,
        },
        right: {
            top: Math.max(padding, Math.min(targetRect.top + targetRect.height / 2 - tooltipHeight / 2, vh - tooltipHeight - padding)),
            left: targetRect.right + gap,
            arrowSide: 'left' as const,
        },
        left: {
            top: Math.max(padding, Math.min(targetRect.top + targetRect.height / 2 - tooltipHeight / 2, vh - tooltipHeight - padding)),
            left: targetRect.left - tooltipWidth - gap,
            arrowSide: 'right' as const,
        },
    };

    if (preferred && preferred !== 'auto') {
        const pos = positions[preferred];
        if (pos.top >= padding && pos.top + tooltipHeight <= vh - padding && pos.left >= padding && pos.left + tooltipWidth <= vw - padding) {
            return pos;
        }
    }

    // Auto: try bottom, right, top, left
    for (const dir of ['bottom', 'right', 'top', 'left'] as const) {
        const pos = positions[dir];
        if (pos.top >= padding && pos.top + tooltipHeight <= vh - padding && pos.left >= padding && pos.left + tooltipWidth <= vw - padding) {
            return pos;
        }
    }

    return positions.bottom;
}

interface AppTutorialProps {
    onComplete: () => void;
}

const AppTutorial: React.FC<AppTutorialProps> = ({ onComplete }) => {
    const aiEnabled = useAiEnabled();
    const userPath = useUserPath();
    const [currentStep, setCurrentStep] = useState(0);
    const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
    const [tooltipPos, setTooltipPos] = useState<TooltipPosition | null>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);
    const [isAnimating, setIsAnimating] = useState(false);

    // Filter steps based on user path
    const steps = TUTORIAL_STEPS.filter((step) => step.paths.includes(userPath));

    const totalSteps = steps.length;
    const step = steps[currentStep];

    // Update target element rect
    const updateTarget = useCallback(() => {
        if (!step) return;
        const el = document.querySelector(step.selector);
        if (el) {
            const rect = el.getBoundingClientRect();
            setTargetRect(rect);
        } else {
            setTargetRect(null);
        }
    }, [step]);

    useEffect(() => {
        updateTarget();
        const handleResize = () => updateTarget();
        window.addEventListener('resize', handleResize);
        window.addEventListener('scroll', handleResize, true);
        return () => {
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('scroll', handleResize, true);
        };
    }, [updateTarget, currentStep]);

    // Compute tooltip position after it renders
    useEffect(() => {
        if (!targetRect || !tooltipRef.current) return;
        const tooltipRect = tooltipRef.current.getBoundingClientRect();
        const pos = computeTooltipPosition(targetRect, tooltipRect.width, tooltipRect.height, step?.position);
        setTooltipPos(pos);
    }, [targetRect, step]);

    const goNext = useCallback(() => {
        if (currentStep < totalSteps - 1) {
            setIsAnimating(true);
            setTimeout(() => {
                setCurrentStep((s) => s + 1);
                setIsAnimating(false);
            }, 150);
        } else {
            onComplete();
        }
    }, [currentStep, totalSteps, onComplete]);

    const goPrev = useCallback(() => {
        if (currentStep > 0) {
            setIsAnimating(true);
            setTimeout(() => {
                setCurrentStep((s) => s - 1);
                setIsAnimating(false);
            }, 150);
        }
    }, [currentStep]);

    // Keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onComplete();
            } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
                goNext();
            } else if (e.key === 'ArrowLeft') {
                goPrev();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [goNext, goPrev, onComplete]);

    if (!step) {
        onComplete();
        return null;
    }

    // Spotlight cutout dimensions
    const spotPad = 8;
    const spotRadius = 8;
    const spot = targetRect
        ? {
              x: targetRect.left - spotPad,
              y: targetRect.top - spotPad,
              w: targetRect.width + spotPad * 2,
              h: targetRect.height + spotPad * 2,
          }
        : null;

    return (
        <div className="fixed inset-0 z-[9999]" style={{ pointerEvents: 'auto' }}>
            {/* SVG overlay with cutout */}
            <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: 'none' }}>
                <defs>
                    <mask id="tutorial-mask">
                        <rect x="0" y="0" width="100%" height="100%" fill="white" />
                        {spot && (
                            <rect
                                x={spot.x}
                                y={spot.y}
                                width={spot.w}
                                height={spot.h}
                                rx={spotRadius}
                                fill="black"
                            />
                        )}
                    </mask>
                </defs>
                <rect
                    x="0"
                    y="0"
                    width="100%"
                    height="100%"
                    fill="rgba(0,0,0,0.7)"
                    mask="url(#tutorial-mask)"
                    style={{ pointerEvents: 'auto' }}
                    onClick={goNext}
                />
            </svg>

            {/* Spotlight ring */}
            {spot && (
                <div
                    className="absolute border-2 border-blue-400 rounded-lg transition-all duration-300 ease-out"
                    style={{
                        left: spot.x,
                        top: spot.y,
                        width: spot.w,
                        height: spot.h,
                        pointerEvents: 'none',
                        boxShadow: '0 0 0 2px rgba(96, 165, 250, 0.3), 0 0 20px rgba(96, 165, 250, 0.15)',
                    }}
                />
            )}

            {/* Tooltip */}
            <div
                ref={tooltipRef}
                className={`absolute bg-gray-800 border border-gray-600 rounded-xl shadow-2xl p-4 max-w-xs transition-opacity duration-150 ${isAnimating ? 'opacity-0' : 'opacity-100'}`}
                style={{
                    top: tooltipPos?.top ?? -9999,
                    left: tooltipPos?.left ?? -9999,
                    zIndex: 10000,
                    minWidth: 280,
                }}
            >
                {/* Step counter */}
                <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">
                        Step {currentStep + 1} of {totalSteps}
                    </span>
                    <button
                        onClick={onComplete}
                        className="text-gray-500 hover:text-gray-300 transition-colors"
                        title="Skip tutorial"
                    >
                        <X size={14} />
                    </button>
                </div>

                {/* Title */}
                <h3 className="text-sm font-semibold text-white mb-1">{step.title}</h3>

                {/* Description */}
                <p className="text-xs text-gray-300 leading-relaxed mb-4">{step.description}</p>

                {/* Progress dots */}
                <div className="flex items-center gap-1 mb-3">
                    {steps.map((_, i) => (
                        <div
                            key={i}
                            className={`h-1 rounded-full transition-all duration-200 ${
                                i === currentStep
                                    ? 'w-4 bg-blue-400'
                                    : i < currentStep
                                    ? 'w-1.5 bg-blue-600'
                                    : 'w-1.5 bg-gray-600'
                            }`}
                        />
                    ))}
                </div>

                {/* Navigation buttons */}
                <div className="flex items-center justify-between">
                    <button
                        onClick={goPrev}
                        disabled={currentStep === 0}
                        className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                        <ChevronLeft size={14} /> Back
                    </button>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={onComplete}
                            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors"
                        >
                            <SkipForward size={12} /> Skip
                        </button>
                        <button
                            onClick={goNext}
                            className="flex items-center gap-1 px-3 py-1.5 bg-blue-500 hover:bg-blue-400 text-white text-xs rounded-lg font-medium transition-colors"
                        >
                            {currentStep === totalSteps - 1 ? 'Done' : 'Next'}
                            {currentStep < totalSteps - 1 && <ChevronRight size={14} />}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AppTutorial;
