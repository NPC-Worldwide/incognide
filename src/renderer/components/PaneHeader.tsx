import React, { useCallback, useRef, useEffect } from 'react';
import { Check, Play, X, Maximize2, Minimize2, ChevronDown } from 'lucide-react';

// Common props interface for custom header content components
export interface HeaderContentProps {
    icon?: React.ReactNode;
    title?: string;
    filePath?: string;
    fileChanged?: boolean;
    isRenaming?: boolean;
    editedFileName?: string;
    setEditedFileName?: (name: string) => void;
    onConfirmRename?: () => void;
    onCancelRename?: () => void;
    onStartRename?: () => void;
    onRunScript?: (path: string) => void;
    children?: React.ReactNode;
}

export const PaneHeader = React.memo(({
    nodeId,
    icon,
    title,
    children,
    // Custom header content - when provided, replaces the default icon+title+children
    headerContent,
    // Height override for custom headers (e.g., browser toolbar needs more space)
    headerHeight,
    findNodePath,
    rootLayoutNode,
    setDraggedItem,
    setPaneContextMenu,
    fileChanged,
    onSave,
    onStartRename,
    isRenaming,
    editedFileName,
    setEditedFileName,
    onConfirmRename,
    onCancelRename,
    filePath,
    onRunScript,
    hasMultipleTabs,
    onClose,
    onToggleZen,
    isZenMode,
    // Option to hide zen/close buttons (for panes that render their own)
    hideZenButton,
    hideCloseButton,
    // Top bar collapse
    topBarCollapsed,
    onExpandTopBar
}) => {
    const isPythonFile = filePath?.endsWith('.py');
    const nodePath = findNodePath?.(rootLayoutNode, nodeId);
    const inputRef = useRef(null);

    useEffect(() => {
        if (isRenaming && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isRenaming]);

    const handleKeyDown = useCallback((e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            onConfirmRename?.();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            onCancelRename?.();
        }
    }, [onConfirmRename, onCancelRename]);

    // Default content when no headerContent is provided
    const defaultContent = (
        <div style={{ flex: '1 1 0', width: 0, minWidth: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', padding: '4px 8px', gap: '8px' }}>
            <span style={{ flexShrink: 0 }}>{icon}</span>

            {isRenaming && filePath ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <input
                        ref={inputRef}
                        type="text"
                        value={editedFileName}
                        onChange={(e) => setEditedFileName?.(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onBlur={() => onCancelRename?.()}
                        className="px-1 py-0.5 text-xs theme-bg-tertiary theme-border border rounded outline-none focus:ring-1 focus:ring-blue-500"
                        style={{ width: '120px' }}
                        onClick={(e) => e.stopPropagation()}
                    />
                    <button
                        onClick={(e) => { e.stopPropagation(); onConfirmRename?.(); }}
                        onMouseDown={(e) => e.preventDefault()}
                        className="p-0.5 theme-hover rounded text-green-400"
                    >
                        <Check size={12} />
                    </button>
                </div>
            ) : (
                <span
                    style={{
                        flex: '0 1 auto',
                        minWidth: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontWeight: 600
                    }}
                    title={filePath ? `Double-click to rename: ${title}` : (onSave ? 'Double-click to save as...' : title)}
                    onDoubleClick={(e) => {
                        e.stopPropagation();
                        if (onStartRename && filePath) {
                            onStartRename();
                        } else if (onSave && !filePath) {
                            onSave();
                        }
                    }}
                >
                    {title}{fileChanged ? ' *' : ''}
                </span>
            )}

            {/* Buttons area - can shrink and hide */}
            <div style={{ flex: '1 1 0', width: 0, minWidth: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
                {children}

                {isPythonFile && onRunScript && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onRunScript(filePath); }}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="p-1 theme-hover rounded-full"
                        title="Run Python script"
                        style={{ flexShrink: 0 }}
                    >
                        <Play size={14} className="text-green-400" />
                    </button>
                )}
            </div>
        </div>
    );

    return (
        <div
            draggable={!isRenaming}
            onDragStart={(e) => {
                if (isRenaming) {
                    e.preventDefault();
                    return;
                }
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('application/json', JSON.stringify({ type: 'pane', id: nodeId, nodePath }));
                setTimeout(() => {
                    setDraggedItem?.({ type: 'pane', id: nodeId, nodePath });
                }, 0);
            }}
            onDragEnd={() => setDraggedItem?.(null)}
            onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setPaneContextMenu?.({
                    isOpen: true,
                    x: e.clientX,
                    y: e.clientY,
                    nodeId,
                    nodePath
                });
            }}
            style={{
                display: 'flex',
                alignItems: 'center',
                width: '100%',
                minWidth: 0,
                maxWidth: '100%',
                minHeight: headerHeight || '32px',
                borderBottom: '1px solid var(--border-color, #374151)',
                fontSize: '12px',
                flexShrink: 0,
                cursor: 'move',
                boxSizing: 'border-box'
            }}
            className="theme-bg-secondary theme-border theme-text-muted"
        >
            {/* Expand/Zen button - left side */}
            {!hideZenButton && (
                <button
                    onClick={(e) => { e.stopPropagation(); onToggleZen?.(); }}
                    onMouseDown={(e) => e.stopPropagation()}
                    className={`p-1.5 theme-hover rounded flex-shrink-0 ${isZenMode ? 'text-blue-400' : 'text-gray-400 hover:text-blue-400'}`}
                    title={isZenMode ? "Exit zen mode (Esc)" : "Enter zen mode"}
                >
                    {isZenMode ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                </button>
            )}

            {/* Content - either custom headerContent or default */}
            {headerContent || defaultContent}

            {/* Expand top bar button - only for simple panes without custom headerContent */}
            {!headerContent && topBarCollapsed && onExpandTopBar && (
                <button
                    onClick={(e) => { e.stopPropagation(); onExpandTopBar(); }}
                    onMouseDown={(e) => e.stopPropagation()}
                    className="p-1.5 theme-hover rounded flex-shrink-0 text-gray-400 hover:text-blue-400"
                    title="Show top bar"
                >
                    <ChevronDown size={14} />
                </button>
            )}

            {/* Close button - right side */}
            {!hideCloseButton && (
                <button
                    onClick={(e) => { e.stopPropagation(); onClose?.(); }}
                    onMouseDown={(e) => e.stopPropagation()}
                    className="p-1.5 theme-hover rounded flex-shrink-0 text-gray-400 hover:text-red-400"
                    title="Close pane"
                >
                    <X size={14} />
                </button>
            )}
        </div>
    );
});

export default PaneHeader;
