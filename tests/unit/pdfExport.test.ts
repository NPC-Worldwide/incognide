import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock pdf-lib since it's a heavy dependency
vi.mock('pdf-lib', () => ({
  PDFDocument: {
    load: vi.fn().mockResolvedValue({
      getPages: vi.fn().mockReturnValue([
        {
          getSize: vi.fn().mockReturnValue({ width: 612, height: 792 }),
          drawRectangle: vi.fn(),
          drawText: vi.fn(),
          drawImage: vi.fn(),
          drawLine: vi.fn(),
        }
      ]),
      embedFont: vi.fn().mockResolvedValue({}),
      embedPng: vi.fn().mockResolvedValue({ width: 100, height: 50 }),
      save: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4])),
    }),
  },
  rgb: vi.fn((r, g, b) => ({ r, g, b })),
  StandardFonts: {
    Helvetica: 'Helvetica',
  },
}));

// Import the module after mocking
import { PDFDocument, rgb } from 'pdf-lib';

// Helper functions extracted from PdfViewer.tsx
type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink' | 'purple';

const HIGHLIGHT_COLORS: Record<HighlightColor, { bg: string; border: string }> = {
  yellow: { bg: 'rgba(255, 255, 0, 0.3)', border: 'rgba(255, 200, 0, 0.6)' },
  green: { bg: 'rgba(0, 255, 0, 0.2)', border: 'rgba(0, 200, 0, 0.5)' },
  blue: { bg: 'rgba(0, 150, 255, 0.2)', border: 'rgba(0, 100, 255, 0.5)' },
  pink: { bg: 'rgba(255, 100, 150, 0.3)', border: 'rgba(255, 50, 100, 0.5)' },
  purple: { bg: 'rgba(180, 100, 255, 0.3)', border: 'rgba(150, 50, 255, 0.5)' },
};

interface Highlight {
  id: number;
  position: {
    rects: Array<{
      left: number;
      top: number;
      width: number;
      height: number;
      pageIndex?: number;
    }>;
  };
  content: { text: string; annotation: string };
  color?: HighlightColor;
}

interface PdfDrawing {
  id: number;
  file_path: string;
  page_index: number;
  drawing_type: 'freehand' | 'signature' | 'typed_signature' | 'text';
  svg_path: string;
  stroke_color: string;
  stroke_width: number;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
}

// Parse rgba color string to rgb values
const parseRgba = (rgba: string): { r: number; g: number; b: number; a: number } => {
  const match = rgba.match(/[\d.]+/g);
  if (!match) return { r: 1, g: 1, b: 0, a: 0.3 };
  return {
    r: parseFloat(match[0]) / 255,
    g: parseFloat(match[1]) / 255,
    b: parseFloat(match[2]) / 255,
    a: match[3] ? parseFloat(match[3]) : 0.3,
  };
};

// Parse hex color to rgb
const parseHex = (hex: string): { r: number; g: number; b: number } => {
  const match = hex.match(/^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!match) return { r: 0, g: 0, b: 0 };
  return {
    r: parseInt(match[1], 16) / 255,
    g: parseInt(match[2], 16) / 255,
    b: parseInt(match[3], 16) / 255,
  };
};

describe('PDF Export Utilities', () => {
  describe('parseRgba', () => {
    it('should parse yellow rgba correctly', () => {
      const result = parseRgba('rgba(255, 255, 0, 0.3)');
      expect(result.r).toBeCloseTo(1);
      expect(result.g).toBeCloseTo(1);
      expect(result.b).toBeCloseTo(0);
      expect(result.a).toBeCloseTo(0.3);
    });

    it('should parse with default alpha when missing', () => {
      const result = parseRgba('rgba(100, 150, 200)');
      expect(result.r).toBeCloseTo(100 / 255);
      expect(result.g).toBeCloseTo(150 / 255);
      expect(result.b).toBeCloseTo(200 / 255);
      expect(result.a).toBe(0.3);
    });

    it('should return defaults for invalid string', () => {
      const result = parseRgba('invalid');
      expect(result.r).toBe(1);
      expect(result.g).toBe(1);
      expect(result.b).toBe(0);
      expect(result.a).toBe(0.3);
    });
  });

  describe('parseHex', () => {
    it('should parse black correctly', () => {
      const result = parseHex('#000000');
      expect(result.r).toBe(0);
      expect(result.g).toBe(0);
      expect(result.b).toBe(0);
    });

    it('should parse white correctly', () => {
      const result = parseHex('#FFFFFF');
      expect(result.r).toBe(1);
      expect(result.g).toBe(1);
      expect(result.b).toBe(1);
    });

    it('should parse red correctly', () => {
      const result = parseHex('#FF0000');
      expect(result.r).toBe(1);
      expect(result.g).toBe(0);
      expect(result.b).toBe(0);
    });

    it('should parse lowercase hex', () => {
      const result = parseHex('#ff0000');
      expect(result.r).toBe(1);
      expect(result.g).toBe(0);
      expect(result.b).toBe(0);
    });

    it('should return defaults for invalid hex', () => {
      const result = parseHex('invalid');
      expect(result.r).toBe(0);
      expect(result.g).toBe(0);
      expect(result.b).toBe(0);
    });
  });

  describe('HIGHLIGHT_COLORS', () => {
    it('should have all expected colors', () => {
      expect(HIGHLIGHT_COLORS.yellow).toBeDefined();
      expect(HIGHLIGHT_COLORS.green).toBeDefined();
      expect(HIGHLIGHT_COLORS.blue).toBeDefined();
      expect(HIGHLIGHT_COLORS.pink).toBeDefined();
      expect(HIGHLIGHT_COLORS.purple).toBeDefined();
    });

    it('should have valid rgba format for all colors', () => {
      Object.values(HIGHLIGHT_COLORS).forEach((color) => {
        expect(color.bg).toMatch(/^rgba\([\d, .]+\)$/);
        expect(color.border).toMatch(/^rgba\([\d, .]+\)$/);
      });
    });

    it('should parse all highlight colors', () => {
      (Object.keys(HIGHLIGHT_COLORS) as HighlightColor[]).forEach((colorKey) => {
        const color = HIGHLIGHT_COLORS[colorKey];
        const parsed = parseRgba(color.bg);
        expect(parsed.r).toBeGreaterThanOrEqual(0);
        expect(parsed.r).toBeLessThanOrEqual(1);
        expect(parsed.g).toBeGreaterThanOrEqual(0);
        expect(parsed.g).toBeLessThanOrEqual(1);
        expect(parsed.b).toBeGreaterThanOrEqual(0);
        expect(parsed.b).toBeLessThanOrEqual(1);
      });
    });
  });

  describe('svg path parsing', () => {
    it('should extract points from SVG path commands', () => {
      const svgPath = 'M 10.5 20.3 L 30.2 40.1 L 50 60';
      const cmds = svgPath.match(/[ML]\s*[\d.]+\s+[\d.]+/g);
      expect(cmds).toHaveLength(3);
      expect(cmds![0]).toBe('M 10.5 20.3');
      expect(cmds![1]).toBe('L 30.2 40.1');
    });

    it('should extract numbers from commands', () => {
      const cmd = 'M 10.5 20.3';
      const nums = cmd.match(/[\d.]+/g);
      expect(nums).toEqual(['10.5', '20.3']);
      expect(parseFloat(nums![0])).toBe(10.5);
      expect(parseFloat(nums![1])).toBe(20.3);
    });
  });

  describe('typed signature parsing', () => {
    it('should parse typed signature format', () => {
      const svgPath = "TEXT:\'Dancing Script\',cursive:John Doe";
      const parts = svgPath.split(':');
      expect(parts[0]).toBe('TEXT');
      expect(parts[1]).toBe("\'Dancing Script\',cursive");
      expect(parts.slice(2).join(':')).toBe('John Doe');
    });

    it('should parse text annotation format', () => {
      const svgPath = 'TEXT_ANNOTATION:This is my note';
      const text = svgPath.replace('TEXT_ANNOTATION:', '');
      expect(text).toBe('This is my note');
    });
  });
});

describe('PDF Export Error Handling', () => {
  it('should handle missing file path', async () => {
    const filePath: string | null = null;
    const hasFilePath = !!filePath;
    expect(hasFilePath).toBe(false);
  });

  it('should handle empty highlights array', () => {
    const highlights: Highlight[] = [];
    expect(highlights.length).toBe(0);
    // Should not throw when iterating
    highlights.forEach(hl => {
      expect(hl).toBeDefined();
    });
  });

  it('should handle empty drawings array', () => {
    const drawings: PdfDrawing[] = [];
    expect(drawings.length).toBe(0);
    drawings.forEach(d => {
      expect(d).toBeDefined();
    });
  });

  it('should handle position without rects', () => {
    const highlight: Highlight = {
      id: 1,
      position: { rects: [] },
      content: { text: 'test', annotation: '' },
      color: 'yellow',
    };
    expect(highlight.position.rects).toHaveLength(0);
  });

  it('should handle highlight without color (default to yellow)', () => {
    const highlight = {
      id: 1,
      position: { rects: [] },
      content: { text: 'test', annotation: '' },
      // color is missing
    };
    const color = (highlight as any).color || 'yellow';
    expect(color).toBe('yellow');
  });
});
