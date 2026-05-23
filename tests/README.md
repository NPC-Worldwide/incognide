# Test Suite Overview

## PDF Tests

This directory contains comprehensive tests for PDF functionality in Incognide.

### Test Files

#### 1. `pdfDatabase.test.ts`
Tests for PDF database operations including:
- Table schema validation
- Adding/retrieving/updating/deleting highlights
- Adding/retrieving/updating/deleting drawings
- Multi-page drawing operations
- Cross-file isolation
- Data integrity

**Coverage**: 20 tests

#### 2. `pdfExport.test.ts`
Tests for PDF export utilities including:
- Color parsing (RGBA and hex formats)
- SVG path parsing
- Typed signature format parsing
- Error handling for edge cases
- Empty data handling

**Coverage**: 20 tests

#### 3. `pdfIntegration.test.ts`
End-to-end workflow tests including:
- Full annotation workflow (load -> highlight -> draw -> export)
- Multiple PDF file handling
- Large dataset performance (100+ annotations)
- Special character handling in annotations
- Database persistence verification

**Coverage**: 4 tests

#### 4. `SignatureModal.test.tsx`
Component tests for the signature modal including:
- Render/unrender behavior
- Tab switching (Draw/Type)
- Canvas and color picker presence
- Save button state validation
- Close/cancel functionality

**Coverage**: 8 tests

### Running Tests

Run all PDF tests:
```bash
npm test -- tests/unit/pdf --run
```

Run individual test files:
```bash
npm test -- tests/unit/pdfDatabase.test.ts --run
npm test -- tests/unit/pdfExport.test.ts --run
npm test -- tests/unit/pdfIntegration.test.ts --run
npm test -- tests/unit/SignatureModal.test.tsx --run
```

Or use the test runner script:
```bash
node scripts/run-pdf-tests.js
```

### Regression Prevention

These tests help prevent regressions in:

1. **Exporting Signed PDFs**
   - Signature placement coordinates
   - Signature rendering with fonts
   - Signature size and position

2. **Editing Annotations**
   - Highlight CRUD operations
   - Color persistence
   - Text annotations
   - Comment bubbles

3. **Drawing Functionality**
   - Freehand drawing paths
   - Drawing persistence across sessions
   - Page-specific drawings
   - Drawing deletion

4. **Signature Features**
   - Drawing signatures on canvas
   - Typing signatures with fonts
   - Signature validation
   - Save/load signature data

### Database Schema

The tests validate the following tables:

**pdf_highlights**:
- id (INTEGER PRIMARY KEY)
- file_path (TEXT NOT NULL)
- highlighted_text (TEXT NOT NULL)
- position_json (TEXT NOT NULL)
- annotation (TEXT DEFAULT '')
- color (TEXT DEFAULT 'yellow')
- timestamp (DATETIME)

**pdf_drawings**:
- id (INTEGER PRIMARY KEY)
- file_path (TEXT NOT NULL)
- page_index (INTEGER NOT NULL)
- drawing_type (TEXT DEFAULT 'freehand')
- svg_path (TEXT NOT NULL)
- stroke_color (TEXT DEFAULT '#000000')
- stroke_width (REAL DEFAULT 2)
- position_x/y (REAL DEFAULT 0)
- width/height (REAL DEFAULT 100)
- timestamp (DATETIME)
