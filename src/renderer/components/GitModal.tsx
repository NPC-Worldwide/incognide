import React from 'react';
import { X, RefreshCw } from 'lucide-react';

interface GitModalProps {
    onClose: () => void;
    gitStatus: any;
    gitModalTab: 'status' | 'diff' | 'branches' | 'history';
    gitDiffContent: { staged: string; unstaged: string } | null;
    gitBranches: any;
    gitCommitHistory: any[];
    gitCommitMessage: string;
    gitNewBranchName: string;
    gitSelectedCommit: any;
    gitSelectedFile: string | null;
    gitFileDiff: string | null;
    gitError: string | null;
    gitLoading: boolean;
    noUpstreamPrompt: { branch: string; command: string } | null;
    setGitCommitMessage: (msg: string) => void;
    setGitNewBranchName: (name: string) => void;
    setGitModalTab: (tab: 'status' | 'diff' | 'branches' | 'history') => void;
    setNoUpstreamPrompt: (prompt: { branch: string; command: string } | null) => void;
    setGitSelectedFile: (file: string | null) => void;
    setGitFileDiff: (diff: string | null) => void;
    loadGitStatus: () => void;
    loadGitDiff: () => void;
    loadGitBranches: () => void;
    loadGitHistory: () => void;
    loadFileDiff: (filePath: string, staged: boolean) => void;
    loadCommitDetails: (hash: string) => void;
    gitStageFile: (file: string) => void;
    gitUnstageFile: (file: string) => void;
    gitCommitChanges: () => void;
    gitPushChanges: () => void;
    gitPullChanges: () => void;
    gitCreateBranch: () => void;
    gitCheckoutBranch: (branch: string) => void;
    gitDeleteBranch: (branch: string) => void;
    gitPushWithUpstream: () => void;
    gitEnableAutoSetupRemote: () => void;
}

const GitModal: React.FC<GitModalProps> = ({
    onClose,
    gitStatus,
    gitModalTab,
    gitDiffContent,
    gitBranches,
    gitCommitHistory,
    gitCommitMessage,
    gitNewBranchName,
    gitSelectedCommit,
    gitSelectedFile,
    gitFileDiff,
    gitError,
    gitLoading,
    noUpstreamPrompt,
    setGitCommitMessage,
    setGitNewBranchName,
    setGitModalTab,
    setNoUpstreamPrompt,
    setGitSelectedFile,
    setGitFileDiff,
    loadGitStatus,
    loadGitDiff,
    loadGitBranches,
    loadGitHistory,
    loadFileDiff,
    loadCommitDetails,
    gitStageFile,
    gitUnstageFile,
    gitCommitChanges,
    gitPushChanges,
    gitPullChanges,
    gitCreateBranch,
    gitCheckoutBranch,
    gitDeleteBranch,
    gitPushWithUpstream,
    gitEnableAutoSetupRemote,
}) => {
    return (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="w-full max-w-5xl max-h-[85vh] theme-bg-primary rounded-lg border theme-border flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b theme-border">
                    <div className="flex items-center gap-3">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-purple-400">
                            <line x1="6" y1="3" x2="6" y2="15"></line>
                            <circle cx="18" cy="6" r="3"></circle>
                            <circle cx="6" cy="18" r="3"></circle>
                            <path d="M18 9a9 9 0 0 1-9 9"></path>
                        </svg>
                        <h2 className="text-lg font-semibold theme-text-primary">Git</h2>
                        {gitStatus?.branch && <span className="text-sm theme-text-muted">({gitStatus.branch})</span>}
                    </div>
                    <button onClick={onClose} className="p-2 theme-hover rounded-lg">
                        <X size={20} />
                    </button>
                </div>

                {/* Tab Bar */}
                <div className="flex border-b theme-border px-4">
                    {(['status', 'diff', 'branches', 'history'] as const).map(tab => (
                        <button
                            key={tab}
                            onClick={() => {
                                setGitModalTab(tab);
                                if (tab === 'diff') loadGitDiff();
                                if (tab === 'branches') loadGitBranches();
                                if (tab === 'history') loadGitHistory();
                            }}
                            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                                gitModalTab === tab
                                    ? 'border-purple-500 text-purple-400'
                                    : 'border-transparent theme-text-muted hover:theme-text-primary'
                            }`}
                        >
                            {tab.charAt(0).toUpperCase() + tab.slice(1)}
                        </button>
                    ))}
                </div>

                {/* Tab Content */}
                <div className="flex-1 overflow-auto p-4">
                    {!gitStatus ? (
                        <div className="text-center theme-text-muted py-8">No git repository in this directory</div>
                    ) : gitModalTab === 'status' ? (
                        /* Status Tab */
                        <div className="space-y-4">
                            <div className="flex items-center gap-4 text-sm">
                                <span className="theme-text-primary font-medium">Branch: {gitStatus.branch}</span>
                                {gitStatus.ahead > 0 && <span className="text-green-400">↑{gitStatus.ahead} ahead</span>}
                                {gitStatus.behind > 0 && <span className="text-yellow-400">↓{gitStatus.behind} behind</span>}
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="theme-bg-secondary rounded-lg p-3">
                                    <h3 className="text-sm font-medium text-green-400 mb-2">Staged ({(gitStatus.staged || []).length})</h3>
                                    <div className="space-y-1 max-h-48 overflow-y-auto">
                                        {(gitStatus.staged || []).length === 0 ? (
                                            <div className="text-xs theme-text-muted">No staged files</div>
                                        ) : (gitStatus.staged || []).map((file: any) => (
                                            <div key={file.path} className="flex items-center justify-between text-xs group">
                                                <button
                                                    onClick={() => loadFileDiff(file.path, true)}
                                                    className="text-green-300 truncate flex-1 text-left hover:underline"
                                                >
                                                    {file.path}
                                                </button>
                                                <button onClick={() => gitUnstageFile(file.path)} className="text-red-400 hover:text-red-300 px-2 opacity-0 group-hover:opacity-100">Unstage</button>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="theme-bg-secondary rounded-lg p-3">
                                    <h3 className="text-sm font-medium text-yellow-400 mb-2">Unstaged ({(gitStatus.unstaged || []).length + (gitStatus.untracked || []).length})</h3>
                                    <div className="space-y-1 max-h-48 overflow-y-auto">
                                        {(gitStatus.unstaged || []).length + (gitStatus.untracked || []).length === 0 ? (
                                            <div className="text-xs theme-text-muted">No changes</div>
                                        ) : [...(gitStatus.unstaged || []), ...(gitStatus.untracked || [])].map((file: any) => (
                                            <div key={file.path} className="flex items-center justify-between text-xs group">
                                                <button
                                                    onClick={() => loadFileDiff(file.path, false)}
                                                    className={`truncate flex-1 text-left hover:underline ${file.isUntracked ? 'text-gray-400' : 'text-yellow-300'}`}
                                                >
                                                    {file.path}
                                                </button>
                                                <button onClick={() => gitStageFile(file.path)} className="text-green-400 hover:text-green-300 px-2 opacity-0 group-hover:opacity-100">Stage</button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* File Diff Preview */}
                            {gitSelectedFile && gitFileDiff && (
                                <div className="theme-bg-secondary rounded-lg p-3">
                                    <div className="flex items-center justify-between mb-2">
                                        <h3 className="text-sm font-medium theme-text-primary">{gitSelectedFile}</h3>
                                        <button onClick={() => { setGitSelectedFile(null); setGitFileDiff(null); }} className="text-xs theme-text-muted hover:theme-text-primary">Close</button>
                                    </div>
                                    <pre className="text-xs font-mono overflow-auto max-h-60 p-2 bg-black/30 rounded">
                                        {gitFileDiff.split('\n').map((line, i) => (
                                            <div
                                                key={i}
                                                className={
                                                    line.startsWith('+') && !line.startsWith('+++') ? 'text-green-400 bg-green-900/20' :
                                                    line.startsWith('-') && !line.startsWith('---') ? 'text-red-400 bg-red-900/20' :
                                                    line.startsWith('@@') ? 'text-cyan-400' :
                                                    'theme-text-muted'
                                                }
                                            >
                                                {line}
                                            </div>
                                        ))}
                                    </pre>
                                </div>
                            )}

                            <div className="space-y-2">
                                <input
                                    type="text"
                                    className="w-full theme-input text-sm rounded px-3 py-2"
                                    placeholder="Commit message..."
                                    value={gitCommitMessage}
                                    onChange={e => setGitCommitMessage(e.target.value)}
                                />
                                <div className="flex gap-2">
                                    <button
                                        disabled={gitLoading || !gitCommitMessage.trim()}
                                        onClick={gitCommitChanges}
                                        className="theme-button-primary px-4 py-2 rounded text-sm flex-1 disabled:opacity-50"
                                    >
                                        Commit
                                    </button>
                                    <button disabled={gitLoading} onClick={gitPullChanges} className="theme-button px-4 py-2 rounded text-sm flex-1">
                                        Pull
                                    </button>
                                    <button disabled={gitLoading} onClick={gitPushChanges} className="theme-button px-4 py-2 rounded text-sm flex-1">
                                        Push
                                    </button>
                                    <button disabled={gitLoading} onClick={loadGitStatus} className="theme-button px-4 py-2 rounded text-sm">
                                        Refresh
                                    </button>
                                </div>
                                {gitError && <div className="text-red-500 text-xs">{gitError}</div>}
                                {noUpstreamPrompt && (
                                    <div className="mt-2 p-2 bg-amber-900/30 border border-amber-600/50 rounded text-xs">
                                        <div className="text-amber-400 mb-2">Branch has no upstream. Push to origin/{noUpstreamPrompt.branch}?</div>
                                        <div className="flex gap-2">
                                            <button onClick={gitPushWithUpstream} disabled={gitLoading} className="px-2 py-1 bg-blue-600 hover:bg-blue-500 rounded text-white text-[10px]">Push</button>
                                            <button onClick={gitEnableAutoSetupRemote} disabled={gitLoading} className="px-2 py-1 bg-green-600 hover:bg-green-500 rounded text-white text-[10px]" title="Sets git config push.autoSetupRemote true">Always Auto-Push</button>
                                            <button onClick={() => setNoUpstreamPrompt(null)} className="px-2 py-1 bg-gray-600 hover:bg-gray-500 rounded text-white text-[10px]">Cancel</button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : gitModalTab === 'diff' ? (
                        /* Diff Tab */
                        <div className="space-y-4">
                            <div className="flex gap-2 mb-4">
                                <button onClick={loadGitDiff} className="theme-button px-3 py-1 rounded text-sm">Refresh Diff</button>
                            </div>
                            {gitDiffContent ? (
                                <div className="space-y-4">
                                    {gitDiffContent.staged && (
                                        <div className="theme-bg-secondary rounded-lg p-3">
                                            <h3 className="text-sm font-medium text-green-400 mb-2">Staged Changes</h3>
                                            <pre className="text-xs font-mono overflow-auto max-h-64 p-2 bg-black/30 rounded whitespace-pre-wrap">
                                                {gitDiffContent.staged.split('\n').map((line, i) => (
                                                    <div
                                                        key={i}
                                                        className={
                                                            line.startsWith('+') && !line.startsWith('+++') ? 'text-green-400 bg-green-900/20' :
                                                            line.startsWith('-') && !line.startsWith('---') ? 'text-red-400 bg-red-900/20' :
                                                            line.startsWith('@@') ? 'text-cyan-400' :
                                                            line.startsWith('diff ') ? 'text-purple-400 font-bold mt-2' :
                                                            'theme-text-muted'
                                                        }
                                                    >
                                                        {line}
                                                    </div>
                                                ))}
                                            </pre>
                                        </div>
                                    )}
                                    {gitDiffContent.unstaged && (
                                        <div className="theme-bg-secondary rounded-lg p-3">
                                            <h3 className="text-sm font-medium text-yellow-400 mb-2">Unstaged Changes</h3>
                                            <pre className="text-xs font-mono overflow-auto max-h-64 p-2 bg-black/30 rounded whitespace-pre-wrap">
                                                {gitDiffContent.unstaged.split('\n').map((line, i) => (
                                                    <div
                                                        key={i}
                                                        className={
                                                            line.startsWith('+') && !line.startsWith('+++') ? 'text-green-400 bg-green-900/20' :
                                                            line.startsWith('-') && !line.startsWith('---') ? 'text-red-400 bg-red-900/20' :
                                                            line.startsWith('@@') ? 'text-cyan-400' :
                                                            line.startsWith('diff ') ? 'text-purple-400 font-bold mt-2' :
                                                            'theme-text-muted'
                                                        }
                                                    >
                                                        {line}
                                                    </div>
                                                ))}
                                            </pre>
                                        </div>
                                    )}
                                    {!gitDiffContent.staged && !gitDiffContent.unstaged && (
                                        <div className="text-center theme-text-muted py-8">No changes to display</div>
                                    )}
                                </div>
                            ) : (
                                <div className="text-center theme-text-muted py-8">Loading diff...</div>
                            )}
                        </div>
                    ) : gitModalTab === 'branches' ? (
                        /* Branches Tab */
                        <div className="space-y-4">
                            {/* Create New Branch */}
                            <div className="theme-bg-secondary rounded-lg p-3">
                                <h3 className="text-sm font-medium theme-text-primary mb-2">Create New Branch</h3>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        className="flex-1 theme-input text-sm rounded px-3 py-2"
                                        placeholder="Branch name..."
                                        value={gitNewBranchName}
                                        onChange={e => setGitNewBranchName(e.target.value)}
                                    />
                                    <button
                                        disabled={gitLoading || !gitNewBranchName.trim()}
                                        onClick={gitCreateBranch}
                                        className="theme-button-primary px-4 py-2 rounded text-sm disabled:opacity-50"
                                    >
                                        Create
                                    </button>
                                </div>
                            </div>

                            {/* Branch List */}
                            <div className="theme-bg-secondary rounded-lg p-3">
                                <div className="flex items-center justify-between mb-2">
                                    <h3 className="text-sm font-medium theme-text-primary">Branches</h3>
                                    <button onClick={loadGitBranches} className="text-xs theme-text-muted hover:theme-text-primary">Refresh</button>
                                </div>
                                {gitBranches?.branches ? (
                                    <div className="space-y-1 max-h-80 overflow-y-auto">
                                        {gitBranches.branches.map((branch: string) => (
                                            <div
                                                key={branch}
                                                className={`flex items-center justify-between p-2 rounded text-sm ${
                                                    branch === gitBranches.current ? 'bg-purple-900/30 border border-purple-500/30' : 'hover:bg-white/5'
                                                }`}
                                            >
                                                <div className="flex items-center gap-2">
                                                    {branch === gitBranches.current && (
                                                        <span className="text-purple-400">●</span>
                                                    )}
                                                    <span className={branch === gitBranches.current ? 'text-purple-400 font-medium' : 'theme-text-primary'}>
                                                        {branch}
                                                    </span>
                                                </div>
                                                {branch !== gitBranches.current && (
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={() => gitCheckoutBranch(branch)}
                                                            disabled={gitLoading}
                                                            className="text-xs text-blue-400 hover:text-blue-300"
                                                        >
                                                            Checkout
                                                        </button>
                                                        <button
                                                            onClick={() => gitDeleteBranch(branch)}
                                                            disabled={gitLoading}
                                                            className="text-xs text-red-400 hover:text-red-300"
                                                        >
                                                            Delete
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center theme-text-muted py-4">Loading branches...</div>
                                )}
                            </div>
                            {gitError && <div className="text-red-500 text-xs">{gitError}</div>}
                            {noUpstreamPrompt && (
                                <div className="mt-2 p-2 bg-amber-900/30 border border-amber-600/50 rounded text-xs">
                                    <div className="text-amber-400 mb-2">Branch has no upstream. Push to origin/{noUpstreamPrompt.branch}?</div>
                                    <div className="flex gap-2">
                                        <button onClick={gitPushWithUpstream} disabled={gitLoading} className="px-2 py-1 bg-blue-600 hover:bg-blue-500 rounded text-white text-[10px]">Push</button>
                                        <button onClick={gitEnableAutoSetupRemote} disabled={gitLoading} className="px-2 py-1 bg-green-600 hover:bg-green-500 rounded text-white text-[10px]" title="Sets git config push.autoSetupRemote true">Always Auto-Push</button>
                                        <button onClick={() => setNoUpstreamPrompt(null)} className="px-2 py-1 bg-gray-600 hover:bg-gray-500 rounded text-white text-[10px]">Cancel</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : gitModalTab === 'history' ? (
                        /* History Tab */
                        <div className="flex gap-4 h-full">
                            {/* Commit List */}
                            <div className="w-1/2 theme-bg-secondary rounded-lg p-3 flex flex-col">
                                <div className="flex items-center justify-between mb-2">
                                    <h3 className="text-sm font-medium theme-text-primary">Commit History</h3>
                                    <button onClick={loadGitHistory} className="text-xs theme-text-muted hover:theme-text-primary">Refresh</button>
                                </div>
                                <div className="flex-1 overflow-y-auto space-y-1">
                                    {gitCommitHistory.length > 0 ? gitCommitHistory.map((commit: any) => (
                                        <button
                                            key={commit.hash}
                                            onClick={() => loadCommitDetails(commit.hash)}
                                            className={`w-full text-left p-2 rounded text-xs hover:bg-white/5 ${
                                                gitSelectedCommit?.hash === commit.hash ? 'bg-purple-900/30 border border-purple-500/30' : ''
                                            }`}
                                        >
                                            <div className="flex items-center gap-2">
                                                <span className="text-purple-400 font-mono">{commit.hash.slice(0, 7)}</span>
                                                <span className="theme-text-muted">{new Date(commit.date).toLocaleDateString()}</span>
                                            </div>
                                            <div className="theme-text-primary truncate mt-1">{commit.message}</div>
                                            <div className="theme-text-muted text-xs mt-1">{commit.author_name}</div>
                                        </button>
                                    )) : (
                                        <div className="text-center theme-text-muted py-4">Loading history...</div>
                                    )}
                                </div>
                            </div>

                            {/* Commit Details */}
                            <div className="w-1/2 theme-bg-secondary rounded-lg p-3 flex flex-col">
                                <h3 className="text-sm font-medium theme-text-primary mb-2">Commit Details</h3>
                                {gitSelectedCommit ? (
                                    <div className="flex-1 overflow-y-auto">
                                        <div className="space-y-2 text-xs mb-4">
                                            <div><span className="theme-text-muted">Hash:</span> <span className="font-mono text-purple-400">{gitSelectedCommit.hash}</span></div>
                                            <div><span className="theme-text-muted">Author:</span> <span className="theme-text-primary">{gitSelectedCommit.author_name} &lt;{gitSelectedCommit.author_email}&gt;</span></div>
                                            <div><span className="theme-text-muted">Date:</span> <span className="theme-text-primary">{new Date(gitSelectedCommit.date).toLocaleString()}</span></div>
                                            <div className="theme-text-primary whitespace-pre-wrap">{gitSelectedCommit.message}</div>
                                        </div>
                                        {gitSelectedCommit.diff && (
                                            <pre className="text-xs font-mono overflow-auto max-h-64 p-2 bg-black/30 rounded whitespace-pre-wrap">
                                                {gitSelectedCommit.diff.split('\n').map((line: string, i: number) => (
                                                    <div
                                                        key={i}
                                                        className={
                                                            line.startsWith('+') && !line.startsWith('+++') ? 'text-green-400 bg-green-900/20' :
                                                            line.startsWith('-') && !line.startsWith('---') ? 'text-red-400 bg-red-900/20' :
                                                            line.startsWith('@@') ? 'text-cyan-400' :
                                                            line.startsWith('diff ') ? 'text-purple-400 font-bold mt-2' :
                                                            'theme-text-muted'
                                                        }
                                                    >
                                                        {line}
                                                    </div>
                                                ))}
                                            </pre>
                                        )}
                                    </div>
                                ) : (
                                    <div className="text-center theme-text-muted py-8">Select a commit to view details</div>
                                )}
                            </div>
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
};

export default GitModal;
