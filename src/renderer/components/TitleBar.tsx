import React, { useState, useEffect, useRef } from 'react';
import { Minus, Square, X, Maximize2, Wrench } from 'lucide-react';

interface MenuItem {
  label: string;
  action?: string;
  url?: string;
  separator?: boolean;
  shortcut?: string;
}

interface Menu {
  label: string;
  items: MenuItem[];
}

const menus: Menu[] = [
  {
    label: 'File',
    items: [
      { label: 'New Chat', action: 'menu-new-chat' },
      { label: 'New Terminal', action: 'menu-new-terminal' },
      { label: 'Reopen Closed Tab', action: 'menu-reopen-tab' },
      { label: 'New Browser Tab', action: 'browser-new-tab' },
      { separator: true, label: '' },
      { label: 'Open File...', action: 'menu-open-file' },
      { label: 'Open Folder...', action: 'open-folder-picker' },
      { separator: true, label: '' },
      { label: 'Save', action: 'menu-save-file' },
      { label: 'Save As...', action: 'menu-save-file-as' },
      { separator: true, label: '' },
      { label: 'Close Tab', action: 'menu-close-tab' },
    ]
  },
  {
    label: 'Edit',
    items: [
      { label: 'Find', action: 'menu-find' },
      { label: 'Find in Files', action: 'menu-global-search' },
    ]
  },
  {
    label: 'View',
    items: [
      { label: 'Command Palette', action: 'menu-command-palette' },
      { separator: true, label: '' },
      { label: 'Toggle Sidebar', action: 'menu-toggle-sidebar' },
      { label: 'Toggle Hide UI', action: 'menu-toggle-hide-ui' },
      { separator: true, label: '' },
      { label: 'Reload', action: 'reload' },
      { label: 'Force Reload', action: 'forceReload' },
      { label: 'Toggle Developer Tools', action: 'toggleDevTools' },
      { separator: true, label: '' },
      { label: 'Actual Size', action: 'zoom-reset' },
      { label: 'Zoom In', action: 'zoom-in' },
      { label: 'Zoom Out', action: 'zoom-out' },
      { separator: true, label: '' },
      { label: 'Toggle Fullscreen', action: 'toggleFullScreen' },
    ]
  },
  {
    label: 'Window',
    items: [
      { label: 'New Window', action: 'menu-new-window' },
      { separator: true, label: '' },
      { label: 'Minimize', action: 'minimize' },
      { label: 'Zoom', action: 'zoom' },
      { label: 'Close', action: 'close' },
      { separator: true, label: '' },
      { label: 'Split Pane Right', action: 'menu-split-right' },
      { label: 'Split Pane Down', action: 'menu-split-down' },
    ]
  },
  {
    label: 'Help',
    items: [
      { label: 'Help & Documentation', action: 'menu-open-help' },
      { label: 'Keyboard Shortcuts', action: 'menu-show-shortcuts' },
      { separator: true, label: '' },
      { label: 'Report Issue', action: 'openExternal', url: 'https://github.com/NPC-Worldwide/incognide/issues' },
      { label: 'Visit Website', action: 'openExternal', url: 'https://incognide.com' },
      { separator: true, label: '' },
      { label: 'About Incognide', action: 'about' },
    ]
  }
];

const MenuDropdowns: React.FC = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpenIndex(null);
      }
    };
    window.addEventListener('mousedown', handleClick);
    return () => window.removeEventListener('mousedown', handleClick);
  }, []);

  const handleClick = (item: MenuItem) => {
    if (item.action) {
      (window as any).api?.menuAction?.(item.action, item.url);
    }
    setOpenIndex(null);
  };

  return (
    <div ref={containerRef} className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' }}>
      {menus.map((menu, idx) => (
        <div key={menu.label} className="relative">
          <button
            onMouseEnter={() => { if (openIndex !== null) setOpenIndex(idx); }}
            onClick={() => setOpenIndex(openIndex === idx ? null : idx)}
            className={`px-2 py-0.5 rounded theme-text-primary transition-colors text-[11px] ${openIndex === idx ? 'theme-bg-tertiary' : 'hover:theme-bg-tertiary'}`}
          >
            {menu.label}
          </button>
          {openIndex === idx && (
            <div className="absolute left-0 top-full mt-0.5 min-w-[180px] py-1 theme-bg-secondary border theme-border rounded shadow-xl z-[100]">
              {menu.items.map((item, i) => (
                item.separator ? (
                  <div key={i} className="my-1 border-t theme-border" />
                ) : (
                  <button
                    key={item.label}
                    onClick={() => handleClick(item)}
                    className="w-full text-left px-3 py-1 theme-text-primary hover:theme-bg-tertiary flex items-center justify-between text-[11px]"
                  >
                    <span>{item.label}</span>
                    {item.shortcut && <span className="text-[10px] theme-text-muted ml-4">{item.shortcut}</span>}
                  </button>
                )
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

const TitleBar: React.FC = () => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    setIsMac(navigator.platform.startsWith('Mac'));

    if (window.api?.windowState) {
      window.api.windowState.isMaximized().then(setIsMaximized);
    }

    const unsubscribe = window.api?.onWindowStateChange?.((state) => {
      setIsMaximized(state.isMaximized);
    });

    return () => {
      unsubscribe?.();
    };
  }, []);

  const handleMinimize = () => {
    window.api?.windowControls?.minimize?.();
  };

  const handleMaximize = () => {
    window.api?.windowControls?.maximize?.();
  };

  const handleClose = () => {
    window.api?.windowControls?.close?.();
  };

  const handleToggleDevTools = () => {
    window.api?.windowControls?.toggleDevTools?.();
  };

  const devToolsButton = (
    <button
      onClick={handleToggleDevTools}
      className="w-9 h-9 flex items-center justify-center theme-text-muted hover:theme-bg-tertiary hover:theme-text-primary transition-colors"
      title="Toggle Developer Tools"
      style={{ WebkitAppRegion: 'no-drag' }}
    >
      <Wrench size={14} />
    </button>
  );

  if (isMac) {
    return (
      <div
        className="h-8 flex-shrink-0 flex items-center select-none pl-20 theme-bg-secondary border-b theme-border"
        style={{ WebkitAppRegion: 'drag' }}
      >
        <div className="px-2">
          <MenuDropdowns />
        </div>
        <div className="flex-1" />
        <div className="px-1">
          {devToolsButton}
        </div>
      </div>
    );
  }

  return (
    <div
      className="h-9 flex-shrink-0 flex items-center justify-between theme-bg-secondary border-b theme-border select-none"
      style={{ WebkitAppRegion: 'drag' }}
    >
      <div className="px-2">
        <MenuDropdowns />
      </div>

      <div className="flex items-center" style={{ WebkitAppRegion: 'no-drag' }}>
        {devToolsButton}
        <button
          onClick={handleMinimize}
          className="w-12 h-9 flex items-center justify-center theme-text-muted hover:theme-bg-tertiary hover:theme-text-primary transition-colors"
          title="Minimize"
        >
          <Minus size={14} />
        </button>
        <button
          onClick={handleMaximize}
          className="w-12 h-9 flex items-center justify-center theme-text-muted hover:theme-bg-tertiary hover:theme-text-primary transition-colors"
          title={isMaximized ? 'Restore' : 'Maximize'}
        >
          {isMaximized ? <Square size={12} /> : <Maximize2 size={12} />}
        </button>
        <button
          onClick={handleClose}
          className="w-12 h-9 flex items-center justify-center theme-text-muted hover:bg-red-600 hover:text-white transition-colors"
          title="Close"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
};

export default TitleBar;
