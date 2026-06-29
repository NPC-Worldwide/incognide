import React, { useState, useMemo } from 'react';
import { X, Tag, Plus, Trash2, Save, ChevronDown, ChevronRight, Hash, Type } from 'lucide-react';

export interface TextSpanLabel {
    id: string;
    startOffset: number;
    endOffset: number;
    text: string;
    category: string;
    score?: number;
    notes?: string;
}

export type MetricType = 'boolean' | 'integer' | 'float';

export interface MetricDefinition {
    id: string;
    name: string;
    type: MetricType;
    min?: number;
    max?: number;
}

export interface UserMetric extends MetricDefinition {
    value: boolean | number;
}

export interface MessageLabel {
    id: string;
    messageId: string;
    conversationId: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;

    tags: string[];
    metrics: UserMetric[];
    notes?: string;

    labeledAt: string;
    labeledBy?: string;
}

export interface ConversationLabel {
    id: string;
    conversationId: string;
    title?: string;

    tags: string[];
    metrics: UserMetric[];
    notes?: string;

    summary?: string;

    includeInTraining: boolean;
    trainingWeight?: number;

    messageCount: number;
    labeledAt: string;
    labeledBy?: string;
}

export interface ContextFile {
    id: string;
    path: string;
    name: string;
    content?: string;
    size?: number;
    addedAt: string;
    source: 'sidebar' | 'external' | 'open-pane';
}

interface MessageLabelingProps {
    message: {
        id: string;
        role: 'user' | 'assistant';
        content: string;
        timestamp: string;
        conversationId?: string;
    };
    existingLabel?: MessageLabel;
    onSave: (label: MessageLabel) => void;
    onClose: () => void;
}

export const MetricDefinitionStorage = {
    storageKey: 'incognide_labelMetricDefinitions',

    getAll(): MetricDefinition[] {
        try {
            const data = localStorage.getItem(this.storageKey);
            return data ? JSON.parse(data) : [];
        } catch {
            return [];
        }
    },

    save(definition: MetricDefinition): void {
        const definitions = this.getAll();
        const existingIndex = definitions.findIndex(d => d.id === definition.id || d.name.toLowerCase() === definition.name.toLowerCase());
        if (existingIndex >= 0) {
            definitions[existingIndex] = definition;
        } else {
            definitions.push(definition);
        }
        localStorage.setItem(this.storageKey, JSON.stringify(definitions));
    },

    delete(id: string): void {
        const definitions = this.getAll().filter(d => d.id !== id);
        localStorage.setItem(this.storageKey, JSON.stringify(definitions));
    },

    getByName(name: string): MetricDefinition | undefined {
        return this.getAll().find(d => d.name.toLowerCase() === name.toLowerCase());
    },

    getAllNames(): string[] {
        return this.getAll().map(d => d.name);
    }
};

export const collectAllTags = (): string[] => {
    const tags = new Set<string>();
    MessageLabelStorage.getAll().forEach(label => label.tags?.forEach(t => tags.add(t)));
    ConversationLabelStorage.getAll().forEach(label => label.tags?.forEach(t => tags.add(t)));
    return Array.from(tags).sort();
};

const TagInput = ({ tags, onChange, suggestions }: {
    tags: string[];
    onChange: (tags: string[]) => void;
    suggestions: string[];
}) => {
    const [input, setInput] = useState('');
    const [showSuggestions, setShowSuggestions] = useState(false);

    const filteredSuggestions = suggestions.filter(
        s => s.toLowerCase().includes(input.toLowerCase()) && !tags.includes(s)
    );

    const addTag = (tag: string) => {
        if (tag.trim() && !tags.includes(tag.trim())) {
            onChange([...tags, tag.trim()]);
        }
        setInput('');
        setShowSuggestions(false);
    };

    const removeTag = (tag: string) => {
        onChange(tags.filter(t => t !== tag));
    };

    return (
        <div className="space-y-2">
            <div className="flex flex-wrap gap-1">
                {tags.map(tag => (
                    <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-600/30 text-blue-300 rounded text-xs">
                        {tag}
                        <button onClick={() => removeTag(tag)} className="hover:text-blue-100">
                            <X size={12} />
                        </button>
                    </span>
                ))}
            </div>
            <div className="relative">
                <input
                    type="text"
                    value={input}
                    onChange={(e) => {
                        setInput(e.target.value);
                        setShowSuggestions(true);
                    }}
                    onFocus={() => setShowSuggestions(true)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            addTag(input);
                        }
                    }}
                    placeholder="Add tag..."
                    className="w-full theme-input text-xs px-2 py-1 rounded"
                />
                {showSuggestions && filteredSuggestions.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-gray-800 border border-gray-600 rounded shadow-lg max-h-32 overflow-y-auto">
                        {filteredSuggestions.map(suggestion => (
                            <button
                                key={suggestion}
                                type="button"
                                className="w-full text-left px-2 py-1 text-xs hover:bg-gray-700 text-gray-300"
                                onClick={() => addTag(suggestion)}
                            >
                                {suggestion}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

const MetricValueEditor = ({ metric, onChange }: {
    metric: UserMetric;
    onChange: (metric: UserMetric) => void;
}) => {
    if (metric.type === 'boolean') {
        return (
            <label className="flex items-center gap-2 cursor-pointer">
                <input
                    type="checkbox"
                    checked={!!metric.value}
                    onChange={(e) => onChange({ ...metric, value: e.target.checked })}
                    className="w-4 h-4 rounded border-gray-600 text-blue-600 bg-gray-700 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-300">{metric.value ? 'True' : 'False'}</span>
            </label>
        );
    }

    const numValue = typeof metric.value === 'number' ? metric.value : 0;
    const min = metric.min ?? 0;
    const max = metric.max ?? 100;
    const step = metric.type === 'integer' ? 1 : 0.1;

    return (
        <div className="flex items-center gap-2 flex-1">
            <input
                type="number"
                min={min}
                max={max}
                step={step}
                value={numValue}
                onChange={(e) => {
                    const v = e.target.value === '' ? min : parseFloat(e.target.value);
                    onChange({ ...metric, value: v });
                }}
                className="w-20 theme-input text-xs px-2 py-1 rounded"
            />
            {max > min && (
                <input
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={numValue}
                    onChange={(e) => onChange({ ...metric, value: parseFloat(e.target.value) })}
                    className="flex-1 min-w-[60px]"
                />
            )}
        </div>
    );
};

const AddMetricForm = ({ onAdd, existingNames }: {
    onAdd: (metric: UserMetric) => void;
    existingNames: string[];
}) => {
    const [name, setName] = useState('');
    const [type, setType] = useState<MetricType>('integer');
    const [min, setMin] = useState<string>('0');
    const [max, setMax] = useState<string>('10');
    const [showSuggestions, setShowSuggestions] = useState(false);

    const filteredNames = existingNames.filter(
        n => n.toLowerCase().includes(name.toLowerCase())
    );

    const handleAdd = () => {
        if (!name.trim()) return;
        const definition = MetricDefinitionStorage.getByName(name.trim()) || {
            id: crypto.randomUUID(),
            name: name.trim(),
            type,
            min: type !== 'boolean' ? parseFloat(min || '0') : undefined,
            max: type !== 'boolean' ? parseFloat(max || '10') : undefined,
        };
        MetricDefinitionStorage.save(definition);
        const defaultValue = definition.type === 'boolean'
            ? false
            : (definition.min ?? 0);
        onAdd({ ...definition, value: defaultValue });
        setName('');
        setType('integer');
        setMin('0');
        setMax('10');
        setShowSuggestions(false);
    };

    return (
        <div className="p-2 bg-gray-800 rounded border border-gray-700 space-y-2">
            <div className="text-xs text-gray-400">Add metric</div>
            <div className="relative">
                <input
                    type="text"
                    value={name}
                    onChange={(e) => {
                        setName(e.target.value);
                        setShowSuggestions(true);
                    }}
                    onFocus={() => setShowSuggestions(true)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAdd();
                        }
                    }}
                    placeholder="Metric name..."
                    className="w-full theme-input text-xs px-2 py-1 rounded"
                />
                {showSuggestions && filteredNames.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-gray-800 border border-gray-600 rounded shadow-lg max-h-24 overflow-y-auto">
                        {filteredNames.map(n => (
                            <button
                                key={n}
                                type="button"
                                className="w-full text-left px-2 py-1 text-xs hover:bg-gray-700 text-gray-300"
                                onClick={() => {
                                    const def = MetricDefinitionStorage.getByName(n);
                                    if (def) {
                                        setName(def.name);
                                        setType(def.type);
                                        setMin(def.min?.toString() ?? '0');
                                        setMax(def.max?.toString() ?? '10');
                                    } else {
                                        setName(n);
                                    }
                                    setShowSuggestions(false);
                                }}
                            >
                                {n}
                            </button>
                        ))}
                    </div>
                )}
            </div>
            <div className="flex items-center gap-2 flex-nowrap">
                <select
                    value={type}
                    onChange={(e) => setType(e.target.value as MetricType)}
                    className="theme-input text-xs px-1 py-1 rounded w-20 shrink-0"
                >
                    <option value="boolean">Bool</option>
                    <option value="integer">Int</option>
                    <option value="float">Float</option>
                </select>
                {type !== 'boolean' && (
                    <>
                        <input
                            type="number"
                            value={min}
                            onChange={(e) => setMin(e.target.value)}
                            placeholder="Min"
                            className="w-14 theme-input text-xs px-1 py-1 rounded shrink-0"
                        />
                        <span className="text-xs text-gray-500 shrink-0">-</span>
                        <input
                            type="number"
                            value={max}
                            onChange={(e) => setMax(e.target.value)}
                            placeholder="Max"
                            className="w-14 theme-input text-xs px-1 py-1 rounded shrink-0"
                        />
                    </>
                )}
                <button
                    type="button"
                    onClick={handleAdd}
                    disabled={!name.trim()}
                    className="theme-button-primary px-2 py-1 text-xs rounded flex items-center gap-1 disabled:opacity-50 shrink-0 ml-auto"
                >
                    <Plus size={12} /> Add
                </button>
            </div>
        </div>
    );
};

export const MessageLabeling: React.FC<MessageLabelingProps> = ({
    message,
    existingLabel,
    onSave,
    onClose,
}) => {

    const [tags, setTags] = useState<string[]>(existingLabel?.tags || []);
    const [metrics, setMetrics] = useState<UserMetric[]>(existingLabel?.metrics || []);
    const [notes, setNotes] = useState(existingLabel?.notes || '');

    const [expandedSection, setExpandedSection] = useState<'tags' | 'metrics' | 'notes' | null>('tags');

    const allTags = useMemo(() => collectAllTags(), []);
    const allMetricNames = useMemo(() => MetricDefinitionStorage.getAllNames(), []);

    const addMetric = (metric: UserMetric) => {
        const existingIndex = metrics.findIndex(m => m.name.toLowerCase() === metric.name.toLowerCase());
        if (existingIndex >= 0) {
            const updated = [...metrics];
            updated[existingIndex] = { ...metric, value: metrics[existingIndex].value };
            setMetrics(updated);
        } else {
            setMetrics([...metrics, metric]);
        }
    };

    const updateMetric = (index: number, updated: UserMetric) => {
        const next = [...metrics];
        next[index] = updated;
        setMetrics(next);
    };

    const removeMetric = (index: number) => {
        setMetrics(metrics.filter((_, i) => i !== index));
    };

    const handleSave = () => {
        const label: MessageLabel = {
            id: existingLabel?.id || crypto.randomUUID(),
            messageId: message.id || message.timestamp,
            conversationId: message.conversationId || '',
            role: message.role as 'user' | 'assistant',
            content: message.content,
            timestamp: message.timestamp,
            tags,
            metrics,
            notes: notes || undefined,
            labeledAt: new Date().toISOString(),
        };

        onSave(label);
    };

    const SectionHeader = ({ title, section, icon: Icon }: { title: string; section: typeof expandedSection; icon: any }) => (
        <button
            type="button"
            className="w-full flex items-center gap-2 py-2 text-sm font-medium text-gray-300 hover:text-white"
            onClick={() => setExpandedSection(expandedSection === section ? null : section)}
        >
            {expandedSection === section ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <Icon size={14} />
            {title}
        </button>
    );

    return (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
            <div className="bg-gray-900 rounded-lg border border-gray-700 w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                <div className="flex items-center justify-between p-4 border-b border-gray-700">
                    <div className="flex items-center gap-2">
                        <Tag size={20} className="text-blue-400" />
                        <h2 className="text-lg font-semibold">Label Message</h2>
                        <span className={`px-2 py-0.5 rounded text-xs ${
                            message.role === 'user' ? 'bg-blue-600/30 text-blue-300' : 'bg-green-600/30 text-green-300'
                        }`}>
                            {message.role}
                        </span>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-800 rounded">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-hidden flex">
                    <div className="flex-1 p-4 overflow-y-auto border-r border-gray-700">
                        <div className="prose prose-sm prose-invert max-w-none p-3 bg-gray-800 rounded whitespace-pre-wrap">
                            {message.content}
                        </div>
                    </div>

                    <div className="w-80 p-4 overflow-y-auto space-y-2">
                        <div className="border-b border-gray-700 pb-2">
                            <SectionHeader title={`Tags (${tags.length})`} section="tags" icon={Tag} />
                            {expandedSection === 'tags' && (
                                <div className="pt-2">
                                    <TagInput tags={tags} onChange={setTags} suggestions={allTags} />
                                </div>
                            )}
                        </div>

                        <div className="border-b border-gray-700 pb-2">
                            <SectionHeader title={`Metrics (${metrics.length})`} section="metrics" icon={Hash} />
                            {expandedSection === 'metrics' && (
                                <div className="pt-2 space-y-2">
                                    {metrics.length === 0 && (
                                        <div className="text-xs text-gray-500 text-center py-2">
                                            No metrics yet. Add one below.
                                        </div>
                                    )}
                                    {metrics.map((metric, idx) => (
                                        <div key={metric.id || idx} className="p-2 bg-gray-800 rounded border border-gray-700">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-xs font-medium text-gray-300">{metric.name}</span>
                                                <div className="flex items-center gap-1">
                                                    <span className="text-[10px] px-1.5 py-0.5 bg-gray-700 rounded text-gray-400">
                                                        {metric.type}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => removeMetric(idx)}
                                                        className="p-1 hover:bg-gray-700 rounded text-gray-500 hover:text-red-400"
                                                    >
                                                        <Trash2 size={12} />
                                                    </button>
                                                </div>
                                            </div>
                                            <MetricValueEditor
                                                metric={metric}
                                                onChange={(updated) => updateMetric(idx, updated)}
                                            />
                                        </div>
                                    ))}
                                    <AddMetricForm onAdd={addMetric} existingNames={allMetricNames} />
                                </div>
                            )}
                        </div>

                        <div className="pb-2">
                            <SectionHeader title="Notes" section="notes" icon={Type} />
                            {expandedSection === 'notes' && (
                                <div className="pt-2">
                                    <textarea
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                        placeholder="Add notes about this message..."
                                        className="w-full theme-input text-xs px-2 py-1 rounded resize-none"
                                        rows={3}
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-between p-4 border-t border-gray-700">
                    <div className="text-xs text-gray-500">
                        {tags.length} tags, {metrics.length} metrics
                    </div>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            className="theme-button px-4 py-2 text-sm rounded"
                            onClick={onClose}
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            className="theme-button-primary px-4 py-2 text-sm rounded flex items-center gap-2"
                            onClick={handleSave}
                        >
                            <Save size={14} /> Save Labels
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export const MessageLabelStorage = {
    storageKey: 'incognide_messageLabels',

    getAll(): MessageLabel[] {
        try {
            const data = localStorage.getItem(this.storageKey);
            return data ? JSON.parse(data) : [];
        } catch {
            return [];
        }
    },

    save(label: MessageLabel): void {
        const labels = this.getAll();
        const existingIndex = labels.findIndex(l => l.id === label.id);
        if (existingIndex >= 0) {
            labels[existingIndex] = label;
        } else {
            labels.push(label);
        }
        localStorage.setItem(this.storageKey, JSON.stringify(labels));
    },

    delete(labelId: string): void {
        const labels = this.getAll().filter(l => l.id !== labelId);
        localStorage.setItem(this.storageKey, JSON.stringify(labels));
    },

    getByMessage(messageId: string): MessageLabel | undefined {
        return this.getAll().find(l => l.messageId === messageId);
    },

    getByConversation(conversationId: string): MessageLabel[] {
        return this.getAll().filter(l => l.conversationId === conversationId);
    },

    exportAsJSON(): string {
        return JSON.stringify(this.getAll(), null, 2);
    },

    exportAsJSONL(): string {
        return this.getAll().map(l => JSON.stringify(l)).join('\n');
    },

    exportForFineTuning(): string {

        const labels = this.getAll();
        const conversationGroups: { [key: string]: MessageLabel[] } = {};

        labels.forEach(label => {
            const key = label.conversationId;
            if (!conversationGroups[key]) {
                conversationGroups[key] = [];
            }
            conversationGroups[key].push(label);
        });

        const trainingData = Object.values(conversationGroups).map(convLabels => {
            const sortedLabels = convLabels.sort((a, b) =>
                new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
            );

            const messages = sortedLabels.map(label => ({
                role: label.role,
                content: label.content,

                _labels: {
                    tags: label.tags,
                    metrics: label.metrics,
                }
            }));

            return { messages };
        });

        return trainingData.map(d => JSON.stringify(d)).join('\n');
    },

    importFromJSON(jsonString: string): number {
        try {
            const imported = JSON.parse(jsonString);
            const labels = Array.isArray(imported) ? imported : [imported];
            labels.forEach(label => this.save(label));
            return labels.length;
        } catch {
            return 0;
        }
    },

    clear(): void {
        localStorage.removeItem(this.storageKey);
    }
};

export const ConversationLabelStorage = {
    storageKey: 'incognide_conversationLabels',

    getAll(): ConversationLabel[] {
        try {
            const data = localStorage.getItem(this.storageKey);
            return data ? JSON.parse(data) : [];
        } catch {
            return [];
        }
    },

    save(label: ConversationLabel): void {
        const labels = this.getAll();
        const existingIndex = labels.findIndex(l => l.id === label.id || l.conversationId === label.conversationId);
        if (existingIndex >= 0) {
            labels[existingIndex] = label;
        } else {
            labels.push(label);
        }
        localStorage.setItem(this.storageKey, JSON.stringify(labels));
    },

    delete(conversationId: string): void {
        const labels = this.getAll().filter(l => l.conversationId !== conversationId);
        localStorage.setItem(this.storageKey, JSON.stringify(labels));
    },

    getByConversation(conversationId: string): ConversationLabel | undefined {
        return this.getAll().find(l => l.conversationId === conversationId);
    },

    getTrainingConversations(): ConversationLabel[] {
        return this.getAll().filter(l => l.includeInTraining);
    },

    exportAsJSON(): string {
        return JSON.stringify(this.getAll(), null, 2);
    },

    importFromJSON(jsonString: string): number {
        try {
            const imported = JSON.parse(jsonString);
            const labels = Array.isArray(imported) ? imported : [imported];
            labels.forEach(label => this.save(label));
            return labels.length;
        } catch {
            return 0;
        }
    },

    clear(): void {
        localStorage.removeItem(this.storageKey);
    }
};

export const ContextFileStorage = {
    storageKey: 'incognide_contextFiles',

    getAll(): ContextFile[] {
        try {
            const data = localStorage.getItem(this.storageKey);
            return data ? JSON.parse(data) : [];
        } catch {
            return [];
        }
    },

    add(file: ContextFile): void {
        const files = this.getAll();

        if (!files.find(f => f.path === file.path)) {
            files.push(file);
            localStorage.setItem(this.storageKey, JSON.stringify(files));
        }
    },

    remove(fileId: string): void {
        const files = this.getAll().filter(f => f.id !== fileId);
        localStorage.setItem(this.storageKey, JSON.stringify(files));
    },

    clear(): void {
        localStorage.removeItem(this.storageKey);
    },

    getByPath(path: string): ContextFile | undefined {
        return this.getAll().find(f => f.path === path);
    }
};

const SCHEMA_VERSION_KEY = 'incognide_labelSchemaVersion';
const CURRENT_SCHEMA_VERSION = 2;

const migrateOldLabel = (label: any, scoreFields: { [key: string]: string }): Partial<MessageLabel | ConversationLabel> => {
    const metrics: UserMetric[] = [];
    Object.entries(scoreFields).forEach(([field, name]) => {
        const value = label[field];
        if (typeof value === 'number' && value > 0) {
            const definition: MetricDefinition = {
                id: crypto.randomUUID(),
                name,
                type: 'integer',
                min: 1,
                max: 5,
            };
            MetricDefinitionStorage.save(definition);
            metrics.push({ ...definition, value });
        }
    });

    const oldCategories: string[] = label.categories || [];
    const oldTags: string[] = label.tags || [];
    const tags = Array.from(new Set([...oldTags, ...oldCategories]));

    return { tags, metrics };
};

const migrateLabelsIfNeeded = () => {
    try {
        const version = parseInt(localStorage.getItem(SCHEMA_VERSION_KEY) || '0', 10);
        if (version >= CURRENT_SCHEMA_VERSION) return;

        const messageScoreFields = {
            qualityScore: 'Quality',
            relevanceScore: 'Relevance',
            accuracyScore: 'Accuracy',
            helpfulnessScore: 'Helpfulness',
        };

        const conversationScoreFields = {
            qualityScore: 'Quality',
            relevanceScore: 'Relevance',
            completenessScore: 'Completeness',
            usefulnessScore: 'Usefulness',
        };

        const messageLabels = MessageLabelStorage.getAll();
        let messageMigrated = false;
        messageLabels.forEach(label => {
            if ((label as any).categories?.length || (label as any).qualityScore || (label as any).relevanceScore || (label as any).accuracyScore || (label as any).helpfulnessScore) {
                const { tags, metrics } = migrateOldLabel(label, messageScoreFields);
                const updated: MessageLabel = {
                    ...label,
                    tags,
                    metrics: [...(label.metrics || []), ...metrics],
                };
                MessageLabelStorage.save(updated);
                messageMigrated = true;
            }
        });

        const conversationLabels = ConversationLabelStorage.getAll();
        conversationLabels.forEach(label => {
            if ((label as any).categories?.length || (label as any).qualityScore || (label as any).relevanceScore || (label as any).completenessScore || (label as any).usefulnessScore) {
                const { tags, metrics } = migrateOldLabel(label, conversationScoreFields);
                const updated: ConversationLabel = {
                    ...label,
                    tags,
                    metrics: [...(label.metrics || []), ...metrics],
                };
                ConversationLabelStorage.save(updated);
            }
        });

        localStorage.setItem(SCHEMA_VERSION_KEY, CURRENT_SCHEMA_VERSION.toString());
    } catch (err) {
        console.error('Failed to migrate label schema:', err);
    }
};

migrateLabelsIfNeeded();

export default MessageLabeling;
