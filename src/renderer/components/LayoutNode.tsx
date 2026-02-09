import React, { useCallback, memo, useState, useEffect, useRef } from 'react';
import {
    BarChart3, Loader, X, ServerCrash, MessageSquare, BrainCircuit, Bot,
    ChevronDown, ChevronRight, Database, Table, LineChart, BarChart as BarChartIcon,
    Star, Trash2, Play, Copy, Download, Plus, Settings2, Edit, Terminal, Globe,
    GitBranch, Brain, Zap, Clock, ChevronsRight, Repeat, ListFilter, File as FileIcon,
    Image as ImageIcon, Tag, Folder, Users, Settings, Images, BookOpen,
    FolderCog, HardDrive, Tags, Network, LayoutDashboard, Share2, Maximize2, Minimize2,
    FlaskConical, HelpCircle, Search, Music, Save
} from 'lucide-react';
import PaneHeader from './PaneHeader';
import PaneTabBar from './PaneTabBar';
import { getFileName, getFileIcon } from './utils';
import ChatInput from './ChatInput';
import DiffViewer from './DiffViewer';
import { ChatHeaderContent } from './pane-headers';

// Token cost calculator based on model pricing ($ per 1K tokens)
// Source: Helicone LLM API Pricing - Updated Nov 2025
// Prices converted from per 1M to per 1K tokens (divide by 1000)
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
    // OpenAI models
    'gpt-5': { input: 0.00125, output: 0.01 },
    'gpt-5-mini': { input: 0.00025, output: 0.002 },
    'gpt-5-nano': { input: 0.00005, output: 0.0004 },
    'gpt-5.1': { input: 0.00125, output: 0.01 },
    'gpt-4.1': { input: 0.002, output: 0.008 },
    'gpt-4.1-mini': { input: 0.0004, output: 0.0016 },
    'gpt-4.1-nano': { input: 0.0001, output: 0.0004 },
    'gpt-4o': { input: 0.0025, output: 0.01 },
    'gpt-4o-2024-08-06': { input: 0.0025, output: 0.01 },
    'gpt-4o-2024-11-20': { input: 0.0025, output: 0.01 },
    'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
    'gpt-4-turbo': { input: 0.01, output: 0.03 },
    'gpt-4': { input: 0.03, output: 0.06 },
    'gpt-4-32k': { input: 0.06, output: 0.12 },
    'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
    'gpt-3.5-turbo-0125': { input: 0.0005, output: 0.0015 },
    'chatgpt-4o-latest': { input: 0.005, output: 0.015 },
    'o1': { input: 0.015, output: 0.06 },
    'o1-preview': { input: 0.015, output: 0.06 },
    'o1-mini': { input: 0.0011, output: 0.0044 },
    'o1-pro': { input: 0.15, output: 0.6 },
    'o3': { input: 0.002, output: 0.008 },
    'o3-mini': { input: 0.0011, output: 0.0044 },
    'o3-pro': { input: 0.02, output: 0.08 },
    'o4-mini': { input: 0.0011, output: 0.0044 },
    'codex-mini': { input: 0.0015, output: 0.006 },
    // Anthropic models
    'claude-opus-4': { input: 0.015, output: 0.075 },
    'claude-opus-4-1': { input: 0.015, output: 0.075 },
    'claude-opus-4-5': { input: 0.005, output: 0.025 },
    'claude-sonnet-4': { input: 0.003, output: 0.015 },
    'claude-sonnet-4-5': { input: 0.003, output: 0.015 },
    'claude-3.7-sonnet': { input: 0.003, output: 0.015 },
    'claude-3-7-sonnet': { input: 0.003, output: 0.015 },
    'claude-3.5-sonnet': { input: 0.003, output: 0.015 },
    'claude-3-5-sonnet': { input: 0.003, output: 0.015 },
    'claude-3-opus': { input: 0.015, output: 0.075 },
    'claude-3-sonnet': { input: 0.003, output: 0.015 },
    'claude-3-haiku': { input: 0.00025, output: 0.00125 },
    'claude-3.5-haiku': { input: 0.0008, output: 0.004 },
    'claude-3-5-haiku': { input: 0.0008, output: 0.004 },
    'claude-haiku-4-5': { input: 0.001, output: 0.005 },
    'claude-2': { input: 0.008, output: 0.024 },
    'claude-instant': { input: 0.00163, output: 0.00551 },
    // Google models
    'gemini-3-pro': { input: 0.002, output: 0.012 },
    'gemini-2.5-pro': { input: 0.00125, output: 0.01 },
    'gemini-2.5-flash': { input: 0.0003, output: 0.0025 },
    'gemini-2.5-flash-lite': { input: 0.0001, output: 0.0004 },
    'gemini-2.0-flash': { input: 0.0001, output: 0.0004 },
    'gemini-2.0-flash-lite': { input: 0.000075, output: 0.0003 },
    'gemini-1.5-pro': { input: 0.0035, output: 0.0105 },
    'gemini-1.5-flash': { input: 0.00035, output: 0.00105 },
    'gemini-flash-1.5-8b': { input: 0.0000375, output: 0.00015 },
    'gemini-pro': { input: 0.000125, output: 0.000375 },
    'gemma-3-27b': { input: 0.00009, output: 0.00016 },
    'gemma-3-12b': { input: 0.00003, output: 0.0001 },
    'gemma-3-4b': { input: 0.000017, output: 0.0000682 },
    'gemma-2-27b': { input: 0.00065, output: 0.00065 },
    'gemma-2-9b': { input: 0.00001, output: 0.00003 },
    // Meta Llama models
    'llama-4-maverick': { input: 0.00015, output: 0.0006 },
    'llama-4-scout': { input: 0.00008, output: 0.0003 },
    'llama-3.3-70b': { input: 0.00013, output: 0.00038 },
    'llama-3.1-405b': { input: 0.0008, output: 0.0008 },
    'llama-3.1-70b': { input: 0.0004, output: 0.0004 },
    'llama-3.1-8b': { input: 0.00002, output: 0.00003 },
    'llama-3-70b': { input: 0.0003, output: 0.0004 },
    'llama-3-8b': { input: 0.00003, output: 0.00006 },
    'llama-3.2-90b': { input: 0.00035, output: 0.0004 },
    'llama-3.2-11b': { input: 0.000049, output: 0.000049 },
    'llama-3.2-3b': { input: 0.00002, output: 0.00002 },
    'llama-3.2-1b': { input: 0.000005, output: 0.00001 },
    // Mistral models
    'mistral-large': { input: 0.002, output: 0.006 },
    'mistral-medium-3': { input: 0.0004, output: 0.002 },
    'mistral-small': { input: 0.0002, output: 0.0006 },
    'mistral-small-3.1': { input: 0.00005, output: 0.0001 },
    'mistral-small-3.2': { input: 0.0001, output: 0.0003 },
    'mistral-nemo': { input: 0.00002, output: 0.00004 },
    'mistral-saba': { input: 0.0002, output: 0.0006 },
    'ministral-8b': { input: 0.0001, output: 0.0001 },
    'ministral-3b': { input: 0.00004, output: 0.00004 },
    'mixtral-8x22b': { input: 0.002, output: 0.006 },
    'mixtral-8x7b': { input: 0.00054, output: 0.00054 },
    'mistral-7b': { input: 0.000028, output: 0.000054 },
    'codestral': { input: 0.0003, output: 0.0009 },
    'devstral-small': { input: 0.00005, output: 0.00022 },
    'devstral-medium': { input: 0.0004, output: 0.002 },
    'magistral-medium': { input: 0.002, output: 0.005 },
    'magistral-small': { input: 0.0005, output: 0.0015 },
    'pixtral-12b': { input: 0.0001, output: 0.0001 },
    'pixtral-large': { input: 0.002, output: 0.006 },
    // DeepSeek
    'deepseek-r1': { input: 0.0004, output: 0.002 },
    'deepseek-r1-0528': { input: 0.0004, output: 0.00175 },
    'deepseek-r1-distill-llama-70b': { input: 0.00003, output: 0.00013 },
    'deepseek-r1-distill-qwen-32b': { input: 0.00027, output: 0.00027 },
    'deepseek-r1-distill-qwen-14b': { input: 0.00015, output: 0.00015 },
    'deepseek-v3': { input: 0.0009, output: 0.0009 },
    'deepseek-v3-0324': { input: 0.00024, output: 0.00084 },
    'deepseek-chat': { input: 0.0003, output: 0.00085 },
    'deepseek-prover-v2': { input: 0.0005, output: 0.00218 },
    // X/Grok
    'grok-4': { input: 0.003, output: 0.015 },
    'grok-4-fast': { input: 0.0002, output: 0.0005 },
    'grok-3': { input: 0.003, output: 0.015 },
    'grok-3-mini': { input: 0.0003, output: 0.0005 },
    'grok-3-fast': { input: 0.005, output: 0.025 },
    'grok-2': { input: 0.002, output: 0.01 },
    'grok-beta': { input: 0.005, output: 0.015 },
    'grok-code-fast-1': { input: 0.0002, output: 0.0015 },
    // Qwen
    'qwen-max': { input: 0.0016, output: 0.0064 },
    'qwen-plus': { input: 0.0004, output: 0.0012 },
    'qwen-turbo': { input: 0.00005, output: 0.0002 },
    'qwen3-235b': { input: 0.00018, output: 0.00054 },
    'qwen3-coder': { input: 0.00022, output: 0.00095 },
    'qwen3-32b': { input: 0.00005, output: 0.0002 },
    'qwen3-30b': { input: 0.00006, output: 0.00022 },
    'qwen3-14b': { input: 0.00005, output: 0.00022 },
    'qwen3-8b': { input: 0.000035, output: 0.000138 },
    'qwen3-4b': { input: 0, output: 0 },
    'qwen2.5-coder-32b': { input: 0.00004, output: 0.00016 },
    'qwen2.5-72b': { input: 0.00007, output: 0.00026 },
    'qwen2.5-vl-72b': { input: 0.00008, output: 0.00033 },
    'qwq-32b': { input: 0.00015, output: 0.0004 },
    // Cohere
    'command-a': { input: 0.0025, output: 0.01 },
    'command-r-plus': { input: 0.0025, output: 0.01 },
    'command-r': { input: 0.00015, output: 0.0006 },
    'command-r7b': { input: 0.0000375, output: 0.00015 },
    // Perplexity
    'sonar': { input: 0.001, output: 0.001 },
    'sonar-pro': { input: 0.003, output: 0.015 },
    'sonar-reasoning': { input: 0.001, output: 0.005 },
    'sonar-reasoning-pro': { input: 0.002, output: 0.008 },
    'sonar-deep-research': { input: 0.002, output: 0.008 },
    // Amazon
    'nova-pro': { input: 0.0008, output: 0.0032 },
    'nova-lite': { input: 0.00006, output: 0.00024 },
    'nova-micro': { input: 0.000035, output: 0.00014 },
    // MiniMax
    'minimax-01': { input: 0.0002, output: 0.0011 },
    'minimax-m1': { input: 0.0004, output: 0.0022 },
    // Moonshot/Kimi
    'kimi-k2': { input: 0.00014, output: 0.00249 },
    'kimi-dev-72b': { input: 0.00029, output: 0.00115 },
    // AI21
    'jamba-mini': { input: 0.0002, output: 0.0004 },
    'jamba-large': { input: 0.002, output: 0.008 },
    // Groq (fast inference - prices vary)
    'groq-llama-3.3-70b': { input: 0.00059, output: 0.00079 },
    'groq-llama-3.1-8b': { input: 0.00005, output: 0.00008 },
    'groq-mixtral-8x7b': { input: 0.00024, output: 0.00024 },
    'groq-gemma2-9b': { input: 0.0002, output: 0.0002 },
    // Inflection
    'inflection-3-productivity': { input: 0.0025, output: 0.01 },
    'inflection-3-pi': { input: 0.0025, output: 0.01 },
    // Microsoft Phi
    'phi-4': { input: 0.00006, output: 0.00014 },
    'phi-4-multimodal': { input: 0.00005, output: 0.0001 },
    'phi-4-reasoning-plus': { input: 0.00007, output: 0.00035 },
    'phi-3.5-mini': { input: 0.0001, output: 0.0001 },
    'phi-3-mini': { input: 0.0001, output: 0.0001 },
    'phi-3-medium': { input: 0.001, output: 0.001 },
    // Nvidia
    'nemotron-70b': { input: 0.0006, output: 0.0006 },
    'nemotron-ultra-253b': { input: 0.0006, output: 0.0018 },
    'nemotron-nano-9b': { input: 0.00004, output: 0.00016 },
    // Morph
    'morph-v3-large': { input: 0.0009, output: 0.0019 },
    'morph-v3-fast': { input: 0.0008, output: 0.0012 },
    // Mercury/Inception
    'mercury': { input: 0.00025, output: 0.001 },
    'mercury-coder': { input: 0.00025, output: 0.001 },
    // Local/self-hosted models (free)
    'ollama': { input: 0, output: 0 },
    'local': { input: 0, output: 0 },
    'localhost': { input: 0, output: 0 },
    'llama': { input: 0, output: 0 },
    'llama3': { input: 0, output: 0 },
    'llama3.1': { input: 0, output: 0 },
    'llama3.2': { input: 0, output: 0 },
    'mistral': { input: 0, output: 0 },
    'codellama': { input: 0, output: 0 },
    'deepseek-coder': { input: 0, output: 0 },
    'qwen2': { input: 0, output: 0 },
    'phi': { input: 0, output: 0 },
    'gemma': { input: 0, output: 0 },
    'nomic': { input: 0, output: 0 },
};

const calculateTokenCost = (tokenCount: number, models: Set<string>): number => {
    if (!tokenCount || tokenCount === 0) return 0;

    // Find the most expensive model used to give upper bound estimate
    let maxCostPer1K = 0;
    models?.forEach(model => {
        const modelLower = model?.toLowerCase() || '';
        for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
            if (modelLower.includes(key)) {
                const avgCost = (pricing.input + pricing.output) / 2;
                if (avgCost > maxCostPer1K) maxCostPer1K = avgCost;
                break;
            }
        }
    });

    // If no known model, assume a mid-range cost
    if (maxCostPer1K === 0 && models?.size > 0) {
        maxCostPer1K = 0.002; // Default estimate
    }

    return (tokenCount / 1000) * maxCostPer1K;
};

// Generate a unique ID for layout nodes
const generateLayoutId = () => `layout-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// Collect all pane IDs from a layout node
export const collectPaneIds = (node: any): string[] => {
    if (!node) return [];
    if (node.type === 'content') return [node.id];
    if (node.type === 'split') {
        return node.children.flatMap((child: any) => collectPaneIds(child));
    }
    return [];
};

// Build a balanced grid layout from pane IDs
// Returns a layout tree where rows and columns differ by at most 1
export const buildBalancedGridLayout = (paneIds: string[]): any => {
    if (paneIds.length === 0) return null;
    if (paneIds.length === 1) {
        return { id: paneIds[0], type: 'content' };
    }

    const totalPanes = paneIds.length;
    const cols = Math.ceil(Math.sqrt(totalPanes));
    const rows = Math.ceil(totalPanes / cols);

    const rowNodes: any[] = [];
    let paneIndex = 0;

    for (let r = 0; r < rows && paneIndex < paneIds.length; r++) {
        const panesInThisRow = Math.min(cols, paneIds.length - paneIndex);
        const rowPaneIds = paneIds.slice(paneIndex, paneIndex + panesInThisRow);
        paneIndex += panesInThisRow;

        if (rowPaneIds.length === 1) {
            rowNodes.push({ id: rowPaneIds[0], type: 'content' });
        } else {
            rowNodes.push({
                id: generateLayoutId(),
                type: 'split',
                direction: 'horizontal',
                children: rowPaneIds.map(id => ({ id, type: 'content' })),
                sizes: new Array(rowPaneIds.length).fill(100 / rowPaneIds.length)
            });
        }
    }

    if (rowNodes.length === 1) {
        return rowNodes[0];
    }

    return {
        id: generateLayoutId(),
        type: 'split',
        direction: 'vertical',
        children: rowNodes,
        sizes: new Array(rowNodes.length).fill(100 / rowNodes.length)
    };
};

// Add a new pane to an existing layout using balanced grid
// This rebuilds the entire layout as a balanced grid
export const addPaneToLayout = (oldRoot: any, newPaneId: string): any => {
    if (!oldRoot) {
        return { id: newPaneId, type: 'content' };
    }

    const existingPaneIds = collectPaneIds(oldRoot);
    const allPaneIds = [...existingPaneIds, newPaneId];
    return buildBalancedGridLayout(allPaneIds);
};

// Exported utility function for syncing layout with content data
// IMPORTANT: This function removes layout nodes that don't have valid content to prevent empty panes
export const syncLayoutWithContentData = (layoutNode: any, contentData: Record<string, any>): any => {
    if (!layoutNode) {
        // If layoutNode is null, ensure contentData is also empty
        if (Object.keys(contentData).length > 0) {
            console.log('[SYNC] Layout node is null, clearing contentData.');
            for (const key in contentData) {
                delete contentData[key];
            }
        }
        return null; // Return null if the layout itself is null
    }

    // First, identify which panes have valid content (have contentType)
    const validContentPaneIds = new Set(
        Object.entries(contentData)
            .filter(([_, data]) => data?.contentType)
            .map(([id]) => id)
    );

    // Clean the layout to remove pane nodes without valid content
    const cleanLayout = (node: any): any => {
        if (!node) return null;
        if (node.type === 'content') {
            // Remove this pane if it doesn't have valid content
            if (!validContentPaneIds.has(node.id)) {
                console.warn('[SYNC] Removing pane from layout (no valid content):', node.id);
                // Also remove from contentData if it exists but is empty
                if (contentData[node.id] && !contentData[node.id].contentType) {
                    delete contentData[node.id];
                }
                return null;
            }
            return node;
        }
        if (node.type === 'split') {
            const cleanedChildren = node.children
                .map((child: any) => cleanLayout(child))
                .filter((child: any) => child !== null);
            if (cleanedChildren.length === 0) return null;
            if (cleanedChildren.length === 1) return cleanedChildren[0];
            return { ...node, children: cleanedChildren, sizes: new Array(cleanedChildren.length).fill(100 / cleanedChildren.length) };
        }
        return node;
    };

    const cleanedLayout = cleanLayout(layoutNode);

    // Remove orphaned panes from contentData (not in layout anymore)
    const collectPaneIds = (node: any): Set<string> => {
        if (!node) return new Set();
        if (node.type === 'content') return new Set([node.id]);
        if (node.type === 'split') {
            return node.children.reduce((acc: Set<string>, child: any) => {
                const childIds = collectPaneIds(child);
                childIds.forEach(id => acc.add(id));
                return acc;
            }, new Set());
        }
        return new Set();
    };

    const paneIdsInCleanedLayout = collectPaneIds(cleanedLayout);
    Object.keys(contentData).forEach(id => {
        if (!paneIdsInCleanedLayout.has(id)) {
            // Only remove if the pane has no valid content
            // Panes with valid contentType might be pending layout updates (race condition)
            if (!contentData[id]?.contentType) {
                console.warn('[SYNC] Removing orphaned empty pane from contentData:', id);
                delete contentData[id];
            }
        }
    });

    return cleanedLayout;
};

// CODE FRAGMENTS BELOW - These are incomplete code snippets meant to be inside Enpistu.tsx
// They reference parent scope variables and can't work as standalone exports
// Commenting out to prevent module-level execution errors

/*
const cleanupPhantomPanes = useCallback(() => {
  const validPaneIds = new Set();

  const collectPaneIds = (node) => {
    if (!node) return;
    if (node.type === 'content') validPaneIds.add(node.id);
    if (node.type === 'split') {
      node.children.forEach(collectPaneIds);
    }
  };

  collectPaneIds(rootLayoutNode);

  // Remove any contentDataRef entries not in the layout
  Object.keys(contentDataRef.current).forEach(paneId => {
    if (!validPaneIds.has(paneId)) {
      console.log(`Removing phantom pane: ${paneId}`);
      delete contentDataRef.current[paneId];
    }
  });
}, [rootLayoutNode]);

const renderPaneContextMenu = () => {
  if (!paneContextMenu?.isOpen) return null;
  const { x, y, nodeId, nodePath } = paneContextMenu;

  const closePane = () => {
    closeContentPane(nodeId, nodePath);
    setPaneContextMenu(null);
  };

  const splitPane = (side) => {
    performSplit(nodePath, side, 'chat', null); // or appropriate contentType and contentId
    setPaneContextMenu(null);
  };

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={() => setPaneContextMenu(null)} />
      <div
        className="fixed theme-bg-secondary theme-border border rounded shadow-lg py-1 z-50 text-sm"
        style={{ top: y, left: x }}
        onMouseLeave={() => setPaneContextMenu(null)}
      >
        <button onClick={closePane} className="block px-4 py-2 w-full text-left theme-hover">
          Close Pane
        </button>
        <div className="border-t theme-border my-1" />
        <button onClick={() => splitPane('left')} className="block px-4 py-2 w-full text-left theme-hover">
          Split Left
        </button>
        <button onClick={() => splitPane('right')} className="block px-4 py-2 w-full text-left theme-hover">
          Split Right
        </button>
        <button onClick={() => splitPane('top')} className="block px-4 py-2 w-full text-left theme-hover">
          Split Top
        </button>
        <button onClick={() => splitPane('bottom')} className="block px-4 py-2 w-full text-left theme-hover">
          Split Bottom
        </button>
      </div>
    </>
  );
};
*/

// End of commented-out fragments

export const LayoutNode = memo(({ node, path, component }) => {
    if (!node) return null;

    if (node.type === 'split') {
        const handleResize = (e, index) => {
            e.preventDefault();
            const parentNode = component.findNodeByPath(component.rootLayoutNode, path);
            if (!parentNode) return;
            const startSizes = [...parentNode.sizes];
            const isHorizontal = parentNode.direction === 'horizontal';
            const startPos = isHorizontal ? e.clientX : e.clientY;
            const container = e.currentTarget.parentElement;
            const containerSize = isHorizontal ? container.offsetWidth : container.offsetHeight;

            // Get the child elements for direct DOM manipulation during drag
            const childElements = Array.from(container.children).filter(
                (el: Element) => !el.classList.contains('cursor-col-resize') && !el.classList.contains('cursor-row-resize')
            ) as HTMLElement[];

            let currentSizes = [...startSizes];

            const cleanup = () => {
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
                document.removeEventListener('keydown', onKeyDown);
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
                document.body.classList.remove('layout-resizing');
            };

            const onMouseMove = (moveEvent: MouseEvent) => {
                const currentPos = isHorizontal ? moveEvent.clientX : moveEvent.clientY;
                const deltaPercent = ((currentPos - startPos) / containerSize) * 100;
                const newSizes = [...startSizes];
                const amount = Math.min(newSizes[index + 1] - 5, Math.max(-(newSizes[index] - 5), deltaPercent));
                newSizes[index] += amount;
                newSizes[index + 1] -= amount;
                currentSizes = newSizes;

                // Direct DOM update for smooth resizing (no React re-render)
                childElements.forEach((el, i) => {
                    if (newSizes[i] !== undefined) {
                        el.style.flexBasis = `${newSizes[i]}%`;
                    }
                });
            };

            const onKeyDown = (keyEvent: KeyboardEvent) => {
                if (keyEvent.key === 'Escape') {
                    keyEvent.preventDefault();
                    // Restore original sizes via DOM
                    childElements.forEach((el, i) => {
                        if (startSizes[i] !== undefined) {
                            el.style.flexBasis = `${startSizes[i]}%`;
                        }
                    });
                    cleanup();
                }
            };

            const onMouseUp = () => {
                // Commit final sizes to React state
                component.setRootLayoutNode((currentRoot: any) => {
                    const newRoot = JSON.parse(JSON.stringify(currentRoot));
                    const target = component.findNodeByPath(newRoot, path);
                    if (target) target.sizes = currentSizes;
                    return newRoot;
                });
                cleanup();
            };

            // Set cursor for entire document during drag
            document.body.style.cursor = isHorizontal ? 'col-resize' : 'row-resize';
            document.body.style.userSelect = 'none';
            // Add class to block webview interaction during resize
            document.body.classList.add('layout-resizing');

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp, { once: true });
            document.addEventListener('keydown', onKeyDown);
        };

        return (
            <div className={`flex flex-1 ${node.direction === 'horizontal' ? 'flex-row' : 'flex-col'} w-full h-full overflow-hidden`}>
                {node.children.map((child, index) => (
                    <React.Fragment key={child.id}>
                        <div className="flex overflow-hidden" style={{ flexBasis: `${node.sizes[index]}%` }}>
                            <LayoutNode node={child} path={[...path, index]} component={component} />
                        </div>
                        {index < node.children.length - 1 && (
                            <div
                                className={`flex-shrink-0 relative flex items-center justify-center group ${node.direction === 'horizontal' ? 'w-2 cursor-col-resize' : 'h-2 cursor-row-resize'}`}
                                onMouseDown={(e) => handleResize(e, index)}
                                style={{ touchAction: 'none' }}
                            >
                                {/* Visible resize bar - smaller visual but larger hit area via parent */}
                                <div className={`${node.direction === 'horizontal' ? 'w-px h-full' : 'h-px w-full'} bg-gray-600 group-hover:bg-blue-500 group-active:bg-blue-400 transition-colors`} />
                            </div>
                        )}
                    </React.Fragment>
                ))}
            </div>
        );
    }

    if (node.type === 'content') {
        const { activeContentPaneId, setActiveContentPaneId, draggedItem,
            setDraggedItem, dropTarget, setDropTarget, contentDataRef,
            updateContentPane, performSplit, setRootLayoutNode,
            paneRenderers,
            moveContentPane,
            findNodePath, rootLayoutNode, setPaneContextMenu, closeContentPane,
            // Destructure the new chat-specific props from component:
            autoScrollEnabled, setAutoScrollEnabled,
            messageSelectionMode, toggleMessageSelectionMode, selectedMessages,
            conversationBranches, showBranchingUI, setShowBranchingUI,
            // ChatInput props function for rendering input in chat panes (takes paneId)
            getChatInputProps,
            // Zen mode props
            zenModePaneId, toggleZenMode,
            // Renaming props
            renamingPaneId, setRenamingPaneId, editedFileName, setEditedFileName, handleConfirmRename,
            // Script running
            onRunScript,
            // Top bar collapse
            topBarCollapsed,
            onExpandTopBar,
            // Current working directory
            currentPath,
        } = component;

        // Get chat input props for this specific pane
        const chatInputProps = getChatInputProps ? getChatInputProps(node.id) : null;

        const isActive = node.id === activeContentPaneId;
        const isTargeted = dropTarget?.nodePath.join('') === path.join('');

        const onDrop = (e, side) => {
            e.preventDefault();
            e.stopPropagation();
            if (!component.draggedItem) return;

            if (component.draggedItem.type === 'pane') {
                if (component.draggedItem.id === node.id) return;

                // When dropping pane on CENTER, add it as a tab instead of moving
                if (side === 'center') {
                    const sourcePaneData = contentDataRef.current[component.draggedItem.id];
                    const targetPaneData = contentDataRef.current[node.id];

                    if (sourcePaneData?.contentType && targetPaneData) {
                        // Initialize target tabs if needed
                        if (!targetPaneData.tabs || targetPaneData.tabs.length === 0) {
                            const targetTitle = targetPaneData.contentType === 'browser'
                                ? (targetPaneData.browserUrl || 'Browser')
                                : (getFileName(targetPaneData.contentId) || targetPaneData.contentType);
                            targetPaneData.tabs = [{
                                id: `tab_${Date.now()}_0`,
                                contentType: targetPaneData.contentType,
                                contentId: targetPaneData.contentId,
                                browserUrl: targetPaneData.browserUrl, // Preserve browser URL
                                fileContent: targetPaneData.fileContent, // Preserve file content
                                fileChanged: targetPaneData.fileChanged, // Preserve file changed state
                                title: targetTitle
                            }];
                            targetPaneData.activeTabIndex = 0;
                        }

                        // If source pane has tabs, add all of them
                        if (sourcePaneData.tabs && sourcePaneData.tabs.length > 0) {
                            sourcePaneData.tabs.forEach(tab => {
                                targetPaneData.tabs.push({
                                    ...tab,
                                    id: `tab_${Date.now()}_${targetPaneData.tabs.length}`
                                });
                            });
                        } else {
                            // Add source content as a single new tab
                            const sourceTitle = sourcePaneData.contentType === 'browser'
                                ? (sourcePaneData.browserUrl || 'Browser')
                                : (getFileName(sourcePaneData.contentId) || sourcePaneData.contentType);
                            targetPaneData.tabs.push({
                                id: `tab_${Date.now()}_${targetPaneData.tabs.length}`,
                                contentType: sourcePaneData.contentType,
                                contentId: sourcePaneData.contentId,
                                browserUrl: sourcePaneData.browserUrl, // Preserve browser URL
                                fileContent: sourcePaneData.fileContent, // Preserve file content
                                fileChanged: sourcePaneData.fileChanged, // Preserve file changed state
                                title: sourceTitle
                            });
                        }

                        // Switch to the newly added tab
                        targetPaneData.activeTabIndex = targetPaneData.tabs.length - 1;
                        const activeTab = targetPaneData.tabs[targetPaneData.activeTabIndex];
                        targetPaneData.contentType = activeTab.contentType;
                        targetPaneData.contentId = activeTab.contentId;
                        // Preserve browserUrl for browser tabs
                        if (activeTab.contentType === 'browser' && activeTab.browserUrl) {
                            targetPaneData.browserUrl = activeTab.browserUrl;
                        }
                        // Preserve fileContent for editor tabs
                        if (activeTab.contentType === 'editor' && activeTab.fileContent !== undefined) {
                            targetPaneData.fileContent = activeTab.fileContent;
                            targetPaneData.fileChanged = activeTab.fileChanged || false;
                        }

                        // Close the source pane
                        closeContentPane(component.draggedItem.id, component.draggedItem.nodePath);

                        setRootLayoutNode?.(prev => ({ ...prev }));
                        component.setDraggedItem(null);
                        component.setDropTarget(null);
                        return;
                    }
                }

                // For non-center drops, use normal move behavior
                component.moveContentPane(component.draggedItem.id, component.draggedItem.nodePath, path, side);
                component.setDraggedItem(null);
                component.setDropTarget(null);
                return;
            }

            // Handle tab drag from another pane's tab bar
            if (component.draggedItem.type === 'tab') {
                const { sourceNodeId, tabIndex, contentType: tabContentType, contentId: tabContentId, browserUrl, fileContent, fileChanged } = component.draggedItem;
                const targetPaneData = contentDataRef.current[node.id];
                const sourcePaneData = contentDataRef.current[sourceNodeId];

                // Don't drop on the same pane's center (that's reorder, handled by PaneTabBar)
                if (sourceNodeId === node.id && side === 'center') {
                    component.setDraggedItem(null);
                    component.setDropTarget(null);
                    return;
                }

                if (side === 'center' && targetPaneData) {
                    // Add as tab to target pane
                    if (!targetPaneData.tabs || targetPaneData.tabs.length === 0) {
                        const targetTitle = targetPaneData.contentType === 'browser'
                            ? (targetPaneData.browserUrl || 'Browser')
                            : (getFileName(targetPaneData.contentId) || targetPaneData.contentType);
                        targetPaneData.tabs = [{
                            id: `tab_${Date.now()}_0`,
                            contentType: targetPaneData.contentType,
                            contentId: targetPaneData.contentId,
                            browserUrl: targetPaneData.browserUrl,
                            fileContent: targetPaneData.fileContent,
                            fileChanged: targetPaneData.fileChanged,
                            title: targetTitle
                        }];
                        targetPaneData.activeTabIndex = 0;
                    }

                    // Add the dragged tab
                    const newTabTitle = tabContentType === 'browser'
                        ? (browserUrl || tabContentId || 'Browser')
                        : (getFileName(tabContentId) || tabContentType);
                    targetPaneData.tabs.push({
                        id: `tab_${Date.now()}_${targetPaneData.tabs.length}`,
                        contentType: tabContentType,
                        contentId: tabContentId,
                        browserUrl,
                        fileContent,
                        fileChanged,
                        title: newTabTitle
                    });
                    targetPaneData.activeTabIndex = targetPaneData.tabs.length - 1;
                    targetPaneData.contentType = tabContentType;
                    targetPaneData.contentId = tabContentId;
                    if (tabContentType === 'browser' && browserUrl) {
                        targetPaneData.browserUrl = browserUrl;
                    }
                } else {
                    // Create new pane with the tab's content
                    // Track existing pane IDs before split to find the new one
                    const existingPaneIds = new Set(Object.keys(contentDataRef.current));
                    performSplit(path, side, tabContentType, tabContentId);

                    // Find the newly created pane and set browserUrl directly
                    if (tabContentType === 'browser' && browserUrl) {
                        const newPaneId = Object.keys(contentDataRef.current).find(id => !existingPaneIds.has(id));
                        if (newPaneId && contentDataRef.current[newPaneId]) {
                            contentDataRef.current[newPaneId].browserUrl = browserUrl;
                        }
                    }
                }

                // Remove the tab from source pane
                if (sourcePaneData?.tabs && sourcePaneData.tabs.length > 0) {
                    sourcePaneData.tabs.splice(tabIndex, 1);
                    if (sourcePaneData.tabs.length === 0) {
                        // Close the pane if no tabs left
                        const sourcePath = component.draggedItem.sourcePath || findNodePath(rootLayoutNode, sourceNodeId);
                        if (sourcePath) closeContentPane(sourceNodeId, sourcePath);
                    } else {
                        // Adjust active index
                        if (sourcePaneData.activeTabIndex >= sourcePaneData.tabs.length) {
                            sourcePaneData.activeTabIndex = sourcePaneData.tabs.length - 1;
                        }
                        const newActiveTab = sourcePaneData.tabs[sourcePaneData.activeTabIndex];
                        sourcePaneData.contentType = newActiveTab.contentType;
                        sourcePaneData.contentId = newActiveTab.contentId;
                        if (newActiveTab.contentType === 'browser') {
                            sourcePaneData.browserUrl = newActiveTab.browserUrl;
                        }
                    }
                }

                setRootLayoutNode?.(prev => ({ ...prev }));
                component.setDraggedItem(null);
                component.setDropTarget(null);
                return;
            }

            let contentType;
            if (draggedItem.type === 'conversation') {
                contentType = 'chat';
            } else if (draggedItem.type === 'folder') {
                contentType = 'folder';
            } else if (draggedItem.type === 'file') {
                const ext = draggedItem.id.split('.').pop()?.toLowerCase();
                if (ext === 'pdf') contentType = 'pdf';
                else if (['csv', 'xlsx', 'xls'].includes(ext)) contentType = 'csv';
                else if (['docx', 'doc'].includes(ext)) contentType = 'docx';
                else if (ext === 'pptx') contentType = 'pptx';
                else if (ext === 'tex') contentType = 'latex';
                else if (ext === 'mindmap') contentType = 'mindmap';
                else if (ext === 'zip') contentType = 'zip';
                else contentType = 'editor';
            } else if (draggedItem.type === 'browser') {
                contentType = 'browser';
            } else if (draggedItem.type === 'terminal') {
                contentType = 'terminal';
            } else {
                return;
            }

            if (side === 'center') {
                const paneData = contentDataRef.current[node.id];
                // Dropping on center ALWAYS adds as a tab (not replace)
                if (paneData?.contentType) {
                    // Initialize tabs if this pane doesn't have them yet
                    if (!paneData.tabs || paneData.tabs.length === 0) {
                        // Convert current content to first tab
                        const currentTitle = paneData.contentType === 'browser'
                            ? (paneData.browserUrl || 'Browser')
                            : (getFileName(paneData.contentId) || paneData.contentType);
                        paneData.tabs = [{
                            id: `tab_${Date.now()}_0`,
                            contentType: paneData.contentType,
                            contentId: paneData.contentId,
                            browserUrl: paneData.browserUrl, // Preserve browser URL
                            fileContent: paneData.fileContent, // Preserve file content
                            fileChanged: paneData.fileChanged, // Preserve file changed state
                            title: currentTitle
                        }];
                        paneData.activeTabIndex = 0;
                    }
                    // Add new content as new tab
                    const browserUrl = draggedItem.url || draggedItem.browserUrl; // Support both property names
                    const newTabTitle = contentType === 'browser'
                        ? (browserUrl || draggedItem.id || 'Browser')
                        : (getFileName(draggedItem.id) || contentType);
                    const newTab = {
                        id: `tab_${Date.now()}_${paneData.tabs.length}`,
                        contentType,
                        contentId: draggedItem.id,
                        browserUrl: browserUrl, // Preserve browser URL from dragged item
                        fileContent: draggedItem.fileContent, // Preserve file content from dragged item
                        fileChanged: draggedItem.fileChanged, // Preserve file changed state
                        title: newTabTitle
                    };
                    // Save current tab's content before switching to new tab
                    const currentTabIndex = paneData.activeTabIndex || 0;
                    if (paneData.tabs[currentTabIndex]) {
                        paneData.tabs[currentTabIndex].fileContent = paneData.fileContent;
                        paneData.tabs[currentTabIndex].fileChanged = paneData.fileChanged;
                    }

                    paneData.tabs.push(newTab);
                    paneData.activeTabIndex = paneData.tabs.length - 1;
                    // Update main paneData to reflect the new active tab
                    paneData.contentType = contentType;
                    paneData.contentId = draggedItem.id;
                    // Clear fileContent for new tab (will be loaded below if editor)
                    paneData.fileContent = null;
                    paneData.fileChanged = false;
                    if (contentType === 'browser' && browserUrl) {
                        paneData.browserUrl = browserUrl;
                    }

                    // For editor files, load the content if not already loaded
                    if (contentType === 'editor' && !draggedItem.fileContent) {
                        // Load file content asynchronously
                        (async () => {
                            try {
                                const response = await (window as any).api.readFileContent(draggedItem.id);
                                const fileContent = response.error ? `Error: ${response.error}` : response.content;
                                paneData.fileContent = fileContent;
                                // Also update the tab's fileContent
                                const tabIndex = paneData.tabs.length - 1;
                                if (paneData.tabs[tabIndex]) {
                                    paneData.tabs[tabIndex].fileContent = fileContent;
                                }
                                setRootLayoutNode?.(prev => ({ ...prev }));
                            } catch (err) {
                                console.error('Error loading file content:', err);
                            }
                        })();
                    }

                    setRootLayoutNode?.(prev => ({ ...prev }));
                } else {
                    // Empty pane - just set content directly
                    updateContentPane(node.id, contentType, draggedItem.id);
                }
            } else {
                performSplit(path, side, contentType, draggedItem.id);
                // For browser splits, we need to set the browserUrl after performSplit creates the pane
                // performSplit sets contentDataRef synchronously, so we can update it immediately
                if (contentType === 'browser' && browserUrl) {
                    // Find the newly created pane and set its browserUrl
                    // performSplit creates a new pane ID, but we don't have access to it here
                    // We need to update performSplit to accept additional data, or handle this differently
                    // For now, we'll check all panes for new browser panes without a URL
                    setTimeout(() => {
                        Object.entries(contentDataRef.current).forEach(([id, data]) => {
                            if (data.contentType === 'browser' && data.contentId === draggedItem.id && !data.browserUrl) {
                                data.browserUrl = browserUrl;
                            }
                        });
                    }, 0);
                }
            }
            setDraggedItem(null);
            setDropTarget(null);
        };

        const paneData = contentDataRef.current[node.id];

        // Tab support: only show tabs when there are multiple
        const tabs = paneData?.tabs || [];
        const activeTabIndex = paneData?.activeTabIndex ?? 0;
        const showTabBar = tabs.length > 1; // Only show when multiple tabs

        // Get content type/id from active tab if tabs exist, otherwise use paneData directly
        const activeTab = tabs.length > 0 ? tabs[activeTabIndex] : null;
        const contentType = activeTab?.contentType || paneData?.contentType;
        const contentId = activeTab?.contentId || paneData?.contentId;

        // Tab management handlers
        const handleTabSelect = (index: number) => {
            if (paneData && tabs[index]) {
                // Save current tab's content before switching
                const currentTabIndex = paneData.activeTabIndex || 0;
                if (tabs[currentTabIndex]) {
                    tabs[currentTabIndex].fileContent = paneData.fileContent;
                    tabs[currentTabIndex].fileChanged = paneData.fileChanged;
                    // IMPORTANT: Save browserUrl and browserTitle for browser tabs
                    if (tabs[currentTabIndex].contentType === 'browser') {
                        if (paneData.browserUrl) tabs[currentTabIndex].browserUrl = paneData.browserUrl;
                        if (paneData.browserTitle) tabs[currentTabIndex].browserTitle = paneData.browserTitle;
                    }
                }

                paneData.activeTabIndex = index;
                // Update paneData with the selected tab's content
                const selectedTab = tabs[index];
                paneData.contentType = selectedTab.contentType;
                paneData.contentId = selectedTab.contentId;
                // Restore fileContent and fileChanged from the selected tab
                paneData.fileContent = selectedTab.fileContent;
                paneData.fileChanged = selectedTab.fileChanged || false;
                // Preserve browserUrl and browserTitle for browser tabs
                if (selectedTab.contentType === 'browser') {
                    paneData.browserUrl = selectedTab.browserUrl || 'about:blank';
                    paneData.browserTitle = selectedTab.browserTitle || 'Browser';
                }
                // Force re-render
                setRootLayoutNode?.(prev => ({ ...prev }));
            }
        };

        const handleTabClose = (index: number) => {
            if (paneData && tabs.length > 0) {
                // Save current tab state before closing
                const currentTabIndex = paneData.activeTabIndex || 0;
                if (tabs[currentTabIndex]) {
                    // Save browser URL/title for browser tabs
                    if (tabs[currentTabIndex].contentType === 'browser') {
                        if (paneData.browserUrl) tabs[currentTabIndex].browserUrl = paneData.browserUrl;
                        if (paneData.browserTitle) tabs[currentTabIndex].browserTitle = paneData.browserTitle;
                    }
                    // Save file content for editor tabs
                    if (tabs[currentTabIndex].contentType === 'editor') {
                        tabs[currentTabIndex].fileContent = paneData.fileContent;
                        tabs[currentTabIndex].fileChanged = paneData.fileChanged;
                    }
                }

                const newTabs = [...tabs];
                newTabs.splice(index, 1);

                if (newTabs.length === 0) {
                    // Close the pane if no tabs left
                    closeContentPane(node.id, path);
                } else {
                    paneData.tabs = newTabs;
                    // Adjust active index if needed
                    if (paneData.activeTabIndex >= newTabs.length) {
                        paneData.activeTabIndex = newTabs.length - 1;
                    }
                    // Restore state from new active tab
                    const newActiveTab = newTabs[paneData.activeTabIndex];
                    if (newActiveTab) {
                        paneData.contentType = newActiveTab.contentType;
                        paneData.contentId = newActiveTab.contentId;
                    }
                    if (newActiveTab?.contentType === 'browser' && newActiveTab.browserUrl) {
                        paneData.browserUrl = newActiveTab.browserUrl;
                        paneData.browserTitle = newActiveTab.browserTitle || 'Browser';
                    }
                    // Restore file content for editor tabs
                    if (newActiveTab?.contentType === 'editor') {
                        paneData.fileContent = newActiveTab.fileContent;
                        paneData.fileChanged = newActiveTab.fileChanged || false;
                    }
                    setRootLayoutNode?.(prev => ({ ...prev }));
                }
            }
        };

        const handleTabReorder = (fromIndex: number, toIndex: number) => {
            if (paneData && tabs.length > 0) {
                // Save current tab state before reordering
                const currentTabIndex = paneData.activeTabIndex || 0;
                if (tabs[currentTabIndex]) {
                    if (tabs[currentTabIndex].contentType === 'browser' && paneData.browserUrl) {
                        tabs[currentTabIndex].browserUrl = paneData.browserUrl;
                    }
                    if (tabs[currentTabIndex].contentType === 'editor') {
                        tabs[currentTabIndex].fileContent = paneData.fileContent;
                        tabs[currentTabIndex].fileChanged = paneData.fileChanged;
                    }
                }

                const newTabs = [...tabs];
                const [movedTab] = newTabs.splice(fromIndex, 1);
                newTabs.splice(toIndex, 0, movedTab);
                paneData.tabs = newTabs;
                // Update active index to follow the moved tab if it was active
                if (paneData.activeTabIndex === fromIndex) {
                    paneData.activeTabIndex = toIndex;
                } else if (fromIndex < paneData.activeTabIndex && toIndex >= paneData.activeTabIndex) {
                    paneData.activeTabIndex--;
                } else if (fromIndex > paneData.activeTabIndex && toIndex <= paneData.activeTabIndex) {
                    paneData.activeTabIndex++;
                }
                setRootLayoutNode?.(prev => ({ ...prev }));
            }
        };

        // Handler for adding new tabs from the + button
        const handleAddTab = (contentType: string) => {
            if (paneData) {
                // Initialize tabs if needed (convert current content to first tab)
                if (!paneData.tabs || paneData.tabs.length === 0) {
                    if (paneData.contentType) {
                        paneData.tabs = [{
                            id: `tab_${Date.now()}_0`,
                            contentType: paneData.contentType,
                            contentId: paneData.contentId,
                            fileContent: paneData.fileContent, // Preserve file content
                            fileChanged: paneData.fileChanged, // Preserve file changed state
                            title: getFileName(paneData.contentId) || paneData.contentType
                        }];
                    } else {
                        paneData.tabs = [];
                    }
                    paneData.activeTabIndex = 0;
                }

                // Create new tab based on content type
                const newTabId = `tab_${Date.now()}_${paneData.tabs.length}`;
                let newContentId = null;
                let title = contentType;

                if (contentType === 'chat') {
                    newContentId = `conv_${Date.now()}`;
                    title = 'New Chat';
                } else if (contentType === 'terminal') {
                    newContentId = `term_${Date.now()}`;
                    title = 'Terminal';
                } else if (contentType === 'browser') {
                    newContentId = 'https://google.com';
                    title = 'Browser';
                } else if (contentType === 'library') {
                    newContentId = 'library';
                    title = 'Library';
                } else if (contentType === 'python') {
                    newContentId = `python_${Date.now()}`;
                    title = 'Python';
                } else if (contentType === 'notebook') {
                    newContentId = `notebook_${Date.now()}`;
                    title = 'Notebook';
                }

                const newTab = {
                    id: newTabId,
                    contentType,
                    contentId: newContentId,
                    title
                };

                paneData.tabs.push(newTab);
                paneData.activeTabIndex = paneData.tabs.length - 1;

                // Also update main paneData to reflect active tab
                paneData.contentType = contentType;
                paneData.contentId = newContentId;

                setRootLayoutNode?.(prev => ({ ...prev }));
            }
        };

        let headerIcon = <FileIcon size={14} className="text-gray-400" />;
        let headerTitle = contentType || 'Pane';

        if (contentType === 'chat') {
            headerIcon = <MessageSquare size={14} className="text-blue-400" />;
            headerTitle = 'Chat';
        } else if (contentType === 'editor' && contentId) {
            headerIcon = getFileIcon(contentId);
            headerTitle = getFileName(contentId);
        } else if (contentType === 'browser') {
            headerIcon = <Globe size={14} className="text-blue-400" />;
            headerTitle = paneData.browserTitle || paneData.browserUrl || 'Web Browser';
        } else if (contentType === 'terminal') {
            headerIcon = <Terminal size={14} className="text-green-400" />;
            headerTitle = 'Terminal';
        } else if (contentType === 'image') {
            headerIcon = <ImageIcon size={14} className="text-purple-400" />;
            headerTitle = getFileName(contentId) || 'Image Viewer';
        } else if (contentType === 'folder') {
            headerIcon = <Folder size={14} className="text-yellow-400" />;
            headerTitle = getFileName(contentId) || 'Folder';
        } else if (contentType === 'dbtool') {
            headerIcon = <Database size={14} className="text-cyan-400" />;
            headerTitle = 'Database Tool';
        } else if (contentType === 'jinx') {
            headerIcon = <Zap size={14} className="text-yellow-400" />;
            headerTitle = 'Jinx Manager';
        } else if (contentType === 'npcteam') {
            headerIcon = <Bot size={14} className="text-purple-400" />;
            headerTitle = 'NPC Team';
        } else if (contentType === 'teammanagement') {
            headerIcon = <Users size={14} className="text-indigo-400" />;
            headerTitle = 'Team Management';
        } else if (contentType === 'settings') {
            headerIcon = <Settings size={14} className="text-gray-400" />;
            headerTitle = 'Settings';
        } else if (contentType === 'photoviewer') {
            headerIcon = <Images size={14} className="text-pink-400" />;
            headerTitle = 'Vixynt';
        } else if (contentType === 'scherzo') {
            headerIcon = <Music size={14} className="text-purple-400" />;
            headerTitle = 'Scherzo';
        } else if (contentType === 'library') {
            headerIcon = <BookOpen size={14} className="text-amber-400" />;
            headerTitle = 'Library';
        } else if (contentType === 'help') {
            headerIcon = <HelpCircle size={14} className="text-blue-400" />;
            headerTitle = 'Help';
        } else if (contentType === 'git') {
            headerIcon = <GitBranch size={14} className="text-purple-400" />;
            headerTitle = 'Git';
        } else if (contentType === 'projectenv') {
            headerIcon = <FolderCog size={14} className="text-orange-400" />;
            headerTitle = 'Project Environment';
        } else if (contentType === 'diskusage') {
            headerIcon = <HardDrive size={14} className="text-slate-400" />;
            headerTitle = 'Disk Usage';
        } else if (contentType === 'data-labeler') {
            headerIcon = <Tags size={14} className="text-teal-400" />;
            headerTitle = 'Data Labeler';
        } else if (contentType === 'graph-viewer') {
            headerIcon = <Network size={14} className="text-violet-400" />;
            headerTitle = 'Graph Viewer';
        } else if (contentType === 'browsergraph') {
            headerIcon = <Share2 size={14} className="text-sky-400" />;
            headerTitle = 'Browser Graph';
        } else if (contentType === 'datadash') {
            headerIcon = <LayoutDashboard size={14} className="text-emerald-400" />;
            headerTitle = 'Data Dashboard';
        } else if (contentType === 'mindmap') {
            headerIcon = <Brain size={14} className="text-rose-400" />;
            headerTitle = 'Map Document';
        } else if (contentType === 'markdown-preview') {
            headerIcon = <FileIcon size={14} className="text-blue-400" />;
            headerTitle = `Preview: ${getFileName(contentId) || 'Markdown'}`;
        } else if (contentType === 'html-preview') {
            headerIcon = <Globe size={14} className="text-orange-400" />;
            headerTitle = `Preview: ${getFileName(contentId) || 'HTML'}`;
        } else if (contentType === 'pdf') {
            headerIcon = <FileIcon size={14} className="text-red-400" />;
            headerTitle = getFileName(contentId) || 'PDF Viewer';
        } else if (contentType === 'csv') {
            headerIcon = <Table size={14} className="text-green-400" />;
            headerTitle = getFileName(contentId) || 'CSV Viewer';
        } else if (contentType === 'latex') {
            headerIcon = <FileIcon size={14} className="text-teal-400" />;
            headerTitle = getFileName(contentId) || 'LaTeX Editor';
        } else if (contentType === 'docx') {
            headerIcon = <FileIcon size={14} className="text-blue-500" />;
            headerTitle = getFileName(contentId) || 'Document';
        } else if (contentType === 'pptx') {
            headerIcon = <FileIcon size={14} className="text-orange-500" />;
            headerTitle = getFileName(contentId) || 'Presentation';
        } else if (contentType === 'zip') {
            headerIcon = <FileIcon size={14} className="text-yellow-500" />;
            headerTitle = getFileName(contentId) || 'Archive';
        } else if (contentType === 'exp') {
            headerIcon = <FlaskConical size={14} className="text-purple-400" />;
            headerTitle = getFileName(contentId) || 'Experiment';
        } else if (contentType === 'tilejinx') {
            headerIcon = <Zap size={14} className="text-amber-400" />;
            headerTitle = contentId?.replace('.jinx', '') || 'Tile';
        } else if (contentType === 'branches') {
            headerIcon = <GitBranch size={14} className="text-purple-400" />;
            headerTitle = 'Branch Comparison';
        } else if (contentType === 'diff') {
            headerIcon = <GitBranch size={14} className="text-orange-400" />;
            headerTitle = `Diff: ${getFileName(contentId) || 'File'}`;
        } else if (contentId) {
            headerIcon = getFileIcon(contentId);
            headerTitle = getFileName(contentId);
        }

        // Conditionally construct children for PaneHeader (type-specific buttons)
        let paneHeaderChildren = null;
        // Custom header content for panes that need full header customization
        let headerContent = null;

        // Markdown preview button for .md files
        const isMarkdownFile = contentType === 'editor' && contentId?.toLowerCase().endsWith('.md');
        // HTML preview button for .html/.htm files
        const isHtmlFile = contentType === 'editor' && (contentId?.toLowerCase().endsWith('.html') || contentId?.toLowerCase().endsWith('.htm'));

        // Editor pane buttons (copy, save, and optionally preview)
        if (contentType === 'editor') {
            const handleCopyFile = () => {
                const content = paneData?.fileContent || '';
                navigator.clipboard.writeText(content);
            };

            paneHeaderChildren = (
                <div className="flex items-center gap-1">
                    <button
                        onClick={(e) => { e.stopPropagation(); handleCopyFile(); }}
                        className="p-1 rounded text-xs theme-button theme-hover"
                        title="Copy file contents"
                    >
                        <Copy size={12} />
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            // Trigger save - this will be handled by CodeEditor's onSave
                            const event = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true });
                            document.dispatchEvent(event);
                        }}
                        className="p-1 rounded text-xs theme-button theme-hover"
                        title="Save file (Ctrl+S)"
                    >
                        <Save size={12} />
                    </button>
                    {isMarkdownFile && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                const nodePath = findNodePath(rootLayoutNode, node.id);
                                if (nodePath) {
                                    performSplit(nodePath, 'right', 'markdown-preview', contentId);
                                }
                            }}
                            className="p-1 rounded text-xs theme-button theme-hover"
                            title="Preview Markdown"
                        >
                            <Play size={12} />
                        </button>
                    )}
                    {isHtmlFile && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                const nodePath = findNodePath(rootLayoutNode, node.id);
                                if (nodePath) {
                                    performSplit(nodePath, 'right', 'html-preview', contentId);
                                }
                            }}
                            className="p-1 rounded text-xs theme-button theme-hover"
                            title="Preview HTML"
                        >
                            <Play size={12} />
                        </button>
                    )}
                </div>
            );
        }

        // Chat pane uses custom header content
        if (contentType === 'chat') {
            const chatStats = paneData?.chatStats || { messageCount: 0, tokenCount: 0, models: new Set(), agents: new Set(), providers: new Set() };
            headerContent = (
                <ChatHeaderContent
                    icon={headerIcon}
                    title={headerTitle}
                    chatStats={chatStats}
                    autoScrollEnabled={autoScrollEnabled}
                    setAutoScrollEnabled={setAutoScrollEnabled}
                    messageSelectionMode={messageSelectionMode}
                    toggleMessageSelectionMode={toggleMessageSelectionMode}
                    selectedMessages={selectedMessages}
                    showBranchingUI={showBranchingUI}
                    setShowBranchingUI={setShowBranchingUI}
                    topBarCollapsed={topBarCollapsed}
                    onExpandTopBar={onExpandTopBar}
                    conversationBranches={conversationBranches}
                />
            );
        }
// DUPLICATE/CONFLICTING DECLARATION COMMENTED OUT - closeContentPane is expected to be passed via props
// const closeContentPane = useCallback((paneId, nodePath) => { ... }, [activeContentPaneId, findNodeByPath,rootLayoutNode]);

        // Auto-scroll ref and effect for chat pane
        const chatScrollRef = useRef<HTMLDivElement>(null);
        const chatMessages = paneData?.chatMessages?.messages || [];
        const lastMessage = chatMessages.length > 0 ? chatMessages[chatMessages.length - 1] : null;
        const lastMessageContent = lastMessage?.content || '';
        const lastMessageReasoning = lastMessage?.reasoningContent || '';

        useEffect(() => {
            if (autoScrollEnabled && chatScrollRef.current && contentType === 'chat') {
                chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
            }
        }, [chatMessages.length, lastMessageContent, lastMessageReasoning, autoScrollEnabled, contentType]);

        // For multi-tab panes, ensure each tab has its own virtual pane entry for persistent rendering
        // This allows browsers/terminals to stay mounted when switching tabs
        if (tabs.length > 1) {
            tabs.forEach((tab, index) => {
                const virtualId = `${node.id}_tab_${index}`;
                // Create or update virtual pane data for this tab
                if (!contentDataRef.current[virtualId] || contentDataRef.current[virtualId].contentId !== tab.contentId) {
                    contentDataRef.current[virtualId] = {
                        contentType: tab.contentType,
                        contentId: tab.contentId,
                        browserUrl: tab.browserUrl,
                        browserTitle: tab.browserTitle,
                        fileContent: tab.fileContent,
                        fileChanged: tab.fileChanged,
                    };
                }
            });
        }

        // Render content for a specific tab (used for multi-tab persistent rendering)
        const renderTabContent = (tab: any, tabIndex: number) => {
            const virtualId = `${node.id}_tab_${tabIndex}`;
            const tabContentType = tab.contentType;

            // Special case: browser needs extra props
            if (tabContentType === 'browser') {
                return paneRenderers.browser?.({
                    nodeId: virtualId,
                    hasTabBar: showTabBar,
                    onToggleZen: toggleZenMode ? () => toggleZenMode(node.id) : undefined,
                    isZenMode: zenModePaneId === node.id
                });
            }

            // Use registry for all other tab types
            const renderer = paneRenderers[tabContentType];
            return renderer ? renderer({ nodeId: virtualId }) : null;
        };

        const renderPaneContent = () => {
            // Special cases that need extra handling
            if (contentType === 'chat') {
                return (
                    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                        <div ref={chatScrollRef} className="flex-1 min-h-0 overflow-y-auto">
                            {paneRenderers.chat?.({ nodeId: node.id })}
                        </div>
                        {chatInputProps && (
                            <ChatInput
                                {...chatInputProps}
                                paneId={node.id}
                                onFocus={() => setActiveContentPaneId(node.id)}
                            />
                        )}
                    </div>
                );
            }
            if (contentType === 'browser') {
                return paneRenderers.browser?.({
                    nodeId: node.id,
                    hasTabBar: showTabBar,
                    onToggleZen: toggleZenMode ? () => toggleZenMode(node.id) : undefined,
                    isZenMode: zenModePaneId === node.id
                });
            }
            if (contentType === 'search') {
                return paneRenderers.search?.({ nodeId: node.id, initialQuery: paneData?.initialQuery });
            }
            if (contentType === 'python') {
                return paneRenderers.terminal?.({ nodeId: node.id, shell: 'python3' });
            }
            if (contentType === 'diff') {
                return (
                    <DiffViewer
                        filePath={contentId || ''}
                        diffStatus={paneData?.diffStatus}
                        currentPath={currentPath}
                    />
                );
            }

            // Registry lookup for all standard pane types
            const renderer = paneRenderers[contentType];
            return renderer ? renderer({ nodeId: node.id }) : null;
        };

        return (
            <div
                className={`flex-1 flex flex-col border ${isActive ? 'border-blue-500 ring-1 ring-blue-500' : 'theme-border'}`}
                style={{ position: 'relative', overflow: 'hidden' }}
                data-pane-id={node.id}
                data-pane-type={contentType}
                onClick={() => setActiveContentPaneId(node.id)}
                onDragLeave={() => setDropTarget(null)}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDropTarget({ nodePath: path, side: 'center' }); }}
                onDrop={(e) => onDrop(e, 'center')}
            >
                {/* Tab bar - shows when there are multiple tabs */}
                {showTabBar && (
                    <PaneTabBar
                        tabs={tabs}
                        activeTabIndex={activeTabIndex}
                        onTabSelect={handleTabSelect}
                        onTabClose={handleTabClose}
                        onTabReorder={handleTabReorder}
                        nodeId={node.id}
                        onToggleZen={contentType === 'browser' && toggleZenMode ? () => toggleZenMode(node.id) : undefined}
                        isZenMode={contentType === 'browser' ? zenModePaneId === node.id : undefined}
                        onClosePane={contentType === 'browser' ? () => closeContentPane(node.id, path) : undefined}
                        onTabAdd={contentType === 'browser' && component.handleNewBrowserTab ? () => component.handleNewBrowserTab('', node.id) : undefined}
                        setDraggedItem={setDraggedItem}
                        findNodePath={findNodePath}
                        rootLayoutNode={rootLayoutNode}
                        contentDataRef={contentDataRef}
                        nodePath={path}
                    />
                )}

                {/* Header - PaneHeader includes expand and close buttons */}
                {/* Skip PaneHeader for browser, docx, pptx, csv - they have their own integrated toolbars */}
                {contentType !== 'browser' && contentType !== 'docx' && contentType !== 'pptx' && contentType !== 'csv' && (
                    <PaneHeader
                        nodeId={node.id}
                        icon={headerIcon}
                        title={headerTitle}
                        // Custom header content for panes that override the default
                        headerContent={headerContent}
                        findNodePath={findNodePath}
                        rootLayoutNode={rootLayoutNode}
                        setDraggedItem={setDraggedItem}
                        setPaneContextMenu={setPaneContextMenu}
                        fileChanged={paneData?.fileChanged || activeTab?.fileChanged}
                        onSave={() => { /* No-op, actual save logic is in renderFileEditor */ }}
                        onStartRename={() => {
                            if (contentId && (contentType === 'editor' || contentType === 'latex' || contentType === 'csv' || contentType === 'docx' || contentType === 'pptx')) {
                                setRenamingPaneId(node.id);
                                setEditedFileName(getFileName(contentId) || '');
                            }
                        }}
                        // Renaming props
                        isRenaming={renamingPaneId === node.id}
                        editedFileName={editedFileName}
                        setEditedFileName={setEditedFileName}
                        onConfirmRename={() => handleConfirmRename?.(node.id, contentId)}
                        onCancelRename={() => setRenamingPaneId(null)}
                        filePath={contentId}
                        onRunScript={onRunScript}
                        // Close and zen mode props
                        onClose={() => closeContentPane(node.id, path)}
                        onToggleZen={toggleZenMode ? () => toggleZenMode(node.id) : null}
                        isZenMode={zenModePaneId === node.id}
                        // Tab management
                        onAddTab={handleAddTab}
                        // Top bar collapse
                        topBarCollapsed={topBarCollapsed}
                        onExpandTopBar={onExpandTopBar}
                    >
                        {paneHeaderChildren} {/* Pass the conditional children here */}
                    </PaneHeader>
                )}
                {/* Browser handles its own header with zen/close buttons inside WebBrowserViewer */}

                {draggedItem && (
                    <>
                        {/* Center drop zone - explicit zone for adding as tab */}
                        <div
                            className={`absolute left-1/4 right-1/4 top-1/4 bottom-1/4 z-10 ${isTargeted && dropTarget.side === 'center' ? 'bg-green-500/30 border-2 border-dashed border-green-400' : ''}`}
                            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDropTarget({ nodePath: path, side: 'center' }); }}
                            onDrop={(e) => onDrop(e, 'center')}
                        />
                        <div className={`absolute left-0 top-0 bottom-0 w-1/4 z-10 ${isTargeted && dropTarget.side === 'left' ? 'bg-blue-500/30' : ''}`} onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDropTarget({ nodePath: path, side: 'left' }); }} onDrop={(e) => onDrop(e, 'left')} />
                        <div className={`absolute right-0 top-0 bottom-0 w-1/4 z-10 ${isTargeted && dropTarget.side === 'right' ? 'bg-blue-500/30' : ''}`} onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDropTarget({ nodePath: path, side: 'right' }); }} onDrop={(e) => onDrop(e, 'right')} />
                        <div className={`absolute left-0 top-0 right-0 h-1/4 z-10 ${isTargeted && dropTarget.side === 'top' ? 'bg-blue-500/30' : ''}`} onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDropTarget({ nodePath: path, side: 'top' }); }} onDrop={(e) => onDrop(e, 'top')} />
                        <div className={`absolute left-0 bottom-0 right-0 h-1/4 z-10 ${isTargeted && dropTarget.side === 'bottom' ? 'bg-blue-500/30' : ''}`} onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDropTarget({ nodePath: path, side: 'bottom' }); }} onDrop={(e) => onDrop(e, 'bottom')} />
                    </>
                )}
                {/* Render content - for multi-tab panes with browsers/terminals, render ALL tabs to keep them mounted */}
                {tabs.length > 1 && tabs.some(t => ['browser', 'terminal'].includes(t.contentType)) ? (
                    // Multi-tab with stateful content: render all tabs, hide inactive ones
                    tabs.map((tab, index) => (
                        <div
                            key={`${node.id}_tab_${index}`}
                            className="flex-1 flex flex-col min-h-0"
                            style={{ display: index === activeTabIndex ? 'flex' : 'none' }}
                        >
                            {renderTabContent(tab, index) || renderPaneContent()}
                        </div>
                    ))
                ) : (
                    // Single tab or no stateful content: render normally
                    renderPaneContent()
                )}
            </div>
        );
    }
    return null;
});



// DUPLICATE REMOVED - syncLayoutWithContentData is now exported at the top of the file
// const syncLayoutWithContentData = useCallback((layoutNode, contentData) => { ... }, []);

/*
// CODE FRAGMENTS BELOW - More incomplete code using hooks at module level
// These reference parent scope variables and can't work as standalone exports
// Commenting out to prevent hook errors

    const updateContentPane = useCallback(async (paneId, newContentType, newContentId, skipMessageLoad = false) => {
  // Verify this paneId exists in the layout tree
  const paneExistsInLayout = (node, targetId) => {
    if (!node) return false;
    if (node.type === 'content' && node.id === targetId) return true;
    if (node.type === 'split') {
      return node.children.some(child => paneExistsInLayout(child, targetId));
    }
    return false;
  };

  if (!paneExistsInLayout(rootLayoutNodeRef.current, paneId)) {
    console.warn(`[updateContentPane] Pane ${paneId} not found in layout tree yet, waiting...`);
    // Don't abort - the layout update might be pending
  }

  if (!contentDataRef.current[paneId]) {
    contentDataRef.current[paneId] = {};
  }
  const paneData = contentDataRef.current[paneId];

  paneData.contentType = newContentType;
  paneData.contentId = newContentId;

  if (newContentType === 'editor') {
    try {
      const response = await window.api.readFileContent(newContentId);
      paneData.fileContent = response.error ? `Error: ${response.error}` : response.content;
      paneData.fileChanged = false;
    } catch (err) {
      paneData.fileContent = `Error loading file: ${err.message}`;
    }
  } else if (newContentType === 'browser') {
    paneData.chatMessages = null;
    paneData.fileContent = null;
    paneData.browserUrl = newContentId;
  } else if (newContentType === 'chat') {
    if (!paneData.chatMessages) {
      paneData.chatMessages = { messages: [], allMessages: [], displayedMessageCount: 20 };
    }

    if (skipMessageLoad) {
      paneData.chatMessages.messages = [];
      paneData.chatMessages.allMessages = [];
      paneData.chatStats = getConversationStats([]);
    } else {
      try {
        const msgs = await window.api.getConversationMessages(newContentId);
        const parseMaybeJson = (val) => {
          if (!val || typeof val !== 'string') return val;
          try { return JSON.parse(val); } catch { return val; }
        };
        const formatted = [];
        let lastAssistant = null;
        if (msgs && Array.isArray(msgs)) {
          msgs.forEach(raw => {
            const msg = { ...raw, id: raw.id || generateId() };
            msg.content = parseMaybeJson(msg.content);
            if (msg.role === 'assistant') {
              if (!Array.isArray(msg.toolCalls)) msg.toolCalls = [];
              // If content is a tool_call wrapper, normalize into toolCalls list
              if (msg.content && typeof msg.content === 'object' && msg.content.tool_call) {
                const tc = msg.content.tool_call;
                msg.toolCalls.push({
                  id: tc.id || tc.tool_call_id || generateId(),
                  function: { name: tc.function_name || tc.name || 'tool', arguments: tc.arguments || '' }
                });
                msg.content = '';
              }
              // Reconstruct contentParts for assistant messages with tool calls from DB
              if (msg.toolCalls && msg.toolCalls.length > 0) {
                const contentParts: any[] = [];
                if (msg.content) {
                  contentParts.push({ type: 'text', content: msg.content });
                }
                msg.toolCalls.forEach((tc: any) => {
                  contentParts.push({
                    type: 'tool_call',
                    call: {
                      id: tc.id,
                      function_name: tc.function_name || tc.function?.name,
                      arguments: tc.arguments || tc.function?.arguments,
                      status: 'complete'
                    }
                  });
                });
                msg.contentParts = contentParts;
              }
              formatted.push(msg);
              lastAssistant = msg;
            } else if (msg.role === 'tool') {
              const toolPayload = msg.content && typeof msg.content === 'object' ? msg.content : { content: msg.content };
              const tcId = toolPayload.tool_call_id || generateId();
              const tcName = toolPayload.tool_name || 'tool';
              const tcContent = toolPayload.content !== undefined ? toolPayload.content : msg.content;
              if (lastAssistant) {
                if (!Array.isArray(lastAssistant.toolCalls)) lastAssistant.toolCalls = [];
                lastAssistant.toolCalls.push({
                  id: tcId,
                  function: { name: tcName, arguments: toolPayload.arguments || '' },
                  result_preview: typeof tcContent === 'string' ? tcContent : JSON.stringify(tcContent)
                });
              } else {
                formatted.push({
                  id: generateId(),
                  role: 'assistant',
                  content: '',
                  toolCalls: [{
                    id: tcId,
                    function: { name: tcName, arguments: toolPayload.arguments || '' },
                    result_preview: typeof tcContent === 'string' ? tcContent : JSON.stringify(tcContent)
                  }]
                });
                lastAssistant = formatted[formatted.length - 1];
              }
            } else {
              formatted.push(msg);
            }
          });
        }

        paneData.chatMessages.allMessages = formatted;
        const count = paneData.chatMessages.displayedMessageCount || 20;
        paneData.chatMessages.messages = formatted.slice(-count);
        paneData.chatStats = getConversationStats(formatted);
      } catch (err) {
        paneData.chatMessages.messages = [];
        paneData.chatMessages.allMessages = [];
        paneData.chatStats = getConversationStats([]);
      }
    }
  } else if (newContentType === 'terminal') {
    paneData.chatMessages = null;
    paneData.fileContent = null;
  } else if (newContentType === 'pdf') {
    paneData.chatMessages = null;
    paneData.fileContent = null;
  }

  setRootLayoutNode(oldRoot => {
    const syncedRoot = syncLayoutWithContentData(oldRoot, contentDataRef.current);
    return syncedRoot;
  });
}, [syncLayoutWithContentData]);


    const findNodeByPath = useCallback((node, path) => {
        if (!node || !path) return null;
        let currentNode = node;
        for (const index of path) {
            if (currentNode && currentNode.children && currentNode.children[index]) {
                currentNode = currentNode.children[index];
            } else {
                return null;
            }
        }
        return currentNode;
    }, []);

    const findNodePath = useCallback((node, id, currentPath = []) => {
        if (!node) return null;
        if (node.id === id) return currentPath;
        if (node.type === 'split') {
            for (let i = 0; i < node.children.length; i++) {
                const result = findNodePath(node.children[i], id, [...currentPath, i]);
                if (result) return result;
            }
        }
        return null;
    }, []);



    const performSplit = useCallback((targetNodePath, side, newContentType, newContentId) => {
        setRootLayoutNode(oldRoot => {
            if (!oldRoot) return oldRoot;
    
            const newRoot = JSON.parse(JSON.stringify(oldRoot));
            let parentNode = null;
            let targetNode = newRoot;
            let targetIndexInParent = -1;
    
            for (let i = 0; i < targetNodePath.length; i++) {
                parentNode = targetNode;
                targetIndexInParent = targetNodePath[i];
                targetNode = targetNode.children[targetIndexInParent];
            }
    
            const newPaneId = generateId();
            const newPaneNode = { id: newPaneId, type: 'content' };
    
            contentDataRef.current[newPaneId] = {};
            updateContentPane(newPaneId, newContentType, newContentId);
    
            const isHorizontalSplit = side === 'left' || side === 'right';
            const newSplitNode = {
                id: generateId(),
                type: 'split',
                direction: isHorizontalSplit ? 'horizontal' : 'vertical',
                children: [],
                sizes: [50, 50]
            };
    
            if (side === 'left' || side === 'top') {
                newSplitNode.children = [newPaneNode, targetNode];
            } else {
                newSplitNode.children = [targetNode, newPaneNode];
            }
    
            if (parentNode) {
                parentNode.children[targetIndexInParent] = newSplitNode;
            } else {
                return newSplitNode;
            }
    
            setActiveContentPaneId(newPaneId);
            return newRoot;
        });
    }, [updateContentPane]);

*/

// End of commented-out fragments with hooks
// LayoutNode component export is at line 137