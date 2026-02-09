import { getFileName } from './utils';
import React, { useState, useEffect, useCallback, useRef, memo, useMemo } from 'react';
import {
    Save,
    Plus,
    Trash2,
    ArrowUp,
    ArrowDown,
    X,
    Copy,
    Scissors,
    Search,
    Filter,
    SortAsc,
    SortDesc,
    Download,
    ChevronDown,
    Columns,
    BarChart2,
    Hash,
    Type,
    Calendar,
    MoreHorizontal,
    Bold,
    Italic,
    Underline,
    AlignLeft,
    AlignCenter,
    AlignRight,
    Paintbrush,
    Palette,
    DollarSign,
    Percent,
    Grid3X3,
    Merge,
    Strikethrough,
    Undo,
    Redo,
    Maximize2,
    Pin,
    PieChart,
    LineChart,
    TrendingUp,
    Activity,
    Sun,
    Moon
} from 'lucide-react';
import * as XLSX from 'xlsx';

// Global cache for spreadsheet data - keyed by filePath
const csvDataCache = new Map<string, {
    headers: any[];
    data: any[][];
    workbook?: any;
    hasChanges?: boolean;
}>();

// Cell style interface
interface CellStyle {
    fontFamily?: string;
    fontSize?: number;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    strikethrough?: boolean;
    textColor?: string;
    bgColor?: string;
    align?: 'left' | 'center' | 'right';
    numberFormat?: 'general' | 'number' | 'currency' | 'percent' | 'date';
    decimalPlaces?: number;
    borderTop?: boolean;
    borderBottom?: boolean;
    borderLeft?: boolean;
    borderRight?: boolean;
}

// Default fonts
const FONTS = [
    'Arial', 'Helvetica', 'Times New Roman', 'Georgia', 'Courier New',
    'Verdana', 'Trebuchet MS', 'Comic Sans MS', 'Impact', 'Lucida Console'
];

const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72];

const PRESET_COLORS = [
    '#000000', '#434343', '#666666', '#999999', '#cccccc', '#ffffff',
    '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff', '#0000ff',
    '#9900ff', '#ff00ff', '#f4cccc', '#fce5cd', '#fff2cc', '#d9ead3',
    '#d0e0e3', '#cfe2f3', '#d9d2e9', '#ead1dc'
];

// Convert 0-based column index to Excel-style letters: 0=A, 1=B, ..., 25=Z, 26=AA, 27=AB, etc.
function colToLetters(idx: number): string {
    let s = '';
    let n = idx + 1;
    while (n > 0) {
        n--;
        s = String.fromCharCode(65 + (n % 26)) + s;
        n = Math.floor(n / 26);
    }
    return s;
}

// Convert Excel-style column letters to 0-based index: A=0, B=1, ..., Z=25, AA=26, AB=27, etc.
function lettersToCol(letters: string): number {
    let idx = 0;
    for (let i = 0; i < letters.length; i++) {
        idx = idx * 26 + (letters.charCodeAt(i) - 64);
    }
    return idx - 1;
}

const CsvViewer = ({
    nodeId, 
    contentDataRef,
    currentPath, // Passed from Enpistu
    findNodePath, 
    rootLayoutNode, 
    setDraggedItem, 
    setPaneContextMenu, 
    closeContentPane 
}) => {
    const [data, setData] = useState([]);
    const [headers, setHeaders] = useState([]);
    const [error, setError] = useState(null);
    const [hasChanges, setHasChanges] = useState(false);
    const [selectedCell, setSelectedCell] = useState(null);
    const [selectedRange, setSelectedRange] = useState(null);
    const [clipboard, setClipboard] = useState(null);
    const [editingCell, setEditingCell] = useState(null);
    const [workbook, setWorkbook] = useState(null);
    const [sheetNames, setSheetNames] = useState([]);
    const [activeSheet, setActiveSheet] = useState('');
    const tableRef = useRef(null);

    // New features: sorting, filtering, search
    const [sortConfig, setSortConfig] = useState<{ column: number; direction: 'asc' | 'desc' } | null>(null);
    const [filters, setFilters] = useState<{ [key: number]: string }>({});
    const [searchQuery, setSearchQuery] = useState('');
    const [showFilterRow, setShowFilterRow] = useState(false);
    const [columnWidths, setColumnWidths] = useState<{ [key: number]: number }>({});
    const [resizingColumn, setResizingColumn] = useState<number | null>(null);
    const [showColumnMenu, setShowColumnMenu] = useState<number | null>(null);

    // Cell styles storage: { "row,col": CellStyle }
    const [cellStyles, setCellStyles] = useState<{ [key: string]: CellStyle }>({});
    const [showFontPicker, setShowFontPicker] = useState(false);
    const [showTextColorPicker, setShowTextColorPicker] = useState(false);
    const [showBgColorPicker, setShowBgColorPicker] = useState(false);
    const [showNumberFormat, setShowNumberFormat] = useState(false);

    // Undo/Redo history
    const [history, setHistory] = useState<{ data: any[][]; headers: string[] }[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const isUndoRedoRef = useRef(false);

    // Freeze panes
    const [freezeRow, setFreezeRow] = useState(false);
    const [freezeCol, setFreezeCol] = useState(false);

    // Document theme mode (independent of app theme)
    const [docLightMode, setDocLightMode] = useState(() => {
        const saved = localStorage.getItem('csvViewer_lightMode');
        return saved !== null ? JSON.parse(saved) : true; // Default to light mode
    });

    // Save doc theme preference
    useEffect(() => {
        localStorage.setItem('csvViewer_lightMode', JSON.stringify(docLightMode));
    }, [docLightMode]);

    // Sync edited data to global cache so edits survive component remount (pane resize/split)
    useEffect(() => {
        const pData = contentDataRef.current[nodeId];
        const fp = pData?.contentId;
        if (fp && hasChanges && headers.length > 0) {
            const existing = csvDataCache.get(fp);
            csvDataCache.set(fp, { ...existing, headers, data, hasChanges: true });
        }
    }, [headers, data, hasChanges, nodeId]);

    // Chart state
    const [showChartModal, setShowChartModal] = useState(false);
    const [chartType, setChartType] = useState<'bar' | 'line' | 'pie' | 'area'>('bar');
    const [chartXColumn, setChartXColumn] = useState(0);
    const [chartYColumns, setChartYColumns] = useState<number[]>([1]);
    const chartCanvasRef = useRef<HTMLCanvasElement>(null);

    // Default grid size for new spreadsheets
    const [defaultRows] = useState(() => parseInt(localStorage.getItem('xlsx_defaultRows') || '10', 10));
    const [defaultCols] = useState(() => parseInt(localStorage.getItem('xlsx_defaultCols') || '10', 10));

    // Context menu for spreadsheet
    const [csvContextMenu, setCsvContextMenu] = useState<{ x: number; y: number; rowIndex?: number; colIndex?: number } | null>(null);

    // XLSX-specific cell styles and data validation
    const [xlsxCellStyles, setXlsxCellStyles] = useState<{ [key: string]: any }>({});
    const [dataValidations, setDataValidations] = useState<{ [key: string]: { type: string; values?: string[] } }>({});

    // Get style for a cell (merges XLSX-extracted styles with user-applied styles)
    const getCellStyle = useCallback((row: number, col: number): CellStyle & { isBoolean?: boolean; boolValue?: boolean } => {
        const key = `${row},${col}`;
        const xlsxStyle = xlsxCellStyles[key] || {};
        const userStyle = cellStyles[key] || {};
        // User styles override XLSX styles
        return { ...xlsxStyle, ...userStyle };
    }, [cellStyles, xlsxCellStyles]);

    // Apply style to selected cells
    const applyStyleToSelection = useCallback((styleUpdate: Partial<CellStyle>) => {
        if (!selectedCell && !selectedRange) return;

        setCellStyles(prev => {
            const next = { ...prev };

            if (selectedRange) {
                const { startRow, endRow, startCol, endCol } = selectedRange;
                for (let r = startRow; r <= endRow; r++) {
                    for (let c = startCol; c <= endCol; c++) {
                        const key = `${r},${c}`;
                        next[key] = { ...(next[key] || {}), ...styleUpdate };
                    }
                }
            } else if (selectedCell) {
                const key = `${selectedCell.row},${selectedCell.col}`;
                next[key] = { ...(next[key] || {}), ...styleUpdate };
            }

            return next;
        });
        setHasChanges(true);
    }, [selectedCell, selectedRange]);

    // Get current selection's style (for toolbar state)
    const currentStyle = useMemo(() => {
        if (selectedCell) {
            return getCellStyle(selectedCell.row, selectedCell.col);
        }
        return {};
    }, [selectedCell, getCellStyle]);

    // Format value based on number format
    const formatCellValue = useCallback((value: any, style: CellStyle): string => {
        if (value === null || value === undefined || value === '') return '';
        if (typeof value === 'string' && value.startsWith('=')) return value; // Formula

        const num = parseFloat(value);
        if (isNaN(num)) return String(value);

        const decimals = style.decimalPlaces ?? 2;

        switch (style.numberFormat) {
            case 'number':
                return num.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
            case 'currency':
                return num.toLocaleString(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: decimals });
            case 'percent':
                return (num * 100).toFixed(decimals) + '%';
            case 'date':
                const date = new Date(num);
                return isNaN(date.getTime()) ? String(value) : date.toLocaleDateString();
            default:
                return String(value);
        }
    }, []);

    // Add to history for undo/redo
    const addToHistory = useCallback((newData: any[][], newHeaders: string[]) => {
        if (isUndoRedoRef.current) {
            isUndoRedoRef.current = false;
            return;
        }

        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push({ data: JSON.parse(JSON.stringify(newData)), headers: [...newHeaders] });

        if (newHistory.length > 50) {
            newHistory.shift();
        } else {
            setHistoryIndex(historyIndex + 1);
        }

        setHistory(newHistory);
    }, [history, historyIndex]);

    // Undo
    const undo = useCallback(() => {
        if (historyIndex > 0) {
            isUndoRedoRef.current = true;
            const newIndex = historyIndex - 1;
            setHistoryIndex(newIndex);
            setData(JSON.parse(JSON.stringify(history[newIndex].data)));
            setHeaders([...history[newIndex].headers]);
        }
    }, [history, historyIndex]);

    // Redo
    const redo = useCallback(() => {
        if (historyIndex < history.length - 1) {
            isUndoRedoRef.current = true;
            const newIndex = historyIndex + 1;
            setHistoryIndex(newIndex);
            setData(JSON.parse(JSON.stringify(history[newIndex].data)));
            setHeaders([...history[newIndex].headers]);
        }
    }, [history, historyIndex]);

    // Auto-fit column widths
    const autoFitColumns = useCallback(() => {
        const newWidths: { [key: number]: number } = {};
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.font = '12px Arial';

        headers.forEach((header, colIndex) => {
            let maxWidth = ctx.measureText(String(header)).width + 40; // Header + padding

            data.slice(0, 100).forEach(row => {
                const cellValue = String(row[colIndex] ?? '');
                const width = ctx.measureText(cellValue).width + 24;
                if (width > maxWidth) maxWidth = width;
            });

            newWidths[colIndex] = Math.min(Math.max(80, maxWidth), 400);
        });

        setColumnWidths(newWidths);
    }, [headers, data]);

    // Draw chart on canvas
    const drawChart = useCallback(() => {
        const canvas = chartCanvasRef.current;
        if (!canvas || !data.length) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const width = canvas.width;
        const height = canvas.height;
        const padding = 60;
        const chartWidth = width - padding * 2;
        const chartHeight = height - padding * 2;

        // Clear canvas
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, width, height);

        // Get data for chart
        const labels = data.slice(0, 50).map(row => String(row[chartXColumn] ?? ''));
        const datasets = chartYColumns.map((colIdx, i) => ({
            data: data.slice(0, 50).map(row => parseFloat(row[colIdx]) || 0),
            color: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'][i % 5]
        }));

        const allValues = datasets.flatMap(d => d.data);
        const maxValue = Math.max(...allValues, 1);
        const minValue = Math.min(...allValues, 0);
        const valueRange = maxValue - minValue || 1;

        // Draw axes
        ctx.strokeStyle = '#4b5563';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padding, padding);
        ctx.lineTo(padding, height - padding);
        ctx.lineTo(width - padding, height - padding);
        ctx.stroke();

        // Draw Y axis labels
        ctx.fillStyle = '#9ca3af';
        ctx.font = '10px Arial';
        ctx.textAlign = 'right';
        for (let i = 0; i <= 5; i++) {
            const value = minValue + (valueRange * i) / 5;
            const y = height - padding - (chartHeight * i) / 5;
            ctx.fillText(value.toFixed(1), padding - 8, y + 3);
            ctx.strokeStyle = '#374151';
            ctx.beginPath();
            ctx.moveTo(padding, y);
            ctx.lineTo(width - padding, y);
            ctx.stroke();
        }

        if (chartType === 'bar') {
            const barGroupWidth = chartWidth / labels.length;
            const barWidth = (barGroupWidth * 0.8) / datasets.length;
            const barGap = barGroupWidth * 0.1;

            datasets.forEach((dataset, datasetIdx) => {
                ctx.fillStyle = dataset.color;
                dataset.data.forEach((value, i) => {
                    const barHeight = ((value - minValue) / valueRange) * chartHeight;
                    const x = padding + i * barGroupWidth + barGap + datasetIdx * barWidth;
                    const y = height - padding - barHeight;
                    ctx.fillRect(x, y, barWidth - 2, barHeight);
                });
            });
        } else if (chartType === 'line' || chartType === 'area') {
            datasets.forEach((dataset) => {
                ctx.strokeStyle = dataset.color;
                ctx.lineWidth = 2;
                ctx.beginPath();

                const points: [number, number][] = [];
                dataset.data.forEach((value, i) => {
                    const x = padding + (i / (labels.length - 1 || 1)) * chartWidth;
                    const y = height - padding - ((value - minValue) / valueRange) * chartHeight;
                    points.push([x, y]);
                    if (i === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                });
                ctx.stroke();

                if (chartType === 'area') {
                    ctx.fillStyle = dataset.color + '40';
                    ctx.lineTo(padding + chartWidth, height - padding);
                    ctx.lineTo(padding, height - padding);
                    ctx.closePath();
                    ctx.fill();
                }

                // Draw points
                ctx.fillStyle = dataset.color;
                points.forEach(([x, y]) => {
                    ctx.beginPath();
                    ctx.arc(x, y, 4, 0, Math.PI * 2);
                    ctx.fill();
                });
            });
        } else if (chartType === 'pie') {
            const pieData = datasets[0]?.data || [];
            const total = pieData.reduce((a, b) => a + Math.abs(b), 0) || 1;
            const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
            const centerX = width / 2;
            const centerY = height / 2;
            const radius = Math.min(chartWidth, chartHeight) / 2 - 20;

            let startAngle = -Math.PI / 2;
            pieData.forEach((value, i) => {
                const sliceAngle = (Math.abs(value) / total) * Math.PI * 2;
                ctx.fillStyle = colors[i % colors.length];
                ctx.beginPath();
                ctx.moveTo(centerX, centerY);
                ctx.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle);
                ctx.closePath();
                ctx.fill();

                // Label
                const labelAngle = startAngle + sliceAngle / 2;
                const labelX = centerX + Math.cos(labelAngle) * (radius * 0.7);
                const labelY = centerY + Math.sin(labelAngle) * (radius * 0.7);
                ctx.fillStyle = '#fff';
                ctx.font = '11px Arial';
                ctx.textAlign = 'center';
                ctx.fillText(labels[i]?.substring(0, 8) || '', labelX, labelY);

                startAngle += sliceAngle;
            });
        }

        // Draw X axis labels (for bar/line/area)
        if (chartType !== 'pie') {
            ctx.fillStyle = '#9ca3af';
            ctx.font = '9px Arial';
            ctx.textAlign = 'center';
            const step = Math.ceil(labels.length / 10);
            labels.forEach((label, i) => {
                if (i % step === 0) {
                    const x = padding + (i / (labels.length - 1 || 1)) * chartWidth;
                    ctx.save();
                    ctx.translate(x, height - padding + 15);
                    ctx.rotate(-Math.PI / 4);
                    ctx.fillText(label.substring(0, 10), 0, 0);
                    ctx.restore();
                }
            });
        }

        // Legend
        ctx.font = '11px Arial';
        ctx.textAlign = 'left';
        chartYColumns.forEach((colIdx, i) => {
            const color = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'][i % 5];
            ctx.fillStyle = color;
            ctx.fillRect(width - padding - 100, 20 + i * 20, 12, 12);
            ctx.fillStyle = '#e5e7eb';
            ctx.fillText(headers[colIdx] || `Column ${colIdx + 1}`, width - padding - 84, 30 + i * 20);
        });
    }, [data, headers, chartType, chartXColumn, chartYColumns]);

    // Redraw chart when settings change
    useEffect(() => {
        if (showChartModal) {
            setTimeout(drawChart, 50);
        }
    }, [showChartModal, chartType, chartXColumn, chartYColumns, drawChart]);

    // Detect column types
    const columnTypes = useMemo(() => {
        if (!data.length || !headers.length) return {};
        const types: { [key: number]: 'number' | 'date' | 'text' } = {};

        headers.forEach((_, colIndex) => {
            let numCount = 0;
            let dateCount = 0;
            let total = 0;

            data.slice(0, 100).forEach(row => {
                const val = row[colIndex];
                if (val === null || val === undefined || val === '') return;
                total++;
                const strVal = String(val);
                if (!isNaN(Number(strVal)) && strVal.trim() !== '') numCount++;
                if (/^\d{1,4}[-/]\d{1,2}[-/]\d{1,4}/.test(strVal)) dateCount++;
            });

            if (total === 0) types[colIndex] = 'text';
            else if (numCount / total > 0.8) types[colIndex] = 'number';
            else if (dateCount / total > 0.5) types[colIndex] = 'date';
            else types[colIndex] = 'text';
        });

        return types;
    }, [data, headers]);

    // Filtered and sorted data
    const processedData = useMemo(() => {
        let result = [...data];

        // Apply search filter
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            result = result.filter(row =>
                row.some(cell => String(cell ?? '').toLowerCase().includes(q))
            );
        }

        // Apply column filters
        Object.entries(filters).forEach(([colIndex, filterValue]) => {
            if (filterValue.trim()) {
                const col = parseInt(colIndex);
                const q = filterValue.toLowerCase();
                result = result.filter(row =>
                    String(row[col] ?? '').toLowerCase().includes(q)
                );
            }
        });

        // Apply sorting
        if (sortConfig) {
            result.sort((a, b) => {
                const aVal = a[sortConfig.column] ?? '';
                const bVal = b[sortConfig.column] ?? '';

                // Try numeric comparison
                const aNum = parseFloat(aVal);
                const bNum = parseFloat(bVal);

                if (!isNaN(aNum) && !isNaN(bNum)) {
                    return sortConfig.direction === 'asc' ? aNum - bNum : bNum - aNum;
                }

                // String comparison
                const comparison = String(aVal).localeCompare(String(bVal));
                return sortConfig.direction === 'asc' ? comparison : -comparison;
            });
        }

        return result;
    }, [data, searchQuery, filters, sortConfig]);

    // Get original row index for editing
    const getOriginalRowIndex = useCallback((processedIndex: number) => {
        if (!searchQuery.trim() && Object.keys(filters).length === 0 && !sortConfig) {
            return processedIndex;
        }
        const processedRow = processedData[processedIndex];
        return data.findIndex(row => row === processedRow);
    }, [data, processedData, searchQuery, filters, sortConfig]);

    const paneData = contentDataRef.current[nodeId];
    const filePath = paneData?.contentId;

    const isXlsx = filePath?.endsWith('.xlsx') || filePath?.endsWith('.xls');

    useEffect(() => {
        loadSpreadsheet();
    }, [filePath, activeSheet]); // Add activeSheet to dependencies

    const loadSheetData = useCallback((wb, sheetName) => {
        const sheet = wb.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

        if (jsonData.length > 0 && jsonData[0]?.some?.(v => v !== '')) {
            setHeaders(jsonData[0] || ['Column 1']);
            setData(jsonData.slice(1).length > 0 ? jsonData.slice(1) : [new Array(jsonData[0].length).fill('')]);
        } else {
            // Empty sheet - use default grid size
            const cols = defaultCols;
            const rows = defaultRows;
            setHeaders(Array.from({ length: cols }, (_, i) => colToLetters(i)));
            setData(Array.from({ length: rows }, () => new Array(cols).fill('')));
        }

        // Extract cell styles from XLSX
        const extractedStyles: { [key: string]: any } = {};
        const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');

        for (let row = range.s.r; row <= range.e.r; row++) {
            for (let col = range.s.c; col <= range.e.c; col++) {
                const cellAddr = XLSX.utils.encode_cell({ r: row, c: col });
                const cell = sheet[cellAddr];
                if (cell && cell.s) {
                    // Extract style information
                    const style: any = {};
                    if (cell.s.font) {
                        if (cell.s.font.bold) style.bold = true;
                        if (cell.s.font.italic) style.italic = true;
                        if (cell.s.font.underline) style.underline = true;
                        if (cell.s.font.strike) style.strikethrough = true;
                        if (cell.s.font.color?.rgb) style.textColor = '#' + cell.s.font.color.rgb;
                        if (cell.s.font.name) style.fontFamily = cell.s.font.name;
                        if (cell.s.font.sz) style.fontSize = cell.s.font.sz;
                    }
                    if (cell.s.fill?.fgColor?.rgb) {
                        style.bgColor = '#' + cell.s.fill.fgColor.rgb;
                    }
                    if (cell.s.alignment?.horizontal) {
                        style.align = cell.s.alignment.horizontal;
                    }
                    // Map row index (excluding header)
                    const dataRow = row - 1;
                    if (dataRow >= 0 && Object.keys(style).length > 0) {
                        extractedStyles[`${dataRow},${col}`] = style;
                    }
                }
                // Handle boolean values (checkboxes)
                if (cell && cell.t === 'b') {
                    // Mark as boolean for checkbox rendering
                    const dataRow = row - 1;
                    if (dataRow >= 0) {
                        if (!extractedStyles[`${dataRow},${col}`]) extractedStyles[`${dataRow},${col}`] = {};
                        extractedStyles[`${dataRow},${col}`].isBoolean = true;
                        extractedStyles[`${dataRow},${col}`].boolValue = cell.v;
                    }
                }
            }
        }

        // Extract data validation (dropdowns)
        const validations: { [key: string]: { type: string; values?: string[] } } = {};
        if (sheet['!dataValidation']) {
            for (const dv of sheet['!dataValidation']) {
                if (dv.type === 'list' && dv.sqref) {
                    const ranges = dv.sqref.split(' ');
                    for (const rangeStr of ranges) {
                        try {
                            const dvRange = XLSX.utils.decode_range(rangeStr);
                            const values = dv.formula1 ? dv.formula1.split(',').map((v: string) => v.trim().replace(/^"|"$/g, '')) : [];
                            for (let r = dvRange.s.r; r <= dvRange.e.r; r++) {
                                for (let c = dvRange.s.c; c <= dvRange.e.c; c++) {
                                    const dataRow = r - 1;
                                    if (dataRow >= 0) {
                                        validations[`${dataRow},${c}`] = { type: 'list', values };
                                    }
                                }
                            }
                        } catch (e) {
                            // Skip invalid ranges
                        }
                    }
                }
            }
        }

        setXlsxCellStyles(prev => ({ ...prev, ...extractedStyles }));
        setDataValidations(validations);
    }, []);

    const loadSpreadsheet = useCallback(async () => {
        if (!filePath) return;

        // Check global cache first
        const cached = csvDataCache.get(filePath);
        if (cached) {
            if (cached.workbook) {
                setWorkbook(cached.workbook);
                setSheetNames(cached.workbook.SheetNames);
                // Reload sheet data from workbook if headers/data not cached
                if (cached.headers && cached.data) {
                    setHeaders(cached.headers);
                    setData(cached.data);
                } else {
                    const sheetToLoad = activeSheet || cached.workbook.SheetNames[0];
                    setActiveSheet(sheetToLoad);
                    loadSheetData(cached.workbook, sheetToLoad);
                }
            } else {
                setHeaders(cached.headers || ['Column 1']);
                setData(cached.data || [[]]);
            }
            // Restore unsaved changes flag from cache (survives remount from resize/split)
            setHasChanges(cached.hasChanges || false);
            setError(null);
            return;
        }

        try {
            if (isXlsx) {
                const buffer = await window.api.readFileBuffer(filePath);
                let wb;
                if (!buffer || buffer.length === 0) {
                    wb = XLSX.utils.book_new();
                    const cols = defaultCols;
                    const rows = defaultRows;
                    const defaultHeaders = Array.from({ length: cols }, (_, i) => colToLetters(i));
                    const defaultData = [defaultHeaders, ...Array.from({ length: rows }, () => new Array(cols).fill(''))];
                    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(defaultData), 'Sheet1');
                } else {
                    wb = XLSX.read(new Uint8Array(buffer), { type: 'array', cellStyles: true, cellDates: true });
                }
                setWorkbook(wb);
                setSheetNames(wb.SheetNames);

                if (wb.SheetNames.length > 0) {
                    const sheetToLoad = activeSheet || wb.SheetNames[0];
                    setActiveSheet(sheetToLoad);
                    loadSheetData(wb, sheetToLoad);
                }
                // Cache workbook only - headers/data come from loadSheetData
                csvDataCache.set(filePath, { headers: null, data: null, workbook: wb });
            } else {
                const response = await window.api.readCsvContent(filePath);
                if (response.error) throw new Error(response.error);

                setHeaders(response.headers || ['Column 1']);
                setData(response.rows || [[]]);
                // Cache globally
                csvDataCache.set(filePath, {
                    headers: response.headers || ['Column 1'],
                    data: response.rows || [[]]
                });
            }
            setHasChanges(false);
            setError(null);

            setTimeout(() => {
                setHistory([{ data: JSON.parse(JSON.stringify(data)), headers: [...headers] }]);
                setHistoryIndex(0);
            }, 100);
        } catch (err) {
            setError(err.message);
        }
    }, [filePath, isXlsx, activeSheet, loadSheetData]);

    const switchSheet = useCallback((sheetName) => {
        if (workbook && activeSheet) { // Only save if there was an active sheet
            const sheetData = [headers, ...data];
            workbook.Sheets[activeSheet] = XLSX.utils.aoa_to_sheet(sheetData);
        }
        setActiveSheet(sheetName);
        if (workbook) {
            loadSheetData(workbook, sheetName);
        }
        setSelectedCell(null);
        setEditingCell(null);
        setSelectedRange(null);
    }, [workbook, activeSheet, headers, data, loadSheetData]);

    const addSheet = useCallback(() => {
        const newName = `Sheet${sheetNames.length + 1}`;
        setSheetNames(prev => [...prev, newName]);
        if (workbook) {
            workbook.SheetNames.push(newName);
            workbook.Sheets[newName] = XLSX.utils.aoa_to_sheet([['Column 1'], ['']]);
        }
        switchSheet(newName);
        setHasChanges(true);
    }, [sheetNames.length, workbook, switchSheet]);

    const saveSpreadsheet = useCallback(async () => {
        try {
            if (isXlsx && workbook) {
                const sheetData = [headers, ...data];
                workbook.Sheets[activeSheet] = XLSX.utils.aoa_to_sheet(sheetData);
                const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'binary' });
                const blob = new Blob([s2ab(wbout)], { type: 'application/octet-stream' });
                await window.api.writeFileContent(filePath, await blob.arrayBuffer(), 'binary');
            } else {
                const csvContent = [
                    headers.join(','),
                    ...data.map(row => 
                        row.map(cell => {
                            const str = String(cell ?? '');
                            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                                return `"${str.replace(/"/g, '""')}"`;
                            }
                            return str;
                        }).join(',')
                    )
                ].join('\n');

                await window.api.writeFileContent(filePath, csvContent);
            }
            setHasChanges(false);
        } catch (err) {
            setError(err.message);
        }
    }, [isXlsx, workbook, headers, data, activeSheet, filePath]);

    // Helper to convert string to ArrayBuffer
    const s2ab = (s) => {
        const buf = new ArrayBuffer(s.length);
        const view = new Uint8Array(buf);
        for (let i = 0; i < s.length; i++) view[i] = s.charCodeAt(i) & 0xFF;
        return buf;
    };


    const updateCell = useCallback((rowIndex, colIndex, value) => {
        setData(prevData => {
            const newData = [...prevData];
            if (!newData[rowIndex]) {
                newData[rowIndex] = new Array(headers.length).fill('');
            }
            newData[rowIndex] = [...newData[rowIndex]];
            newData[rowIndex][colIndex] = value;
            addToHistory(newData, headers);
            return newData;
        });
        setHasChanges(true);
    }, [headers.length, headers, addToHistory]);

    const updateHeader = useCallback((colIndex, value) => {
        setHeaders(prev => {
            const newHeaders = [...prev];
            newHeaders[colIndex] = value;
            return newHeaders;
        });
        setHasChanges(true);
    }, []);

    const addRow = useCallback((index = data.length) => {
        setData(prev => {
            const newData = [...prev];
            newData.splice(index, 0, new Array(headers.length).fill(''));
            return newData;
        });
        setHasChanges(true);
    }, [data.length, headers.length]);

    const deleteRow = useCallback((index) => {
        if (data.length <= 1) return;
        setData(prev => prev.filter((_, i) => i !== index));
        setHasChanges(true);
    }, [data.length]);

    const addColumn = useCallback(() => {
        setHeaders(prev => [...prev, `Column ${prev.length + 1}`]);
        setData(prev => prev.map(row => [...(row || []), '']));
        setHasChanges(true);
    }, []);

    const deleteColumn = useCallback((colIndex) => {
        if (headers.length <= 1) return;
        setHeaders(prev => prev.filter((_, i) => i !== colIndex));
        setData(prev => prev.map(row => row.filter((_, i) => i !== colIndex)));
        setHasChanges(true);
    }, [headers.length]);

    // Sort toggle
    const toggleSort = useCallback((colIndex: number) => {
        setSortConfig(prev => {
            if (prev?.column === colIndex) {
                if (prev.direction === 'asc') return { column: colIndex, direction: 'desc' };
                return null; // Third click clears sort
            }
            return { column: colIndex, direction: 'asc' };
        });
    }, []);

    // Clear all filters
    const clearFilters = useCallback(() => {
        setFilters({});
        setSearchQuery('');
        setSortConfig(null);
    }, []);

    // Export to different formats
    const exportData = useCallback(async (format: 'csv' | 'json' | 'xlsx') => {
        try {
            const baseName = filePath?.replace(/\.[^.]+$/, '') || 'export';

            if (format === 'csv') {
                const csvContent = [
                    headers.join(','),
                    ...data.map(row =>
                        row.map(cell => {
                            const str = String(cell ?? '');
                            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                                return `"${str.replace(/"/g, '""')}"`;
                            }
                            return str;
                        }).join(',')
                    )
                ].join('\n');
                await window.api.writeFileContent(`${baseName}_export.csv`, csvContent);
            } else if (format === 'json') {
                const jsonData = data.map(row => {
                    const obj: any = {};
                    headers.forEach((h, i) => { obj[h] = row[i]; });
                    return obj;
                });
                await window.api.writeFileContent(`${baseName}_export.json`, JSON.stringify(jsonData, null, 2));
            } else if (format === 'xlsx') {
                const wb = XLSX.utils.book_new();
                const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
                XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
                const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'binary' });
                const s2ab = (s: string) => {
                    const buf = new ArrayBuffer(s.length);
                    const view = new Uint8Array(buf);
                    for (let i = 0; i < s.length; i++) view[i] = s.charCodeAt(i) & 0xFF;
                    return buf;
                };
                const blob = new Blob([s2ab(wbout)], { type: 'application/octet-stream' });
                await window.api.writeFileContent(`${baseName}_export.xlsx`, await blob.arrayBuffer(), 'binary');
            }
        } catch (err) {
            setError(err.message);
        }
    }, [headers, data, filePath]);

    // Column statistics
    const getColumnStats = useCallback((colIndex: number) => {
        const values = data.map(row => row[colIndex]).filter(v => v !== null && v !== undefined && v !== '');
        const numValues = values.map(v => parseFloat(v)).filter(n => !isNaN(n));

        if (numValues.length === 0) {
            return { count: values.length, unique: new Set(values).size };
        }

        const sum = numValues.reduce((a, b) => a + b, 0);
        const avg = sum / numValues.length;
        const min = Math.min(...numValues);
        const max = Math.max(...numValues);

        return {
            count: values.length,
            unique: new Set(values).size,
            sum: sum.toFixed(2),
            avg: avg.toFixed(2),
            min,
            max
        };
    }, [data]);

    const moveRow = useCallback((fromIndex, direction) => {
        const toIndex = fromIndex + direction;
        if (toIndex < 0 || toIndex >= data.length) return;
        
        setData(prev => {
            const newData = [...prev];
            [newData[fromIndex], newData[toIndex]] = [newData[toIndex], newData[fromIndex]];
            return newData;
        });
        setHasChanges(true);
    }, [data.length]);

    const copySelection = useCallback(() => {
        if (!selectedCell && !selectedRange) return;
        
        if (selectedRange) {
            const { startRow, endRow, startCol, endCol } = selectedRange;
            const copied = [];
            for (let r = startRow; r <= endRow; r++) {
                const row = [];
                for (let c = startCol; c <= endCol; c++) {
                    row.push(data[r]?.[c] ?? '');
                }
                copied.push(row);
            }
            setClipboard(copied);
        } else if (selectedCell) {
            const { row, col } = selectedCell;
            setClipboard([[data[row]?.[col] ?? '']]);
        }
    }, [selectedCell, selectedRange, data]);

    const cutSelection = useCallback(() => {
        copySelection();
        
        if (selectedRange) {
            const { startRow, endRow, startCol, endCol } = selectedRange;
            setData(prev => {
                const newData = [...prev];
                for (let r = startRow; r <= endRow; r++) {
                    for (let c = startCol; c <= endCol; c++) {
                        if (newData[r]) {
                            newData[r] = [...newData[r]];
                            newData[r][c] = '';
                        }
                    }
                }
                return newData;
            });
        } else if (selectedCell) {
            updateCell(selectedCell.row, selectedCell.col, '');
        }
        setHasChanges(true);
    }, [copySelection, selectedCell, selectedRange, updateCell]);

    const pasteSelection = useCallback(() => {
        if (!clipboard || !selectedCell) return;
        
        const { row: startRow, col: startCol } = selectedCell;
        setData(prev => {
            const newData = [...prev];
            
            clipboard.forEach((clipRow, rOffset) => {
                const targetRow = startRow + rOffset;
                if (targetRow >= newData.length) {
                    newData.push(new Array(headers.length).fill(''));
                }
                
                newData[targetRow] = [...(newData[targetRow] || [])];
                clipRow.forEach((value, cOffset) => {
                    const targetCol = startCol + cOffset;
                    if (targetCol < headers.length) {
                        newData[targetRow][targetCol] = value;
                    }
                });
            });
            
            return newData;
        });
        setHasChanges(true);
    }, [clipboard, selectedCell, headers.length]);

    const handleCellClick = (rowIndex, colIndex, e) => {
        if (e.shiftKey && selectedCell) {
            setSelectedRange({
                startRow: Math.min(selectedCell.row, rowIndex),
                endRow: Math.max(selectedCell.row, rowIndex),
                startCol: Math.min(selectedCell.col, colIndex),
                endCol: Math.max(selectedCell.col, colIndex)
            });
        } else {
            setSelectedCell({ row: rowIndex, col: colIndex });
            setSelectedRange(null);
        }
    };

    const handleCellDoubleClick = (rowIndex, colIndex) => {
        setEditingCell({ row: rowIndex, col: colIndex });
    };

    const colLettersToIndex = lettersToCol;
    const indexToColLetters = colToLetters;

    const evaluateFormula = useCallback((formula, sheetData) => {
        if (!formula || typeof formula !== 'string' || !formula.startsWith('=')) {
            return formula;
        }

        try {
            const expr = formula.substring(1).toUpperCase();

            // Generic cell reference resolver (supports multi-letter columns: A1, AA1, AZ99, etc.)
            const resolveCellRef = (ref) => {
                const m = ref.match(/^([A-Z]+)(\d+)$/);
                if (!m) return NaN;
                const col = colLettersToIndex(m[1]);
                const row = parseInt(m[2]) - 1;
                return parseFloat(sheetData[row]?.[col]) || 0;
            };

            // Parse a range like A1:B3 or AA1:AZ99
            const parseRange = (match) => {
                if (!match) return null;
                return {
                    startCol: colLettersToIndex(match[1]),
                    startRow: parseInt(match[2]) - 1,
                    endCol: colLettersToIndex(match[3]),
                    endRow: parseInt(match[4]) - 1,
                };
            };

            const rangeRegex = /^(\w+)\(([A-Z]+)(\d+):([A-Z]+)(\d+)\)$/;
            const funcMatch = expr.match(rangeRegex);

            if (funcMatch) {
                const funcName = funcMatch[1];
                const range = {
                    startCol: colLettersToIndex(funcMatch[2]),
                    startRow: parseInt(funcMatch[3]) - 1,
                    endCol: colLettersToIndex(funcMatch[4]),
                    endRow: parseInt(funcMatch[5]) - 1,
                };

                // Collect all numeric values in range
                const nums: number[] = [];
                let nonEmpty = 0;
                for (let r = range.startRow; r <= range.endRow; r++) {
                    for (let c = range.startCol; c <= range.endCol; c++) {
                        const raw = sheetData[r]?.[c];
                        if (raw !== '' && raw != null) nonEmpty++;
                        const val = parseFloat(raw);
                        if (!isNaN(val)) nums.push(val);
                    }
                }

                switch (funcName) {
                    case 'SUM':
                        return nums.reduce((a, b) => a + b, 0);
                    case 'AVERAGE':
                        return nums.length > 0 ? +(nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(6) : 0;
                    case 'COUNT':
                        return nonEmpty;
                    case 'COUNTA':
                        return nonEmpty;
                    case 'MAX':
                        return nums.length > 0 ? Math.max(...nums) : 0;
                    case 'MIN':
                        return nums.length > 0 ? Math.min(...nums) : 0;
                    default:
                        break;
                }
            }

            // SUM/AVERAGE/etc with comma-separated args: =SUM(A1,B2,C3)
            const commaFuncMatch = expr.match(/^(SUM|AVERAGE|COUNT|MAX|MIN)\(([^)]+)\)$/);
            if (commaFuncMatch && commaFuncMatch[2].includes(',')) {
                const funcName = commaFuncMatch[1];
                const args = commaFuncMatch[2].split(',').map(s => s.trim());
                const nums: number[] = [];
                for (const arg of args) {
                    // Check if it's a range (A1:B3) or single ref (A1) or literal number
                    const rangeM = arg.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
                    if (rangeM) {
                        const sc = colLettersToIndex(rangeM[1]), sr = parseInt(rangeM[2]) - 1;
                        const ec = colLettersToIndex(rangeM[3]), er = parseInt(rangeM[4]) - 1;
                        for (let r = sr; r <= er; r++) {
                            for (let c = sc; c <= ec; c++) {
                                const val = parseFloat(sheetData[r]?.[c]);
                                if (!isNaN(val)) nums.push(val);
                            }
                        }
                    } else {
                        const val = resolveCellRef(arg);
                        if (!isNaN(val)) nums.push(val);
                    }
                }
                switch (funcName) {
                    case 'SUM': return nums.reduce((a, b) => a + b, 0);
                    case 'AVERAGE': return nums.length > 0 ? +(nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(6) : 0;
                    case 'COUNT': return nums.length;
                    case 'MAX': return nums.length > 0 ? Math.max(...nums) : 0;
                    case 'MIN': return nums.length > 0 ? Math.min(...nums) : 0;
                }
            }

            // Simple math: e.g., =A1+B1, =A1*2, =AA1+AB1, etc.
            const mathematicalExpression = expr.replace(/([A-Z]+\d+)/g, (match) => {
                const value = resolveCellRef(match);
                return isNaN(value) ? `"${match}"` : value.toString();
            });

            try {
                // eslint-disable-next-line no-eval
                const result = eval(mathematicalExpression);
                return isNaN(result) ? '#VALUE!' : result;
            } catch (evalError) {
                console.warn("Formula evaluation error:", evalError);
                return '#ERROR!';
            }
        } catch (err) {
            console.error("Error in evaluateFormula:", err);
            return '#ERROR!';
        }
    }, []);

    // Helper to scroll the selected cell into view
    const scrollCellIntoView = useCallback((newRow: number, newCol: number) => {
        const container = tableRef.current;
        if (!container) return;

        // Find the target cell (adjust for header row and row number column)
        const rows = container.querySelectorAll('tbody tr');
        const targetRow = rows[newRow];
        if (!targetRow) return;

        const cells = targetRow.querySelectorAll('td');
        const targetCell = cells[newCol + 1]; // +1 for row number column
        if (!targetCell) return;

        // Scroll the cell into view if needed
        const containerRect = container.getBoundingClientRect();
        const cellRect = targetCell.getBoundingClientRect();

        // Horizontal scrolling
        if (cellRect.left < containerRect.left + 50) { // +50 to account for row number column
            container.scrollLeft -= (containerRect.left + 50 - cellRect.left + 20);
        } else if (cellRect.right > containerRect.right) {
            container.scrollLeft += (cellRect.right - containerRect.right + 20);
        }

        // Vertical scrolling
        if (cellRect.top < containerRect.top + 40) { // +40 to account for header row
            container.scrollTop -= (containerRect.top + 40 - cellRect.top + 20);
        } else if (cellRect.bottom > containerRect.bottom) {
            container.scrollTop += (cellRect.bottom - containerRect.bottom + 20);
        }
    }, []);

    const handleKeyDown = useCallback((e) => {
        if (!selectedCell) return;

        if (e.key === 'Enter' && !editingCell) {
            e.preventDefault();
            setEditingCell(selectedCell);
            return;
        }

        if (editingCell) return;

        const { row, col } = selectedCell;

        switch (e.key) {
            case 'ArrowUp':
                e.preventDefault();
                if (row > 0) {
                    setSelectedCell({ row: row - 1, col });
                    setTimeout(() => scrollCellIntoView(row - 1, col), 0);
                }
                break;
            case 'ArrowDown':
                e.preventDefault();
                if (row < data.length - 1) {
                    setSelectedCell({ row: row + 1, col });
                    setTimeout(() => scrollCellIntoView(row + 1, col), 0);
                }
                break;
            case 'ArrowLeft':
                e.preventDefault();
                if (col > 0) {
                    setSelectedCell({ row, col: col - 1 });
                    setTimeout(() => scrollCellIntoView(row, col - 1), 0);
                }
                break;
            case 'ArrowRight':
                e.preventDefault();
                if (col < headers.length - 1) {
                    setSelectedCell({ row, col: col + 1 });
                    setTimeout(() => scrollCellIntoView(row, col + 1), 0);
                }
                break;
            case 'Delete':
            case 'Backspace':
                e.preventDefault();
                if (selectedRange) {
                    const { startRow, endRow, startCol, endCol } = selectedRange;
                    setData(prev => {
                        const newData = [...prev];
                        for (let r = startRow; r <= endRow; r++) {
                            for (let c = startCol; c <= endCol; c++) {
                                if (newData[r]) {
                                    newData[r] = [...newData[r]];
                                    newData[r][c] = '';
                                }
                            }
                        }
                        return newData;
                    });
                } else {
                    updateCell(row, col, '');
                }
                setHasChanges(true);
                break;
            case 'c':
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    e.stopPropagation();
                    copySelection();
                }
                break;
            case 'x':
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    e.stopPropagation();
                    cutSelection();
                }
                break;
            case 'v':
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    e.stopPropagation();
                    pasteSelection();
                }
                break;
            case 's':
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    e.stopPropagation();
                    saveSpreadsheet();
                }
                break;
            case 'z':
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (e.shiftKey) {
                        redo();
                    } else {
                        undo();
                    }
                }
                break;
            case 'y':
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    e.stopPropagation();
                    redo();
                }
                break;
            case 'b':
            case 'i':
            case 'u':
                // Block browser shortcuts when in spreadsheet
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    e.stopPropagation();
                }
                break;
        }
    }, [selectedCell, editingCell, data.length, headers.length, selectedRange,
        copySelection, cutSelection, pasteSelection, updateCell, saveSpreadsheet, scrollCellIntoView, undo, redo]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    const isCellSelected = (rowIndex, colIndex) => {
        if (selectedRange) {
            const { startRow, endRow, startCol, endCol } = selectedRange;
            return rowIndex >= startRow && rowIndex <= endRow &&
                   colIndex >= startCol && colIndex <= endCol;
        }
        return selectedCell?.row === rowIndex && selectedCell?.col === colIndex;
    };

    if (error) return <div className="p-4 text-red-500">Error: {error}</div>;

    const hasActiveFilters = searchQuery.trim() || Object.values(filters).some(f => f.trim()) || sortConfig;

    return (
        <div className="flex-1 flex flex-col theme-bg-secondary" style={{ overflow: 'hidden', position: 'relative' }}>
            {/* Header bar */}
            <div
                draggable="true"
                onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'move';
                    const nodePath = findNodePath(rootLayoutNode, nodeId);
                    e.dataTransfer.setData('application/json',
                        JSON.stringify({ type: 'pane', id: nodeId, nodePath })
                    );
                    setTimeout(() => setDraggedItem({ type: 'pane', id: nodeId, nodePath }), 0);
                }}
                onDragEnd={() => setDraggedItem(null)}
                onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setCsvContextMenu({ x: e.clientX, y: e.clientY });
                }}
                className="p-2 border-b theme-border text-xs theme-text-muted flex-shrink-0 theme-bg-secondary cursor-move"
            >
                <div className="flex justify-between items-center">
                    <span className="truncate font-semibold">
                        {filePath ? getFileName(filePath) : 'Untitled'}{hasChanges ? ' *' : ''}
                    </span>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={saveSpreadsheet}
                            disabled={!hasChanges}
                            className="p-1 theme-hover rounded disabled:opacity-50"
                            title="Save (Ctrl+S)"
                        >
                            <Save size={14} />
                        </button>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                closeContentPane(nodeId, findNodePath(rootLayoutNode, nodeId));
                            }}
                            className="p-1 theme-hover rounded-full"
                        >
                            <X size={14} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Enhanced toolbar */}
            <div className="flex items-center gap-2 px-2 py-1.5 border-b theme-border theme-bg-tertiary flex-shrink-0">
                {/* Undo/Redo */}
                <button
                    onClick={undo}
                    disabled={historyIndex <= 0}
                    className="p-1.5 theme-hover rounded disabled:opacity-30"
                    title="Undo (Ctrl+Z)"
                >
                    <Undo size={14} />
                </button>
                <button
                    onClick={redo}
                    disabled={historyIndex >= history.length - 1}
                    className="p-1.5 theme-hover rounded disabled:opacity-30"
                    title="Redo (Ctrl+Y)"
                >
                    <Redo size={14} />
                </button>

                <div className="w-px h-4 bg-gray-600" />

                {/* Search */}
                <div className="relative flex-1 max-w-xs">
                    <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search all data..."
                        className="w-full bg-white/5 border border-white/10 rounded pl-7 pr-2 py-1 text-[11px] text-gray-300 placeholder-gray-600 focus:outline-none focus:border-blue-500/50"
                    />
                    {searchQuery && (
                        <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                            <X size={10} />
                        </button>
                    )}
                </div>

                {/* Filter toggle */}
                <button
                    onClick={() => setShowFilterRow(!showFilterRow)}
                    className={`p-1.5 rounded flex items-center gap-1 text-[10px] ${showFilterRow ? 'bg-blue-600/30 text-blue-400' : 'theme-hover theme-text-muted'}`}
                    title="Toggle column filters"
                >
                    <Filter size={12} />
                    <span className="hidden sm:inline">Filters</span>
                </button>

                {/* Clear filters */}
                {hasActiveFilters && (
                    <button
                        onClick={clearFilters}
                        className="p-1.5 rounded text-[10px] text-orange-400 hover:bg-orange-600/20"
                        title="Clear all filters"
                    >
                        <X size={12} />
                    </button>
                )}

                <div className="w-px h-4 bg-gray-600" />

                {/* Stats indicator */}
                <span className="text-[10px] text-gray-500">
                    {processedData.length === data.length
                        ? `${data.length} rows`
                        : `${processedData.length} of ${data.length} rows`
                    }
                </span>

                <div className="flex-1" />

                {/* Freeze panes */}
                <button
                    onClick={() => setFreezeRow(!freezeRow)}
                    className={`p-1.5 rounded flex items-center gap-1 text-[10px] ${freezeRow ? 'bg-blue-600/30 text-blue-400' : 'theme-hover theme-text-muted'}`}
                    title="Freeze top row"
                >
                    <Pin size={12} className="rotate-45" />
                    <span className="hidden sm:inline">Freeze Row</span>
                </button>
                <button
                    onClick={() => setFreezeCol(!freezeCol)}
                    className={`p-1.5 rounded flex items-center gap-1 text-[10px] ${freezeCol ? 'bg-blue-600/30 text-blue-400' : 'theme-hover theme-text-muted'}`}
                    title="Freeze first column"
                >
                    <Pin size={12} />
                    <span className="hidden sm:inline">Freeze Col</span>
                </button>

                <div className="w-px h-4 bg-gray-600" />

                {/* Auto-fit columns */}
                <button
                    onClick={autoFitColumns}
                    className="p-1.5 rounded theme-hover flex items-center gap-1 text-[10px] theme-text-muted"
                    title="Auto-fit column widths"
                >
                    <Maximize2 size={12} />
                    <span className="hidden sm:inline">Auto-fit</span>
                </button>

                {/* Chart button */}
                <button
                    onClick={() => setShowChartModal(true)}
                    className="p-1.5 rounded theme-hover flex items-center gap-1 text-[10px] theme-text-muted"
                    title="Create Chart"
                >
                    <BarChart2 size={12} />
                    <span className="hidden sm:inline">Chart</span>
                </button>

                {/* Document light/dark mode toggle */}
                <button
                    onClick={() => setDocLightMode(!docLightMode)}
                    className="p-1.5 rounded theme-hover flex items-center gap-1 text-[10px] theme-text-muted"
                    title={docLightMode ? "Switch to dark mode" : "Switch to light mode"}
                >
                    {docLightMode ? <Moon size={12} /> : <Sun size={12} />}
                </button>

                {/* Export dropdown */}
                <div className="relative group">
                    <button className="p-1.5 rounded theme-hover flex items-center gap-1 text-[10px] theme-text-muted">
                        <Download size={12} />
                        <span className="hidden sm:inline">Export</span>
                        <ChevronDown size={10} />
                    </button>
                    <div className="absolute right-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded shadow-lg z-20 hidden group-hover:block min-w-[100px]">
                        <button onClick={() => exportData('csv')} className="w-full px-3 py-1.5 text-left text-xs hover:bg-gray-700">CSV</button>
                        <button onClick={() => exportData('json')} className="w-full px-3 py-1.5 text-left text-xs hover:bg-gray-700">JSON</button>
                        <button onClick={() => exportData('xlsx')} className="w-full px-3 py-1.5 text-left text-xs hover:bg-gray-700">Excel</button>
                    </div>
                </div>
            </div>

            {/* Formatting toolbar */}
            <div className="flex items-center gap-1 px-2 py-1 border-b theme-border theme-bg-tertiary flex-shrink-0 flex-wrap">
                {/* Font family */}
                <div className="relative">
                    <button
                        onClick={() => setShowFontPicker(!showFontPicker)}
                        className="px-2 py-1 rounded theme-hover text-[10px] flex items-center gap-1 min-w-[80px] border border-white/10"
                    >
                        <Type size={10} />
                        <span className="truncate">{currentStyle.fontFamily || 'Arial'}</span>
                        <ChevronDown size={8} />
                    </button>
                    {showFontPicker && (
                        <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-700 rounded shadow-lg z-30 max-h-48 overflow-y-auto min-w-[120px]">
                            {FONTS.map(font => (
                                <button
                                    key={font}
                                    onClick={() => { applyStyleToSelection({ fontFamily: font }); setShowFontPicker(false); }}
                                    className="w-full px-2 py-1 text-left text-xs hover:bg-gray-700"
                                    style={{ fontFamily: font }}
                                >
                                    {font}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Font size */}
                <select
                    value={currentStyle.fontSize || 12}
                    onChange={(e) => applyStyleToSelection({ fontSize: parseInt(e.target.value) })}
                    className="px-1 py-1 rounded theme-bg-secondary border border-white/10 text-[10px] w-14"
                >
                    {FONT_SIZES.map(size => (
                        <option key={size} value={size}>{size}</option>
                    ))}
                </select>

                <div className="w-px h-4 bg-gray-600 mx-0.5" />

                {/* Bold */}
                <button
                    onClick={() => applyStyleToSelection({ bold: !currentStyle.bold })}
                    className={`p-1.5 rounded ${currentStyle.bold ? 'bg-blue-600/40 text-blue-300' : 'theme-hover'}`}
                    title="Bold (Ctrl+B)"
                >
                    <Bold size={12} />
                </button>

                {/* Italic */}
                <button
                    onClick={() => applyStyleToSelection({ italic: !currentStyle.italic })}
                    className={`p-1.5 rounded ${currentStyle.italic ? 'bg-blue-600/40 text-blue-300' : 'theme-hover'}`}
                    title="Italic (Ctrl+I)"
                >
                    <Italic size={12} />
                </button>

                {/* Underline */}
                <button
                    onClick={() => applyStyleToSelection({ underline: !currentStyle.underline })}
                    className={`p-1.5 rounded ${currentStyle.underline ? 'bg-blue-600/40 text-blue-300' : 'theme-hover'}`}
                    title="Underline (Ctrl+U)"
                >
                    <Underline size={12} />
                </button>

                {/* Strikethrough */}
                <button
                    onClick={() => applyStyleToSelection({ strikethrough: !currentStyle.strikethrough })}
                    className={`p-1.5 rounded ${currentStyle.strikethrough ? 'bg-blue-600/40 text-blue-300' : 'theme-hover'}`}
                    title="Strikethrough"
                >
                    <Strikethrough size={12} />
                </button>

                <div className="w-px h-4 bg-gray-600 mx-0.5" />

                {/* Text color */}
                <div className="relative">
                    <button
                        onClick={() => setShowTextColorPicker(!showTextColorPicker)}
                        className="p-1.5 rounded theme-hover flex items-center gap-0.5"
                        title="Text color"
                    >
                        <Type size={12} />
                        <div className="w-3 h-1 rounded-sm" style={{ backgroundColor: currentStyle.textColor || '#ffffff' }} />
                    </button>
                    {showTextColorPicker && (
                        <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-700 rounded shadow-lg z-30 p-2">
                            <div className="grid grid-cols-6 gap-1">
                                {PRESET_COLORS.map(color => (
                                    <button
                                        key={color}
                                        onClick={() => { applyStyleToSelection({ textColor: color }); setShowTextColorPicker(false); }}
                                        className="w-5 h-5 rounded border border-gray-600 hover:scale-110 transition-transform"
                                        style={{ backgroundColor: color }}
                                    />
                                ))}
                            </div>
                            <input
                                type="color"
                                value={currentStyle.textColor || '#ffffff'}
                                onChange={(e) => applyStyleToSelection({ textColor: e.target.value })}
                                className="w-full h-6 mt-1 cursor-pointer"
                            />
                        </div>
                    )}
                </div>

                {/* Background color */}
                <div className="relative">
                    <button
                        onClick={() => setShowBgColorPicker(!showBgColorPicker)}
                        className="p-1.5 rounded theme-hover flex items-center gap-0.5"
                        title="Fill color"
                    >
                        <Paintbrush size={12} />
                        <div className="w-3 h-1 rounded-sm" style={{ backgroundColor: currentStyle.bgColor || 'transparent', border: '1px solid #555' }} />
                    </button>
                    {showBgColorPicker && (
                        <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-700 rounded shadow-lg z-30 p-2">
                            <button
                                onClick={() => { applyStyleToSelection({ bgColor: undefined }); setShowBgColorPicker(false); }}
                                className="w-full px-2 py-1 text-xs hover:bg-gray-700 mb-1 text-left"
                            >
                                No fill
                            </button>
                            <div className="grid grid-cols-6 gap-1">
                                {PRESET_COLORS.map(color => (
                                    <button
                                        key={color}
                                        onClick={() => { applyStyleToSelection({ bgColor: color }); setShowBgColorPicker(false); }}
                                        className="w-5 h-5 rounded border border-gray-600 hover:scale-110 transition-transform"
                                        style={{ backgroundColor: color }}
                                    />
                                ))}
                            </div>
                            <input
                                type="color"
                                value={currentStyle.bgColor || '#000000'}
                                onChange={(e) => applyStyleToSelection({ bgColor: e.target.value })}
                                className="w-full h-6 mt-1 cursor-pointer"
                            />
                        </div>
                    )}
                </div>

                <div className="w-px h-4 bg-gray-600 mx-0.5" />

                {/* Alignment */}
                <button
                    onClick={() => applyStyleToSelection({ align: 'left' })}
                    className={`p-1.5 rounded ${currentStyle.align === 'left' ? 'bg-blue-600/40 text-blue-300' : 'theme-hover'}`}
                    title="Align left"
                >
                    <AlignLeft size={12} />
                </button>
                <button
                    onClick={() => applyStyleToSelection({ align: 'center' })}
                    className={`p-1.5 rounded ${currentStyle.align === 'center' ? 'bg-blue-600/40 text-blue-300' : 'theme-hover'}`}
                    title="Align center"
                >
                    <AlignCenter size={12} />
                </button>
                <button
                    onClick={() => applyStyleToSelection({ align: 'right' })}
                    className={`p-1.5 rounded ${currentStyle.align === 'right' ? 'bg-blue-600/40 text-blue-300' : 'theme-hover'}`}
                    title="Align right"
                >
                    <AlignRight size={12} />
                </button>

                <div className="w-px h-4 bg-gray-600 mx-0.5" />

                {/* Number format */}
                <div className="relative">
                    <button
                        onClick={() => setShowNumberFormat(!showNumberFormat)}
                        className="p-1.5 rounded theme-hover flex items-center gap-1 text-[10px]"
                        title="Number format"
                    >
                        <Hash size={12} />
                        <ChevronDown size={8} />
                    </button>
                    {showNumberFormat && (
                        <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-700 rounded shadow-lg z-30 min-w-[120px]">
                            <button onClick={() => { applyStyleToSelection({ numberFormat: 'general' }); setShowNumberFormat(false); }} className="w-full px-2 py-1.5 text-left text-xs hover:bg-gray-700">General</button>
                            <button onClick={() => { applyStyleToSelection({ numberFormat: 'number' }); setShowNumberFormat(false); }} className="w-full px-2 py-1.5 text-left text-xs hover:bg-gray-700 flex items-center gap-2"><Hash size={10} /> Number</button>
                            <button onClick={() => { applyStyleToSelection({ numberFormat: 'currency' }); setShowNumberFormat(false); }} className="w-full px-2 py-1.5 text-left text-xs hover:bg-gray-700 flex items-center gap-2"><DollarSign size={10} /> Currency</button>
                            <button onClick={() => { applyStyleToSelection({ numberFormat: 'percent' }); setShowNumberFormat(false); }} className="w-full px-2 py-1.5 text-left text-xs hover:bg-gray-700 flex items-center gap-2"><Percent size={10} /> Percent</button>
                            <button onClick={() => { applyStyleToSelection({ numberFormat: 'date' }); setShowNumberFormat(false); }} className="w-full px-2 py-1.5 text-left text-xs hover:bg-gray-700 flex items-center gap-2"><Calendar size={10} /> Date</button>
                        </div>
                    )}
                </div>

                {/* Borders */}
                <button
                    onClick={() => applyStyleToSelection({
                        borderTop: true, borderBottom: true, borderLeft: true, borderRight: true
                    })}
                    className="p-1.5 rounded theme-hover"
                    title="All borders"
                >
                    <Grid3X3 size={12} />
                </button>
            </div>

            <div
                ref={tableRef}
                style={{
                    overflow: 'scroll',
                    position: 'absolute',
                    top: '115px', // Header + search toolbar + format toolbar
                    bottom: isXlsx && sheetNames.length > 0 ? '85px' : '45px',
                    left: '0',
                    right: '0'
                }}
            >
                <table className="border-collapse text-sm">
                    <thead className={`${freezeRow ? 'sticky top-0' : ''} theme-bg-tertiary z-10`}>
                        {/* Header row */}
                        <tr>
                            <th className={`border theme-border p-1 w-12 bg-gray-700 ${freezeCol ? 'sticky left-0 z-[15]' : ''}`}>#</th>
                            {headers.map((header, colIndex) => (
                                <th
                                    key={colIndex}
                                    className={`border theme-border p-0 min-w-[100px] group relative ${selectedCell?.col === colIndex ? 'bg-teal-900/40' : 'bg-gray-700'}`}
                                    style={{ width: columnWidths[colIndex] ? `${columnWidths[colIndex]}px` : 'auto' }}
                                >
                                    <div className="flex items-center">
                                        {/* Column type indicator */}
                                        <span className="px-1 text-gray-500" title={`Type: ${columnTypes[colIndex] || 'text'}`}>
                                            {columnTypes[colIndex] === 'number' ? <Hash size={10} /> :
                                             columnTypes[colIndex] === 'date' ? <Calendar size={10} /> :
                                             <Type size={10} />}
                                        </span>

                                        {/* Editable header */}
                                        <input
                                            type="text"
                                            value={header}
                                            onChange={(e) => updateHeader(colIndex, e.target.value)}
                                            className="flex-1 bg-transparent text-center font-semibold outline-none py-1 min-w-0"
                                        />

                                        {/* Sort button */}
                                        <button
                                            onClick={() => toggleSort(colIndex)}
                                            className={`p-0.5 rounded ${sortConfig?.column === colIndex ? 'text-blue-400' : 'text-gray-500 opacity-0 group-hover:opacity-100'}`}
                                            title="Sort column"
                                        >
                                            {sortConfig?.column === colIndex
                                                ? (sortConfig.direction === 'asc' ? <SortAsc size={12} /> : <SortDesc size={12} />)
                                                : <SortAsc size={12} />
                                            }
                                        </button>

                                        {/* Delete button */}
                                        <button
                                            onClick={() => deleteColumn(colIndex)}
                                            className="p-0.5 text-red-400 opacity-0 group-hover:opacity-100"
                                            title="Delete column"
                                        >
                                            <Trash2 size={10} />
                                        </button>
                                    </div>
                                </th>
                            ))}
                            <th className="border theme-border p-1 w-12 bg-gray-700">
                                <button
                                    onClick={addColumn}
                                    className="w-full h-full flex items-center justify-center theme-hover"
                                    title="Add column"
                                >
                                    <Plus size={14} />
                                </button>
                            </th>
                        </tr>

                        {/* Filter row */}
                        {showFilterRow && (
                            <tr className="bg-gray-800">
                                <th className={`border theme-border p-0.5 w-12 ${freezeCol ? 'sticky left-0 z-[15] bg-gray-800' : ''}`}>
                                    <Filter size={10} className="mx-auto text-gray-500" />
                                </th>
                                {headers.map((_, colIndex) => (
                                    <th key={`filter-${colIndex}`} className="border theme-border p-0.5">
                                        <input
                                            type="text"
                                            value={filters[colIndex] || ''}
                                            onChange={(e) => setFilters(prev => ({ ...prev, [colIndex]: e.target.value }))}
                                            placeholder="Filter..."
                                            className="w-full bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-[10px] text-gray-300 placeholder-gray-600 focus:outline-none focus:border-blue-500/50"
                                        />
                                    </th>
                                ))}
                                <th className="border theme-border p-0.5 w-12">
                                    {Object.values(filters).some(f => f.trim()) && (
                                        <button
                                            onClick={() => setFilters({})}
                                            className="text-orange-400 hover:text-orange-300"
                                            title="Clear column filters"
                                        >
                                            <X size={10} />
                                        </button>
                                    )}
                                </th>
                            </tr>
                        )}
                    </thead>
                    <tbody>
                        {processedData.map((row, displayRowIndex) => {
                            const rowIndex = getOriginalRowIndex(displayRowIndex);
                            return (
                            <tr key={`row-${rowIndex}-${displayRowIndex}`} className="group">
                                <td className={`border theme-border p-1 ${selectedCell?.row === rowIndex ? 'bg-teal-900/40' : 'bg-gray-700'} ${freezeCol ? 'sticky left-0 z-[5]' : ''}`}>
                                    <div className="flex items-center justify-between gap-1">
                                        <span className={`text-xs ${selectedCell?.row === rowIndex ? 'text-teal-300 font-medium' : 'text-gray-400'}`}>{rowIndex + 1}</span>
                                        <div className="flex flex-col opacity-0 group-hover:opacity-100">
                                            <button
                                                onClick={() => moveRow(rowIndex, -1)}
                                                disabled={rowIndex === 0}
                                                className="p-0.5 theme-hover rounded disabled:opacity-30"
                                            >
                                                <ArrowUp size={10} />
                                            </button>
                                            <button
                                                onClick={() => moveRow(rowIndex, 1)}
                                                disabled={rowIndex === data.length - 1}
                                                className="p-0.5 theme-hover rounded disabled:opacity-30"
                                            >
                                                <ArrowDown size={10} />
                                            </button>
                                        </div>
                                        <button
                                            onClick={() => deleteRow(rowIndex)}
                                            className="p-0.5 bg-red-500 rounded opacity-0 group-hover:opacity-100"
                                            title="Delete row"
                                        >
                                            <Trash2 size={10} />
                                        </button>
                                    </div>
                                </td>
                                {headers.map((_, colIndex) => {
                                    const isEditing = editingCell?.row === rowIndex && editingCell?.col === colIndex;
                                    const isSelected = isCellSelected(rowIndex, colIndex);
                                    const cellValue = row[colIndex] ?? '';
                                    const style = getCellStyle(rowIndex, colIndex);
                                    const cellKey = `${rowIndex},${colIndex}`;
                                    const validation = dataValidations[cellKey];
                                    const displayValue = typeof cellValue === 'string' && cellValue.startsWith('=')
                                        ? evaluateFormula(cellValue, data)
                                        : formatCellValue(cellValue, style);

                                    // Build cell inline styles
                                    const cellInlineStyle: React.CSSProperties = {
                                        fontFamily: style.fontFamily || 'inherit',
                                        fontSize: style.fontSize ? `${style.fontSize}px` : 'inherit',
                                        fontWeight: style.bold ? 'bold' : 'normal',
                                        fontStyle: style.italic ? 'italic' : 'normal',
                                        textDecoration: [
                                            style.underline ? 'underline' : '',
                                            style.strikethrough ? 'line-through' : ''
                                        ].filter(Boolean).join(' ') || 'none',
                                        color: style.textColor || (docLightMode ? '#111827' : '#e5e7eb'),
                                        backgroundColor: style.bgColor || 'transparent',
                                        textAlign: style.align || 'left',
                                        borderTop: style.borderTop ? '1px solid #555' : undefined,
                                        borderBottom: style.borderBottom ? '1px solid #555' : undefined,
                                        borderLeft: style.borderLeft ? '1px solid #555' : undefined,
                                        borderRight: style.borderRight ? '1px solid #555' : undefined,
                                    };

                                    // Check if this is a boolean cell (checkbox)
                                    const isBoolean = style.isBoolean || (typeof cellValue === 'boolean') || cellValue === 'TRUE' || cellValue === 'FALSE' || cellValue === true || cellValue === false;
                                    const boolValue = cellValue === true || cellValue === 'TRUE' || cellValue === 1 || cellValue === '1';

                                    return (
                                        <td
                                            key={colIndex}
                                            className={`border theme-border p-0
                                            ${isSelected && !isEditing ? 'ring-2 ring-teal-400 shadow-[inset_0_0_0_1px_rgba(45,212,191,0.3)]' : ''}
                                            ${isEditing ? 'ring-2 ring-teal-300 shadow-[inset_0_0_0_1px_rgba(45,212,191,0.5)]' : ''}
                                            ${docLightMode ? 'hover:bg-teal-50' : 'hover:bg-teal-900/20'} cursor-cell`}
                                            style={{ backgroundColor: isSelected && !isEditing ? (docLightMode ? '#ccfbf1' : 'rgba(20, 184, 166, 0.15)') : isEditing ? (docLightMode ? '#f0fdfa' : 'rgba(20, 184, 166, 0.1)') : style.bgColor || (docLightMode ? 'white' : '#1f2937') }}
                                            onClick={(e) => handleCellClick(rowIndex, colIndex, e)}
                                            onDoubleClick={() => !isBoolean && !validation && handleCellDoubleClick(rowIndex, colIndex)}
                                            onContextMenu={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                setSelectedCell({ row: rowIndex, col: colIndex });
                                                setCsvContextMenu({ x: e.clientX, y: e.clientY, rowIndex, colIndex });
                                            }}
                                        >
                                            {/* Boolean values render as checkboxes */}
                                            {isBoolean && !isEditing ? (
                                                <div className="p-2 min-h-[32px] flex items-center justify-center">
                                                    <input
                                                        type="checkbox"
                                                        checked={boolValue}
                                                        onChange={(e) => {
                                                            updateCell(rowIndex, colIndex, e.target.checked);
                                                        }}
                                                        className="w-4 h-4 cursor-pointer accent-blue-500"
                                                        onClick={(e) => e.stopPropagation()}
                                                    />
                                                </div>
                                            ) : validation?.type === 'list' && validation.values && validation.values.length > 0 ? (
                                                /* Data validation dropdown */
                                                <select
                                                    value={String(cellValue)}
                                                    onChange={(e) => updateCell(rowIndex, colIndex, e.target.value)}
                                                    onClick={(e) => e.stopPropagation()}
                                                    className={`w-full h-full p-2 bg-transparent outline-none cursor-pointer ${docLightMode ? 'text-gray-900' : 'text-gray-100'}`}
                                                    style={cellInlineStyle}
                                                >
                                                    <option value="">{cellValue || '-- Select --'}</option>
                                                    {validation.values.map((v, i) => (
                                                        <option key={i} value={v}>{v}</option>
                                                    ))}
                                                </select>
                                            ) : isEditing ? (
                                                <input
                                                    type="text"
                                                    value={cellValue}
                                                    onChange={(e) => updateCell(rowIndex, colIndex, e.target.value)}
                                                    onBlur={() => setEditingCell(null)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter' || e.key === 'Escape') {
                                                            setEditingCell(null);
                                                        }
                                                    }}
                                                    className={`w-full h-full p-2 bg-transparent outline-none ${docLightMode ? 'text-gray-900' : 'text-gray-100'}`}
                                                    autoFocus
                                                />
                                            ) : (
                                                <div className={`p-2 min-h-[32px] ${docLightMode ? 'text-gray-900' : 'text-gray-100'}`} style={cellInlineStyle}>{displayValue}</div>
                                            )}
                                        </td>
                                    );
                                })}
                            </tr>
                        );
                        })}
                    </tbody>
                </table>
            </div>

            {isXlsx && sheetNames.length > 0 && (
                <div className="absolute bottom-[45px] left-0 right-0 flex items-center gap-1 p-2 border-t theme-border theme-bg-tertiary overflow-x-auto">
                    {sheetNames.map(name => (
                        <button
                            key={name}
                            onClick={() => switchSheet(name)}
                            className={`px-3 py-1 text-xs rounded transition-all whitespace-nowrap ${ 
                                activeSheet === name
                                    ? 'theme-button-primary'
                                    : 'theme-button theme-hover'
                            }`}
                        >
                            {name}
                        </button>
                    ))}
                    <button
                        onClick={addSheet}
                        className="p-1 theme-hover rounded"
                        title="Add sheet"
                    >
                        <Plus size={14} />
                    </button>
                </div>
            )}

            <div className="p-2 border-t theme-border text-xs theme-text-muted flex items-center justify-between absolute bottom-0 left-0 right-0 theme-bg-secondary">
                <div className="flex items-center gap-4">
                    {selectedCell && (
                        <>
                            <span>
                                Cell: {indexToColLetters(selectedCell.col)}{selectedCell.row + 1}
                            </span>
                            {selectedRange && (() => {
                                const { startRow, endRow, startCol, endCol } = selectedRange;
                                const rows = endRow - startRow + 1;
                                const cols = endCol - startCol + 1;
                                const nums: number[] = [];
                                for (let r = startRow; r <= endRow; r++) {
                                    for (let c = startCol; c <= endCol; c++) {
                                        const val = parseFloat(data[r]?.[c]);
                                        if (!isNaN(val)) nums.push(val);
                                    }
                                }
                                const sum = nums.reduce((a, b) => a + b, 0);
                                const avg = nums.length > 0 ? sum / nums.length : 0;
                                const fmtNum = (n: number) => Number.isInteger(n) ? n.toString() : n.toFixed(2);
                                return (
                                    <>
                                        <span className="text-gray-500">
                                            {indexToColLetters(startCol)}{startRow + 1}:{indexToColLetters(endCol)}{endRow + 1} ({rows}×{cols})
                                        </span>
                                        {nums.length > 0 && (
                                            <>
                                                <span className="text-teal-400">Sum: {fmtNum(sum)}</span>
                                                <span className="text-blue-400">Avg: {fmtNum(avg)}</span>
                                                <span className="text-gray-400">Count: {nums.length}</span>
                                                <span className="text-pink-400">Min: {fmtNum(Math.min(...nums))}</span>
                                                <span className="text-amber-400">Max: {fmtNum(Math.max(...nums))}</span>
                                            </>
                                        )}
                                    </>
                                );
                            })()}
                        </>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={copySelection} className="p-1 theme-hover rounded" title="Copy (Ctrl+C)">
                        <Copy size={12} />
                    </button>
                    <button onClick={cutSelection} className="p-1 theme-hover rounded" title="Cut (Ctrl+X)">
                        <Scissors size={12} />
                    </button>
                </div>
            </div>

            {/* Chart Modal */}
            {showChartModal && (
                <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-8">
                    <div className="bg-gray-800 rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
                        {/* Header */}
                        <div className="flex items-center justify-between p-4 border-b border-gray-700">
                            <h3 className="text-lg font-semibold flex items-center gap-2">
                                <BarChart2 size={20} className="text-blue-400" />
                                Create Chart
                            </h3>
                            <button onClick={() => setShowChartModal(false)} className="p-1 hover:bg-gray-700 rounded">
                                <X size={20} />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="flex flex-1 overflow-hidden">
                            {/* Settings Panel */}
                            <div className="w-64 border-r border-gray-700 p-4 space-y-4 overflow-y-auto">
                                {/* Chart Type */}
                                <div>
                                    <label className="block text-xs font-medium text-gray-400 mb-2">Chart Type</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        {[
                                            { type: 'bar', icon: BarChart2, label: 'Bar' },
                                            { type: 'line', icon: LineChart, label: 'Line' },
                                            { type: 'area', icon: Activity, label: 'Area' },
                                            { type: 'pie', icon: PieChart, label: 'Pie' },
                                        ].map(({ type, icon: Icon, label }) => (
                                            <button
                                                key={type}
                                                onClick={() => setChartType(type as any)}
                                                className={`p-2 rounded flex flex-col items-center gap-1 text-xs ${
                                                    chartType === type ? 'bg-blue-600/40 border border-blue-500' : 'bg-gray-700 hover:bg-gray-600'
                                                }`}
                                            >
                                                <Icon size={16} />
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* X Axis Column */}
                                <div>
                                    <label className="block text-xs font-medium text-gray-400 mb-2">
                                        {chartType === 'pie' ? 'Labels Column' : 'X Axis (Labels)'}
                                    </label>
                                    <select
                                        value={chartXColumn}
                                        onChange={(e) => setChartXColumn(Number(e.target.value))}
                                        className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-sm"
                                    >
                                        {headers.map((header, i) => (
                                            <option key={i} value={i}>{header || `Column ${i + 1}`}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Y Axis Columns */}
                                <div>
                                    <label className="block text-xs font-medium text-gray-400 mb-2">
                                        {chartType === 'pie' ? 'Values Column' : 'Y Axis (Values)'}
                                    </label>
                                    <div className="space-y-2 max-h-40 overflow-y-auto">
                                        {headers.map((header, i) => (
                                            <label key={i} className="flex items-center gap-2 text-sm">
                                                <input
                                                    type={chartType === 'pie' ? 'radio' : 'checkbox'}
                                                    checked={chartYColumns.includes(i)}
                                                    onChange={(e) => {
                                                        if (chartType === 'pie') {
                                                            setChartYColumns([i]);
                                                        } else if (e.target.checked) {
                                                            setChartYColumns([...chartYColumns, i]);
                                                        } else {
                                                            setChartYColumns(chartYColumns.filter(c => c !== i));
                                                        }
                                                    }}
                                                    className="accent-blue-500"
                                                />
                                                <span className={chartYColumns.includes(i) ? 'text-blue-400' : 'text-gray-400'}>
                                                    {header || `Column ${i + 1}`}
                                                </span>
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                {/* Info */}
                                <div className="text-xs text-gray-500 bg-gray-900/50 p-2 rounded">
                                    Showing first 50 rows of data. Select numeric columns for best results.
                                </div>
                            </div>

                            {/* Chart Canvas */}
                            <div className="flex-1 p-4 flex items-center justify-center bg-gray-900">
                                <canvas
                                    ref={chartCanvasRef}
                                    width={700}
                                    height={450}
                                    className="rounded border border-gray-700"
                                />
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="flex items-center justify-end gap-2 p-4 border-t border-gray-700">
                            <button
                                onClick={() => {
                                    const canvas = chartCanvasRef.current;
                                    if (canvas) {
                                        const link = document.createElement('a');
                                        link.download = 'chart.png';
                                        link.href = canvas.toDataURL('image/png');
                                        link.click();
                                    }
                                }}
                                className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded text-sm font-medium flex items-center gap-2"
                            >
                                <Download size={14} />
                                Export as PNG
                            </button>
                            <button
                                onClick={() => setShowChartModal(false)}
                                className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded text-sm"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Spreadsheet Context Menu */}
            {csvContextMenu && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setCsvContextMenu(null)} />
                    <div
                        className="fixed theme-bg-secondary theme-border border rounded shadow-lg py-1 z-50 text-sm min-w-[180px]"
                        style={{ top: csvContextMenu.y, left: csvContextMenu.x }}
                    >
                        {csvContextMenu.rowIndex != null && (
                            <>
                                <button onClick={() => { addRow(csvContextMenu.rowIndex! + 1); setCsvContextMenu(null); }} className="flex items-center gap-2 px-4 py-1.5 w-full text-left theme-hover text-xs">
                                    <Plus size={12} /> Insert Row Below
                                </button>
                                <button onClick={() => { addRow(csvContextMenu.rowIndex!); setCsvContextMenu(null); }} className="flex items-center gap-2 px-4 py-1.5 w-full text-left theme-hover text-xs">
                                    <Plus size={12} /> Insert Row Above
                                </button>
                                <button onClick={() => { deleteRow(csvContextMenu.rowIndex!); setCsvContextMenu(null); }} className="flex items-center gap-2 px-4 py-1.5 w-full text-left theme-hover text-xs text-red-400">
                                    <Trash2 size={12} /> Delete Row
                                </button>
                                <div className="border-t theme-border my-1" />
                            </>
                        )}
                        {csvContextMenu.colIndex != null && (
                            <>
                                <button onClick={() => { addColumn(); setCsvContextMenu(null); }} className="flex items-center gap-2 px-4 py-1.5 w-full text-left theme-hover text-xs">
                                    <Columns size={12} /> Add Column
                                </button>
                                <button onClick={() => { deleteColumn(csvContextMenu.colIndex!); setCsvContextMenu(null); }} className="flex items-center gap-2 px-4 py-1.5 w-full text-left theme-hover text-xs text-red-400">
                                    <Trash2 size={12} /> Delete Column
                                </button>
                                <div className="border-t theme-border my-1" />
                                <button onClick={() => { toggleSort(csvContextMenu.colIndex!); setCsvContextMenu(null); }} className="flex items-center gap-2 px-4 py-1.5 w-full text-left theme-hover text-xs">
                                    <SortAsc size={12} /> Sort Column
                                </button>
                                <div className="border-t theme-border my-1" />
                            </>
                        )}
                        <button onClick={() => { document.execCommand('copy'); setCsvContextMenu(null); }} className="flex items-center gap-2 px-4 py-1.5 w-full text-left theme-hover text-xs">
                            <Copy size={12} /> Copy
                        </button>
                        <button onClick={() => { document.execCommand('cut'); setCsvContextMenu(null); }} className="flex items-center gap-2 px-4 py-1.5 w-full text-left theme-hover text-xs">
                            <Scissors size={12} /> Cut
                        </button>
                        {selectedCell && clipboard && (
                            <button onClick={() => { /* paste handled by keyboard */ setCsvContextMenu(null); }} className="flex items-center gap-2 px-4 py-1.5 w-full text-left theme-hover text-xs">
                                <Plus size={12} /> Paste
                            </button>
                        )}
                        <div className="border-t theme-border my-1" />
                        <button onClick={() => { saveSpreadsheet(); setCsvContextMenu(null); }} className="flex items-center gap-2 px-4 py-1.5 w-full text-left theme-hover text-xs">
                            <Save size={12} /> Save
                        </button>
                        <button onClick={() => { setShowChartModal(true); setCsvContextMenu(null); }} className="flex items-center gap-2 px-4 py-1.5 w-full text-left theme-hover text-xs">
                            <BarChart2 size={12} /> Create Chart
                        </button>
                        <div className="border-t theme-border my-1" />
                        <div className="px-4 py-1.5 text-[10px] text-gray-500">
                            Default grid: {defaultRows}×{defaultCols}
                        </div>
                        <div className="px-4 py-1 flex items-center gap-2">
                            <input
                                type="number"
                                min="1"
                                max="100"
                                defaultValue={defaultRows}
                                className="w-12 px-1 py-0.5 text-[10px] bg-gray-700 border border-gray-600 rounded text-center"
                                placeholder="Rows"
                                onBlur={(e) => { localStorage.setItem('xlsx_defaultRows', e.target.value); }}
                            />
                            <span className="text-[10px] text-gray-500">×</span>
                            <input
                                type="number"
                                min="1"
                                max="100"
                                defaultValue={defaultCols}
                                className="w-12 px-1 py-0.5 text-[10px] bg-gray-700 border border-gray-600 rounded text-center"
                                placeholder="Cols"
                                onBlur={(e) => { localStorage.setItem('xlsx_defaultCols', e.target.value); }}
                            />
                            <span className="text-[10px] text-gray-400">default</span>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

// Custom comparison to prevent reload on pane resize
const arePropsEqual = (prevProps: any, nextProps: any) => {
    return prevProps.nodeId === nextProps.nodeId;
};

export default memo(CsvViewer, arePropsEqual);