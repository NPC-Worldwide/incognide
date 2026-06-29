import React, { useState, useEffect, useCallback } from 'react';
import {
    KeyRound, Cookie, Shield, Clock, Eye, EyeOff, Plus, Trash2,
    Copy, ExternalLink, Settings, Upload, Globe, Search, Network
} from 'lucide-react';
import PasswordImport from './PasswordImport';
import { PasswordEntry } from '../utils/passwordImport';
import BrowserHistoryWeb from './BrowserHistoryWeb';

interface BrowserSettingsManagerProps {
    currentPath?: string;
    websitesSettings?: any;
    setWebsitesSettings?: (fn: any) => void;
    browserSessionMode?: 'global' | 'project';
    setBrowserSessionMode?: (mode: 'global' | 'project') => void;
}

type TabId = 'passwords' | 'cookies' | 'site-limits' | 'history' | 'graph';

const PasswordsTab: React.FC = () => {
    const [credentials, setCredentials] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [encryptionStatus, setEncryptionStatus] = useState<any>(null);
    const [showAddForm, setShowAddForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [showPasswordField, setShowPasswordField] = useState(false);
    const [formData, setFormData] = useState({ site: '', username: '', password: '', notes: '' });
    const [revealedPasswords, setRevealedPasswords] = useState<Record<string, string>>({});
    const [showImportModal, setShowImportModal] = useState(false);
    const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null);
    const [search, setSearch] = useState('');

    const loadCredentials = useCallback(async () => {
        setLoading(true);
        try {
            const result = await (window as any).api.passwordList();
            if (result.success) setCredentials(result.credentials);
            const status = await (window as any).api.passwordEncryptionStatus();
            setEncryptionStatus(status);
        } catch (err) { console.error('Failed to load credentials:', err); }
        setLoading(false);
    }, []);

    useEffect(() => { loadCredentials(); }, [loadCredentials]);

    const handleSave = async () => {
        if (!formData.site || !formData.username || !formData.password) return;
        try {
            const result = await (window as any).api.passwordSave({ ...formData, ...(editingId ? { id: editingId } : {}) });
            if (result.success) {
                setFormData({ site: '', username: '', password: '', notes: '' });
                setShowAddForm(false);
                setEditingId(null);
                loadCredentials();
            }
        } catch (err) { console.error('Failed to save:', err); }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this credential?')) return;
        try {
            const result = await (window as any).api.passwordDelete(id);
            if (result.success) loadCredentials();
        } catch (err) { console.error('Failed to delete:', err); }
    };

    const handleEdit = async (id: string) => {
        try {
            const result = await (window as any).api.passwordGet(id);
            if (result.success) {
                setFormData({ site: result.credential.site, username: result.credential.username, password: result.credential.password, notes: result.credential.notes || '' });
                setEditingId(id);
                setShowAddForm(true);
            }
        } catch (err) { console.error('Failed to get:', err); }
    };

    const revealPassword = async (id: string) => {
        if (revealedPasswords[id]) { setRevealedPasswords(prev => { const n = { ...prev }; delete n[id]; return n; }); return; }
        try {
            const result = await (window as any).api.passwordGet(id);
            if (result.success) setRevealedPasswords(prev => ({ ...prev, [id]: result.credential.password }));
        } catch (err) { console.error('Failed to reveal:', err); }
    };

    const copyToClipboard = async (id: string, field: 'username' | 'password') => {
        try {
            const result = await (window as any).api.passwordGet(id);
            if (result.success) await navigator.clipboard.writeText(result.credential[field]);
        } catch (err) { console.error('Failed to copy:', err); }
    };

    const handleImport = useCallback(async (importedPasswords: PasswordEntry[]) => {
        setImportProgress({ current: 0, total: importedPasswords.length });
        let imported = 0;
        for (const entry of importedPasswords) {
            try {
                const result = await (window as any).api.passwordSave({
                    site: entry.url || entry.name, username: entry.username || '', password: entry.password,
                    notes: [entry.notes, entry.folder ? `Folder: ${entry.folder}` : '', entry.totp ? `TOTP: ${entry.totp}` : ''].filter(Boolean).join('\n')
                });
                if (result.success) imported++;
            } catch (err) { console.error(`Failed to import ${entry.name}:`, err); }
            setImportProgress({ current: imported, total: importedPasswords.length });
        }
        await loadCredentials();
        setImportProgress(null);
        setShowImportModal(false);
    }, [loadCredentials]);

    const filtered = credentials.filter(c => !search || c.site?.toLowerCase().includes(search.toLowerCase()) || c.username?.toLowerCase().includes(search.toLowerCase()));

    if (loading) return <div className="text-center py-8 text-gray-400 text-sm">Loading credentials...</div>;

    return (
        <div className="space-y-3 p-4">
            {encryptionStatus && (
                <div className={`p-2.5 rounded text-xs flex items-center gap-2 ${encryptionStatus.available ? 'bg-green-900/30 text-green-400' : 'bg-yellow-900/30 text-yellow-400'}`}>
                    <KeyRound size={13} /> {encryptionStatus.message}
                </div>
            )}
            {showAddForm ? (
                <div className="theme-bg-tertiary rounded-lg p-4 border theme-border space-y-3">
                    <div className="text-sm font-medium theme-text-primary">{editingId ? 'Edit Credential' : 'Add Credential'}</div>
                    {(['site', 'username', 'notes'] as const).map(field => (
                        <input key={field} className="w-full px-3 py-1.5 text-sm theme-bg-secondary theme-border border rounded focus:outline-none focus:border-blue-500"
                            placeholder={field === 'site' ? 'Site / URL' : field === 'username' ? 'Username / Email' : 'Notes (optional)'}
                            value={formData[field]} onChange={e => setFormData({ ...formData, [field]: e.target.value })} />
                    ))}
                    <div className="relative">
                        <input className="w-full px-3 py-1.5 pr-9 text-sm theme-bg-secondary theme-border border rounded focus:outline-none focus:border-blue-500"
                            placeholder="Password" type={showPasswordField ? 'text' : 'password'}
                            value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} />
                        <button className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white" onClick={() => setShowPasswordField(!showPasswordField)}>
                            {showPasswordField ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={handleSave} className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded">{editingId ? 'Update' : 'Save'}</button>
                        <button onClick={() => { setShowAddForm(false); setEditingId(null); setFormData({ site: '', username: '', password: '', notes: '' }); }} className="px-3 py-1.5 text-xs theme-bg-secondary hover:bg-white/10 theme-text-primary rounded border theme-border">Cancel</button>
                    </div>
                </div>
            ) : (
                <div className="flex gap-2">
                    <button onClick={() => setShowAddForm(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded"><Plus size={13} /> Add</button>
                    <button onClick={() => setShowImportModal(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs theme-bg-tertiary hover:bg-white/10 theme-text-primary rounded border theme-border"><Upload size={13} /> Import</button>
                </div>
            )}
            {importProgress && <div className="bg-blue-900/30 rounded p-2 text-xs text-blue-400">Importing... {importProgress.current}/{importProgress.total}</div>}
            <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input className="w-full pl-8 pr-3 py-1.5 text-xs theme-bg-tertiary theme-border border rounded focus:outline-none focus:border-blue-500"
                    placeholder="Search credentials..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
                {filtered.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 text-xs"><KeyRound size={28} className="mx-auto mb-2 opacity-30" /><p>No saved credentials{search ? ' matching search' : ' yet'}.</p></div>
                ) : filtered.map(cred => (
                    <div key={cred.id} className="theme-bg-tertiary rounded p-3 border theme-border">
                        <div className="flex items-center justify-between">
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5"><ExternalLink size={12} className="text-gray-500 flex-shrink-0" /><span className="text-sm font-medium theme-text-primary truncate">{cred.site}</span></div>
                                <div className="text-xs text-gray-400 mt-0.5">{cred.username}</div>
                                {revealedPasswords[cred.id] && <div className="text-xs text-green-400 mt-0.5 font-mono">{revealedPasswords[cred.id]}</div>}
                                {cred.notes && <div className="text-xs text-gray-500 mt-0.5">{cred.notes}</div>}
                            </div>
                            <div className="flex items-center gap-0.5 ml-2 flex-shrink-0">
                                <button onClick={() => copyToClipboard(cred.id, 'username')} className="p-1.5 hover:bg-white/10 rounded text-gray-400 hover:text-white" title="Copy username"><Copy size={13} /></button>
                                <button onClick={() => revealPassword(cred.id)} className="p-1.5 hover:bg-white/10 rounded text-gray-400 hover:text-white">{revealedPasswords[cred.id] ? <EyeOff size={13} /> : <Eye size={13} />}</button>
                                <button onClick={() => copyToClipboard(cred.id, 'password')} className="p-1.5 hover:bg-white/10 rounded text-blue-400" title="Copy password"><KeyRound size={13} /></button>
                                <button onClick={() => handleEdit(cred.id)} className="p-1.5 hover:bg-white/10 rounded text-gray-400 hover:text-white"><Settings size={13} /></button>
                                <button onClick={() => handleDelete(cred.id)} className="p-1.5 hover:bg-white/10 rounded text-red-400 hover:text-red-300"><Trash2 size={13} /></button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
            <PasswordImport isOpen={showImportModal} onClose={() => setShowImportModal(false)} onImport={handleImport} />
        </div>
    );
};

const CookiesTab: React.FC<{ currentPath?: string; browserSessionMode?: string; setBrowserSessionMode?: (m: any) => void }> = ({ currentPath, browserSessionMode, setBrowserSessionMode }) => {
    const [domains, setDomains] = useState<string[]>([]);
    const [selectedDomain, setSelectedDomain] = useState('');
    const [cookies, setCookies] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const r = await (window as any).api?.browserGetCookieDomains?.({ partition: 'browser-global' });
                let allDomains: string[] = r?.domains || [];
                if (currentPath) {
                    const key = currentPath.replace(/[^a-z0-9]/gi, '_');
                    const r2 = await (window as any).api?.browserGetCookieDomains?.({ partition: `browser-project-${key}` }).catch(() => null);
                    if (r2?.domains?.length) allDomains = [...new Set([...allDomains, ...r2.domains])];
                }
                setDomains(allDomains);
            } catch {}
        })();
    }, [currentPath]);

    const loadCookies = async (domain: string) => {
        setSelectedDomain(domain); setLoading(true);
        try { const r = await (window as any).api?.browserGetCookiesFromPartition?.({ partition: 'browser-global', domain }); setCookies(r?.cookies || []); } catch {}
        setLoading(false);
    };

    return (
        <div className="p-4 space-y-4">
            <div>
                <div className="text-xs text-gray-400 mb-2">Session Mode</div>
                <div className="flex gap-2">
                    {(['global', 'project'] as const).map(mode => (
                        <button key={mode} onClick={() => {
                            setBrowserSessionMode?.(mode);
                            if (mode === 'global') { localStorage.setItem('npc-browser-session-mode', 'global'); localStorage.removeItem(`npc-browser-session-mode-${currentPath}`); }
                            else { localStorage.setItem(`npc-browser-session-mode-${currentPath}`, 'project'); }
                            window.dispatchEvent(new Event('browser-session-mode-changed'));
                        }} className={`flex-1 px-3 py-2 rounded text-xs transition-colors ${browserSessionMode === mode ? 'bg-purple-600 text-white' : 'theme-bg-tertiary theme-text-muted hover:text-white border theme-border'}`}>
                            {mode === 'global' ? 'Global (shared)' : 'Project only'}
                        </button>
                    ))}
                </div>
                <div className="text-[10px] text-gray-500 mt-1">{browserSessionMode === 'global' ? 'Logins shared across all folders.' : 'Logins isolated to this folder.'} Re-open tabs to apply.</div>
            </div>
            {domains.length > 0 ? (
                <div>
                    <div className="text-xs text-gray-400 mb-2">Saved Cookies by Domain</div>
                    <div className="flex gap-1.5 flex-wrap">
                        {domains.map(d => (
                            <button key={d} onClick={() => loadCookies(d)} className={`px-2 py-1 text-xs rounded border transition-colors ${selectedDomain === d ? 'bg-purple-600 text-white border-purple-500' : 'theme-bg-tertiary theme-border theme-text-muted hover:text-white'}`}>{d}</button>
                        ))}
                    </div>
                    {selectedDomain && (
                        <div className="mt-3 max-h-60 overflow-y-auto space-y-1">
                            {loading ? <div className="text-xs text-gray-500">Loading...</div> : cookies.length === 0 ? <div className="text-xs text-gray-500">No cookies</div> :
                                cookies.map((c, i) => (
                                    <div key={i} className="flex items-center justify-between px-2 py-1.5 theme-bg-tertiary rounded text-xs">
                                        <span className="font-mono theme-text-primary truncate flex-1">{c.name}</span>
                                        <span className="text-gray-500 ml-2">{c.domain}</span>
                                    </div>
                                ))
                            }
                        </div>
                    )}
                </div>
            ) : (
                <div className="text-center py-8 text-gray-500 text-xs"><Cookie size={28} className="mx-auto mb-2 opacity-30" /><p>No saved cookies yet.</p></div>
            )}
        </div>
    );
};

const SiteLimitsTab: React.FC<{ currentPath?: string }> = ({ currentPath }) => {
    const [limits, setLimits] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const loadLimits = useCallback(async () => {
        setLoading(true);
        try { const r = await (window as any).api?.browserGetSiteLimits?.({ folderPath: currentPath }); setLimits(r?.limits || []); } catch {}
        setLoading(false);
    }, [currentPath]);

    useEffect(() => { loadLimits(); }, [loadLimits]);

    if (loading) return <div className="text-center py-8 text-gray-400 text-sm">Loading...</div>;

    return (
        <div className="p-4 space-y-3">
            <div className="text-xs text-gray-400">Right-click any site in the browser sidebar to add limits.</div>
            {limits.length === 0 ? (
                <div className="text-center py-8 text-gray-500 text-xs"><Shield size={28} className="mx-auto mb-2 opacity-30" /><p>No site limits set.</p></div>
            ) : (
                <div className="space-y-2 max-h-[65vh] overflow-y-auto">
                    {limits.map((limit: any) => (
                        <div key={limit.id} className="theme-bg-tertiary rounded p-3 border theme-border flex items-center justify-between">
                            <div>
                                <div className="text-sm font-medium theme-text-primary">{limit.domain}</div>
                                <div className="text-xs text-gray-400 mt-0.5 flex gap-3">
                                    {limit.daily_time_limit > 0 && <span>{limit.daily_time_limit} min/day</span>}
                                    {limit.daily_visit_limit > 0 && <span>{limit.daily_visit_limit} visits/day</span>}
                                    {limit.hourly_time_limit > 0 && <span>{limit.hourly_time_limit} min/hr</span>}
                                </div>
                            </div>
                            <button onClick={async () => { await (window as any).api?.browserDeleteSiteLimit?.({ limitId: limit.id }); loadLimits(); }} className="p-1.5 text-red-400 hover:text-red-300 hover:bg-white/10 rounded"><Trash2 size={14} /></button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

const HistoryTab: React.FC<{ websitesSettings: any; setWebsitesSettings: any }> = ({ websitesSettings, setWebsitesSettings }) => (
    <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
            <label className="text-sm theme-text-primary">Group by domain</label>
            <input type="checkbox" checked={websitesSettings?.groupByDomain || false} onChange={e => setWebsitesSettings?.((s: any) => ({ ...s, groupByDomain: e.target.checked }))} className="rounded" />
        </div>
        <div>
            <label className="text-xs text-gray-400 block mb-1">Time range (days, 0 = all)</label>
            <input type="number" value={websitesSettings?.timeRangeDays || 0} onChange={e => setWebsitesSettings?.((s: any) => ({ ...s, timeRangeDays: parseInt(e.target.value) || 0 }))} min="0"
                className="w-full px-3 py-1.5 text-sm theme-bg-tertiary theme-border border rounded focus:outline-none focus:border-blue-500" />
        </div>
        <div>
            <label className="text-xs text-gray-400 block mb-1">Max history items</label>
            <input type="number" value={websitesSettings?.maxHistory || 100} onChange={e => setWebsitesSettings?.((s: any) => ({ ...s, maxHistory: parseInt(e.target.value) || 100 }))} min="10"
                className="w-full px-3 py-1.5 text-sm theme-bg-tertiary theme-border border rounded focus:outline-none focus:border-blue-500" />
        </div>
        <div>
            <label className="text-xs text-gray-400 block mb-1">Excluded domains (comma-separated)</label>
            <input type="text" value={websitesSettings?.excludedDomains || ''} onChange={e => setWebsitesSettings?.((s: any) => ({ ...s, excludedDomains: e.target.value }))} placeholder="facebook.com,twitter.com"
                className="w-full px-3 py-1.5 text-sm theme-bg-tertiary theme-border border rounded focus:outline-none focus:border-blue-500 placeholder:opacity-40" />
        </div>
    </div>
);

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'passwords', label: 'Passwords', icon: <KeyRound size={15} /> },
    { id: 'cookies', label: 'Cookies', icon: <Cookie size={15} /> },
    { id: 'site-limits', label: 'Site Limits', icon: <Shield size={15} /> },
    { id: 'history', label: 'History', icon: <Clock size={15} /> },
    { id: 'graph', label: 'History Graph', icon: <Network size={15} /> },
];

const BrowserSettingsManager: React.FC<BrowserSettingsManagerProps> = ({
    currentPath, websitesSettings, setWebsitesSettings, browserSessionMode, setBrowserSessionMode
}) => {
    const [activeTab, setActiveTab] = useState<TabId>('passwords');

    return (
        <div className="flex h-full theme-bg-secondary overflow-hidden">
            <div className="w-44 border-r theme-border p-2 flex-shrink-0 space-y-0.5">
                <div className="flex items-center gap-2 px-3 py-2 mb-2">
                    <Globe size={15} className="text-purple-400" />
                    <span className="text-sm font-semibold theme-text-primary">Browser</span>
                </div>
                {TABS.map(tab => (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded text-xs font-medium transition-colors text-left ${activeTab === tab.id ? 'bg-purple-600/40 text-purple-300' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                        {tab.icon} {tab.label}
                    </button>
                ))}
            </div>
            <div className="flex-1 overflow-y-auto">
                {activeTab === 'passwords' && <PasswordsTab />}
                {activeTab === 'cookies' && <CookiesTab currentPath={currentPath} browserSessionMode={browserSessionMode} setBrowserSessionMode={setBrowserSessionMode} />}
                {activeTab === 'site-limits' && <SiteLimitsTab currentPath={currentPath} />}
                {activeTab === 'history' && <HistoryTab websitesSettings={websitesSettings} setWebsitesSettings={setWebsitesSettings} />}
                {activeTab === 'graph' && <BrowserHistoryWeb currentPath={currentPath} />}
            </div>
        </div>
    );
};

export default BrowserSettingsManager;
