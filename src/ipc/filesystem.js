const path = require('path');
const fs = require('fs');
const fsPromises = require('fs/promises');
const os = require('os');
const { dialog, shell } = require('electron');
const { spawn, execSync, spawnSync } = require('child_process');

function register(ctx) {
  const { ipcMain, getMainWindow, log } = ctx;

  // ============================================
  // Helper: expandHomeDir
  // ============================================
  const expandHomeDir = (filepath) => {
    if (filepath.startsWith('~')) {
      return path.join(os.homedir(), filepath.slice(1));
    }
    return filepath;
  };

  // ============================================
  // Helper: getFileType
  // ============================================
  function getFileType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.pdf': 'application/pdf',
      '.txt': 'text/plain',
      '.md': 'text/markdown',
      '.json': 'application/json'
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }

  // ============================================
  // Open file / dialog
  // ============================================

  ipcMain.handle('open-file', async (_event, filePath) => {
    try {
      await shell.openPath(filePath);
      return true;
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('show-open-dialog', async (event, options) => {
    const result = await dialog.showOpenDialog(options);

    if (!result.canceled && result.filePaths.length > 0) {

      return result.filePaths.map(filePath => {
        const stats = fs.statSync(filePath);
        return {
          name: path.basename(filePath),
          path: filePath,
          size: stats.size,
          type: getFileType(filePath)
        };
      });
    }

    return [];
  });

  ipcMain.handle('open_directory_picker', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    });
    if (!result.canceled) {
      return result.filePaths[0];
    }
    return null;
  });

  // ============================================
  // CSV / XLSX reading
  // ============================================

  ipcMain.handle('read-csv-content', async (_, filePath) => {
    try {
      const XLSX = require('xlsx');
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      return {
        headers: jsonData[0] || [],
        rows: jsonData.slice(1) || [],
        error: null
      };
    } catch (err) {
      console.error('Error reading CSV/XLSX:', err);
      return { headers: [], rows: [], error: err.message };
    }
  });

  // ============================================
  // DOCX reading (mammoth + JSZip)
  // ============================================

  ipcMain.handle('read-docx-content', async (_, filePath) => {
    console.log('[DOCX Main] read-docx-content called for:', filePath);
    try {
      const mammoth = require('mammoth');
      const JSZip = require('jszip');
      console.log('[DOCX Main] mammoth loaded');
      const buffer = await fsPromises.readFile(filePath);
      console.log('[DOCX Main] buffer read, length:', buffer?.length);
      // Handle empty/new docx files
      if (!buffer || buffer.length === 0) {
        console.log('[DOCX Main] Empty file, returning blank');
        return { content: '', error: null, isNew: true };
      }

      // Extract font information from DOCX
      let defaultFont = 'Calibri';
      let headingFont = 'Calibri';
      const fonts = new Set();

      // Load the zip once, outside the try block so it's accessible for preprocessing
      const zip = await JSZip.loadAsync(buffer);

      try {

        // Check styles.xml for default fonts
        const stylesFile = zip.file('word/styles.xml');
        if (stylesFile) {
          const stylesXml = await stylesFile.async('string');

          // Extract default font from docDefaults
          const defaultFontMatch = stylesXml.match(/<w:rFonts[^>]*w:ascii="([^"]+)"/);
          if (defaultFontMatch) {
            defaultFont = defaultFontMatch[1];
            fonts.add(defaultFont);
          }

          // Look for theme fonts
          const majorFontMatch = stylesXml.match(/w:majorFont[^>]*w:ascii="([^"]+)"/);
          const minorFontMatch = stylesXml.match(/w:minorFont[^>]*w:ascii="([^"]+)"/);
          if (majorFontMatch) {
            headingFont = majorFontMatch[1];
            fonts.add(headingFont);
          }
          if (minorFontMatch) {
            defaultFont = minorFontMatch[1];
            fonts.add(defaultFont);
          }
        }

        // Also check theme for fonts
        const themeFile = zip.file('word/theme/theme1.xml');
        if (themeFile) {
          const themeXml = await themeFile.async('string');

          // Extract major (heading) and minor (body) fonts from theme
          const majorMatch = themeXml.match(/<a:majorFont>[\s\S]*?<a:latin typeface="([^"]+)"[\s\S]*?<\/a:majorFont>/);
          const minorMatch = themeXml.match(/<a:minorFont>[\s\S]*?<a:latin typeface="([^"]+)"[\s\S]*?<\/a:minorFont>/);

          if (majorMatch) {
            headingFont = majorMatch[1];
            fonts.add(headingFont);
          }
          if (minorMatch) {
            defaultFont = minorMatch[1];
            fonts.add(defaultFont);
          }
        }

        // Also scan document.xml for inline fonts (most commonly used font wins)
        const documentFile = zip.file('word/document.xml');
        if (documentFile) {
          const documentXml = await documentFile.async('string');

          // Find all rFonts declarations and count occurrences
          const fontCounts = {};
          const fontMatches = documentXml.matchAll(/<w:rFonts[^>]*w:ascii="([^"]+)"/g);
          for (const match of fontMatches) {
            const fontName = match[1];
            // Skip system/default fonts
            if (fontName && fontName !== 'Arial' && fontName !== 'Calibri' && fontName !== 'Times New Roman') {
              fontCounts[fontName] = (fontCounts[fontName] || 0) + 1;
              fonts.add(fontName);
            }
          }

          // Find the most used custom font and set it as default
          let maxCount = 0;
          for (const [fontName, count] of Object.entries(fontCounts)) {
            if (count > maxCount) {
              maxCount = count;
              defaultFont = fontName;
            }
          }
        }

        console.log('[DOCX Main] Extracted fonts - default:', defaultFont, 'heading:', headingFont, 'all:', Array.from(fonts));
      } catch (fontErr) {
        console.log('[DOCX Main] Font extraction failed, using defaults:', fontErr.message);
      }

      // Extract page dimensions from sectPr
      let pageWidth = 8.5;  // Default letter size in inches
      let pageHeight = 11;
      let marginTop = 1;
      let marginBottom = 1;
      let marginLeft = 1;
      let marginRight = 1;
      let lineSpacing = 1.15;  // Default Word line spacing
      let paragraphSpacingBefore = 0;
      let paragraphSpacingAfter = 8;  // Default 8pt after

      // Pre-process the DOCX to preserve empty paragraphs and page breaks
      let processedBuffer = buffer;
      try {
        const documentFile = zip.file('word/document.xml');
        if (documentFile) {
          let documentXml = await documentFile.async('string');
          let changesMade = false;

          // Count paragraphs before changes
          const totalParagraphs = (documentXml.match(/<w:p[ >]/g) || []).length;
          console.log('[DOCX Main] Total paragraphs in document:', totalParagraphs);

          // Extract page size from sectPr (section properties)
          // Values are in twips (1/20 of a point, 1440 twips = 1 inch)
          const pgSzMatch = documentXml.match(/<w:pgSz[^>]*w:w="(\d+)"[^>]*w:h="(\d+)"/);
          if (pgSzMatch) {
            pageWidth = parseInt(pgSzMatch[1]) / 1440;
            pageHeight = parseInt(pgSzMatch[2]) / 1440;
            console.log('[DOCX Main] Page size:', pageWidth, 'x', pageHeight, 'inches');
          }
          // Also try reverse order (w:h before w:w)
          const pgSzMatch2 = documentXml.match(/<w:pgSz[^>]*w:h="(\d+)"[^>]*w:w="(\d+)"/);
          if (pgSzMatch2) {
            pageHeight = parseInt(pgSzMatch2[1]) / 1440;
            pageWidth = parseInt(pgSzMatch2[2]) / 1440;
            console.log('[DOCX Main] Page size (alt):', pageWidth, 'x', pageHeight, 'inches');
          }

          // Extract margins from pgMar
          const pgMarMatch = documentXml.match(/<w:pgMar[^>]*>/);
          if (pgMarMatch) {
            const marStr = pgMarMatch[0];
            const topMatch = marStr.match(/w:top="(\d+)"/);
            const bottomMatch = marStr.match(/w:bottom="(\d+)"/);
            const leftMatch = marStr.match(/w:left="(\d+)"/);
            const rightMatch = marStr.match(/w:right="(\d+)"/);
            if (topMatch) marginTop = parseInt(topMatch[1]) / 1440;
            if (bottomMatch) marginBottom = parseInt(bottomMatch[1]) / 1440;
            if (leftMatch) marginLeft = parseInt(leftMatch[1]) / 1440;
            if (rightMatch) marginRight = parseInt(rightMatch[1]) / 1440;
            console.log('[DOCX Main] Margins:', marginTop, marginBottom, marginLeft, marginRight);
          }

          // Extract line spacing from the most common spacing element
          // w:line value with lineRule="auto" means: value/240 = line spacing multiplier
          // e.g., 240 = single (1.0), 276 = 1.15, 360 = 1.5, 480 = double (2.0)
          const spacingMatches = documentXml.match(/<w:spacing[^>]*w:line="(\d+)"[^>]*w:lineRule="auto"[^>]*>/g) || [];
          if (spacingMatches.length > 0) {
            // Count occurrences to find the most common
            const lineCounts = {};
            for (const match of spacingMatches) {
              const lineMatch = match.match(/w:line="(\d+)"/);
              if (lineMatch) {
                const lineVal = parseInt(lineMatch[1]);
                lineCounts[lineVal] = (lineCounts[lineVal] || 0) + 1;
              }
            }
            // Find most common
            let maxCount = 0;
            let mostCommonLine = 240;
            for (const [val, count] of Object.entries(lineCounts)) {
              if (count > maxCount) {
                maxCount = count;
                mostCommonLine = parseInt(val);
              }
            }
            lineSpacing = mostCommonLine / 240;
            console.log('[DOCX Main] Line spacing:', lineSpacing, '(raw value:', mostCommonLine, ')');
          }

          // Also extract paragraph spacing (before/after) from most common
          const beforeMatches = documentXml.match(/w:before="(\d+)"/g) || [];
          const afterMatches = documentXml.match(/w:after="(\d+)"/g) || [];
          if (beforeMatches.length > 0) {
            const beforeCounts = {};
            for (const match of beforeMatches) {
              const val = parseInt(match.match(/(\d+)/)[1]);
              if (val > 0) beforeCounts[val] = (beforeCounts[val] || 0) + 1;
            }
            let maxCount = 0;
            for (const [val, count] of Object.entries(beforeCounts)) {
              if (count > maxCount) {
                maxCount = count;
                paragraphSpacingBefore = parseInt(val) / 20; // Convert twips to points
              }
            }
          }
          if (afterMatches.length > 0) {
            const afterCounts = {};
            for (const match of afterMatches) {
              const val = parseInt(match.match(/(\d+)/)[1]);
              if (val > 0) afterCounts[val] = (afterCounts[val] || 0) + 1;
            }
            let maxCount = 0;
            for (const [val, count] of Object.entries(afterCounts)) {
              if (count > maxCount) {
                maxCount = count;
                paragraphSpacingAfter = parseInt(val) / 20; // Convert twips to points
              }
            }
          }
          console.log('[DOCX Main] Paragraph spacing - before:', paragraphSpacingBefore, 'pt, after:', paragraphSpacingAfter, 'pt');

          // Step 0: Handle page breaks - convert <w:br w:type="page"/> to marker
          const pageBreakPattern = /<w:br[^>]*w:type="page"[^>]*\/?>/g;
          const pageBreakCount = (documentXml.match(pageBreakPattern) || []).length;
          if (pageBreakCount > 0) {
            documentXml = documentXml.replace(pageBreakPattern, '<w:t xml:space="preserve">\u2042PAGEBREAK\u2042</w:t>');
            console.log('[DOCX Main] Marked', pageBreakCount, 'page breaks for preservation');
            changesMade = true;
          }

          // Step 1: Find empty runs (w:r with no w:t) and add a special marker
          // Pattern: <w:r ...><w:rPr>...</w:rPr></w:r> (run with properties but no text)
          const emptyRunPattern = /(<w:r[^>]*>(?:<w:rPr>[\s\S]*?<\/w:rPr>)?)\s*(<\/w:r>)/g;
          const emptyRunCount = (documentXml.match(emptyRunPattern) || []).length;
          if (emptyRunCount > 0) {
            documentXml = documentXml.replace(emptyRunPattern, '$1<w:t xml:space="preserve">\u2042EMPTYRUN\u2042</w:t>$2');
            console.log('[DOCX Main] Marked', emptyRunCount, 'empty runs for preservation');
            changesMade = true;
          }

          // Step 2: Find empty paragraphs (w:p with no w:r containing w:t)
          // These are paragraphs that only have paragraph properties or are completely empty
          // Match: <w:p>...</w:pPr></w:p> or <w:p></w:p> (no runs at all)
          // We add a run with marker text to preserve them
          // Allow whitespace between elements
          const emptyParagraphNoRunPattern = /(<w:p(?:[^>]*)>(?:\s*<w:pPr>[\s\S]*?<\/w:pPr>)?)\s*(<\/w:p>)/g;
          const emptyParaCount = (documentXml.match(emptyParagraphNoRunPattern) || []).length;
          if (emptyParaCount > 0) {
            documentXml = documentXml.replace(emptyParagraphNoRunPattern, '$1<w:r><w:t xml:space="preserve">\u2042EMPTYRUN\u2042</w:t></w:r>$2');
            console.log('[DOCX Main] Marked', emptyParaCount, 'empty paragraphs (no runs) for preservation');
            changesMade = true;
          }

          // Step 3: Find paragraphs that only have bookmarks but no text
          // Pattern: <w:p>...<w:bookmarkStart.../><w:bookmarkEnd/>...</w:p> (only bookmarks, no text runs)
          // We need to add visible content to these as well
          // Allow whitespace between elements
          const bookmarkOnlyPattern = /(<w:p(?:[^>]*)>(?:\s*<w:pPr>[\s\S]*?<\/w:pPr>)?(?:\s*<w:bookmarkStart[^>]*\/>|\s*<w:bookmarkEnd[^>]*\/>)+)\s*(<\/w:p>)/g;
          const bookmarkOnlyCount = (documentXml.match(bookmarkOnlyPattern) || []).length;
          if (bookmarkOnlyCount > 0) {
            documentXml = documentXml.replace(bookmarkOnlyPattern, '$1<w:r><w:t xml:space="preserve">\u2042EMPTYRUN\u2042</w:t></w:r>$2');
            console.log('[DOCX Main] Marked', bookmarkOnlyCount, 'bookmark-only paragraphs for preservation');
            changesMade = true;
          }

          if (changesMade) {
            // Update the zip with modified document.xml
            zip.file('word/document.xml', documentXml);

            // Generate new buffer
            processedBuffer = await zip.generateAsync({ type: 'nodebuffer' });
            console.log('[DOCX Main] Regenerated buffer with preserved empty content');
          }
        }
      } catch (preprocessErr) {
        console.log('[DOCX Main] Pre-processing failed, using original:', preprocessErr.message);
      }

      // Convert to HTML with style mapping for better preservation
      const options = {
        buffer: processedBuffer,
        // Don't ignore empty paragraphs - preserve line breaks
        ignoreEmptyParagraphs: false,
        styleMap: [
          // Standard Word heading styles
          "p[style-name='Heading 1'] => h1:fresh",
          "p[style-name='Heading 2'] => h2:fresh",
          "p[style-name='Heading 3'] => h3:fresh",
          "p[style-name='Heading 4'] => h4:fresh",
          "p[style-name='Heading 5'] => h5:fresh",
          "p[style-name='Heading 6'] => h6:fresh",
          // Alternative heading style names (Google Docs, LibreOffice, etc.)
          "p[style-name='heading 1'] => h1:fresh",
          "p[style-name='heading 2'] => h2:fresh",
          "p[style-name='heading 3'] => h3:fresh",
          "p[style-name='heading 4'] => h4:fresh",
          "p[style-name='heading 5'] => h5:fresh",
          "p[style-name='heading 6'] => h6:fresh",
          // Title and subtitle
          "p[style-name='Title'] => h1.title:fresh",
          "p[style-name='title'] => h1.title:fresh",
          "p[style-name='Subtitle'] => h2.subtitle:fresh",
          "p[style-name='subtitle'] => h2.subtitle:fresh",
          // Text formatting
          "r[style-name='Strong'] => strong",
          "r[style-name='Emphasis'] => em",
          // Quotes
          "p[style-name='Quote'] => blockquote:fresh",
          "p[style-name='Block Quote'] => blockquote:fresh",
          "p[style-name='quote'] => blockquote:fresh",
          // Lists
          "p[style-name='List Paragraph'] => li:fresh",
          "p[style-name='List Number'] => li:fresh",
          "p[style-name='List Bullet'] => li:fresh",
          // Normal paragraph (ensure it's wrapped)
          "p[style-name='Normal'] => p:fresh",
          "p[style-name='normal'] => p:fresh",
          "p[style-name='Body Text'] => p:fresh",
        ],
        convertImage: mammoth.images.imgElement(function(image) {
          return image.read("base64").then(function(imageBuffer) {
            return {
              src: "data:" + image.contentType + ";base64," + imageBuffer
            };
          });
        })
      };

      console.log('[DOCX Main] Calling mammoth.convertToHtml...');
      const result = await mammoth.convertToHtml(options);
      console.log('[DOCX Main] Mammoth conversion done, HTML length:', result.value?.length);

      // Post-process HTML to ensure empty paragraphs render properly
      let html = result.value || '';

      // Convert page break markers to visible page break elements
      const pageBreakMarkerCount = (html.match(/\u2042PAGEBREAK\u2042/g) || []).length;
      html = html.replace(/\u2042PAGEBREAK\u2042/g, '</p><div class="docx-page-break"></div><p>');
      console.log('[DOCX Main] Converted', pageBreakMarkerCount, 'page break markers');

      // Convert our empty run markers to non-breaking space
      // The marker \u2042EMPTYRUN\u2042 was inserted during pre-processing
      const markerCount = (html.match(/\u2042EMPTYRUN\u2042/g) || []).length;
      html = html.replace(/\u2042EMPTYRUN\u2042/g, '&nbsp;');
      console.log('[DOCX Main] Converted', markerCount, 'empty run markers to &nbsp;');

      // Replace empty paragraphs with paragraphs containing a <br> so they render
      // Handle variations: <p></p>, <p> </p>, <p class="..."></p>, etc.
      html = html.replace(/<p([^>]*)>\s*<\/p>/g, '<p$1><br></p>');

      // Also handle empty headings
      html = html.replace(/<(h[1-6])([^>]*)>\s*<\/\1>/g, '<$1$2><br></$1>');

      // Handle paragraphs/headings that only contain anchor tags (no visible text)
      // These are bookmarks in Word that create no visual space
      // Pattern: <p><a id="..."></a></p> or <h1><a id="..."></a></h1>
      html = html.replace(/<p([^>]*)>(\s*<a[^>]*><\/a>\s*)<\/p>/g, '<p$1>$2<br></p>');
      html = html.replace(/<(h[1-6])([^>]*)>(\s*<a[^>]*><\/a>\s*)<\/\1>/g, '<$1$2>$3<br></$1>');

      // Handle multiple consecutive anchors with no text
      html = html.replace(/<p([^>]*)>((?:\s*<a[^>]*><\/a>\s*)+)<\/p>/g, '<p$1>$2<br></p>');
      html = html.replace(/<(h[1-6])([^>]*)>((?:\s*<a[^>]*><\/a>\s*)+)<\/\1>/g, '<$1$2>$3<br></$1>');

      // Handle empty list items
      html = html.replace(/<li([^>]*)>\s*<\/li>/g, '<li$1><br></li>');

      // Ensure there's at least one paragraph if content is empty
      if (!html.trim()) {
        html = '<p><br></p>';
      }

      return {
        content: html,
        messages: result.messages,
        error: null,
        fonts: {
          default: defaultFont,
          heading: headingFont,
          all: Array.from(fonts)
        },
        pageSize: {
          width: pageWidth,
          height: pageHeight,
          marginTop,
          marginBottom,
          marginLeft,
          marginRight
        },
        spacing: {
          lineHeight: lineSpacing,
          paragraphBefore: paragraphSpacingBefore,
          paragraphAfter: paragraphSpacingAfter
        }
      };
    } catch (err) {
      console.error('[DOCX Main] Error reading DOCX:', err);
      return { content: null, error: err.message };
    }
  });

  // ============================================
  // Write file buffer
  // ============================================

  ipcMain.handle('write-file-buffer', async (_e, filePath, uint8) => {
    try {
      fs.writeFileSync(filePath, Buffer.from(uint8));
      return true;
    } catch (err) {
      return { error: err.message };
    }
  });

  // ============================================
  // Save generated image
  // ============================================

  ipcMain.handle('save-generated-image', async (event, blob, folderPath, filename) => {
    try {
        const buffer = Buffer.from(await blob.arrayBuffer());
        const fullPath = path.join(folderPath, filename);
        await fsPromises.writeFile(fullPath, buffer);
        return { success: true, path: fullPath };
    } catch (error) {
        console.error('Error saving generated image:', error);
        return { success: false, error: error.message };
    }
  });

  // ============================================
  // Compile LaTeX
  // ============================================

  ipcMain.handle('compile-latex', async (_event, texPath, opts) => {
    console.log('[LATEX] compile-latex called with:', texPath, opts);

    const engine = opts?.engine || 'pdflatex';

    // Run pdflatex from the directory containing the .tex file
    const workingDir = path.dirname(texPath);
    const texFilename = path.basename(texPath);
    const compileArgs = [
      '-interaction=nonstopmode',
      '-halt-on-error',
      '-file-line-error',
      texFilename
    ];
    if (opts?.shellEscape) compileArgs.unshift('-shell-escape');

    console.log('[LATEX] Running first pass:', engine, compileArgs, 'in', workingDir);
    const first = spawnSync(engine, compileArgs, { encoding: 'utf8', cwd: workingDir });
    console.log('[LATEX] First pass stdout:', first.stdout);
    console.log('[LATEX] First pass stderr:', first.stderr);

    if (opts?.bibtex) {
      const base = texFilename.replace(/\.tex$/, '');
      console.log('[LATEX] Running bibtex on:', base);
      const bib = spawnSync('bibtex', [base], { encoding: 'utf8', cwd: workingDir });
      console.log('[LATEX] Bibtex stdout:', bib.stdout);
      console.log('[LATEX] Bibtex stderr:', bib.stderr);
    }

    console.log('[LATEX] Running second pass:', engine, compileArgs, 'in', workingDir);
    const result = spawnSync(engine, compileArgs, { encoding: 'utf8', cwd: workingDir });
    console.log('[LATEX] Second pass stdout:', result.stdout);
    console.log('[LATEX] Second pass stderr:', result.stderr);

    const pdfPath = texPath.replace(/\.tex$/, '.pdf');
    const ok = result.status === 0;

    console.log('[LATEX] DONE. Status:', ok ? 'OK' : 'ERROR', 'PDF:', pdfPath);

    return {
      ok,
      pdfPath,
      error: !ok ? result.stderr : null
    };
  });

  // ============================================
  // File existence check
  // ============================================

  ipcMain.handle('file-exists', async (_event, filePath) => {
    try {
      await fsPromises.access(filePath);
      return true;
    } catch {
      return false;
    }
  });

  // ============================================
  // Zip operations (archiver / adm-zip)
  // ============================================

  ipcMain.handle('zip-items', async (_event, itemPaths, customName) => {
    const archiver = require('archiver');

    try {
      if (!itemPaths || itemPaths.length === 0) {
        return { error: 'No items to zip' };
      }

      // Determine output path - use parent of first item
      const firstItem = itemPaths[0];
      const parentDir = path.dirname(firstItem);

      // Use custom name or generate default
      let baseName = customName || (itemPaths.length === 1
        ? path.basename(firstItem, path.extname(firstItem))
        : 'archive');

      // Remove .zip if user added it
      baseName = baseName.replace(/\.zip$/i, '');

      // Find unique filename
      let zipPath = path.join(parentDir, `${baseName}.zip`);
      let counter = 1;
      while (fs.existsSync(zipPath)) {
        zipPath = path.join(parentDir, `${baseName}_${counter}.zip`);
        counter++;
      }

      const output = fs.createWriteStream(zipPath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      return new Promise((resolve, reject) => {
        output.on('close', () => {
          console.log(`[ZIP] Created ${zipPath} (${archive.pointer()} bytes)`);
          resolve({ success: true, zipPath });
        });

        archive.on('error', (err) => {
          reject({ error: err.message });
        });

        archive.pipe(output);

        // Add each item
        for (const itemPath of itemPaths) {
          const stat = fs.statSync(itemPath);
          const name = path.basename(itemPath);

          if (stat.isDirectory()) {
            archive.directory(itemPath, name);
          } else {
            archive.file(itemPath, { name });
          }
        }

        archive.finalize();
      });
    } catch (err) {
      console.error('[ZIP] Error:', err);
      return { error: err.message };
    }
  });

  // Read zip file contents (list entries)
  ipcMain.handle('read-zip-contents', async (_event, zipPath) => {
    const AdmZip = require('adm-zip');

    try {
      if (!fs.existsSync(zipPath)) {
        return { error: 'Zip file not found' };
      }

      const zip = new AdmZip(zipPath);
      const zipEntries = zip.getEntries();

      const entries = zipEntries.map(entry => ({
        name: entry.name,
        path: entry.entryName,
        isDirectory: entry.isDirectory,
        size: entry.header.size,
        compressedSize: entry.header.compressedSize
      }));

      console.log(`[ZIP] Read ${entries.length} entries from ${zipPath}`);
      return { entries };
    } catch (err) {
      console.error('[ZIP] Error reading zip:', err);
      return { error: err.message };
    }
  });

  // Extract zip file contents
  ipcMain.handle('extract-zip', async (_event, zipPath, targetDir, entryPath = null) => {
    const AdmZip = require('adm-zip');

    try {
      if (!fs.existsSync(zipPath)) {
        return { error: 'Zip file not found' };
      }

      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      const zip = new AdmZip(zipPath);

      if (entryPath) {
        // Extract specific entry
        const entry = zip.getEntry(entryPath);
        if (!entry) {
          return { error: `Entry not found: ${entryPath}` };
        }

        if (entry.isDirectory) {
          // Extract directory and all its contents
          const entries = zip.getEntries().filter(e => e.entryName.startsWith(entryPath));
          for (const e of entries) {
            zip.extractEntryTo(e, targetDir, true, true);
          }
        } else {
          zip.extractEntryTo(entry, targetDir, true, true);
        }
        console.log(`[ZIP] Extracted ${entryPath} to ${targetDir}`);
      } else {
        // Extract all
        zip.extractAllTo(targetDir, true);
        console.log(`[ZIP] Extracted all to ${targetDir}`);
      }

      return { success: true, targetDir };
    } catch (err) {
      console.error('[ZIP] Error extracting zip:', err);
      return { error: err.message };
    }
  });

  // ============================================
  // Read file buffer / show in folder / close window
  // ============================================

  ipcMain.handle('read-file-buffer', async (event, filePath) => {
    try {
      console.log(`[Main Process] Reading file buffer for: ${filePath}`);
      const buffer = await fsPromises.readFile(filePath);
      return buffer;
    } catch (error) {
      throw error;
    }
  });

  ipcMain.handle('show-item-in-folder', async (_event, filePath) => {
    try {
      shell.showItemInFolder(filePath);
      return { success: true };
    } catch (error) {
      return { error: error.message };
    }
  });

  ipcMain.handle('close-window', async () => {
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.close();
    }
  });

  // ============================================
  // Read / write / delete file content
  // ============================================

  ipcMain.handle('read-file-content', async (_, filePath) => {
    try {
      const content = await fsPromises.readFile(filePath, 'utf8');
      return { content, error: null };
    } catch (err) {
      console.error('Error reading file:', err);
      return { content: null, error: err.message };
    }
  });

  ipcMain.handle('write-file-content', async (_, filePath, content) => {
    try {
      await fsPromises.writeFile(filePath, content, 'utf8');
      return { success: true, error: null };
    } catch (err) {
      console.error('Error writing file:', err);
      return { success: false, error: err.message };
    }
  });

  // Save data to a temp file (for clipboard paste of images/large text)
  ipcMain.handle('save-temp-file', async (_, { name, data, encoding }) => {
    try {
      const tempDir = path.join(os.tmpdir(), 'incognide-paste');
      await fsPromises.mkdir(tempDir, { recursive: true });
      const tempPath = path.join(tempDir, name);

      if (encoding === 'base64') {
        await fsPromises.writeFile(tempPath, Buffer.from(data, 'base64'));
      } else {
        await fsPromises.writeFile(tempPath, data, encoding || 'utf8');
      }

      return { success: true, path: tempPath };
    } catch (err) {
      console.error('Error saving temp file:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('delete-file', async (_, filePath) => {
    try {
      await fsPromises.unlink(filePath);
      return { success: true, error: null };
    } catch (err) {
      console.error('Error deleting file:', err);
      return { success: false, error: err.message };
    }
  });

  // ============================================
  // Read directory images
  // ============================================

  ipcMain.handle('readDirectoryImages', async (_, dirPath) => {
    try {
      const fullPath = expandHomeDir(dirPath);
      const files = await fsPromises.readdir(fullPath);
      const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
      return files
        .filter(file => imageExtensions.some(ext => file.toLowerCase().endsWith(ext)))
        .map(file => {
          const filePath = path.join(fullPath, file);
          return `media://${filePath}`;
        });
    } catch (error) {
      console.error('Error reading directory:', error);
      return [];
    }
  });

  // ============================================
  // Directory structure / navigation
  // ============================================

  ipcMain.handle('readDirectoryStructure', async (_, dirPath) => {
    const allowedExtensions = ['.py',
                               '.md',
                               '.js',
                               '.jsx',
                               '.docx',
                               '.csv',
                               '.xlsx',
                               '.doc',
                               '.xlsx',
                               '.ipynb',
                               '.exp',
                               '.tsx',
                               '.ts',
                               '.json',
                               '.txt',
                               '.tex',
                               '.bib',
                               '.pptx',
                               '.yaml',
                               '.yml',
                               '.html',
                               '.css',
                               '.npc',
                               '.jinx',
                               '.pdf',
                               '.csv',
                               '.sh',
                               '.ctx',
                               '.cpp',
                               '.c',
                               '.r',
                               '.json',
                               '.jpg',
                               '.jpeg',
                               '.png',
                               '.gif',
                               '.webp',
                               '.bmp',
                               '.svg',
                               '.zip',
                              ];

    const ignorePatterns = ['node_modules', '.git', '.DS_Store'];

    // Determine max depth based on path - limit to 2 levels for home directory
    const homeDir = os.homedir();
    const isHomeDir = dirPath === homeDir || dirPath === '~' || dirPath === homeDir + '/';
    const maxDepth = isHomeDir ? 2 : Infinity;

    async function readDirRecursive(currentPath, depth = 0) {
      const result = {};
      let items;
      try {
        items = await fsPromises.readdir(currentPath, { withFileTypes: true });
      } catch (err) {
        // Can't read this directory - return empty result
        if (err.code === 'EACCES' || err.code === 'EPERM') {
          console.log(`[Main Process] Permission denied, skipping: ${currentPath}`);
          return result;
        }
        throw err;
      }
      for (const item of items) {
        if (item.isDirectory() && ignorePatterns.includes(item.name)) {
          console.log(`[Main Process] Ignoring directory: ${path.join(currentPath, item.name)}`);
          continue;
        }

        const itemPath = path.join(currentPath, item.name);
        if (item.isDirectory()) {
          // Only recurse if we haven't hit max depth
          if (depth < maxDepth) {
            try {
              result[item.name] = {
                type: 'directory',
                path: itemPath,
                children: await readDirRecursive(itemPath, depth + 1)
              };
            } catch (err) {
              // If we can't read subdirectory, still show it but mark as inaccessible
              if (err.code === 'EACCES' || err.code === 'EPERM') {
                console.log(`[Main Process] Permission denied for subdirectory: ${itemPath}`);
                result[item.name] = {
                  type: 'directory',
                  path: itemPath,
                  children: {},
                  inaccessible: true
                };
              } else {
                throw err;
              }
            }
          } else {
            // At max depth, just show directory without children
            result[item.name] = {
              type: 'directory',
              path: itemPath,
              children: {} // Empty children - will be loaded on expand
            };
          }
        } else if (item.isFile()) {
          const ext = path.extname(item.name).toLowerCase();
          if (allowedExtensions.includes(ext)) {
            result[item.name] = {
              type: 'file',
              path: itemPath
            };
          }
        }
      }
      return result;
    }

    try {
      await fsPromises.access(dirPath, fs.constants.R_OK);
      return await readDirRecursive(dirPath, 0);
    } catch (err) {
      console.error(`[Main Process] Error in readDirectoryStructure for ${dirPath}:`, err);
      if (err.code === 'ENOENT') return { error: 'Directory not found' };
      if (err.code === 'EACCES') return { error: 'Permission denied' };
      return { error: err.message || 'Failed to read directory contents' };
    }
  });

  ipcMain.handle('goUpDirectory', async (_, currentPath) => {
    if (!currentPath) {
      console.log('No current path, returning home dir');
      return os.homedir();
    }
    const parentPath = path.dirname(currentPath);
    console.log('Parent path:', parentPath);
    return parentPath;
  });

  ipcMain.handle('getHomeDir', async () => {
    return os.homedir();
  });

  ipcMain.handle('readDirectory', async (_, dir) => {
    try {
      const items = await fsPromises.readdir(dir, { withFileTypes: true });
      const results = await Promise.all(items.map(async item => {
        const fullPath = path.join(dir, item.name);
        let size = 0;
        let modified = '';
        try {
          const stats = await fsPromises.stat(fullPath);
          size = stats.size;
          modified = stats.mtime.toISOString();
        } catch (e) {
          // Ignore stat errors
        }
        return {
          name: item.name,
          isDirectory: item.isDirectory(),
          path: fullPath,
          size,
          modified
        };
      }));
      return results;
    } catch (err) {
      console.error('Error in readDirectory:', err);
      throw err;
    }
  });

  // ============================================
  // Ensure directory
  // ============================================

  ipcMain.handle('ensureDirectory', async (_, dirPath) => {
    try {
      const fullPath = expandHomeDir(dirPath);
      await fsPromises.mkdir(fullPath, { recursive: true });
      return true;
    } catch (error) {
      console.error('Error ensuring directory:', error);
      throw error;
    }
  });

  // ============================================
  // Create / delete directory, recursive contents
  // ============================================

  ipcMain.handle('create-directory', async (_, directoryPath) => {
    try {
      await fsPromises.mkdir(directoryPath);
      return { success: true, error: null };
    } catch (err) {
      console.error('Error creating directory:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('delete-directory', async (_, directoryPath) => {
    try {
      await fsPromises.rm(directoryPath, { recursive: true, force: true });
      return { success: true, error: null };
    } catch (err) {
      console.error('Error deleting directory:', err);
      return { success: false, error: err.message };
    }
  });

  // Add this handler to get all file paths inside a folder for AI overview
  ipcMain.handle('get-directory-contents-recursive', async (_, directoryPath) => {
      const allFiles = [];
      async function readDir(currentDir) {
          const entries = await fsPromises.readdir(currentDir, { withFileTypes: true });
          for (const entry of entries) {
              const fullPath = path.join(currentDir, entry.name);
              if (entry.isDirectory()) {
                  await readDir(fullPath);
              } else if (entry.isFile()) {
                  allFiles.push(fullPath);
              }
          }
      }
      try {
          await readDir(directoryPath);
          return { files: allFiles, error: null };
      } catch (err) {
          console.error('Error getting directory contents:', err);
          return { files: [], error: err.message };
      }
  });

  // ============================================
  // Analyze disk usage
  // ============================================

  ipcMain.handle('analyze-disk-usage', async (_, folderPath) => {
    console.log('[DiskUsage Main] Received request for:', folderPath);

    if (!folderPath) {
        console.error('[DiskUsage Main] No folder path provided');
        return null;
    }

    // Skip virtual/system filesystems that can cause hangs or permission errors
    const SKIP_PATHS = ['/proc', '/sys', '/dev', '/run', '/snap', '/tmp/.X11-unix', '/var/run'];
    const shouldSkip = (p) => SKIP_PATHS.some(skip => p === skip || p.startsWith(skip + '/'));

    try {
        const analyzePath = async (currentPath, depth = 0, maxDepth = 3) => {
            // Skip virtual filesystems
            if (shouldSkip(currentPath)) {
                return null;
            }

            const stats = await fsPromises.stat(currentPath);
            const name = path.basename(currentPath);

            if (stats.isFile()) {
                return {
                    name,
                    path: currentPath,
                    type: 'file',
                    size: stats.size
                };
            }

            if (stats.isDirectory()) {
                let children = [];
                let totalSize = 0;
                let fileCount = 0;
                let folderCount = 0;

                try {
                    const entries = await fsPromises.readdir(currentPath, { withFileTypes: true });

                    // Only go deeper if we haven't hit max depth
                    if (depth < maxDepth) {
                        for (const entry of entries) {
                            const childPath = path.join(currentPath, entry.name);
                            try {
                                const childResult = await analyzePath(childPath, depth + 1, maxDepth);
                                if (childResult) {
                                    children.push(childResult);
                                    totalSize += childResult.size || 0;
                                    if (childResult.type === 'file') {
                                        fileCount++;
                                    } else {
                                        folderCount++;
                                        fileCount += childResult.fileCount || 0;
                                        folderCount += childResult.folderCount || 0;
                                    }
                                }
                            } catch (childErr) {
                                // Skip inaccessible files/folders
                                console.warn(`Skipping inaccessible: ${childPath}`);
                            }
                        }
                    } else {
                        // At max depth, just count sizes without going deeper
                        for (const entry of entries) {
                            const childPath = path.join(currentPath, entry.name);
                            // Skip virtual filesystems at max depth too
                            if (shouldSkip(childPath)) continue;
                            try {
                                const childStats = await fsPromises.stat(childPath);
                                if (childStats.isFile()) {
                                    totalSize += childStats.size;
                                    fileCount++;
                                } else if (childStats.isDirectory()) {
                                    folderCount++;
                                }
                            } catch (e) {
                                // Skip inaccessible
                            }
                        }
                    }
                } catch (readErr) {
                    console.warn(`Cannot read directory: ${currentPath}`);
                }

                // Sort children by size (largest first)
                children.sort((a, b) => (b.size || 0) - (a.size || 0));

                return {
                    name,
                    path: currentPath,
                    type: 'folder',
                    size: totalSize,
                    fileCount,
                    folderCount,
                    children
                };
            }

            return null;
        };

        const result = await analyzePath(folderPath, 0, 3);
        console.log('[DiskUsage Main] Analysis complete. Result:', result ? 'has data' : 'null');
        return result;
    } catch (err) {
        console.error('[DiskUsage Main] Error analyzing disk usage:', err);
        throw err;
    }
  });

  // ============================================
  // Rename file
  // ============================================

  ipcMain.handle('renameFile', async (_, oldPath, newPath) => {
    try {
      await fsPromises.rename(oldPath, newPath);
      return { success: true, error: null };
    } catch (err) {
      console.error('Error renaming file:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('copy-file', async (_, srcPath, destPath) => {
    try {
      await fsPromises.copyFile(srcPath, destPath);
      return { success: true, error: null };
    } catch (err) {
      console.error('Error copying file:', err);
      return { success: false, error: err.message };
    }
  });

  // ============================================
  // File Permission Management (chmod/chown)
  // ============================================

  ipcMain.handle('chmod', async (_, { path: filePath, mode, recursive, useSudo }) => {
      try {
          if (!filePath || !mode) {
              return { success: false, error: 'Path and mode are required' };
          }

          // Validate mode format (octal like 755, 0755, etc.)
          if (!/^[0-7]{3,4}$/.test(mode)) {
              return { success: false, error: 'Invalid mode format. Use octal format (e.g., 755)' };
          }

          const args = recursive ? ['-R', mode, filePath] : [mode, filePath];
          const command = useSudo ? `sudo chmod ${args.join(' ')}` : `chmod ${args.join(' ')}`;

          console.log(`[CHMOD] Executing: ${command}`);
          execSync(command, { encoding: 'utf-8' });
          console.log(`[CHMOD] Successfully changed permissions for ${filePath}`);
          return { success: true, error: null };
      } catch (err) {
          console.error('[CHMOD] Error:', err);
          return { success: false, error: err.message || 'Failed to change permissions' };
      }
  });

  ipcMain.handle('chown', async (_, { path: filePath, owner, group, recursive, useSudo }) => {
      try {
          if (!filePath || !owner) {
              return { success: false, error: 'Path and owner are required' };
          }

          const ownerGroup = group ? `${owner}:${group}` : owner;
          const args = recursive ? ['-R', ownerGroup, filePath] : [ownerGroup, filePath];
          const command = useSudo ? `sudo chown ${args.join(' ')}` : `chown ${args.join(' ')}`;

          console.log(`[CHOWN] Executing: ${command}`);
          execSync(command, { encoding: 'utf-8' });
          console.log(`[CHOWN] Successfully changed owner for ${filePath}`);
          return { success: true, error: null };
      } catch (err) {
          console.error('[CHOWN] Error:', err);
          return { success: false, error: err.message || 'Failed to change owner' };
      }
  });
}

module.exports = { register };
