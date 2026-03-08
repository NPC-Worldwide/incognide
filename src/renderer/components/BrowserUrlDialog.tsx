import React, { useState, useEffect } from 'react';
import { Globe, Bookmark, History, Star, Trash, X, ExternalLink } from 'lucide-react';

const BrowserUrlDialog = ({ isOpen, onClose, onNavigate, currentPath }) => {
    const [activeTab, setActiveTab] = useState('url');
    const [urlInput, setUrlInput] = useState('');
    const [bookmarks, setBookmarks] = useState([]);
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen) {
            loadBookmarksAndHistory();
            setUrlInput('');
        }
    }, [isOpen, currentPath]);

    const loadBookmarksAndHistory = async () => {
        setLoading(true);
        try {
            const [bookmarkRes, historyRes] = await Promise.all([
                window.api.browserGetBookmarks({ folderPath: currentPath }),
                window.api.browserGetHistory({ folderPath: currentPath, limit: 20 })
            ]);

            if (bookmarkRes.success) setBookmarks(bookmarkRes.bookmarks);
            if (historyRes.success) setHistory(historyRes.history);
        } catch (error) {
            console.error('Error loading bookmarks/history:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleUrlSubmit = (e) => {
        e.preventDefault();
        if (urlInput.trim()) {
            const finalUrl = urlInput.startsWith('http') ? urlInput : `https://${urlInput}`;
            onNavigate(finalUrl);
            onClose();
        }
    };

    const handleItemSelect = (url) => {
        onNavigate(url);
        onClose();
    };

    const handleAddBookmark = async () => {
        if (!urlInput.trim()) return;

        try {
            const finalUrl = urlInput.startsWith('http') ? urlInput : `https://${urlInput}`;
            const title = finalUrl.replace(/^https?:\/\//, '').split('/')[0];

            const result = await window.api.browserAddBookmark({
                url: finalUrl,
                title,
                folderPath: currentPath,
                isGlobal: false
            });

            if (result.success) {
                await loadBookmarksAndHistory();
                setActiveTab('bookmarks');
            }
        } catch (error) {
            console.error('Error adding bookmark:', error);
        }
    };

    const handleDeleteBookmark = async (bookmarkId, e) => {
        e.stopPropagation();
        try {
            const result = await window.api.browserDeleteBookmark({ bookmarkId });
            if (result.success) {
                await loadBookmarksAndHistory();
            }
        } catch (error) {
            console.error('Error deleting bookmark:', error);
        }
    };

    const handleMakeGlobal = async (bookmark, e) => {
        e.stopPropagation();
        try {

            await window.api.browserDeleteBookmark({ bookmarkId: bookmark.id });
            await window.api.browserAddBookmark({
                url: bookmark.url,
                title: bookmark.title,
                folderPath: currentPath,
                isGlobal: true
            });
            await loadBookmarksAndHistory();
        } catch (error) {
            console.error('Error making bookmark global:', error);
        }
    };

    const clearHistory = async () => {
        try {
            const result = await window.api.browserClearHistory({ folderPath: currentPath });
            if (result.success) {
                setHistory([]);
            }
        } catch (error) {
            console.error('Error clearing history:', error);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="theme-bg-secondary p-6 theme-border border rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-medium theme-text-primary flex items-center gap-2">
                        <Globe size={20} />
                        Open Website
                    </h3>
                    <button
                        onClick={onClose}
                        className="p-1 theme-hover rounded-full transition-colors"
                    >
                        <X size={16} />
                    </button>
                </div>

                <div className="flex border-b theme-border mb-4 -mx-2">
                    <button
                        onClick={() => setActiveTab('url')}
                        className={`px-4 py-2 text-sm border-b-2 transition-colors flex items-center gap-2 ${
                            activeTab === 'url'
                                ? 'border-blue-500 theme-text-primary bg-blue-500/10'
                                : 'border-transparent theme-text-muted hover:theme-text-primary hover:bg-gray-700/30'
                        }`}
                    >
                        <ExternalLink size={14} />
                        Enter URL
                    </button>
                    <button
                        onClick={() => setActiveTab('bookmarks')}
                        className={`px-4 py-2 text-sm border-b-2 transition-colors flex items-center gap-2 ${
                            activeTab === 'bookmarks'
                                ? 'border-blue-500 theme-text-primary bg-blue-500/10'
                                : 'border-transparent theme-text-muted hover:theme-text-primary hover:bg-gray-700/30'
                        }`}
                    >
                        <Bookmark size={14} />
                        Bookmarks ({bookmarks.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('history')}
                        className={`px-4 py-2 text-sm border-b-2 transition-colors flex items-center gap-2 ${
                            activeTab === 'history'
                                ? 'border-blue-500 theme-text-primary bg-blue-500/10'
                                : 'border-transparent theme-text-muted hover:theme-text-primary hover:bg-gray-700/30'
                        }`}
                    >
                        <History size={14} />
                        History ({history.length})
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto min-h-0">
                    {activeTab === 'url' && (
                        <div className="space-y-4">
                            <form onSubmit={handleUrlSubmit} className="space-y-3">
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={urlInput}
                                        onChange={(e) => setUrlInput(e.target.value)}
                                        placeholder="Enter URL (e.g., google.com or https://example.com)"
                                        className="flex-1 theme-input text-sm rounded px-3 py-2 border focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        autoFocus
                                    />
                                    <button
                                        type="button"
                                        onClick={handleAddBookmark}
                                        disabled={!urlInput.trim()}
                                        className="px-3 py-2 theme-button theme-hover rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                                        title="Add to bookmarks"
                                    >
                                        <Star size={14} />
                                    </button>
                                </div>
                                <button
                                    type="submit"
                                    disabled={!urlInput.trim()}
                                    className="w-full px-4 py-2 theme-button-primary rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Open Website
                                </button>
                            </form>
                            <div className="text-xs theme-text-muted space-y-1 theme-bg-tertiary p-3 rounded">
                                <p><strong>Tips:</strong></p>
                                <p>• Enter just the domain: <code>google.com</code></p>
                                <p>• Or full URL: <code>https://example.com/page</code></p>
                                <p>• Use the star button to save as a bookmark</p>
                            </div>
                        </div>
                    )}

                    {activeTab === 'bookmarks' && (
                        <div className="space-y-2">
                            {loading ? (
                                <div className="text-center py-8 theme-text-muted">
                                    <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                                    Loading bookmarks...
                                </div>
                            ) : bookmarks.length === 0 ? (
                                <div className="text-center py-8 theme-text-muted">
                                    <Bookmark size={32} className="mx-auto mb-2 opacity-50" />
                                    <p>No bookmarks yet</p>
                                    <p className="text-xs mt-1">Add URLs from the "Enter URL" tab</p>
                                </div>
                            ) : (
                                bookmarks.map((bookmark) => (
                                    <div
                                        key={bookmark.id}
                                        className="flex items-center gap-3 p-3 theme-hover rounded cursor-pointer group transition-colors"
                                        onClick={() => handleItemSelect(bookmark.url)}
                                    >
                                        <div className="flex-shrink-0">
                                            {bookmark.is_global ? (
                                                <Globe size={16} className="text-blue-400" title="Global bookmark" />
                                            ) : (
                                                <Bookmark size={16} className="text-yellow-400" title="Local bookmark" />
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-medium theme-text-primary truncate">
                                                {bookmark.title}
                                            </div>
                                            <div className="text-sm theme-text-muted truncate">
                                                {bookmark.url}
                                            </div>
                                            <div className="text-xs theme-text-muted">
                                                {bookmark.is_global ? 'Global' : 'Local'} • {new Date(bookmark.timestamp).toLocaleDateString()}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            {!bookmark.is_global && (
                                                <button
                                                    onClick={(e) => handleMakeGlobal(bookmark, e)}
                                                    className="p-1 theme-hover rounded text-blue-400"
                                                    title="Make global bookmark"
                                                >
                                                    <Globe size={12} />
                                                </button>
                                            )}
                                            <button
                                                onClick={(e) => handleDeleteBookmark(bookmark.id, e)}
                                                className="p-1 theme-hover rounded text-red-400"
                                                title="Delete bookmark"
                                            >
                                                <Trash size={12} />
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {activeTab === 'history' && (
                        <div className="space-y-2">
                            <div className="flex justify-between items-center mb-3">
                                <span className="text-sm theme-text-muted">Recent visits in this folder</span>
                                {history.length > 0 && (
                                    <button
                                        onClick={clearHistory}
                                        className="px-2 py-1 text-xs theme-button theme-hover rounded text-red-400"
                                    >
                                        Clear History
                                    </button>
                                )}
                            </div>
                            {loading ? (
                                <div className="text-center py-8 theme-text-muted">
                                    <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                                    Loading history...
                                </div>
                            ) : history.length === 0 ? (
                                <div className="text-center py-8 theme-text-muted">
                                    <History size={32} className="mx-auto mb-2 opacity-50" />
                                    <p>No browsing history</p>
                                    <p className="text-xs mt-1">Visited websites will appear here</p>
                                </div>
                            ) : (
                                history.map((item) => (
                                    <div
                                        key={item.id}
                                        className="flex items-center gap-3 p-3 theme-hover rounded cursor-pointer group transition-colors"
                                        onClick={() => handleItemSelect(item.url)}
                                    >
                                        <History size={16} className="text-gray-400 flex-shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <div className="font-medium theme-text-primary truncate">
                                                {item.title || item.url}
                                            </div>
                                            <div className="text-sm theme-text-muted truncate">
                                                {item.url}
                                            </div>
                                            <div className="text-xs theme-text-muted">
                                                {item.visit_count} visit{item.visit_count !== 1 ? 's' : ''} • {new Date(item.last_visited).toLocaleDateString()}
                                            </div>
                                        </div>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleAddBookmark();
                                                setUrlInput(item.url);
                                                setActiveTab('url');
                                            }}
                                            className="opacity-0 group-hover:opacity-100 p-1 theme-hover rounded text-yellow-400"
                                            title="Bookmark this URL"
                                        >
                                            <Star size={12} />
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>

                <div className="flex justify-end gap-3 mt-4 pt-4 border-t theme-border">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 theme-button theme-hover rounded text-sm"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
};

export default BrowserUrlDialog;