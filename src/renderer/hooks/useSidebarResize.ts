import { useState, useCallback, useEffect } from 'react';

export function useSidebarResize() {
    const [sidebarWidth, setSidebarWidth] = useState(220);
    const [inputHeight, setInputHeight] = useState(200);
    const [isResizingSidebar, setIsResizingSidebar] = useState(false);
    const [isResizingInput, setIsResizingInput] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

    const [topBarHeight, setTopBarHeight] = useState<number>(() => {
        const saved = localStorage.getItem('npcStudio_topBarHeight');
        return saved ? parseInt(saved) : 48;
    });
    const [bottomBarHeight, setBottomBarHeight] = useState<number>(() => {
        const saved = localStorage.getItem('npcStudio_bottomBarHeight');
        return saved ? parseInt(saved) : 48;
    });
    const [isResizingTopBar, setIsResizingTopBar] = useState(false);
    const [isResizingBottomBar, setIsResizingBottomBar] = useState(false);
    const [topBarCollapsed, setTopBarCollapsed] = useState<boolean>(() => {
        const saved = localStorage.getItem('npcStudio_topBarCollapsed');
        return saved === 'true';
    });

    // Sidebar resize handler
    const handleSidebarResize = useCallback((e: MouseEvent) => {
        if (!isResizingSidebar) return;
        const newWidth = e.clientX;
        if (newWidth >= 150 && newWidth <= 500) {
            setSidebarWidth(newWidth);
        }
    }, [isResizingSidebar]);

    // Input area resize handler
    const handleInputResize = useCallback((e: MouseEvent) => {
        if (!isResizingInput) return;
        const newHeight = window.innerHeight - e.clientY;
        if (newHeight >= 100 && newHeight <= 600) {
            setInputHeight(newHeight);
        }
    }, [isResizingInput]);

    // Sidebar/input resize mouse event listeners with body class management
    useEffect(() => {
        const handleMouseUp = () => {
            setIsResizingSidebar(false);
            setIsResizingInput(false);
            document.body.classList.remove('resizing-sidebar', 'resizing-input');
        };

        if (isResizingSidebar) {
            document.body.classList.add('resizing-sidebar');
            document.addEventListener('mousemove', handleSidebarResize);
            document.addEventListener('mouseup', handleMouseUp);
            return () => {
                document.body.classList.remove('resizing-sidebar');
                document.removeEventListener('mousemove', handleSidebarResize);
                document.removeEventListener('mouseup', handleMouseUp);
            };
        }

        if (isResizingInput) {
            document.body.classList.add('resizing-input');
            document.addEventListener('mousemove', handleInputResize);
            document.addEventListener('mouseup', handleMouseUp);
            return () => {
                document.body.classList.remove('resizing-input');
                document.removeEventListener('mousemove', handleInputResize);
                document.removeEventListener('mouseup', handleMouseUp);
            };
        }
    }, [isResizingSidebar, isResizingInput, handleSidebarResize, handleInputResize]);

    // Top/bottom bar resize handlers
    useEffect(() => {
        const handleTopBarResize = (e: MouseEvent) => {
            const newHeight = Math.max(32, Math.min(80, e.clientY));
            setTopBarHeight(newHeight);
            localStorage.setItem('npcStudio_topBarHeight', String(newHeight));
        };
        const handleBottomBarResize = (e: MouseEvent) => {
            const newHeight = Math.max(32, Math.min(80, window.innerHeight - e.clientY));
            setBottomBarHeight(newHeight);
            localStorage.setItem('npcStudio_bottomBarHeight', String(newHeight));
        };
        const handleMouseUp = () => {
            setIsResizingTopBar(false);
            setIsResizingBottomBar(false);
        };
        if (isResizingTopBar) {
            document.addEventListener('mousemove', handleTopBarResize);
            document.addEventListener('mouseup', handleMouseUp);
            return () => {
                document.removeEventListener('mousemove', handleTopBarResize);
                document.removeEventListener('mouseup', handleMouseUp);
            };
        }
        if (isResizingBottomBar) {
            document.addEventListener('mousemove', handleBottomBarResize);
            document.addEventListener('mouseup', handleMouseUp);
            return () => {
                document.removeEventListener('mousemove', handleBottomBarResize);
                document.removeEventListener('mouseup', handleMouseUp);
            };
        }
    }, [isResizingTopBar, isResizingBottomBar]);

    return {
        sidebarWidth, setSidebarWidth,
        inputHeight, setInputHeight,
        isResizingSidebar, setIsResizingSidebar,
        isResizingInput, setIsResizingInput,
        sidebarCollapsed, setSidebarCollapsed,
        topBarHeight, setTopBarHeight,
        bottomBarHeight, setBottomBarHeight,
        isResizingTopBar, setIsResizingTopBar,
        isResizingBottomBar, setIsResizingBottomBar,
        topBarCollapsed, setTopBarCollapsed,
        handleSidebarResize,
        handleInputResize,
    };
}
