import React, { useState, useEffect, useCallback } from 'react';
import {
    User, LogIn, LogOut, Crown, Cloud, CloudOff, RefreshCw,
    CreditCard, Shield, CheckCircle
} from 'lucide-react';

interface AccountPaneProps {
    nodeId: string;
}

const PROFILE_KEY = 'incognide_userProfile';
const SYNC_ENABLED_KEY = 'incognide_dataSyncEnabled';
const LAST_SYNC_KEY = 'incognide_lastSyncTimestamp';
const TIER_KEY = 'incognide_tier';

const AccountPane: React.FC<AccountPaneProps> = ({ nodeId }) => {
    const [profile, setProfile] = useState<{ name: string; email: string } | null>(() => {
        try { const s = localStorage.getItem(PROFILE_KEY); return s ? JSON.parse(s) : null; } catch { return null; }
    });
    const [dataSyncEnabled, setDataSyncEnabled] = useState(() => localStorage.getItem(SYNC_ENABLED_KEY) === 'true');
    const [lastSync, setLastSync] = useState(() => localStorage.getItem(LAST_SYNC_KEY) || '');
    const [tier, setTier] = useState(() => localStorage.getItem(TIER_KEY) || 'free');
    const [editingProfile, setEditingProfile] = useState(false);
    const [editName, setEditName] = useState('');
    const [editEmail, setEditEmail] = useState('');

    const isPremium = tier === 'pro';

    useEffect(() => { localStorage.setItem(SYNC_ENABLED_KEY, String(dataSyncEnabled)); }, [dataSyncEnabled]);

    const handleSaveProfile = useCallback(() => {
        const updated = { name: editName, email: editEmail };
        setProfile(updated);
        localStorage.setItem(PROFILE_KEY, JSON.stringify(updated));
        setEditingProfile(false);
    }, [editName, editEmail]);

    const handleStartEdit = useCallback(() => {
        setEditName(profile?.name || '');
        setEditEmail(profile?.email || '');
        setEditingProfile(true);
    }, [profile]);

    const handleSignIn = () => {
        // Clerk auth integration point
        if ((window as any).__clerk_sign_in) {
            (window as any).__clerk_sign_in();
        }
    };

    const handleSignOut = () => {
        setProfile(null);
        localStorage.removeItem(PROFILE_KEY);
        localStorage.removeItem(TIER_KEY);
        localStorage.removeItem(LAST_SYNC_KEY);
        setTier('free');
        setLastSync('');
    };

    const formatTimestamp = (ts: string) => {
        if (!ts) return 'Never';
        try {
            const date = new Date(ts);
            const diff = Date.now() - date.getTime();
            if (diff < 60000) return 'Just now';
            if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
            if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
            return date.toLocaleString();
        } catch { return 'Unknown'; }
    };

    return (
        <div className="h-full overflow-y-auto theme-bg-primary theme-text-primary">
            <div className="max-w-2xl mx-auto p-6 space-y-6">
                <div className="flex items-center gap-3 pb-4 border-b theme-border">
                    <User size={24} className="text-blue-400" />
                    <div>
                        <h1 className="text-xl font-semibold">Account</h1>
                        <p className="text-sm theme-text-muted">Manage your profile, subscription, and sync settings</p>
                    </div>
                </div>

                {/* Profile */}
                <div className="theme-bg-secondary rounded-xl border theme-border overflow-hidden">
                    <div className="px-5 py-4 border-b theme-border">
                        <h2 className="text-sm font-medium theme-text-muted uppercase tracking-wide">Profile</h2>
                    </div>
                    <div className="p-5">
                        <div className="flex items-start gap-4">
                            <div className="w-16 h-16 rounded-full bg-blue-600/30 border-2 border-blue-500/50 flex items-center justify-center flex-shrink-0">
                                <User size={28} className="text-blue-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                                {editingProfile ? (
                                    <div className="space-y-3">
                                        <div>
                                            <label className="block text-xs theme-text-muted mb-1">Name</label>
                                            <input type="text" value={editName} onChange={e => setEditName(e.target.value)} className="w-full px-3 py-1.5 text-sm theme-bg-tertiary border theme-border rounded-lg theme-text-primary focus:outline-none focus:border-blue-500" placeholder="Your name" />
                                        </div>
                                        <div>
                                            <label className="block text-xs theme-text-muted mb-1">Email</label>
                                            <input type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)} className="w-full px-3 py-1.5 text-sm theme-bg-tertiary border theme-border rounded-lg theme-text-primary focus:outline-none focus:border-blue-500" placeholder="your@email.com" />
                                        </div>
                                        <div className="flex gap-2">
                                            <button onClick={handleSaveProfile} className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">Save</button>
                                            <button onClick={() => setEditingProfile(false)} className="px-3 py-1.5 text-xs theme-bg-tertiary hover:bg-white/10 theme-text-muted rounded-lg transition-colors">Cancel</button>
                                        </div>
                                    </div>
                                ) : (
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h3 className="text-lg font-medium truncate">{profile?.name || 'Not signed in'}</h3>
                                            {isPremium && <Crown size={16} className="text-yellow-400 flex-shrink-0" />}
                                        </div>
                                        {profile?.email && <p className="text-sm theme-text-muted truncate mt-0.5">{profile.email}</p>}
                                        {!profile && <button onClick={handleStartEdit} className="mt-2 text-xs text-blue-400 hover:text-blue-300">Edit profile</button>}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Auth */}
                <div className="theme-bg-secondary rounded-xl border theme-border overflow-hidden">
                    <div className="px-5 py-4 border-b theme-border">
                        <h2 className="text-sm font-medium theme-text-muted uppercase tracking-wide">Authentication</h2>
                    </div>
                    <div className="p-5">
                        {profile ? (
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <CheckCircle size={18} className="text-green-400" />
                                    <div>
                                        <p className="text-sm">Signed in</p>
                                        <p className="text-xs theme-text-muted">{profile.email}</p>
                                    </div>
                                </div>
                                <button onClick={handleSignOut} className="flex items-center gap-2 px-4 py-2 text-sm bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-700/50 rounded-lg transition-colors">
                                    <LogOut size={14} /> Sign Out
                                </button>
                            </div>
                        ) : (
                            <div className="text-center py-4">
                                <div className="w-12 h-12 rounded-full theme-bg-tertiary flex items-center justify-center mx-auto mb-3">
                                    <Shield size={24} className="theme-text-muted" />
                                </div>
                                <p className="text-sm mb-1">Not signed in</p>
                                <p className="text-xs theme-text-muted mb-4">Sign in to sync your data across devices and access premium features.</p>
                                <button onClick={handleSignIn} className="inline-flex items-center gap-2 px-5 py-2.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium">
                                    <LogIn size={16} /> Sign In
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Subscription */}
                <div className="theme-bg-secondary rounded-xl border theme-border overflow-hidden">
                    <div className="px-5 py-4 border-b theme-border">
                        <h2 className="text-sm font-medium theme-text-muted uppercase tracking-wide">Subscription</h2>
                    </div>
                    <div className="p-5">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isPremium ? 'bg-yellow-500/20' : 'theme-bg-tertiary'}`}>
                                    {isPremium ? <Crown size={20} className="text-yellow-400" /> : <User size={20} className="theme-text-muted" />}
                                </div>
                                <div>
                                    <p className="text-sm font-medium capitalize">{tier} Plan</p>
                                    <p className="text-xs theme-text-muted">{isPremium ? 'Full access to all features' : 'Basic features included'}</p>
                                </div>
                            </div>
                            <button className="flex items-center gap-2 px-4 py-2 text-sm theme-bg-tertiary hover:bg-white/10 rounded-lg transition-colors">
                                <CreditCard size={14} /> {isPremium ? 'Manage' : 'Upgrade to Pro'}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Sync */}
                <div className="theme-bg-secondary rounded-xl border theme-border overflow-hidden">
                    <div className="px-5 py-4 border-b theme-border">
                        <h2 className="text-sm font-medium theme-text-muted uppercase tracking-wide">Data Sync</h2>
                    </div>
                    <div className="p-5 space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                {dataSyncEnabled ? <Cloud size={18} className="text-blue-400" /> : <CloudOff size={18} className="theme-text-muted" />}
                                <div>
                                    <p className="text-sm">Cloud Sync</p>
                                    <p className="text-xs theme-text-muted">{dataSyncEnabled ? 'Syncing conversations and settings' : 'Sync is disabled'}</p>
                                </div>
                            </div>
                            <div onClick={() => setDataSyncEnabled(!dataSyncEnabled)} className={`relative w-11 h-6 rounded-full cursor-pointer transition-colors ${dataSyncEnabled ? 'bg-blue-500' : 'bg-gray-600'}`}>
                                <div className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${dataSyncEnabled ? 'translate-x-5' : ''}`} />
                            </div>
                        </div>
                        {dataSyncEnabled && (
                            <div className="flex items-center justify-between text-xs theme-text-muted border-t theme-border pt-3">
                                <span>Last synced: {formatTimestamp(lastSync)}</span>
                                <button className="flex items-center gap-1 text-blue-400 hover:text-blue-300"><RefreshCw size={12} /> Sync Now</button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AccountPane;
