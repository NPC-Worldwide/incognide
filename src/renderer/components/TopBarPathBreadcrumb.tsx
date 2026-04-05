import React, { useState, useRef, useEffect } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';

const splitPath = (p: string): string[] => p.split(/[\\/]/).filter(Boolean);
const isWindowsPath = (p: string): boolean => /^[A-Za-z]:/.test(p);
const joinPath = (segments: string[], originalPath: string): string => {
    if (!segments.length) return originalPath;
    if (isWindowsPath(originalPath)) {
        return segments[0] + '\\' + segments.slice(1).join('\\');
    }
    return '/' + segments.join('/');
};

interface TopBarPathBreadcrumbProps {
    currentPath: string;
    onPathChange: (path: string) => void;
}

export const TopBarPathBreadcrumb: React.FC<TopBarPathBreadcrumbProps> = ({
    currentPath,
    onPathChange,
}) => {
    const [openSegmentIndex, setOpenSegmentIndex] = useState<number | null>(null);
    const [siblingFolders, setSiblingFolders] = useState<string[]>([]);
    const [loadingSiblings, setLoadingSiblings] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const pathSegments = currentPath ? splitPath(currentPath) : [];

    // Close dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setOpenSegmentIndex(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Load sibling folders when dropdown opens
    useEffect(() => {
        if (openSegmentIndex === null) {
            setSiblingFolders([]);
            return;
        }

        const loadSiblings = async () => {
            setLoadingSiblings(true);
            try {
                const parentPath = joinPath(pathSegments.slice(0, openSegmentIndex), currentPath);
                const contents = await (window as any).api?.readDirectory?.(parentPath);
                if (contents) {
                    const folders = contents
                        .filter((item: any) => item.isDirectory)
                        .map((item: any) => item.name)
                        .sort((a: string, b: string) => a.localeCompare(b));
                    setSiblingFolders(folders);
                }
            } catch (err) {
                console.error('Failed to load siblings:', err);
                setSiblingFolders([]);
            } finally {
                setLoadingSiblings(false);
            }
        };

        loadSiblings();
    }, [openSegmentIndex, currentPath, pathSegments]);

    const handleSegmentClick = (index: number, e: React.MouseEvent) => {
        e.stopPropagation();
        if (openSegmentIndex === index) {
            setOpenSegmentIndex(null);
        } else {
            setOpenSegmentIndex(index);
        }
    };

    const handleSelectFolder = (folderName: string) => {
        if (openSegmentIndex === null) return;
        const newPath = joinPath([...pathSegments.slice(0, openSegmentIndex), folderName], currentPath);
        onPathChange(newPath);
        setOpenSegmentIndex(null);
    };

    const handleNavigateToSegment = (index: number) => {
        const newPath = joinPath(pathSegments.slice(0, index + 1), currentPath);
        onPathChange(newPath);
        setOpenSegmentIndex(null);
    };

    if (!currentPath || pathSegments.length === 0) {
        return null;
    }

    return (
        <div ref={dropdownRef} className="flex items-center text-xs relative">
            {pathSegments.map((segment, index) => {
                const isLast = index === pathSegments.length - 1;
                const isOpen = openSegmentIndex === index;

                return (
                    <React.Fragment key={index}>
                        <div className="relative">
                            <button
                                onClick={(e) => handleSegmentClick(index, e)}
                                onDoubleClick={() => handleNavigateToSegment(index)}
                                className={`flex items-center gap-0.5 px-1 py-0.5 rounded hover:bg-white/10 transition-colors ${
                                    isLast ? 'theme-text-primary' : 'theme-text-muted hover:theme-text-primary'
                                }`}
                                title={`Click for siblings, double-click to navigate to ${segment}`}
                            >
                                <span>{segment}</span>
                                <ChevronDown size={10} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                            </button>

                            {/* Sibling folders dropdown */}
                            {isOpen && (
                                <div className="absolute top-full left-0 mt-1 min-w-[180px] max-w-[300px] max-h-[300px] overflow-y-auto theme-bg-secondary border theme-border rounded-lg shadow-xl z-50">
                                    {loadingSiblings ? (
                                        <div className="px-3 py-2 text-xs theme-text-muted">Loading...</div>
                                    ) : siblingFolders.length === 0 ? (
                                        <div className="px-3 py-2 text-xs theme-text-muted">No folders</div>
                                    ) : (
                                        siblingFolders.map((folder) => {
                                            const isCurrent = folder === segment;
                                            return (
                                                <button
                                                    key={folder}
                                                    onClick={() => handleSelectFolder(folder)}
                                                    className={`w-full px-3 py-1.5 text-xs text-left theme-hover flex items-center gap-2 ${
                                                        isCurrent ? 'bg-blue-500/20 text-blue-400' : 'theme-text-primary'
                                                    }`}
                                                >
                                                    <span className="truncate">{folder}</span>
                                                    {isCurrent && <span className="ml-auto text-[10px] theme-text-muted">current</span>}
                                                </button>
                                            );
                                        })
                                    )}
                                </div>
                            )}
                        </div>

                        {!isLast && (
                            <ChevronRight size={12} className="theme-text-muted mx-0.5 flex-shrink-0" />
                        )}
                    </React.Fragment>
                );
            })}
        </div>
    );
};

export default TopBarPathBreadcrumb;
