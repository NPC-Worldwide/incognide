import React, { useState, useMemo } from 'react';
import { X, Tag, Star, Save, ChevronDown, ChevronRight, Check, MessageSquare } from 'lucide-react';
import { ConversationLabel, ConversationLabelStorage } from './MessageLabeling';

const DEFAULT_CONVERSATION_CATEGORIES = [
    'high-quality',
    'low-quality',
    'complete',
    'incomplete',
    'technical',
    'creative',
    'informational',
    'troubleshooting',
    'coding',
    'writing',
    'analysis',
    'brainstorming',
    'exemplary',
    'needs-review',
];

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
    categories?: string[];
}

const StarRating = ({ value, onChange, max = 5, label }: {
    value: number;
    onChange: (v: number) => void;
    max?: number;
    label: string;
}) => {
    const [hover, setHover] = useState(0);

    return (
        <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 w-28">{label}</span>
            <div className="flex gap-0.5">
                {Array.from({ length: max }, (_, i) => i + 1).map((star) => (
                    <button
                        key={star}
                        type="button"
                        className={`p-0.5 transition-colors ${
                            star <= (hover || value) ? 'text-yellow-400' : 'text-gray-600'
                        } hover:text-yellow-300`}
                        onClick={() => onChange(star === value ? 0 : star)}
                        onMouseEnter={() => setHover(star)}
                        onMouseLeave={() => setHover(0)}
                    >
                        <Star size={16} fill={star <= (hover || value) ? 'currentColor' : 'none'} />
                    </button>
                ))}
            </div>
            <span className="text-xs text-gray-500 w-6">{value > 0 ? value : '-'}</span>
        </div>
    );
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

export const ConversationLabeling: React.FC<ConversationLabelingProps> = ({
    conversation,
    existingLabel,
    onSave,
    onClose,
    categories = DEFAULT_CONVERSATION_CATEGORIES,
}) => {
    const [selectedCategories, setSelectedCategories] = useState<string[]>(
        existingLabel?.categories || []
    );
    const [qualityScore, setQualityScore] = useState(existingLabel?.qualityScore || 0);
    const [relevanceScore, setRelevanceScore] = useState(existingLabel?.relevanceScore || 0);
    const [completenessScore, setCompletenessScore] = useState(existingLabel?.completenessScore || 0);
    const [usefulnessScore, setUsefulnessScore] = useState(existingLabel?.usefulnessScore || 0);
    const [tags, setTags] = useState<string[]>(existingLabel?.tags || []);
    const [notes, setNotes] = useState(existingLabel?.notes || '');
    const [summary, setSummary] = useState(existingLabel?.summary || '');
    const [includeInTraining, setIncludeInTraining] = useState(existingLabel?.includeInTraining ?? true);
    const [trainingWeight, setTrainingWeight] = useState(existingLabel?.trainingWeight || 1.0);

    const [expandedSection, setExpandedSection] = useState<'categories' | 'scores' | 'training' | 'notes' | 'preview' | null>('categories');

    const stats = useMemo(() => {
        const messages = conversation.messages || [];
        const userMessages = messages.filter(m => m.role === 'user').length;
        const assistantMessages = messages.filter(m => m.role === 'assistant').length;
        const totalTokens = messages.reduce((acc, m) => acc + Math.ceil((m.content?.length || 0) / 4), 0);
        return { total: messages.length, user: userMessages, assistant: assistantMessages, tokens: totalTokens };
    }, [conversation.messages]);

    const toggleCategory = (category: string) => {
        if (selectedCategories.includes(category)) {
            setSelectedCategories(selectedCategories.filter(c => c !== category));
        } else {
            setSelectedCategories([...selectedCategories, category]);
        }
    };

    const handleSave = () => {
        const label: ConversationLabel = {
            id: existingLabel?.id || crypto.randomUUID(),
            conversationId: conversation.id,
            title: conversation.title,
            categories: selectedCategories,
            qualityScore: qualityScore > 0 ? qualityScore : undefined,
            relevanceScore: relevanceScore > 0 ? relevanceScore : undefined,
            completenessScore: completenessScore > 0 ? completenessScore : undefined,
            usefulnessScore: usefulnessScore > 0 ? usefulnessScore : undefined,
            tags,
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
                        <SectionHeader title="Categories" section="categories" icon={Tag} />
                        {expandedSection === 'categories' && (
                            <div className="pt-2 flex flex-wrap gap-1">
                                {categories.map(category => (
                                    <button
                                        key={category}
                                        type="button"
                                        className={`px-2 py-1 rounded text-xs transition-colors ${
                                            selectedCategories.includes(category)
                                                ? 'bg-blue-600 text-white'
                                                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                        }`}
                                        onClick={() => toggleCategory(category)}
                                    >
                                        {category}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="border-b border-gray-700 pb-2">
                        <SectionHeader title="Scores" section="scores" icon={Star} />
                        {expandedSection === 'scores' && (
                            <div className="pt-2 space-y-2">
                                <StarRating label="Quality" value={qualityScore} onChange={setQualityScore} />
                                <StarRating label="Relevance" value={relevanceScore} onChange={setRelevanceScore} />
                                <StarRating label="Completeness" value={completenessScore} onChange={setCompletenessScore} />
                                <StarRating label="Usefulness" value={usefulnessScore} onChange={setUsefulnessScore} />
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
                        <SectionHeader title="Tags & Notes" section="notes" icon={Tag} />
                        {expandedSection === 'notes' && (
                            <div className="pt-2 space-y-3">
                                <div>
                                    <label className="text-xs text-gray-400 block mb-1">Custom Tags</label>
                                    <TagInput
                                        tags={tags}
                                        onChange={setTags}
                                        suggestions={[...categories, 'verified', 'needs-review', 'favorite']}
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-gray-400 block mb-1">Notes</label>
                                    <textarea
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                        placeholder="Add notes about this conversation..."
                                        className="w-full theme-input text-xs px-2 py-1 rounded resize-none"
                                        rows={3}
                                    />
                                </div>
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
                        {selectedCategories.length} categories
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
