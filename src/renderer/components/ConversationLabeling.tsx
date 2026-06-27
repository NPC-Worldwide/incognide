import React, { useState, useMemo } from 'react';
import { X, Tag, Save, ChevronDown, ChevronRight, Check, MessageSquare, Hash, Type, Plus, Trash2 } from 'lucide-react';
import { ConversationLabel, ConversationLabelStorage, MetricDefinitionStorage, UserMetric, collectAllTags } from './MessageLabeling';

interface ConversationLabelingProps {
    conversation: {
        id: string;
        title?: string;
        messages: Array<{
            role: string;
            content: string;
            timestamp?: string;
        }>;
    };
    existingLabel?: ConversationLabel;
    onSave: (label: ConversationLabel) => void;
    onClose: () => void;
}

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
    const [type, setType] = useState<'boolean' | 'integer' | 'float'>('integer');
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
            <div className="flex items-center gap-2 flex-wrap">
                <select
                    value={type}
                    onChange={(e) => setType(e.target.value as any)}
                    className="theme-input text-xs px-2 py-1 rounded"
                >
                    <option value="boolean">Boolean</option>
                    <option value="integer">Integer</option>
                    <option value="float">Float</option>
                </select>
                {type !== 'boolean' && (
                    <>
                        <input
                            type="number"
                            value={min}
                            onChange={(e) => setMin(e.target.value)}
                            placeholder="Min"
                            className="w-16 theme-input text-xs px-2 py-1 rounded"
                        />
                        <span className="text-xs text-gray-500">to</span>
                        <input
                            type="number"
                            value={max}
                            onChange={(e) => setMax(e.target.value)}
                            placeholder="Max"
                            className="w-16 theme-input text-xs px-2 py-1 rounded"
                        />
                    </>
                )}
                <button
                    type="button"
                    onClick={handleAdd}
                    disabled={!name.trim()}
                    className="ml-auto theme-button-primary px-2 py-1 text-xs rounded flex items-center gap-1 disabled:opacity-50"
                >
                    <Plus size={12} /> Add
                </button>
            </div>
        </div>
    );
};

export const ConversationLabeling: React.FC<ConversationLabelingProps> = ({
    conversation,
    existingLabel,
    onSave,
    onClose,
}) => {
    const [tags, setTags] = useState<string[]>(existingLabel?.tags || []);
    const [metrics, setMetrics] = useState<UserMetric[]>(existingLabel?.metrics || []);
    const [notes, setNotes] = useState(existingLabel?.notes || '');
    const [summary, setSummary] = useState(existingLabel?.summary || '');
    const [includeInTraining, setIncludeInTraining] = useState(existingLabel?.includeInTraining ?? true);
    const [trainingWeight, setTrainingWeight] = useState(existingLabel?.trainingWeight || 1.0);

    const [expandedSection, setExpandedSection] = useState<'tags' | 'metrics' | 'training' | 'notes' | 'preview' | null>('tags');

    const stats = useMemo(() => {
        const messages = conversation.messages || [];
        const userMessages = messages.filter(m => m.role === 'user').length;
        const assistantMessages = messages.filter(m => m.role === 'assistant').length;
        const totalTokens = messages.reduce((acc, m) => acc + Math.ceil((m.content?.length || 0) / 4), 0);
        return { total: messages.length, user: userMessages, assistant: assistantMessages, tokens: totalTokens };
    }, [conversation.messages]);

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
        const label: ConversationLabel = {
            id: existingLabel?.id || crypto.randomUUID(),
            conversationId: conversation.id,
            title: conversation.title,
            tags,
            metrics,
            notes: notes || undefined,
            summary: summary || undefined,
            includeInTraining,
            trainingWeight: trainingWeight !== 1.0 ? trainingWeight : undefined,
            messageCount: stats.total,
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
            <div className="bg-gray-900 rounded-lg border border-gray-700 w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
                <div className="flex items-center justify-between p-4 border-b border-gray-700">
                    <div className="flex items-center gap-2">
                        <MessageSquare size={20} className="text-green-400" />
                        <h2 className="text-lg font-semibold">Label Conversation</h2>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-800 rounded">
                        <X size={20} />
                    </button>
                </div>

                <div className="px-4 py-2 border-b border-gray-700 bg-gray-800/50 flex items-center gap-4 text-xs">
                    <span className="text-gray-400">
                        <span className="text-white font-medium">{stats.total}</span> messages
                    </span>
                    <span className="text-gray-400">
                        <span className="text-blue-400 font-medium">{stats.user}</span> user
                    </span>
                    <span className="text-gray-400">
                        <span className="text-green-400 font-medium">{stats.assistant}</span> assistant
                    </span>
                    <span className="text-gray-400">
                        ~<span className="text-yellow-400 font-medium">{stats.tokens}</span> tokens
                    </span>
                    {conversation.title && (
                        <span className="text-gray-300 truncate flex-1 text-right" title={conversation.title}>
                            {conversation.title}
                        </span>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-2">
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

                    <div className="border-b border-gray-700 pb-2">
                        <SectionHeader title="Fine-tuning Settings" section="training" icon={Check} />
                        {expandedSection === 'training' && (
                            <div className="pt-2 space-y-3">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={includeInTraining}
                                        onChange={(e) => setIncludeInTraining(e.target.checked)}
                                        className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
                                    />
                                    <span className="text-sm text-gray-300">Include in training data</span>
                                </label>
                                {includeInTraining && (
                                    <div className="flex items-center gap-3">
                                        <label className="text-xs text-gray-400">Training Weight:</label>
                                        <input
                                            type="range"
                                            min="0.1"
                                            max="2.0"
                                            step="0.1"
                                            value={trainingWeight}
                                            onChange={(e) => setTrainingWeight(parseFloat(e.target.value))}
                                            className="flex-1"
                                        />
                                        <span className="text-xs text-gray-300 w-8">{trainingWeight.toFixed(1)}</span>
                                    </div>
                                )}
                                <div>
                                    <label className="text-xs text-gray-400 block mb-1">Summary (for training context)</label>
                                    <textarea
                                        value={summary}
                                        onChange={(e) => setSummary(e.target.value)}
                                        placeholder="Brief description of what this conversation covers..."
                                        className="w-full theme-input text-xs px-2 py-1 rounded resize-none"
                                        rows={2}
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="border-b border-gray-700 pb-2">
                        <SectionHeader title="Notes" section="notes" icon={Type} />
                        {expandedSection === 'notes' && (
                            <div className="pt-2">
                                <textarea
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    placeholder="Add notes about this conversation..."
                                    className="w-full theme-input text-xs px-2 py-1 rounded resize-none"
                                    rows={3}
                                />
                            </div>
                        )}
                    </div>

                    <div className="pb-2">
                        <SectionHeader title="Message Preview" section="preview" icon={MessageSquare} />
                        {expandedSection === 'preview' && (
                            <div className="pt-2 max-h-60 overflow-y-auto space-y-2">
                                {conversation.messages.slice(0, 10).map((msg, idx) => (
                                    <div key={idx} className={`p-2 rounded text-xs ${
                                        msg.role === 'user' ? 'bg-blue-900/20 border-l-2 border-blue-500' : 'bg-green-900/20 border-l-2 border-green-500'
                                    }`}>
                                        <div className="text-[10px] text-gray-500 mb-1">{msg.role}</div>
                                        <div className="text-gray-300 line-clamp-3">{msg.content}</div>
                                    </div>
                                ))}
                                {conversation.messages.length > 10 && (
                                    <div className="text-center text-xs text-gray-500 py-2">
                                        ... and {conversation.messages.length - 10} more messages
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex items-center justify-between p-4 border-t border-gray-700">
                    <div className="text-xs text-gray-500">
                        {tags.length} tags, {metrics.length} metrics
                        {includeInTraining && <span className="text-green-400 ml-2">✓ Training</span>}
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

export default ConversationLabeling;
