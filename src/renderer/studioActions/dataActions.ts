/**
 * Data Actions
 *
 * Actions for manipulating data viewers (CSV/XLSX, DOCX, PPTX):
 * - Spreadsheet: read, eval, update cells, add/delete rows/columns, sort, filter, stats, save, export
 * - Document: read, eval, write, insert, format, find/replace, table, save, export, stats
 * - Presentation: read, read slide, eval, navigate, update text, add/delete/duplicate slide, background, shape, save
 */

import { registerAction, StudioContext, StudioActionResult } from './index';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolvePane(
  args: { paneId?: string },
  ctx: StudioContext,
  expectedTypes: string[]
): { paneId: string; data: any } | StudioActionResult {
  const paneId = args.paneId === 'active' || !args.paneId
    ? ctx.activeContentPaneId
    : args.paneId;

  const data = ctx.contentDataRef.current[paneId];
  if (!data) {
    return { success: false, error: `Pane not found: ${paneId}` };
  }
  if (!expectedTypes.includes(data.contentType)) {
    return {
      success: false,
      error: `Pane is '${data.contentType}', expected one of: ${expectedTypes.join(', ')}`
    };
  }
  return { paneId, data };
}

function isError(result: any): result is StudioActionResult {
  return 'success' in result && result.success === false;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SPREADSHEET ACTIONS (csv/xlsx)
// ═══════════════════════════════════════════════════════════════════════════════

async function spreadsheet_read(
  args: { paneId?: string; maxRows?: number; includeStats?: boolean },
  ctx: StudioContext
): Promise<StudioActionResult> {
  const resolved = resolvePane(args, ctx, ['csv']);
  if (isError(resolved)) return resolved;
  const { paneId, data } = resolved;

  if (!data.readSpreadsheetData) {
    return { success: false, error: 'Spreadsheet read not available for this pane' };
  }

  const result = await data.readSpreadsheetData({
    maxRows: args.maxRows,
    includeStats: args.includeStats,
  });
  return { ...result, paneId };
}

async function spreadsheet_eval(
  args: { paneId?: string; code: string },
  ctx: StudioContext
): Promise<StudioActionResult> {
  if (!args.code) return { success: false, error: 'code is required' };

  const resolved = resolvePane(args, ctx, ['csv']);
  if (isError(resolved)) return resolved;
  const { paneId, data } = resolved;

  if (!data.evalSpreadsheet) {
    return { success: false, error: 'Spreadsheet eval not available for this pane' };
  }

  const result = await data.evalSpreadsheet(args.code);
  return { ...result, paneId };
}

async function spreadsheet_update_cell(
  args: { paneId?: string; row: number; col: number; value: any },
  ctx: StudioContext
): Promise<StudioActionResult> {
  const resolved = resolvePane(args, ctx, ['csv']);
  if (isError(resolved)) return resolved;
  const { paneId, data } = resolved;

  if (!data.updateSpreadsheetCell) {
    return { success: false, error: 'Cell update not available for this pane' };
  }

  const result = await data.updateSpreadsheetCell(args.row, args.col, args.value);
  return { ...result, paneId };
}

async function spreadsheet_update_cells(
  args: { paneId?: string; updates: { row: number; col: number; value: any }[] },
  ctx: StudioContext
): Promise<StudioActionResult> {
  if (!args.updates?.length) return { success: false, error: 'updates array is required' };

  const resolved = resolvePane(args, ctx, ['csv']);
  if (isError(resolved)) return resolved;
  const { paneId, data } = resolved;

  if (!data.updateSpreadsheetCells) {
    return { success: false, error: 'Batch cell update not available for this pane' };
  }

  const result = await data.updateSpreadsheetCells(args.updates);
  return { ...result, paneId };
}

async function spreadsheet_update_header(
  args: { paneId?: string; col: number; value: string },
  ctx: StudioContext
): Promise<StudioActionResult> {
  const resolved = resolvePane(args, ctx, ['csv']);
  if (isError(resolved)) return resolved;
  const { paneId, data } = resolved;

  if (!data.updateSpreadsheetHeader) {
    return { success: false, error: 'Header update not available' };
  }

  const result = await data.updateSpreadsheetHeader(args.col, args.value);
  return { ...result, paneId };
}

async function spreadsheet_add_row(
  args: { paneId?: string; index?: number },
  ctx: StudioContext
): Promise<StudioActionResult> {
  const resolved = resolvePane(args, ctx, ['csv']);
  if (isError(resolved)) return resolved;
  const { paneId, data } = resolved;

  if (!data.addSpreadsheetRow) {
    return { success: false, error: 'Add row not available' };
  }

  const result = await data.addSpreadsheetRow(args.index);
  return { ...result, paneId };
}

async function spreadsheet_delete_row(
  args: { paneId?: string; index: number },
  ctx: StudioContext
): Promise<StudioActionResult> {
  const resolved = resolvePane(args, ctx, ['csv']);
  if (isError(resolved)) return resolved;
  const { paneId, data } = resolved;

  if (!data.deleteSpreadsheetRow) {
    return { success: false, error: 'Delete row not available' };
  }

  const result = await data.deleteSpreadsheetRow(args.index);
  return { ...result, paneId };
}

async function spreadsheet_add_column(
  args: { paneId?: string; name?: string },
  ctx: StudioContext
): Promise<StudioActionResult> {
  const resolved = resolvePane(args, ctx, ['csv']);
  if (isError(resolved)) return resolved;
  const { paneId, data } = resolved;

  if (!data.addSpreadsheetColumn) {
    return { success: false, error: 'Add column not available' };
  }

  const result = await data.addSpreadsheetColumn(args.name);
  return { ...result, paneId };
}

async function spreadsheet_delete_column(
  args: { paneId?: string; col: number },
  ctx: StudioContext
): Promise<StudioActionResult> {
  const resolved = resolvePane(args, ctx, ['csv']);
  if (isError(resolved)) return resolved;
  const { paneId, data } = resolved;

  if (!data.deleteSpreadsheetColumn) {
    return { success: false, error: 'Delete column not available' };
  }

  const result = await data.deleteSpreadsheetColumn(args.col);
  return { ...result, paneId };
}

async function spreadsheet_sort(
  args: { paneId?: string; col: number; direction?: 'asc' | 'desc' },
  ctx: StudioContext
): Promise<StudioActionResult> {
  const resolved = resolvePane(args, ctx, ['csv']);
  if (isError(resolved)) return resolved;
  const { paneId, data } = resolved;

  if (!data.sortSpreadsheet) {
    return { success: false, error: 'Sort not available' };
  }

  const result = await data.sortSpreadsheet(args.col, args.direction || 'asc');
  return { ...result, paneId };
}

async function spreadsheet_filter(
  args: { paneId?: string; col: number; value: string },
  ctx: StudioContext
): Promise<StudioActionResult> {
  const resolved = resolvePane(args, ctx, ['csv']);
  if (isError(resolved)) return resolved;
  const { paneId, data } = resolved;

  if (!data.filterSpreadsheet) {
    return { success: false, error: 'Filter not available' };
  }

  const result = await data.filterSpreadsheet(args.col, args.value);
  return { ...result, paneId };
}

async function spreadsheet_clear_filters(
  args: { paneId?: string },
  ctx: StudioContext
): Promise<StudioActionResult> {
  const resolved = resolvePane(args, ctx, ['csv']);
  if (isError(resolved)) return resolved;
  const { paneId, data } = resolved;

  if (!data.clearSpreadsheetFilters) {
    return { success: false, error: 'Clear filters not available' };
  }

  const result = await data.clearSpreadsheetFilters();
  return { ...result, paneId };
}

async function spreadsheet_stats(
  args: { paneId?: string; col: number },
  ctx: StudioContext
): Promise<StudioActionResult> {
  const resolved = resolvePane(args, ctx, ['csv']);
  if (isError(resolved)) return resolved;
  const { paneId, data } = resolved;

  if (!data.getSpreadsheetColumnStats) {
    return { success: false, error: 'Stats not available' };
  }

  const result = await data.getSpreadsheetColumnStats(args.col);
  return { ...result, paneId };
}

async function spreadsheet_save(
  args: { paneId?: string },
  ctx: StudioContext
): Promise<StudioActionResult> {
  const resolved = resolvePane(args, ctx, ['csv']);
  if (isError(resolved)) return resolved;
  const { paneId, data } = resolved;

  if (!data.saveSpreadsheet) {
    return { success: false, error: 'Save not available' };
  }

  const result = await data.saveSpreadsheet();
  return { ...result, paneId };
}

async function spreadsheet_export(
  args: { paneId?: string; format?: 'csv' | 'json' | 'xlsx' },
  ctx: StudioContext
): Promise<StudioActionResult> {
  const resolved = resolvePane(args, ctx, ['csv']);
  if (isError(resolved)) return resolved;
  const { paneId, data } = resolved;

  if (!data.exportSpreadsheet) {
    return { success: false, error: 'Export not available' };
  }

  const result = await data.exportSpreadsheet(args.format || 'csv');
  return { ...result, paneId };
}

async function spreadsheet_switch_sheet(
  args: { paneId?: string; sheetName: string },
  ctx: StudioContext
): Promise<StudioActionResult> {
  if (!args.sheetName) return { success: false, error: 'sheetName is required' };

  const resolved = resolvePane(args, ctx, ['csv']);
  if (isError(resolved)) return resolved;
  const { paneId, data } = resolved;

  if (!data.switchSpreadsheetSheet) {
    return { success: false, error: 'Sheet switching not available (not an xlsx file?)' };
  }

  const result = await data.switchSpreadsheetSheet(args.sheetName);
  return { ...result, paneId };
}

// ═══════════════════════════════════════════════════════════════════════════════
// DOCUMENT ACTIONS (docx)
// ═══════════════════════════════════════════════════════════════════════════════

async function document_read(
  args: { paneId?: string; format?: 'text' | 'html' },
  ctx: StudioContext
): Promise<StudioActionResult> {
  const resolved = resolvePane(args, ctx, ['docx']);
  if (isError(resolved)) return resolved;
  const { paneId, data } = resolved;

  if (!data.readDocumentContent) {
    return { success: false, error: 'Document read not available' };
  }

  const result = await data.readDocumentContent({ format: args.format });
  return { ...result, paneId };
}

async function document_eval(
  args: { paneId?: string; code: string },
  ctx: StudioContext
): Promise<StudioActionResult> {
  if (!args.code) return { success: false, error: 'code is required' };

  const resolved = resolvePane(args, ctx, ['docx']);
  if (isError(resolved)) return resolved;
  const { paneId, data } = resolved;

  if (!data.evalDocument) {
    return { success: false, error: 'Document eval not available' };
  }

  const result = await data.evalDocument(args.code);
  return { ...result, paneId };
}

async function document_write(
  args: { paneId?: string; content: string; position?: 'replace' | 'end' | 'start' | 'cursor' },
  ctx: StudioContext
): Promise<StudioActionResult> {
  if (args.content === undefined) return { success: false, error: 'content is required' };

  const resolved = resolvePane(args, ctx, ['docx']);
  if (isError(resolved)) return resolved;
  const { paneId, data } = resolved;

  const position = args.position || 'replace';

  if (position === 'replace') {
    if (!data.writeDocumentContent) {
      return { success: false, error: 'Document write not available' };
    }
    const result = await data.writeDocumentContent(args.content);
    return { ...result, paneId };
  } else {
    if (!data.insertDocumentContent) {
      return { success: false, error: 'Document insert not available' };
    }
    const result = await data.insertDocumentContent(args.content, position);
    return { ...result, paneId };
  }
}

async function document_format(
  args: { paneId?: string; command: string; value?: string },
  ctx: StudioContext
): Promise<StudioActionResult> {
  if (!args.command) return { success: false, error: 'command is required' };

  const resolved = resolvePane(args, ctx, ['docx']);
  if (isError(resolved)) return resolved;
  const { paneId, data } = resolved;

  if (!data.formatDocument) {
    return { success: false, error: 'Document format not available' };
  }

  const result = await data.formatDocument(args.command, args.value);
  return { ...result, paneId };
}

async function document_find_replace(
  args: { paneId?: string; search: string; replace?: string; replaceAll?: boolean },
  ctx: StudioContext
): Promise<StudioActionResult> {
  if (!args.search) return { success: false, error: 'search is required' };

  const resolved = resolvePane(args, ctx, ['docx']);
  if (isError(resolved)) return resolved;
  const { paneId, data } = resolved;

  if (args.replace !== undefined) {
    if (!data.replaceInDocument) {
      return { success: false, error: 'Find/replace not available' };
    }
    const result = await data.replaceInDocument(args.search, args.replace, args.replaceAll !== false);
    return { ...result, paneId };
  } else {
    if (!data.findInDocument) {
      return { success: false, error: 'Find not available' };
    }
    const result = await data.findInDocument(args.search);
    return { ...result, paneId };
  }
}

async function document_insert_table(
  args: { paneId?: string; rows: number; cols: number },
  ctx: StudioContext
): Promise<StudioActionResult> {
  if (!args.rows || !args.cols) return { success: false, error: 'rows and cols are required' };

  const resolved = resolvePane(args, ctx, ['docx']);
  if (isError(resolved)) return resolved;
  const { paneId, data } = resolved;

  if (!data.insertDocumentTable) {
    return { success: false, error: 'Table insert not available' };
  }

  const result = await data.insertDocumentTable(args.rows, args.cols);
  return { ...result, paneId };
}

async function document_save(
  args: { paneId?: string },
  ctx: StudioContext
): Promise<StudioActionResult> {
  const resolved = resolvePane(args, ctx, ['docx']);
  if (isError(resolved)) return resolved;
  const { paneId, data } = resolved;

  if (!data.saveDocument) {
    return { success: false, error: 'Save not available' };
  }

  const result = await data.saveDocument();
  return { ...result, paneId };
}

async function document_stats(
  args: { paneId?: string },
  ctx: StudioContext
): Promise<StudioActionResult> {
  const resolved = resolvePane(args, ctx, ['docx']);
  if (isError(resolved)) return resolved;
  const { paneId, data } = resolved;

  if (!data.getDocumentStats) {
    return { success: false, error: 'Stats not available' };
  }

  const result = await data.getDocumentStats();
  return { ...result, paneId };
}

async function document_export(
  args: { paneId?: string; format?: 'html' | 'markdown' },
  ctx: StudioContext
): Promise<StudioActionResult> {
  const resolved = resolvePane(args, ctx, ['docx']);
  if (isError(resolved)) return resolved;
  const { paneId, data } = resolved;

  if (!data.exportDocumentAs) {
    return { success: false, error: 'Export not available' };
  }

  const result = await data.exportDocumentAs(args.format || 'html');
  return { ...result, paneId };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PRESENTATION ACTIONS (pptx)
// ═══════════════════════════════════════════════════════════════════════════════

async function presentation_read(
  args: { paneId?: string },
  ctx: StudioContext
): Promise<StudioActionResult> {
  const resolved = resolvePane(args, ctx, ['pptx']);
  if (isError(resolved)) return resolved;
  const { paneId, data } = resolved;

  if (!data.readPresentation) {
    return { success: false, error: 'Presentation read not available' };
  }

  const result = await data.readPresentation();
  return { ...result, paneId };
}

async function presentation_read_slide(
  args: { paneId?: string; slideIndex?: number },
  ctx: StudioContext
): Promise<StudioActionResult> {
  const resolved = resolvePane(args, ctx, ['pptx']);
  if (isError(resolved)) return resolved;
  const { paneId, data } = resolved;

  if (!data.readSlide) {
    return { success: false, error: 'Slide read not available' };
  }

  const result = await data.readSlide(args.slideIndex);
  return { ...result, paneId };
}

async function presentation_eval(
  args: { paneId?: string; code: string },
  ctx: StudioContext
): Promise<StudioActionResult> {
  if (!args.code) return { success: false, error: 'code is required' };

  const resolved = resolvePane(args, ctx, ['pptx']);
  if (isError(resolved)) return resolved;
  const { paneId, data } = resolved;

  if (!data.evalPresentation) {
    return { success: false, error: 'Presentation eval not available' };
  }

  const result = await data.evalPresentation(args.code);
  return { ...result, paneId };
}

async function presentation_go_to_slide(
  args: { paneId?: string; slideIndex: number },
  ctx: StudioContext
): Promise<StudioActionResult> {
  const resolved = resolvePane(args, ctx, ['pptx']);
  if (isError(resolved)) return resolved;
  const { paneId, data } = resolved;

  if (!data.goToSlide) {
    return { success: false, error: 'Slide navigation not available' };
  }

  const result = await data.goToSlide(args.slideIndex);
  return { ...result, paneId };
}

async function presentation_update_text(
  args: { paneId?: string; shapeIndex: number; text: string; slideIndex?: number },
  ctx: StudioContext
): Promise<StudioActionResult> {
  if (args.text === undefined) return { success: false, error: 'text is required' };

  const resolved = resolvePane(args, ctx, ['pptx']);
  if (isError(resolved)) return resolved;
  const { paneId, data } = resolved;

  if (!data.updateSlideText) {
    return { success: false, error: 'Text update not available' };
  }

  const result = await data.updateSlideText(args.shapeIndex, args.text, args.slideIndex);
  return { ...result, paneId };
}

async function presentation_add_slide(
  args: { paneId?: string },
  ctx: StudioContext
): Promise<StudioActionResult> {
  const resolved = resolvePane(args, ctx, ['pptx']);
  if (isError(resolved)) return resolved;
  const { paneId, data } = resolved;

  if (!data.addPresentationSlide) {
    return { success: false, error: 'Add slide not available' };
  }

  const result = await data.addPresentationSlide();
  return { ...result, paneId };
}

async function presentation_delete_slide(
  args: { paneId?: string; slideIndex?: number },
  ctx: StudioContext
): Promise<StudioActionResult> {
  const resolved = resolvePane(args, ctx, ['pptx']);
  if (isError(resolved)) return resolved;
  const { paneId, data } = resolved;

  if (!data.deletePresentationSlide) {
    return { success: false, error: 'Delete slide not available' };
  }

  const result = await data.deletePresentationSlide(args.slideIndex);
  return { ...result, paneId };
}

async function presentation_duplicate_slide(
  args: { paneId?: string; slideIndex?: number },
  ctx: StudioContext
): Promise<StudioActionResult> {
  const resolved = resolvePane(args, ctx, ['pptx']);
  if (isError(resolved)) return resolved;
  const { paneId, data } = resolved;

  if (!data.duplicatePresentationSlide) {
    return { success: false, error: 'Duplicate slide not available' };
  }

  const result = await data.duplicatePresentationSlide(args.slideIndex);
  return { ...result, paneId };
}

async function presentation_set_background(
  args: { paneId?: string; color: string },
  ctx: StudioContext
): Promise<StudioActionResult> {
  if (!args.color) return { success: false, error: 'color is required' };

  const resolved = resolvePane(args, ctx, ['pptx']);
  if (isError(resolved)) return resolved;
  const { paneId, data } = resolved;

  if (!data.setPresentationSlideBackground) {
    return { success: false, error: 'Background change not available' };
  }

  const result = await data.setPresentationSlideBackground(args.color);
  return { ...result, paneId };
}

async function presentation_add_shape(
  args: { paneId?: string; shapeType: string; color?: string },
  ctx: StudioContext
): Promise<StudioActionResult> {
  if (!args.shapeType) return { success: false, error: 'shapeType is required' };

  const resolved = resolvePane(args, ctx, ['pptx']);
  if (isError(resolved)) return resolved;
  const { paneId, data } = resolved;

  if (!data.addPresentationShape) {
    return { success: false, error: 'Add shape not available' };
  }

  const result = await data.addPresentationShape(args.shapeType, args.color);
  return { ...result, paneId };
}

async function presentation_save(
  args: { paneId?: string },
  ctx: StudioContext
): Promise<StudioActionResult> {
  const resolved = resolvePane(args, ctx, ['pptx']);
  if (isError(resolved)) return resolved;
  const { paneId, data } = resolved;

  if (!data.savePresentation) {
    return { success: false, error: 'Save not available' };
  }

  const result = await data.savePresentation();
  return { ...result, paneId };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Register all data actions
// ═══════════════════════════════════════════════════════════════════════════════

// Spreadsheet
registerAction('spreadsheet_read', spreadsheet_read);
registerAction('spreadsheet_eval', spreadsheet_eval);
registerAction('spreadsheet_update_cell', spreadsheet_update_cell);
registerAction('spreadsheet_update_cells', spreadsheet_update_cells);
registerAction('spreadsheet_update_header', spreadsheet_update_header);
registerAction('spreadsheet_add_row', spreadsheet_add_row);
registerAction('spreadsheet_delete_row', spreadsheet_delete_row);
registerAction('spreadsheet_add_column', spreadsheet_add_column);
registerAction('spreadsheet_delete_column', spreadsheet_delete_column);
registerAction('spreadsheet_sort', spreadsheet_sort);
registerAction('spreadsheet_filter', spreadsheet_filter);
registerAction('spreadsheet_clear_filters', spreadsheet_clear_filters);
registerAction('spreadsheet_stats', spreadsheet_stats);
registerAction('spreadsheet_save', spreadsheet_save);
registerAction('spreadsheet_export', spreadsheet_export);
registerAction('spreadsheet_switch_sheet', spreadsheet_switch_sheet);

// Document
registerAction('document_read', document_read);
registerAction('document_eval', document_eval);
registerAction('document_write', document_write);
registerAction('document_format', document_format);
registerAction('document_find_replace', document_find_replace);
registerAction('document_insert_table', document_insert_table);
registerAction('document_save', document_save);
registerAction('document_stats', document_stats);
registerAction('document_export', document_export);

// Presentation
registerAction('presentation_read', presentation_read);
registerAction('presentation_read_slide', presentation_read_slide);
registerAction('presentation_eval', presentation_eval);
registerAction('presentation_go_to_slide', presentation_go_to_slide);
registerAction('presentation_update_text', presentation_update_text);
registerAction('presentation_add_slide', presentation_add_slide);
registerAction('presentation_delete_slide', presentation_delete_slide);
registerAction('presentation_duplicate_slide', presentation_duplicate_slide);
registerAction('presentation_set_background', presentation_set_background);
registerAction('presentation_add_shape', presentation_add_shape);
registerAction('presentation_save', presentation_save);
