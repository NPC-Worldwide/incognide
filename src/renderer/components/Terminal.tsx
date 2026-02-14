import React, { useEffect, useRef, memo, useCallback, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal as TerminalIcon, Code, Sparkles, Settings, X, Type, Palette } from 'lucide-react';
import '@xterm/xterm/css/xterm.css';

const SHELL_PROMPT_KEY = 'incognide-shell-profile-prompted';

// Maximum lines to keep in the terminal output buffer for chat context
const MAX_TERMINAL_CONTEXT_LINES = 100;

// Theme presets with actual hex color values
const THEME_PRESETS = {
    'default': {
        background: '#1a1b26',
        foreground: '#c0caf5',
        cursor: '#c0caf5',
        selection: '#33467c',
        black: '#15161e',
        red: '#f7768e',
        green: '#9ece6a',
        yellow: '#e0af68',
        blue: '#7aa2f7',
        magenta: '#bb9af7',
        cyan: '#7dcfff',
        white: '#a9b1d6'
    },
    'dracula': {
        background: '#282a36',
        foreground: '#f8f8f2',
        cursor: '#f8f8f2',
        selection: '#44475a',
        black: '#21222c',
        red: '#ff5555',
        green: '#50fa7b',
        yellow: '#f1fa8c',
        blue: '#bd93f9',
        magenta: '#ff79c6',
        cyan: '#8be9fd',
        white: '#f8f8f2'
    },
    'monokai': {
        background: '#272822',
        foreground: '#f8f8f2',
        cursor: '#f8f8f2',
        selection: '#49483e',
        black: '#272822',
        red: '#f92672',
        green: '#a6e22e',
        yellow: '#f4bf75',
        blue: '#66d9ef',
        magenta: '#ae81ff',
        cyan: '#a1efe4',
        white: '#f8f8f2'
    },
    'solarized-dark': {
        background: '#002b36',
        foreground: '#839496',
        cursor: '#839496',
        selection: '#073642',
        black: '#073642',
        red: '#dc322f',
        green: '#859900',
        yellow: '#b58900',
        blue: '#268bd2',
        magenta: '#d33682',
        cyan: '#2aa198',
        white: '#eee8d5'
    },
    'solarized-light': {
        background: '#fdf6e3',
        foreground: '#657b83',
        cursor: '#657b83',
        selection: '#eee8d5',
        black: '#073642',
        red: '#dc322f',
        green: '#859900',
        yellow: '#b58900',
        blue: '#268bd2',
        magenta: '#d33682',
        cyan: '#2aa198',
        white: '#fdf6e3'
    },
    'nord': {
        background: '#2e3440',
        foreground: '#d8dee9',
        cursor: '#d8dee9',
        selection: '#434c5e',
        black: '#3b4252',
        red: '#bf616a',
        green: '#a3be8c',
        yellow: '#ebcb8b',
        blue: '#81a1c1',
        magenta: '#b48ead',
        cyan: '#88c0d0',
        white: '#e5e9f0'
    },
    'gruvbox': {
        background: '#282828',
        foreground: '#ebdbb2',
        cursor: '#ebdbb2',
        selection: '#504945',
        black: '#282828',
        red: '#cc241d',
        green: '#98971a',
        yellow: '#d79921',
        blue: '#458588',
        magenta: '#b16286',
        cyan: '#689d6a',
        white: '#a89984'
    },
    'one-dark': {
        background: '#282c34',
        foreground: '#abb2bf',
        cursor: '#abb2bf',
        selection: '#3e4451',
        black: '#282c34',
        red: '#e06c75',
        green: '#98c379',
        yellow: '#e5c07b',
        blue: '#61afef',
        magenta: '#c678dd',
        cyan: '#56b6c2',
        white: '#abb2bf'
    },
    'light': {
        background: '#ffffff',
        foreground: '#333333',
        cursor: '#333333',
        selection: '#d0d0d0',
        black: '#000000',
        red: '#c41a16',
        green: '#007400',
        yellow: '#826b28',
        blue: '#0000ff',
        magenta: '#a90d91',
        cyan: '#3971ed',
        white: '#c7c7c7'
    }
};

const TerminalView = ({ nodeId, contentDataRef, currentPath, activeContentPaneId, setActiveContentPaneId, shell, isDarkMode = true }) => {
    const terminalRef = useRef(null);
    const xtermInstance = useRef(null);
    const fitAddonRef = useRef(null);
    const isSessionReady = useRef(false);
    const terminalOutputBuffer = useRef<string[]>([]);
    const initialPathRef = useRef(currentPath); // Capture initial path for terminal cwd
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
    const [showShellPrompt, setShowShellPrompt] = useState(false);
    const [activeShell, setActiveShell] = useState<string>('system');
    const [pythonEnv, setPythonEnv] = useState<string | null>(null);
    const [showSettings, setShowSettings] = useState(false);
    const [fontSize, setFontSize] = useState(() => {
        const saved = localStorage.getItem('terminal-font-size');
        return saved ? parseInt(saved) : 14;
    });
    const [fontFamily, setFontFamily] = useState(() => {
        return localStorage.getItem('terminal-font-family') || '"Fira Code", monospace';
    });
    const [cursorStyle, setCursorStyle] = useState<'block' | 'underline' | 'bar'>(() => {
        return (localStorage.getItem('terminal-cursor-style') as any) || 'block';
    });
    const [cursorBlink, setCursorBlink] = useState(() => {
        return localStorage.getItem('terminal-cursor-blink') !== 'false';
    });
    const [lineHeight, setLineHeight] = useState(() => {
        const saved = localStorage.getItem('terminal-line-height');
        return saved ? parseFloat(saved) : 1.2;
    });
    const [scrollback, setScrollback] = useState(() => {
        const saved = localStorage.getItem('terminal-scrollback');
        return saved ? parseInt(saved) : 1000;
    });
    const [bellSound, setBellSound] = useState(() => {
        return localStorage.getItem('terminal-bell-sound') === 'true';
    });
    const [bellStyle, setBellStyle] = useState<'none' | 'sound' | 'visual' | 'both'>(() => {
        return (localStorage.getItem('terminal-bell-style') as any) || 'none';
    });
    const [letterSpacing, setLetterSpacing] = useState(() => {
        const saved = localStorage.getItem('terminal-letter-spacing');
        return saved ? parseFloat(saved) : 0;
    });
    const [fontWeight, setFontWeight] = useState<'normal' | 'bold' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900'>(() => {
        return (localStorage.getItem('terminal-font-weight') as any) || 'normal';
    });
    const [fontWeightBold, setFontWeightBold] = useState<'normal' | 'bold' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900'>(() => {
        return (localStorage.getItem('terminal-font-weight-bold') as any) || 'bold';
    });
    const [drawBoldTextInBrightColors, setDrawBoldTextInBrightColors] = useState(() => {
        return localStorage.getItem('terminal-bold-bright') !== 'false';
    });
    const [minimumContrastRatio, setMinimumContrastRatio] = useState(() => {
        const saved = localStorage.getItem('terminal-contrast-ratio');
        return saved ? parseFloat(saved) : 1;
    });
    const [settingsTab, setSettingsTab] = useState<'font' | 'cursor' | 'behavior' | 'theme'>('font');
    const [terminalTheme, setTerminalTheme] = useState(() => {
        return localStorage.getItem('terminal-theme') || 'default';
    });
    const [customColors, setCustomColors] = useState(() => {
        const saved = localStorage.getItem('terminal-custom-colors');
        return saved ? JSON.parse(saved) : {
            background: '#1a1b26',
            foreground: '#c0caf5',
            cursor: '#c0caf5',
            selection: '#33467c',
            black: '#15161e',
            red: '#f7768e',
            green: '#9ece6a',
            yellow: '#e0af68',
            blue: '#7aa2f7',
            magenta: '#bb9af7',
            cyan: '#7dcfff',
            white: '#a9b1d6'
        };
    });
    const [defaultShell, setDefaultShell] = useState(() => {
        return localStorage.getItem('terminal-default-shell') || 'system';
    });
    const [copyOnSelect, setCopyOnSelect] = useState(() => {
        return localStorage.getItem('terminal-copy-on-select') === 'true';
    });
    const [rightClickPaste, setRightClickPaste] = useState(() => {
        return localStorage.getItem('terminal-right-click-paste') !== 'false';
    });
    const [macOptionIsMeta, setMacOptionIsMeta] = useState(() => {
        return localStorage.getItem('terminal-mac-option-meta') === 'true';
    });
    const [altClickMoveCursor, setAltClickMoveCursor] = useState(() => {
        return localStorage.getItem('terminal-alt-click-cursor') !== 'false';
    });

    const paneData = contentDataRef.current[nodeId];
    const terminalId = paneData?.contentId;

    // Store terminal output buffer in contentDataRef so chat can access it
    useEffect(() => {
        if (nodeId && contentDataRef.current[nodeId]) {
            contentDataRef.current[nodeId].getTerminalContext = () => {
                return terminalOutputBuffer.current.join('').slice(-10000); // Last 10k chars
            };
        }
    }, [nodeId, contentDataRef]);
    // Use shell prop if provided (e.g., 'python3'), otherwise check paneData, default to 'system'
    const shellType = shell || paneData?.shellType || 'system';

    const handleCopy = useCallback(() => {
        if (xtermInstance.current) {
            const selection = xtermInstance.current.getSelection();
            if (selection) {
                navigator.clipboard.writeText(selection);
            }
        }
        setContextMenu(null);
    }, []);

    const handlePaste = useCallback(async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (isSessionReady.current && text) {
                // Use bracketed paste mode to prevent multi-line pastes from executing line by line
                // This wraps the paste in escape sequences that tell the shell it's a paste operation
                const bracketedText = '\x1b[200~' + text + '\x1b[201~';
                window.api.writeToTerminal({ id: terminalId, data: bracketedText });
            }
        } catch (err) {
            console.error('Failed to paste:', err);
        }
        setContextMenu(null);
    }, [terminalId]);

    const handleClear = useCallback(() => {
        if (xtermInstance.current) {
            xtermInstance.current.clear();
        }
        setContextMenu(null);
    }, []);

    const handleSelectAll = useCallback(() => {
        if (xtermInstance.current) {
            xtermInstance.current.selectAll();
        }
        setContextMenu(null);
    }, []);

    const handleContextMenu = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ x: e.clientX, y: e.clientY });
    }, []);

    const getShellProfileCommand = useCallback(() => {
        const platform = navigator.platform.toLowerCase();
        if (platform.includes('mac')) {
            return 'source ~/.zshrc 2>/dev/null || source ~/.zprofile 2>/dev/null';
        } else {
            return 'source ~/.bashrc 2>/dev/null || source ~/.bash_profile 2>/dev/null';
        }
    }, []);

    const handleSourceProfile = useCallback(() => {
        if (isSessionReady.current && terminalId) {
            const cmd = getShellProfileCommand();
            window.api.writeToTerminal({ id: terminalId, data: cmd + '\n' });
        }
        localStorage.setItem(SHELL_PROMPT_KEY, 'true');
        setShowShellPrompt(false);
    }, [terminalId, getShellProfileCommand]);

    const handleDismissPrompt = useCallback(() => {
        localStorage.setItem(SHELL_PROMPT_KEY, 'true');
        setShowShellPrompt(false);
    }, []);

    useEffect(() => {
        if (!terminalRef.current || !terminalId) return;

        if (!xtermInstance.current) {
            const darkTheme = {
                background: '#1a1b26',
                foreground: '#c0caf5',
                cursor: '#c0caf5',
                cursorAccent: '#1a1b26',
                selectionBackground: '#33467c',
                black: '#32344a',
                red: '#f7768e',
                green: '#9ece6a',
                yellow: '#e0af68',
                blue: '#7aa2f7',
                magenta: '#ad8ee6',
                cyan: '#449dab',
                white: '#787c99',
                brightBlack: '#444b6a',
                brightRed: '#ff7a93',
                brightGreen: '#b9f27c',
                brightYellow: '#ff9e64',
                brightBlue: '#7da6ff',
                brightMagenta: '#bb9af7',
                brightCyan: '#0db9d7',
                brightWhite: '#acb0d0'
            };
            const lightTheme = {
                background: '#6dbf9e',
                foreground: '#0f3d2d',
                cursor: '#0f3d2d',
                cursorAccent: '#6dbf9e',
                selectionBackground: '#4a9a7a',
                black: '#0f3d2d',
                red: '#b91c1c',
                green: '#14532d',
                yellow: '#78350f',
                blue: '#1e3a8a',
                magenta: '#581c87',
                cyan: '#164e63',
                white: '#4a7a68',
                brightBlack: '#2d5a48',
                brightRed: '#dc2626',
                brightGreen: '#166534',
                brightYellow: '#a16207',
                brightBlue: '#1d4ed8',
                brightMagenta: '#7c3aed',
                brightCyan: '#0e7490',
                brightWhite: '#8ecfb8'
            };
            const term = new Terminal({
                cursorBlink: true,
                fontFamily: '"Fira Code", monospace',
                fontSize: 14,
                scrollback: scrollback,
                theme: isDarkMode ? darkTheme : lightTheme,
            });
            const fitAddon = new FitAddon();
            fitAddonRef.current = fitAddon;
            term.loadAddon(fitAddon);
            term.open(terminalRef.current);
            xtermInstance.current = term;
            // Use requestAnimationFrame to ensure fit happens after render
            requestAnimationFrame(() => {
                fitAddon.fit();
            });

            // Debounced resize handler to prevent rapid resize events causing cursor desync
            let resizeTimeout: ReturnType<typeof setTimeout> | null = null;
            const resizeObserver = new ResizeObserver(() => {
                if (resizeTimeout) clearTimeout(resizeTimeout);
                resizeTimeout = setTimeout(() => {
                    requestAnimationFrame(() => {
                        // Capture scroll position before resize
                        const wasAtBottom = term.buffer.active?.viewportY === term.buffer.active?.baseY;
                        const scrollOffset = term.buffer.active?.viewportY ?? 0;

                        fitAddon.fit();

                        // Restore scroll position after resize (unless was at bottom, stay at bottom)
                        if (wasAtBottom) {
                            term.scrollToBottom();
                        } else if (scrollOffset !== term.buffer.active?.viewportY) {
                            term.scrollToLine(scrollOffset);
                        }

                        if (isSessionReady.current) {
                            window.api.resizeTerminal?.({
                                id: terminalId,
                                cols: term.cols,
                                rows: term.rows
                            });
                        }
                    });
                }, 100); // 100ms debounce for smoother resize
            });
            resizeObserver.observe(terminalRef.current);

            term.attachCustomKeyEventHandler((event) => {
                // Only handle keydown, not keyup (prevents double-firing)
                if (event.type !== 'keydown') return true;

                const isMeta = event.ctrlKey || event.metaKey;
                const key = event.key.toLowerCase();

                // Tab key - send tab character to terminal for shell completion
                // Must prevent default to avoid browser focus navigation
                if (event.key === 'Tab' && !event.ctrlKey && !event.metaKey && !event.altKey) {
                    event.preventDefault();
                    event.stopPropagation();
                    if (isSessionReady.current) {
                        window.api.writeToTerminal({ id: terminalId, data: '\t' });
                    }
                    return false;
                }

                // Escape key - send ESC to terminal (needed for vim, Claude Code, etc)
                if (event.key === 'Escape') {
                    if (isSessionReady.current) {
                        window.api.writeToTerminal({ id: terminalId, data: '\x1b' });
                    }
                    return false;
                }

                // Ctrl+C (not Cmd+C on Mac) - send SIGINT
                if (event.ctrlKey && !event.metaKey && !event.shiftKey && key === 'c') {
                    const selection = term.getSelection();
                    if (selection) {
                        navigator.clipboard.writeText(selection);
                        return false;
                    }
                    // No selection - send SIGINT
                    if (isSessionReady.current) {
                        window.api.writeToTerminal({ id: terminalId, data: '\x03' });
                    }
                    return false;
                }

                // Ctrl+V / Cmd+V paste - handle manually, prevent browser default
                if (isMeta && key === 'v') {
                    event.preventDefault();
                    event.stopPropagation();
                    navigator.clipboard.readText().then(text => {
                        if (isSessionReady.current && text) {
                            // Use bracketed paste mode to prevent multi-line pastes from executing line by line
                            // This wraps the paste in escape sequences that tell the shell it's a paste operation
                            const bracketedText = '\x1b[200~' + text + '\x1b[201~';
                            window.api.writeToTerminal({ id: terminalId, data: bracketedText });
                        }
                    });
                    return false;
                }

                // Ctrl+Shift+C or Cmd+Shift+C for copy (terminal standard)
                if (isMeta && event.shiftKey && key === 'c') {
                    event.stopPropagation();
                    const selection = term.getSelection();
                    if (selection) {
                        navigator.clipboard.writeText(selection);
                    }
                    return false;
                }

                // Cmd+C (Mac) - copy if selection exists
                if (event.metaKey && !event.ctrlKey && !event.shiftKey && key === 'c') {
                    const selection = term.getSelection();
                    if (selection) {
                        navigator.clipboard.writeText(selection);
                        return false;
                    }
                }

                // Ctrl+L - Clear screen (send to terminal)
                if (isMeta && key === 'l') {
                    if (isSessionReady.current) {
                        window.api.writeToTerminal({ id: terminalId, data: '\x0c' }); // Form feed
                    }
                    return false;
                }

                // Cmd+A (Mac) or Ctrl+Shift+A (non-Mac) - Select all terminal content
                if ((event.metaKey && !event.ctrlKey && key === 'a') ||
                    (event.ctrlKey && event.shiftKey && key === 'a')) {
                    term.selectAll();
                    return false;
                }

                // Ctrl+A - Go to beginning of line (Ctrl only, not Cmd)
                if (event.ctrlKey && !event.metaKey && !event.shiftKey && key === 'a') {
                    event.preventDefault();
                    event.stopPropagation();
                    if (isSessionReady.current) {
                        window.api.writeToTerminal({ id: terminalId, data: '\x01' }); // ASCII SOH
                    }
                    return false;
                }

                // Ctrl+E - Go to end of line (Ctrl only, not Cmd)
                if (event.ctrlKey && !event.metaKey && key === 'e') {
                    event.preventDefault();
                    event.stopPropagation();
                    if (isSessionReady.current) {
                        window.api.writeToTerminal({ id: terminalId, data: '\x05' }); // ASCII ENQ
                    }
                    return false;
                }

                // Ctrl+U - Clear line before cursor
                if (isMeta && key === 'u') {
                    if (isSessionReady.current) {
                        window.api.writeToTerminal({ id: terminalId, data: '\x15' }); // ASCII NAK
                    }
                    return false;
                }

                // Ctrl+K - Kill line after cursor
                if (isMeta && key === 'k') {
                    if (isSessionReady.current) {
                        window.api.writeToTerminal({ id: terminalId, data: '\x0b' }); // ASCII VT
                    }
                    return false;
                }

                // Ctrl+W - Delete word before cursor
                if (isMeta && key === 'w') {
                    if (isSessionReady.current) {
                        window.api.writeToTerminal({ id: terminalId, data: '\x17' }); // ASCII ETB
                    }
                    return false;
                }

                // Ctrl+D - EOF / Exit (let it pass through)
                // Ctrl+Z - Suspend (let it pass through)
                // Ctrl+R - Reverse search (let it pass through)

                // Ctrl+Shift+T - Could be used for new tab (handled elsewhere)
                // Ctrl+Shift+N - Could be new window

                // Alt+B - Move back one word (readline)
                if (event.altKey && key === 'b') {
                    if (isSessionReady.current) {
                        window.api.writeToTerminal({ id: terminalId, data: '\x1bb' }); // ESC b
                    }
                    return false;
                }

                // Alt+F - Move forward one word (readline)
                if (event.altKey && key === 'f') {
                    if (isSessionReady.current) {
                        window.api.writeToTerminal({ id: terminalId, data: '\x1bf' }); // ESC f
                    }
                    return false;
                }

                // Alt+D - Delete word after cursor
                if (event.altKey && key === 'd') {
                    if (isSessionReady.current) {
                        window.api.writeToTerminal({ id: terminalId, data: '\x1bd' }); // ESC d
                    }
                    return false;
                }

                // Alt+Backspace - Delete word before cursor
                if (event.altKey && event.key === 'Backspace') {
                    if (isSessionReady.current) {
                        window.api.writeToTerminal({ id: terminalId, data: '\x1b\x7f' }); // ESC DEL
                    }
                    return false;
                }

                // Ctrl+Left Arrow - Move back one word
                if (isMeta && event.key === 'ArrowLeft') {
                    if (isSessionReady.current) {
                        window.api.writeToTerminal({ id: terminalId, data: '\x1bb' });
                    }
                    return false;
                }

                // Ctrl+Right Arrow - Move forward one word
                if (isMeta && event.key === 'ArrowRight') {
                    if (isSessionReady.current) {
                        window.api.writeToTerminal({ id: terminalId, data: '\x1bf' });
                    }
                    return false;
                }

                // Ctrl+N - Create new text file (app-level shortcut)
                if (event.ctrlKey && !event.metaKey && !event.shiftKey && key === 'n') {
                    event.preventDefault();
                    event.stopPropagation();
                    // Trigger the menu-new-text-file event via IPC
                    (window as any).api?.triggerNewTextFile?.();
                    return false;
                }

                // Ctrl+T - New browser tab (app-level shortcut)
                if (event.ctrlKey && !event.metaKey && !event.shiftKey && key === 't') {
                    event.preventDefault();
                    event.stopPropagation();
                    // Trigger the browser-new-tab event via IPC
                    (window as any).api?.triggerBrowserNewTab?.();
                    return false;
                }

                return true;
            });
        }

        let isEffectCancelled = false;

        // Only reinitialize if session isn't already ready
        if (isSessionReady.current) return;

        isSessionReady.current = false;
        // Don't clear or show message yet - wait to see if we're reconnecting

        const dataCallback = (_, { id, data }) => {
            if (id === terminalId && !isEffectCancelled) {
                xtermInstance.current?.write(data);
                // Capture output in buffer for chat context
                terminalOutputBuffer.current.push(data);
                // Keep buffer size manageable - trim to last N lines
                const fullOutput = terminalOutputBuffer.current.join('');
                const lines = fullOutput.split('\n');
                if (lines.length > MAX_TERMINAL_CONTEXT_LINES) {
                    terminalOutputBuffer.current = [lines.slice(-MAX_TERMINAL_CONTEXT_LINES).join('\n')];
                }
            }
        };
        const closedCallback = (_, { id }) => {
            if (id === terminalId && !isEffectCancelled) {
                isSessionReady.current = false;
                xtermInstance.current?.write('\r\n[Session Closed]\r\n');
            }
        };

        const removeDataListener = window.api.onTerminalData(dataCallback);
        const removeClosedListener = window.api.onTerminalClosed(closedCallback);
        const inputHandler = xtermInstance.current.onData(input => {
            if (isSessionReady.current && !isEffectCancelled) {
                window.api.writeToTerminal({ id: terminalId, data: input });
            }
        });

        const initBackendSession = async () => {
            try {
                fitAddonRef.current?.fit();
                const result = await window.api.createTerminalSession({
                    id: terminalId,
                    cwd: initialPathRef.current,
                    cols: xtermInstance.current.cols,
                    rows: xtermInstance.current.rows,
                    shellType: shellType
                });
                if (isEffectCancelled) return;
                if (result.success) {
                    isSessionReady.current = true;
                    setActiveShell(result.shell || 'system');
                    // Immediately send resize to ensure PTY knows exact dimensions
                    fitAddonRef.current?.fit();
                    window.api.resizeTerminal?.({
                        id: terminalId,
                        cols: xtermInstance.current.cols,
                        rows: xtermInstance.current.rows
                    });
                    if (activeContentPaneId === nodeId) {
                        xtermInstance.current.focus();
                    }
                    // Check if this is the first terminal startup (not a reconnection)
                    // result.reconnected would be true if session already existed
                    const hasBeenPrompted = localStorage.getItem(SHELL_PROMPT_KEY);
                    if (!hasBeenPrompted && result.shell === 'system') {
                        setShowShellPrompt(true);
                    }
                } else {
                    xtermInstance.current.write(`[FATAL] Backend failed: ${result.error}\r\n`);
                }
            } catch (err) {
                if (!isEffectCancelled) xtermInstance.current.write(`[FATAL] IPC Error: ${err.message}\r\n`);
            }
        };

        // Load Python environment info for display
        const loadPythonEnv = async () => {
            try {
                const envConfig = await (window as any).api?.pythonEnvGet?.(initialPathRef.current);
                if (envConfig) {
                    if (envConfig.type === 'venv' || envConfig.type === 'uv') {
                        setPythonEnv(`${envConfig.type}:${envConfig.venvPath || '.venv'}`);
                    } else if (envConfig.type === 'pyenv') {
                        setPythonEnv(`pyenv:${envConfig.pyenvVersion}`);
                    } else if (envConfig.type === 'conda') {
                        setPythonEnv(`conda:${envConfig.condaEnv}`);
                    } else if (envConfig.type === 'custom') {
                        setPythonEnv('custom');
                    }
                }
            } catch (e) {
                // No Python env configured
            }
        };

        initBackendSession();
        loadPythonEnv();

        return () => {
            isEffectCancelled = true;
            inputHandler.dispose();
            removeDataListener();
            removeClosedListener();
            window.api.closeTerminalSession(terminalId);
        };
    }, [terminalId, shellType]); // Note: currentPath removed - use initialPathRef to avoid re-creating session on navigation

    useEffect(() => {
        if (activeContentPaneId === nodeId && xtermInstance.current) {
            xtermInstance.current.focus();
        }
    }, [activeContentPaneId, nodeId]);

    // Update terminal theme when dark mode changes
    useEffect(() => {
        if (xtermInstance.current) {
            const darkTheme = {
                background: '#1a1b26',
                foreground: '#c0caf5',
                cursor: '#c0caf5',
                cursorAccent: '#1a1b26',
                selectionBackground: '#33467c',
            };
            const lightTheme = {
                background: '#6dbf9e',
                foreground: '#0f3d2d',
                cursor: '#0f3d2d',
                cursorAccent: '#6dbf9e',
                selectionBackground: '#4a9a7a',
            };
            xtermInstance.current.options.theme = isDarkMode ? darkTheme : lightTheme;
        }
    }, [isDarkMode]);

    // Apply all terminal settings when changed
    useEffect(() => {
        if (xtermInstance.current) {
            xtermInstance.current.options.fontSize = fontSize;
            xtermInstance.current.options.fontFamily = fontFamily;
            xtermInstance.current.options.cursorStyle = cursorStyle;
            xtermInstance.current.options.cursorBlink = cursorBlink;
            xtermInstance.current.options.lineHeight = lineHeight;
            xtermInstance.current.options.scrollback = scrollback;
            xtermInstance.current.options.letterSpacing = letterSpacing;
            xtermInstance.current.options.fontWeight = fontWeight;
            xtermInstance.current.options.fontWeightBold = fontWeightBold;
            xtermInstance.current.options.drawBoldTextInBrightColors = drawBoldTextInBrightColors;
            xtermInstance.current.options.minimumContrastRatio = minimumContrastRatio;
            xtermInstance.current.options.bellStyle = bellStyle;
            fitAddonRef.current?.fit();

            // Save all settings to localStorage
            localStorage.setItem('terminal-font-size', String(fontSize));
            localStorage.setItem('terminal-font-family', fontFamily);
            localStorage.setItem('terminal-cursor-style', cursorStyle);
            localStorage.setItem('terminal-cursor-blink', String(cursorBlink));
            localStorage.setItem('terminal-line-height', String(lineHeight));
            localStorage.setItem('terminal-scrollback', String(scrollback));
            localStorage.setItem('terminal-letter-spacing', String(letterSpacing));
            localStorage.setItem('terminal-font-weight', fontWeight);
            localStorage.setItem('terminal-font-weight-bold', fontWeightBold);
            localStorage.setItem('terminal-bold-bright', String(drawBoldTextInBrightColors));
            localStorage.setItem('terminal-contrast-ratio', String(minimumContrastRatio));
            localStorage.setItem('terminal-bell-style', bellStyle);
            localStorage.setItem('terminal-copy-on-select', String(copyOnSelect));
            localStorage.setItem('terminal-right-click-paste', String(rightClickPaste));
            localStorage.setItem('terminal-mac-option-meta', String(macOptionIsMeta));
            localStorage.setItem('terminal-alt-click-cursor', String(altClickMoveCursor));
            localStorage.setItem('terminal-theme', terminalTheme);
            localStorage.setItem('terminal-custom-colors', JSON.stringify(customColors));
            localStorage.setItem('terminal-default-shell', defaultShell);

            // Apply theme colors
            if (terminalTheme === 'custom') {
                xtermInstance.current.options.theme = {
                    background: customColors.background,
                    foreground: customColors.foreground,
                    cursor: customColors.cursor,
                    selectionBackground: customColors.selection,
                    black: customColors.black,
                    red: customColors.red,
                    green: customColors.green,
                    yellow: customColors.yellow,
                    blue: customColors.blue,
                    magenta: customColors.magenta,
                    cyan: customColors.cyan,
                    white: customColors.white
                };
            } else if (THEME_PRESETS[terminalTheme]) {
                const preset = THEME_PRESETS[terminalTheme];
                xtermInstance.current.options.theme = {
                    background: preset.background,
                    foreground: preset.foreground,
                    cursor: preset.cursor,
                    selectionBackground: preset.selection,
                    black: preset.black,
                    red: preset.red,
                    green: preset.green,
                    yellow: preset.yellow,
                    blue: preset.blue,
                    magenta: preset.magenta,
                    cyan: preset.cyan,
                    white: preset.white
                };
            }

            xtermInstance.current.options.rightClickSelectsWord = rightClickPaste;
            xtermInstance.current.options.macOptionIsMeta = macOptionIsMeta;
            xtermInstance.current.options.altClickMovesCursor = altClickMoveCursor;
        }
    }, [fontSize, fontFamily, cursorStyle, cursorBlink, lineHeight, scrollback, letterSpacing, fontWeight, fontWeightBold, drawBoldTextInBrightColors, minimumContrastRatio, bellStyle, copyOnSelect, rightClickPaste, macOptionIsMeta, altClickMoveCursor, terminalTheme, customColors, defaultShell]);

    if (!paneData) return null;

    return (
        <div
            className="flex-1 flex flex-col theme-bg-secondary relative h-full"
            onContextMenu={handleContextMenu}
            data-terminal="true"
        >
            {/* Settings button */}
            <button
                onClick={() => setShowSettings(!showSettings)}
                className="absolute top-2 right-2 z-20 p-1.5 rounded hover:bg-gray-700/50 text-gray-400 hover:text-white transition-colors"
                title="Terminal Settings"
            >
                <Settings size={14}/>
            </button>

            {/* Settings panel */}
            {showSettings && (
                <div className="absolute top-10 right-2 z-30 w-80 bg-gray-800 rounded-lg border border-gray-700 shadow-xl overflow-hidden">
                    <div className="flex items-center justify-between p-3 border-b border-gray-700">
                        <span className="text-sm font-medium">Terminal Settings</span>
                        <button onClick={() => setShowSettings(false)} className="p-1 hover:bg-gray-700 rounded">
                            <X size={14}/>
                        </button>
                    </div>

                    {/* Tabs */}
                    <div className="flex border-b border-gray-700">
                        {(['font', 'cursor', 'behavior', 'theme'] as const).map(tab => (
                            <button
                                key={tab}
                                onClick={() => setSettingsTab(tab)}
                                className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                                    settingsTab === tab
                                        ? 'bg-gray-700 text-white border-b-2 border-purple-500'
                                        : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
                                }`}
                            >
                                {tab.charAt(0).toUpperCase() + tab.slice(1)}
                            </button>
                        ))}
                    </div>

                    <div className="p-3 max-h-80 overflow-y-auto">
                        {settingsTab === 'font' && (
                            <div className="space-y-3">
                                <div>
                                    <label className="text-xs text-gray-400 mb-1 block">Font Family</label>
                                    <select
                                        value={fontFamily}
                                        onChange={(e) => setFontFamily(e.target.value)}
                                        className="w-full text-xs bg-gray-700 border border-gray-600 rounded px-2 py-1.5"
                                    >
                                        <option value='"Fira Code", monospace'>Fira Code</option>
                                        <option value='"JetBrains Mono", monospace'>JetBrains Mono</option>
                                        <option value='"Source Code Pro", monospace'>Source Code Pro</option>
                                        <option value='"SF Mono", monospace'>SF Mono</option>
                                        <option value='Menlo, monospace'>Menlo</option>
                                        <option value='Monaco, monospace'>Monaco</option>
                                        <option value='"Cascadia Code", monospace'>Cascadia Code</option>
                                        <option value='Consolas, monospace'>Consolas</option>
                                        <option value='"IBM Plex Mono", monospace'>IBM Plex Mono</option>
                                        <option value='"Roboto Mono", monospace'>Roboto Mono</option>
                                        <option value='"Ubuntu Mono", monospace'>Ubuntu Mono</option>
                                        <option value='"Hack", monospace'>Hack</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs text-gray-400 mb-1 block">Font Size: {fontSize}px</label>
                                    <input
                                        type="range"
                                        min={8}
                                        max={32}
                                        value={fontSize}
                                        onChange={(e) => setFontSize(parseInt(e.target.value))}
                                        className="w-full accent-purple-500"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-gray-400 mb-1 block">Line Height: {lineHeight.toFixed(1)}</label>
                                    <input
                                        type="range"
                                        min={1}
                                        max={2}
                                        step={0.1}
                                        value={lineHeight}
                                        onChange={(e) => setLineHeight(parseFloat(e.target.value))}
                                        className="w-full accent-purple-500"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-gray-400 mb-1 block">Letter Spacing: {letterSpacing}px</label>
                                    <input
                                        type="range"
                                        min={-2}
                                        max={5}
                                        step={0.5}
                                        value={letterSpacing}
                                        onChange={(e) => setLetterSpacing(parseFloat(e.target.value))}
                                        className="w-full accent-purple-500"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="text-xs text-gray-400 mb-1 block">Font Weight</label>
                                        <select
                                            value={fontWeight}
                                            onChange={(e) => setFontWeight(e.target.value as any)}
                                            className="w-full text-xs bg-gray-700 border border-gray-600 rounded px-2 py-1.5"
                                        >
                                            <option value="normal">Normal</option>
                                            <option value="bold">Bold</option>
                                            <option value="100">100</option>
                                            <option value="200">200</option>
                                            <option value="300">300</option>
                                            <option value="400">400</option>
                                            <option value="500">500</option>
                                            <option value="600">600</option>
                                            <option value="700">700</option>
                                            <option value="800">800</option>
                                            <option value="900">900</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-400 mb-1 block">Bold Weight</label>
                                        <select
                                            value={fontWeightBold}
                                            onChange={(e) => setFontWeightBold(e.target.value as any)}
                                            className="w-full text-xs bg-gray-700 border border-gray-600 rounded px-2 py-1.5"
                                        >
                                            <option value="normal">Normal</option>
                                            <option value="bold">Bold</option>
                                            <option value="100">100</option>
                                            <option value="200">200</option>
                                            <option value="300">300</option>
                                            <option value="400">400</option>
                                            <option value="500">500</option>
                                            <option value="600">600</option>
                                            <option value="700">700</option>
                                            <option value="800">800</option>
                                            <option value="900">900</option>
                                        </select>
                                    </div>
                                </div>
                                <label className="flex items-center gap-2 text-xs cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={drawBoldTextInBrightColors}
                                        onChange={(e) => setDrawBoldTextInBrightColors(e.target.checked)}
                                        className="accent-purple-500"
                                    />
                                    <span className="text-gray-300">Bold text in bright colors</span>
                                </label>
                            </div>
                        )}

                        {settingsTab === 'cursor' && (
                            <div className="space-y-3">
                                <div>
                                    <label className="text-xs text-gray-400 mb-1 block">Cursor Style</label>
                                    <div className="grid grid-cols-3 gap-1">
                                        {(['block', 'underline', 'bar'] as const).map(style => (
                                            <button
                                                key={style}
                                                onClick={() => setCursorStyle(style)}
                                                className={`px-3 py-2 text-xs rounded flex flex-col items-center gap-1 ${
                                                    cursorStyle === style
                                                        ? 'bg-purple-600 text-white'
                                                        : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                                                }`}
                                            >
                                                <span className="font-mono text-lg">
                                                    {style === 'block' ? '█' : style === 'underline' ? '_' : '│'}
                                                </span>
                                                <span>{style}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <label className="flex items-center gap-2 text-xs cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={cursorBlink}
                                        onChange={(e) => setCursorBlink(e.target.checked)}
                                        className="accent-purple-500"
                                    />
                                    <span className="text-gray-300">Cursor blink</span>
                                </label>
                                <div>
                                    <label className="text-xs text-gray-400 mb-1 block">Minimum Contrast: {minimumContrastRatio.toFixed(1)}</label>
                                    <input
                                        type="range"
                                        min={1}
                                        max={21}
                                        step={0.5}
                                        value={minimumContrastRatio}
                                        onChange={(e) => setMinimumContrastRatio(parseFloat(e.target.value))}
                                        className="w-full accent-purple-500"
                                    />
                                    <p className="text-[10px] text-gray-500 mt-1">Higher values ensure better readability</p>
                                </div>
                            </div>
                        )}

                        {settingsTab === 'behavior' && (
                            <div className="space-y-3">
                                <div>
                                    <label className="text-xs text-gray-400 mb-1 block">Scrollback Lines: {scrollback}</label>
                                    <input
                                        type="range"
                                        min={100}
                                        max={10000}
                                        step={100}
                                        value={scrollback}
                                        onChange={(e) => setScrollback(parseInt(e.target.value))}
                                        className="w-full accent-purple-500"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-gray-400 mb-1 block">Default Shell</label>
                                    <select
                                        value={defaultShell}
                                        onChange={(e) => setDefaultShell(e.target.value)}
                                        className="w-full text-xs bg-gray-700 border border-gray-600 rounded px-2 py-1.5"
                                    >
                                        <option value="system">System (Bash/Zsh)</option>
                                        <option value="npcsh">npcsh</option>
                                        <option value="python3">Python REPL</option>
                                        <option value="node">Node.js REPL</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs text-gray-400 mb-1 block">Bell Style</label>
                                    <select
                                        value={bellStyle}
                                        onChange={(e) => setBellStyle(e.target.value as any)}
                                        className="w-full text-xs bg-gray-700 border border-gray-600 rounded px-2 py-1.5"
                                    >
                                        <option value="none">None</option>
                                        <option value="sound">Sound</option>
                                        <option value="visual">Visual</option>
                                        <option value="both">Both</option>
                                    </select>
                                </div>
                                <div className="space-y-2 pt-2 border-t border-gray-700">
                                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={copyOnSelect}
                                            onChange={(e) => setCopyOnSelect(e.target.checked)}
                                            className="accent-purple-500"
                                        />
                                        <span className="text-gray-300">Copy on select</span>
                                    </label>
                                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={rightClickPaste}
                                            onChange={(e) => setRightClickPaste(e.target.checked)}
                                            className="accent-purple-500"
                                        />
                                        <span className="text-gray-300">Right-click to paste</span>
                                    </label>
                                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={macOptionIsMeta}
                                            onChange={(e) => setMacOptionIsMeta(e.target.checked)}
                                            className="accent-purple-500"
                                        />
                                        <span className="text-gray-300">Option as Meta key (Mac)</span>
                                    </label>
                                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={altClickMoveCursor}
                                            onChange={(e) => setAltClickMoveCursor(e.target.checked)}
                                            className="accent-purple-500"
                                        />
                                        <span className="text-gray-300">Alt+Click moves cursor</span>
                                    </label>
                                </div>
                                <div className="pt-2 border-t border-gray-700 space-y-2">
                                    <button
                                        onClick={handleClear}
                                        className="w-full text-xs px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded"
                                    >
                                        Clear Terminal
                                    </button>
                                </div>
                            </div>
                        )}

                        {settingsTab === 'theme' && (
                            <div className="space-y-3">
                                <div>
                                    <label className="text-xs text-gray-400 mb-1 block">Theme</label>
                                    <select
                                        value={terminalTheme}
                                        onChange={(e) => {
                                            const theme = e.target.value;
                                            setTerminalTheme(theme);
                                            if (theme !== 'custom' && THEME_PRESETS[theme]) {
                                                setCustomColors(THEME_PRESETS[theme]);
                                            }
                                        }}
                                        className="w-full text-xs bg-gray-700 border border-gray-600 rounded px-2 py-1.5"
                                    >
                                        <option value="default">Default</option>
                                        <option value="dracula">Dracula</option>
                                        <option value="monokai">Monokai</option>
                                        <option value="solarized-dark">Solarized Dark</option>
                                        <option value="solarized-light">Solarized Light</option>
                                        <option value="nord">Nord</option>
                                        <option value="gruvbox">Gruvbox</option>
                                        <option value="one-dark">One Dark</option>
                                        <option value="light">Light</option>
                                        <option value="custom">Custom</option>
                                    </select>
                                </div>

                                <div className="space-y-2">
                                    <p className="text-xs text-gray-400">Colors {terminalTheme !== 'custom' && '(select Custom to edit)'}</p>
                                    <div className="grid grid-cols-1 gap-2">
                                        {Object.entries(customColors).map(([key, value]) => (
                                            <div key={key} className="flex items-center gap-2">
                                                <input
                                                    type="color"
                                                    value={value}
                                                    onChange={(e) => {
                                                        setTerminalTheme('custom');
                                                        setCustomColors(prev => ({ ...prev, [key]: e.target.value }));
                                                    }}
                                                    className="w-6 h-6 rounded border-0 cursor-pointer"
                                                />
                                                <span className="text-[10px] text-gray-400 capitalize w-20">{key}</span>
                                                <input
                                                    type="text"
                                                    value={value}
                                                    onChange={(e) => {
                                                        setTerminalTheme('custom');
                                                        setCustomColors(prev => ({ ...prev, [key]: e.target.value }));
                                                    }}
                                                    className="flex-1 text-[10px] bg-gray-700 border border-gray-600 rounded px-2 py-1 font-mono"
                                                    placeholder="#000000"
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="pt-2 border-t border-gray-700">
                                    <button
                                        onClick={() => {
                                            // Reset all settings to defaults
                                            setFontSize(14);
                                            setFontFamily('"Fira Code", monospace');
                                            setCursorStyle('block');
                                            setCursorBlink(true);
                                            setLineHeight(1.2);
                                            setScrollback(1000);
                                            setLetterSpacing(0);
                                            setFontWeight('normal');
                                            setFontWeightBold('bold');
                                            setDrawBoldTextInBrightColors(true);
                                            setMinimumContrastRatio(1);
                                            setBellStyle('none');
                                            setTerminalTheme('default');
                                            setCopyOnSelect(false);
                                            setRightClickPaste(true);
                                            setMacOptionIsMeta(false);
                                            setAltClickMoveCursor(true);
                                        }}
                                        className="w-full text-xs px-3 py-2 bg-red-900/50 hover:bg-red-900/70 text-red-300 rounded"
                                    >
                                        Reset All to Defaults
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <div ref={terminalRef} className="w-full h-full" />

            {contextMenu && (
                <>
                    <div
                        className="fixed inset-0 z-40"
                        onClick={() => setContextMenu(null)}
                    />
                    <div
                        className="fixed theme-bg-tertiary shadow-lg rounded-md py-1 z-50 min-w-[140px] border theme-border"
                        style={{ top: contextMenu.y, left: contextMenu.x }}
                    >
                        <button
                            onClick={handleCopy}
                            className="w-full px-3 py-1.5 text-left text-sm theme-text hover:bg-blue-500/20"
                        >
                            Copy <span className="float-right text-xs opacity-50">Ctrl+Shift+C</span>
                        </button>
                        <button
                            onClick={handlePaste}
                            className="w-full px-3 py-1.5 text-left text-sm theme-text hover:bg-blue-500/20"
                        >
                            Paste <span className="float-right text-xs opacity-50">Ctrl+V</span>
                        </button>
                        <div className="border-t theme-border my-1" />
                        <button
                            onClick={handleSelectAll}
                            className="w-full px-3 py-1.5 text-left text-sm theme-text hover:bg-blue-500/20"
                        >
                            Select All
                        </button>
                        <button
                            onClick={handleClear}
                            className="w-full px-3 py-1.5 text-left text-sm theme-text hover:bg-blue-500/20"
                        >
                            Clear
                        </button>
                    </div>
                </>
            )}

            {showShellPrompt && (
                <div className="absolute top-0 left-0 right-0 bg-blue-900/90 border-b border-blue-700 px-3 py-2 z-30 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-blue-100">
                        <span className="text-blue-300">Tip:</span>
                        <span>Source your shell profile to load aliases and environment?</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleSourceProfile}
                            className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded"
                        >
                            Source Profile
                        </button>
                        <button
                            onClick={handleDismissPrompt}
                            className="px-3 py-1 text-xs bg-gray-600 hover:bg-gray-500 text-white rounded"
                        >
                            Dismiss
                        </button>
                    </div>
                </div>
            )}


        </div>
    );
};

// Custom comparison to prevent reload on pane resize
const arePropsEqual = (prevProps: any, nextProps: any) => {
    return prevProps.nodeId === nextProps.nodeId;
};

export default memo(TerminalView, arePropsEqual);