import React, { useState, useRef, useCallback, useEffect } from 'react';
import { X, Tag, Star, Download, Upload, Plus, Trash2, Save, Check, ChevronDown, ChevronRight } from 'lucide-react';

export interface TextSpanLabel {
    id: string;
    startOffset: number;
    endOffset: number;
    text: string;
    category: string;
    score?: number;
    notes?: string;
}

export interface MessageLabel {
    id: string;
    messageId: string;
    conversationId: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;

    categories: string[];
    qualityScore?: number;
    relevanceScore?: number;
    accuracyScore?: number;
    helpfulnessScore?: number;
    tags: string[];
    notes?: string;

    textSpans: TextSpanLabel[];

    labeledAt: string;
    labeledBy?: string;
}

export interface ConversationLabel {
    id: string;
    conversationId: string;
    title?: string;

    categories: string[];
    qualityScore?: number;
    relevanceScore?: number;
    completenessScore?: number;
    usefulnessScore?: number;
    tags: string[];
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

const DEFAULT_CATEGORIES = [
    'high-quality',
    'low-quality',
    'factually-correct',
    'factually-incorrect',
    'helpful',
    'not-helpful',
    'creative',
    'technical',
    'casual',
    'formal',
    'needs-improvement',
    'exemplary',
];

const DEFAULT_SPAN_CATEGORIES = [
    'important',
    'error',
    'good-reasoning',
    'bad-reasoning',
    'citation-needed',
    'key-insight',
    'redundant',
    'unclear',
    'well-explained',
];

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
    categories?: string[];
    spanCategories?: string[];
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
            <span className="text-xs text-gray-400 w-24">{label}</span>
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

export const MessageLabeling: React.FC<MessageLabelingProps> = ({
    message,
    existingLabel,
    onSave,
    onClose,
    categories = DEFAULT_CATEGORIES,
    spanCategories = DEFAULT_SPAN_CATEGORIES,
}) => {

    const [selectedCategories, setSelectedCategories] = useState<string[]>(
        existingLabel?.categories || []
    );
    const [qualityScore, setQualityScore] = useState(existingLabel?.qualityScore || 0);
    const [relevanceScore, setRelevanceScore] = useState(existingLabel?.relevanceScore || 0);
    const [accuracyScore, setAccuracyScore] = useState(existingLabel?.accuracyScore || 0);
    const [helpfulnessScore, setHelpfulnessScore] = useState(existingLabel?.helpfulnessScore || 0);
    const [tags, setTags] = useState<string[]>(existingLabel?.tags || []);
    const [notes, setNotes] = useState(existingLabel?.notes || '');

    const [textSpans, setTextSpans] = useState<TextSpanLabel[]>(existingLabel?.textSpans || []);
    const [selectedText, setSelectedText] = useState<{ text: string; start: number; end: number } | null>(null);
    const [spanCategory, setSpanCategory] = useState(spanCategories[0]);
    const [spanScore, setSpanScore] = useState(0);
    const [spanNotes, setSpanNotes] = useState('');

    const contentRef = useRef<HTMLDivElement>(null);
    const [expandedSection, setExpandedSection] = useState<'categories' | 'scores' | 'spans' | 'notes' | null>('categories');

    const handleTextSelection = useCallback(() => {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed || !contentRef.current) {
            return;
        }

        const selectedStr = selection.toString().trim();
        if (!selectedStr) return;

        const range = selection.getRangeAt(0);
        const preSelectionRange = range.cloneRange();
        preSelectionRange.selectNodeContents(contentRef.current);
        preSelectionRange.setEnd(range.startContainer, range.startOffset);

        const startOffset = preSelectionRange.toString().length;
        const endOffset = startOffset + selectedStr.length;

        setSelectedText({
            text: selectedStr,
            start: startOffset,
            end: endOffset,
        });
    }, []);

    const addSpanLabel = () => {
        if (!selectedText) return;

        const newSpan: TextSpanLabel = {
            id: crypto.randomUUID(),
            startOffset: selectedText.start,
            endOffset: selectedText.end,
            text: selectedText.text,
            category: spanCategory,
            score: spanScore > 0 ? spanScore : undefined,
            notes: spanNotes || undefined,
        };

        setTextSpans([...textSpans, newSpan]);
        setSelectedText(null);
        setSpanScore(0);
        setSpanNotes('');
        window.getSelection()?.removeAllRanges();
    };

    const removeSpanLabel = (id: string) => {
        setTextSpans(textSpans.filter(s => s.id !== id));
    };

    const toggleCategory = (category: string) => {
        if (selectedCategories.includes(category)) {
            setSelectedCategories(selectedCategories.filter(c => c !== category));
        } else {
            setSelectedCategories([...selectedCategories, category]);
        }
    };

    const handleSave = () => {
        const label: MessageLabel = {
            id: existingLabel?.id || crypto.randomUUID(),
            messageId: message.id,
            conversationId: message.conversationId || '',
            role: message.role as 'user' | 'assistant',
            content: message.content,
            timestamp: message.timestamp,
            categories: selectedCategories,
            qualityScore: qualityScore > 0 ? qualityScore : undefined,
            relevanceScore: relevanceScore > 0 ? relevanceScore : undefined,
            accuracyScore: accuracyScore > 0 ? accuracyScore : undefined,
            helpfulnessScore: helpfulnessScore > 0 ? helpfulnessScore : undefined,
            tags,
            notes: notes || undefined,
            textSpans,
            labeledAt: new Date().toISOString(),
        };

        onSave(label);
    };

    const renderHighlightedContent = () => {
        if (textSpans.length === 0) {
            return message.content;
        }

        const sortedSpans = [...textSpans].sort((a, b) => a.startOffset - b.startOffset);
        const parts: React.ReactNode[] = [];
        let lastEnd = 0;

        sortedSpans.forEach((span, idx) => {

            if (span.startOffset > lastEnd) {
                parts.push(message.content.slice(lastEnd, span.startOffset));
            }

            parts.push(
                <span
                    key={span.id}
                    className="bg-yellow-500/30 border-b border-yellow-500 cursor-pointer relative group"
                    title={`${span.category}${span.score ? ` (${span.score}/5)` : ''}`}
                >
                    {span.text}
                    <span className="absolute -top-6 left-0 hidden group-hover:block bg-gray-800 text-xs px-2 py-1 rounded whitespace-nowrap z-10">
                        {span.category} {span.score ? `★${span.score}` : ''}
                    </span>
                </span>
            );

            lastEnd = span.endOffset;
        });

        if (lastEnd < message.content.length) {
            parts.push(message.content.slice(lastEnd));
        }

        return parts;
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
                        <div className="mb-2 text-xs text-gray-400">
                            Select text to add span labels. Highlighted text shows existing labels.
                        </div>
                        <div
                            ref={contentRef}
                            className="prose prose-sm prose-invert max-w-none p-3 bg-gray-800 rounded whitespace-pre-wrap select-text cursor-text"
                            onMouseUp={handleTextSelection}
                        >
                            {renderHighlightedContent()}
                        </div>

                        {selectedText && (
                            <div className="mt-4 p-3 bg-gray-800 rounded border border-blue-500">
                                <div className="text-xs text-blue-400 mb-2">Selected Text:</div>
                                <div className="text-sm mb-3 p-2 bg-gray-700 rounded max-h-20 overflow-y-auto">
                                    "{selectedText.text}"
                                </div>
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                        <select
                                            value={spanCategory}
                                            onChange={(e) => setSpanCategory(e.target.value)}
                                            className="theme-input text-xs px-2 py-1 rounded flex-1"
                                        >
                                            {spanCategories.map(cat => (
                                                <option key={cat} value={cat}>{cat}</option>
                                            ))}
                                        </select>
                                        <div className="flex items-center gap-1">
                                            {[1, 2, 3, 4, 5].map(s => (
                                                <button
                                                    key={s}
                                                    type="button"
                                                    className={`p-0.5 ${s <= spanScore ? 'text-yellow-400' : 'text-gray-600'}`}
                                                    onClick={() => setSpanScore(s === spanScore ? 0 : s)}
                                                >
                                                    <Star size={12} fill={s <= spanScore ? 'currentColor' : 'none'} />
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <input
                                        type="text"
                                        value={spanNotes}
                                        onChange={(e) => setSpanNotes(e.target.value)}
                                        placeholder="Notes (optional)"
                                        className="w-full theme-input text-xs px-2 py-1 rounded"
                                    />
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            className="flex-1 theme-button-primary px-3 py-1 text-xs rounded flex items-center justify-center gap-1"
                                            onClick={addSpanLabel}
                                        >
                                            <Plus size={12} /> Add Label
                                        </button>
                                        <button
                                            type="button"
                                            className="theme-button px-3 py-1 text-xs rounded"
                                            onClick={() => {
                                                setSelectedText(null);
                                                window.getSelection()?.removeAllRanges();
                                            }}
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="w-80 p-4 overflow-y-auto space-y-2">
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
                                    <StarRating label="Accuracy" value={accuracyScore} onChange={setAccuracyScore} />
                                    <StarRating label="Helpfulness" value={helpfulnessScore} onChange={setHelpfulnessScore} />
                                </div>
                            )}
                        </div>

                        <div className="border-b border-gray-700 pb-2">
                            <SectionHeader title={`Text Spans (${textSpans.length})`} section="spans" icon={Tag} />
                            {expandedSection === 'spans' && (
                                <div className="pt-2 space-y-2 max-h-40 overflow-y-auto">
                                    {textSpans.length === 0 ? (
                                        <div className="text-xs text-gray-500 text-center py-2">
                                            Select text in the message to add span labels
                                        </div>
                                    ) : (
                                        textSpans.map(span => (
                                            <div key={span.id} className="flex items-start gap-2 p-2 bg-gray-800 rounded text-xs">
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-gray-400 truncate">"{span.text}"</div>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <span className="px-1.5 py-0.5 bg-yellow-600/30 text-yellow-300 rounded">
                                                            {span.category}
                                                        </span>
                                                        {span.score && (
                                                            <span className="text-yellow-400">★{span.score}</span>
                                                        )}
                                                    </div>
                                                </div>
                                                <button
                                                    type="button"
                                                    className="p-1 hover:bg-gray-700 rounded text-gray-500 hover:text-red-400"
                                                    onClick={() => removeSpanLabel(span.id)}
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="pb-2">
                            <SectionHeader title="Tags & Notes" section="notes" icon={Tag} />
                            {expandedSection === 'notes' && (
                                <div className="pt-2 space-y-3">
                                    <div>
                                        <label className="text-xs text-gray-400 block mb-1">Custom Tags</label>
                                        <TagInput
                                            tags={tags}
                                            onChange={setTags}
                                            suggestions={[...categories, 'needs-review', 'verified', 'training-data']}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-400 block mb-1">Notes</label>
                                        <textarea
                                            value={notes}
                                            onChange={(e) => setNotes(e.target.value)}
                                            placeholder="Add notes about this message..."
                                            className="w-full theme-input text-xs px-2 py-1 rounded resize-none"
                                            rows={3}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-between p-4 border-t border-gray-700">
                    <div className="text-xs text-gray-500">
                        {selectedCategories.length} categories, {textSpans.length} spans
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
                    categories: label.categories,
                    scores: {
                        quality: label.qualityScore,
                        relevance: label.relevanceScore,
                        accuracy: label.accuracyScore,
                        helpfulness: label.helpfulnessScore,
                    },
                    tags: label.tags,
                    spans: label.textSpans,
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

export default MessageLabeling;
