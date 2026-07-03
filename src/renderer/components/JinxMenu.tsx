import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { BACKEND_URL } from '../config';
import yaml from 'js-yaml';
import {
    Wrench, Loader, ChevronDown, ChevronRight, X, Save, Plus, Trash2,
    FolderTree, Play, History, CheckCircle, XCircle, Tag
} from 'lucide-react';
import AutosizeTextarea from './AutosizeTextarea';

const JinxMenu = ({ isOpen, onClose, currentPath, embedded = false, teamKey = undefined, initialJinxName = undefined }) => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [jinxes, setJinxes] = useState([]);
    const [selectedJinx, setSelectedJinx] = useState(null);
    const [editedJinx, setEditedJinx] = useState(null);
    const [expandedFolders, setExpandedFolders] = useState(new Set());
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [dropdownSearch, setDropdownSearch] = useState('');
    const [dropdownExpandedFolders, setDropdownExpandedFolders] = useState<Set<string>>(new Set());
    const dropdownButtonRef = useRef<HTMLButtonElement | null>(null);
    const [testInputs, setTestInputs] = useState({});
    const [testOutput, setTestOutput] = useState(null);
    const [testRunning, setTestRunning] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const [executionHistory, setExecutionHistory] = useState([]);

    useEffect(() => {
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') onClose();
        };
        if (isOpen) document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    useEffect(() => {
        const loadJinxes = async () => {
            if (!isOpen) return;
            setLoading(true);
            setError(null);

            const response = teamKey
                ? await window.api.getJinxesTeam(teamKey)
                : await window.api.getJinxesProject(currentPath);

            if (response.error) {
                setError(response.error);
                setLoading(false);
                return;
            }

            setJinxes(response.jinxes || []);
            setLoading(false);
        };
        loadJinxes();
    }, [isOpen, currentPath, teamKey]);

    useEffect(() => {
        if (!initialJinxName || jinxes.length === 0) return;
        const target = jinxes.find(j => j.name === initialJinxName || j.jinx_name === initialJinxName);
        if (target) {
            handleJinxSelect(target);
            const parts = (target.path || target.jinx_name || initialJinxName).split('/');
            if (parts.length > 1) {
                let path = '';
                const toExpand = new Set();
                for (let i = 0; i < parts.length - 1; i++) {
                    path = path ? `${path}/${parts[i]}` : parts[i];
                    toExpand.add(path);
                }
                setExpandedFolders(prev => new Set([...prev, ...toExpand]));
            }
        }
    }, [initialJinxName, jinxes]);

    const buildFolderTree = (jinxesList) => {
        const tree = { folders: {}, files: [] };

        for (const jinx of jinxesList) {
            const pathParts = (jinx.path || jinx.jinx_name).split('/');

            if (pathParts.length === 1) {
                tree.files.push(jinx);
            } else {
                let current = tree;
                for (let i = 0; i < pathParts.length - 1; i++) {
                    const folder = pathParts[i];
                    if (!current.folders[folder]) {
                        current.folders[folder] = { folders: {}, files: [] };
                    }
                    current = current.folders[folder];
                }
                current.files.push(jinx);
            }
        }
        return tree;
    };

    const toggleFolder = (path) => {
        setExpandedFolders(prev => {
            const next = new Set(prev);
            if (next.has(path)) next.delete(path);
            else next.add(path);
            return next;
        });
    };

    const renderTree = (node, path = '') => {
        const items = [];

        const sortedFolders = Object.keys(node.folders).sort();
        for (const folder of sortedFolders) {
            const folderPath = path ? `${path}/${folder}` : folder;
            const isExpanded = expandedFolders.has(folderPath);

            items.push(
                <div key={folderPath}>
                    <button
                        onClick={() => toggleFolder(folderPath)}
                        className="flex items-center gap-2 w-full p-2
                            rounded text-sm text-left theme-hover"
                    >
                        <FolderTree size={16} className="text-yellow-500" />
                        <span className="flex-1 font-medium">{folder}</span>
                        <ChevronRight
                            size={16}
                            className={`text-gray-500 transition-transform
                                ${isExpanded ? 'rotate-90' : ''}`}
                        />
                    </button>
                    {isExpanded && (
                        <div className="ml-4 border-l border-gray-700 pl-2">
                            {renderTree(node.folders[folder], folderPath)}
                        </div>
                    )}
                </div>
            );
        }

        const sortedFiles = (node.files || []).filter(Boolean).sort((a, b) => {
            const nameA = (a && (a.jinx_name || a.name || '')) || '';
            const nameB = (b && (b.jinx_name || b.name || '')) || '';
            return nameA.localeCompare(nameB);
        });
        for (const jinx of sortedFiles) {
            items.push(
                <button
                    key={jinx.path || jinx.jinx_name || jinx.name}
                    onClick={() => handleJinxSelect(jinx)}
                    className={`flex items-center gap-2 w-full p-2
                        rounded text-sm text-left
                        ${(selectedJinx?.jinx_name || selectedJinx?.name) ===
                                (jinx.jinx_name || jinx.name)
                            ? 'bg-blue-600/50'
                            : 'theme-hover'}`}
                >
                    <Wrench size={14} className="text-gray-400" />
                    <span className="flex-1 truncate">{jinx.jinx_name || jinx.name}</span>
                </button>
            );
        }

        return items;
    };
const handleJinxSelect = async (jinx) => {
    setSelectedJinx(jinx);

    let fullJinx = jinx;
    if (jinx.source_path) {
        try {
            const result = await (window as any).api.readFileContent(jinx.source_path);
            const text = typeof result === 'string' ? result : result?.content;
            if (text) {
                const parsed = yaml.load(text);
                if (parsed && parsed.jinx_name) {
                    fullJinx = { ...jinx, ...parsed };
                }
            }
        } catch (e) {
            console.error('[JinxMenu] Failed to load full jinx:', e);
        }
    }

    const normalizedInputs = [];
    const inputs = {};

    for (const inp of (fullJinx.inputs || [])) {
        if (typeof inp === 'string') {
            normalizedInputs.push(inp);
            inputs[inp] = '';
        } else if (typeof inp === 'object' && inp !== null) {

            const name = Object.keys(inp)[0] || '';
            const defaultVal = inp[name];
            normalizedInputs.push(name);
            inputs[name] = defaultVal != null ? String(defaultVal) : '';
        }
    }

    setEditedJinx({ ...fullJinx, inputs: normalizedInputs });
    setTestOutput(null);
    setTestInputs(inputs);

    const historyResponse = await fetch(
        `${BACKEND_URL}/api/jinx/executions?jinxName=${encodeURIComponent(jinx.jinx_name)}`
    );
    const historyData = await historyResponse.json();
    setExecutionHistory(historyData.executions || []);
};

const labelExecution = async (messageId, label) => {
    await fetch(`${BACKEND_URL}/api/label/execution`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, label })
    });

    const historyResponse = await fetch(
        `${BACKEND_URL}/api/jinx/executions?jinxName=${encodeURIComponent(selectedJinx.jinx_name)}`
    );
    const historyData = await historyResponse.json();
    setExecutionHistory(historyData.executions || []);
};

    const handleNewJinx = () => {
        const newJinx = {
            jinx_name: 'new_jinx',
            path: 'utils/new_jinx',
            description: '',
            inputs: [],
            steps: [{ name: 'step_1', engine: 'python', code: '' }]
        };
        setSelectedJinx(newJinx);
        setEditedJinx(newJinx);
        setTestInputs({});
        setTestOutput(null);
    };

    const handleInputChange = (field, value) => {
        setEditedJinx(prev => ({ ...prev, [field]: value }));
    };

    const handleStepChange = (index, field, value) => {
        setEditedJinx(prev => {
            const newSteps = [...prev.steps];
            newSteps[index] = { ...newSteps[index], [field]: value };
            return { ...prev, steps: newSteps };
        });
    };

    const addStep = () => {
        setEditedJinx(prev => ({
            ...prev,
            steps: [
                ...prev.steps,
                {
                    name: `step_${prev.steps.length + 1}`,
                    engine: 'python',
                    code: ''
                }
            ]
        }));
    };

    const removeStep = (index) => {
        setEditedJinx(prev => ({
            ...prev,
            steps: prev.steps.filter((_, i) => i !== index)
        }));
    };

    const handleInputValueChange = (index, value) => {
        setEditedJinx(prev => {
            const newInputs = [...(prev.inputs || [])];
            newInputs[index] = value;
            return { ...prev, inputs: newInputs };
        });

        setTestInputs(prev => {
            const newTest = { ...prev };
            if (!newTest[value]) newTest[value] = '';
            return newTest;
        });
    };

    const addInput = () => {
        setEditedJinx(prev => ({
            ...prev,
            inputs: [...(prev.inputs || []), '']
        }));
    };

    const removeInput = (index) => {
        const inputName = editedJinx.inputs[index];
        setEditedJinx(prev => ({
            ...prev,
            inputs: prev.inputs.filter((_, i) => i !== index)
        }));
        setTestInputs(prev => {
            const newTest = { ...prev };
            delete newTest[inputName];
            return newTest;
        });
    };

    const handleTestInputChange = (key, value) => {
        setTestInputs(prev => ({ ...prev, [key]: value }));
    };

    const runTest = async () => {
        setTestRunning(true);
        setTestOutput(null);

        const response = await fetch(`${BACKEND_URL}/api/jinx/test`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jinx: editedJinx,
                inputs: testInputs,
                currentPath
            })
        });

        const data = await response.json();
        setTestRunning(false);

        if (data.error) {
            setTestOutput({ error: data.error });
        } else {
            setTestOutput({
                output: data.output,
                conversationId: data.conversation_id,
                executionId: data.execution_id
            });
        }
    };

    const handleSave = async () => {
        const response = await window.api.saveJinx({
            jinx: editedJinx,
            currentPath,
            globalPath: teamKey,
        });

        if (response.error) {
            setError(response.error);
            return;
        }

        const refreshed = teamKey
            ? await window.api.getJinxesTeam(teamKey)
            : await window.api.getJinxesProject(currentPath);
        setJinxes(refreshed.jinxes || []);
        setSelectedJinx(editedJinx);
    };

    if (!isOpen && !embedded) return null;

    const tree = buildFolderTree(jinxes);

    const content = (
        <>
            <div className="flex flex-1 min-h-0 flex-col">
                    <div className="p-2 border-b theme-border flex-shrink-0 flex items-center gap-2">
                        <button
                            ref={dropdownButtonRef}
                            onClick={() => setDropdownOpen(!dropdownOpen)}
                            disabled={loading || jinxes.length === 0}
                            className="flex items-center gap-2 px-3 py-1.5 rounded text-sm theme-bg-secondary theme-text-primary theme-border border hover:bg-white/5 disabled:opacity-40 min-w-[200px] w-auto max-w-[25vw]"
                        >
                            <Wrench size={14} className="text-blue-400" />
                            <span className="flex-1 truncate text-left">
                                {selectedJinx ? (selectedJinx.jinx_name || selectedJinx.name) : 'Select a Jinx'}
                            </span>
                            <ChevronDown size={12} className={`transition-transform flex-shrink-0 ${dropdownOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {dropdownOpen && createPortal(
                            <JinxSelectorDropdown
                                buttonRef={dropdownButtonRef}
                                jinxes={jinxes}
                                selectedJinx={selectedJinx}
                                dropdownSearch={dropdownSearch}
                                setDropdownSearch={setDropdownSearch}
                                dropdownExpandedFolders={dropdownExpandedFolders}
                                setDropdownExpandedFolders={setDropdownExpandedFolders}
                                onSelect={(jinx) => {
                                    handleJinxSelect(jinx);
                                    setDropdownOpen(false);
                                }}
                                onClose={() => setDropdownOpen(false)}
                            />,
                            document.body
                        )}
                        <button
                            onClick={handleNewJinx}
                            className="theme-button-primary px-3 py-1.5
                                rounded text-sm flex items-center
                                justify-center gap-2"
                        >
                            <Plus size={16} /> New Jinx
                        </button>
                    </div>

                    <div className="flex-1 flex flex-col min-h-0">
                        {selectedJinx && editedJinx ? (
                            <div className="flex-1 overflow-y-auto p-6">
                                <div className="space-y-6">
                                    <div className="flex justify-between
                                        items-start gap-4">
                                        <div className="flex-grow space-y-2">
                                            <div>
                                                <label className="block text-xs
                                                    theme-text-secondary mb-1">
                                                    Jinx Name
                                                </label>
                                                <input
                                                    className="w-full theme-input
                                                        text-xl font-bold p-2"
                                                    value={editedJinx.jinx_name || ''}
                                                    onChange={(e) => handleInputChange(
                                                        'jinx_name',
                                                        e.target.value
                                                    )}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs
                                                    theme-text-secondary mb-1">
                                                    Path (e.g. utils/myutil)
                                                </label>
                                                <input
                                                    className="w-full theme-input
                                                        p-2 text-sm font-mono"
                                                    value={editedJinx.path || ''}
                                                    onChange={(e) => handleInputChange(
                                                        'path',
                                                        e.target.value
                                                    )}
                                                    placeholder="code/python"
                                                />
                                            </div>
                                        </div>
                                        <div className="flex gap-2 mt-6">
                                            <button
                                                onClick={runTest}
                                                disabled={testRunning}
                                                className="theme-button px-3
                                                    py-2 rounded text-sm flex
                                                    items-center gap-2"
                                            >
                                                <Play size={16} />
                                                {testRunning ? 'Running...' : 'Test'}
                                            </button>
                                            <button
                                                onClick={handleSave}
                                                className="theme-button-success px-4
                                                    py-2 rounded text-sm flex
                                                    items-center gap-2"
                                            >
                                                <Save size={16} /> Save
                                            </button>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm
                                            font-semibold theme-text-secondary mb-1">
                                            Description
                                        </label>
                                        <AutosizeTextarea
                                            className="w-full theme-input p-2
                                                rounded text-sm resize-none
                                                min-h-[60px]"
                                            value={editedJinx.description || ''}
                                            onChange={(e) => handleInputChange(
                                                'description',
                                                e.target.value
                                            )}
                                            placeholder="Describe what this jinx does..."
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <div className="flex justify-between
                                            items-center mb-2">
                                            <label className="text-sm font-semibold
                                                theme-text-secondary">
                                                Inputs
                                            </label>
                                            <button
                                                onClick={addInput}
                                                className="text-sm theme-button-subtle
                                                    flex items-center gap-1"
                                            >
                                                <Plus size={14} /> Add
                                            </button>
                                        </div>
                                        {(editedJinx.inputs || []).map((input, i) => (
                                            <div key={i} className="flex
                                                items-center gap-2">
                                                <input
                                                    className="flex-1 theme-input
                                                        p-2 rounded text-sm font-mono"
                                                    value={input}
                                                    onChange={(e) =>
                                                        handleInputValueChange(
                                                            i,
                                                            e.target.value
                                                        )
                                                    }
                                                    placeholder="input_name"
                                                />
                                                <input
                                                    className="flex-1 theme-input
                                                        p-2 rounded text-sm"
                                                    value={testInputs[input] || ''}
                                                    onChange={(e) =>
                                                        handleTestInputChange(
                                                            input,
                                                            e.target.value
                                                        )
                                                    }
                                                    placeholder="test value"
                                                />
                                                <button
                                                    onClick={() => removeInput(i)}
                                                    className="p-2
                                                        theme-button-danger-subtle
                                                        rounded"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>

{testOutput && (
    <div className="p-4 bg-gray-900/50 rounded border theme-border">
        <h4 className="text-sm font-semibold mb-2">Test Output</h4>
        {testOutput.error ? (
            <div className="text-red-400 text-sm font-mono">
                {testOutput.error}
            </div>
        ) : (
            <pre className="text-sm font-mono whitespace-pre-wrap text-green-400">
                {testOutput.output}
            </pre>
        )}
    </div>
)}

<div className="space-y-2">
    <div className="flex justify-between items-center">
        <h3 className="text-sm font-semibold theme-text-secondary flex items-center gap-2">
            <History size={16} /> Execution History
        </h3>
    </div>
    {executionHistory.length > 0 ? (
        <div className="space-y-2 max-h-60 overflow-y-auto">
            {executionHistory.map((exec) => (
                <div key={exec.message_id} className="p-3 bg-gray-900/50 rounded border theme-border text-xs">
                    <div className="font-mono truncate mb-1">{exec.input}</div>
                    <div className="text-gray-400 text-xs mb-2">{exec.timestamp}</div>
                    <div className="flex gap-1">
                        <button
                            onClick={() => labelExecution(exec.message_id, 'good')}
                            className={`p-1 rounded ${exec.label === 'good' ? 'bg-green-600' : 'theme-button-subtle'}`}
                        >
                            <CheckCircle size={12} />
                        </button>
                        <button
                            onClick={() => labelExecution(exec.message_id, 'bad')}
                            className={`p-1 rounded ${exec.label === 'bad' ? 'bg-red-600' : 'theme-button-subtle'}`}
                        >
                            <XCircle size={12} />
                        </button>
                        <button
                            onClick={() => labelExecution(exec.message_id, 'training')}
                            className={`p-1 rounded ${exec.label === 'training' ? 'bg-yellow-600' : 'theme-button-subtle'}`}
                        >
                            <Tag size={12} />
                        </button>
                    </div>
                </div>
            ))}
        </div>
    ) : (
        <div className="text-xs theme-text-secondary italic">No executions yet</div>
    )}
</div>

                                    <div className="space-y-4">
                                        <div className="flex justify-between
                                            items-center">
                                            <h3 className="text-sm font-semibold
                                                theme-text-secondary">
                                                Steps
                                            </h3>
                                            <button
                                                onClick={addStep}
                                                className="text-sm theme-button-subtle
                                                    flex items-center gap-1"
                                            >
                                                <Plus size={14} /> Add Step
                                            </button>
                                        </div>
                                        {editedJinx.steps?.map((step, i) => (
                                            <div key={i} className="space-y-3 p-4
                                                bg-gray-900/50 rounded border
                                                theme-border">
                                                <div className="flex justify-between
                                                    items-center gap-2">
                                                    <input
                                                        className="theme-input p-1
                                                            text-sm font-medium
                                                            flex-1"
                                                        value={step.name ||
                                                            `step_${i + 1}`}
                                                        onChange={(e) =>
                                                            handleStepChange(
                                                                i,
                                                                'name',
                                                                e.target.value
                                                            )
                                                        }
                                                        placeholder="step_name"
                                                    />
                                                    <button
                                                        onClick={() => removeStep(i)}
                                                        className="p-1
                                                            theme-button-danger-subtle
                                                            rounded"
                                                    >
                                                        <X size={16} />
                                                    </button>
                                                </div>
                                                <select
                                                    className="w-full theme-input
                                                        p-2 rounded text-sm"
                                                    value={step.engine}
                                                    onChange={(e) =>
                                                        handleStepChange(
                                                            i,
                                                            'engine',
                                                            e.target.value
                                                        )
                                                    }
                                                >
                                                    <option value="python">
                                                        Python
                                                    </option>
                                                    <option value="bash">
                                                        Bash
                                                    </option>
                                                    <option value="natural">
                                                        Natural Language
                                                    </option>
                                                </select>
                                                <AutosizeTextarea
                                                    className="w-full theme-input p-2
                                                        rounded font-mono text-sm
                                                        resize-y min-h-[100px]
                                                        max-h-64"
                                                    value={step.code}
                                                    onChange={(e) =>
                                                        handleStepChange(
                                                            i,
                                                            'code',
                                                            e.target.value
                                                        )
                                                    }
                                                    placeholder={`Enter ${step.engine} code...`}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-center justify-center
                                h-full theme-text-secondary">
                                Select or create a Jinx
                            </div>
                        )}

                    </div>
            </div>
        </>
    );

    if (embedded) {
        return <div className="flex flex-col h-full">{content}</div>;
    }

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center
            justify-center z-50 p-4" onClick={onClose}>
            <div className="theme-bg-secondary rounded-lg shadow-xl
                w-full max-w-6xl h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                <header className="w-full border-b theme-border p-4
                    flex justify-between items-center flex-shrink-0">
                    <h3 className="text-lg font-semibold flex
                        items-center gap-2">
                        <Wrench className="text-blue-400" /> Jinx Editor
                    </h3>
                    <div className="flex items-center gap-4">
                        <button
                            onClick={onClose}
                            className="p-1 rounded-full theme-hover"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </header>
                <main className="flex-1 p-4 overflow-hidden">
                    {content}
                </main>
            </div>
        </div>
    );
};

const JinxSelectorDropdown = ({
    buttonRef,
    jinxes,
    selectedJinx,
    dropdownSearch,
    setDropdownSearch,
    dropdownExpandedFolders,
    setDropdownExpandedFolders,
    onSelect,
    onClose,
}: any) => {
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

    useEffect(() => {
        const update = () => {
            const rect = buttonRef.current?.getBoundingClientRect();
            if (rect) {
                setPos({ top: rect.bottom + 4, left: rect.left });
            }
        };
        update();
        window.addEventListener('resize', update);
        return () => window.removeEventListener('resize', update);
    }, [buttonRef]);

    useEffect(() => {
        const onClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (!buttonRef.current?.contains(target) && !document.getElementById('jinx-selector-dropdown-portal')?.contains(target)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', onClick);
        return () => document.removeEventListener('mousedown', onClick);
    }, [buttonRef, onClose]);

    if (!pos) return null;

    const filtered = jinxes.filter((j: any) => {
        const n = j.jinx_name || j.name;
        if (!dropdownSearch) return true;
        return n.toLowerCase().includes(dropdownSearch.toLowerCase());
    });

    return (
        <div
            id="jinx-selector-dropdown-portal"
            className="fixed z-[100] theme-bg-primary border theme-border rounded-lg shadow-2xl overflow-hidden w-64"
            style={{ top: pos.top, left: pos.left }}
        >
            <div className="px-2 py-1.5 border-b theme-border">
                <input
                    type="text"
                    value={dropdownSearch}
                    onChange={(e) => setDropdownSearch(e.target.value)}
                    placeholder="Search jinxes..."
                    className="w-full theme-input border theme-border rounded px-2 py-1 text-xs theme-text-primary placeholder-gray-500 focus:outline-none focus:border-blue-500/50"
                    onKeyDown={(e) => e.stopPropagation()}
                />
            </div>
            <div className="max-h-72 overflow-y-auto p-1">
                {filtered.length === 0 ? (
                    <div className="px-2 py-3 text-xs text-gray-500 text-center">No jinxes found</div>
                ) : (
                    (() => {
                        const byFolder: Record<string, any[]> = {};
                        for (const j of filtered.sort((a: any, b: any) => (a.jinx_name || a.name).localeCompare(b.jinx_name || b.name))) {
                            const n = j.jinx_name || j.name;
                            const parts = (j.path || n).split('/');
                            const folder = parts.length > 1 ? parts.slice(0, -1).join('/') : '(root)';
                            if (!byFolder[folder]) byFolder[folder] = [];
                            byFolder[folder].push(j);
                        }
                        const items: React.ReactNode[] = [];
                        const folders = Object.keys(byFolder).sort();
                        for (const folder of folders) {
                            const isExpanded = dropdownExpandedFolders.has(folder);
                            items.push(
                                <button
                                    key={`folder-${folder}`}
                                    onClick={() => setDropdownExpandedFolders((prev: Set<string>) => {
                                        const next = new Set(prev);
                                        if (next.has(folder)) next.delete(folder); else next.add(folder);
                                        return next;
                                    })}
                                    className="flex items-center gap-1 w-full px-2 py-1 text-xs font-semibold text-gray-400 hover:bg-white/5 text-left"
                                >
                                    <ChevronRight size={10} className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                                    {folder}
                                </button>
                            );
                            if (isExpanded) {
                                for (const j of byFolder[folder]) {
                                    const n = j.jinx_name || j.name;
                                    const isSelected = (selectedJinx?.jinx_name || selectedJinx?.name) === n;
                                    items.push(
                                        <button
                                            key={j.path || n}
                                            onClick={() => onSelect(j)}
                                            className={`flex items-center gap-2 w-full pl-6 pr-2 py-1 text-xs text-left ${isSelected ? 'bg-blue-600/50' : 'hover:bg-white/5'}`}
                                        >
                                            <Wrench size={12} className="text-gray-400" />
                                            <span className="truncate flex-1">{n}</span>
                                        </button>
                                    );
                                }
                            }
                        }
                        return items;
                    })()
                )}
            </div>
        </div>
    );
};

export default JinxMenu;