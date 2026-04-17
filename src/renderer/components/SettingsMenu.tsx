import React, { useState, useEffect, useCallback } from 'react';
import { Save } from 'lucide-react';
import { Modal, Card, Button, Input, Select } from 'npcts';


const HOME_DIR = '~/.npcsh';

const defaultKeyboardShortcuts = {
    newConversation: 'Ctrl+Shift+C',
    newFolder: 'Ctrl+N',
    newBrowser: 'Ctrl+Shift+B',
    newTerminal: 'Ctrl+Shift+T',
    newCodeFile: 'Ctrl+Shift+F',
    newWorkspace: 'Ctrl+Shift+N',
    toggleSidebar: 'Ctrl+B',
    commandPalette: 'Ctrl+Shift+P',
    fileSearch: 'Ctrl+P',
    globalSearch: 'Ctrl+Shift+S',
    save: 'Ctrl+S',
    closePane: 'Ctrl+W',
};

const defaultSettings = {
    model: 'llama3.2',
    provider: 'ollama',
    embedding_model: 'nomic-text-embed',
    embedding_provider: 'ollama',
    search_provider: 'duckduckgo',
    default_folder: HOME_DIR,
    data_directory: '',
    default_to_agent: false,
    is_predictive_text_enabled: false,
    predictive_text_model: 'llama3.2',
    predictive_text_provider: 'ollama',
    keyboard_shortcuts: defaultKeyboardShortcuts,
    backend_python_path: '',
    default_new_pane_type: 'chat',
    default_new_terminal_type: 'system',
    default_new_document_type: 'docx',
    theme_dark_primary: '#3b82f6',
    theme_dark_bg: '#0f172a',
    theme_dark_text: '#f1f5f9',
    theme_light_primary: '#ec4899',
    theme_light_bg: '#8ecfb8',
    theme_light_text: '#1e293b',
    theme_hue_shift: 0,
    theme_saturation: 100,
    theme_brightness: 100,
};


const PermissionsManager = () => {
    const [permissions, setPermissions] = useState<any>({
        camera: false,
        microphone: false,
        cameraStatus: 'unknown',
        micStatus: 'unknown',
    });
    const [screenCapture, setScreenCapture] = useState<any>({ granted: false, status: 'unknown' });
    const [loading, setLoading] = useState(true);
    const isMac = navigator.platform?.toLowerCase().includes('mac');

    const checkPermissions = useCallback(async () => {
        setLoading(true);
        try {
            const api = (window as any).api;
            if (api?.checkMediaPermissions) {
                const media = await api.checkMediaPermissions();
                setPermissions(media);
            }
            if (api?.getScreenCaptureStatus) {
                const screen = await api.getScreenCaptureStatus();
                setScreenCapture(screen);
            }
        } catch (err) {
            console.error('Failed to check permissions:', err);
        }
        setLoading(false);
    }, []);

    useEffect(() => { checkPermissions(); }, [checkPermissions]);

    const requestMedia = async () => {
        try {
            const result = await (window as any).api.requestMediaPermissions();
            setPermissions((prev: any) => ({ ...prev, camera: result.camera, microphone: result.microphone }));

            setTimeout(checkPermissions, 1000);
        } catch (err) {
            console.error('Failed to request permissions:', err);
        }
    };

    const openSettings = async (pane: string) => {
        try {
            await (window as any).api.openSystemPreferences(pane);
        } catch (err) {
            console.error('Failed to open system preferences:', err);
        }
    };

    const StatusBadge = ({ granted, status }: { granted: boolean; status: string }) => (
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
            granted ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'
        }`}>
            {granted ? 'Granted' : status === 'denied' ? 'Denied' : status === 'restricted' ? 'Restricted' : 'Not Granted'}
        </span>
    );

    if (!isMac) {
        const isWindows = navigator.platform?.toLowerCase().includes('win');
        return (
            <div className="space-y-4">
                <h3 className="text-lg font-medium text-white">Permissions</h3>
                <p className="text-sm text-gray-400">
                    Camera, microphone, and screen capture permissions are managed through your system settings.
                </p>
                <div className="p-3 bg-gray-800/30 rounded-lg border border-gray-700/50">
                    <p className="text-xs text-gray-500">
                        {isWindows
                            ? 'Go to Settings → Privacy & Security → Camera / Microphone to manage permissions.'
                            : 'Check your desktop environment settings or use your distribution\'s privacy/security controls to manage camera and microphone access.'}
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <h3 className="text-lg font-medium text-white">macOS Permissions</h3>
            <p className="text-sm text-gray-400">
                Manage system permissions required for camera, microphone, and screen capture features.
            </p>

            {loading ? (
                <p className="text-sm text-gray-500">Checking permissions...</p>
            ) : (
                <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center">
                                <span className="text-sm">📷</span>
                            </div>
                            <div>
                                <p className="text-sm font-medium text-white">Camera</p>
                                <p className="text-xs text-gray-400">Required for video calls in browser tabs</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <StatusBadge granted={permissions.camera} status={permissions.cameraStatus} />
                            {!permissions.camera && (
                                <button onClick={() => openSettings('camera')}
                                    className="text-xs text-blue-400 hover:text-blue-300 underline">
                                    Open Settings
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center">
                                <span className="text-sm">🎤</span>
                            </div>
                            <div>
                                <p className="text-sm font-medium text-white">Microphone</p>
                                <p className="text-xs text-gray-400">Required for voice input and audio calls</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <StatusBadge granted={permissions.microphone} status={permissions.micStatus} />
                            {!permissions.microphone && (
                                <button onClick={() => openSettings('microphone')}
                                    className="text-xs text-blue-400 hover:text-blue-300 underline">
                                    Open Settings
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center">
                                <span className="text-sm">🖥</span>
                            </div>
                            <div>
                                <p className="text-sm font-medium text-white">Screen Recording</p>
                                <p className="text-xs text-gray-400">Required for screenshot capture (Ctrl+Alt+4)</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <StatusBadge granted={screenCapture.granted} status={screenCapture.status} />
                            {!screenCapture.granted && (
                                <button onClick={() => openSettings('screen_recording')}
                                    className="text-xs text-blue-400 hover:text-blue-300 underline">
                                    Open Settings
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center">
                                <span className="text-sm">♿</span>
                            </div>
                            <div>
                                <p className="text-sm font-medium text-white">Accessibility</p>
                                <p className="text-xs text-gray-400">May be required for global shortcuts</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button onClick={() => openSettings('accessibility')}
                                className="text-xs text-blue-400 hover:text-blue-300 underline">
                                Open Settings
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex gap-2 pt-2">
                <button onClick={requestMedia}
                    className="px-3 py-1.5 text-xs font-medium rounded-md bg-blue-600 text-white hover:bg-blue-500 transition-colors">
                    Request Camera & Microphone
                </button>
                <button onClick={checkPermissions}
                    className="px-3 py-1.5 text-xs font-medium rounded-md bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors">
                    Refresh Status
                </button>
            </div>

            <div className="p-3 bg-gray-800/30 rounded-lg border border-gray-700/50">
                <p className="text-xs text-gray-500">
                    If a permission shows as denied, you need to enable it manually in System Settings &gt; Privacy &amp; Security.
                    macOS requires you to toggle the permission off and on again if you previously denied it.
                </p>
            </div>
        </div>
    );
};

const SettingsMenu = ({ isOpen, onClose, currentPath, onPathChange, availableModels = [], embedded = false, initialTab = 'global', onRerunSetup = undefined, onTabChange = undefined }) => {
    const [activeTab, setActiveTab] = useState(initialTab);
    const changeTab = (tab: string) => { setActiveTab(tab); onTabChange?.(tab); };
    const [globalSettings, setGlobalSettings] = useState(defaultSettings);


    useEffect(() => {
        if (initialTab && initialTab !== activeTab) {
            setActiveTab(initialTab);
        }
    }, [initialTab]);

    const loadGlobalSettings = async () => {
        const data = await window.api.loadGlobalSettings();
        if (data.error) return;
        setGlobalSettings({ ...defaultSettings, ...(data.global_settings || {}) });
    };

    useEffect(() => {
        if (isOpen) {
            loadGlobalSettings();
        }
    }, [isOpen]);

    const handleSave = async () => {
        await window.api.saveGlobalSettings({
            global_settings: globalSettings,
        });

        if (globalSettings.default_new_pane_type) {
            localStorage.setItem('incognide_defaultNewPaneType', globalSettings.default_new_pane_type);
            window.dispatchEvent(new CustomEvent('defaultPaneTypeChanged', { detail: globalSettings.default_new_pane_type }));
        }
        if (globalSettings.default_new_terminal_type) {
            localStorage.setItem('incognide_defaultNewTerminalType', globalSettings.default_new_terminal_type);
            window.dispatchEvent(new CustomEvent('defaultTerminalTypeChanged', { detail: globalSettings.default_new_terminal_type }));
        }
        if (globalSettings.default_new_document_type) {
            localStorage.setItem('incognide_defaultNewDocumentType', globalSettings.default_new_document_type);
            window.dispatchEvent(new CustomEvent('defaultDocumentTypeChanged', { detail: globalSettings.default_new_document_type }));
        }

        if (globalSettings.theme_dark_primary) {
            localStorage.setItem('incognide_themeDarkPrimary', globalSettings.theme_dark_primary);
            document.documentElement.style.setProperty('--theme-primary-dark', globalSettings.theme_dark_primary);
        }
        if (globalSettings.theme_dark_bg) {
            localStorage.setItem('incognide_themeDarkBg', globalSettings.theme_dark_bg);
            document.documentElement.style.setProperty('--theme-bg-dark', globalSettings.theme_dark_bg);
        }
        if (globalSettings.theme_dark_text) {
            localStorage.setItem('incognide_themeDarkText', globalSettings.theme_dark_text);
            document.documentElement.style.setProperty('--theme-text-dark', globalSettings.theme_dark_text);
        }

        if (globalSettings.theme_light_primary) {
            localStorage.setItem('incognide_themeLightPrimary', globalSettings.theme_light_primary);
            document.documentElement.style.setProperty('--theme-primary-light', globalSettings.theme_light_primary);
        }
        if (globalSettings.theme_light_bg) {
            localStorage.setItem('incognide_themeLightBg', globalSettings.theme_light_bg);
            document.documentElement.style.setProperty('--theme-bg-light', globalSettings.theme_light_bg);
        }
        if (globalSettings.theme_light_text) {
            localStorage.setItem('incognide_themeLightText', globalSettings.theme_light_text);
            document.documentElement.style.setProperty('--theme-text-light', globalSettings.theme_light_text);
        }

        localStorage.setItem('incognide_themeHueShift', String(globalSettings.theme_hue_shift ?? 0));
        localStorage.setItem('incognide_themeSaturation', String(globalSettings.theme_saturation ?? 100));
        localStorage.setItem('incognide_themeBrightness', String(globalSettings.theme_brightness ?? 100));
        document.documentElement.style.setProperty('--theme-hue-shift', `${globalSettings.theme_hue_shift ?? 0}deg`);
        document.documentElement.style.setProperty('--theme-saturation', `${globalSettings.theme_saturation ?? 100}%`);
        document.documentElement.style.setProperty('--theme-brightness', `${globalSettings.theme_brightness ?? 100}%`);

        onClose();
    };

    const tabs = [
        { id: 'global', name: 'Global Settings' },
        { id: 'theme', name: 'Theme' },
        { id: 'shortcuts', name: 'Keyboard Shortcuts' },
        { id: 'permissions', name: 'Permissions' }
    ];

    const content = (
        <div className={`flex flex-col ${embedded ? 'h-full' : 'max-h-[80vh]'}`}>
            <div className="flex flex-1 min-h-0">
                <div className="w-40 border-r border-gray-700 overflow-y-auto p-2 flex-shrink-0">
                    <div className="space-y-0.5">
                        {tabs.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => changeTab(tab.id)}
                                className={`w-full text-left px-3 py-1.5 text-xs font-medium rounded transition-all ${
                                    activeTab === tab.id
                                        ? 'bg-blue-600/50 text-white'
                                        : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
                                }`}
                            >
                                {tab.name}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {activeTab === 'global' && (
                    <>
                        <button
                            onClick={async () => {
                                try {
                                    await (window as any).api?.profileSave?.({ tutorialComplete: false });
                                    window.location.reload();
                                } catch (err) {
                                    console.error('Error resetting tutorial:', err);
                                }
                            }}
                            className="w-full text-left px-3 py-2 text-sm border border-gray-700 rounded-lg hover:bg-gray-700/50 text-gray-300 transition-colors"
                        >
                            Replay Tutorial
                        </button>

                        {onRerunSetup && (
                            <button
                                onClick={onRerunSetup}
                                className="w-full text-left px-3 py-2 text-sm border border-gray-700 rounded-lg hover:bg-gray-700/50 text-gray-300 transition-colors"
                            >
                                Re-run Setup Wizard
                            </button>
                        )}

                        <Input
                            label="Default Directory"
                            value={globalSettings.default_folder}
                            onChange={(e) => setGlobalSettings({...globalSettings, default_folder: e.target.value})}
                        />
                        <div>
                            <label className="block text-xs font-medium text-gray-400 mb-1">Data Directory (INCOGNIDE_HOME)</label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={globalSettings.data_directory || '~/.npcsh/incognide'}
                                    onChange={(e) => setGlobalSettings({...globalSettings, data_directory: e.target.value})}
                                    className="flex-1 px-3 py-1.5 text-sm rounded border border-gray-700 bg-gray-800 text-gray-200"
                                    placeholder="~/.npcsh/incognide"
                                />
                                <button
                                    onClick={async () => {
                                        try {
                                            const result = await (window as any).api.showOpenDialog({
                                                properties: ['openDirectory'],
                                                title: 'Select Data Directory',
                                            });
                                            if (result?.filePaths?.[0]) {
                                                setGlobalSettings({...globalSettings, data_directory: result.filePaths[0]});
                                            }
                                        } catch {}
                                    }}
                                    className="px-3 py-1.5 text-xs rounded border border-gray-700 hover:bg-gray-700 text-gray-300"
                                >
                                    Browse
                                </button>
                            </div>
                            <p className="text-[10px] text-gray-500 mt-1">
                                Base directory for Incognide data (teams, models, configs). Saved as INCOGNIDE_HOME in ~/.npcshrc. Requires restart.
                            </p>
                        </div>
                        <Select
                            label="Default New Terminal Type"
                            value={globalSettings.default_new_terminal_type || 'system'}
                            onChange={(e) => setGlobalSettings({...globalSettings, default_new_terminal_type: e.target.value})}
                            options={[
                                { value: 'system', label: 'Bash' },
                                { value: 'npcsh', label: 'npcsh' },
                                { value: 'guac', label: 'guac' },
                            ]}
                        />

                        <Select
                            label="Default New Document Type"
                            value={globalSettings.default_new_document_type || 'docx'}
                            onChange={(e) => setGlobalSettings({...globalSettings, default_new_document_type: e.target.value})}
                            options={[
                                { value: 'docx', label: 'Word (.docx)' },
                                { value: 'xlsx', label: 'Excel (.xlsx)' },
                                { value: 'pptx', label: 'PowerPoint (.pptx)' },
                                { value: 'mapx', label: 'Mind Map (.mapx)' },
                            ]}
                        />

                    </>
                )}

                {activeTab === 'theme' && (
                    <div className="space-y-3">
                        <div className="flex items-center justify-between p-2 theme-bg-tertiary rounded">
                            <span className="text-sm">Dark Mode</span>
                            <button
                                onClick={() => {
                                    const isDark = document.body.classList.contains('dark-mode');
                                    document.body.classList.toggle('dark-mode', !isDark);
                                    document.body.classList.toggle('light-mode', isDark);
                                    localStorage.setItem('incognide_darkMode', (!isDark).toString());
                                }}
                                className={`w-10 h-5 rounded-full transition-colors ${document.body.classList.contains('dark-mode') ? 'bg-blue-500' : 'bg-gray-400'}`}
                            >
                                <div className={`w-4 h-4 bg-white rounded-full shadow transform transition-transform ${document.body.classList.contains('dark-mode') ? 'translate-x-5' : 'translate-x-0.5'}`} />
                            </button>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                            <div>
                                <div className="flex justify-between text-xs text-gray-400 mb-1"><span>Hue</span><span>{globalSettings.theme_hue_shift || 0}°</span></div>
                                <input type="range" min="-180" max="180" value={globalSettings.theme_hue_shift || 0}
                                    onChange={(e) => { const val = parseInt(e.target.value); setGlobalSettings({...globalSettings, theme_hue_shift: val}); document.documentElement.style.setProperty('--theme-hue-shift', `${val}deg`); }}
                                    className="w-full h-2 rounded-lg appearance-none cursor-pointer" style={{background: 'linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)'}} />
                            </div>
                            <div>
                                <div className="flex justify-between text-xs text-gray-400 mb-1"><span>Saturation</span><span>{globalSettings.theme_saturation || 100}%</span></div>
                                <input type="range" min="0" max="200" value={globalSettings.theme_saturation || 100}
                                    onChange={(e) => { const val = parseInt(e.target.value); setGlobalSettings({...globalSettings, theme_saturation: val}); document.documentElement.style.setProperty('--theme-saturation', `${val}%`); }}
                                    className="w-full h-2 bg-gradient-to-r from-gray-500 to-blue-500 rounded-lg appearance-none cursor-pointer" />
                            </div>
                            <div>
                                <div className="flex justify-between text-xs text-gray-400 mb-1"><span>Brightness</span><span>{globalSettings.theme_brightness || 100}%</span></div>
                                <input type="range" min="50" max="150" value={globalSettings.theme_brightness || 100}
                                    onChange={(e) => { const val = parseInt(e.target.value); setGlobalSettings({...globalSettings, theme_brightness: val}); document.documentElement.style.setProperty('--theme-brightness', `${val}%`); }}
                                    className="w-full h-2 bg-gradient-to-r from-gray-900 via-gray-500 to-white rounded-lg appearance-none cursor-pointer" />
                            </div>
                        </div>

                        <div className="text-xs text-gray-400 font-medium">Dark Mode</div>
                        <div className="grid grid-cols-3 gap-2">
                            <div className="flex items-center gap-2">
                                <input type="color" value={globalSettings.theme_dark_primary || '#3b82f6'} onChange={(e) => { setGlobalSettings({...globalSettings, theme_dark_primary: e.target.value}); document.documentElement.style.setProperty('--theme-primary-dark', e.target.value); }} className="w-8 h-6 rounded cursor-pointer" />
                                <span className="text-xs text-gray-400">Primary</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <input type="color" value={globalSettings.theme_dark_bg || '#0f172a'} onChange={(e) => { setGlobalSettings({...globalSettings, theme_dark_bg: e.target.value}); document.documentElement.style.setProperty('--theme-bg-dark', e.target.value); }} className="w-8 h-6 rounded cursor-pointer" />
                                <span className="text-xs text-gray-400">Background</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <input type="color" value={globalSettings.theme_dark_text || '#f1f5f9'} onChange={(e) => { setGlobalSettings({...globalSettings, theme_dark_text: e.target.value}); document.documentElement.style.setProperty('--theme-text-dark', e.target.value); }} className="w-8 h-6 rounded cursor-pointer" />
                                <span className="text-xs text-gray-400">Text</span>
                            </div>
                        </div>

                        <div className="text-xs text-gray-400 font-medium">Light Mode</div>
                        <div className="grid grid-cols-3 gap-2">
                            <div className="flex items-center gap-2">
                                <input type="color" value={globalSettings.theme_light_primary || '#ec4899'} onChange={(e) => { setGlobalSettings({...globalSettings, theme_light_primary: e.target.value}); document.documentElement.style.setProperty('--theme-primary-light', e.target.value); }} className="w-8 h-6 rounded cursor-pointer" />
                                <span className="text-xs text-gray-400">Primary</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <input type="color" value={globalSettings.theme_light_bg || '#8ecfb8'} onChange={(e) => { setGlobalSettings({...globalSettings, theme_light_bg: e.target.value}); document.documentElement.style.setProperty('--theme-bg-light', e.target.value); }} className="w-8 h-6 rounded cursor-pointer" />
                                <span className="text-xs text-gray-400">Background</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <input type="color" value={globalSettings.theme_light_text || '#1e293b'} onChange={(e) => { setGlobalSettings({...globalSettings, theme_light_text: e.target.value}); document.documentElement.style.setProperty('--theme-text-light', e.target.value); }} className="w-8 h-6 rounded cursor-pointer" />
                                <span className="text-xs text-gray-400">Text</span>
                            </div>
                        </div>

                        <button onClick={() => {
                            setGlobalSettings({...globalSettings, theme_dark_primary: '#3b82f6', theme_dark_bg: '#0f172a', theme_dark_text: '#f1f5f9', theme_light_primary: '#ec4899', theme_light_bg: '#8ecfb8', theme_light_text: '#1e293b', theme_hue_shift: 0, theme_saturation: 100, theme_brightness: 100});
                            document.documentElement.style.setProperty('--theme-primary-dark', '#3b82f6'); document.documentElement.style.setProperty('--theme-bg-dark', '#0f172a'); document.documentElement.style.setProperty('--theme-text-dark', '#f1f5f9');
                            document.documentElement.style.setProperty('--theme-primary-light', '#ec4899'); document.documentElement.style.setProperty('--theme-bg-light', '#8ecfb8'); document.documentElement.style.setProperty('--theme-text-light', '#1e293b');
                            document.documentElement.style.setProperty('--theme-hue-shift', '0deg'); document.documentElement.style.setProperty('--theme-saturation', '100%'); document.documentElement.style.setProperty('--theme-brightness', '100%');
                        }} className="text-xs text-gray-400 hover:text-white">Reset to defaults</button>
                    </div>
                )}

                {activeTab === 'shortcuts' && (
                    <Card title="Keyboard Shortcuts">
                        <p className="text-sm text-gray-400 mb-4">
                            Customize keyboard shortcuts for quick actions. Use Ctrl/Cmd, Shift, Alt modifiers.
                        </p>
                        <div className="space-y-3">
                            {Object.entries(globalSettings.keyboard_shortcuts || defaultKeyboardShortcuts).map(([key, value]) => {
                                const labels = {
                                    newConversation: 'New Conversation',
                                    newFolder: 'New Folder',
                                    newBrowser: 'New Browser',
                                    newTerminal: 'New Terminal',
                                    newCodeFile: 'New Code File',
                                    newWorkspace: 'New Workspace',
                                    toggleSidebar: 'Toggle Sidebar',
                                    commandPalette: 'Command Palette',
                                    fileSearch: 'File Search',
                                    globalSearch: 'Global Search',
                                    save: 'Save',
                                    closePane: 'Close Pane',
                                };
                                return (
                                    <div key={key} className="flex items-center justify-between gap-4">
                                        <label className="text-sm text-gray-300 min-w-[150px]">{labels[key] || key}</label>
                                        <Input
                                            value={value}
                                            onChange={(e) => {
                                                setGlobalSettings({
                                                    ...globalSettings,
                                                    keyboard_shortcuts: {
                                                        ...(globalSettings.keyboard_shortcuts || defaultKeyboardShortcuts),
                                                        [key]: e.target.value
                                                    }
                                                });
                                            }}
                                            placeholder="e.g., Ctrl+Shift+N"
                                            className="w-40"
                                        />
                                    </div>
                                );
                            })}
                        </div>
                        <div className="mt-4 pt-4 border-t border-gray-700">
                            <Button
                                variant="secondary"
                                onClick={() => setGlobalSettings({
                                    ...globalSettings,
                                    keyboard_shortcuts: defaultKeyboardShortcuts
                                })}
                            >
                                Reset to Defaults
                            </Button>
                        </div>
                    </Card>
                )}

                {activeTab === 'permissions' && <PermissionsManager />}
                </div>
            </div>

            <div className="border-t border-gray-700 p-4 flex justify-end">
                <Button variant="primary" onClick={handleSave}>
                    <Save size={20} /> Save Changes
                </Button>
            </div>
        </div>
    );

    if (embedded) {
        return (
            <div className="flex flex-col h-full theme-bg-primary">
                {content}
            </div>
        );
    }

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Settings" size="md">
            {content}
        </Modal>
    );
};

export default SettingsMenu;