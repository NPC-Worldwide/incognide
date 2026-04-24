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
        description: 'Your command center. Files, websites, and git all live here. Sections are draggable — reorder them how you like.',
        paths: ['no-ai', 'cloud-ai', 'local-ai'],
        position: 'right',
    },
    {
        selector: '[data-tutorial="pane-area"]',
        title: 'Workspace',
        description: 'Everything opens here as panes — editors, terminals, browsers, viewers. Split horizontally or vertically, drag tabs between panes, and build any layout you want.',
        paths: ['no-ai', 'cloud-ai', 'local-ai'],
        position: 'bottom',
    },
    {
        selector: '[data-tutorial="creation-tiles"]',
        title: 'Quick Create',
        description: 'Three creation buttons for the things you use most. Click for the default action, use the dropdown arrow for more options. Right-click any option to set it as the default.',
        paths: ['no-ai', 'cloud-ai', 'local-ai'],
        position: 'bottom',
    },
    {
        selector: '[data-tutorial="terminal-button"]',
        title: 'Terminal',
        description: 'Open a system terminal, or use the dropdown for npcsh (AI-powered shell). Terminals run in panes alongside your other work.',
        paths: ['no-ai', 'cloud-ai', 'local-ai'],
        position: 'bottom',
    },
    {
        selector: '[data-tutorial="code-file-button"]',
        title: 'Code & Text Files',
        description: 'Create new files in any language — Python, JavaScript, TypeScript, Rust, LaTeX, Markdown, and more. The editor has syntax highlighting, autocomplete, and AI-powered actions.',
        paths: ['no-ai', 'cloud-ai', 'local-ai'],
        position: 'bottom',
    },
    {
        selector: '[data-tutorial="document-button"]',
        title: 'Documents',
        description: 'Create Word, Excel, and PowerPoint documents. Edit them directly in the app with full formatting support.',
        paths: ['no-ai', 'cloud-ai', 'local-ai'],
        position: 'bottom',
    },
    {
        selector: '[data-tutorial="file-browser"]',
        title: 'File Browser',
        description: 'Browse your project files and folders. Click to open in a pane, right-click for rename, delete, copy path, and more. Drag files to rearrange.',
        paths: ['no-ai', 'cloud-ai', 'local-ai'],
        position: 'right',
    },
    {
        selector: '[data-tutorial="website-browser"]',
        title: 'Websites',
        description: 'Your bookmarked websites and browsing history. Quick-access links organized by workspace.',
        paths: ['no-ai', 'cloud-ai', 'local-ai'],
        position: 'right',
    },
    {
        selector: '[data-tutorial="git-browser"]',
        title: 'Git',
        description: 'View git status, branches, and commit history for your project. Stage changes and manage your repository directly from the sidebar.',
        paths: ['no-ai', 'cloud-ai', 'local-ai'],
        position: 'right',
    },
    {
        selector: '[data-tutorial="search-bar"]',
        title: 'Local Search',
        description: 'Search your files, conversations, memories, and knowledge graph.',
        paths: ['no-ai', 'cloud-ai', 'local-ai'],
        position: 'bottom',
    },
    {
        selector: '[data-tutorial="web-search-bar"]',
        title: 'Web Search',
        description: 'Search the web directly from the toolbar. Uses your configured search providers to find results online.',
        paths: ['no-ai', 'cloud-ai', 'local-ai'],
        position: 'bottom',
    },
    {
        selector: '[data-tutorial="vixynt-button"]',
        title: 'Vixynt — Image Studio',
        description: 'Generate images from text prompts, edit photos, apply generative fill, and manage your image library.',
        paths: ['cloud-ai', 'local-ai'],
        position: 'bottom',
    },
    {
        selector: '[data-tutorial="scherzo-button"]',
        title: 'Scherzo — Audio Studio',
        description: 'Multi-track audio editor with waveform visualization. Record, trim, and mix clips; DJ mixer, beat maker, and MusicXML import/export.',
        paths: ['cloud-ai', 'local-ai'],
        position: 'bottom',
    },
    {
        selector: '[data-tutorial="cartoglyph-button"]',
        title: 'Cartoglyph — GIS Mapping',
        description: 'Full GIS mapping pane with Leaflet. Five basemaps, drawing tools, import/export GeoJSON and KML, OSINT data from Overpass and Nominatim, reference layers from Natural Earth, and sample maps to explore.',
        paths: ['no-ai', 'cloud-ai', 'local-ai'],
        position: 'bottom',
    },
    {
        selector: '[data-tutorial="settings-button"]',
        title: 'Settings',
        description: 'Global preferences, theme, keyboard shortcuts, and permissions. Also where you re-run this tutorial or the setup wizard.',
        paths: ['no-ai', 'cloud-ai', 'local-ai'],
        position: 'right',
    },
    {
        selector: '[data-tutorial="help-button"]',
        title: 'Help',
        description: 'Built-in documentation and guides. Learn about keyboard shortcuts, features, jinx authoring, NPC configuration, and more.',
        paths: ['no-ai', 'cloud-ai', 'local-ai'],
        position: 'right',
    },
    {
        selector: '[data-tutorial="new-chat-button"]',
        title: 'New Chat',
        description: 'Start a plain conversation with a model — no tools, just back-and-forth messages.',
        paths: ['cloud-ai', 'local-ai'],
        position: 'left',
    },
    {
        selector: '[data-tutorial="new-agent-button"]',
        title: 'New Agent',
        description: 'Start an agent run with MCP tools connected. Agents can open panes, browse the web, and control the workspace.',
        paths: ['cloud-ai', 'local-ai'],
        position: 'left',
    },
    {
        selector: '[data-tutorial="conversations"]',
        title: 'Conversations',
        description: 'Your past chats and agent runs. Group by time, NPC, or model; search and filter to find what you need.',
        paths: ['cloud-ai', 'local-ai'],
        position: 'left',
    },
    {
        selector: '[data-tutorial="npcs-section"]',
        title: 'Personas',
        description: 'Your NPCs grouped by team. Click to set the active persona, or use the buttons to start a chat or agent run with that NPC directly.',
        paths: ['cloud-ai', 'local-ai'],
        position: 'left',
    },
    {
        selector: '[data-tutorial="jinxes-section"]',
        title: 'Jinxes & Skills',
        description: 'Jinxes are the tools your NPCs can call — function calls, integrations, UI actions. Skills are higher-level capability packages. Browse, search, and inspect them here.',
        paths: ['cloud-ai', 'local-ai'],
        position: 'left',
    },
    {
        selector: '[data-tutorial="team-management-button"]',
        title: 'Team Management',
        description: 'Open the full team editor — configure NPCs, jinxes, skills, MCP servers, databases, and shared team context.',
        paths: ['cloud-ai', 'local-ai'],
        position: 'left',
    },
    {
        selector: '[data-tutorial="window-manager-button"]',
        title: 'Window Manager',
        description: 'See and switch between all open Incognide windows across your desktop.',
        paths: ['no-ai', 'cloud-ai', 'local-ai'],
        position: 'top',
    },
    {
        selector: '[data-tutorial="theme-toggle-button"]',
        title: 'Light / Dark Mode',
        description: 'Toggle between light and dark themes. Fine-tune colors, hue, saturation, and brightness in Settings → Theme.',
        paths: ['no-ai', 'cloud-ai', 'local-ai'],
        position: 'top',
    },
    {
        selector: '[data-tutorial="account-button"]',
        title: 'Account',
        description: 'Sign in, manage your profile and subscription, set up end-to-end encryption, and control cross-device sync.',
        paths: ['no-ai', 'cloud-ai', 'local-ai'],
        position: 'top',
    },
    {
        selector: '[data-tutorial="new-window-button"]',
        title: 'New Window',
        description: 'Open another Incognide window — useful for working on multiple projects side-by-side. Shortcut: Cmd/Ctrl+Shift+N.',
        paths: ['no-ai', 'cloud-ai', 'local-ai'],
        position: 'top',
    },
    {
        selector: '[data-tutorial="db-tool-button"]',
        title: 'Database Tool',
        description: 'Browse SQLite, Postgres, and other databases. Run queries, inspect schemas, and view results.',
        paths: ['no-ai', 'cloud-ai', 'local-ai'],
        position: 'top',
    },
    {
        selector: '[data-tutorial="downloads-button"]',
        title: 'Downloads',
        description: 'Track files downloaded from the built-in browser and other tools.',
        paths: ['no-ai', 'cloud-ai', 'local-ai'],
        position: 'top',
    },
    {
        selector: '[data-tutorial="data-dash-button"]',
        title: 'Data Dashboard',
        description: 'Aggregate views across your databases, conversations, and memories — charts and summaries of your data.',
        paths: ['no-ai', 'cloud-ai', 'local-ai'],
        position: 'top',
    },
    {
        selector: '[data-tutorial="disk-usage-button"]',
        title: 'Disk Usage',
        description: 'Drill into disk usage for the current folder — find what is taking up space.',
        paths: ['no-ai', 'cloud-ai', 'local-ai'],
        position: 'top',
    },
    {
        selector: '[data-tutorial="pane-indicators"]',
        title: 'Open Panes',
        description: 'Icons for every open pane. Click to bring that pane into focus.',
        paths: ['no-ai', 'cloud-ai', 'local-ai'],
        position: 'top',
    },
    {
        selector: '[data-tutorial="backend-status"]',
        title: 'Python Backend',
        description: 'Status of the local npcpy backend server. Click to open the backend panel; right-click to restart or view logs.',
        paths: ['no-ai', 'cloud-ai', 'local-ai'],
        position: 'top',
    },
    {
        selector: '[data-tutorial="pane-tab-toggle"]',
        title: 'Panes vs Tabs',
        description: 'Switch between pane mode (everything is a split) and tab mode (new content opens as tabs in the active pane).',
        paths: ['no-ai', 'cloud-ai', 'local-ai'],
        position: 'top',
    },
    {
        selector: '[data-tutorial="update-button"]',
        title: 'Auto-Update',
        description: 'Checks for new Incognide versions. Click to download and install when an update is available.',
        paths: ['no-ai', 'cloud-ai', 'local-ai'],
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

    const centerY = Math.max(padding, Math.min(targetRect.top + targetRect.height / 2, vh - padding));
    const centerX = Math.max(padding, Math.min(targetRect.left + targetRect.width / 2, vw - padding));

    const positions = {
        bottom: {
            top: Math.min(targetRect.bottom + gap, vh - tooltipHeight - padding),
            left: Math.max(padding, Math.min(centerX - tooltipWidth / 2, vw - tooltipWidth - padding)),
            arrowSide: 'top' as const,
        },
        top: {
            top: Math.max(padding, targetRect.top - tooltipHeight - gap),
            left: Math.max(padding, Math.min(centerX - tooltipWidth / 2, vw - tooltipWidth - padding)),
            arrowSide: 'bottom' as const,
        },
        right: {
            top: Math.max(padding, Math.min(centerY - tooltipHeight / 2, vh - tooltipHeight - padding)),
            left: Math.min(targetRect.right + gap, vw - tooltipWidth - padding),
            arrowSide: 'left' as const,
        },
        left: {
            top: Math.max(padding, Math.min(centerY - tooltipHeight / 2, vh - tooltipHeight - padding)),
            left: Math.max(padding, targetRect.left - tooltipWidth - gap),
            arrowSide: 'right' as const,
        },
    };

    if (preferred && preferred !== 'auto') {
        const pos = positions[preferred];
        if (pos.top >= padding && pos.top + tooltipHeight <= vh - padding && pos.left >= padding && pos.left + tooltipWidth <= vw - padding) {
            return pos;
        }
    }

    for (const dir of ['bottom', 'right', 'top', 'left'] as const) {
        const pos = positions[dir];
        if (pos.top >= padding && pos.top + tooltipHeight <= vh - padding && pos.left >= padding && pos.left + tooltipWidth <= vw - padding) {
            return pos;
        }
    }

    return {
        top: Math.max(padding, vh / 2 - tooltipHeight / 2),
        left: Math.max(padding, vw / 2 - tooltipWidth / 2),
        arrowSide: 'top',
    };
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

    const steps = TUTORIAL_STEPS.filter((step) => step.paths.includes(userPath));

    const totalSteps = steps.length;
    const step = steps[currentStep];

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

    const goToStep = useCallback((idx: number) => {
        if (idx === currentStep || idx < 0 || idx >= totalSteps) return;
        setIsAnimating(true);
        setTimeout(() => {
            setCurrentStep(idx);
            setIsAnimating(false);
        }, 150);
    }, [currentStep, totalSteps]);

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

                <h3 className="text-sm font-semibold text-white mb-1">{step.title}</h3>

                <p className="text-xs text-gray-300 leading-relaxed mb-4">{step.description}</p>

                <div className="flex items-center gap-1 mb-3">
                    {steps.map((s, i) => (
                        <button
                            key={i}
                            onClick={() => goToStep(i)}
                            title={`${i + 1}. ${s.title}`}
                            className={`h-1 rounded-full transition-all duration-200 cursor-pointer hover:bg-blue-300 ${
                                i === currentStep
                                    ? 'w-4 bg-blue-400'
                                    : i < currentStep
                                    ? 'w-1.5 bg-blue-600'
                                    : 'w-1.5 bg-gray-600'
                            }`}
                        />
                    ))}
                </div>

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
