import React, { useState } from 'react';
import {
    User, LogIn, LogOut, Crown, Cloud, CloudOff, RefreshCw,
    CreditCard, Shield, CheckCircle, Key, Lock, Unlock
} from 'lucide-react';
import { useAuth } from './AuthProvider';
import { useSync } from '../hooks/useSync';

interface AccountPaneProps {
    nodeId: string;
}

const AccountPane: React.FC<AccountPaneProps> = ({ nodeId }) => {
    const auth = useAuth();
    const { syncStatus, lastSyncTime, pendingChanges, triggerSync, syncFrequency, setSyncFrequency, lastSyncStats, syncProgress } = useSync();
    const [passphrase, setPassphrase] = useState('');
    const [passphraseError, setPassphraseError] = useState('');
    const [settingUp, setSettingUp] = useState(false);

    const handleSetupPassphrase = async () => {
        setSettingUp(true);
        setPassphraseError('');
        const result = await auth.setupPassphrase(passphrase);
        if (!result.success) setPassphraseError(result.error || 'Failed');
        else setPassphrase('');
        setSettingUp(false);
    };

    const handleUnlock = async () => {
        setSettingUp(true);
        setPassphraseError('');
        const result = await auth.unlockWithPassphrase(passphrase);
        if (!result.success) setPassphraseError(result.error || 'Invalid passphrase');
        else setPassphrase('');
        setSettingUp(false);
    };

    return (
        <div className="h-full overflow-y-auto theme-bg-primary theme-text-primary">
            <div className="max-w-2xl mx-auto p-6 space-y-6">
                <div className="flex items-center gap-3 pb-4 border-b theme-border">
                    <User size={24} className="text-blue-400" />
                    <div>
                        <h1 className="text-xl font-semibold">Account</h1>
                        <p className="text-sm theme-text-muted">Profile, encryption, subscription, and sync</p>
                    </div>
                </div>

                {/* Profile */}
                <div className="theme-bg-secondary rounded-xl border theme-border overflow-hidden">
                    <div className="px-5 py-4 border-b theme-border">
                        <h2 className="text-sm font-medium theme-text-muted uppercase tracking-wide">Profile</h2>
                    </div>
                    <div className="p-5">
                        <div className="flex items-start gap-4">
                            <div className="flex-shrink-0">
                                {auth.user?.profilePicture ? (
                                    <img src={auth.user.profilePicture} alt="" className="w-16 h-16 rounded-full object-cover border-2 border-blue-500/50" />
                                ) : (
                                    <div className="w-16 h-16 rounded-full bg-blue-600/30 border-2 border-blue-500/50 flex items-center justify-center">
                                        <User size={28} className="text-blue-400" />
                                    </div>
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <h3 className="text-lg font-medium truncate">{auth.user?.name || 'Not signed in'}</h3>
                                    {auth.user?.isPremium && <Crown size={16} className="text-yellow-400 flex-shrink-0" />}
                                </div>
                                {auth.user?.email && <p className="text-sm theme-text-muted truncate mt-0.5">{auth.user.email}</p>}
                                {auth.user && (
                                    <p className="text-xs theme-text-muted mt-1">
                                        Storage: {(auth.user.storageUsedBytes / 1024 / 1024).toFixed(1)}MB / {(auth.user.storageLimitBytes / 1024 / 1024).toFixed(0)}MB
                                    </p>
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
                        {auth.isAuthenticated ? (
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <CheckCircle size={18} className="text-green-400" />
                                    <div>
                                        <p className="text-sm">Signed in via Clerk</p>
                                        <p className="text-xs theme-text-muted">{auth.user?.email}</p>
                                    </div>
                                </div>
                                <button onClick={() => auth.signOut()} className="flex items-center gap-2 px-4 py-2 text-sm bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-700/50 rounded-lg transition-colors">
                                    <LogOut size={14} /> Sign Out
                                </button>
                            </div>
                        ) : (
                            <div className="text-center py-4">
                                {auth.error ? (
                                    <>
                                        <div className="w-12 h-12 rounded-full bg-red-600/20 flex items-center justify-center mx-auto mb-3">
                                            <Shield size={24} className="text-red-400" />
                                        </div>
                                        <p className="text-sm mb-1 text-red-400">Authentication unavailable</p>
                                        <p className="text-xs text-red-400/70 mb-4 px-2">{auth.error}</p>
                                    </>
                                ) : (
                                    <>
                                        <div className="w-12 h-12 rounded-full theme-bg-tertiary flex items-center justify-center mx-auto mb-3">
                                            <Shield size={24} className="theme-text-muted" />
                                        </div>
                                        <p className="text-sm mb-1">Not signed in</p>
                                        <p className="text-xs theme-text-muted mb-4">Sign in to encrypt and sync your data across devices.</p>
                                        <button onClick={() => auth.openSignIn()} className="inline-flex items-center gap-2 px-5 py-2.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium">
                                            <LogIn size={16} /> Sign In
                                        </button>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Encryption */}
                {auth.isAuthenticated && (
                    <div className="theme-bg-secondary rounded-xl border theme-border overflow-hidden">
                        <div className="px-5 py-4 border-b theme-border">
                            <h2 className="text-sm font-medium theme-text-muted uppercase tracking-wide">End-to-End Encryption</h2>
                        </div>
                        <div className="p-5 space-y-4">
                            <p className="text-xs theme-text-muted">
                                Your data is encrypted locally with a passphrase before syncing. We never see your content.
                            </p>
                            {auth.isEncryptionReady ? (
                                <div className="flex items-center gap-3">
                                    <Unlock size={18} className="text-green-400" />
                                    <div>
                                        <p className="text-sm text-green-400">Encryption unlocked</p>
                                        <p className="text-xs theme-text-muted">Your data is encrypted with AES-256-GCM</p>
                                    </div>
                                </div>
                            ) : auth.needsPassphraseSetup ? (
                                <div className="space-y-3">
                                    <div className="flex items-center gap-2 text-amber-400">
                                        <Key size={16} />
                                        <span className="text-sm">Set up your encryption passphrase</span>
                                    </div>
                                    <input
                                        type="password"
                                        value={passphrase}
                                        onChange={e => setPassphrase(e.target.value)}
                                        placeholder="Choose a strong passphrase (8+ chars)"
                                        className="w-full px-3 py-2 text-sm theme-bg-tertiary border theme-border rounded-lg theme-text-primary"
                                        onKeyDown={e => e.key === 'Enter' && handleSetupPassphrase()}
                                    />
                                    {passphraseError && <p className="text-xs text-red-400">{passphraseError}</p>}
                                    <button onClick={handleSetupPassphrase} disabled={settingUp || passphrase.length < 8} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50">
                                        {settingUp ? 'Setting up...' : 'Set Passphrase'}
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <div className="flex items-center gap-2 text-amber-400">
                                        <Lock size={16} />
                                        <span className="text-sm">Enter your passphrase to unlock</span>
                                    </div>
                                    <input
                                        type="password"
                                        value={passphrase}
                                        onChange={e => setPassphrase(e.target.value)}
                                        placeholder="Your encryption passphrase"
                                        className="w-full px-3 py-2 text-sm theme-bg-tertiary border theme-border rounded-lg theme-text-primary"
                                        onKeyDown={e => e.key === 'Enter' && handleUnlock()}
                                    />
                                    {passphraseError && <p className="text-xs text-red-400">{passphraseError}</p>}
                                    <button onClick={handleUnlock} disabled={settingUp || !passphrase} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50">
                                        {settingUp ? 'Unlocking...' : 'Unlock'}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Subscription */}
                <div className="theme-bg-secondary rounded-xl border theme-border overflow-hidden">
                    <div className="px-5 py-4 border-b theme-border">
                        <h2 className="text-sm font-medium theme-text-muted uppercase tracking-wide">Subscription</h2>
                    </div>
                    <div className="p-5">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${auth.user?.isPremium ? 'bg-yellow-500/20' : 'theme-bg-tertiary'}`}>
                                    {auth.user?.isPremium ? <Crown size={20} className="text-yellow-400" /> : <User size={20} className="theme-text-muted" />}
                                </div>
                                <div>
                                    <p className="text-sm font-medium">{auth.user?.isPremium ? 'Pro' : 'Free'} Plan</p>
                                    <p className="text-xs theme-text-muted">{auth.user?.isPremium ? 'Full access, 10GB sync storage' : '200MB sync storage'}</p>
                                </div>
                            </div>
                            <button
                                onClick={() => auth.openUserProfile()}
                                className="flex items-center gap-2 px-4 py-2 text-sm theme-bg-tertiary hover:bg-white/10 rounded-lg transition-colors"
                            >
                                <CreditCard size={14} /> {auth.user?.isPremium ? 'Manage' : 'Upgrade'}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Sync Status */}
                {auth.isAuthenticated && (
                    <div className="theme-bg-secondary rounded-xl border theme-border overflow-hidden">
                        <div className="px-5 py-4 border-b theme-border">
                            <h2 className="text-sm font-medium theme-text-muted uppercase tracking-wide">Sync</h2>
                        </div>
                        <div className="p-5 space-y-3">
                            <div className="flex items-center gap-3">
                                {auth.isEncryptionReady ? <Cloud size={18} className="text-blue-400" /> : <CloudOff size={18} className="theme-text-muted" />}
                                <div className="flex-1">
                                    <p className="text-sm">
                                        {syncStatus === 'syncing' ? `Syncing... ${syncProgress}%` :
                                         syncStatus === 'synced' ? 'Synced' :
                                         syncStatus === 'error' ? 'Sync error' :
                                         syncStatus === 'pending' ? `${pendingChanges} pending` :
                                         auth.isEncryptionReady ? 'Sync enabled' : 'Unlock encryption to sync'}
                                    </p>
                                    <p className="text-xs theme-text-muted">
                                        {lastSyncTime ? `Last synced ${lastSyncTime.toLocaleString()}` : 'Conversations, bookmarks, history, and memories'}
                                    </p>
                                </div>
                            </div>

                            {/* Progress bar */}
                            {syncStatus === 'syncing' && (
                                <div className="w-full h-1.5 theme-bg-tertiary rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-blue-500 transition-all duration-300"
                                        style={{ width: `${syncProgress}%` }}
                                    />
                                </div>
                            )}

                            {/* Last sync stats */}
                            {lastSyncStats && syncStatus === 'synced' && (
                                <div className="text-xs theme-text-muted flex items-center gap-3">
                                    <span>Pushed {lastSyncStats.pushed}</span>
                                    <span>Pulled {lastSyncStats.pulled}</span>
                                    <span>{(lastSyncStats.durationMs / 1000).toFixed(1)}s</span>
                                </div>
                            )}

                            {auth.device && (
                                <div className="text-xs theme-text-muted border-t theme-border pt-3">
                                    Device: {auth.device.deviceName} ({auth.device.deviceType})
                                </div>
                            )}
                            {auth.isEncryptionReady && (
                                <div className="flex items-center gap-3 border-t theme-border pt-3">
                                    <button
                                        onClick={() => triggerSync()}
                                        disabled={syncStatus === 'syncing'}
                                        className={`flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 ${syncStatus === 'syncing' ? 'opacity-50' : ''}`}
                                    >
                                        <RefreshCw size={12} className={syncStatus === 'syncing' ? 'animate-spin' : ''} /> Sync Now
                                    </button>
                                    <select
                                        value={syncFrequency}
                                        onChange={(e) => setSyncFrequency(e.target.value as any)}
                                        className="text-xs theme-bg-tertiary theme-text-primary rounded px-2 py-1 border theme-border"
                                    >
                                        <option value="1m">Every 1m</option>
                                        <option value="10m">Every 10m</option>
                                        <option value="30m">Every 30m</option>
                                        <option value="1h">Every 1h</option>
                                        <option value="24h">Every 24h</option>
                                        <option value="manual">Manual only</option>
                                    </select>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {auth.error && (
                    <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                        {auth.error}
                    </div>
                )}
            </div>
        </div>
    );
};

export default AccountPane;
