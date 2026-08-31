

import { registerAction, StudioContext, StudioActionResult } from './index';

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

const spreadsheetMeta = { paneTypes: ['csv'] };
registerAction('spreadsheet_read', spreadsheet_read, { description: 'Read spreadsheet data', ...spreadsheetMeta });
registerAction('spreadsheet_eval', spreadsheet_eval, { description: 'Evaluate a formula in a spreadsheet', ...spreadsheetMeta });
registerAction('spreadsheet_update_cell', spreadsheet_update_cell, { description: 'Update a single spreadsheet cell', ...spreadsheetMeta });
registerAction('spreadsheet_update_cells', spreadsheet_update_cells, { description: 'Update multiple spreadsheet cells', ...spreadsheetMeta });
registerAction('spreadsheet_update_header', spreadsheet_update_header, { description: 'Update spreadsheet header row', ...spreadsheetMeta });
registerAction('spreadsheet_add_row', spreadsheet_add_row, { description: 'Add a row to the spreadsheet', ...spreadsheetMeta });
registerAction('spreadsheet_delete_row', spreadsheet_delete_row, { description: 'Delete a spreadsheet row', ...spreadsheetMeta });
registerAction('spreadsheet_add_column', spreadsheet_add_column, { description: 'Add a column to the spreadsheet', ...spreadsheetMeta });
registerAction('spreadsheet_delete_column', spreadsheet_delete_column, { description: 'Delete a spreadsheet column', ...spreadsheetMeta });
registerAction('spreadsheet_sort', spreadsheet_sort, { description: 'Sort spreadsheet rows', ...spreadsheetMeta });
registerAction('spreadsheet_filter', spreadsheet_filter, { description: 'Filter spreadsheet rows', ...spreadsheetMeta });
registerAction('spreadsheet_clear_filters', spreadsheet_clear_filters, { description: 'Clear active spreadsheet filters', ...spreadsheetMeta });
registerAction('spreadsheet_stats', spreadsheet_stats, { description: 'Get spreadsheet statistics', ...spreadsheetMeta });
registerAction('spreadsheet_save', spreadsheet_save, { description: 'Save the spreadsheet', ...spreadsheetMeta });
registerAction('spreadsheet_export', spreadsheet_export, { description: 'Export the spreadsheet', ...spreadsheetMeta });
registerAction('spreadsheet_switch_sheet', spreadsheet_switch_sheet, { description: 'Switch to another sheet', ...spreadsheetMeta });

const documentMeta = { paneTypes: ['docx'] };
registerAction('document_read', document_read, { description: 'Read document content', ...documentMeta });
registerAction('document_eval', document_eval, { description: 'Evaluate a template in the document', ...documentMeta });
registerAction('document_write', document_write, { description: 'Write text into the document', ...documentMeta });
registerAction('document_format', document_format, { description: 'Apply formatting in the document', ...documentMeta });
registerAction('document_find_replace', document_find_replace, { description: 'Find and replace in the document', ...documentMeta });
registerAction('document_insert_table', document_insert_table, { description: 'Insert a table in the document', ...documentMeta });
registerAction('document_save', document_save, { description: 'Save the document', ...documentMeta });
registerAction('document_stats', document_stats, { description: 'Get document statistics', ...documentMeta });
registerAction('document_export', document_export, { description: 'Export the document', ...documentMeta });

const presentationMeta = { paneTypes: ['pptx'] };
registerAction('presentation_read', presentation_read, { description: 'Read presentation content', ...presentationMeta });
registerAction('presentation_read_slide', presentation_read_slide, { description: 'Read a specific slide', ...presentationMeta });
registerAction('presentation_eval', presentation_eval, { description: 'Evaluate a template on a slide', ...presentationMeta });
registerAction('presentation_go_to_slide', presentation_go_to_slide, { description: 'Navigate to a slide', ...presentationMeta });
registerAction('presentation_update_text', presentation_update_text, { description: 'Update text on a slide', ...presentationMeta });
registerAction('presentation_add_slide', presentation_add_slide, { description: 'Add a new slide', ...presentationMeta });
registerAction('presentation_delete_slide', presentation_delete_slide, { description: 'Delete a slide', ...presentationMeta });
registerAction('presentation_duplicate_slide', presentation_duplicate_slide, { description: 'Duplicate a slide', ...presentationMeta });
registerAction('presentation_set_background', presentation_set_background, { description: 'Set slide background', ...presentationMeta });
registerAction('presentation_add_shape', presentation_add_shape, { description: 'Add a shape to a slide', ...presentationMeta });
registerAction('presentation_save', presentation_save, { description: 'Save the presentation', ...presentationMeta });
