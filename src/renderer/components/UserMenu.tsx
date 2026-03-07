import React, { useState, useRef, useEffect } from 'react';
import { User, LogOut, LogIn, Settings, Cloud, Monitor, ChevronDown, Loader2, Crown, X, Eye, EyeOff, Edit2, Lock, Key } from 'lucide-react';
import { SignInButton, SignUpButton, useClerk } from '@clerk/clerk-react';
import { useAuth } from './AuthProvider';

interface UserMenuProps {
    onOpenSettings?: () => void;
    compact?: boolean;
}

const UserMenu: React.FC<UserMenuProps> = ({ onOpenSettings, compact = false }) => {
    const {
        user,
        device,
        isAuthenticated,
        isLoading,
        isEncryptionReady,
        hasPassphrase,
        needsPassphraseSetup,
        setupPassphrase,
        unlockWithPassphrase,
        signOut,
        error
    } = useAuth();
    const { openSignIn, openSignUp } = useClerk();

    const [isOpen, setIsOpen] = useState(false);
    const [showPassphraseModal, setShowPassphraseModal] = useState(false);
    const [isSettingUpPassphrase, setIsSettingUpPassphrase] = useState(false);
    const [showPassphrase, setShowPassphrase] = useState(false);
    const [editingDeviceName, setEditingDeviceName] = useState(false);

    const [passphrase, setPassphrase] = useState('');
    const [confirmPassphrase, setConfirmPassphrase] = useState('');
    const [deviceName, setDeviceName] = useState('');
    const [formError, setFormError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const menuRef = useRef<HTMLDivElement>(null);
    const modalRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (device?.deviceName) {
            setDeviceName(device.deviceName);
        }
    }, [device]);

    useEffect(() => {
        if (isAuthenticated && !isEncryptionReady && !showPassphraseModal) {

            const timer = setTimeout(() => {
                setShowPassphraseModal(true);
                setIsSettingUpPassphrase(needsPassphraseSetup);
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [isAuthenticated, isEncryptionReady, needsPassphraseSetup]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen]);

    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setIsOpen(false);

                if (isEncryptionReady) {
                    setShowPassphraseModal(false);
                }
            }
        };

        document.addEventListener('keydown', handleEscape);
        return () => {
            document.removeEventListener('keydown', handleEscape);
        };
    }, [isEncryptionReady]);

    const formatStorageUsed = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
        return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    };

    const handlePassphraseSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError(null);
        setSubmitting(true);

        try {
            let result;
            if (isSettingUpPassphrase) {

                if (passphrase !== confirmPassphrase) {
                    setFormError('Passphrases do not match');
                    setSubmitting(false);
                    return;
                }
                result = await setupPassphrase(passphrase);
            } else {

                result = await unlockWithPassphrase(passphrase);
            }

            if (result.success) {
                setShowPassphraseModal(false);
                setPassphrase('');
                setConfirmPassphrase('');
                setFormError(null);
            } else {
                setFormError(result.error || 'Failed');
            }
        } catch (err: any) {
            setFormError(err.message || 'An error occurred');
        } finally {
            setSubmitting(false);
        }
    };

    const handleUpdateDeviceName = async () => {
        if (deviceName && deviceName !== device?.deviceName) {
            await (window as any).api?.setDeviceName?.(deviceName);
        }
        setEditingDeviceName(false);
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-2">
                <Loader2 size={16} className="animate-spin text-gray-400" />
            </div>
        );
    }

    const passphraseModalContent = showPassphraseModal && isAuthenticated && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => isEncryptionReady && setShowPassphraseModal(false)}>
            <div
                ref={modalRef}
                className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
                    <div className="flex items-center gap-2">
                        <Lock size={20} className="text-blue-400" />
                        <h2 className="text-lg font-semibold text-white">
                            {isSettingUpPassphrase ? 'Set Up Encryption' : 'Unlock Your Data'}
                        </h2>
                    </div>
                    {isEncryptionReady && (
                        <button
                            onClick={() => setShowPassphraseModal(false)}
                            className="p-1 hover:bg-gray-700 rounded-lg transition-colors"
                        >
                            <X size={20} className="text-gray-400" />
                        </button>
                    )}
                </div>

                <form onSubmit={handlePassphraseSubmit} className="p-6 space-y-4" onMouseDown={e => e.stopPropagation()}>
                    <p className="text-sm text-gray-400">
                        {isSettingUpPassphrase
                            ? 'Create a passphrase to encrypt your synced data. This passphrase is never sent to our servers - only you can decrypt your data.'
                            : 'Enter your passphrase to unlock and sync your encrypted data.'
                        }
                    </p>

                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">
                            {isSettingUpPassphrase ? 'Encryption Passphrase' : 'Passphrase'}
                        </label>
                        <div className="relative">
                            <input
                                type={showPassphrase ? 'text' : 'password'}
                                value={passphrase}
                                onChange={e => setPassphrase(e.target.value)}
                                onMouseDown={e => e.stopPropagation()}
                                placeholder={isSettingUpPassphrase ? 'At least 8 characters' : 'Enter your passphrase'}
                                className="w-full px-3 py-2 pr-10 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
                                required
                                minLength={8}
                                autoFocus
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassphrase(!showPassphrase)}
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-white"
                            >
                                {showPassphrase ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                    </div>

                    {isSettingUpPassphrase && (
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">
                                Confirm Passphrase
                            </label>
                            <input
                                type={showPassphrase ? 'text' : 'password'}
                                value={confirmPassphrase}
                                onChange={e => setConfirmPassphrase(e.target.value)}
                                onMouseDown={e => e.stopPropagation()}
                                placeholder="Confirm your passphrase"
                                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
                                required
                            />
                        </div>
                    )}

                    {isSettingUpPassphrase && (
                        <div className="px-3 py-2 bg-yellow-900/30 border border-yellow-700/50 rounded-lg text-sm text-yellow-400">
                            <strong>Important:</strong> If you forget this passphrase, your synced data cannot be recovered. Store it safely!
                        </div>
                    )}

                    {formError && (
                        <div className="px-3 py-2 bg-red-900/50 border border-red-700 rounded-lg text-sm text-red-400">
                            {formError}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={submitting}
                        className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                        {submitting ? (
                            <>
                                <Loader2 size={18} className="animate-spin" />
                                {isSettingUpPassphrase ? 'Setting up...' : 'Unlocking...'}
                            </>
                        ) : (
                            <>
                                <Key size={18} />
                                {isSettingUpPassphrase ? 'Set Up Encryption' : 'Unlock'}
                            </>
                        )}
                    </button>

                    {!isEncryptionReady && (
                        <p className="text-xs text-center text-gray-500">
                            You can skip this for now, but sync won't work without encryption.
                            <button
                                type="button"
                                onClick={() => setShowPassphraseModal(false)}
                                className="ml-1 text-gray-400 hover:text-white underline"
                            >
                                Skip
                            </button>
                        </p>
                    )}
                </form>
            </div>
        </div>
    );

    if (!isAuthenticated) {
        return (
            <>
                <div className="flex flex-col gap-2 w-full">
                    <button
                        onClick={() => openSignIn()}
                        className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                    >
                        <LogIn size={16} />
                        <span className="text-sm font-medium">Sign In</span>
                    </button>
                    <button
                        onClick={() => openSignUp()}
                        className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-lg border border-gray-600 hover:bg-gray-700/50 text-gray-300 transition-colors"
                    >
                        <User size={16} />
                        <span className="text-sm font-medium">Create Account</span>
                    </button>
                </div>
            </>
        );
    }

    return (
        <div ref={menuRef} className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`flex items-center gap-2 w-full px-2 py-1.5 rounded-lg hover:bg-gray-700/50 transition-colors ${compact ? '' : 'pr-3'}`}
            >
                {user?.profilePicture ? (
                    <img
                        src={user.profilePicture}
                        alt={user.name}
                        className="w-6 h-6 rounded-full object-cover"
                    />
                ) : (
                    <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center">
                        <User size={14} className="text-white" />
                    </div>
                )}
                {!compact && (
                    <>
                        <div className="flex-1 text-left min-w-0">
                            <div className="text-sm font-medium text-white truncate">
                                {user?.name || 'User'}
                            </div>
                            <div className="text-xs text-gray-400 truncate">
                                {device?.deviceName || 'This device'}
                            </div>
                        </div>
                        {!isEncryptionReady && (
                            <Lock size={14} className="text-yellow-400" title="Encryption not set up" />
                        )}
                        <ChevronDown size={14} className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </>
                )}
            </button>

            {isOpen && (
                <div className="absolute bottom-full left-0 right-0 mb-1 bg-gray-800 border border-gray-700 rounded-lg shadow-lg overflow-hidden z-50">
                    <div className="px-3 py-2 border-b border-gray-700">
                        <div className="flex items-center gap-2">
                            {user?.profilePicture ? (
                                <img
                                    src={user.profilePicture}
                                    alt={user.name}
                                    className="w-8 h-8 rounded-full object-cover"
                                />
                            ) : (
                                <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
                                    <User size={16} className="text-white" />
                                </div>
                            )}
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-white truncate">
                                    {user?.name}
                                </div>
                                <div className="text-xs text-gray-400 truncate">
                                    {user?.email}
                                </div>
                            </div>
                            {user?.isPremium && (
                                <Crown size={14} className="text-yellow-400" title="Premium" />
                            )}
                        </div>
                    </div>

                    <div className="px-3 py-2 border-b border-gray-700">
                        {isEncryptionReady ? (
                            <>
                                <div className="flex items-center gap-2 text-xs">
                                    <Cloud size={14} className="text-green-400" />
                                    <span className="text-gray-300">Sync enabled</span>
                                </div>
                                <div className="mt-1 text-xs text-gray-400">
                                    Storage: {formatStorageUsed(user?.storageUsedBytes || 0)} / {formatStorageUsed(user?.storageLimitBytes || 209715200)}
                                </div>
                            </>
                        ) : (
                            <button
                                onClick={() => {
                                    setIsOpen(false);
                                    setShowPassphraseModal(true);
                                    setIsSettingUpPassphrase(needsPassphraseSetup);
                                }}
                                className="flex items-center gap-2 text-xs text-yellow-400 hover:text-yellow-300"
                            >
                                <Lock size={14} />
                                <span>{needsPassphraseSetup ? 'Set up encryption to sync' : 'Unlock to sync'}</span>
                            </button>
                        )}
                    </div>

                    <div className="px-3 py-2 border-b border-gray-700">
                        {editingDeviceName ? (
                            <div className="flex items-center gap-2">
                                <Monitor size={14} className="text-gray-400 flex-shrink-0" />
                                <input
                                    type="text"
                                    value={deviceName}
                                    onChange={e => setDeviceName(e.target.value)}
                                    onBlur={handleUpdateDeviceName}
                                    onKeyDown={e => e.key === 'Enter' && handleUpdateDeviceName()}
                                    autoFocus
                                    className="flex-1 text-xs bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white focus:outline-none focus:border-blue-500"
                                />
                            </div>
                        ) : (
                            <div
                                className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer hover:text-gray-300"
                                onClick={() => setEditingDeviceName(true)}
                            >
                                <Monitor size={14} />
                                <span className="truncate flex-1">{device?.deviceName}</span>
                                <Edit2 size={12} className="opacity-50" />
                            </div>
                        )}
                    </div>

                    <div className="py-1">
                        {onOpenSettings && (
                            <button
                                onClick={() => {
                                    setIsOpen(false);
                                    onOpenSettings();
                                }}
                                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-300 hover:bg-gray-700/50"
                            >
                                <Settings size={14} />
                                Settings
                            </button>
                        )}
                        {isEncryptionReady && (
                            <button
                                onClick={() => {
                                    setIsOpen(false);
                                    setShowPassphraseModal(true);
                                    setIsSettingUpPassphrase(false);
                                }}
                                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-300 hover:bg-gray-700/50"
                            >
                                <Key size={14} />
                                Change Passphrase
                            </button>
                        )}
                        <button
                            onClick={() => {
                                setIsOpen(false);
                                signOut();
                            }}
                            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-400 hover:bg-gray-700/50"
                        >
                            <LogOut size={14} />
                            Sign Out
                        </button>
                    </div>
                </div>
            )}

            {error && (
                <div className="mt-1 px-2 py-1 bg-red-900/50 border border-red-700 rounded text-xs text-red-400">
                    {error}
                </div>
            )}

            {passphraseModalContent}
        </div>
    );
};

export default UserMenu;
