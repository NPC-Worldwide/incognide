import React, { useState } from 'react';
import { Server, Key, Lock, X, Globe, Save, AlertCircle } from 'lucide-react';

interface RemoteConnectionDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (config: { id: string; host: string; port: number; username: string; privateKeyPath?: string }) => void;
    onTest: (config: any) => Promise<{ success: boolean; error?: string }>;
}

export const RemoteConnectionDialog: React.FC<RemoteConnectionDialogProps> = ({ isOpen, onClose, onSave, onTest }) => {
    if (!isOpen) return null;

    const [host, setHost] = useState('');
    const [port, setPort] = useState(22);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [privateKeyPath, setPrivateKeyPath] = useState('');
    const [passphrase, setPassphrase] = useState('');
    const [authMode, setAuthMode] = useState<'password' | 'key'>('password');
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
    const [saving, setSaving] = useState(false);

    const handleTest = async () => {
        setTesting(true);
        setTestResult(null);
        const result = await onTest({
            host, port, username,
            password: authMode === 'password' ? password : undefined,
            privateKeyPath: authMode === 'key' ? privateKeyPath : undefined,
            passphrase: authMode === 'key' ? passphrase : undefined,
        });
        setTestResult({
            success: result.success,
            message: result.success ? 'Connection successful' : (result.error || 'Connection failed'),
        });
        setTesting(false);
    };

    const handleSave = async () => {
        if (!host || !username) return;
        setSaving(true);
        const id = `ssh_${host}_${username}_${Date.now()}`;
        onSave({ id, host, port, username, privateKeyPath: authMode === 'key' ? privateKeyPath : undefined });
        setHost('');
        setPort(22);
        setUsername('');
        setPassword('');
        setPrivateKeyPath('');
        setPassphrase('');
        setAuthMode('password');
        setTestResult(null);
        setSaving(false);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-[#1a1b26] border border-[#313244] rounded-lg shadow-2xl w-[420px] max-w-[90vw]">
                <div className="flex items-center justify-between px-4 py-3 border-b border-[#313244]">
                    <div className="flex items-center gap-2">
                        <Server size={16} className="text-blue-400" />
                        <span className="text-sm font-medium text-[#cdd6f4]">New SSH Connection</span>
                    </div>
                    <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
                        <X size={16} />
                    </button>
                </div>

                <div className="p-4 space-y-3">
                    <div className="space-y-1">
                        <label className="text-[11px] text-gray-500 uppercase tracking-wider">Host</label>
                        <div className="flex items-center gap-2 bg-[#0f0f14] border border-[#313244] rounded px-2 py-1.5">
                            <Globe size={12} className="text-gray-500" />
                            <input
                                type="text"
                                value={host}
                                onChange={(e) => setHost(e.target.value)}
                                placeholder="192.168.1.100 or server.com"
                                className="flex-1 bg-transparent text-[13px] text-[#cdd6f4] outline-none placeholder-gray-600"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <label className="text-[11px] text-gray-500 uppercase tracking-wider">Port</label>
                            <input
                                type="number"
                                value={port}
                                onChange={(e) => setPort(parseInt(e.target.value) || 22)}
                                className="w-full bg-[#0f0f14] border border-[#313244] rounded px-2 py-1.5 text-[13px] text-[#cdd6f4] outline-none"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[11px] text-gray-500 uppercase tracking-wider">Username</label>
                            <input
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                placeholder="root"
                                className="w-full bg-[#0f0f14] border border-[#313244] rounded px-2 py-1.5 text-[13px] text-[#cdd6f4] outline-none placeholder-gray-600"
                            />
                        </div>
                    </div>

                    <div className="flex gap-2 pt-1">
                        <button
                            onClick={() => setAuthMode('password')}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded text-[11px] font-medium transition-colors ${
                                authMode === 'password'
                                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                    : 'bg-[#0f0f14] text-gray-500 border border-[#313244] hover:text-gray-400'
                            }`}
                        >
                            <Lock size={12} /> Password
                        </button>
                        <button
                            onClick={() => setAuthMode('key')}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded text-[11px] font-medium transition-colors ${
                                authMode === 'key'
                                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                    : 'bg-[#0f0f14] text-gray-500 border border-[#313244] hover:text-gray-400'
                            }`}
                        >
                            <Key size={12} /> SSH Key
                        </button>
                    </div>

                    {authMode === 'password' ? (
                        <div className="space-y-1">
                            <label className="text-[11px] text-gray-500 uppercase tracking-wider">Password</label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                className="w-full bg-[#0f0f14] border border-[#313244] rounded px-2 py-1.5 text-[13px] text-[#cdd6f4] outline-none placeholder-gray-600"
                            />
                        </div>
                    ) : (
                        <>
                            <div className="space-y-1">
                                <label className="text-[11px] text-gray-500 uppercase tracking-wider">Private Key Path</label>
                                <input
                                    type="text"
                                    value={privateKeyPath}
                                    onChange={(e) => setPrivateKeyPath(e.target.value)}
                                    placeholder="~/.ssh/id_rsa"
                                    className="w-full bg-[#0f0f14] border border-[#313244] rounded px-2 py-1.5 text-[13px] text-[#cdd6f4] outline-none placeholder-gray-600"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[11px] text-gray-500 uppercase tracking-wider">Key Passphrase (optional)</label>
                                <input
                                    type="password"
                                    value={passphrase}
                                    onChange={(e) => setPassphrase(e.target.value)}
                                    placeholder="••••••••"
                                    className="w-full bg-[#0f0f14] border border-[#313244] rounded px-2 py-1.5 text-[13px] text-[#cdd6f4] outline-none placeholder-gray-600"
                                />
                            </div>
                        </>
                    )}

                    {testResult && (
                        <div className={`flex items-center gap-2 text-[12px] px-2 py-1.5 rounded ${
                            testResult.success ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
                        }`}>
                            <AlertCircle size={12} />
                            {testResult.message}
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[#313244]">
                    <button
                        onClick={handleTest}
                        disabled={testing || !host || !username}
                        className="px-3 py-1.5 rounded text-[12px] font-medium text-gray-400 hover:text-white hover:bg-[#313244]/50 transition-colors disabled:opacity-40"
                    >
                        {testing ? 'Testing...' : 'Test Connection'}
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving || !host || !username}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30 text-[12px] font-medium hover:bg-blue-500/30 transition-colors disabled:opacity-40"
                    >
                        <Save size={12} />
                        {saving ? 'Saving...' : 'Save'}
                    </button>
                </div>
            </div>
        </div>
    );
};
