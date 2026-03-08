

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Zap, BookOpen, RefreshCw, Plus, Trash2, ChevronRight, ChevronDown,
    Loader, AlertCircle, Search, X, FolderOpen, Globe, Lock,
    Download, GitBranch, ExternalLink, Edit3, Copy, Check,
    FileText, Folder, ArrowLeft, Link
} from 'lucide-react';

interface SkillsManagerProps {
    currentPath: string;
    embedded?: boolean;
    onOpenJinxEditor?: () => void;
}

interface JinxItem {
    jinx_name: string;
    path: string;
    source_path?: string;
    description: string;
    inputs: any[];
    steps: any[];
    team: 'npcsh' | 'incognide' | 'project';
    scope: 'global' | 'project';
}

interface TreeNode {
    name: string;
    type: 'folder' | 'file';
    children?: TreeNode[];
    jinx?: JinxItem;
    path: string;
    count?: number;
}

type ViewMode = 'browse' | 'create' | 'import';
type ScopeTab = 'all' | 'npcsh' | 'incognide' | 'project';

const TEAM_COLORS: Record<string, { badge: string; bg: string; text: string }> = {
    npcsh: { badge: 'bg-blue-500/20 text-blue-400', bg: 'bg-blue-500/5', text: 'text-blue-400' },
    incognide: { badge: 'bg-green-500/20 text-green-400', bg: 'bg-green-500/5', text: 'text-green-400' },
    project: { badge: 'bg-purple-500/20 text-purple-400', bg: 'bg-purple-500/5', text: 'text-purple-400' },
};

const TEAM_LABELS: Record<string, string> = {
    npcsh: 'Global (npcsh)',
    incognide: 'Global (incognide)',
    project: 'Project',
};

const ENGINE_OPTIONS = [
    { value: 'python', label: 'Python' },
    { value: 'bash', label: 'Bash' },
    { value: 'natural', label: 'Natural Language' },
];

function buildTeamTree(jinxes: JinxItem[], teamName: string): TreeNode {
    const root: TreeNode = { name: teamName, type: 'folder', children: [], path: teamName, count: jinxes.length };

    for (const jinx of jinxes) {
        const pathParts = (jinx.path || jinx.jinx_name).split('/');
        let current = root;

        for (let i = 0; i < pathParts.length - 1; i++) {
            const folderName = pathParts[i];
            const folderPath = `${teamName}/${pathParts.slice(0, i + 1).join('/')}`;
            let child = current.children!.find(c => c.type === 'folder' && c.name === folderName);
            if (!child) {
                child = { name: folderName, type: 'folder', children: [], path: folderPath, count: 0 };
                current.children!.push(child);
            }
            current = child;
        }

        current.children!.push({
            name: jinx.jinx_name,
            type: 'file',
            jinx,
            path: `${teamName}/${jinx.path || jinx.jinx_name}`,
        });
    }

    const sortAndCount = (node: TreeNode): number => {
        if (!node.children) return 0;
        let count = 0;
        node.children.sort((a, b) => {
            if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
            return a.name.localeCompare(b.name);
        });
        for (const child of node.children) {
            if (child.type === 'file') count++;
            else {
                const childCount = sortAndCount(child);
                child.count = childCount;
                count += childCount;
            }
        }
        return count;
    };
    root.count = sortAndCount(root);

    return root;
}

function filterJinxes(jinxes: JinxItem[], query: string): JinxItem[] {
    if (!query) return jinxes;
    const q = query.toLowerCase();
    return jinxes.filter(j =>
        j.jinx_name.toLowerCase().includes(q) ||
        j.path?.toLowerCase().includes(q) ||
        j.description?.toLowerCase().includes(q)
    );
}

const SkillsManager: React.FC<SkillsManagerProps> = ({ currentPath, embedded = true, onOpenJinxEditor }) => {

    const [jinxesByTeam, setJinxesByTeam] = useState<{ npcsh: JinxItem[]; incognide: JinxItem[]; project: JinxItem[] }>({
        npcsh: [], incognide: [], project: [],
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [selectedJinx, setSelectedJinx] = useState<JinxItem | null>(null);
    const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(['project', 'incognide', 'npcsh']));

    const [searchQuery, setSearchQuery] = useState('');
    const [scopeTab, setScopeTab] = useState<ScopeTab>('all');
    const [viewMode, setViewMode] = useState<ViewMode>('browse');
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

    const [newName, setNewName] = useState('');
    const [newDesc, setNewDesc] = useState('');
    const [newPath, setNewPath] = useState('');
    const [newScope, setNewScope] = useState<'global' | 'project'>('project');
    const [newInputs, setNewInputs] = useState<string[]>([]);
    const [newEngine, setNewEngine] = useState('python');
    const [newCode, setNewCode] = useState('');
    const [createLoading, setCreateLoading] = useState(false);

    const [importUrl, setImportUrl] = useState('');
    const [importType, setImportType] = useState<'url' | 'repo'>('url');
    const [importScope, setImportScope] = useState<'global' | 'project'>('project');
    const [importBranch, setImportBranch] = useState('');
    const [importLoading, setImportLoading] = useState(false);
    const [importError, setImportError] = useState<string | null>(null);
    const [importResult, setImportResult] = useState<any>(null);

    const loadAllJinxes = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await (window as any).api.getJinxesAllTeams(currentPath);
            if (result?.error) setError(result.error);
            setJinxesByTeam({
                npcsh: result?.npcsh || [],
                incognide: result?.incognide || [],
                project: result?.project || [],
            });
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [currentPath]);

    useEffect(() => { loadAllJinxes(); }, [currentPath]);

    const trees = useMemo(() => {
        const filtered = {
            npcsh: filterJinxes(jinxesByTeam.npcsh, searchQuery),
            incognide: filterJinxes(jinxesByTeam.incognide, searchQuery),
            project: filterJinxes(jinxesByTeam.project, searchQuery),
        };

        const result: TreeNode[] = [];
        if (scopeTab === 'all' || scopeTab === 'project') {
            if (filtered.project.length > 0) result.push(buildTeamTree(filtered.project, 'project'));
        }
        if (scopeTab === 'all' || scopeTab === 'incognide') {
            if (filtered.incognide.length > 0) result.push(buildTeamTree(filtered.incognide, 'incognide'));
        }
        if (scopeTab === 'all' || scopeTab === 'npcsh') {
            if (filtered.npcsh.length > 0) result.push(buildTeamTree(filtered.npcsh, 'npcsh'));
        }
        return result;
    }, [jinxesByTeam, searchQuery, scopeTab]);

    const totalCount = jinxesByTeam.npcsh.length + jinxesByTeam.incognide.length + jinxesByTeam.project.length;

    const toggleNode = (path: string) => {
        setExpandedNodes(prev => {
            const next = new Set(prev);
            if (next.has(path)) next.delete(path);
            else next.add(path);
            return next;
        });
    };

    const handleDelete = useCallback(async (jinx: JinxItem) => {
        try {
            setError(null);
            const result = await (window as any).api.deleteJinx({
                jinxPath: jinx.path,
                sourcePath: jinx.source_path,
                scope: jinx.scope,
                currentPath,
            });
            if (result?.error) {
                setError(result.error);
                return;
            }
            if (selectedJinx?.path === jinx.path) {
                setSelectedJinx(null);
            }
            setDeleteConfirm(null);
            await loadAllJinxes();
        } catch (err: any) {
            setError(err.message);
        }
    }, [currentPath, loadAllJinxes, selectedJinx]);

    const handleCreate = useCallback(async () => {
        if (!newName.trim()) return;
        setCreateLoading(true);
        setError(null);
        try {
            const jinxData: any = {
                jinx_name: newName.trim(),
                description: newDesc.trim(),
                inputs: newInputs.filter(i => i.trim()),
                steps: newCode.trim() ? [{
                    name: newName.trim(),
                    engine: newEngine,
                    code: newCode.trim(),
                }] : [],
            };
            if (newPath.trim()) {
                jinxData.path = `${newPath.trim()}/${newName.trim()}`;
            }
            const result = await (window as any).api.saveJinx({
                jinx: jinxData,
                isGlobal: newScope === 'global',
                currentPath,
            });
            if (result?.error) {
                setError(result.error);
            } else {
                setNewName('');
                setNewDesc('');
                setNewPath('');
                setNewInputs([]);
                setNewCode('');
                setViewMode('browse');
                await loadAllJinxes();
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setCreateLoading(false);
        }
    }, [newName, newDesc, newPath, newScope, newInputs, newEngine, newCode, currentPath, loadAllJinxes]);

    const handleImportUrl = useCallback(async () => {
        if (!importUrl.trim()) return;
        setImportLoading(true);
        setImportError(null);
        try {
            const result = await (window as any).api.ingestJinx({
                url: importUrl.trim(),
                scope: importScope,
                currentPath,
            });
            if (result?.error) {
                setImportError(result.error);
            } else {
                setImportUrl('');
                setImportResult({ type: 'url', message: 'Skill imported successfully' });
                await loadAllJinxes();
            }
        } catch (err: any) {
            setImportError(err.message);
        } finally {
            setImportLoading(false);
        }
    }, [importUrl, importScope, currentPath, loadAllJinxes]);

    const handleImportRepo = useCallback(async () => {
        if (!importUrl.trim()) return;
        setImportLoading(true);
        setImportError(null);
        setImportResult(null);
        try {
            const result = await (window as any).api.importNpcTeam({
                repoUrl: importUrl.trim(),
                scope: importScope,
                currentPath,
                branch: importBranch.trim() || undefined,
            });
            if (result?.error) {
                setImportError(result.error);
            } else {
                setImportResult({
                    type: 'repo',
                    imported: result.imported,
                    target: result.target,
                });
                setImportUrl('');
                setImportBranch('');
                await loadAllJinxes();
            }
        } catch (err: any) {
            setImportError(err.message);
        } finally {
            setImportLoading(false);
        }
    }, [importUrl, importScope, importBranch, currentPath, loadAllJinxes]);

    const renderTreeNode = (node: TreeNode, depth: number = 0): React.ReactNode => {
        const isExpanded = expandedNodes.has(node.path);
        const isTeamRoot = depth === 0;
        const teamKey = isTeamRoot ? node.name : node.path.split('/')[0];
        const colors = TEAM_COLORS[teamKey] || TEAM_COLORS.project;

        if (node.type === 'file' && node.jinx) {
            const isSelected = selectedJinx?.path === node.jinx.path && selectedJinx?.team === node.jinx.team;
            const isSkill = node.jinx.steps?.some((s: any) => s.engine === 'skill');
            return (
                <button
                    key={node.path}
                    onClick={() => setSelectedJinx(node.jinx!)}
                    className={`w-full text-left flex items-center gap-1.5 py-1 px-2 rounded text-xs transition hover:theme-bg-secondary ${
                        isSelected ? 'bg-blue-500/15 theme-text-primary' : 'theme-text-secondary'
                    }`}
                    style={{ paddingLeft: `${depth * 16 + 8}px` }}
                >
                    {isSkill
                        ? <BookOpen size={11} className="text-purple-400 flex-shrink-0" />
                        : <Zap size={11} className="text-yellow-400 flex-shrink-0" />
                    }
                    <span className="truncate">{node.name}</span>
                </button>
            );
        }

        return (
            <div key={node.path}>
                <button
                    onClick={() => toggleNode(node.path)}
                    className={`w-full text-left flex items-center gap-1.5 py-1 px-2 rounded text-xs transition hover:theme-bg-secondary ${
                        isTeamRoot ? 'font-medium' : ''
                    }`}
                    style={{ paddingLeft: `${depth * 16 + 4}px` }}
                >
                    <ChevronRight
                        size={10}
                        className={`theme-text-muted flex-shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                    />
                    {isTeamRoot ? (
                        <>
                            <Globe size={11} className={`${colors.text} flex-shrink-0`} />
                            <span className="theme-text-primary">{TEAM_LABELS[node.name] || node.name}</span>
                            <span className={`text-[9px] px-1.5 py-0 rounded-full ${colors.badge}`}>
                                {node.count}
                            </span>
                        </>
                    ) : (
                        <>
                            <Folder size={11} className="theme-text-muted flex-shrink-0" />
                            <span className="theme-text-secondary">{node.name}</span>
                            {node.count !== undefined && node.count > 0 && (
                                <span className="text-[9px] theme-text-muted">({node.count})</span>
                            )}
                        </>
                    )}
                </button>
                {isExpanded && node.children && (
                    <div>
                        {node.children.map(child => renderTreeNode(child, depth + 1))}
                    </div>
                )}
            </div>
        );
    };

    const renderDetailPanel = () => {
        if (!selectedJinx) return null;
        const colors = TEAM_COLORS[selectedJinx.team] || TEAM_COLORS.project;
        const isConfirmingDelete = deleteConfirm === selectedJinx.path;

        return (
            <div className="flex-1 flex flex-col min-h-0">
                <div className="px-4 py-3 border-b theme-border flex-shrink-0">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 min-w-0">
                            <button
                                onClick={() => setSelectedJinx(null)}
                                className="theme-text-muted hover:theme-text-primary"
                            >
                                <ArrowLeft size={16} />
                            </button>
                            <div className="min-w-0">
                                <h3 className="font-semibold theme-text-primary truncate">
                                    {selectedJinx.jinx_name}
                                </h3>
                                <div className="text-[10px] theme-text-muted font-mono truncate">
                                    {selectedJinx.path}
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                            <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${colors.badge}`}>
                                {TEAM_LABELS[selectedJinx.team]}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {selectedJinx.description && (
                        <div>
                            <div className="text-[10px] font-medium theme-text-muted uppercase tracking-wider mb-1">Description</div>
                            <div className="text-xs theme-text-secondary whitespace-pre-wrap">
                                {selectedJinx.description}
                            </div>
                        </div>
                    )}

                    {selectedJinx.source_path && (
                        <div>
                            <div className="text-[10px] font-medium theme-text-muted uppercase tracking-wider mb-1">File</div>
                            <div className="text-[10px] theme-text-muted font-mono bg-black/20 px-2 py-1 rounded truncate">
                                {selectedJinx.source_path}
                            </div>
                        </div>
                    )}

                    {selectedJinx.inputs && selectedJinx.inputs.length > 0 && (
                        <div>
                            <div className="text-[10px] font-medium theme-text-muted uppercase tracking-wider mb-1">
                                Inputs ({selectedJinx.inputs.length})
                            </div>
                            <div className="space-y-1">
                                {selectedJinx.inputs.map((input: any, idx: number) => {
                                    const isObj = typeof input === 'object';
                                    const name = isObj ? Object.keys(input)[0] : input;
                                    const defaultVal = isObj ? Object.values(input)[0] : null;
                                    return (
                                        <div key={idx} className="flex items-center gap-2 text-xs">
                                            <code className="text-orange-300 font-mono">{name}</code>
                                            {defaultVal !== null && (
                                                <span className="text-[10px] theme-text-muted">
                                                    = {JSON.stringify(defaultVal)}
                                                </span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {selectedJinx.steps && selectedJinx.steps.length > 0 && (
                        <div>
                            <div className="text-[10px] font-medium theme-text-muted uppercase tracking-wider mb-1">
                                Steps ({selectedJinx.steps.length})
                            </div>
                            <div className="space-y-2">
                                {selectedJinx.steps.map((step: any, idx: number) => (
                                    <div key={idx} className="border theme-border rounded p-2">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-xs font-medium theme-text-primary">
                                                {step.name || `Step ${idx + 1}`}
                                            </span>
                                            <span className="text-[9px] px-1.5 rounded-full bg-cyan-500/20 text-cyan-400">
                                                {step.engine || 'unknown'}
                                            </span>
                                        </div>
                                        {step.code && (
                                            <pre className="text-[10px] theme-text-muted font-mono bg-black/20 p-2 rounded overflow-x-auto max-h-32">
                                                {step.code}
                                            </pre>
                                        )}
                                        {step.action && (
                                            <div className="text-[10px] theme-text-muted">
                                                Action: <code className="text-blue-300">{step.action}</code>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="flex gap-2 pt-2 border-t theme-border">
                        <button
                            onClick={() => onOpenJinxEditor?.()}
                            className="theme-button-primary px-3 py-1.5 rounded text-xs flex items-center gap-1.5"
                        >
                            <Edit3 size={12} /> Edit in Jinx Editor
                        </button>
                        {isConfirmingDelete ? (
                            <div className="flex items-center gap-1">
                                <span className="text-xs text-red-400">Delete?</span>
                                <button
                                    onClick={() => handleDelete(selectedJinx)}
                                    className="px-2 py-1.5 rounded text-xs bg-red-500/20 text-red-300 hover:bg-red-500/30"
                                >
                                    Yes
                                </button>
                                <button
                                    onClick={() => setDeleteConfirm(null)}
                                    className="px-2 py-1.5 rounded text-xs theme-button"
                                >
                                    No
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={() => setDeleteConfirm(selectedJinx.path)}
                                className="px-3 py-1.5 rounded text-xs text-red-400 hover:bg-red-500/20 flex items-center gap-1.5"
                            >
                                <Trash2 size={12} /> Delete
                            </button>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    const renderCreateForm = () => (
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
            <div className="flex items-center gap-2 mb-2">
                <button onClick={() => setViewMode('browse')} className="theme-text-muted hover:theme-text-primary">
                    <ArrowLeft size={16} />
                </button>
                <h3 className="font-semibold theme-text-primary">Create New Skill</h3>
            </div>

            <div>
                <label className="text-[10px] font-medium theme-text-muted uppercase tracking-wider block mb-1">Name *</label>
                <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="my_skill"
                    className="w-full theme-input text-xs font-mono px-2 py-1.5 rounded"
                    autoFocus
                />
            </div>

            <div>
                <label className="text-[10px] font-medium theme-text-muted uppercase tracking-wider block mb-1">
                    Folder <span className="normal-case font-normal">(optional)</span>
                </label>
                <input
                    type="text"
                    value={newPath}
                    onChange={(e) => setNewPath(e.target.value)}
                    placeholder="e.g., lib/utils or leave empty for root"
                    className="w-full theme-input text-xs font-mono px-2 py-1.5 rounded"
                />
            </div>

            <div>
                <label className="text-[10px] font-medium theme-text-muted uppercase tracking-wider block mb-1">Scope</label>
                <div className="flex gap-2">
                    <button
                        onClick={() => setNewScope('project')}
                        className={`text-xs px-3 py-1 rounded ${newScope === 'project' ? 'bg-purple-500/30 text-purple-300' : 'theme-text-muted hover:theme-text-secondary theme-bg-secondary'}`}
                    >
                        Project
                    </button>
                    <button
                        onClick={() => setNewScope('global')}
                        className={`text-xs px-3 py-1 rounded ${newScope === 'global' ? 'bg-blue-500/30 text-blue-300' : 'theme-text-muted hover:theme-text-secondary theme-bg-secondary'}`}
                    >
                        Global
                    </button>
                </div>
            </div>

            <div>
                <label className="text-[10px] font-medium theme-text-muted uppercase tracking-wider block mb-1">Description</label>
                <textarea
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                    placeholder="What does this skill do?"
                    className="w-full theme-input text-xs px-2 py-1.5 rounded resize-none"
                    rows={2}
                />
            </div>

            <div>
                <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-medium theme-text-muted uppercase tracking-wider">Inputs</label>
                    <button
                        onClick={() => setNewInputs([...newInputs, ''])}
                        className="text-[10px] text-blue-400 hover:underline flex items-center gap-0.5"
                    >
                        <Plus size={9} /> Add
                    </button>
                </div>
                {newInputs.map((input, idx) => (
                    <div key={idx} className="flex gap-1 mb-1">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => {
                                const updated = [...newInputs];
                                updated[idx] = e.target.value;
                                setNewInputs(updated);
                            }}
                            placeholder="input_name"
                            className="flex-1 theme-input text-xs font-mono px-2 py-1 rounded"
                        />
                        <button
                            onClick={() => setNewInputs(newInputs.filter((_, i) => i !== idx))}
                            className="px-1 text-red-400 hover:bg-red-500/20 rounded"
                        >
                            <X size={12} />
                        </button>
                    </div>
                ))}
            </div>

            <div>
                <label className="text-[10px] font-medium theme-text-muted uppercase tracking-wider block mb-1">Code</label>
                <div className="flex gap-2 mb-1">
                    {ENGINE_OPTIONS.map(opt => (
                        <button
                            key={opt.value}
                            onClick={() => setNewEngine(opt.value)}
                            className={`text-[10px] px-2 py-0.5 rounded ${
                                newEngine === opt.value
                                    ? 'bg-cyan-500/30 text-cyan-300'
                                    : 'theme-text-muted hover:theme-text-secondary theme-bg-secondary'
                            }`}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
                <textarea
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value)}
                    placeholder={newEngine === 'python' ? '# Your Python code here...' : newEngine === 'bash' ? '# Your shell commands...' : 'Describe what should happen...'}
                    className="w-full theme-input text-xs font-mono px-2 py-1.5 rounded resize-none"
                    rows={6}
                />
            </div>

            <button
                onClick={handleCreate}
                disabled={!newName.trim() || createLoading}
                className="w-full theme-button-primary px-3 py-2 rounded text-xs flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
                {createLoading ? <Loader size={12} className="animate-spin" /> : <Plus size={12} />}
                Create Skill
            </button>
        </div>
    );

    const renderImportPanel = () => (
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
            <div className="flex items-center gap-2 mb-2">
                <button onClick={() => { setViewMode('browse'); setImportResult(null); setImportError(null); }} className="theme-text-muted hover:theme-text-primary">
                    <ArrowLeft size={16} />
                </button>
                <h3 className="font-semibold theme-text-primary">Import Skills</h3>
            </div>

            <div className="flex gap-0 border-b theme-border">
                <button
                    onClick={() => { setImportType('url'); setImportError(null); setImportResult(null); }}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs transition ${
                        importType === 'url'
                            ? 'theme-text-primary border-b-2 border-blue-400'
                            : 'theme-text-muted hover:theme-text-secondary'
                    }`}
                >
                    <Link size={12} /> From URL
                </button>
                <button
                    onClick={() => { setImportType('repo'); setImportError(null); setImportResult(null); }}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs transition ${
                        importType === 'repo'
                            ? 'theme-text-primary border-b-2 border-green-400'
                            : 'theme-text-muted hover:theme-text-secondary'
                    }`}
                >
                    <GitBranch size={12} /> From Repository
                </button>
            </div>

            <div className="flex items-center gap-2">
                <span className="text-[10px] theme-text-muted">Import to:</span>
                <button
                    onClick={() => setImportScope('project')}
                    className={`text-xs px-2 py-0.5 rounded ${importScope === 'project' ? 'bg-purple-500/30 text-purple-300' : 'theme-text-muted hover:theme-text-secondary'}`}
                >
                    Project
                </button>
                <button
                    onClick={() => setImportScope('global')}
                    className={`text-xs px-2 py-0.5 rounded ${importScope === 'global' ? 'bg-blue-500/30 text-blue-300' : 'theme-text-muted hover:theme-text-secondary'}`}
                >
                    Global
                </button>
            </div>

            {importType === 'url' ? (
                <div className="space-y-2">
                    <input
                        type="text"
                        value={importUrl}
                        onChange={(e) => setImportUrl(e.target.value)}
                        placeholder="https://github.com/user/repo/blob/main/skill.jinx"
                        className="w-full theme-input text-xs font-mono px-2 py-1.5 rounded"
                        onKeyDown={(e) => e.key === 'Enter' && handleImportUrl()}
                        autoFocus
                    />
                    <div className="text-[10px] theme-text-muted">
                        Supports .jinx files, SKILL.md files, and GitHub URLs (auto-resolves raw content)
                    </div>
                    <button
                        onClick={handleImportUrl}
                        disabled={!importUrl.trim() || importLoading}
                        className="w-full theme-button-primary px-3 py-1.5 rounded text-xs flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                        {importLoading ? <Loader size={12} className="animate-spin" /> : <Download size={12} />}
                        Import Skill
                    </button>
                </div>
            ) : (
                <div className="space-y-2">
                    <input
                        type="text"
                        value={importUrl}
                        onChange={(e) => setImportUrl(e.target.value)}
                        placeholder="https://github.com/user/npc-team-repo.git"
                        className="w-full theme-input text-xs font-mono px-2 py-1.5 rounded"
                        onKeyDown={(e) => e.key === 'Enter' && handleImportRepo()}
                        autoFocus
                    />
                    <input
                        type="text"
                        value={importBranch}
                        onChange={(e) => setImportBranch(e.target.value)}
                        placeholder="Branch (optional, defaults to default branch)"
                        className="w-full theme-input text-xs font-mono px-2 py-1.5 rounded"
                    />
                    <div className="text-[10px] theme-text-muted">
                        Clones the repository and imports the <code className="text-blue-300">npc_team/</code> directory.
                        Includes jinxes, NPCs, context files, and all team resources.
                    </div>
                    <button
                        onClick={handleImportRepo}
                        disabled={!importUrl.trim() || importLoading}
                        className="w-full theme-button-primary px-3 py-1.5 rounded text-xs flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                        {importLoading ? <Loader size={12} className="animate-spin" /> : <GitBranch size={12} />}
                        {importLoading ? 'Cloning...' : 'Import NPC Team'}
                    </button>
                </div>
            )}

            {importError && (
                <div className="flex items-start gap-2 p-2 rounded bg-red-900/20 border border-red-500/30">
                    <AlertCircle size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
                    <span className="text-xs text-red-300">{importError}</span>
                </div>
            )}

            {importResult && (
                <div className="p-3 rounded bg-green-900/20 border border-green-500/30">
                    <div className="flex items-center gap-2 mb-2">
                        <Check size={14} className="text-green-400" />
                        <span className="text-xs text-green-300 font-medium">
                            {importResult.type === 'url' ? importResult.message : 'NPC Team imported successfully'}
                        </span>
                    </div>
                    {importResult.imported && (
                        <div className="grid grid-cols-2 gap-1 text-[10px]">
                            {importResult.imported.jinxes > 0 && (
                                <div className="theme-text-secondary">
                                    <Zap size={9} className="inline text-yellow-400 mr-1" />
                                    {importResult.imported.jinxes} jinxes
                                </div>
                            )}
                            {importResult.imported.npcs > 0 && (
                                <div className="theme-text-secondary">
                                    <Globe size={9} className="inline text-blue-400 mr-1" />
                                    {importResult.imported.npcs} NPCs
                                </div>
                            )}
                            {importResult.imported.contexts > 0 && (
                                <div className="theme-text-secondary">
                                    <FileText size={9} className="inline text-green-400 mr-1" />
                                    {importResult.imported.contexts} contexts
                                </div>
                            )}
                            {importResult.imported.other > 0 && (
                                <div className="theme-text-secondary">
                                    <FolderOpen size={9} className="inline text-gray-400 mr-1" />
                                    {importResult.imported.other} other files
                                </div>
                            )}
                        </div>
                    )}
                    {importResult.target && (
                        <div className="text-[9px] theme-text-muted font-mono mt-1 truncate">
                            Target: {importResult.target}
                        </div>
                    )}
                </div>
            )}
        </div>
    );

    return (
        <div className="flex flex-col h-full theme-bg-primary text-sm">
            <div className="flex items-center justify-between px-4 py-3 border-b theme-border flex-shrink-0">
                <div className="flex items-center gap-3">
                    <Zap size={18} className="text-purple-400" />
                    <h2 className="font-semibold theme-text-primary">Skills & Jinxes</h2>
                    <span className="text-xs theme-text-muted">
                        {totalCount} total
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => { setViewMode('create'); setSelectedJinx(null); }}
                        className={`theme-button px-2 py-1 rounded text-xs flex items-center gap-1 ${viewMode === 'create' ? 'ring-1 ring-blue-400' : ''}`}
                        title="Create new skill"
                    >
                        <Plus size={12} /> Create
                    </button>
                    <button
                        onClick={() => { setViewMode('import'); setSelectedJinx(null); setImportResult(null); setImportError(null); }}
                        className={`theme-button px-2 py-1 rounded text-xs flex items-center gap-1 ${viewMode === 'import' ? 'ring-1 ring-blue-400' : ''}`}
                        title="Import skills or NPC team"
                    >
                        <Download size={12} /> Import
                    </button>
                    <button
                        onClick={() => { setLoading(true); loadAllJinxes(); }}
                        className="theme-button p-1 rounded"
                        title="Refresh"
                    >
                        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {error && (
                <div className="px-4 py-2 bg-red-900/20 border-b border-red-500/30 flex items-center gap-2">
                    <AlertCircle size={14} className="text-red-400 flex-shrink-0" />
                    <span className="text-xs text-red-300 flex-1">{error}</span>
                    <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300">
                        <X size={12} />
                    </button>
                </div>
            )}

            {viewMode === 'browse' && (
                <div className="px-4 py-2 border-b theme-border flex items-center gap-2 flex-shrink-0">
                    <div className="flex-1 relative">
                        <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 theme-text-muted" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Filter skills..."
                            className="w-full theme-input text-xs pl-7 pr-2 py-1.5 rounded"
                        />
                    </div>
                    <div className="flex gap-0.5 rounded theme-bg-secondary p-0.5">
                        {(['all', 'project', 'incognide', 'npcsh'] as ScopeTab[]).map(tab => (
                            <button
                                key={tab}
                                onClick={() => setScopeTab(tab)}
                                className={`text-[10px] px-2 py-1 rounded capitalize ${
                                    scopeTab === tab
                                        ? 'theme-bg-primary theme-text-primary shadow-sm'
                                        : 'theme-text-muted hover:theme-text-secondary'
                                }`}
                            >
                                {tab === 'all' ? 'All' : tab === 'npcsh' ? 'npcsh' : tab === 'incognide' ? 'incognide' : 'Project'}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {viewMode === 'create' ? renderCreateForm() :
             viewMode === 'import' ? renderImportPanel() : (
                <div className="flex flex-1 min-h-0">
                    <div className={`${selectedJinx ? 'w-72' : 'w-full'} border-r theme-border flex flex-col min-h-0 transition-all`}>
                        <div className="flex-1 overflow-y-auto">
                            {loading && totalCount === 0 ? (
                                <div className="flex items-center justify-center p-8">
                                    <Loader size={20} className="animate-spin theme-text-muted" />
                                </div>
                            ) : trees.length === 0 ? (
                                <div className="text-center py-8 px-4">
                                    <Zap size={32} className="mx-auto mb-3 theme-text-muted opacity-40" />
                                    <div className="text-xs theme-text-muted">
                                        {searchQuery ? 'No skills match your search' : 'No skills or jinxes found'}
                                    </div>
                                    {!searchQuery && (
                                        <div className="mt-3 space-y-1">
                                            <button
                                                onClick={() => setViewMode('create')}
                                                className="text-xs text-blue-400 hover:underline block mx-auto"
                                            >
                                                Create your first skill
                                            </button>
                                            <button
                                                onClick={() => setViewMode('import')}
                                                className="text-xs text-blue-400 hover:underline block mx-auto"
                                            >
                                                Import from URL or repo
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="p-2 space-y-0.5">
                                    {trees.map(tree => renderTreeNode(tree, 0))}
                                </div>
                            )}
                        </div>
                    </div>

                    {selectedJinx && renderDetailPanel()}
                </div>
            )}
        </div>
    );
};

export default SkillsManager;
