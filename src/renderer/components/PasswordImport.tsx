import React, { useState, useCallback, useRef } from 'react';
import {
    Upload,
    FileText,
    Key,
    Shield,
    AlertCircle,
    CheckCircle,
    X,
    ChevronDown,
    Eye,
    EyeOff,
    Loader2,
    Download,
    Trash2
} from 'lucide-react';
import {
    importPasswords,
    detectFormat,
    getPasswordManagerDisplayName,
    PasswordEntry,
    PasswordManagerType,
    exportPasswordsToCSV
} from '../utils/passwordImport';

interface PasswordImportProps {
    isOpen: boolean;
    onClose: () => void;
    onImport: (passwords: PasswordEntry[]) => void;
}

const SUPPORTED_FORMATS: { type: PasswordManagerType; name: string; icon: string }[] = [
    { type: 'bitwarden-json', name: 'Bitwarden (JSON)', icon: 'B' },
    { type: 'bitwarden-csv', name: 'Bitwarden (CSV)', icon: 'B' },
    { type: 'lastpass-csv', name: 'LastPass', icon: 'L' },
    { type: 'chrome-csv', name: 'Chrome / Vivaldi / Edge / Brave', icon: 'C' },
    { type: 'firefox-csv', name: 'Firefox', icon: 'F' },
    { type: 'apple-csv', name: 'Apple Passwords / iCloud Keychain', icon: 'A' },
    { type: '1password-csv', name: '1Password', icon: '1' },
    { type: 'dashlane-csv', name: 'Dashlane', icon: 'D' },
    { type: 'keepass-csv', name: 'KeePass', icon: 'K' },
    { type: 'generic-csv', name: 'Generic CSV', icon: 'G' },
];

const PasswordImport: React.FC<PasswordImportProps> = ({ isOpen, onClose, onImport }) => {
    const [step, setStep] = useState<'select' | 'preview' | 'complete'>('select');
    const [selectedFormat, setSelectedFormat] = useState<PasswordManagerType | null>(null);
    const [detectedFormat, setDetectedFormat] = useState<PasswordManagerType | null>(null);
    const [showFormatDropdown, setShowFormatDropdown] = useState(false);
    const [fileName, setFileName] = useState<string>('');
    const [fileContent, setFileContent] = useState<string>('');
    const [parsedEntries, setParsedEntries] = useState<PasswordEntry[]>([]);
    const [errors, setErrors] = useState<string[]>([]);
    const [skipped, setSkipped] = useState(0);
    const [isProcessing, setIsProcessing] = useState(false);
    const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
    const [isDragging, setIsDragging] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const resetState = useCallback(() => {
        setStep('select');
        setSelectedFormat(null);
        setDetectedFormat(null);
        setFileName('');
        setFileContent('');
        setParsedEntries([]);
        setErrors([]);
        setSkipped(0);
        setShowPasswords({});
    }, []);

    const handleClose = useCallback(() => {
        resetState();
        onClose();
    }, [resetState, onClose]);

    const processFile = useCallback((content: string, name: string) => {
        setIsProcessing(true);
        setFileName(name);
        setFileContent(content);

        const detected = detectFormat(content, name);
        setDetectedFormat(detected);
        setSelectedFormat(detected);

        if (detected) {
            const result = importPasswords(content, detected);
            setParsedEntries(result.entries);
            setErrors(result.errors);
            setSkipped(result.skipped);
            setStep('preview');
        }

        setIsProcessing(false);
    }, []);

    const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const content = event.target?.result as string;
            processFile(content, file.name);
        };
        reader.readAsText(file);
    }, [processFile]);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);

        const file = e.dataTransfer.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const content = event.target?.result as string;
            processFile(content, file.name);
        };
        reader.readAsText(file);
    }, [processFile]);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    }, []);

    const handleFormatChange = useCallback((format: PasswordManagerType) => {
        setSelectedFormat(format);
        setShowFormatDropdown(false);

        if (fileContent) {
            const result = importPasswords(fileContent, format);
            setParsedEntries(result.entries);
            setErrors(result.errors);
            setSkipped(result.skipped);
        }
    }, [fileContent]);

    const handleImport = useCallback(() => {
        onImport(parsedEntries);
        setStep('complete');
    }, [parsedEntries, onImport]);

    const togglePasswordVisibility = useCallback((id: string) => {
        setShowPasswords(prev => ({ ...prev, [id]: !prev[id] }));
    }, []);

    const removeEntry = useCallback((id: string) => {
        setParsedEntries(prev => prev.filter(e => e.id !== id));
    }, []);

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
            onClick={handleClose}
        >
            <div
                className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                            <Key size={20} className="text-white" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-white">Import Passwords</h2>
                            <p className="text-sm text-gray-400">
                                {step === 'select' && 'Select a file to import'}
                                {step === 'preview' && `${parsedEntries.length} passwords ready to import`}
                                {step === 'complete' && 'Import complete'}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={handleClose}
                        className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
                    >
                        <X size={20} className="text-gray-400" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                    {step === 'select' && (
                        <div className="space-y-6">
                            <div
                                onDrop={handleDrop}
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onClick={() => fileInputRef.current?.click()}
                                className={`
                                    border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
                                    ${isDragging
                                        ? 'border-blue-500 bg-blue-500/10'
                                        : 'border-gray-600 hover:border-gray-500 hover:bg-gray-700/30'
                                    }
                                `}
                            >
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".csv,.json,.txt"
                                    onChange={handleFileSelect}
                                    className="hidden"
                                />
                                <Upload size={40} className={`mx-auto mb-4 ${isDragging ? 'text-blue-400' : 'text-gray-500'}`} />
                                <p className="text-lg font-medium text-white mb-1">
                                    {isDragging ? 'Drop file here' : 'Drop your export file here'}
                                </p>
                                <p className="text-sm text-gray-400">
                                    or click to browse (CSV, JSON)
                                </p>
                            </div>

                            <div>
                                <h3 className="text-sm font-medium text-gray-300 mb-3">Supported Password Managers</h3>
                                <div className="grid grid-cols-2 gap-2">
                                    {SUPPORTED_FORMATS.slice(0, -1).map(format => (
                                        <div
                                            key={format.type}
                                            className="flex items-center gap-2 px-3 py-2 bg-gray-700/50 rounded-lg"
                                        >
                                            <div className="w-6 h-6 rounded bg-gray-600 flex items-center justify-center text-xs font-bold text-gray-300">
                                                {format.icon}
                                            </div>
                                            <span className="text-sm text-gray-300">{format.name}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="bg-blue-900/20 border border-blue-800/50 rounded-lg p-4">
                                <div className="flex gap-3">
                                    <Shield size={20} className="text-blue-400 flex-shrink-0 mt-0.5" />
                                    <div className="text-sm">
                                        <p className="text-blue-300 font-medium mb-1">How to export from your password manager:</p>
                                        <ul className="text-blue-200/80 space-y-1 list-disc list-inside">
                                            <li><strong>Bitwarden:</strong> Settings &rarr; Export vault &rarr; JSON/CSV</li>
                                            <li><strong>LastPass:</strong> Account Options &rarr; Advanced &rarr; Export</li>
                                            <li><strong>Chrome:</strong> Settings &rarr; Passwords &rarr; Export</li>
                                            <li><strong>Firefox:</strong> Settings &rarr; Passwords &rarr; Export</li>
                                            <li><strong>Apple:</strong> System Settings &rarr; Passwords &rarr; Export</li>
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 'preview' && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between bg-gray-700/50 rounded-lg p-3">
                                <div className="flex items-center gap-3">
                                    <FileText size={20} className="text-gray-400" />
                                    <div>
                                        <p className="text-sm font-medium text-white">{fileName}</p>
                                        <p className="text-xs text-gray-400">
                                            {parsedEntries.length} passwords found
                                            {skipped > 0 && `, ${skipped} skipped`}
                                        </p>
                                    </div>
                                </div>

                                <div className="relative">
                                    <button
                                        onClick={() => setShowFormatDropdown(!showFormatDropdown)}
                                        className="flex items-center gap-2 px-3 py-1.5 bg-gray-600 hover:bg-gray-500 rounded-lg text-sm text-white transition-colors"
                                    >
                                        {selectedFormat ? getPasswordManagerDisplayName(selectedFormat) : 'Select format'}
                                        <ChevronDown size={14} className={`transition-transform ${showFormatDropdown ? 'rotate-180' : ''}`} />
                                    </button>

                                    {showFormatDropdown && (
                                        <div className="absolute right-0 top-full mt-1 w-64 bg-gray-700 border border-gray-600 rounded-lg shadow-xl z-10 py-1 max-h-64 overflow-y-auto">
                                            {SUPPORTED_FORMATS.map(format => (
                                                <button
                                                    key={format.type}
                                                    onClick={() => handleFormatChange(format.type)}
                                                    className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-600 transition-colors flex items-center gap-2 ${
                                                        selectedFormat === format.type ? 'bg-gray-600 text-white' : 'text-gray-300'
                                                    }`}
                                                >
                                                    <span className="w-5 h-5 rounded bg-gray-500 flex items-center justify-center text-xs font-bold">
                                                        {format.icon}
                                                    </span>
                                                    {format.name}
                                                    {detectedFormat === format.type && (
                                                        <span className="ml-auto text-xs text-green-400">(detected)</span>
                                                    )}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {errors.length > 0 && (
                                <div className="bg-red-900/30 border border-red-800 rounded-lg p-3">
                                    <div className="flex items-start gap-2">
                                        <AlertCircle size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
                                        <div className="text-sm">
                                            <p className="text-red-300 font-medium">Import warnings:</p>
                                            <ul className="text-red-200/80 list-disc list-inside mt-1">
                                                {errors.map((error, i) => (
                                                    <li key={i}>{error}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="border border-gray-700 rounded-lg overflow-hidden">
                                <div className="bg-gray-700/50 px-4 py-2 text-xs font-medium text-gray-400 grid grid-cols-12 gap-2">
                                    <span className="col-span-3">Name</span>
                                    <span className="col-span-3">Username</span>
                                    <span className="col-span-3">Password</span>
                                    <span className="col-span-2">URL</span>
                                    <span className="col-span-1"></span>
                                </div>
                                <div className="max-h-80 overflow-y-auto divide-y divide-gray-700/50">
                                    {parsedEntries.map(entry => (
                                        <div key={entry.id} className="px-4 py-2 grid grid-cols-12 gap-2 items-center hover:bg-gray-700/30">
                                            <div className="col-span-3 truncate text-sm text-white" title={entry.name}>
                                                {entry.name}
                                            </div>
                                            <div className="col-span-3 truncate text-sm text-gray-300" title={entry.username}>
                                                {entry.username || '-'}
                                            </div>
                                            <div className="col-span-3 flex items-center gap-1">
                                                <span className="truncate text-sm text-gray-400 font-mono">
                                                    {showPasswords[entry.id] ? entry.password : '••••••••'}
                                                </span>
                                                <button
                                                    onClick={() => togglePasswordVisibility(entry.id)}
                                                    className="p-1 hover:bg-gray-600 rounded transition-colors"
                                                >
                                                    {showPasswords[entry.id] ? (
                                                        <EyeOff size={14} className="text-gray-500" />
                                                    ) : (
                                                        <Eye size={14} className="text-gray-500" />
                                                    )}
                                                </button>
                                            </div>
                                            <div className="col-span-2 truncate text-sm text-gray-500" title={entry.url}>
                                                {entry.url ? new URL(entry.url).hostname : '-'}
                                            </div>
                                            <div className="col-span-1 flex justify-end">
                                                <button
                                                    onClick={() => removeEntry(entry.id)}
                                                    className="p-1 hover:bg-red-900/50 rounded transition-colors"
                                                    title="Remove from import"
                                                >
                                                    <Trash2 size={14} className="text-gray-500 hover:text-red-400" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {parsedEntries.length === 0 && (
                                <div className="text-center py-8 text-gray-400">
                                    <AlertCircle size={32} className="mx-auto mb-2 text-gray-500" />
                                    <p>No passwords found in this file.</p>
                                    <p className="text-sm mt-1">Try selecting a different format above.</p>
                                </div>
                            )}
                        </div>
                    )}

                    {step === 'complete' && (
                        <div className="text-center py-8">
                            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
                                <CheckCircle size={32} className="text-green-400" />
                            </div>
                            <h3 className="text-xl font-semibold text-white mb-2">Import Complete!</h3>
                            <p className="text-gray-400">
                                Successfully imported {parsedEntries.length} passwords.
                            </p>
                            <p className="text-sm text-gray-500 mt-4">
                                Your passwords are now encrypted and stored locally.
                            </p>
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-between px-6 py-4 border-t border-gray-700 bg-gray-800/50">
                    <div className="text-xs text-gray-500 flex items-center gap-1">
                        <Shield size={12} />
                        Passwords are encrypted locally
                    </div>
                    <div className="flex gap-2">
                        {step === 'select' && (
                            <button
                                onClick={handleClose}
                                className="px-4 py-2 text-sm text-gray-300 hover:text-white transition-colors"
                            >
                                Cancel
                            </button>
                        )}
                        {step === 'preview' && (
                            <>
                                <button
                                    onClick={resetState}
                                    className="px-4 py-2 text-sm text-gray-300 hover:text-white transition-colors"
                                >
                                    Back
                                </button>
                                <button
                                    onClick={handleImport}
                                    disabled={parsedEntries.length === 0 || isProcessing}
                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
                                >
                                    {isProcessing ? (
                                        <>
                                            <Loader2 size={16} className="animate-spin" />
                                            Processing...
                                        </>
                                    ) : (
                                        <>
                                            <Download size={16} />
                                            Import {parsedEntries.length} Passwords
                                        </>
                                    )}
                                </button>
                            </>
                        )}
                        {step === 'complete' && (
                            <button
                                onClick={handleClose}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                            >
                                Done
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PasswordImport;
