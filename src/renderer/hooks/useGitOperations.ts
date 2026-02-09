import { useState, useCallback } from 'react';

interface UseGitOperationsParams {
    currentPath: string;
}

export function useGitOperations({ currentPath }: UseGitOperationsParams) {
    const [gitStatus, setGitStatus] = useState<GitStatusData | null>(null);
    const [gitCommitMessage, setGitCommitMessage] = useState('');
    const [gitLoading, setGitLoading] = useState(false);
    const [gitError, setGitError] = useState<string | null>(null);
    const [noUpstreamPrompt, setNoUpstreamPrompt] = useState<{ branch: string; command: string } | null>(null);
    const [gitModalTab, setGitModalTab] = useState<'status' | 'diff' | 'branches' | 'history'>('status');
    const [gitDiffContent, setGitDiffContent] = useState<GitDiffData | null>(null);
    const [gitBranches, setGitBranches] = useState<GitBranchesData | null>(null);
    const [gitCommitHistory, setGitCommitHistory] = useState<any[]>([]);
    const [gitSelectedFile, setGitSelectedFile] = useState<string | null>(null);
    const [gitNewBranchName, setGitNewBranchName] = useState('');
    const [gitSelectedCommit, setGitSelectedCommit] = useState<GitCommitData | null>(null);
    const [gitFileDiff, setGitFileDiff] = useState<string | null>(null);

    const loadGitStatus = useCallback(async () => {
        if (!currentPath) return;
        try {
            const status = await (window as any).api.gitStatus(currentPath);
            setGitStatus(status);
        } catch (err) {
            console.error('Failed to load git status:', err);
            setGitStatus(null);
        }
    }, [currentPath]);

    const gitStageFile = async (file: string) => {
        setGitLoading(true);
        setGitError(null);
        try {
            await (window as any).api.gitStageFile(currentPath, file);
            await loadGitStatus();
        } catch (err: any) {
            setGitError(err.message || 'Failed to stage file');
        } finally {
            setGitLoading(false);
        }
    };

    const gitUnstageFile = async (file: string) => {
        setGitLoading(true);
        setGitError(null);
        try {
            await (window as any).api.gitUnstageFile(currentPath, file);
            await loadGitStatus();
        } catch (err: any) {
            setGitError(err.message || 'Failed to unstage file');
        } finally {
            setGitLoading(false);
        }
    };

    const gitCommitChanges = async () => {
        if (!gitCommitMessage.trim()) return;
        setGitLoading(true);
        setGitError(null);
        try {
            await (window as any).api.gitCommit(currentPath, gitCommitMessage.trim());
            setGitCommitMessage('');
            await loadGitStatus();
        } catch (err: any) {
            setGitError(err.message || 'Failed to commit');
        } finally {
            setGitLoading(false);
        }
    };

    const gitPullChanges = async () => {
        setGitLoading(true);
        setGitError(null);
        try {
            await (window as any).api.gitPull(currentPath);
            await loadGitStatus();
        } catch (err: any) {
            setGitError(err.message || 'Failed to pull');
        } finally {
            setGitLoading(false);
        }
    };

    const gitPushChanges = async () => {
        setGitLoading(true);
        setGitError(null);
        setNoUpstreamPrompt(null);
        try {
            const result = await (window as any).api.gitPush(currentPath);
            if (!result.success) {
                if (result.noUpstream) {
                    setNoUpstreamPrompt({ branch: result.currentBranch, command: result.suggestedCommand });
                } else {
                    setGitError(result.error || 'Failed to push');
                }
            } else {
                await loadGitStatus();
            }
        } catch (err: any) {
            setGitError(err.message || 'Failed to push');
        } finally {
            setGitLoading(false);
        }
    };

    const gitPushWithUpstream = async () => {
        if (!noUpstreamPrompt) return;
        setGitLoading(true);
        setGitError(null);
        try {
            const result = await (window as any).api.gitPushSetUpstream(currentPath, noUpstreamPrompt.branch);
            if (result.success) {
                setNoUpstreamPrompt(null);
                await loadGitStatus();
            } else {
                setGitError(result.error || 'Failed to push');
            }
        } catch (err: any) {
            setGitError(err.message || 'Failed to push');
        } finally {
            setGitLoading(false);
        }
    };

    const gitEnableAutoSetupRemote = async () => {
        try {
            await (window as any).api.gitSetAutoSetupRemote();
            await gitPushWithUpstream();
        } catch (err: any) {
            setGitError(err.message || 'Failed to set config');
        }
    };

    const loadGitDiff = useCallback(async () => {
        if (!currentPath) return;
        try {
            const diff = await (window as any).api.gitDiffAll(currentPath);
            setGitDiffContent(diff);
        } catch (err) {
            console.error('Failed to load git diff:', err);
            setGitDiffContent(null);
        }
    }, [currentPath]);

    const loadGitBranches = useCallback(async () => {
        if (!currentPath) return;
        try {
            const branches = await (window as any).api.gitBranches(currentPath);
            setGitBranches(branches);
        } catch (err) {
            console.error('Failed to load git branches:', err);
            setGitBranches(null);
        }
    }, [currentPath]);

    const loadGitHistory = useCallback(async () => {
        if (!currentPath) return;
        try {
            const result = await (window as any).api.gitLog(currentPath, { maxCount: 50 });
            if (result?.success && result.commits) {
                setGitCommitHistory(result.commits);
            } else {
                setGitCommitHistory([]);
            }
        } catch (err) {
            console.error('Failed to load git history:', err);
            setGitCommitHistory([]);
        }
    }, [currentPath]);

    const gitCreateBranch = async () => {
        if (!gitNewBranchName.trim()) return;
        setGitLoading(true);
        setGitError(null);
        try {
            await (window as any).api.gitCreateBranch(currentPath, gitNewBranchName.trim());
            setGitNewBranchName('');
            await loadGitBranches();
            await loadGitStatus();
        } catch (err: any) {
            setGitError(err.message || 'Failed to create branch');
        } finally {
            setGitLoading(false);
        }
    };

    const gitCheckoutBranch = async (branchName: string) => {
        setGitLoading(true);
        setGitError(null);
        try {
            await (window as any).api.gitCheckout(currentPath, branchName);
            await loadGitBranches();
            await loadGitStatus();
        } catch (err: any) {
            setGitError(err.message || 'Failed to checkout branch');
        } finally {
            setGitLoading(false);
        }
    };

    const gitDeleteBranch = async (branchName: string, force: boolean = false) => {
        setGitLoading(true);
        setGitError(null);
        try {
            await (window as any).api.gitDeleteBranch(currentPath, branchName, force);
            await loadGitBranches();
        } catch (err: any) {
            setGitError(err.message || 'Failed to delete branch');
        } finally {
            setGitLoading(false);
        }
    };

    const loadCommitDetails = async (commitHash: string) => {
        try {
            const result = await (window as any).api.gitShowCommit(currentPath, commitHash);
            const commitMeta = gitCommitHistory.find((c: any) => c.hash === commitHash);
            if (result?.success) {
                setGitSelectedCommit({
                    hash: commitHash,
                    author_name: commitMeta?.author_name || 'Unknown',
                    author_email: commitMeta?.author_email || '',
                    date: commitMeta?.date || new Date().toISOString(),
                    message: commitMeta?.message || '',
                    details: result.details,
                    diff: result.diff
                });
            }
        } catch (err) {
            console.error('Failed to load commit details:', err);
        }
    };

    const loadFileDiff = async (filePath: string, staged: boolean = false) => {
        try {
            const diff = await (window as any).api.gitDiff(currentPath, filePath, staged);
            setGitSelectedFile(filePath);
            setGitFileDiff(diff);
            return diff;
        } catch (err) {
            console.error('Failed to load file diff:', err);
            setGitFileDiff(null);
            return null;
        }
    };

    return {
        // State
        gitStatus,
        setGitStatus,
        gitCommitMessage,
        setGitCommitMessage,
        gitLoading,
        setGitLoading,
        gitError,
        setGitError,
        noUpstreamPrompt,
        setNoUpstreamPrompt,
        gitModalTab,
        setGitModalTab,
        gitDiffContent,
        gitBranches,
        gitCommitHistory,
        gitSelectedFile,
        setGitSelectedFile,
        gitNewBranchName,
        setGitNewBranchName,
        gitSelectedCommit,
        gitFileDiff,
        setGitFileDiff,
        // Handlers
        loadGitStatus,
        gitStageFile,
        gitUnstageFile,
        gitCommitChanges,
        gitPullChanges,
        gitPushChanges,
        gitPushWithUpstream,
        gitEnableAutoSetupRemote,
        loadGitDiff,
        loadGitBranches,
        loadGitHistory,
        gitCreateBranch,
        gitCheckoutBranch,
        gitDeleteBranch,
        loadCommitDetails,
        loadFileDiff,
    };
}
