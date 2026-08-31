import React from 'react';

export interface PermissionRequest {
    request_id: string;
    tool_name?: string;
    command_key?: string;
    args_preview?: string;
    streamId?: string;
}

interface PermissionModalProps {
    request: PermissionRequest;
    pendingCount: number;
    onDecision: (request: PermissionRequest, decision: string) => void;
}

const prettyArgs = (preview?: string): string => {
    if (!preview) return '(no arguments)';
    try {
        return JSON.stringify(JSON.parse(preview), null, 2);
    } catch {
        return preview;
    }
};

export function PermissionModal({ request, pendingCount, onDecision }: PermissionModalProps) {
    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[70] p-4">
            <div className="theme-bg-secondary p-6 theme-border border rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
                <h3 className="text-lg font-medium mb-1 theme-text-primary">Permission Request</h3>
                <p className="text-sm theme-text-muted mb-4">
                    The agent wants to run a gated tool
                    {pendingCount > 1 ? ` (${pendingCount} requests pending)` : ''}.
                </p>

                <div className="mb-4 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-1 rounded text-xs font-mono theme-bg-tertiary theme-text-primary border theme-border">
                            {request.tool_name || 'unknown tool'}
                        </span>
                        {request.command_key && (
                            <span className="px-2 py-1 rounded text-xs font-mono theme-bg-tertiary theme-text-muted border theme-border">
                                {request.command_key}
                            </span>
                        )}
                    </div>
                    <pre className="text-xs font-mono theme-bg-tertiary theme-text-primary border theme-border rounded p-3 overflow-auto max-h-48 whitespace-pre-wrap break-all">
                        {prettyArgs(request.args_preview)}
                    </pre>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-auto">
                    <button
                        onClick={() => onDecision(request, 'Yes')}
                        className="px-3 py-2 theme-button-success rounded text-sm"
                    >
                        Allow once
                    </button>
                    <button
                        onClick={() => onDecision(request, 'No')}
                        className="px-3 py-2 theme-button-danger rounded text-sm"
                    >
                        Deny
                    </button>
                    <button
                        onClick={() => onDecision(request, 'Yes, always allow')}
                        className="px-3 py-2 theme-button rounded text-sm"
                    >
                        Always allow (remember)
                    </button>
                    <button
                        onClick={() => onDecision(request, 'Never allow')}
                        className="px-3 py-2 theme-button rounded text-sm"
                    >
                        Never allow (remember)
                    </button>
                </div>
            </div>
        </div>
    );
}
