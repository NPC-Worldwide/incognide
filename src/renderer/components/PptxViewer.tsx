// PptxViewer - Enhanced PowerPoint-like Editor
import React, { useEffect, useRef, useState, useCallback, memo, useMemo } from 'react';
import JSZip from 'jszip';
import {
  Save, X, ChevronLeft, ChevronRight, Plus, Copy, Trash2, Image as ImageIcon,
  AlignLeft, AlignCenter, AlignRight, Type, Square, Circle, Bold, Italic,
  Underline, Strikethrough, ZoomIn, ZoomOut, Play, ChevronDown, Palette,
  LayoutGrid, Grid, Maximize2, MousePointer, Move, RotateCcw, Layers,
  FileDown, Printer, MoreHorizontal, Triangle, Pentagon, Star, Minus,
  ArrowRight, Hexagon, Heart, Diamond, PaintBucket, Sparkles, Layout,
  Undo, Redo, List, ListOrdered, Highlighter, Sun, Moon, Scissors
} from 'lucide-react';

// Constants
const FONTS = [
  'Arial', 'Calibri', 'Times New Roman', 'Georgia', 'Verdana',
  'Tahoma', 'Trebuchet MS', 'Impact', 'Helvetica', 'Century Gothic',
  'Roboto', 'Open Sans', 'Montserrat', 'Lato', 'Poppins',
  'Inter', 'Source Sans Pro', 'Playfair Display', 'Merriweather', 'Raleway',
  'Nunito', 'Work Sans', 'DM Sans', 'Fira Sans', 'IBM Plex Sans',
  'Garamond', 'Palatino', 'Book Antiqua', 'Cambria', 'Consolas',
];

const FONT_SIZES = ['8', '10', '12', '14', '16', '18', '20', '24', '28', '32', '36', '44', '54', '72', '96'];

const THEME_COLORS = [
  // Row 1: B/W + Office blues/reds
  '#000000', '#ffffff', '#1f497d', '#4f81bd', '#c0504d', '#9bbb59',
  // Row 2: Office purples/teals + warm
  '#8064a2', '#4bacc6', '#f79646', '#e2725b', '#44546a', '#d9d9d9',
  // Row 3: Modern UI palette
  '#2c3e50', '#e74c3c', '#3498db', '#2ecc71', '#9b59b6', '#f39c12',
  // Row 4: Vibrant accents
  '#1abc9c', '#e91e63', '#00bcd4', '#ff5722', '#795548', '#607d8b',
  // Row 5: Soft/muted tones
  '#5b7f95', '#8e6c88', '#7eb09b', '#c4956a', '#a3a380', '#b8b8d1',
  // Row 6: Deep/rich tones
  '#1a237e', '#880e4f', '#004d40', '#bf360c', '#33691e', '#4a148c',
];

const BACKGROUND_COLORS = [
  // Light neutrals
  '#ffffff', '#f8f9fa', '#f0f0f0', '#e8e8e8', '#d9d9d9',
  // Warm lights
  '#fff8e7', '#fef3e2', '#fde8d0', '#f5e6cc', '#f0e0d0',
  // Cool lights
  '#e8f4fd', '#e3f2fd', '#e0f0f4', '#e8eaf6', '#ede7f6',
  // Dark blues
  '#1a1a2e', '#16213e', '#0f3460', '#1e3a5f', '#0d2137',
  // Dark warm/rich
  '#2d1b2e', '#3c1642', '#1b2631', '#1a1a2a', '#2c2c34',
  // Accent backgrounds
  '#004e92', '#7b2d8e', '#1b5e20', '#b71c1c', '#e65100',
];

const GRADIENT_PRESETS = [
  // Professional
  { name: 'Midnight', colors: ['#0f2027', '#203a43'] },
  { name: 'Corporate', colors: ['#141e30', '#243b55'] },
  { name: 'Slate', colors: ['#2c3e50', '#4ca1af'] },
  { name: 'Navy', colors: ['#0f0c29', '#302b63'] },
  // Warm
  { name: 'Sunset', colors: ['#ff7e5f', '#feb47b'] },
  { name: 'Fire', colors: ['#f12711', '#f5af19'] },
  { name: 'Peach', colors: ['#ffecd2', '#fcb69f'] },
  { name: 'Rose', colors: ['#ffdde1', '#ee9ca7'] },
  // Cool
  { name: 'Ocean', colors: ['#2193b0', '#6dd5ed'] },
  { name: 'Sky', colors: ['#4facfe', '#00f2fe'] },
  { name: 'Frost', colors: ['#e0eafc', '#cfdef3'] },
  { name: 'Teal', colors: ['#11998e', '#38ef7d'] },
  // Vibrant
  { name: 'Purple', colors: ['#667eea', '#764ba2'] },
  { name: 'Pink', colors: ['#ff6a88', '#ff99ac'] },
  { name: 'Neon', colors: ['#00d2ff', '#928dab'] },
  { name: 'Aurora', colors: ['#7f53ac', '#647dee'] },
];

const SHAPE_PRESETS = [
  { type: 'rect', icon: Square, name: 'Rectangle' },
  { type: 'roundRect', icon: Square, name: 'Rounded Rect' },
  { type: 'ellipse', icon: Circle, name: 'Ellipse' },
  { type: 'triangle', icon: Triangle, name: 'Triangle' },
  { type: 'diamond', icon: Diamond, name: 'Diamond' },
  { type: 'hexagon', icon: Hexagon, name: 'Hexagon' },
  { type: 'star', icon: Star, name: 'Star' },
  { type: 'arrow', icon: ArrowRight, name: 'Arrow' },
  { type: 'line', icon: Minus, name: 'Line' },
];

const SLIDE_LAYOUTS: { name: string; shapes: { type: string; x: number; y: number; w: number; h: number; text: string; size: number; align?: string; bold?: boolean }[] }[] = [
  // --- Core layouts ---
  { name: 'Title Slide', shapes: [
    { type: 'text', x: 8, y: 30, w: 84, h: 22, text: 'Presentation Title', size: 44, align: 'ctr', bold: true },
    { type: 'text', x: 15, y: 54, w: 70, h: 10, text: 'Subtitle or author name', size: 22, align: 'ctr' },
  ]},
  { name: 'Section Header', shapes: [
    { type: 'text', x: 8, y: 38, w: 84, h: 18, text: 'Section Title', size: 40, align: 'l', bold: true },
    { type: 'text', x: 8, y: 58, w: 60, h: 8, text: 'Section description', size: 18, align: 'l' },
  ]},
  { name: 'Title + Content', shapes: [
    { type: 'text', x: 5, y: 4, w: 90, h: 12, text: 'Slide Title', size: 32, align: 'l', bold: true },
    { type: 'text', x: 5, y: 20, w: 90, h: 72, text: 'Content goes here', size: 18, align: 'l' },
  ]},
  { name: 'Title Only', shapes: [
    { type: 'text', x: 5, y: 4, w: 90, h: 12, text: 'Slide Title', size: 32, align: 'l', bold: true },
  ]},
  // --- Multi-column layouts ---
  { name: 'Two Columns', shapes: [
    { type: 'text', x: 5, y: 4, w: 90, h: 12, text: 'Slide Title', size: 32, align: 'l', bold: true },
    { type: 'text', x: 5, y: 20, w: 43, h: 72, text: 'Left column', size: 16, align: 'l' },
    { type: 'text', x: 52, y: 20, w: 43, h: 72, text: 'Right column', size: 16, align: 'l' },
  ]},
  { name: 'Three Columns', shapes: [
    { type: 'text', x: 5, y: 4, w: 90, h: 12, text: 'Slide Title', size: 32, align: 'l', bold: true },
    { type: 'text', x: 3, y: 20, w: 30, h: 72, text: 'Column 1', size: 15, align: 'l' },
    { type: 'text', x: 35, y: 20, w: 30, h: 72, text: 'Column 2', size: 15, align: 'l' },
    { type: 'text', x: 67, y: 20, w: 30, h: 72, text: 'Column 3', size: 15, align: 'l' },
  ]},
  { name: 'Comparison', shapes: [
    { type: 'text', x: 5, y: 4, w: 90, h: 12, text: 'Comparison Title', size: 32, align: 'l', bold: true },
    { type: 'text', x: 5, y: 20, w: 43, h: 10, text: 'Option A', size: 20, align: 'ctr', bold: true },
    { type: 'text', x: 52, y: 20, w: 43, h: 10, text: 'Option B', size: 20, align: 'ctr', bold: true },
    { type: 'text', x: 5, y: 32, w: 43, h: 60, text: 'Details for option A', size: 15, align: 'l' },
    { type: 'text', x: 52, y: 32, w: 43, h: 60, text: 'Details for option B', size: 15, align: 'l' },
  ]},
  // --- Special purpose ---
  { name: 'Big Number', shapes: [
    { type: 'text', x: 10, y: 15, w: 80, h: 40, text: '42%', size: 96, align: 'ctr', bold: true },
    { type: 'text', x: 10, y: 58, w: 80, h: 15, text: 'Key metric description', size: 22, align: 'ctr' },
    { type: 'text', x: 15, y: 75, w: 70, h: 10, text: 'Additional context or source', size: 14, align: 'ctr' },
  ]},
  { name: 'Quote', shapes: [
    { type: 'text', x: 10, y: 25, w: 80, h: 35, text: '\u201CThe best way to predict the future is to invent it.\u201D', size: 28, align: 'ctr' },
    { type: 'text', x: 20, y: 65, w: 60, h: 10, text: '\u2014 Alan Kay', size: 18, align: 'ctr' },
  ]},
  { name: 'Caption Left', shapes: [
    { type: 'text', x: 3, y: 4, w: 35, h: 12, text: 'Caption Title', size: 24, align: 'l', bold: true },
    { type: 'text', x: 3, y: 18, w: 35, h: 74, text: 'Description text for the content area on the right.', size: 14, align: 'l' },
    { type: 'text', x: 42, y: 4, w: 55, h: 88, text: 'Main content area', size: 18, align: 'ctr' },
  ]},
  { name: 'Top + Bottom', shapes: [
    { type: 'text', x: 5, y: 4, w: 90, h: 12, text: 'Slide Title', size: 32, align: 'l', bold: true },
    { type: 'text', x: 5, y: 20, w: 90, h: 34, text: 'Top content area', size: 16, align: 'l' },
    { type: 'text', x: 5, y: 58, w: 90, h: 34, text: 'Bottom content area', size: 16, align: 'l' },
  ]},
  { name: 'Agenda', shapes: [
    { type: 'text', x: 8, y: 8, w: 84, h: 14, text: 'Agenda', size: 36, align: 'l', bold: true },
    { type: 'text', x: 8, y: 28, w: 84, h: 8, text: '01  Introduction', size: 20, align: 'l' },
    { type: 'text', x: 8, y: 40, w: 84, h: 8, text: '02  Key Findings', size: 20, align: 'l' },
    { type: 'text', x: 8, y: 52, w: 84, h: 8, text: '03  Discussion', size: 20, align: 'l' },
    { type: 'text', x: 8, y: 64, w: 84, h: 8, text: '04  Next Steps', size: 20, align: 'l' },
  ]},
  { name: 'Thank You', shapes: [
    { type: 'text', x: 10, y: 30, w: 80, h: 25, text: 'Thank You', size: 54, align: 'ctr', bold: true },
    { type: 'text', x: 15, y: 58, w: 70, h: 10, text: 'Questions?', size: 24, align: 'ctr' },
    { type: 'text', x: 20, y: 72, w: 60, h: 8, text: 'email@example.com', size: 16, align: 'ctr' },
  ]},
  { name: 'Blank', shapes: [] },
];

const NS = {
  p: 'http://schemas.openxmlformats.org/presentationml/2006/main',
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  pkgRels: 'http://schemas.openxmlformats.org/package/2006/relationships',
};

// Helper functions
function qNS(doc: any, nsUri: string, localName: string) {
  if (!doc || !nsUri || !localName) return null;
  const elements = doc.getElementsByTagNameNS(nsUri, localName);
  return elements.length > 0 ? elements[0] : null;
}

function qaNS(doc: any, nsUri: string, localName: string) {
  if (!doc || !nsUri || !localName) return [];
  return Array.from(doc.getElementsByTagNameNS(nsUri, localName));
}

function escapeHtml(text: string) {
  if (typeof text !== 'string') return '';
  const escapeMap: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return text.replace(/[&<>"']/g, (m) => escapeMap[m] || m);
}

// Theme data including colors and fonts
interface ThemeData {
  colors: Record<string, string>;
  majorFont: string;
  minorFont: string;
}

// Set to track loaded fonts to avoid duplicates
const loadedFonts = new Set<string>();

// Track fonts that would be loaded - actual loading could be added later
// For now, we just apply the font-family and let the browser use fallbacks
function loadGoogleFont(fontName: string): void {
  if (loadedFonts.has(fontName)) return;
  loadedFonts.add(fontName);

  // Common fonts that are web-safe and don't need loading
  const systemFonts = ['Arial', 'Helvetica', 'Times New Roman', 'Georgia', 'Verdana', 'Courier New', 'Comic Sans MS', 'Impact', 'Trebuchet MS'];
  if (systemFonts.includes(fontName)) return;

  // Log for debugging - in the future this could load from a local font cache or bundled fonts
  console.debug('[PPTX] Font requested:', fontName);
}

// Theme color extraction - handles both PowerPoint and Google Slides
async function extractThemeData(zip: JSZip, themePath: string = 'ppt/theme/theme1.xml'): Promise<ThemeData> {
  const themeFile = zip.file(themePath);
  if (!themeFile) return { colors: {}, majorFont: 'Arial', minorFont: 'Arial' };

  try {
    const xml = await themeFile.async('string');
    const doc = new DOMParser().parseFromString(xml, 'application/xml');

    // Extract colors
    const colorScheme = qNS(doc, NS.a, 'clrScheme');
    const colors: Record<string, string> = {};

    if (colorScheme) {
      const names = ['dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'];

      for (const name of names) {
        const elem = colorScheme.getElementsByTagNameNS(NS.a, name)[0];
        if (elem) {
          const srgb = qNS(elem, NS.a, 'srgbClr');
          const sys = qNS(elem, NS.a, 'sysClr');
          if (srgb) colors[name] = `#${srgb.getAttribute('val')}`;
          else if (sys) colors[name] = sys.getAttribute('lastClr') ? `#${sys.getAttribute('lastClr')}` : '#000000';
        }
      }

      // Google Slides uses tx1/tx2/bg1/bg2 which map to dk1/lt1/dk2/lt2
      colors['tx1'] = colors['dk1'] || '#000000';
      colors['tx2'] = colors['dk2'] || '#000000';
      colors['bg1'] = colors['lt1'] || '#ffffff';
      colors['bg2'] = colors['lt2'] || '#ffffff';
    }

    // Extract fonts from fontScheme
    let majorFont = 'Arial';
    let minorFont = 'Arial';

    const fontScheme = qNS(doc, NS.a, 'fontScheme');
    if (fontScheme) {
      const majorFontEl = qNS(fontScheme, NS.a, 'majorFont');
      const minorFontEl = qNS(fontScheme, NS.a, 'minorFont');

      if (majorFontEl) {
        const latin = qNS(majorFontEl, NS.a, 'latin');
        if (latin) {
          majorFont = latin.getAttribute('typeface') || 'Arial';
        }
      }
      if (minorFontEl) {
        const latin = qNS(minorFontEl, NS.a, 'latin');
        if (latin) {
          minorFont = latin.getAttribute('typeface') || 'Arial';
        }
      }
    }

    // Load the fonts
    loadGoogleFont(majorFont);
    loadGoogleFont(minorFont);

    return { colors, majorFont, minorFont };
  } catch (e) {
    console.error('[PPTX] Theme extraction error:', e);
    return { colors: {}, majorFont: 'Arial', minorFont: 'Arial' };
  }
}

// Legacy function for compatibility - extracts only colors
async function extractThemeColors(zip: JSZip, themePath: string = 'ppt/theme/theme1.xml'): Promise<Record<string, string>> {
  const data = await extractThemeData(zip, themePath);
  return data.colors;
}

// Extract all themes from zip and return a map of theme path -> ThemeData
async function extractAllThemes(zip: JSZip): Promise<Record<string, ThemeData>> {
  const themes: Record<string, ThemeData> = {};
  const themeFiles = Object.keys(zip.files).filter(f => /^ppt\/theme\/theme\d+\.xml$/.test(f));

  for (const themePath of themeFiles) {
    const themeData = await extractThemeData(zip, themePath);
    themes[themePath] = themeData;
  }

  return themes;
}

// Parse color from solidFill element with luminance modifiers
function parseColor(fillEl: Element | null, themeColors: Record<string, string>): string | null {
  if (!fillEl) return null;

  const srgb = qNS(fillEl, NS.a, 'srgbClr');
  const scheme = qNS(fillEl, NS.a, 'schemeClr');

  let color: string | null = null;

  if (srgb) {
    color = `#${srgb.getAttribute('val')}`;
  } else if (scheme) {
    const val = scheme.getAttribute('val');
    color = themeColors[val || ''] || null;

    // Handle luminance modifiers (lumMod, lumOff, tint, shade)
    if (color) {
      const lumMod = qNS(scheme, NS.a, 'lumMod');
      const lumOff = qNS(scheme, NS.a, 'lumOff');
      const tint = qNS(scheme, NS.a, 'tint');
      const shade = qNS(scheme, NS.a, 'shade');

      // Apply basic luminance adjustments
      if (lumMod || lumOff || tint || shade) {
        // Convert to RGB, apply modifier, convert back
        const hex = color.replace('#', '');
        let r = parseInt(hex.substr(0, 2), 16);
        let g = parseInt(hex.substr(2, 2), 16);
        let b = parseInt(hex.substr(4, 2), 16);

        if (lumMod) {
          const mod = parseInt(lumMod.getAttribute('val') || '100000') / 100000;
          r = Math.round(r * mod);
          g = Math.round(g * mod);
          b = Math.round(b * mod);
        }
        if (lumOff) {
          const off = parseInt(lumOff.getAttribute('val') || '0') / 100000 * 255;
          r = Math.round(Math.min(255, r + off));
          g = Math.round(Math.min(255, g + off));
          b = Math.round(Math.min(255, b + off));
        }
        if (tint) {
          const t = parseInt(tint.getAttribute('val') || '100000') / 100000;
          r = Math.round(r + (255 - r) * (1 - t));
          g = Math.round(g + (255 - g) * (1 - t));
          b = Math.round(b + (255 - b) * (1 - t));
        }
        if (shade) {
          const s = parseInt(shade.getAttribute('val') || '100000') / 100000;
          r = Math.round(r * s);
          g = Math.round(g * s);
          b = Math.round(b * s);
        }

        color = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
      }
    }
  }

  return color;
}

// Build style string from run properties
function buildStyleFromRPr(
  rPr: Element | null,
  defaultRPr: Element | null,
  themeColors: Record<string, string>,
  themeFonts?: { majorFont: string; minorFont: string }
): string[] {
  const styles: string[] = [];

  // Get properties from run, falling back to default if not specified
  const runSize = rPr?.getAttribute('sz');
  const defaultSize = defaultRPr?.getAttribute('sz');
  const runBold = rPr?.getAttribute('b');
  const defaultBold = defaultRPr?.getAttribute('b');
  const runItalic = rPr?.getAttribute('i');
  const defaultItalic = defaultRPr?.getAttribute('i');
  const runUnderline = rPr?.getAttribute('u');
  const defaultUnderline = defaultRPr?.getAttribute('u');

  // Font size (in hundredths of a point)
  const sz = runSize || defaultSize;
  if (sz) {
    const ptSize = Math.round(parseInt(sz) / 100);
    styles.push(`font-size: ${ptSize}pt`);
  }

  // Font family - check run first, then default
  const runLatin = rPr ? qNS(rPr, NS.a, 'latin') : null;
  const defaultLatin = defaultRPr ? qNS(defaultRPr, NS.a, 'latin') : null;
  const latin = runLatin || defaultLatin;
  const runEa = rPr ? qNS(rPr, NS.a, 'ea') : null;
  const defaultEa = defaultRPr ? qNS(defaultRPr, NS.a, 'ea') : null;
  const ea = runEa || defaultEa;
  const runCs = rPr ? qNS(rPr, NS.a, 'cs') : null;
  const defaultCs = defaultRPr ? qNS(defaultRPr, NS.a, 'cs') : null;
  const cs = runCs || defaultCs;

  let typeface = latin?.getAttribute('typeface') || ea?.getAttribute('typeface') || cs?.getAttribute('typeface');

  // Resolve theme font references
  if (typeface === '+mj-lt' && themeFonts) {
    typeface = themeFonts.majorFont;
  } else if (typeface === '+mn-lt' && themeFonts) {
    typeface = themeFonts.minorFont;
  }

  if (typeface) {
    // Load the font if needed
    loadGoogleFont(typeface);
    // Use the font with a fallback
    styles.push(`font-family: "${typeface}", Arial, sans-serif`);
  }

  // Bold - check for explicit value
  const bold = runBold !== null ? runBold : defaultBold;
  if (bold === '1' || bold === 'true') styles.push('font-weight: bold');

  // Italic
  const italic = runItalic !== null ? runItalic : defaultItalic;
  if (italic === '1' || italic === 'true') styles.push('font-style: italic');

  // Underline
  const underline = runUnderline !== null ? runUnderline : defaultUnderline;
  if (underline && underline !== 'none') styles.push('text-decoration: underline');

  // Strikethrough
  const runStrike = rPr?.getAttribute('strike');
  const defaultStrike = defaultRPr?.getAttribute('strike');
  const strike = runStrike !== null ? runStrike : defaultStrike;
  if (strike && strike !== 'noStrike') styles.push('text-decoration: line-through');

  // Baseline (superscript/subscript)
  const baseline = rPr?.getAttribute('baseline') || defaultRPr?.getAttribute('baseline');
  if (baseline) {
    const bl = parseInt(baseline);
    if (bl > 0) styles.push('vertical-align: super; font-size: 0.7em');
    else if (bl < 0) styles.push('vertical-align: sub; font-size: 0.7em');
  }

  // Color from solidFill - check run first then default
  const runFill = rPr ? qNS(rPr, NS.a, 'solidFill') : null;
  const defaultFill = defaultRPr ? qNS(defaultRPr, NS.a, 'solidFill') : null;
  const solidFill = runFill || defaultFill;
  const color = parseColor(solidFill, themeColors);
  if (color) {
    styles.push(`color: ${color}`);
  }

  // Letter spacing (spc attribute in hundredths of a point)
  const spc = rPr?.getAttribute('spc') || defaultRPr?.getAttribute('spc');
  if (spc) {
    const spacing = parseInt(spc) / 100;
    styles.push(`letter-spacing: ${spacing}pt`);
  }

  return styles;
}

// Parse entire paragraph including runs, fields, and breaks
function parseParagraph(p: Element, themeColors: Record<string, string>, defaultRPr?: Element | null, themeFonts?: { majorFont: string; minorFont: string }): string {
  const parts: string[] = [];

  // Get all text runs using namespace query (more reliable than childNodes iteration)
  const runs = qaNS(p, NS.a, 'r') as Element[];
  const fields = qaNS(p, NS.a, 'fld') as Element[];
  const breaks = qaNS(p, NS.a, 'br') as Element[];

  // Combine and sort by document order
  const allElements: { el: Element; type: string }[] = [
    ...runs.map(el => ({ el, type: 'r' })),
    ...fields.map(el => ({ el, type: 'fld' })),
    ...breaks.map(el => ({ el, type: 'br' })),
  ];

  // Sort by document position
  allElements.sort((a, b) => {
    const pos = a.el.compareDocumentPosition(b.el);
    if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    return 0;
  });

  for (const { el, type } of allElements) {
    if (type === 'r' || type === 'fld') {
      // Text run or field
      const t = qNS(el, NS.a, 't');
      const text = t?.textContent || '';
      if (!text) continue;

      const rPr = qNS(el, NS.a, 'rPr');
      const styles = buildStyleFromRPr(rPr, defaultRPr, themeColors, themeFonts);

      const html = escapeHtml(text).replace(/\n/g, '<br/>');
      if (styles.length > 0) {
        parts.push(`<span style="${styles.join('; ')}">${html}</span>`);
      } else {
        parts.push(html);
      }
    } else if (type === 'br') {
      parts.push('<br/>');
    }
  }

  // If no runs found, try to get any text content directly
  if (parts.length === 0) {
    const directText = p.textContent?.trim();
    if (directText) {
      // Apply default styles if available
      const styles = buildStyleFromRPr(null, defaultRPr, themeColors, themeFonts);
      const html = escapeHtml(directText).replace(/\n/g, '<br/>');
      if (styles.length > 0) {
        parts.push(`<span style="${styles.join('; ')}">${html}</span>`);
      } else {
        parts.push(html);
      }
    }
  }

  return parts.join('');
}

// Parse text runs with proper styling (legacy function for compatibility)
function parseRuns(runs: Element[], themeColors: Record<string, string>, defaultRPr?: Element | null): string {
  const parts: string[] = [];

  for (const r of runs) {
    const t = qNS(r, NS.a, 't');
    const text = t?.textContent || '';
    if (!text) continue;

    const rPr = qNS(r, NS.a, 'rPr');
    const styles = buildStyleFromRPr(rPr, defaultRPr, themeColors);

    const html = escapeHtml(text).replace(/\n/g, '<br/>');
    if (styles.length > 0) {
      parts.push(`<span style="${styles.join('; ')}">${html}</span>`);
    } else {
      parts.push(html);
    }
  }

  return parts.join('');
}

function nextRelationshipId(relsDoc: Document | null): string {
  if (!relsDoc) return 'rId1';
  const rels = qaNS(relsDoc, NS.pkgRels, 'Relationship') as Element[];
  const ids = rels.map(r => parseInt(r.getAttribute('Id')?.replace('rId', '') || '0'));
  return 'rId' + (Math.max(0, ...ids) + 1);
}

interface ParaData {
  html: string;
  align: string;
  level: number;
  bullet: boolean;
  lineSpacing?: number;  // In percentage (e.g., 150 for 1.5x)
  spaceBefore?: number;  // In points
  spaceAfter?: number;   // In points
}

interface Shape {
  type: 'text' | 'image' | 'shape';
  xfrm: { x: number; y: number; cx: number; cy: number };
  paras?: ParaData[];
  imgDataUrl?: string;
  fillColor?: string;
  noFill?: boolean;  // Explicitly has no fill
  borderColor?: string;
  borderWidth?: number;
  shapeType?: string;
  name?: string;
  spNode?: Element | null;
}

interface Slide {
  name: string;
  doc: Document | null;
  relsDoc: Document | null;
  shapes: Shape[];
  background?: string;
}

const PptxViewer = ({
  nodeId,
  contentDataRef,
  findNodePath,
  rootLayoutNode,
  setDraggedItem,
  setPaneContextMenu,
  closeContentPane
}: any) => {
  const [zip, setZip] = useState<JSZip | null>(null);
  const [presDoc, setPresDoc] = useState<Document | null>(null);
  const [presRelsDoc, setPresRelsDoc] = useState<Document | null>(null);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [slideOrder, setSlideOrder] = useState<any[]>([]);
  const [themeColors, setThemeColors] = useState<Record<string, string>>({});
  const [idx, setIdx] = useState(0);
  const [hasChanges, setHasChanges] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Independent document light/dark mode
  const [docLightMode, setDocLightMode] = useState(() => {
    const saved = localStorage.getItem('pptxViewer_lightMode');
    return saved !== null ? JSON.parse(saved) : true;
  });

  // Persist docLightMode changes
  useEffect(() => {
    localStorage.setItem('pptxViewer_lightMode', JSON.stringify(docLightMode));
  }, [docLightMode]);

  const paneData = contentDataRef.current[nodeId];
  const filePath = paneData?.contentId;

  // Display settings
  const [slideWidth, setSlideWidth] = useState(960);
  const [slideHeight, setSlideHeight] = useState(540);
  const [pxPerEmu, setPxPerEmu] = useState(0.0001);
  const [zoom, setZoom] = useState(100);

  // Toolbar state
  const [showFontPicker, setShowFontPicker] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showShapePicker, setShowShapePicker] = useState(false);
  const [showBgPicker, setShowBgPicker] = useState(false);
  const [pptxContextMenu, setPptxContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [slideNavContextMenu, setSlideNavContextMenu] = useState<{ x: number; y: number; slideIdx: number } | null>(null);
  const [showLayoutPicker, setShowLayoutPicker] = useState(false);
  const [currentFont, setCurrentFont] = useState('Arial');
  const [currentFontSize, setCurrentFontSize] = useState('24');
  const [selectedTool, setSelectedTool] = useState<'select' | 'text' | 'shape'>('select');
  const [selectedShapeColor, setSelectedShapeColor] = useState('#4285f4');

  // Presentation mode
  const [isPresentationMode, setIsPresentationMode] = useState(false);
  const presentationRef = useRef<HTMLDivElement>(null);

  const activeSlide = slides[idx];

  const emuToPx = useCallback((emu: number) => {
    if (typeof emu !== 'number' || isNaN(emu)) return 0;
    return emu * pxPerEmu;
  }, [pxPerEmu]);

  // Load PPTX
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!filePath) return;
      setLoading(true);
      setErr(null);

      try {
        const buffer = await window.api.readFileBuffer(filePath);
        if (cancelled) return;

        if (!buffer || buffer.length === 0) {
          setSlides([{ name: 'slide1', doc: null, relsDoc: null, shapes: [], background: '#ffffff' }]);
          setLoading(false);
          return;
        }

        const z = await JSZip.loadAsync(buffer);
        if (cancelled) return;

        // Extract all themes (now returns ThemeData with colors and fonts)
        const allThemes = await extractAllThemes(z);

        // Default to theme1 for general use, but we'll use per-master themes for backgrounds
        const defaultTheme = allThemes['ppt/theme/theme1.xml'] || { colors: {}, majorFont: 'Arial', minorFont: 'Arial' };
        const colors = defaultTheme.colors;
        setThemeColors(colors);

        const presFile = z.file('ppt/presentation.xml');
        if (!presFile) throw new Error('Invalid PPTX file');

        const presXml = await presFile.async('string');
        const pres = new DOMParser().parseFromString(presXml, 'application/xml');

        const presRelsFile = z.file('ppt/_rels/presentation.xml.rels');
        const presRelsXml = presRelsFile ? await presRelsFile.async('string') : '<Relationships/>';
        const presRels = new DOMParser().parseFromString(presRelsXml, 'application/xml');

        // Get slide size
        const sldSz = qNS(pres, NS.p, 'sldSz');
        const widthEmu = Number(sldSz?.getAttribute('cx')) || 9144000;
        const heightEmu = Number(sldSz?.getAttribute('cy')) || 6858000;
        const maxWidth = 800;
        const scale = maxWidth / widthEmu;
        setSlideWidth(maxWidth);
        setSlideHeight(heightEmu * scale);
        setPxPerEmu(scale);

        // Get slide order
        const sldIdLst = qNS(pres, NS.p, 'sldIdLst');
        const sldIds = sldIdLst ? qaNS(sldIdLst, NS.p, 'sldId') as Element[] : [];
        const rels = qaNS(presRels, NS.pkgRels, 'Relationship') as Element[];

        const order: any[] = [];
        for (const sldId of sldIds) {
          const rId = sldId.getAttributeNS(NS.r, 'id');
          const rel = rels.find(r => r.getAttribute('Id') === rId);
          if (rel) {
            const target = rel.getAttribute('Target') || '';
            order.push({ rId, target, name: `ppt/${target}` });
          }
        }

        // Load slide masters and their backgrounds
        const slideMasterBackgrounds: Record<string, string> = {};
        const slideLayoutBackgrounds: Record<string, string> = {};
        const slideLayoutToMaster: Record<string, string> = {};
        const slideMasterThemes: Record<string, Record<string, string>> = {};
        const slideMasterFonts: Record<string, { majorFont: string; minorFont: string }> = {};

        // Parse slide masters and find which theme each uses
        const masterFiles = Object.keys(z.files).filter(f => /^ppt\/slideMasters\/slideMaster\d+\.xml$/.test(f));
        for (const masterPath of masterFiles) {
          const masterFile = z.file(masterPath);
          if (!masterFile) continue;
          const masterXml = await masterFile.async('string');
          const masterDoc = new DOMParser().parseFromString(masterXml, 'application/xml');

          // Find which theme this master uses
          const masterRelsPath = `ppt/slideMasters/_rels/${masterPath.split('/').pop()}.rels`;
          const masterRelsFile = z.file(masterRelsPath);
          let masterThemeColors = colors; // Default to theme1
          let masterThemeFonts = defaultTheme;
          if (masterRelsFile) {
            const masterRelsXml = await masterRelsFile.async('string');
            const masterRelsDoc = new DOMParser().parseFromString(masterRelsXml, 'application/xml');
            const masterRels = qaNS(masterRelsDoc, NS.pkgRels, 'Relationship') as Element[];
            for (const rel of masterRels) {
              const type = rel.getAttribute('Type') || '';
              if (type.includes('theme')) {
                const target = rel.getAttribute('Target') || '';
                const themePath = `ppt/${target.replace(/^\.\.\//, '')}`;
                if (allThemes[themePath]) {
                  masterThemeFonts = allThemes[themePath];
                  masterThemeColors = allThemes[themePath].colors;
                  slideMasterThemes[masterPath] = masterThemeColors;
                  slideMasterFonts[masterPath] = { majorFont: masterThemeFonts.majorFont, minorFont: masterThemeFonts.minorFont };
                }
                break;
              }
            }
          }

          // Extract master background using the correct theme colors
          const masterCsld = qNS(masterDoc, NS.p, 'cSld');
          const masterBg = masterCsld ? qNS(masterCsld, NS.p, 'bg') : null;
          if (masterBg) {
            const bgPr = qNS(masterBg, NS.p, 'bgPr');
            if (bgPr) {
              const solidFill = qNS(bgPr, NS.a, 'solidFill');
              if (solidFill) {
                const bgColor = parseColor(solidFill, masterThemeColors);
                if (bgColor) slideMasterBackgrounds[masterPath] = bgColor;
              }
            }
            const bgRef = qNS(masterBg, NS.p, 'bgRef');
            if (bgRef) {
              const refColor = parseColor(bgRef, masterThemeColors);
              if (refColor) slideMasterBackgrounds[masterPath] = refColor;
            }
          }
        }

        // Update main theme colors to use the first slide master's theme (most common case)
        const firstMasterTheme = Object.values(slideMasterThemes)[0];
        if (firstMasterTheme) {
          setThemeColors(firstMasterTheme);
        }

        // Parse slide layouts and link to masters
        const layoutFiles = Object.keys(z.files).filter(f => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(f));
        for (const layoutPath of layoutFiles) {
          const layoutFile = z.file(layoutPath);
          if (!layoutFile) continue;
          const layoutXml = await layoutFile.async('string');
          const layoutDoc = new DOMParser().parseFromString(layoutXml, 'application/xml');

          // Get layout's relationship to master first (so we know which theme to use)
          const layoutRelsPath = `ppt/slideLayouts/_rels/${layoutPath.split('/').pop()}.rels`;
          const layoutRelsFile = z.file(layoutRelsPath);
          let layoutThemeColors = colors; // Default
          if (layoutRelsFile) {
            const layoutRelsXml = await layoutRelsFile.async('string');
            const layoutRelsDoc = new DOMParser().parseFromString(layoutRelsXml, 'application/xml');
            const layoutRels = qaNS(layoutRelsDoc, NS.pkgRels, 'Relationship') as Element[];
            for (const rel of layoutRels) {
              const type = rel.getAttribute('Type') || '';
              if (type.includes('slideMaster')) {
                const target = rel.getAttribute('Target') || '';
                const masterName = `ppt/${target.replace(/^\.\.\//, '')}`;
                slideLayoutToMaster[layoutPath] = masterName;
                // Use the master's theme colors
                if (slideMasterThemes[masterName]) {
                  layoutThemeColors = slideMasterThemes[masterName];
                }
                break;
              }
            }
          }

          // Extract layout background using the correct theme colors
          const layoutCsld = qNS(layoutDoc, NS.p, 'cSld');
          const layoutBg = layoutCsld ? qNS(layoutCsld, NS.p, 'bg') : null;
          if (layoutBg) {
            const bgPr = qNS(layoutBg, NS.p, 'bgPr');
            if (bgPr) {
              const solidFill = qNS(bgPr, NS.a, 'solidFill');
              if (solidFill) {
                // Check for direct srgbClr first
                const srgb = qNS(solidFill, NS.a, 'srgbClr');
                if (srgb) {
                  const val = srgb.getAttribute('val');
                  if (val) slideLayoutBackgrounds[layoutPath] = `#${val}`;
                } else {
                  const bgColor = parseColor(solidFill, layoutThemeColors);
                  if (bgColor) slideLayoutBackgrounds[layoutPath] = bgColor;
                }
              }
            }
            // Also check bgRef
            const bgRef = qNS(layoutBg, NS.p, 'bgRef');
            if (bgRef && !slideLayoutBackgrounds[layoutPath]) {
              const refColor = parseColor(bgRef, layoutThemeColors);
              if (refColor) slideLayoutBackgrounds[layoutPath] = refColor;
            }
          }
        }

        // Load slides
        const loadedSlides: Slide[] = [];
        for (const s of order) {
          if (cancelled) return;

          const slideFile = z.file(s.name);
          if (!slideFile) continue;

          const xml = await slideFile.async('string');
          const doc = new DOMParser().parseFromString(xml, 'application/xml');

          const relsPath = `ppt/slides/_rels/${s.name.split('/').pop()}.rels`;
          const relsFile = z.file(relsPath);
          const relsXml = relsFile ? await relsFile.async('string') : '<Relationships/>';
          const relsDoc = new DOMParser().parseFromString(relsXml, 'application/xml');

          // Determine which theme colors to use for this slide
          const slideRelsForLayout = qaNS(relsDoc, NS.pkgRels, 'Relationship') as Element[];
          let slideLayoutPath = '';
          for (const rel of slideRelsForLayout) {
            const type = rel.getAttribute('Type') || '';
            if (type.includes('slideLayout')) {
              const target = rel.getAttribute('Target') || '';
              slideLayoutPath = `ppt/${target.replace(/^\.\.\//, '')}`;
              break;
            }
          }
          const slideMasterPath = slideLayoutToMaster[slideLayoutPath] || '';
          const slideThemeColors = slideMasterThemes[slideMasterPath] || colors;
          const slideThemeFonts = slideMasterFonts[slideMasterPath] || { majorFont: defaultTheme.majorFont, minorFont: defaultTheme.minorFont };

          const shapes: Shape[] = [];

          // Parse text shapes
          const spNodes = qaNS(doc, NS.p, 'sp') as Element[];
          for (const sp of spNodes) {
            const txBody = qNS(sp, NS.p, 'txBody');
            if (!txBody) continue;

            const spPr = qNS(sp, NS.p, 'spPr');
            const xfrm = spPr ? qNS(spPr, NS.a, 'xfrm') : null;
            const off = xfrm ? qNS(xfrm, NS.a, 'off') : null;
            const ext = xfrm ? qNS(xfrm, NS.a, 'ext') : null;

            const xfrmData = {
              x: Number(off?.getAttribute('x')) || 0,
              y: Number(off?.getAttribute('y')) || 0,
              cx: Number(ext?.getAttribute('cx')) || 1000000,
              cy: Number(ext?.getAttribute('cy')) || 500000,
            };

            const paras: Shape['paras'] = [];
            const pNodes = qaNS(txBody, NS.a, 'p') as Element[];

            for (const p of pNodes) {
              const pPr = qNS(p, NS.a, 'pPr');
              // Get default run properties from paragraph properties (used by Google Slides)
              const defRPr = pPr ? qNS(pPr, NS.a, 'defRPr') : null;

              // Also check for endParaRPr as fallback for paragraph-level defaults
              const endParaRPr = qNS(p, NS.a, 'endParaRPr');
              const defaultProps = defRPr || endParaRPr;

              // Use parseParagraph for full support of runs, fields, and breaks
              const html = parseParagraph(p, slideThemeColors, defaultProps, slideThemeFonts);

              const align = pPr?.getAttribute('algn') || 'l';
              const level = Number(pPr?.getAttribute('lvl')) || 0;
              const hasBullet = !!(pPr && (qNS(pPr, NS.a, 'buChar') || qNS(pPr, NS.a, 'buAutoNum')));

              // Extract line spacing
              let lineSpacing: number | undefined;
              const lnSpc = pPr ? qNS(pPr, NS.a, 'lnSpc') : null;
              if (lnSpc) {
                const spcPct = qNS(lnSpc, NS.a, 'spcPct');
                if (spcPct) {
                  const val = spcPct.getAttribute('val');
                  if (val) lineSpacing = parseInt(val) / 1000; // val is in 1/1000 percent
                }
              }

              // Extract paragraph spacing (spaceBefore, spaceAfter)
              let spaceBefore: number | undefined;
              let spaceAfter: number | undefined;
              const spcBef = pPr ? qNS(pPr, NS.a, 'spcBef') : null;
              const spcAft = pPr ? qNS(pPr, NS.a, 'spcAft') : null;
              if (spcBef) {
                const spcPts = qNS(spcBef, NS.a, 'spcPts');
                if (spcPts) spaceBefore = parseInt(spcPts.getAttribute('val') || '0') / 100;
              }
              if (spcAft) {
                const spcPts = qNS(spcAft, NS.a, 'spcPts');
                if (spcPts) spaceAfter = parseInt(spcPts.getAttribute('val') || '0') / 100;
              }

              paras.push({ html, align, level, bullet: hasBullet, lineSpacing, spaceBefore, spaceAfter });
            }

            // Extract text box fill and border from spPr
            let fillColor: string | undefined;
            let borderColor: string | undefined;
            let borderWidth: number | undefined;
            let noFill = false;

            if (spPr) {
              // Check for explicit noFill
              if (qNS(spPr, NS.a, 'noFill')) {
                noFill = true;
              } else {
                const solidFill = qNS(spPr, NS.a, 'solidFill');
                if (solidFill) {
                  const color = parseColor(solidFill, slideThemeColors);
                  if (color) fillColor = color;
                }
              }

              const ln = qNS(spPr, NS.a, 'ln');
              if (ln) {
                const lnFill = qNS(ln, NS.a, 'solidFill');
                if (lnFill) {
                  borderColor = parseColor(lnFill, slideThemeColors) || undefined;
                }
                const w = ln.getAttribute('w');
                if (w) borderWidth = parseInt(w) / 12700; // EMUs to points
              }
            }

            shapes.push({ type: 'text', xfrm: xfrmData, paras, spNode: sp, fillColor, noFill, borderColor, borderWidth });
          }

          // Parse images
          const picNodes = qaNS(doc, NS.p, 'pic') as Element[];
          for (const pic of picNodes) {
            try {
              const blipFill = qNS(pic, NS.p, 'blipFill');
              const blip = blipFill ? qNS(blipFill, NS.a, 'blip') : null;
              const embedId = blip?.getAttributeNS(NS.r, 'embed');

              let imgDataUrl = '';
              if (embedId) {
                const slideRels = qaNS(relsDoc, NS.pkgRels, 'Relationship') as Element[];
                const imgRel = slideRels.find(r => r.getAttribute('Id') === embedId);
                if (imgRel) {
                  const target = imgRel.getAttribute('Target') || '';
                  const mediaPath = `ppt/${target.replace(/^\.\.\//, '')}`;
                  const imgFile = z.file(mediaPath);
                  if (imgFile) {
                    const buf = await imgFile.async('uint8array');
                    const ext = mediaPath.split('.').pop()?.toLowerCase() || 'png';
                    const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
                    const b64 = btoa(Array.from(buf).map(b => String.fromCharCode(b)).join(''));
                    imgDataUrl = `data:${mime};base64,${b64}`;
                  }
                }
              }

              const spPr = qNS(pic, NS.p, 'spPr');
              const xfrm = spPr ? qNS(spPr, NS.a, 'xfrm') : null;
              const off = xfrm ? qNS(xfrm, NS.a, 'off') : null;
              const ext = xfrm ? qNS(xfrm, NS.a, 'ext') : null;

              shapes.push({
                type: 'image',
                imgDataUrl,
                xfrm: {
                  x: Number(off?.getAttribute('x')) || 0,
                  y: Number(off?.getAttribute('y')) || 0,
                  cx: Number(ext?.getAttribute('cx')) || 1000000,
                  cy: Number(ext?.getAttribute('cy')) || 1000000,
                },
              });
            } catch (e) {
              console.error('[PPTX] Image parse error:', e);
            }
          }

          // Parse connector shapes (lines/arrows)
          const cxnSpNodes = qaNS(doc, NS.p, 'cxnSp') as Element[];
          for (const cxnSp of cxnSpNodes) {
            try {
              const spPr = qNS(cxnSp, NS.p, 'spPr');
              const xfrm = spPr ? qNS(spPr, NS.a, 'xfrm') : null;
              const off = xfrm ? qNS(xfrm, NS.a, 'off') : null;
              const ext = xfrm ? qNS(xfrm, NS.a, 'ext') : null;

              let lineColor: string | undefined;
              let lineWidth = 1;

              if (spPr) {
                const ln = qNS(spPr, NS.a, 'ln');
                if (ln) {
                  // Check for noFill on line
                  if (!qNS(ln, NS.a, 'noFill')) {
                    const lnFill = qNS(ln, NS.a, 'solidFill');
                    if (lnFill) {
                      lineColor = parseColor(lnFill, slideThemeColors) || undefined;
                    }
                  }
                  const w = ln.getAttribute('w');
                  if (w) lineWidth = parseInt(w) / 12700;
                }
              }

              // Only add connector if it has a visible line
              if (lineColor) {
                shapes.push({
                  type: 'shape',
                  shapeType: 'line',
                  fillColor: lineColor,
                  borderWidth: lineWidth,
                  xfrm: {
                    x: Number(off?.getAttribute('x')) || 0,
                    y: Number(off?.getAttribute('y')) || 0,
                    cx: Number(ext?.getAttribute('cx')) || 1000000,
                    cy: Number(ext?.getAttribute('cy')) || 10000,
                  },
                });
              }
            } catch (e) {
              console.error('[PPTX] Connector parse error:', e);
            }
          }

          // Parse shapes without text (geometric shapes)
          const allSpNodes = qaNS(doc, NS.p, 'sp') as Element[];
          for (const sp of allSpNodes) {
            const txBody = qNS(sp, NS.p, 'txBody');
            // Skip shapes that have text (already parsed above)
            if (txBody) continue;

            try {
              const spPr = qNS(sp, NS.p, 'spPr');
              const xfrm = spPr ? qNS(spPr, NS.a, 'xfrm') : null;
              const off = xfrm ? qNS(xfrm, NS.a, 'off') : null;
              const ext = xfrm ? qNS(xfrm, NS.a, 'ext') : null;

              if (!off || !ext) continue;

              let fillColor: string | undefined;
              let borderColor: string | undefined;
              let borderWidth: number | undefined;
              let shapeType = 'rect';
              let hasNoFill = false;

              if (spPr) {
                // Check for explicit noFill
                if (qNS(spPr, NS.a, 'noFill')) {
                  hasNoFill = true;
                } else {
                  const solidFill = qNS(spPr, NS.a, 'solidFill');
                  if (solidFill) {
                    fillColor = parseColor(solidFill, slideThemeColors) || undefined;
                  }
                }

                const ln = qNS(spPr, NS.a, 'ln');
                if (ln) {
                  // Check for noFill on line too
                  if (!qNS(ln, NS.a, 'noFill')) {
                    const lnFill = qNS(ln, NS.a, 'solidFill');
                    if (lnFill) {
                      borderColor = parseColor(lnFill, slideThemeColors) || undefined;
                    }
                  }
                  const w = ln.getAttribute('w');
                  if (w) borderWidth = parseInt(w) / 12700;
                }

                // Get preset geometry
                const prstGeom = qNS(spPr, NS.a, 'prstGeom');
                if (prstGeom) {
                  const prst = prstGeom.getAttribute('prst');
                  if (prst === 'ellipse') shapeType = 'ellipse';
                  else if (prst === 'roundRect') shapeType = 'roundRect';
                  else if (prst === 'triangle') shapeType = 'triangle';
                }
              }

              // Only add if it has some visual properties and doesn't have noFill
              if ((fillColor || borderColor) && !hasNoFill) {
                shapes.push({
                  type: 'shape',
                  shapeType,
                  fillColor,
                  borderColor,
                  borderWidth,
                  xfrm: {
                    x: Number(off.getAttribute('x')) || 0,
                    y: Number(off.getAttribute('y')) || 0,
                    cx: Number(ext.getAttribute('cx')) || 1000000,
                    cy: Number(ext.getAttribute('cy')) || 1000000,
                  },
                });
              }
            } catch (e) {
              console.error('[PPTX] Shape parse error:', e);
            }
          }

          // Extract slide background - check slide, then layout, then master
          let background = '#ffffff';
          let foundBackground = false;

          // First check the slide's own background
          const cSld = qNS(doc, NS.p, 'cSld');
          const bgElement = cSld ? qNS(cSld, NS.p, 'bg') : null;
          if (bgElement) {
            const bgPr = qNS(bgElement, NS.p, 'bgPr');
            if (bgPr) {
              const solidFill = qNS(bgPr, NS.a, 'solidFill');
              const gradFill = qNS(bgPr, NS.a, 'gradFill');

              if (solidFill) {
                const bgColor = parseColor(solidFill, slideThemeColors);
                if (bgColor) {
                  background = bgColor;
                  foundBackground = true;
                }
              } else if (gradFill) {
                // Extract gradient colors
                const gsLst = qNS(gradFill, NS.a, 'gsLst');
                if (gsLst) {
                  const gsNodes = qaNS(gsLst, NS.a, 'gs') as Element[];
                  const gradientColors: string[] = [];
                  for (const gs of gsNodes) {
                    const gradColor = parseColor(gs, slideThemeColors);
                    if (gradColor) gradientColors.push(gradColor);
                  }
                  if (gradientColors.length >= 2) {
                    background = `linear-gradient(135deg, ${gradientColors.join(', ')})`;
                    foundBackground = true;
                  }
                }
              }
            }
            // Check for bgRef (references theme background)
            const bgRef = qNS(bgElement, NS.p, 'bgRef');
            if (bgRef) {
              const refColor = parseColor(bgRef, slideThemeColors);
              if (refColor) {
                background = refColor;
                foundBackground = true;
              }
            }
          }

          // If no background found on slide, check layout and master
          if (!foundBackground) {
            // Get slide's relationship to layout
            const slideRels = qaNS(relsDoc, NS.pkgRels, 'Relationship') as Element[];
            let layoutPath = '';
            for (const rel of slideRels) {
              const type = rel.getAttribute('Type') || '';
              if (type.includes('slideLayout')) {
                const target = rel.getAttribute('Target') || '';
                layoutPath = `ppt/${target.replace(/^\.\.\//, '')}`;
                break;
              }
            }

            // Check layout background
            if (layoutPath && slideLayoutBackgrounds[layoutPath]) {
              background = slideLayoutBackgrounds[layoutPath];
              foundBackground = true;
            }

            // If still no background, check master
            if (!foundBackground && layoutPath) {
              const masterPath = slideLayoutToMaster[layoutPath];
              if (masterPath && slideMasterBackgrounds[masterPath]) {
                background = slideMasterBackgrounds[masterPath];
              }
            }

            // If still nothing, check any master (fallback)
            if (!foundBackground) {
              const masterPaths = Object.keys(slideMasterBackgrounds);
              if (masterPaths.length > 0) {
                background = slideMasterBackgrounds[masterPaths[0]];
              }
            }
          }

          loadedSlides.push({ name: s.name, doc, relsDoc, shapes, background });
        }

        if (cancelled) return;

        setZip(z);
        setPresDoc(pres);
        setPresRelsDoc(presRels);
        setSlideOrder(order);
        setSlides(loadedSlides);
        setIdx(0);
        setHasChanges(false);
        setLoading(false);
      } catch (e: any) {
        if (!cancelled) {
          console.error('[PPTX] Load error:', e);
          setErr(e.message || String(e));
          setLoading(false);
        }
      }
    };

    load();
    return () => { cancelled = true; };
  }, [filePath]);

  // Update paragraph HTML
  const updateParaHTML = useCallback((shapeIdx: number, paraIdx: number, newHTML: string) => {
    if (!activeSlide) return;
    setSlides(prev => {
      const next = [...prev];
      const s = { ...next[idx] };
      const shapes = [...s.shapes];
      const sh = { ...shapes[shapeIdx] };
      if (sh.paras && paraIdx < sh.paras.length) {
        const paras = [...sh.paras];
        paras[paraIdx] = { ...paras[paraIdx], html: newHTML };
        sh.paras = paras;
      }
      shapes[shapeIdx] = sh;
      s.shapes = shapes;
      next[idx] = s;
      return next;
    });
    setHasChanges(true);
  }, [idx, activeSlide]);

  // Add text box
  const addTextBox = useCallback(() => {
    setSlides(prev => {
      const next = [...prev];
      const s = { ...next[idx] };
      const shapes = [...s.shapes];
      shapes.push({
        type: 'text',
        paras: [{ html: 'Click to edit', align: 'l', level: 0, bullet: false }],
        xfrm: { x: 1500000, y: 1500000, cx: 4000000, cy: 800000 },
        spNode: null,
      });
      s.shapes = shapes;
      next[idx] = s;
      return next;
    });
    setHasChanges(true);
  }, [idx]);

  // Add image
  const addImage = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        setSlides(prev => {
          const next = [...prev];
          const s = { ...next[idx] };
          const shapes = [...s.shapes];
          shapes.push({
            type: 'image',
            imgDataUrl: dataUrl,
            xfrm: { x: 1000000, y: 1000000, cx: 3000000, cy: 2000000 },
          });
          s.shapes = shapes;
          next[idx] = s;
          return next;
        });
        setHasChanges(true);
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }, [idx]);

  // Add shape
  const addShape = useCallback((shapeType: string, color: string = '#4285f4') => {
    setSlides(prev => {
      const next = [...prev];
      const s = { ...next[idx] };
      const shapes = [...s.shapes];
      shapes.push({
        type: 'shape',
        shapeType,
        fillColor: color,
        xfrm: { x: 2000000, y: 2000000, cx: 2000000, cy: 1500000 },
      });
      s.shapes = shapes;
      next[idx] = s;
      return next;
    });
    setHasChanges(true);
    setShowShapePicker(false);
  }, [idx]);

  // Set slide background
  const setSlideBackground = useCallback((bg: string) => {
    setSlides(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], background: bg };
      return next;
    });
    setHasChanges(true);
    setShowBgPicker(false);
  }, [idx]);

  // Set slide gradient
  const setSlideGradient = useCallback((colors: string[]) => {
    const gradient = `linear-gradient(135deg, ${colors[0]}, ${colors[1]})`;
    setSlides(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], background: gradient };
      return next;
    });
    setHasChanges(true);
    setShowBgPicker(false);
  }, [idx]);

  // Apply slide layout
  const layoutToShapes = useCallback((layout: typeof SLIDE_LAYOUTS[0]): Shape[] => {
    return layout.shapes.map((s: any) => {
      const sizeHundredths = (s.size || 18) * 100; // convert pt to hundredths for inline style
      const boldTag = s.bold ? 'font-weight: bold' : '';
      const styleStr = [
        `font-size: ${s.size || 18}pt`,
        boldTag,
      ].filter(Boolean).join('; ');
      const html = styleStr
        ? `<span style="${styleStr}">${escapeHtml(s.text)}</span>`
        : escapeHtml(s.text);
      return {
        type: 'text' as const,
        paras: [{ html, align: s.align || 'ctr', level: 0, bullet: false }],
        xfrm: {
          x: (s.x / 100) * 9144000,
          y: (s.y / 100) * 6858000,
          cx: (s.w / 100) * 9144000,
          cy: (s.h / 100) * 6858000,
        },
        spNode: null,
      };
    });
  }, []);

  const applyLayout = useCallback((layout: typeof SLIDE_LAYOUTS[0]) => {
    const newShapes = layoutToShapes(layout);
    setSlides(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], shapes: newShapes };
      return next;
    });
    setHasChanges(true);
    setShowLayoutPicker(false);
  }, [idx, layoutToShapes]);

  // Add slide - creates a new blank slide with Title Slide layout after current position
  const addSlide = useCallback(() => {
    if (!slides.length) return;

    const base = slides[idx];
    const newSlide: Slide = {
      name: `slide_new_${Date.now()}`,
      doc: base.doc?.cloneNode(true) as Document || null,
      relsDoc: base.relsDoc?.cloneNode(true) as Document || null,
      shapes: layoutToShapes(SLIDE_LAYOUTS[0]),
      background: base.background,
    };

    setSlides(prev => [...prev.slice(0, idx + 1), newSlide, ...prev.slice(idx + 1)]);
    setIdx(idx + 1);
    setHasChanges(true);
  }, [slides, idx, layoutToShapes]);

  // Delete slide
  const deleteSlide = useCallback(() => {
    if (slides.length <= 1) return;
    setSlides(prev => prev.filter((_, i) => i !== idx));
    setIdx(Math.max(0, idx - 1));
    setHasChanges(true);
  }, [slides.length, idx]);

  // Duplicate slide
  const duplicateSlide = useCallback(() => {
    if (!activeSlide) return;
    const cloned: Slide = {
      ...activeSlide,
      name: `slide${slides.length + 1}`,
      shapes: activeSlide.shapes.map(sh => ({
        ...sh,
        paras: sh.paras ? sh.paras.map(p => ({ ...p })) : undefined,
      })),
    };
    setSlides(prev => [...prev.slice(0, idx + 1), cloned, ...prev.slice(idx + 1)]);
    setIdx(idx + 1);
    setHasChanges(true);
  }, [activeSlide, slides.length, idx]);

  // Save
  const save = useCallback(async () => {
    if (!zip || !presDoc || !presRelsDoc || !hasChanges) return;
    try {
      for (const slide of slides) {
        if (slide.doc && slide.relsDoc) {
          zip.file(slide.name, new XMLSerializer().serializeToString(slide.doc));
          const relsPath = `ppt/slides/_rels/${slide.name.split('/').pop()}.rels`;
          zip.file(relsPath, new XMLSerializer().serializeToString(slide.relsDoc));
        }
      }
      zip.file('ppt/presentation.xml', new XMLSerializer().serializeToString(presDoc));
      zip.file('ppt/_rels/presentation.xml.rels', new XMLSerializer().serializeToString(presRelsDoc));

      const output = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
      await window.api.writeFileBuffer(filePath, output);
      setHasChanges(false);
    } catch (e: any) {
      console.error('[PPTX] Save error:', e);
      setErr(`Save failed: ${e.message}`);
    }
  }, [zip, presDoc, presRelsDoc, slides, filePath, hasChanges]);

  // Presentation mode
  const enterPresentation = useCallback(() => {
    setIsPresentationMode(true);
    presentationRef.current?.requestFullscreen?.();
  }, []);

  const exitPresentation = useCallback(() => {
    setIsPresentationMode(false);
    document.exitFullscreen?.();
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        save();
      }
      if (isPresentationMode) {
        if (e.key === 'Escape') exitPresentation();
        else if (e.key === 'ArrowRight' || e.key === ' ') {
          if (idx < slides.length - 1) setIdx(idx + 1);
        } else if (e.key === 'ArrowLeft') {
          if (idx > 0) setIdx(idx - 1);
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [save, isPresentationMode, idx, slides.length, exitPresentation]);

  // Fullscreen change
  useEffect(() => {
    const handler = () => {
      if (!document.fullscreenElement) setIsPresentationMode(false);
    };
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // Close dropdowns on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.dropdown-container')) {
        setShowFontPicker(false);
        setShowColorPicker(false);
        setShowShapePicker(false);
        setShowBgPicker(false);
        setShowLayoutPicker(false);
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  // Helper to compute color brightness (0-255)
  const getColorBrightness = useCallback((color: string): number => {
    if (!color) return 255;
    const hex = color.replace('#', '').replace(/^linear-gradient.*$/, 'ffffff');
    if (hex.length < 6) return 255;
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    // Perceived brightness formula
    return (r * 299 + g * 587 + b * 114) / 1000;
  }, []);

  // Render slide content
  const renderSlideContent = useCallback((slide: Slide, scale: number = 1, editable: boolean = true) => {
    // Determine default text color based on slide background brightness
    const bgBrightness = getColorBrightness(slide.background || '#ffffff');
    const useLight = bgBrightness < 128; // Dark background = use light text
    const defaultTextColor = useLight
      ? (themeColors['lt1'] || '#ffffff')
      : (themeColors['dk1'] || themeColors['dk2'] || '#000000');

    return slide.shapes.map((shape, si) => {
      const style: React.CSSProperties = {
        position: 'absolute',
        left: emuToPx(shape.xfrm.x) * scale,
        top: emuToPx(shape.xfrm.y) * scale,
        width: emuToPx(shape.xfrm.cx) * scale,
        height: emuToPx(shape.xfrm.cy) * scale,
        zIndex: shape.type === 'shape' ? 0 : shape.type === 'image' ? 1 : 2,
      };

      if (shape.type === 'text') {
        // Build text box styles
        const textBoxStyle: React.CSSProperties = {
          ...style,
          padding: 4 * scale,
          boxSizing: 'border-box' as const,
        };
        // Only apply background if there's a fill color and noFill is not set
        if (shape.fillColor && !shape.noFill) {
          textBoxStyle.backgroundColor = shape.fillColor;
        }
        if (shape.borderColor || shape.borderWidth) {
          textBoxStyle.border = `${(shape.borderWidth || 1) * scale}px solid ${shape.borderColor || '#000000'}`;
        }

        return (
          <div key={si} style={textBoxStyle}>
            {shape.paras?.map((p, pi) => {
              const paraStyle: React.CSSProperties = {
                textAlign: p.align === 'ctr' ? 'center' : p.align === 'r' ? 'right' : p.align === 'just' ? 'justify' : 'left',
                paddingLeft: p.level * 20 * scale,
                outline: 'none',
                minHeight: '1em',
                color: defaultTextColor, // Use computed default based on background
                fontSize: `${18 * scale}px`, // Default font size
                fontFamily: 'Arial, sans-serif', // Default font
              };

              // Apply line spacing
              if (p.lineSpacing) {
                paraStyle.lineHeight = `${p.lineSpacing}%`;
              }

              // Apply paragraph spacing
              if (p.spaceBefore) {
                paraStyle.marginTop = `${p.spaceBefore * scale}pt`;
              }
              if (p.spaceAfter) {
                paraStyle.marginBottom = `${p.spaceAfter * scale}pt`;
              }

              return (
                <div
                  key={pi}
                  contentEditable={editable}
                  suppressContentEditableWarning
                  style={paraStyle}
                  onBlur={editable ? (e) => updateParaHTML(si, pi, e.currentTarget.innerHTML) : undefined}
                  dangerouslySetInnerHTML={{ __html: (p.bullet ? '<span style="margin-right:4px">•</span>' : '') + p.html }}
                />
              );
            })}
          </div>
        );
      }

      if (shape.type === 'image' && shape.imgDataUrl) {
        return (
          <div key={si} style={style}>
            <img src={shape.imgDataUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
        );
      }

      if (shape.type === 'shape') {
        const shapeStyle: React.CSSProperties = {
          width: '100%',
          height: '100%',
        };
        // Only apply fill color if one is specified - don't use a default
        if (shape.fillColor) {
          shapeStyle.backgroundColor = shape.fillColor;
        }

        // Apply shape-specific styling
        if (shape.shapeType === 'ellipse') {
          shapeStyle.borderRadius = '50%';
        } else if (shape.shapeType === 'roundRect') {
          shapeStyle.borderRadius = '12px';
        } else if (shape.shapeType === 'diamond') {
          shapeStyle.transform = 'rotate(45deg)';
          shapeStyle.width = '70%';
          shapeStyle.height = '70%';
          shapeStyle.margin = '15%';
        } else if (shape.shapeType === 'triangle') {
          shapeStyle.backgroundColor = 'transparent';
          shapeStyle.borderLeft = `${emuToPx(shape.xfrm.cx) * scale / 2}px solid transparent`;
          shapeStyle.borderRight = `${emuToPx(shape.xfrm.cx) * scale / 2}px solid transparent`;
          if (shape.fillColor) {
            shapeStyle.borderBottom = `${emuToPx(shape.xfrm.cy) * scale}px solid ${shape.fillColor}`;
          }
        } else if (shape.shapeType === 'star') {
          shapeStyle.clipPath = 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)';
        } else if (shape.shapeType === 'hexagon') {
          shapeStyle.clipPath = 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)';
        } else if (shape.shapeType === 'arrow') {
          shapeStyle.clipPath = 'polygon(0% 20%, 60% 20%, 60% 0%, 100% 50%, 60% 100%, 60% 80%, 0% 80%)';
        } else if (shape.shapeType === 'line') {
          shapeStyle.height = '4px';
          shapeStyle.marginTop = `${emuToPx(shape.xfrm.cy) * scale / 2}px`;
        }

        return <div key={si} style={{ ...style, ...shapeStyle }} />;
      }

      return null;
    });
  }, [emuToPx, updateParaHTML, themeColors]);

  // Error state
  if (err) {
    return (
      <div className="h-full flex flex-col theme-bg-secondary p-4">
        <div className="text-red-500">
          <h3 className="font-bold mb-2">Error loading presentation</h3>
          <p className="text-sm mb-4">{err}</p>
          <button onClick={() => { setErr(null); setLoading(true); }} className="px-3 py-1 bg-blue-600 text-white rounded text-sm">
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="h-full flex items-center justify-center theme-bg-secondary">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2" />
          <p className="text-sm theme-text-muted">Loading presentation...</p>
        </div>
      </div>
    );
  }

  // No slides
  if (!slides.length || !activeSlide) {
    return (
      <div className="h-full flex items-center justify-center theme-bg-secondary">
        <p className="theme-text-muted">No slides found</p>
      </div>
    );
  }

  // Presentation mode
  if (isPresentationMode) {
    const scale = Math.min(window.innerWidth / slideWidth, window.innerHeight / slideHeight);
    return (
      <div
        ref={presentationRef}
        className="fixed inset-0 bg-black z-[9999] flex items-center justify-center"
        onClick={(e) => {
          const x = e.clientX;
          if (x > window.innerWidth / 2) {
            if (idx < slides.length - 1) setIdx(idx + 1);
          } else {
            if (idx > 0) setIdx(idx - 1);
          }
        }}
      >
        <div
          className="relative bg-white"
          style={{ width: slideWidth * scale, height: slideHeight * scale }}
        >
          {renderSlideContent(activeSlide, scale, false)}
        </div>
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/50 text-sm">
          {idx + 1} / {slides.length}
        </div>
        <div className="absolute top-4 right-4 text-white/30 text-xs">ESC to exit</div>
      </div>
    );
  }

  // Main editor
  return (
    <div
      className="h-full flex flex-col theme-bg-secondary overflow-hidden"
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setPptxContextMenu({ x: e.clientX, y: e.clientY });
      }}
    >
      {/* Header */}
      <div
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move';
          const nodePath = findNodePath?.(rootLayoutNode, nodeId) || [];
          e.dataTransfer.setData('application/json', JSON.stringify({ type: 'pane', id: nodeId, nodePath }));
          setTimeout(() => setDraggedItem?.({ type: 'pane', id: nodeId, nodePath }), 0);
        }}
        onDragEnd={() => setDraggedItem?.(null)}
        onContextMenu={(e) => {
          e.preventDefault();
          setPptxContextMenu({ x: e.clientX, y: e.clientY });
        }}
        className="px-3 py-2 border-b theme-border theme-bg-secondary cursor-move flex items-center justify-between"
      >
        <span className="text-sm font-medium truncate">
          {filePath?.split('/').pop() || 'Presentation'}{hasChanges ? ' *' : ''}
        </span>
        <div className="flex items-center gap-1">
          <button onClick={addSlide} className="p-1.5 theme-hover rounded" title="Add slide"><Plus size={14} /></button>
          <button onClick={duplicateSlide} className="p-1.5 theme-hover rounded" title="Duplicate"><Copy size={14} /></button>
          <button onClick={deleteSlide} disabled={slides.length <= 1} className="p-1.5 theme-hover rounded disabled:opacity-30" title="Delete"><Trash2 size={14} /></button>
          <div className="w-px h-4 bg-gray-600 mx-1" />
          <button onClick={enterPresentation} className="p-1.5 theme-hover rounded" title="Present"><Play size={14} /></button>
          <button onClick={save} disabled={!hasChanges} className="p-1.5 theme-hover rounded disabled:opacity-30" title="Save"><Save size={14} /></button>
          <button onClick={() => closeContentPane?.(nodeId, findNodePath?.(rootLayoutNode, nodeId) || [])} className="p-1.5 theme-hover rounded-full" title="Close"><X size={14} /></button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="px-2 py-1.5 border-b theme-border theme-bg-tertiary flex items-center gap-1 flex-wrap">
        {/* Font */}
        <div className="relative dropdown-container">
          <button
            onClick={(e) => { e.stopPropagation(); setShowFontPicker(!showFontPicker); }}
            className="px-2 py-1 text-[11px] theme-hover rounded flex items-center gap-1 min-w-[90px] border border-white/10"
          >
            <Type size={12} />
            <span className="truncate">{currentFont}</span>
            <ChevronDown size={10} />
          </button>
          {showFontPicker && (
            <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-700 rounded shadow-xl z-50 max-h-48 overflow-y-auto">
              {FONTS.map(font => (
                <button
                  key={font}
                  onClick={() => { setCurrentFont(font); setShowFontPicker(false); document.execCommand('fontName', false, font); }}
                  className="w-full px-3 py-1.5 text-left text-xs hover:bg-gray-700"
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
          value={currentFontSize}
          onChange={(e) => { setCurrentFontSize(e.target.value); document.execCommand('fontSize', false, e.target.value); }}
          className="px-1.5 py-1 rounded theme-bg-secondary border border-white/10 text-[11px] w-14"
        >
          {FONT_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <div className="w-px h-5 bg-gray-600 mx-0.5" />

        {/* Formatting */}
        <button onClick={() => document.execCommand('bold')} className="p-1.5 theme-hover rounded" title="Bold"><Bold size={14} /></button>
        <button onClick={() => document.execCommand('italic')} className="p-1.5 theme-hover rounded" title="Italic"><Italic size={14} /></button>
        <button onClick={() => document.execCommand('underline')} className="p-1.5 theme-hover rounded" title="Underline"><Underline size={14} /></button>

        <div className="w-px h-5 bg-gray-600 mx-0.5" />

        {/* Color */}
        <div className="relative dropdown-container">
          <button
            onClick={(e) => { e.stopPropagation(); setShowColorPicker(!showColorPicker); }}
            className="p-1.5 theme-hover rounded"
            title="Text Color"
          >
            <Palette size={14} />
          </button>
          {showColorPicker && (
            <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-700 rounded shadow-xl z-50 p-2">
              <div className="grid grid-cols-6 gap-1">
                {THEME_COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => { document.execCommand('foreColor', false, c); setShowColorPicker(false); }}
                    className="w-5 h-5 rounded border border-gray-600 hover:scale-110"
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="w-px h-5 bg-gray-600 mx-0.5" />

        {/* Alignment */}
        <button onClick={() => document.execCommand('justifyLeft')} className="p-1.5 theme-hover rounded" title="Left"><AlignLeft size={14} /></button>
        <button onClick={() => document.execCommand('justifyCenter')} className="p-1.5 theme-hover rounded" title="Center"><AlignCenter size={14} /></button>
        <button onClick={() => document.execCommand('justifyRight')} className="p-1.5 theme-hover rounded" title="Right"><AlignRight size={14} /></button>

        <div className="w-px h-5 bg-gray-600 mx-0.5" />

        {/* Insert */}
        <button onClick={addTextBox} className="p-1.5 theme-hover rounded" title="Text Box"><Type size={14} /></button>
        <button onClick={addImage} className="p-1.5 theme-hover rounded" title="Image"><ImageIcon size={14} /></button>

        <div className="relative dropdown-container">
          <button
            onClick={(e) => { e.stopPropagation(); setShowShapePicker(!showShapePicker); }}
            className="p-1.5 theme-hover rounded"
            title="Shapes"
          >
            <Square size={14} />
          </button>
          {showShapePicker && (
            <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-700 rounded shadow-xl z-50 p-2">
              <div className="text-[10px] text-gray-400 mb-1 px-1">Shape color</div>
              <div className="grid grid-cols-6 gap-1 mb-2 pb-2 border-b border-gray-700">
                {THEME_COLORS.slice(0, 12).map(c => (
                  <button
                    key={c}
                    onClick={() => setSelectedShapeColor(c)}
                    className={`w-5 h-5 rounded border ${selectedShapeColor === c ? 'border-white' : 'border-gray-600'} hover:scale-110`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <div className="grid grid-cols-3 gap-1">
                {SHAPE_PRESETS.map(s => (
                  <button
                    key={s.type}
                    onClick={() => addShape(s.type, selectedShapeColor)}
                    className="p-2 theme-hover rounded flex items-center gap-2 text-xs"
                  >
                    <s.icon size={14} />
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="w-px h-5 bg-gray-600 mx-0.5" />

        {/* Background */}
        <div className="relative dropdown-container">
          <button
            onClick={(e) => { e.stopPropagation(); setShowBgPicker(!showBgPicker); }}
            className="p-1.5 theme-hover rounded"
            title="Slide Background"
          >
            <PaintBucket size={14} />
          </button>
          {showBgPicker && (
            <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-700 rounded shadow-xl z-50 p-2 min-w-[220px] max-h-[350px] overflow-y-auto">
              <div className="text-[10px] text-gray-400 mb-1">Solid Colors</div>
              <div className="grid grid-cols-6 gap-1 mb-2 pb-2 border-b border-gray-700">
                {BACKGROUND_COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setSlideBackground(c)}
                    className="w-6 h-6 rounded border border-gray-600 hover:scale-110 transition-transform"
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <div className="text-[10px] text-gray-400 mb-1">Gradients</div>
              <div className="grid grid-cols-4 gap-1">
                {GRADIENT_PRESETS.map(g => (
                  <button
                    key={g.name}
                    onClick={() => setSlideGradient(g.colors)}
                    className="h-6 rounded border border-gray-600 hover:scale-105 transition-transform"
                    style={{ background: `linear-gradient(135deg, ${g.colors[0]}, ${g.colors[1]})` }}
                    title={g.name}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Layout */}
        <div className="relative dropdown-container">
          <button
            onClick={(e) => { e.stopPropagation(); setShowLayoutPicker(!showLayoutPicker); }}
            className="p-1.5 theme-hover rounded"
            title="Slide Layout"
          >
            <Layout size={14} />
          </button>
          {showLayoutPicker && (
            <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-700 rounded shadow-xl z-50 p-2 min-w-[320px] max-h-[400px] overflow-y-auto">
              <div className="text-[10px] text-gray-400 mb-1.5 px-1">Slide Layouts</div>
              <div className="grid grid-cols-3 gap-1.5">
                {SLIDE_LAYOUTS.map(layout => (
                  <button
                    key={layout.name}
                    onClick={() => applyLayout(layout)}
                    className="group flex flex-col items-center gap-1 p-1.5 rounded hover:bg-gray-700 transition-colors"
                    title={layout.name}
                  >
                    {/* Mini layout preview */}
                    <div className="w-[88px] h-[50px] bg-gray-900 border border-gray-600 rounded-sm relative overflow-hidden group-hover:border-blue-500">
                      {layout.shapes.map((s, si) => (
                        <div
                          key={si}
                          className="absolute bg-gray-600/40 border border-gray-500/30 rounded-[1px]"
                          style={{
                            left: `${s.x}%`,
                            top: `${s.y}%`,
                            width: `${s.w}%`,
                            height: `${s.h}%`,
                          }}
                        >
                          <div className="w-full h-[2px] bg-gray-400/40 mt-[2px] mx-auto" style={{ width: '60%' }} />
                        </div>
                      ))}
                      {layout.shapes.length === 0 && (
                        <div className="absolute inset-0 flex items-center justify-center text-[7px] text-gray-500">Blank</div>
                      )}
                    </div>
                    <span className="text-[9px] text-gray-400 group-hover:text-gray-200 truncate w-full text-center">{layout.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex-1" />

        {/* Navigation */}
        <span className="text-[10px] text-gray-400 px-2">Slide {idx + 1}/{slides.length}</span>
        <button onClick={() => idx > 0 && setIdx(idx - 1)} disabled={idx === 0} className="p-1.5 theme-hover rounded disabled:opacity-30"><ChevronLeft size={14} /></button>
        <button onClick={() => idx < slides.length - 1 && setIdx(idx + 1)} disabled={idx === slides.length - 1} className="p-1.5 theme-hover rounded disabled:opacity-30"><ChevronRight size={14} /></button>

        <div className="w-px h-5 bg-gray-600 mx-1" />

        {/* Document light/dark mode toggle */}
        <button
          onClick={() => setDocLightMode(!docLightMode)}
          className="p-1.5 theme-hover rounded"
          title={docLightMode ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
        >
          {docLightMode ? <Moon size={14} /> : <Sun size={14} />}
        </button>

        <div className="w-px h-5 bg-gray-600 mx-1" />

        {/* Zoom */}
        <button onClick={() => setZoom(z => Math.max(50, z - 10))} className="p-1.5 theme-hover rounded"><ZoomOut size={14} /></button>
        <span className="text-[10px] text-gray-400 w-10 text-center">{zoom}%</span>
        <button onClick={() => setZoom(z => Math.min(200, z + 10))} className="p-1.5 theme-hover rounded"><ZoomIn size={14} /></button>
      </div>

      {/* Main content */}
      <div className="flex-1 flex min-h-0">
        {/* Slide panel */}
        <div
          className="w-48 border-r theme-border overflow-y-auto theme-bg-tertiary p-2 space-y-2"
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          {slides.map((slide, i) => (
            <button
              key={slide.name + i}
              onClick={() => setIdx(i)}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIdx(i);
                setSlideNavContextMenu({ x: e.clientX, y: e.clientY, slideIdx: i });
              }}
              className={`w-full relative rounded overflow-hidden border-2 transition-colors ${
                i === idx ? 'border-blue-500' : 'border-transparent hover:border-gray-600'
              }`}
            >
              {/* Thumbnail */}
              <div
                className="relative"
                style={{
                  width: '100%',
                  paddingBottom: `${(slideHeight / slideWidth) * 100}%`,
                  background: slide.background || '#ffffff',
                }}
              >
                <div
                  className="absolute inset-0"
                  style={{ transform: `scale(${160 / slideWidth})`, transformOrigin: 'top left' }}
                >
                  <div style={{ width: slideWidth, height: slideHeight, position: 'relative', background: slide.background || '#ffffff' }}>
                    {renderSlideContent(slide, 1, false)}
                  </div>
                </div>
              </div>
              {/* Slide number */}
              <div className="absolute bottom-1 right-1 bg-black/50 text-white text-[9px] px-1 rounded">
                {i + 1}
              </div>
            </button>
          ))}
        </div>

        {/* Editor canvas */}
        <div className="flex-1 flex flex-col overflow-auto theme-bg-primary p-6">
          <div
            className="relative shadow-2xl mx-auto flex-shrink-0 rounded overflow-hidden"
            style={{
              width: slideWidth * (zoom / 100),
              height: slideHeight * (zoom / 100),
              background: activeSlide.background || '#ffffff',
            }}
          >
            <div
              style={{
                width: slideWidth,
                height: slideHeight,
                transform: `scale(${zoom / 100})`,
                transformOrigin: 'top left',
                position: 'relative',
                background: activeSlide.background || '#ffffff',
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setPptxContextMenu({ x: e.clientX, y: e.clientY });
              }}
            >
              {renderSlideContent(activeSlide, 1, true)}
            </div>
          </div>

          {/* Notes */}
          <div className="mt-4 theme-bg-secondary rounded border theme-border shadow-sm mx-auto" style={{ width: slideWidth * (zoom / 100) }}>
            <div className="px-3 py-1 text-[11px] theme-text-muted border-b theme-border">Speaker notes</div>
            <textarea
              className="w-full p-3 bg-transparent outline-none min-h-[80px] text-xs theme-text-primary resize-none"
              placeholder="Add notes..."
            />
          </div>
        </div>
      </div>

      {/* Context Menu */}
      {pptxContextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setPptxContextMenu(null)} />
          <div
            className="fixed theme-bg-secondary theme-border border rounded shadow-lg py-1 z-50 text-sm min-w-[160px]"
            style={{ top: pptxContextMenu.y, left: pptxContextMenu.x }}
          >
            <button onClick={() => { document.execCommand('cut'); setPptxContextMenu(null); }} className="flex items-center gap-2 px-4 py-1.5 w-full text-left theme-hover text-xs">
              <Scissors size={12} /> Cut
            </button>
            <button onClick={() => { document.execCommand('copy'); setPptxContextMenu(null); }} className="flex items-center gap-2 px-4 py-1.5 w-full text-left theme-hover text-xs">
              <Copy size={12} /> Copy
            </button>
            <button onClick={() => { document.execCommand('paste'); setPptxContextMenu(null); }} className="flex items-center gap-2 px-4 py-1.5 w-full text-left theme-hover text-xs">
              <Plus size={12} /> Paste
            </button>
            <div className="border-t theme-border my-1" />
            <button onClick={() => { document.execCommand('bold'); setPptxContextMenu(null); }} className="flex items-center gap-2 px-4 py-1.5 w-full text-left theme-hover text-xs">
              <Bold size={12} /> Bold
            </button>
            <button onClick={() => { document.execCommand('italic'); setPptxContextMenu(null); }} className="flex items-center gap-2 px-4 py-1.5 w-full text-left theme-hover text-xs">
              <Italic size={12} /> Italic
            </button>
            <button onClick={() => { document.execCommand('underline'); setPptxContextMenu(null); }} className="flex items-center gap-2 px-4 py-1.5 w-full text-left theme-hover text-xs">
              <Underline size={12} /> Underline
            </button>
            <div className="border-t theme-border my-1" />
            <button onClick={() => { save(); setPptxContextMenu(null); }} className="flex items-center gap-2 px-4 py-1.5 w-full text-left theme-hover text-xs">
              <Save size={12} /> Save
            </button>
          </div>
        </>
      )}

      {/* Slide Navigator Context Menu */}
      {slideNavContextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setSlideNavContextMenu(null)} />
          <div
            className="fixed theme-bg-secondary theme-border border rounded shadow-lg py-1 z-50 text-sm min-w-[160px]"
            style={{ top: slideNavContextMenu.y, left: slideNavContextMenu.x }}
          >
            <button onClick={() => { addSlide(); setSlideNavContextMenu(null); }} className="flex items-center gap-2 px-4 py-1.5 w-full text-left theme-hover text-xs">
              <Plus size={12} /> Add Slide
            </button>
            <button onClick={() => { duplicateSlide(); setSlideNavContextMenu(null); }} className="flex items-center gap-2 px-4 py-1.5 w-full text-left theme-hover text-xs">
              <Copy size={12} /> Duplicate Slide
            </button>
            <div className="border-t theme-border my-1" />
            <button
              onClick={() => {
                if (slideNavContextMenu.slideIdx > 0) {
                  setSlides(prev => {
                    const next = [...prev];
                    [next[slideNavContextMenu.slideIdx - 1], next[slideNavContextMenu.slideIdx]] = [next[slideNavContextMenu.slideIdx], next[slideNavContextMenu.slideIdx - 1]];
                    return next;
                  });
                  setIdx(slideNavContextMenu.slideIdx - 1);
                  setHasChanges(true);
                }
                setSlideNavContextMenu(null);
              }}
              className={`flex items-center gap-2 px-4 py-1.5 w-full text-left theme-hover text-xs ${slideNavContextMenu.slideIdx === 0 ? 'opacity-30' : ''}`}
              disabled={slideNavContextMenu.slideIdx === 0}
            >
              <ChevronLeft size={12} /> Move Up
            </button>
            <button
              onClick={() => {
                if (slideNavContextMenu.slideIdx < slides.length - 1) {
                  setSlides(prev => {
                    const next = [...prev];
                    [next[slideNavContextMenu.slideIdx], next[slideNavContextMenu.slideIdx + 1]] = [next[slideNavContextMenu.slideIdx + 1], next[slideNavContextMenu.slideIdx]];
                    return next;
                  });
                  setIdx(slideNavContextMenu.slideIdx + 1);
                  setHasChanges(true);
                }
                setSlideNavContextMenu(null);
              }}
              className={`flex items-center gap-2 px-4 py-1.5 w-full text-left theme-hover text-xs ${slideNavContextMenu.slideIdx >= slides.length - 1 ? 'opacity-30' : ''}`}
              disabled={slideNavContextMenu.slideIdx >= slides.length - 1}
            >
              <ChevronRight size={12} /> Move Down
            </button>
            <div className="border-t theme-border my-1" />
            <button
              onClick={() => { deleteSlide(); setSlideNavContextMenu(null); }}
              disabled={slides.length <= 1}
              className={`flex items-center gap-2 px-4 py-1.5 w-full text-left theme-hover text-xs text-pink-400 ${slides.length <= 1 ? 'opacity-30' : ''}`}
            >
              <Trash2 size={12} /> Delete Slide
            </button>
          </div>
        </>
      )}

      {/* Status bar */}
      <div className="px-3 py-1 border-t theme-border theme-bg-tertiary text-[10px] text-gray-500 flex items-center justify-between">
        <span>Slide {idx + 1} of {slides.length}</span>
        <span>{hasChanges ? '● Unsaved changes' : 'Saved'}</span>
      </div>
    </div>
  );
};

// Custom comparison to prevent reload on pane resize
const arePropsEqual = (prevProps: any, nextProps: any) => {
    return prevProps.nodeId === nextProps.nodeId;
};

export default memo(PptxViewer, arePropsEqual);
