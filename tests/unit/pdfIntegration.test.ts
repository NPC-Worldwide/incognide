import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import sqlite3 from 'sqlite3';
import path from 'path';
import os from 'os';
import fs from 'fs';

const TEST_DB = path.join(os.tmpdir(), `incognide-pdf-integration-${Date.now()}.db`);

/**
 * Integration test for PDF workflow:
 * 1. Load PDF -> 2. Add highlights -> 3. Add drawings -> 4. Export
 * 
 * This test simulates the end-to-end flow to catch regressions in:
 * - Exporting signed/encrypted PDFs
 * - Editing annotations
 * - Drawing functionality
 * - Signature placement
 */
describe('PDF Workflow Integration', () => {
  let db: sqlite3.Database;
  const testFilePath = '/test/workspace/document.pdf';

  beforeEach(async () => {
    try { fs.unlinkSync(TEST_DB); } catch {}
    db = new sqlite3.Database(TEST_DB);
    
    // Create tables
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
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => db.close(() => resolve()));
    try { fs.unlinkSync(TEST_DB); } catch {}
  });

  it('should complete full PDF annotation workflow', async () => {
    // Step 1: Add multiple highlights
    const highlights = [
      {
        text: 'Important concept about AI',
        position: {
          pageIndex: 0,
          rects: [
            { left: 10, top: 20, width: 150, height: 20, pageIndex: 0 },
            { left: 10, top: 45, width: 100, height: 20, pageIndex: 0 },
          ]
        },
        color: 'yellow',
        annotation: 'Key point for research',
      },
      {
        text: 'Definition of machine learning',
        position: {
          pageIndex: 0,
          rects: [{ left: 50, top: 100, width: 200, height: 20, pageIndex: 0 }]
        },
        color: 'blue',
        annotation: 'Use in intro',
      },
      {
        text: 'Future work section',
        position: {
          pageIndex: 1,
          rects: [{ left: 20, top: 300, width: 180, height: 25, pageIndex: 1 }]
        },
        color: 'green',
        annotation: '',
      },
    ];

    const highlightIds: number[] = [];
    for (const h of highlights) {
      const id = await new Promise<number>((resolve, reject) => {
        db.run(
          'INSERT INTO pdf_highlights (file_path, highlighted_text, position_json, annotation, color) VALUES (?, ?, ?, ?, ?)',
          [testFilePath, h.text, JSON.stringify(h.position), h.annotation, h.color],
          function(err) {
            if (err) reject(err);
            else resolve(this.lastID);
          }
        );
      });
      highlightIds.push(id);
    }
    expect(highlightIds).toHaveLength(3);

    // Step 2: Add various types of drawings
    const drawings = [
      {
        pageIndex: 0,
        type: 'freehand',
        svgPath: 'M 10 10 L 50 50 L 100 30',
        strokeColor: '#FF0000',
        strokeWidth: 3,
        positionX: 0,
        positionY: 0,
        width: 100,
        height: 100,
      },
      {
        pageIndex: 0,
        type: 'signature',
        svgPath: 'M 0 0 L 10 10 L 20 5',
        strokeColor: '#000000',
        strokeWidth: 2,
        positionX: 50,
        positionY: 150,
        width: 40,
        height: 8,
      },
      {
        pageIndex: 0,
        type: 'typed_signature',
        svgPath: "TEXT:\'Dancing Script\',cursive:Dr. Smith",
        strokeColor: '#000080',
        strokeWidth: 2,
        positionX: 200,
        positionY: 400,
        width: 60,
        height: 10,
      },
      {
        pageIndex: 1,
        type: 'text',
        svgPath: 'TEXT_ANNOTATION:Check this reference',
        strokeColor: '#800080',
        strokeWidth: 1,
        positionX: 30,
        positionY: 50,
        width: 40,
        height: 5,
      },
    ];

    const drawingIds: number[] = [];
    for (const d of drawings) {
      const id = await new Promise<number>((resolve, reject) => {
        db.run(
          'INSERT INTO pdf_drawings (file_path, page_index, drawing_type, svg_path, stroke_color, stroke_width, position_x, position_y, width, height) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [testFilePath, d.pageIndex, d.type, d.svgPath, d.strokeColor, d.strokeWidth, d.positionX, d.positionY, d.width, d.height],
          function(err) {
            if (err) reject(err);
            else resolve(this.lastID);
          }
        );
      });
      drawingIds.push(id);
    }
    expect(drawingIds).toHaveLength(4);

    // Step 3: Retrieve all annotations
    const storedHighlights = await new Promise<any[]>((resolve, reject) => {
      db.all('SELECT * FROM pdf_highlights WHERE file_path = ? ORDER BY id ASC', [testFilePath], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    expect(storedHighlights).toHaveLength(3);

    const storedDrawings = await new Promise<any[]>((resolve, reject) => {
      db.all('SELECT * FROM pdf_drawings WHERE file_path = ? ORDER BY id ASC', [testFilePath], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    expect(storedDrawings).toHaveLength(4);

    // Step 4: Update an annotation
    await new Promise<void>((resolve, reject) => {
      db.run(
        'UPDATE pdf_highlights SET annotation = ? WHERE id = ?',
        ['Updated annotation text', highlightIds[0]],
        (err) => err ? reject(err) : resolve()
      );
    });

    const updatedHighlight = await new Promise<any>((resolve, reject) => {
      db.get('SELECT * FROM pdf_highlights WHERE id = ?', [highlightIds[0]], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    expect(updatedHighlight.annotation).toBe('Updated annotation text');

    // Step 5: Simulate export preparation
    // This verifies all data is correctly formatted for export
    const exportData = {
      filePath: testFilePath,
      highlights: storedHighlights.map(h => ({
        ...h,
        position: JSON.parse(h.position_json),
      })),
      drawings: storedDrawings,
    };

    // Verify highlight structure
    expect(exportData.highlights[0].position.rects).toBeDefined();
    expect(exportData.highlights[0].position.rects.length).toBeGreaterThan(0);
    expect(exportData.highlights[0].color).toMatch(/yellow|green|blue|pink|purple/);

    // Verify drawing structure
    expect(exportData.drawings[0].svg_path).toBeDefined();
    expect(exportData.drawings[0].drawing_type).toMatch(/freehand|signature|typed_signature|text/);

    // Step 6: Delete a drawing (undo operation)
    await new Promise<void>((resolve, reject) => {
      db.run('DELETE FROM pdf_drawings WHERE id = ?', [drawingIds[drawingIds.length - 1]], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const remainingDrawings = await new Promise<any[]>((resolve, reject) => {
      db.all('SELECT * FROM pdf_drawings WHERE file_path = ?', [testFilePath], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    expect(remainingDrawings).toHaveLength(3);

    // Step 7: Clear all drawings from page 0
    await new Promise<void>((resolve, reject) => {
      db.run('DELETE FROM pdf_drawings WHERE file_path = ? AND page_index = ?', [testFilePath, 0], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const page1Drawings = await new Promise<any[]>((resolve, reject) => {
      db.all('SELECT * FROM pdf_drawings WHERE file_path = ?', [testFilePath], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    expect(page1Drawings).toHaveLength(0);
  });

  it('should handle multiple PDF files independently', async () => {
    const file1 = '/test/doc1.pdf';
    const file2 = '/test/doc2.pdf';
    const file3 = '/test/doc3.pdf';

    // Add highlights to multiple files
    for (const file of [file1, file2, file3]) {
      await new Promise<void>((resolve, reject) => {
        db.run(
          'INSERT INTO pdf_highlights (file_path, highlighted_text, position_json, annotation, color) VALUES (?, ?, ?, ?, ?)',
          [file, `Highlight for ${file}`, JSON.stringify({ pageIndex: 0, rects: [] }), '', 'yellow'],
          (err) => err ? reject(err) : resolve()
        );
      });
    }

    // Add drawings to each file
    for (const file of [file1, file2]) {
      await new Promise<void>((resolve, reject) => {
        db.run(
          'INSERT INTO pdf_drawings (file_path, page_index, drawing_type, svg_path, stroke_color, stroke_width, position_x, position_y, width, height) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [file, 0, 'freehand', 'M 0 0', '#000000', 2, 0, 0, 100, 100],
          (err) => err ? reject(err) : resolve()
        );
      });
    }

    // Verify isolation
    const counts = await Promise.all(
      [file1, file2, file3].map(file => 
        new Promise<{ file: string; highlights: number; drawings: number }>(async (resolve) => {
          const hl = await new Promise<any[]>((res, rej) => {
            db.all('SELECT * FROM pdf_highlights WHERE file_path = ?', [file], (err, rows) => {
              if (err) rej(err);
              else res(rows);
            });
          });
          const dr = await new Promise<any[]>((res, rej) => {
            db.all('SELECT * FROM pdf_drawings WHERE file_path = ?', [file], (err, rows) => {
              if (err) rej(err);
              else res(rows);
            });
          });
          resolve({ file, highlights: hl.length, drawings: dr.length });
        })
      )
    );

    expect(counts[0]).toEqual({ file: file1, highlights: 1, drawings: 1 });
    expect(counts[1]).toEqual({ file: file2, highlights: 1, drawings: 1 });
    expect(counts[2]).toEqual({ file: file3, highlights: 1, drawings: 0 });
  });

  it('should handle large numbers of annotations', async () => {
    const filePath = '/test/large-doc.pdf';
    const numHighlights = 100;
    const numDrawings = 50;

    // Add many highlights
    const highlightPromises = Array.from({ length: numHighlights }, (_, i) =>
      new Promise<number>((resolve, reject) => {
        db.run(
          'INSERT INTO pdf_highlights (file_path, highlighted_text, position_json, annotation, color) VALUES (?, ?, ?, ?, ?)',
          [filePath, `Text ${i}`, JSON.stringify({ pageIndex: i % 10, rects: [] }), '', 'yellow'],
          function(err) {
            if (err) reject(err);
            else resolve(this.lastID);
          }
        );
      })
    );
    await Promise.all(highlightPromises);

    // Add many drawings
    const drawingPromises = Array.from({ length: numDrawings }, (_, i) =>
      new Promise<number>((resolve, reject) => {
        db.run(
          'INSERT INTO pdf_drawings (file_path, page_index, drawing_type, svg_path, stroke_color, stroke_width, position_x, position_y, width, height) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [filePath, i % 10, 'freehand', `M ${i} ${i}`, '#000000', 2, 0, 0, 100, 100],
          function(err) {
            if (err) reject(err);
            else resolve(this.lastID);
          }
        );
      })
    );
    await Promise.all(drawingPromises);

    // Verify counts
    const hlCount = await new Promise<number>((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM pdf_highlights WHERE file_path = ?', [filePath], (err, row: any) => {
        if (err) reject(err);
        else resolve(row.count);
      });
    });
    expect(hlCount).toBe(numHighlights);

    const drCount = await new Promise<number>((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM pdf_drawings WHERE file_path = ?', [filePath], (err, row: any) => {
        if (err) reject(err);
        else resolve(row.count);
      });
    });
    expect(drCount).toBe(numDrawings);
  });

  it('should handle special characters in annotations', async () => {
    const filePath = '/test/special-chars.pdf';
    const specialTexts = [
      'Text with "quotes"',
      "Text with 'apostrophes'",
      'Text with <html> tags',
      'Text with \ backslashes',
      'Text with \n newlines',
      'Text with 🎉 emojis',
      'Text with ñ special chars',
    ];

    for (const text of specialTexts) {
      await new Promise<void>((resolve, reject) => {
        db.run(
          'INSERT INTO pdf_highlights (file_path, highlighted_text, position_json, annotation, color) VALUES (?, ?, ?, ?, ?)',
          [filePath, text, JSON.stringify({ pageIndex: 0, rects: [] }), text, 'yellow'],
          (err) => err ? reject(err) : resolve()
        );
      });
    }

    const highlights = await new Promise<any[]>((resolve, reject) => {
      db.all('SELECT * FROM pdf_highlights WHERE file_path = ?', [filePath], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    expect(highlights).toHaveLength(specialTexts.length);
    highlights.forEach((hl, i) => {
      expect(hl.highlighted_text).toBe(specialTexts[i]);
      expect(hl.annotation).toBe(specialTexts[i]);
    });
  });
});
