import { describe, it, expect, beforeEach, vi } from 'vitest';
import sqlite3 from 'sqlite3';
import path from 'path';
import os from 'os';
import fs from 'fs';

const TEST_DB = path.join(os.tmpdir(), `incognide-pdf-test-${Date.now()}.db`);

// Simulated database operations (similar to what database.js does)
const createPdfTables = async (db: sqlite3.Database) => {
  await new Promise<void>((resolve, reject) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS pdf_highlights (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          file_path TEXT NOT NULL,
          highlighted_text TEXT NOT NULL,
          position_json TEXT NOT NULL,
          annotation TEXT DEFAULT '',
          color TEXT DEFAULT 'yellow',
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS pdf_drawings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          file_path TEXT NOT NULL,
          page_index INTEGER NOT NULL,
          drawing_type TEXT NOT NULL DEFAULT 'freehand',
          svg_path TEXT NOT NULL,
          stroke_color TEXT DEFAULT '#000000',
          stroke_width REAL DEFAULT 2,
          position_x REAL DEFAULT 0,
          position_y REAL DEFAULT 0,
          width REAL DEFAULT 100,
          height REAL DEFAULT 100,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_file_path ON pdf_highlights(file_path);
      CREATE INDEX IF NOT EXISTS idx_pdf_drawings_file ON pdf_drawings(file_path);
    `, (err) => err ? reject(err) : resolve());
  });
};

const addPdfHighlight = async (
  db: sqlite3.Database,
  filePath: string,
  text: string,
  position: object,
  annotation: string = '',
  color: string = 'yellow'
): Promise<number> => {
  return new Promise((resolve, reject) => {
    const positionJson = JSON.stringify(position);
    db.run(
      'INSERT INTO pdf_highlights (file_path, highlighted_text, position_json, annotation, color) VALUES (?, ?, ?, ?, ?)',
      [filePath, text, positionJson, annotation, color],
      function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
  });
};

const getHighlightsForFile = async (db: sqlite3.Database, filePath: string) => {
  return new Promise<any[]>((resolve, reject) => {
    db.all('SELECT * FROM pdf_highlights WHERE file_path = ? ORDER BY id ASC', [filePath], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

const updatePdfHighlight = async (
  db: sqlite3.Database,
  id: number,
  annotation?: string,
  color?: string
) => {
  return new Promise<void>((resolve, reject) => {
    const updates: string[] = [];
    const params: any[] = [];
    
    if (annotation !== undefined) {
      updates.push('annotation = ?');
      params.push(annotation);
    }
    if (color !== undefined) {
      updates.push('color = ?');
      params.push(color);
    }
    
    if (updates.length === 0) {
      resolve();
      return;
    }
    
    params.push(id);
    db.run(`UPDATE pdf_highlights SET ${updates.join(', ')} WHERE id = ?`, params, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
};

const deletePdfHighlight = async (db: sqlite3.Database, id: number) => {
  return new Promise<void>((resolve, reject) => {
    db.run('DELETE FROM pdf_highlights WHERE id = ?', [id], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
};

const addPdfDrawing = async (
  db: sqlite3.Database,
  filePath: string,
  pageIndex: number,
  drawingType: string,
  svgPath: string,
  strokeColor: string = '#000000',
  strokeWidth: number = 2,
  positionX: number = 0,
  positionY: number = 0,
  width: number = 100,
  height: number = 100
): Promise<number> => {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO pdf_drawings (file_path, page_index, drawing_type, svg_path, stroke_color, stroke_width, position_x, position_y, width, height) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [filePath, pageIndex, drawingType, svgPath, strokeColor, strokeWidth, positionX, positionY, width, height],
      function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
  });
};

const getDrawingsForFile = async (db: sqlite3.Database, filePath: string) => {
  return new Promise<any[]>((resolve, reject) => {
    db.all('SELECT * FROM pdf_drawings WHERE file_path = ? ORDER BY id ASC', [filePath], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

const updatePdfDrawing = async (
  db: sqlite3.Database,
  id: number,
  updates: Partial<{
    positionX: number;
    positionY: number;
    width: number;
    height: number;
  }>
) => {
  return new Promise<void>((resolve, reject) => {
    const fields: string[] = [];
    const values: any[] = [];
    
    if (updates.positionX !== undefined) {
      fields.push('position_x = ?');
      values.push(updates.positionX);
    }
    if (updates.positionY !== undefined) {
      fields.push('position_y = ?');
      values.push(updates.positionY);
    }
    if (updates.width !== undefined) {
      fields.push('width = ?');
      values.push(updates.width);
    }
    if (updates.height !== undefined) {
      fields.push('height = ?');
      values.push(updates.height);
    }
    
    if (fields.length === 0) {
      resolve();
      return;
    }
    
    values.push(id);
    db.run(`UPDATE pdf_drawings SET ${fields.join(', ')} WHERE id = ?`, values, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
};

const deleteDrawing = async (db: sqlite3.Database, id: number) => {
  return new Promise<void>((resolve, reject) => {
    db.run('DELETE FROM pdf_drawings WHERE id = ?', [id], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
};

const clearDrawingsForPage = async (db: sqlite3.Database, filePath: string, pageIndex: number) => {
  return new Promise<void>((resolve, reject) => {
    db.run('DELETE FROM pdf_drawings WHERE file_path = ? AND page_index = ?', [filePath, pageIndex], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
};

describe('PDF Database Operations', () => {
  let db: sqlite3.Database;

  beforeEach(async () => {
    // Clean up and create fresh DB
    try { fs.unlinkSync(TEST_DB); } catch {}
    db = new sqlite3.Database(TEST_DB);
    await createPdfTables(db);
  });

  describe('pdf_highlights', () => {
    it('should create table with correct schema', async () => {
      const result = await new Promise<any>((resolve, reject) => {
        db.get("SELECT sql FROM sqlite_master WHERE name='pdf_highlights' AND type='table'", (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
      expect(result.sql).toContain('id INTEGER PRIMARY KEY');
      expect(result.sql).toContain('file_path TEXT NOT NULL');
      expect(result.sql).toContain('highlighted_text TEXT NOT NULL');
      expect(result.sql).toContain('position_json TEXT NOT NULL');
      expect(result.sql).toContain('color TEXT');
    });

    it('should add a highlight', async () => {
      const filePath = '/test/document.pdf';
      const text = 'Important text';
      const position = { pageIndex: 0, rects: [{ left: 10, top: 20, width: 100, height: 20 }] };
      
      const id = await addPdfHighlight(db, filePath, text, position);
      expect(id).toBeGreaterThan(0);
      
      const highlights = await getHighlightsForFile(db, filePath);
      expect(highlights).toHaveLength(1);
      expect(highlights[0].highlighted_text).toBe(text);
      expect(JSON.parse(highlights[0].position_json)).toEqual(position);
      expect(highlights[0].color).toBe('yellow');
    });

    it('should add highlight with custom color', async () => {
      const filePath = '/test/document.pdf';
      const position = { pageIndex: 0, rects: [] };
      
      await addPdfHighlight(db, filePath, 'text', position, '', 'blue');
      
      const highlights = await getHighlightsForFile(db, filePath);
      expect(highlights[0].color).toBe('blue');
    });

    it('should add highlight with annotation', async () => {
      const filePath = '/test/document.pdf';
      const position = { pageIndex: 0, rects: [] };
      
      await addPdfHighlight(db, filePath, 'text', position, 'This is my note');
      
      const highlights = await getHighlightsForFile(db, filePath);
      expect(highlights[0].annotation).toBe('This is my note');
    });

    it('should update highlight annotation', async () => {
      const filePath = '/test/document.pdf';
      const position = { pageIndex: 0, rects: [] };
      
      const id = await addPdfHighlight(db, filePath, 'text', position, 'old note');
      await updatePdfHighlight(db, id, 'new note');
      
      const highlights = await getHighlightsForFile(db, filePath);
      expect(highlights[0].annotation).toBe('new note');
    });

    it('should update highlight color', async () => {
      const filePath = '/test/document.pdf';
      const position = { pageIndex: 0, rects: [] };
      
      const id = await addPdfHighlight(db, filePath, 'text', position, '', 'yellow');
      await updatePdfHighlight(db, id, undefined, 'pink');
      
      const highlights = await getHighlightsForFile(db, filePath);
      expect(highlights[0].color).toBe('pink');
    });

    it('should delete highlight', async () => {
      const filePath = '/test/document.pdf';
      const position = { pageIndex: 0, rects: [] };
      
      const id = await addPdfHighlight(db, filePath, 'text', position);
      await deletePdfHighlight(db, id);
      
      const highlights = await getHighlightsForFile(db, filePath);
      expect(highlights).toHaveLength(0);
    });

    it('should handle position with multiple rects', async () => {
      const filePath = '/test/document.pdf';
      const position = {
        pageIndex: 0,
        rects: [
          { left: 10, top: 20, width: 100, height: 20, pageIndex: 0 },
          { left: 10, top: 50, width: 100, height: 20, pageIndex: 0 },
        ]
      };
      
      await addPdfHighlight(db, filePath, 'multi-line text', position);
      
      const highlights = await getHighlightsForFile(db, filePath);
      const parsedPosition = JSON.parse(highlights[0].position_json);
      expect(parsedPosition.rects).toHaveLength(2);
    });
  });

  describe('pdf_drawings', () => {
    it('should create table with correct schema', async () => {
      const result = await new Promise<any>((resolve, reject) => {
        db.get("SELECT sql FROM sqlite_master WHERE name='pdf_drawings' AND type='table'", (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
      expect(result.sql).toContain('id INTEGER PRIMARY KEY');
      expect(result.sql).toContain('file_path TEXT NOT NULL');
      expect(result.sql).toContain('page_index INTEGER NOT NULL');
      expect(result.sql).toContain('drawing_type TEXT');
      expect(result.sql).toContain('svg_path TEXT NOT NULL');
    });

    it('should add a freehand drawing', async () => {
      const filePath = '/test/document.pdf';
      const svgPath = 'M 10 20 L 30 40 L 50 60';
      
      const id = await addPdfDrawing(db, filePath, 0, 'freehand', svgPath, '#FF0000', 3);
      
      const drawings = await getDrawingsForFile(db, filePath);
      expect(drawings).toHaveLength(1);
      expect(drawings[0].svg_path).toBe(svgPath);
      expect(drawings[0].stroke_color).toBe('#FF0000');
      expect(drawings[0].stroke_width).toBe(3);
      expect(drawings[0].drawing_type).toBe('freehand');
    });

    it('should add a signature drawing', async () => {
      const filePath = '/test/document.pdf';
      const svgPath = 'M 0 0 L 10 10';
      
      await addPdfDrawing(db, filePath, 1, 'signature', svgPath, '#000000', 2, 25, 50, 40, 8);
      
      const drawings = await getDrawingsForFile(db, filePath);
      expect(drawings[0].drawing_type).toBe('signature');
      expect(drawings[0].page_index).toBe(1);
      expect(drawings[0].position_x).toBe(25);
      expect(drawings[0].position_y).toBe(50);
      expect(drawings[0].width).toBe(40);
      expect(drawings[0].height).toBe(8);
    });

    it('should add a typed signature', async () => {
      const filePath = '/test/document.pdf';
      const svgPath = "TEXT:'Dancing Script',cursive:John Doe";
      
      await addPdfDrawing(db, filePath, 0, 'typed_signature', svgPath, '#000000', 2, 30, 40, 50, 10);
      
      const drawings = await getDrawingsForFile(db, filePath);
      expect(drawings[0].drawing_type).toBe('typed_signature');
      expect(drawings[0].svg_path).toContain('John Doe');
    });

    it('should add text annotation', async () => {
      const filePath = '/test/document.pdf';
      const svgPath = 'TEXT_ANNOTATION:This is a note';
      
      await addPdfDrawing(db, filePath, 0, 'text', svgPath, '#0000FF', 1, 10, 20, 30, 5);
      
      const drawings = await getDrawingsForFile(db, filePath);
      expect(drawings[0].drawing_type).toBe('text');
    });

    it('should update drawing position and size', async () => {
      const filePath = '/test/document.pdf';
      const svgPath = 'M 0 0 L 10 10';
      
      const id = await addPdfDrawing(db, filePath, 0, 'signature', svgPath, '#000000', 2, 10, 20, 30, 5);
      await updatePdfDrawing(db, id, { positionX: 50, positionY: 60, width: 80, height: 10 });
      
      const drawings = await getDrawingsForFile(db, filePath);
      expect(drawings[0].position_x).toBe(50);
      expect(drawings[0].position_y).toBe(60);
      expect(drawings[0].width).toBe(80);
      expect(drawings[0].height).toBe(10);
    });

    it('should delete drawing', async () => {
      const filePath = '/test/document.pdf';
      const svgPath = 'M 0 0 L 10 10';
      
      const id = await addPdfDrawing(db, filePath, 0, 'freehand', svgPath);
      await deleteDrawing(db, id);
      
      const drawings = await getDrawingsForFile(db, filePath);
      expect(drawings).toHaveLength(0);
    });

    it('should clear all drawings for a page', async () => {
      const filePath = '/test/document.pdf';
      
      await addPdfDrawing(db, filePath, 0, 'freehand', 'M 0 0');
      await addPdfDrawing(db, filePath, 0, 'signature', 'M 0 0', '#000000', 2, 10, 20, 30, 5);
      await addPdfDrawing(db, filePath, 1, 'freehand', 'M 0 0');
      
      await clearDrawingsForPage(db, filePath, 0);
      
      const drawings = await getDrawingsForFile(db, filePath);
      expect(drawings).toHaveLength(1);
      expect(drawings[0].page_index).toBe(1);
    });

    it('should return drawings ordered by id', async () => {
      const filePath = '/test/document.pdf';
      
      await addPdfDrawing(db, filePath, 0, 'freehand', 'first');
      await addPdfDrawing(db, filePath, 0, 'freehand', 'second');
      await addPdfDrawing(db, filePath, 0, 'freehand', 'third');
      
      const drawings = await getDrawingsForFile(db, filePath);
      expect(drawings[0].svg_path).toBe('first');
      expect(drawings[1].svg_path).toBe('second');
      expect(drawings[2].svg_path).toBe('third');
    });
  });

  describe('complex scenarios', () => {
    it('should handle multiple files independently', async () => {
      const file1 = '/test/doc1.pdf';
      const file2 = '/test/doc2.pdf';
      
      await addPdfHighlight(db, file1, 'text1', { pageIndex: 0, rects: [] });
      await addPdfHighlight(db, file2, 'text2', { pageIndex: 0, rects: [] });
      await addPdfDrawing(db, file1, 0, 'freehand', 'path1');
      await addPdfDrawing(db, file2, 0, 'freehand', 'path2');
      
      const highlights1 = await getHighlightsForFile(db, file1);
      const highlights2 = await getHighlightsForFile(db, file2);
      const drawings1 = await getDrawingsForFile(db, file1);
      const drawings2 = await getDrawingsForFile(db, file2);
      
      expect(highlights1).toHaveLength(1);
      expect(highlights1[0].highlighted_text).toBe('text1');
      expect(highlights2).toHaveLength(1);
      expect(highlights2[0].highlighted_text).toBe('text2');
      expect(drawings1[0].svg_path).toBe('path1');
      expect(drawings2[0].svg_path).toBe('path2');
    });

    it('should handle empty highlights for file', async () => {
      const highlights = await getHighlightsForFile(db, '/nonexistent.pdf');
      expect(highlights).toHaveLength(0);
    });

    it('should handle empty drawings for file', async () => {
      const drawings = await getDrawingsForFile(db, '/nonexistent.pdf');
      expect(drawings).toHaveLength(0);
    });
  });
});
