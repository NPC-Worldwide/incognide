import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Globe, Terminal as TerminalIcon, FileText, Layout, Bell, Calendar, Compass, Edit3, Eye, Play, X } from 'lucide-react';

interface ToolCallProps {
  tool: {
    id?: string;
    function?: { name?: string; arguments?: string };
    function_name?: string;
    arguments?: string;
    status?: string;
    result_preview?: string;
  };
}

const ACTION_ICONS: Record<string, React.ReactNode> = {
  list_panes: <Layout size={13} />,
  open_pane: <Layout size={13} />,
  close_pane: <X size={13} />,
  read_pane: <Eye size={13} />,
  write_pane: <Edit3 size={13} />,
  interact: <Play size={13} />,
  navigate: <Compass size={13} />,
  notify: <Bell size={13} />,
  schedule: <Calendar size={13} />,
  prompt: <Bell size={13} />,
};

function describeAction(name: string, args: any): string {
  try {
    switch (name) {
      case 'list_panes':
        return 'Listing open panes';
      case 'open_pane':
        return `Opening ${args?.pane_type || 'pane'}${args?.path ? `: ${args.path}` : ''}`;
      case 'close_pane':
        return `Closing pane ${args?.pane_id || ''}`;
      case 'read_pane':
        return `Reading ${args?.pane_id === 'active' || !args?.pane_id ? 'active pane' : `pane ${args.pane_id}`}`;
      case 'write_pane':
        return `Writing to ${args?.pane_id === 'active' || !args?.pane_id ? 'active pane' : `pane ${args.pane_id}`}`;
      case 'interact':
        return `Running code in ${args?.pane_id === 'active' || !args?.pane_id ? 'active pane' : `pane ${args.pane_id}`}`;
      case 'navigate':
        return `Navigating to ${args?.target || '...'}`;
      case 'notify':
        return `${args?.type || 'info'}: ${args?.message || ''}`;
      case 'schedule':
        return `Cron: ${args?.action || 'list'}${args?.job_name ? ` (${args.job_name})` : ''}`;
      case 'prompt':
      case 'prompt_user':
        return `Asking: ${args?.message || '...'}`;
      default:
        return name;
    }
  } catch {
    return name;
  }
}

function summarizeResult(name: string, result: any): string | null {
  try {
    const data = typeof result === 'string' ? JSON.parse(result) : result;
    if (!data || !data.success) return data?.error || 'Failed';

    switch (name) {
      case 'list_panes': {
        const panes = data.panes || [];
        if (panes.length === 0) return 'No panes open';
        return panes.map((p: any) => `${p.type}: ${p.title || p.path || p.id}`).join(', ');
      }
      case 'open_pane':
        return `Opened ${data.type || 'pane'}: ${data.title || data.contentId || data.paneId}`;
      case 'close_pane':
        return 'Pane closed';
      case 'read_pane': {
        if (data.type === 'browser') return `Browser: ${data.content?.title || data.content?.url || ''}`;
        if (data.type === 'editor') return `File content (${data.content?.length || 0} chars)`;
        return `Read ${data.type || 'pane'} content`;
      }
      case 'write_pane':
        return 'Content written';
      case 'interact':
        return data.result ? `Result: ${String(data.result).slice(0, 100)}` : 'Executed';
      case 'navigate':
        return `Navigated to ${data.url || data.sheet || `slide ${data.slideIndex}`}`;
      case 'notify':
        return data.message || 'Notification shown';
      case 'schedule':
        return JSON.stringify(data, null, 2);
      default:
        return null;
    }
  } catch {
    return null;
  }
}

export function ToolCallDisplay({ tool }: ToolCallProps) {
  const [expanded, setExpanded] = useState(false);

  const funcName = tool.function?.name || tool.function_name || 'unknown';
  const isStudioAction = funcName in ACTION_ICONS || funcName.startsWith('studio.');
  const displayName = funcName.replace(/^studio\./, '');

  const rawArgs = tool.arguments !== undefined ? tool.arguments : tool.function?.arguments;
  let parsedArgs: any = null;
  try {
    parsedArgs = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : rawArgs;
  } catch {
  }

  const resultVal = tool.result_preview || '';
  const statusColor =
    tool.status === 'error' ? 'border-red-500' :
    tool.status === 'complete' ? 'border-green-500' :
    'border-blue-500';
  const statusIcon =
    tool.status === 'running' ? <span className="animate-pulse text-yellow-400 text-xs">running...</span> :
    tool.status === 'complete' ? <span className="text-green-400 text-xs">{'\u2713'}</span> :
    tool.status === 'error' ? <span className="text-red-400 text-xs">{'\u2717'}</span> :
    null;

  const icon = ACTION_ICONS[displayName] || <Play size={13} />;
  const description = isStudioAction ? describeAction(displayName, parsedArgs) : displayName;
  const summary = isStudioAction && resultVal ? summarizeResult(displayName, resultVal) : null;

  if (isStudioAction) {
    return (
      <div className={`my-1.5 rounded-md border-l-2 ${statusColor} overflow-hidden`}>
        <div
          className="flex items-center gap-2 px-3 py-1.5 theme-bg-tertiary cursor-pointer hover:brightness-110 transition-all"
          onClick={() => setExpanded(!expanded)}
        >
          <span className="text-blue-400 flex-shrink-0">{icon}</span>
          <span className="text-sm theme-text-primary flex-1 truncate">{description}</span>
          {statusIcon}
          {expanded
            ? <ChevronDown size={14} className="theme-text-muted flex-shrink-0" />
            : <ChevronRight size={14} className="theme-text-muted flex-shrink-0" />
          }
        </div>

        {!expanded && summary && (
          <div className="px-3 py-1 text-xs theme-text-secondary border-t border-[var(--border-color,#313244)] truncate">
            {summary}
          </div>
        )}

        {expanded && (
          <div className="px-3 py-2 theme-bg-primary border-t border-[var(--border-color,#313244)]">
            {parsedArgs && (
              <>
                <div className="text-[11px] theme-text-muted mb-1">Arguments</div>
                <pre className="text-xs theme-text-secondary overflow-x-auto max-h-32 overflow-y-auto mb-2">
                  {JSON.stringify(parsedArgs, null, 2)}
                </pre>
              </>
            )}
            {resultVal && (
              <>
                <div className="text-[11px] theme-text-muted mb-1">Result</div>
                <pre className="text-xs theme-text-secondary overflow-x-auto max-h-48 overflow-y-auto">
                  {typeof resultVal === 'string' ? resultVal : JSON.stringify(resultVal, null, 2)}
                </pre>
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  const argDisplay = rawArgs && String(rawArgs).trim().length > 0
    ? (typeof rawArgs === 'string' ? rawArgs : JSON.stringify(rawArgs, null, 2))
    : 'No arguments';
  const resDisplay = resultVal && String(resultVal).trim().length > 0
    ? (typeof resultVal === 'string' ? resultVal : JSON.stringify(resultVal, null, 2))
    : null;
  const oneLinePreview = (() => {
    if (resDisplay) return resDisplay.split('\n')[0].slice(0, 120);
    try {
      const a = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : rawArgs;
      const firstVal = a ? Object.values(a)[0] : null;
      if (firstVal) return String(firstVal).split('\n')[0].slice(0, 120);
    } catch {}
    return '';
  })();

  return (
    <div className={`my-1.5 rounded-md border-l-2 ${statusColor} overflow-hidden`}>
      <div
        className="flex items-center gap-2 px-3 py-1.5 theme-bg-tertiary cursor-pointer hover:brightness-110 transition-all"
        onClick={() => setExpanded(!expanded)}
      >
        <Play size={12} className="text-blue-400 flex-shrink-0" />
        <span className="text-sm font-semibold text-blue-400 flex-shrink-0">{funcName}</span>
        {oneLinePreview && (
          <span className="text-xs theme-text-muted flex-1 truncate">{oneLinePreview}</span>
        )}
        {statusIcon}
        {expanded
          ? <ChevronDown size={14} className="theme-text-muted flex-shrink-0" />
          : <ChevronRight size={14} className="theme-text-muted flex-shrink-0" />
        }
      </div>
      {expanded && (
        <div className="px-3 py-2 theme-bg-primary border-t border-[var(--border-color,#313244)]">
          <div className="text-[11px] theme-text-muted mb-1">Args:</div>
          <pre className="theme-bg-tertiary p-2 rounded text-xs overflow-x-auto my-1 theme-text-secondary max-h-32 overflow-y-auto">
            {argDisplay}
          </pre>
          {resDisplay && (
            <>
              <div className="text-[11px] theme-text-muted mb-1">Result:</div>
              <pre className="theme-bg-tertiary p-2 rounded text-xs overflow-x-auto my-1 theme-text-secondary max-h-48 overflow-y-auto">
                {resDisplay}
              </pre>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default ToolCallDisplay;
