import React, { useRef, useEffect, useCallback } from 'react';
import { Check, Play } from 'lucide-react';

interface DefaultHeaderContentProps {
    icon: React.ReactNode;
    title: string;
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

const DefaultHeaderContent: React.FC<DefaultHeaderContentProps> = ({
    icon,
    title,
    filePath,
    fileChanged,
    isRenaming,
    editedFileName,
    setEditedFileName,
    onConfirmRename,
    onCancelRename,
    onStartRename,
    onRunScript,
    children
}) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const isPythonFile = filePath?.endsWith('.py');

    useEffect(() => {
        if (isRenaming && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isRenaming]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            onConfirmRename?.();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            onCancelRename?.();
        }
    }, [onConfirmRename, onCancelRename]);

    return (
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
                    title={filePath ? `Double-click to rename: ${title}` : title}
                    onDoubleClick={(e) => {
                        e.stopPropagation();
                        if (onStartRename && filePath) onStartRename();
                    }}
                >
                    {title}{fileChanged ? ' *' : ''}
                </span>
            )}

            <div style={{ flex: '1 1 0', width: 0, minWidth: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
                {children}

                {isPythonFile && onRunScript && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onRunScript(filePath!); }}
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
};

export default DefaultHeaderContent;
