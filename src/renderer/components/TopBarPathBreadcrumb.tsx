import React, { useState, useRef, useEffect } from 'react';
import { Folder, FolderOpen, ChevronRight, FolderPlus, Home } from 'lucide-react';

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
    baseDir: string;
    onPathChange: (path: string) => void;
    onOpenFolderPicker: () => void;
}

export const TopBarPathBreadcrumb: React.FC<TopBarPathBreadcrumbProps> = ({
    currentPath,
    baseDir,
    onPathChange,
    onOpenFolderPicker,
}) => {
    const [isHovered, setIsHovered] = useState(false);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const pathSegments = currentPath ? splitPath(currentPath) : [];
    const baseDirSegments = baseDir ? splitPath(baseDir) : [];

    // Find how many segments are shared with baseDir
    let sharedCount = 0;
    for (let i = 0; i < Math.min(baseDirSegments.length, pathSegments.length); i++) {
        if (baseDirSegments[i] === pathSegments[i]) {
            sharedCount++;
        } else break;
    }

    // Show: root name + relative path from baseDir
    const rootName = baseDirSegments[baseDirSegments.length - 1] || 'Workspace';
    const relativeParts = pathSegments.slice(sharedCount);

    const displayRootName = rootName === '.npcsh' ? 'Global' : rootName.startsWith('.') ? rootName.slice(1) : rootName;

    const handleSegmentClick = (index: number) => {
        // index is relative to pathSegments
        const newPath = joinPath(pathSegments.slice(0, index + 1), currentPath);
        onPathChange(newPath);
        setDropdownOpen(false);
    };

    const handleRootClick = () => {
        onPathChange(baseDir);
        setDropdownOpen(false);
    };

    // Truncate if too many segments
    const maxVisibleSegments = 3;
    const shouldTruncate = relativeParts.length > maxVisibleSegments;
    const visibleParts = shouldTruncate
        ? [...relativeParts.slice(0, 1), '...', ...relativeParts.slice(-2)]
        : relativeParts;

    return (
        <div
            ref={dropdownRef}
            className="relative flex items-center gap-1 px-2 py-1 rounded theme-hover cursor-pointer select-none"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onClick={() => setDropdownOpen(!dropdownOpen)}
        >
            {/* Root folder */}
            <button
                onClick={(e) => { e.stopPropagation(); handleRootClick(); }}
                className="flex items-center gap-1 text-purple-400 hover:text-purple-300 transition-colors"
                title={baseDir}
            >
                <Home size={14} />
                <span className="text-xs font-medium">{displayRootName}</span>
            </button>

            {/* Path segments */}
            {relativeParts.length > 0 && (
                <>
                    <ChevronRight size={12} className="theme-text-muted" />
                    {visibleParts.map((segment, i) => {
                        if (segment === '...') {
                            return (
                                <React.Fragment key="ellipsis">
                                    <span className="text-xs theme-text-muted">...</span>
                                    <ChevronRight size={12} className="theme-text-muted" />
                                </React.Fragment>
                            );
                        }

                        const isLast = i === visibleParts.length - 1;
                        // Find actual index in pathSegments
                        const actualIndex = shouldTruncate
                            ? (i === 0 ? sharedCount : sharedCount + relativeParts.length - (visibleParts.length - 1 - i))
                            : sharedCount + i;

                        return (
                            <React.Fragment key={i}>
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleSegmentClick(actualIndex); }}
                                    className={`flex items-center gap-1 text-xs transition-colors ${
                                        isLast
                                            ? 'text-yellow-400 font-medium'
                                            : 'theme-text-muted hover:theme-text-primary'
                                    }`}
                                    title={joinPath(pathSegments.slice(0, actualIndex + 1), currentPath)}
                                >
                                    {isLast ? <FolderOpen size={12} /> : <Folder size={12} />}
                                    <span>{segment}</span>
                                </button>
                                {!isLast && <ChevronRight size={12} className="theme-text-muted" />}
                            </React.Fragment>
                        );
                    })}
                </>
            )}

            {/* Browse button */}
            <button
                onClick={(e) => { e.stopPropagation(); onOpenFolderPicker(); }}
                className="ml-2 p-1 theme-hover rounded text-blue-400 hover:text-blue-300"
                title="Browse folders"
            >
                <FolderPlus size={14} />
            </button>

            {/* Dropdown for full path navigation */}
            {dropdownOpen && pathSegments.length > 0 && (
                <div className="absolute top-full left-0 mt-1 min-w-[200px] max-w-[400px] theme-bg-secondary border theme-border rounded-lg shadow-xl z-50 overflow-hidden">
                    <div className="p-2 border-b theme-border">
                        <div className="text-[10px] uppercase theme-text-muted mb-1">Full Path</div>
                        <div className="text-xs theme-text-primary font-mono truncate" title={currentPath}>
                            {currentPath}
                        </div>
                    </div>
                    <div className="p-2 max-h-48 overflow-y-auto">
                        <div className="text-[10px] uppercase theme-text-muted mb-1">Navigate To</div>
                        <button
                            onClick={handleRootClick}
                            className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded theme-hover text-left"
                        >
                            <Home size={12} className="text-purple-400" />
                            <span className="text-purple-400">{displayRootName}</span>
                        </button>
                        {pathSegments.slice(sharedCount).map((segment, i) => {
                            const actualIndex = sharedCount + i;
                            const isLast = actualIndex === pathSegments.length - 1;
                            return (
                                <button
                                    key={i}
                                    onClick={() => handleSegmentClick(actualIndex)}
                                    className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded theme-hover text-left"
                                    style={{ paddingLeft: `${(i + 1) * 12 + 8}px` }}
                                >
                                    {isLast ? (
                                        <FolderOpen size={12} className="text-yellow-400" />
                                    ) : (
                                        <Folder size={12} className="theme-text-muted" />
                                    )}
                                    <span className={isLast ? 'text-yellow-400 font-medium' : 'theme-text-muted'}>
                                        {segment}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

export default TopBarPathBreadcrumb;
