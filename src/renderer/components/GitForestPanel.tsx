import React, { useState, useEffect, useCallback } from 'react';
import { Globe, Users, Upload, Download, RefreshCw, Copy, Server, Link } from 'lucide-react';

interface PeerInfo {
    peer_id: string;
    peer_name?: string;
    address: string;
}

interface RepoInfo {
    name: string;
    clone_url: string;
    description: string;
    seeding: boolean;
    owner: string;
}

interface ForestStatus {
    peer_id: string;
    peer_name: string | null;
    api_port: number;
    p2p_port: number;
    repos_hosted: number;
    repos_seeding: number;
}

const FOREST_API = 'http://127.0.0.1:7878';

const GitForestPanel: React.FC<{ currentPath: string }> = ({ currentPath }) => {
    const [status, setStatus] = useState<ForestStatus | null>(null);
    const [peers, setPeers] = useState<string[]>([]);
    const [repos, setRepos] = useState<RepoInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [addingRepo, setAddingRepo] = useState(false);
    const [repoName, setRepoName] = useState('');
    const [repoDesc, setRepoDesc] = useState('');
    const [copied, setCopied] = useState('');

    const fetchAll = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [statusRes, peersRes, reposRes] = await Promise.all([
                fetch(`${FOREST_API}/api/status`).then(r => r.json()),
                fetch(`${FOREST_API}/api/peers`).then(r => r.json()),
                fetch(`${FOREST_API}/api/repos`).then(r => r.json()),
            ]);
            setStatus(statusRes);
            setPeers(peersRes.peers || []);
            setRepos(reposRes);
        } catch {
            setError('GitForest daemon not running. Start it with: gitforest daemon');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    const addRepo = async () => {
        if (!currentPath || !repoName) return;
        setAddingRepo(true);
        try {
            const res = await fetch(`${FOREST_API}/api/repos`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    path: currentPath,
                    name: repoName,
                    description: repoDesc,
                }),
            });
            if (res.ok) {
                setRepoName('');
                setRepoDesc('');
                await fetchAll();
            }
        } catch {
            setError('Failed to add repo');
        } finally {
            setAddingRepo(false);
        }
    };

    const copyToClipboard = (text: string, label: string) => {
        navigator.clipboard.writeText(text);
        setCopied(label);
        setTimeout(() => setCopied(''), 2000);
    };

    if (loading) {
        return <div className="text-center py-8 theme-text-muted text-sm">Connecting to GitForest daemon...</div>;
    }

    if (error) {
        return (
            <div className="space-y-4">
                <div className="text-center py-6">
                    <Globe size={32} className="mx-auto mb-3 text-purple-400 opacity-50" />
                    <p className="text-sm theme-text-muted mb-2">{error}</p>
                    <code className="text-xs theme-bg-tertiary px-3 py-1 rounded">gitforest daemon --foreground</code>
                </div>
                <button onClick={fetchAll} className="mx-auto flex items-center gap-2 px-3 py-1.5 text-xs theme-bg-tertiary theme-hover rounded-lg">
                    <RefreshCw size={12} /> Retry
                </button>
            </div>
        );
    }

    const isCurrentRepoHosted = repos.some(r => r.path === currentPath);

    return (
        <div className="space-y-4">
            {/* Node Status */}
            <div className="theme-bg-secondary rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-medium theme-text-primary flex items-center gap-2">
                        <Globe size={14} className="text-purple-400" /> GitForest Node
                    </h3>
                    <button onClick={fetchAll} className="p-1 theme-hover rounded">
                        <RefreshCw size={12} />
                    </button>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="theme-bg-tertiary rounded px-2 py-1.5">
                        <span className="theme-text-muted">Peer:</span>{' '}
                        <span className="text-purple-400 font-mono">
                            {status?.peer_name || status?.peer_id?.slice(0, 12) + '...'}
                        </span>
                    </div>
                    <div className="theme-bg-tertiary rounded px-2 py-1.5">
                        <span className="theme-text-muted">Peers:</span>{' '}
                        <span className="text-green-400">{peers.length} connected</span>
                    </div>
                    <div className="theme-bg-tertiary rounded px-2 py-1.5">
                        <span className="theme-text-muted">Repos:</span>{' '}
                        {status?.repos_hosted || 0} hosted
                    </div>
                    <div className="theme-bg-tertiary rounded px-2 py-1.5">
                        <span className="theme-text-muted">P2P:</span>{' '}
                        port {status?.p2p_port}
                    </div>
                </div>
            </div>

            {/* Connected Peers */}
            {peers.length > 0 && (
                <div className="theme-bg-secondary rounded-lg p-3">
                    <h3 className="text-sm font-medium theme-text-primary flex items-center gap-2 mb-2">
                        <Users size={14} className="text-green-400" /> Peers
                    </h3>
                    <div className="space-y-1">
                        {peers.map((peer, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs theme-bg-tertiary rounded px-2 py-1.5">
                                <Server size={10} className="text-green-400" />
                                <span className="font-mono theme-text-muted truncate">{peer}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Hosted Repos */}
            <div className="theme-bg-secondary rounded-lg p-3">
                <h3 className="text-sm font-medium theme-text-primary flex items-center gap-2 mb-2">
                    <Upload size={14} className="text-blue-400" /> Hosted Repos
                </h3>
                {repos.length === 0 ? (
                    <p className="text-xs theme-text-muted">No repos hosted yet.</p>
                ) : (
                    <div className="space-y-2">
                        {repos.map(repo => (
                            <div key={repo.name} className="theme-bg-tertiary rounded p-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium">{repo.name}</span>
                                    <button
                                        onClick={() => copyToClipboard(repo.clone_url, repo.name)}
                                        className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300"
                                        title="Copy clone URL"
                                    >
                                        <Copy size={10} />
                                        {copied === repo.name ? 'Copied!' : 'Clone URL'}
                                    </button>
                                </div>
                                {repo.description && (
                                    <p className="text-xs theme-text-muted mt-1">{repo.description}</p>
                                )}
                                <div className="flex items-center gap-2 mt-1">
                                    <Link size={10} className="text-purple-400" />
                                    <code className="text-xs font-mono theme-text-muted truncate">{repo.clone_url}</code>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Add Current Repo */}
            {!isCurrentRepoHosted && currentPath && (
                <div className="theme-bg-secondary rounded-lg p-3">
                    <h3 className="text-sm font-medium theme-text-primary flex items-center gap-2 mb-2">
                        <Download size={14} className="text-amber-400" /> Host This Repo
                    </h3>
                    <p className="text-xs theme-text-muted mb-2">Share this repo on the P2P network.</p>
                    <div className="space-y-2">
                        <input
                            value={repoName}
                            onChange={e => setRepoName(e.target.value)}
                            placeholder="Repo name"
                            className="w-full px-2 py-1.5 text-xs theme-bg-primary border theme-border rounded"
                        />
                        <input
                            value={repoDesc}
                            onChange={e => setRepoDesc(e.target.value)}
                            placeholder="Description (optional)"
                            className="w-full px-2 py-1.5 text-xs theme-bg-primary border theme-border rounded"
                        />
                        <button
                            onClick={addRepo}
                            disabled={!repoName || addingRepo}
                            className="w-full px-3 py-1.5 text-xs bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-lg"
                        >
                            {addingRepo ? 'Adding...' : 'Host on GitForest'}
                        </button>
                    </div>
                </div>
            )}

            {isCurrentRepoHosted && (
                <div className="text-center py-2">
                    <span className="text-xs text-green-400">This repo is hosted on GitForest</span>
                </div>
            )}
        </div>
    );
};

export default GitForestPanel;
