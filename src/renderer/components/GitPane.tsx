import React from 'react';
import { RefreshCw } from 'lucide-react';

interface GitPaneProps {
    nodeId: string;
    gitStatus: any;
    gitModalTab: 'status' | 'diff' | 'branches' | 'history';
    gitDiffContent: { staged: string; unstaged: string } | null;
    gitBranches: any;
    gitCommitHistory: any[];
    gitCommitMessage: string;
    gitNewBranchName: string;
    gitSelectedCommit: any;
    gitError: string | null;
    gitLoading: boolean;
    noUpstreamPrompt: { branch: string; command: string } | null;
    setGitCommitMessage: (msg: string) => void;
    setGitNewBranchName: (name: string) => void;
    setGitModalTab: (tab: 'status' | 'diff' | 'branches' | 'history') => void;
    setNoUpstreamPrompt: (prompt: { branch: string; command: string } | null) => void;
    loadGitStatus: () => void;
    loadGitDiff: () => void;
    loadGitBranches: () => void;
    loadGitHistory: () => void;
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
    openFileDiffPane: (filePath: string, status: string) => void;
}

const GitPane: React.FC<GitPaneProps> = React.memo(({
    nodeId,
    gitStatus,
    gitModalTab,
    gitDiffContent,
    gitBranches,
    gitCommitHistory,
    gitCommitMessage,
    gitNewBranchName,
    gitSelectedCommit,
    gitError,
    gitLoading,
    noUpstreamPrompt,
    setGitCommitMessage,
    setGitNewBranchName,
    setGitModalTab,
    setNoUpstreamPrompt,
    loadGitStatus,
    loadGitDiff,
    loadGitBranches,
    loadGitHistory,
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
    openFileDiffPane,
}) => {
    return (
        <div className="flex flex-col h-full theme-bg-primary overflow-hidden">
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
                <button onClick={() => loadGitStatus()} className="p-2 theme-hover rounded-lg" title="Refresh">
                    <RefreshCw size={16} />
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
                                <h3 className="text-sm font-medium text-yellow-400 mb-2">Unstaged ({(gitStatus.unstaged || []).length + (gitStatus.untracked || []).length})</h3>
                                <div className="space-y-1 max-h-48 overflow-y-auto">
                                    {(gitStatus.unstaged || []).length + (gitStatus.untracked || []).length === 0 ? (
                                        <div className="text-xs theme-text-muted">No changes</div>
                                    ) : [...(gitStatus.unstaged || []), ...(gitStatus.untracked || [])].map((file: any) => (
                                        <div key={file.path} className="flex items-center justify-between text-xs group">
                                            <button
                                                onClick={() => openFileDiffPane(file.path, file.status || 'modified')}
                                                className={`truncate flex-1 text-left hover:underline ${file.isUntracked ? 'text-gray-400' : 'text-yellow-300'}`}
                                                title="Click to view diff"
                                            >
                                                {file.path}
                                            </button>
                                            <button onClick={() => gitStageFile(file.path)} className="text-green-400 hover:text-green-300 px-2 opacity-0 group-hover:opacity-100">Stage</button>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="theme-bg-secondary rounded-lg p-3">
                                <h3 className="text-sm font-medium text-green-400 mb-2">Staged ({(gitStatus.staged || []).length})</h3>
                                <div className="space-y-1 max-h-48 overflow-y-auto">
                                    {(gitStatus.staged || []).length === 0 ? (
                                        <div className="text-xs theme-text-muted">No staged files</div>
                                    ) : (gitStatus.staged || []).map((file: any) => (
                                        <div key={file.path} className="flex items-center justify-between text-xs group">
                                            <button
                                                onClick={() => openFileDiffPane(file.path, file.status || 'staged')}
                                                className="text-green-300 truncate flex-1 text-left hover:underline"
                                                title="Click to view diff"
                                            >
                                                {file.path}
                                            </button>
                                            <button onClick={() => gitUnstageFile(file.path)} className="text-red-400 hover:text-red-300 px-2 opacity-0 group-hover:opacity-100">Unstage</button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Commit Section */}
                        <div className="theme-bg-secondary rounded-lg p-3">
                            <h3 className="text-sm font-medium theme-text-primary mb-2">Commit</h3>
                            <textarea
                                value={gitCommitMessage}
                                onChange={(e) => setGitCommitMessage(e.target.value)}
                                placeholder="Commit message..."
                                className="w-full px-3 py-2 text-sm theme-bg-primary border theme-border rounded-lg resize-none h-20"
                            />
                            <div className="flex gap-2 mt-2">
                                <button
                                    onClick={gitCommitChanges}
                                    disabled={!gitCommitMessage.trim() || (gitStatus.staged || []).length === 0}
                                    className="px-3 py-1.5 text-xs bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg"
                                >
                                    Commit
                                </button>
                                <button
                                    onClick={gitPushChanges}
                                    className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 rounded-lg"
                                >
                                    Push
                                </button>
                                <button
                                    onClick={gitPullChanges}
                                    className="px-3 py-1.5 text-xs bg-purple-600 hover:bg-purple-500 rounded-lg"
                                >
                                    Pull
                                </button>
                            </div>
                        </div>
                    </div>
                ) : gitModalTab === 'diff' ? (
                    /* Diff Tab */
                    <div className="space-y-2">
                        {gitDiffContent ? (
                            <pre className="text-xs font-mono whitespace-pre-wrap theme-bg-secondary p-3 rounded-lg overflow-auto max-h-[60vh]">
                                {(gitDiffContent.staged + '\n' + gitDiffContent.unstaged).split('\n').map((line, i) => (
                                    <div key={i} className={
                                        line.startsWith('+') && !line.startsWith('+++') ? 'text-green-400' :
                                        line.startsWith('-') && !line.startsWith('---') ? 'text-red-400' :
                                        line.startsWith('@@') ? 'text-blue-400' :
                                        'theme-text-muted'
                                    }>{line}</div>
                                ))}
                            </pre>
                        ) : (
                            <div className="text-center theme-text-muted py-8">No diff available</div>
                        )}
                    </div>
                ) : gitModalTab === 'branches' ? (
                    /* Branches Tab */
                    <div className="space-y-4">
                        <div className="flex gap-2">
                            <input
                                type="text"
                                placeholder="New branch name..."
                                value={gitNewBranchName}
                                onChange={(e) => setGitNewBranchName(e.target.value)}
                                className="flex-1 px-3 py-2 text-sm theme-bg-secondary border theme-border rounded-lg"
                            />
                            <button
                                onClick={gitCreateBranch}
                                disabled={!gitNewBranchName.trim()}
                                className="px-4 py-2 text-sm bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-lg"
                            >
                                Create
                            </button>
                        </div>

                        {/* Local Branches */}
                        <div>
                            <div className="text-xs font-medium theme-text-muted mb-2 flex items-center gap-2">
                                <span>Local Branches</span>
                                <span className="text-purple-400">({gitBranches?.all?.filter((b: string) => !b.startsWith('remotes/')).length || 0})</span>
                            </div>
                            <div className="space-y-1">
                                {gitBranches?.all?.filter((branch: string) => !branch.startsWith('remotes/')).map((branch: string) => (
                                    <div
                                        key={branch}
                                        className={`flex items-center justify-between p-2 rounded text-sm group ${
                                            branch === gitBranches.current ? 'bg-purple-900/30 border border-purple-500/30' : 'hover:bg-white/5'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2">
                                            {branch === gitBranches.current && <span className="text-purple-400">●</span>}
                                            <span className={branch === gitBranches.current ? 'text-purple-400 font-medium' : 'theme-text-primary'}>
                                                {branch}
                                            </span>
                                        </div>
                                        {branch !== gitBranches.current && (
                                            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => gitCheckoutBranch(branch)}
                                                    className="text-xs text-blue-400 hover:text-blue-300 px-2 py-0.5 rounded hover:bg-blue-900/30"
                                                >
                                                    Checkout
                                                </button>
                                                <button
                                                    onClick={() => gitDeleteBranch(branch)}
                                                    className="text-xs text-red-400 hover:text-red-300 px-2 py-0.5 rounded hover:bg-red-900/30"
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Remote Branches */}
                        {gitBranches?.all?.some((b: string) => b.startsWith('remotes/')) && (
                            <div>
                                <div className="text-xs font-medium theme-text-muted mb-2 flex items-center gap-2">
                                    <span>Remote Branches</span>
                                    <span className="text-orange-400">({gitBranches?.all?.filter((b: string) => b.startsWith('remotes/')).length || 0})</span>
                                </div>
                                <div className="space-y-1 max-h-48 overflow-y-auto">
                                    {gitBranches?.all?.filter((branch: string) => branch.startsWith('remotes/')).map((branch: string) => (
                                        <div
                                            key={branch}
                                            className="flex items-center justify-between p-2 rounded text-sm group hover:bg-white/5"
                                        >
                                            <span className="theme-text-muted text-xs">{branch.replace('remotes/', '')}</span>
                                            <button
                                                onClick={() => gitCheckoutBranch(branch.replace('remotes/origin/', ''))}
                                                className="text-xs text-blue-400 hover:text-blue-300 opacity-0 group-hover:opacity-100"
                                            >
                                                Checkout
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        {gitError && <div className="text-red-500 text-xs mt-2">{gitError}</div>}
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
                    <div className="flex gap-4 h-full min-h-[400px]">
                        {/* Commit List */}
                        <div className="w-1/2 theme-bg-secondary rounded-lg p-3 flex flex-col">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-medium theme-text-muted">Commits</span>
                                <button onClick={loadGitHistory} className="text-xs theme-text-muted hover:theme-text-primary">
                                    <RefreshCw size={12} />
                                </button>
                            </div>
                            <div className="flex-1 overflow-y-auto space-y-1">
                                {gitCommitHistory?.length > 0 ? gitCommitHistory.map((commit: any) => (
                                    <button
                                        key={commit.hash}
                                        onClick={() => loadCommitDetails(commit.hash)}
                                        className={`w-full text-left p-2 rounded text-xs hover:bg-white/5 transition-colors ${
                                            gitSelectedCommit?.hash === commit.hash ? 'bg-purple-900/30 border border-purple-500/30' : ''
                                        }`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <span className="text-purple-400 font-mono">{commit.hash?.slice(0, 7)}</span>
                                            <span className="theme-text-muted">{new Date(commit.date).toLocaleDateString()}</span>
                                        </div>
                                        <div className="theme-text-primary truncate mt-1">{commit.message}</div>
                                        <div className="theme-text-muted mt-0.5">{commit.author_name || commit.author}</div>
                                    </button>
                                )) : (
                                    <div className="text-center theme-text-muted py-4">No commits</div>
                                )}
                            </div>
                        </div>

                        {/* Commit Details */}
                        <div className="w-1/2 theme-bg-secondary rounded-lg p-3 flex flex-col">
                            <span className="text-xs font-medium theme-text-muted mb-2">Details</span>
                            {gitSelectedCommit ? (
                                <div className="flex-1 overflow-y-auto">
                                    <div className="space-y-1 text-xs mb-3 pb-3 border-b theme-border">
                                        <div className="font-mono text-purple-400">{gitSelectedCommit.hash}</div>
                                        <div className="theme-text-primary">{gitSelectedCommit.author_name} &lt;{gitSelectedCommit.author_email}&gt;</div>
                                        <div className="theme-text-muted">{new Date(gitSelectedCommit.date).toLocaleString()}</div>
                                        <div className="theme-text-primary mt-2 whitespace-pre-wrap">{gitSelectedCommit.message}</div>
                                    </div>
                                    {gitSelectedCommit.diff && (
                                        <pre className="text-xs font-mono overflow-auto p-2 bg-black/30 rounded whitespace-pre-wrap">
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
                                <div className="flex-1 flex items-center justify-center theme-text-muted text-sm">
                                    Select a commit to view details
                                </div>
                            )}
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    );
});

GitPane.displayName = 'GitPane';

export default GitPane;
