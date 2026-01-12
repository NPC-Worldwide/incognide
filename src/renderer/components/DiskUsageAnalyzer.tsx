import React, { useState, useEffect, useMemo } from 'react';
import { ChevronRight, ChevronDown, HardDrive, Folder, File, ArrowLeft, X } from 'lucide-react';
import { Pie } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend
} from 'chart.js';

// Register chart.js components
ChartJS.register(ArcElement, Tooltip, Legend);

interface DiskUsageAnalyzerProps {
  path?: string;
  currentPath?: string;
  isDarkMode?: boolean;
  isPane?: boolean; // When true, renders as pane content (fills container)
}

const DiskUsageAnalyzer: React.FC<DiskUsageAnalyzerProps> = ({ path, currentPath, isDarkMode = false, isPane = false }) => {
  const [folderTree, setFolderTree] = useState(null);
  const [expandedFolders, setExpandedFolders] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedPath, setSelectedPath] = useState(null);
  const [drillPath, setDrillPath] = useState<string | null>(null); // For drilling into subfolders
  const [previewItem, setPreviewItem] = useState<any>(null); // For popup preview on single click

  // Use home directory as fallback if no path provided
  const [homePath, setHomePath] = useState<string | null>(null);

  useEffect(() => {
    // Get home directory from electron - with fallback
    const getHome = async () => {
      try {
        if (window.api?.getHomeDir) {
          const dir = await window.api.getHomeDir();
          if (dir) {
            setHomePath(dir);
          } else {
            const isWindows = navigator.platform.startsWith('Win');
            setHomePath(isWindows ? 'C:\\Users' : '/Users');
          }
        } else {
          const fallback = navigator.platform.startsWith('Win') ? 'C:\\Users' : '/Users';
          setHomePath(fallback);
        }
      } catch (e) {
        setHomePath('/Users');
      }
    };
    getHome();
  }, []);

  // Priority: drillPath > path prop > currentPath prop > homePath > /Users fallback
  const basePath = (path && path.trim()) ? path : ((currentPath && currentPath.trim()) ? currentPath : (homePath || '/Users'));
  const effectivePath = drillPath || basePath;

  useEffect(() => {
    if (effectivePath) {
      analyzeFolder(effectivePath);
    }
  }, [effectivePath]);

  const analyzeFolder = async (folderPath) => {
    try {
      setLoading(true);
      setError(null);

      if (!folderPath) {
        setError('No folder path provided');
        return;
      }

      if (!window.api?.analyzeDiskUsage) {
        setError('Disk usage API not available');
        return;
      }

      const result = await window.api.analyzeDiskUsage(folderPath);

      if (!result) {
        setError(`Could not analyze folder: ${folderPath}`);
      } else {
        setFolderTree(result);
      }
    } catch (err) {
      setError(`Failed to analyze folder: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const getPercentage = (size, total) => {
    if (!total) return 0;
    return Math.round((size / total) * 100);
  };

  const getColorClass = (percentage) => {
    if (percentage > 50) return 'bg-red-500';
    if (percentage > 25) return 'bg-yellow-500';
    if (percentage > 10) return 'bg-blue-500';
    return 'bg-green-500';
  };

  const toggleFolder = (folderPath) => {
    setExpandedFolders((prev) => ({
      ...prev,
      [folderPath]: !prev[folderPath],
    }));
  };

  // Pie chart colors
  const pieColors = [
    '#8b5cf6', // purple
    '#3b82f6', // blue
    '#facc15', // yellow
    '#ef4444', // red
    '#22c55e', // green
    '#f97316', // orange
    '#06b6d4', // cyan
    '#ec4899', // pink
    '#84cc16', // lime
    '#a855f7', // violet
  ];

  // Prepare pie chart data from top-level children
  // Store sorted children for click handling
  const topItemsRef = useMemo(() => {
    if (!folderTree || !folderTree.children || folderTree.children.length === 0) {
      return [];
    }
    return [...folderTree.children].sort((a, b) => b.size - a.size).slice(0, 8);
  }, [folderTree]);

  const pieChartData = useMemo(() => {
    if (!folderTree || !folderTree.children || folderTree.children.length === 0) {
      return null;
    }

    // Sort children by size and take top 8, group rest as "Other"
    const sortedChildren = [...folderTree.children].sort((a, b) => b.size - a.size);
    const topItems = sortedChildren.slice(0, 8);
    const otherItems = sortedChildren.slice(8);
    const otherSize = otherItems.reduce((sum, item) => sum + item.size, 0);

    const labels = topItems.map(item => item.name);
    const data = topItems.map(item => item.size);
    const backgroundColors = topItems.map((_, i) => pieColors[i % pieColors.length]);

    if (otherSize > 0) {
      labels.push('Other');
      data.push(otherSize);
      backgroundColors.push('#6b7280'); // gray
    }

    return {
      labels,
      datasets: [{
        data,
        backgroundColor: backgroundColors,
        borderColor: isDarkMode ? '#1f2937' : '#ffffff',
        borderWidth: 2,
      }]
    };
  }, [folderTree, isDarkMode]);

  // Handle pie slice click - single click shows preview, double click drills down
  const lastClickRef = React.useRef<{ time: number; index: number }>({ time: 0, index: -1 });

  const handlePieClick = (event: any, elements: any[]) => {
    if (elements.length > 0) {
      const index = elements[0].index;
      const item = topItemsRef[index];
      if (!item) return;

      const now = Date.now();
      const isDoubleClick = lastClickRef.current.index === index && (now - lastClickRef.current.time) < 300;
      lastClickRef.current = { time: now, index };

      if (isDoubleClick && item.type === 'folder') {
        // Double click - drill down
        setPreviewItem(null);
        setDrillPath(item.path);
      } else {
        // Single click - show preview popup
        setPreviewItem(item);
      }
    }
  };

  const pieChartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    onClick: handlePieClick,
    plugins: {
      legend: {
        display: true,
        position: 'right' as const,
        labels: {
          color: isDarkMode ? '#9ca3af' : '#4b5563',
          font: { size: 11 },
          boxWidth: 12,
          padding: 8,
        }
      },
      tooltip: {
        callbacks: {
          label: (context) => {
            const value = context.raw as number;
            const total = (context.dataset.data as number[]).reduce((a, b) => a + b, 0);
            const percentage = Math.round((value / total) * 100);
            return `${context.label}: ${formatBytes(value)} (${percentage}%) - Click to drill down`;
          }
        }
      }
    }
  }), [isDarkMode, handlePieClick]);

  const FolderItem = ({ item, level = 0, parentSize = 0 }) => {
    const isExpanded = expandedFolders[item.path];
    const isFile = item.type === 'file';
    const percentage = getPercentage(item.size, parentSize || folderTree?.size);

    return (
      <div className="select-none">
        <div
          className={`flex items-center py-2 px-3 hover:${
            isDarkMode ? 'bg-gray-700' : 'bg-gray-100'
          } rounded cursor-pointer transition-colors`}
          style={{ paddingLeft: `${level * 20 + 12}px` }}
          onClick={() => !isFile && toggleFolder(item.path)}
          onMouseEnter={() => setSelectedPath(item.path)}
          onMouseLeave={() => setSelectedPath(null)}
        >
          {/* Expand/Collapse Icon */}
          <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
            {!isFile ? (
              isExpanded ? (
                <ChevronDown size={18} className="text-gray-500" />
              ) : (
                <ChevronRight size={18} className="text-gray-500" />
              )
            ) : (
              <File size={18} className="text-gray-500" />
            )}
          </div>

          {/* Folder/File Icon and Name */}
          <div className="flex items-center gap-2 ml-2 flex-1 min-w-0">
            {!isFile && (
              <Folder size={16} className="text-yellow-500 flex-shrink-0" />
            )}
            <span
              className={`truncate text-sm ${
                isDarkMode ? 'text-gray-200' : 'text-gray-800'
              }`}
            >
              {item.name}
            </span>
          </div>

          {/* Size Info */}
          <div className="flex items-center gap-3 ml-4 flex-shrink-0">
            <div className="text-right">
              <div
                className={`text-xs font-medium ${
                  isDarkMode ? 'text-gray-300' : 'text-gray-600'
                }`}
              >
                {formatBytes(item.size)}
              </div>
              <div
                className={`text-xs ${
                  isDarkMode ? 'text-gray-500' : 'text-gray-500'
                }`}
              >
                {percentage}%
              </div>
            </div>

            {/* Progress Bar */}
            <div
              className="w-24 h-5 bg-gray-300 rounded overflow-hidden flex-shrink-0"
              title={`${formatBytes(item.size)} (${percentage}%)`}
            >
              <div
                className={`h-full ${getColorClass(percentage)} transition-all duration-300`}
                style={{ width: `${Math.max(5, percentage)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Render Children */}
        {!isFile && isExpanded && item.children && item.children.length > 0 && (
          <div>
            {item.children
              .sort((a, b) => b.size - a.size)
              .map((child, index) => (
                <FolderItem
                  key={index}
                  item={child}
                  level={level + 1}
                  parentSize={item.size}
                />
              ))}
          </div>
        )}

        {/* Empty Folder Message */}
        {!isFile &&
          isExpanded &&
          (!item.children || item.children.length === 0) && (
            <div
              className={`py-2 px-3 text-xs ${
                isDarkMode ? 'text-gray-500' : 'text-gray-400'
              } italic`}
              style={{ paddingLeft: `${(level + 1) * 20 + 12}px` }}
            >
              (empty folder)
            </div>
          )}
      </div>
    );
  };

  if (loading) {
    return (
      <div
        className={`p-6 rounded-lg border ${
          isDarkMode
            ? 'bg-gray-800 border-gray-700'
            : 'bg-white border-gray-200'
        }`}
      >
        <div className="flex items-center justify-center">
          <div
            className={`animate-spin rounded-full h-8 w-8 border-b-2 ${
              isDarkMode ? 'border-blue-500' : 'border-blue-500'
            }`}
          />
          <span
            className={`ml-3 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}
          >
            Analyzing disk usage...
          </span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={`p-6 rounded-lg border ${
          isDarkMode
            ? 'bg-red-900/20 border-red-700'
            : 'bg-red-50 border-red-200'
        }`}
      >
        <div className={`text-sm ${isDarkMode ? 'text-red-400' : 'text-red-700'}`}>
          ⚠️ {error}
        </div>
      </div>
    );
  }

  if (!folderTree) {
    return (
      <div
        className={`p-6 rounded-lg border ${
          isDarkMode
            ? 'bg-gray-800 border-gray-700'
            : 'bg-white border-gray-200'
        }`}
      >
        <div className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>
          No data to display
        </div>
      </div>
    );
  }

  return (
    <div
      className={`${isPane ? 'flex flex-col h-full' : 'rounded-lg border'} overflow-hidden ${
        isDarkMode
          ? 'bg-gray-800 border-gray-700'
          : 'bg-white border-gray-200'
      }`}
    >
      {/* Header */}
      <div
        className={`p-4 border-b ${
          isDarkMode ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-gray-50'
        }`}
      >
        <div className="flex items-center gap-3">
          {drillPath && (
            <button
              onClick={() => setDrillPath(null)}
              className={`p-2 rounded hover:bg-opacity-20 ${
                isDarkMode ? 'hover:bg-gray-600 text-gray-300' : 'hover:bg-gray-200 text-gray-600'
              }`}
              title="Go back"
            >
              <ArrowLeft size={20} />
            </button>
          )}
          <HardDrive
            size={24}
            className={isDarkMode ? 'text-blue-400' : 'text-blue-500'}
          />
          <div className="flex-1 min-w-0">
            <h3
              className={`font-semibold ${
                isDarkMode ? 'text-gray-100' : 'text-gray-900'
              }`}
            >
              Disk Usage Analyzer
            </h3>
            <p
              className={`text-xs mt-1 truncate ${
                isDarkMode ? 'text-gray-400' : 'text-gray-600'
              }`}
              title={effectivePath}
            >
              {effectivePath}
            </p>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="mt-4 grid grid-cols-3 gap-3">
          <div
            className={`p-3 rounded ${
              isDarkMode ? 'bg-gray-700' : 'bg-gray-100'
            }`}
          >
            <div
              className={`text-xs ${
                isDarkMode ? 'text-gray-400' : 'text-gray-600'
              }`}
            >
              Total Size
            </div>
            <div
              className={`text-lg font-bold mt-1 ${
                isDarkMode ? 'text-gray-100' : 'text-gray-900'
              }`}
            >
              {formatBytes(folderTree.size)}
            </div>
          </div>

          <div
            className={`p-3 rounded ${
              isDarkMode ? 'bg-gray-700' : 'bg-gray-100'
            }`}
          >
            <div
              className={`text-xs ${
                isDarkMode ? 'text-gray-400' : 'text-gray-600'
              }`}
            >
              Files
            </div>
            <div
              className={`text-lg font-bold mt-1 ${
                isDarkMode ? 'text-gray-100' : 'text-gray-900'
              }`}
            >
              {folderTree.fileCount || 0}
            </div>
          </div>

          <div
            className={`p-3 rounded ${
              isDarkMode ? 'bg-gray-700' : 'bg-gray-100'
            }`}
          >
            <div
              className={`text-xs ${
                isDarkMode ? 'text-gray-400' : 'text-gray-600'
              }`}
            >
              Folders
            </div>
            <div
              className={`text-lg font-bold mt-1 ${
                isDarkMode ? 'text-gray-100' : 'text-gray-900'
              }`}
            >
              {folderTree.folderCount || 0}
            </div>
          </div>
        </div>

        {/* Pie Chart */}
        {pieChartData && (
          <div className="mt-4 relative">
            <div
              className={`text-xs font-semibold mb-2 ${
                isDarkMode ? 'text-gray-400' : 'text-gray-600'
              }`}
            >
              Disk Usage Distribution (click slice for preview, double-click to drill down)
            </div>
            <div style={{ height: '180px' }}>
              <Pie data={pieChartData} options={pieChartOptions} />
            </div>

            {/* Preview Popup */}
            {previewItem && (
              <div
                className={`absolute z-50 p-3 rounded-lg shadow-xl border ${
                  isDarkMode
                    ? 'bg-gray-800 border-gray-600'
                    : 'bg-white border-gray-300'
                }`}
                style={{
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  minWidth: '220px',
                  maxWidth: '280px'
                }}
              >
                {/* Close button */}
                <button
                  onClick={() => setPreviewItem(null)}
                  className={`absolute top-2 right-2 p-1 rounded hover:bg-opacity-20 ${
                    isDarkMode ? 'text-gray-400 hover:bg-gray-600' : 'text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  <X size={14} />
                </button>

                {/* Item info */}
                <div className="flex items-center gap-2 mb-2 pr-6">
                  {previewItem.type === 'folder' ? (
                    <Folder size={18} className="text-yellow-500 flex-shrink-0" />
                  ) : (
                    <File size={18} className="text-gray-500 flex-shrink-0" />
                  )}
                  <span
                    className={`font-semibold text-sm truncate ${
                      isDarkMode ? 'text-gray-100' : 'text-gray-900'
                    }`}
                    title={previewItem.name}
                  >
                    {previewItem.name}
                  </span>
                </div>

                {/* Size info */}
                <div className={`text-xs mb-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  <span className="font-medium">{formatBytes(previewItem.size)}</span>
                  <span className="mx-1">•</span>
                  <span>{getPercentage(previewItem.size, folderTree?.size)}% of total</span>
                </div>

                {/* Children preview for folders */}
                {previewItem.type === 'folder' && previewItem.children && previewItem.children.length > 0 && (
                  <div className={`text-xs border-t pt-2 mt-2 ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                    <div className={`font-medium mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      Top items:
                    </div>
                    {[...previewItem.children]
                      .sort((a, b) => b.size - a.size)
                      .slice(0, 4)
                      .map((child, i) => (
                        <div key={i} className={`flex justify-between py-0.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          <span className="truncate flex-1 mr-2">{child.name}</span>
                          <span className="flex-shrink-0">{formatBytes(child.size)}</span>
                        </div>
                      ))}
                    {previewItem.children.length > 4 && (
                      <div className={`text-xs italic mt-1 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                        +{previewItem.children.length - 4} more items
                      </div>
                    )}
                  </div>
                )}

                {/* Drill down button for folders */}
                {previewItem.type === 'folder' && (
                  <button
                    onClick={() => {
                      setPreviewItem(null);
                      setDrillPath(previewItem.path);
                    }}
                    className={`mt-2 w-full py-1.5 px-3 text-xs font-medium rounded ${
                      isDarkMode
                        ? 'bg-blue-600 hover:bg-blue-500 text-white'
                        : 'bg-blue-500 hover:bg-blue-600 text-white'
                    }`}
                  >
                    Drill Down
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tree View */}
      <div
        className={`overflow-auto ${isPane ? 'flex-1' : 'max-h-96'} ${
          isDarkMode ? 'bg-gray-800' : 'bg-white'
        }`}
      >
        <FolderItem item={folderTree} level={0} parentSize={folderTree.size} />
      </div>

      {/* Legend */}
      <div
        className={`p-4 border-t text-xs ${
          isDarkMode
            ? 'border-gray-700 bg-gray-900 text-gray-400'
            : 'border-gray-200 bg-gray-50 text-gray-600'
        }`}
      >
        <div className="font-semibold mb-2">Usage Legend:</div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-green-500 rounded" />
            <span>&lt; 10%</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-blue-500 rounded" />
            <span>10-25%</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-yellow-500 rounded" />
            <span>25-50%</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-red-500 rounded" />
            <span>&gt; 50%</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DiskUsageAnalyzer;
