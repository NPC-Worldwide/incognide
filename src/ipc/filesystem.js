const path = require('path');
const fs = require('fs');
const fsPromises = require('fs/promises');
const os = require('os');
const { dialog, shell } = require('electron');
const { spawn, execSync, spawnSync } = require('child_process');

function register(ctx) {
  const { ipcMain, getMainWindow, log } = ctx;

  const expandHomeDir = (filepath) => {
    if (filepath.startsWith('~')) {
      return path.join(os.homedir(), filepath.slice(1));
    }
    return filepath;
  };

  const fileWatchers = new Map();

  ipcMain.handle('file:watch', async (event, filePath) => {
    if (!filePath || fileWatchers.has(filePath)) return;
    try {
      const watcher = fs.watch(filePath, { persistent: false }, (eventType) => {
        if (eventType === 'change') {
          const win = getMainWindow();
          if (win && !win.isDestroyed()) {
            win.webContents.send('file:changed', filePath);
          }
        }
      });
      watcher.on('error', () => {
        fileWatchers.delete(filePath);
      });
      fileWatchers.set(filePath, watcher);
    } catch (e) {
      console.error('[FILE-WATCH] Failed to watch:', filePath, e.message);
    }
  });

  ipcMain.handle('file:unwatch', async (event, filePath) => {
    const watcher = fileWatchers.get(filePath);
    if (watcher) {
      watcher.close();
      fileWatchers.delete(filePath);
    }
  });

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

  ipcMain.handle('open-file', async (_event, filePath) => {
    try {
      await shell.openPath(filePath);
      return true;
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('show-save-dialog', async (event, options) => {
    const result = await dialog.showSaveDialog(options || {});
    if (result.canceled || !result.filePath) return null;
    return result.filePath;
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

  function extractOpenDocumentContent(filePath) {
    try {
      const AdmZip = require('adm-zip');
      const zip = new AdmZip(filePath);
      const contentXml = zip.readAsText('content.xml');
      if (!contentXml) {
        return { content: '<p>OpenDocument file appears empty.</p>', error: null, isOdt: true };
      }
      const paragraphs = [];
      const pRegex = /<text:(?:p|h)[^>]*>([\s\S]*?)<\/text:(?:p|h)>/g;
      let match;
      while ((match = pRegex.exec(contentXml)) !== null) {
        let text = match[1]
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        text = text
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&amp;/g, '&')
          .replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'");
        if (text) {
          paragraphs.push(`<p>${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`);
        }
      }
      if (!paragraphs.length) {
        return { content: '<p>No readable text found in this OpenDocument file.</p>', error: null, isOdt: true };
      }
      return { content: paragraphs.join(''), error: null, isOdt: true };
    } catch (err) {
      return { content: '', error: `Failed to read OpenDocument file: ${err.message}`, isOdt: true };
    }
  }

  async function extractPdfText(filePath) {
    try {
      const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
      const data = new Uint8Array(await fsPromises.readFile(filePath));
      const doc = await pdfjsLib.getDocument({ data }).promise;
      const parts = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item) => item.str).join(' ');
        if (pageText.trim()) parts.push(`--- Page ${i} ---\n${pageText.trim()}`);
      }
      return { text: parts.join('\n\n'), error: null };
    } catch (err) {
      console.error('[PDF Text] Failed to extract text:', filePath, err.message);
      return { text: '', error: `Failed to extract PDF text: ${err.message}` };
    }
  }

  ipcMain.handle('read-pdf-text', async (_, filePath) => {
    console.log('[read-pdf-text] called for', filePath);
    const result = await extractPdfText(filePath);
    console.log('[read-pdf-text] result length', result.text?.length, 'error', result.error);
    return result;
  });

  ipcMain.handle('read-docx-content', async (_, filePath) => {
    console.log('[DOCX Main] read-docx-content called for:', filePath);
    try {
      const ext = path.extname(filePath).toLowerCase();
      if (ext === '.odt' || ext === '.odp') {
        return extractOpenDocumentContent(filePath);
      }
      const mammoth = require('mammoth');
      const JSZip = require('jszip');
      console.log('[DOCX Main] mammoth loaded');
      const buffer = await fsPromises.readFile(filePath);
      console.log('[DOCX Main] buffer read, length:', buffer?.length);
      if (!buffer || buffer.length === 0) {
        console.log('[DOCX Main] Empty file, returning blank');
        return { content: '', error: null, isNew: true };
      }

      let defaultFont = 'Calibri';
      let headingFont = 'Calibri';
      const fonts = new Set();

      const zip = await JSZip.loadAsync(buffer);

      try {

        const stylesFile = zip.file('word/styles.xml');
        if (stylesFile) {
          const stylesXml = await stylesFile.async('string');

          const defaultFontMatch = stylesXml.match(/<w:rFonts[^>]*w:ascii="([^"]+)"/);
          if (defaultFontMatch) {
            defaultFont = defaultFontMatch[1];
            fonts.add(defaultFont);
          }

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

        const themeFile = zip.file('word/theme/theme1.xml');
        if (themeFile) {
          const themeXml = await themeFile.async('string');

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

        const documentFile = zip.file('word/document.xml');
        if (documentFile) {
          const documentXml = await documentFile.async('string');

          const fontCounts = {};
          const fontMatches = documentXml.matchAll(/<w:rFonts[^>]*w:ascii="([^"]+)"/g);
          for (const match of fontMatches) {
            const fontName = match[1];
            if (fontName && fontName !== 'Arial' && fontName !== 'Calibri' && fontName !== 'Times New Roman') {
              fontCounts[fontName] = (fontCounts[fontName] || 0) + 1;
              fonts.add(fontName);
            }
          }

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

      let pageWidth = 8.5;
      let pageHeight = 11;
      let marginTop = 1;
      let marginBottom = 1;
      let marginLeft = 1;
      let marginRight = 1;
      let lineSpacing = 1.15;
      let paragraphSpacingBefore = 0;
      let paragraphSpacingAfter = 8;

      let processedBuffer = buffer;
      try {
        const documentFile = zip.file('word/document.xml');
        if (documentFile) {
          let documentXml = await documentFile.async('string');
          let changesMade = false;

          const totalParagraphs = (documentXml.match(/<w:p[ >]/g) || []).length;
          console.log('[DOCX Main] Total paragraphs in document:', totalParagraphs);

          const pgSzMatch = documentXml.match(/<w:pgSz[^>]*w:w="(\d+)"[^>]*w:h="(\d+)"/);
          if (pgSzMatch) {
            pageWidth = parseInt(pgSzMatch[1]) / 1440;
            pageHeight = parseInt(pgSzMatch[2]) / 1440;
            console.log('[DOCX Main] Page size:', pageWidth, 'x', pageHeight, 'inches');
          }
          const pgSzMatch2 = documentXml.match(/<w:pgSz[^>]*w:h="(\d+)"[^>]*w:w="(\d+)"/);
          if (pgSzMatch2) {
            pageHeight = parseInt(pgSzMatch2[1]) / 1440;
            pageWidth = parseInt(pgSzMatch2[2]) / 1440;
            console.log('[DOCX Main] Page size (alt):', pageWidth, 'x', pageHeight, 'inches');
          }

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

          const spacingMatches = documentXml.match(/<w:spacing[^>]*w:line="(\d+)"[^>]*w:lineRule="auto"[^>]*>/g) || [];
          if (spacingMatches.length > 0) {
            const lineCounts = {};
            for (const match of spacingMatches) {
              const lineMatch = match.match(/w:line="(\d+)"/);
              if (lineMatch) {
                const lineVal = parseInt(lineMatch[1]);
                lineCounts[lineVal] = (lineCounts[lineVal] || 0) + 1;
              }
            }
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
                paragraphSpacingBefore = parseInt(val) / 20;
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
                paragraphSpacingAfter = parseInt(val) / 20;
              }
            }
          }
          console.log('[DOCX Main] Paragraph spacing - before:', paragraphSpacingBefore, 'pt, after:', paragraphSpacingAfter, 'pt');

          const pageBreakPattern = /<w:br[^>]*w:type="page"[^>]*\/?>/g;
          const pageBreakCount = (documentXml.match(pageBreakPattern) || []).length;
          if (pageBreakCount > 0) {
            documentXml = documentXml.replace(pageBreakPattern, '<w:t xml:space="preserve">⁂PAGEBREAK⁂</w:t>');
            console.log('[DOCX Main] Marked', pageBreakCount, 'page breaks for preservation');
            changesMade = true;
          }

          const emptyRunPattern = /(<w:r[^>]*>(?:<w:rPr>[\s\S]*?<\/w:rPr>)?)\s*(<\/w:r>)/g;
          const emptyRunCount = (documentXml.match(emptyRunPattern) || []).length;
          if (emptyRunCount > 0) {
            documentXml = documentXml.replace(emptyRunPattern, '$1<w:t xml:space="preserve">⁂EMPTYRUN⁂</w:t>$2');
            console.log('[DOCX Main] Marked', emptyRunCount, 'empty runs for preservation');
            changesMade = true;
          }

          const emptyParagraphNoRunPattern = /(<w:p(?:[^>]*)>(?:\s*<w:pPr>[\s\S]*?<\/w:pPr>)?)\s*(<\/w:p>)/g;
          const emptyParaCount = (documentXml.match(emptyParagraphNoRunPattern) || []).length;
          if (emptyParaCount > 0) {
            documentXml = documentXml.replace(emptyParagraphNoRunPattern, '$1<w:r><w:t xml:space="preserve">⁂EMPTYRUN⁂</w:t></w:r>$2');
            console.log('[DOCX Main] Marked', emptyParaCount, 'empty paragraphs (no runs) for preservation');
            changesMade = true;
          }

          const bookmarkOnlyPattern = /(<w:p(?:[^>]*)>(?:\s*<w:pPr>[\s\S]*?<\/w:pPr>)?(?:\s*<w:bookmarkStart[^>]*\/>|\s*<w:bookmarkEnd[^>]*\/>)+)\s*(<\/w:p>)/g;
          const bookmarkOnlyCount = (documentXml.match(bookmarkOnlyPattern) || []).length;
          if (bookmarkOnlyCount > 0) {
            documentXml = documentXml.replace(bookmarkOnlyPattern, '$1<w:r><w:t xml:space="preserve">⁂EMPTYRUN⁂</w:t></w:r>$2');
            console.log('[DOCX Main] Marked', bookmarkOnlyCount, 'bookmark-only paragraphs for preservation');
            changesMade = true;
          }

          if (changesMade) {
            zip.file('word/document.xml', documentXml);

            processedBuffer = await zip.generateAsync({ type: 'nodebuffer' });
            console.log('[DOCX Main] Regenerated buffer with preserved empty content');
          }
        }
      } catch (preprocessErr) {
        console.log('[DOCX Main] Pre-processing failed, using original:', preprocessErr.message);
      }

      const options = {
        buffer: processedBuffer,
        ignoreEmptyParagraphs: false,
        styleMap: [
          "p[style-name='Heading 1'] => h1:fresh",
          "p[style-name='Heading 2'] => h2:fresh",
          "p[style-name='Heading 3'] => h3:fresh",
          "p[style-name='Heading 4'] => h4:fresh",
          "p[style-name='Heading 5'] => h5:fresh",
          "p[style-name='Heading 6'] => h6:fresh",
          "p[style-name='heading 1'] => h1:fresh",
          "p[style-name='heading 2'] => h2:fresh",
          "p[style-name='heading 3'] => h3:fresh",
          "p[style-name='heading 4'] => h4:fresh",
          "p[style-name='heading 5'] => h5:fresh",
          "p[style-name='heading 6'] => h6:fresh",
          "p[style-name='Title'] => h1.title:fresh",
          "p[style-name='title'] => h1.title:fresh",
          "p[style-name='Subtitle'] => h2.subtitle:fresh",
          "p[style-name='subtitle'] => h2.subtitle:fresh",
          "r[style-name='Strong'] => strong",
          "r[style-name='Emphasis'] => em",
          "p[style-name='Quote'] => blockquote:fresh",
          "p[style-name='Block Quote'] => blockquote:fresh",
          "p[style-name='quote'] => blockquote:fresh",
          "p[style-name='List Paragraph'] => li:fresh",
          "p[style-name='List Number'] => li:fresh",
          "p[style-name='List Bullet'] => li:fresh",
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

      let html = result.value || '';

      const pageBreakMarkerCount = (html.match(/⁂PAGEBREAK⁂/g) || []).length;
      html = html.replace(/⁂PAGEBREAK⁂/g, '</p><div class="docx-page-break"></div><p>');
      console.log('[DOCX Main] Converted', pageBreakMarkerCount, 'page break markers');

      const markerCount = (html.match(/⁂EMPTYRUN⁂/g) || []).length;
      html = html.replace(/⁂EMPTYRUN⁂/g, '&nbsp;');
      console.log('[DOCX Main] Converted', markerCount, 'empty run markers to &nbsp;');

      html = html.replace(/<p([^>]*)>\s*<\/p>/g, '<p$1><br></p>');

      html = html.replace(/<(h[1-6])([^>]*)>\s*<\/\1>/g, '<$1$2><br></$1>');

      html = html.replace(/<p([^>]*)>(\s*<a[^>]*><\/a>\s*)<\/p>/g, '<p$1>$2<br></p>');
      html = html.replace(/<(h[1-6])([^>]*)>(\s*<a[^>]*><\/a>\s*)<\/\1>/g, '<$1$2>$3<br></$1>');

      html = html.replace(/<p([^>]*)>((?:\s*<a[^>]*><\/a>\s*)+)<\/p>/g, '<p$1>$2<br></p>');
      html = html.replace(/<(h[1-6])([^>]*)>((?:\s*<a[^>]*><\/a>\s*)+)<\/\1>/g, '<$1$2>$3<br></$1>');

      html = html.replace(/<li([^>]*)>\s*<\/li>/g, '<li$1><br></li>');

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

  ipcMain.handle('write-file-buffer', async (_e, filePath, uint8) => {
    try {
      fs.writeFileSync(filePath, Buffer.from(uint8));
      return true;
    } catch (err) {
      return { error: err.message };
    }
  });

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

  ipcMain.handle('compile-latex', async (_event, texPath, opts) => {
    console.log('[LATEX] compile-latex called with:', texPath, opts);

    const engine = opts?.engine || 'pdflatex';
    const workingDir = path.dirname(texPath);
    const texFilename = path.basename(texPath);
    const base = texFilename.replace(/\.tex$/, '');
    const compileArgs = [
      '-interaction=nonstopmode',
      '-halt-on-error',
      '-file-line-error',
      texFilename
    ];
    if (opts?.shellEscape) compileArgs.unshift('-shell-escape');

    let needsBib = !!opts?.bibtex;
    if (!needsBib) {
      try {
        const texContent = fs.readFileSync(texPath, 'utf8');
        needsBib = /\\bibliography\{|\\addbibresource\{|\\printbibliography|\\cite[ptsa]*\{/.test(texContent);
      } catch (e) { }
    }
    if (!needsBib) {
      try {
        const dirFiles = fs.readdirSync(workingDir);
        needsBib = dirFiles.some(f => f.endsWith('.bib'));
      } catch (e) { }
    }

    let useBiber = false;
    if (needsBib) {
      try {
        const texContent = fs.readFileSync(texPath, 'utf8');
        useBiber = /\\usepackage(\[.*?\])?\{biblatex\}/.test(texContent);
      } catch (e) { }
    }

    console.log('[LATEX] Running first pass:', engine, compileArgs.join(' '));
    const first = spawnSync(engine, compileArgs, { encoding: 'utf8', cwd: workingDir });

    if (needsBib) {
      if (useBiber) {
        console.log('[LATEX] Running biber on:', base);
        const biber = spawnSync('biber', [base], { encoding: 'utf8', cwd: workingDir });
        console.log('[LATEX] Biber:', biber.status === 0 ? 'OK' : (biber.stderr || 'FAILED'));
      } else {
        console.log('[LATEX] Running bibtex on:', base);
        const bib = spawnSync('bibtex', [base], { encoding: 'utf8', cwd: workingDir });
        console.log('[LATEX] Bibtex:', bib.status === 0 ? 'OK' : (bib.stderr || 'FAILED'));
        if (bib.status !== 0) {
          console.log('[LATEX] bibtex failed, trying biber as fallback...');
          spawnSync('biber', [base], { encoding: 'utf8', cwd: workingDir });
        }
      }
    }

    console.log('[LATEX] Running second pass');
    spawnSync(engine, compileArgs, { encoding: 'utf8', cwd: workingDir });

    console.log('[LATEX] Running third pass');
    const result = spawnSync(engine, compileArgs, { encoding: 'utf8', cwd: workingDir });

    const pdfPath = texPath.replace(/\.tex$/, '.pdf');
    const ok = result.status === 0;

    console.log('[LATEX] DONE. Status:', ok ? 'OK' : 'ERROR', 'bib:', needsBib ? (useBiber ? 'biber' : 'bibtex') : 'none');

    return {
      ok,
      pdfPath,
      log: result.stdout || '',
      error: !ok ? (result.stderr || result.stdout) : null
    };
  });

  ipcMain.handle('file-exists', async (_event, filePath) => {
    try {
      await fsPromises.access(filePath);
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle('zip-items', async (_event, itemPaths, customName) => {
    const archiver = require('archiver');

    try {
      if (!itemPaths || itemPaths.length === 0) {
        return { error: 'No items to zip' };
      }

      const firstItem = itemPaths[0];
      const parentDir = path.dirname(firstItem);

      let baseName = customName || (itemPaths.length === 1
        ? path.basename(firstItem, path.extname(firstItem))
        : 'archive');

      baseName = baseName.replace(/\.zip$/i, '');

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
        const entry = zip.getEntry(entryPath);
        if (!entry) {
          return { error: `Entry not found: ${entryPath}` };
        }

        if (entry.isDirectory) {
          const entries = zip.getEntries().filter(e => e.entryName.startsWith(entryPath));
          for (const e of entries) {
            zip.extractEntryTo(e, targetDir, true, true);
          }
        } else {
          zip.extractEntryTo(entry, targetDir, true, true);
        }
        console.log(`[ZIP] Extracted ${entryPath} to ${targetDir}`);
      } else {
        zip.extractAllTo(targetDir, true);
        console.log(`[ZIP] Extracted all to ${targetDir}`);
      }

      return { success: true, targetDir };
    } catch (err) {
      console.error('[ZIP] Error extracting zip:', err);
      return { error: err.message };
    }
  });

  ipcMain.handle('read-file-buffer', async (event, filePath) => {
    try {
      console.log(`[Main Process] Reading file buffer for: ${filePath}`);
      try {
        await fsPromises.access(filePath);
      } catch {
        throw new Error(`File not found: ${filePath}`);
      }
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
      if (content instanceof ArrayBuffer || (content && content.byteLength !== undefined)) {
        await fsPromises.writeFile(filePath, Buffer.from(content));
      } else {
        await fsPromises.writeFile(filePath, content, 'utf8');
      }
      return { success: true, error: null };
    } catch (err) {
      console.error('Error writing file:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('write-docx-content', async (_, filePath, html, opts = {}) => {
    try {
      let buffer;
      try {
        const HTMLtoDOCX = require('html-to-docx');
        buffer = await HTMLtoDOCX(html, null, {
          table: { row: { cantSplit: true } },
          ...opts
        });
      } catch (requireErr) {
        console.warn('[write-docx-content] html-to-docx not available, falling back to JSZip:', requireErr.message);
        const JSZip = require('jszip');
        const zip = new JSZip();
        zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);
        zip.folder('_rels').file('.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);
        zip.folder('word').folder('_rels').file('document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`);
        zip.folder('word').file('document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    <w:p>
      <w:r>
        <w:t></w:t>
      </w:r>
    </w:p>
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`);
        buffer = await zip.generateAsync({ type: 'nodebuffer' });
      }
      await fsPromises.writeFile(filePath, buffer);
      return { success: true, error: null };
    } catch (err) {
      console.error('Error writing docx:', err);
      return { success: false, error: err.message };
    }
  });

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

  ipcMain.handle('readDirectoryImages', async (_, dirPath, maxDepth) => {
    const depth = typeof maxDepth === 'number' ? maxDepth : 2;
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
    const results = [];
    const subdirs = [];

    async function scanDir(dir, currentDepth) {
      try {
        const entries = await fsPromises.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.startsWith('.')) continue;
          const full = path.join(dir, entry.name);
          if (entry.isFile() && imageExtensions.some(ext => entry.name.toLowerCase().endsWith(ext))) {
            results.push({ url: `media://${full}`, path: full, folder: dir });
          } else if (entry.isDirectory() && currentDepth < depth) {
            await scanDir(full, currentDepth + 1);
          } else if (entry.isDirectory() && currentDepth >= depth) {
            subdirs.push(full);
          }
        }
      } catch {}
    }

    try {
      const fullPath = expandHomeDir(dirPath);
      await scanDir(fullPath, 0);
      return { images: results, deeperFolders: subdirs };
    } catch (error) {
      console.error('Error reading directory images:', error);
      return { images: [], deeperFolders: [] };
    }
  });

  ipcMain.handle('readDirectoryStructure', async (_, dirPath, options) => {
    const allowedExtensions = ['.py',
                               '.md',
                               '.js',
                               '.jsx',
                               '.docx',
                               '.csv',
                               '.xlsx',
                               '.doc',
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
                               '.sh',
                               '.ctx',
                               '.cpp',
                               '.c',
                               '.r',
                               '.jpg',
                               '.jpeg',
                               '.png',
                               '.gif',
                               '.webp',
                               '.bmp',
                               '.svg',
                               '.zip',
                               '.stl',
                               '.rs',
                               '.pltx',
                               '.sql',
                               '.db',
                               '.sqlite',
                               '.sqlite3',
                               '.mp4',
                               '.mov',
                               '.avi',
                               '.mkv',
                               '.webm',
                               '.wmv',
                               '.m4v',
                               '.flv',
                               '.ogv',
                               '.odt',
                               '.ods',
                               '.odp',
                              ];

    if (options?.customExtensions?.length) {
      for (const ext of options.customExtensions) {
        const normalized = ext.startsWith('.') ? ext.toLowerCase() : ('.' + ext.toLowerCase());
        if (!allowedExtensions.includes(normalized)) {
          allowedExtensions.push(normalized);
        }
      }
    }

    const ignorePatterns = ['node_modules', '.git', '.DS_Store'];

    const homeDir = os.homedir();
    const isHomeDir = dirPath === homeDir || dirPath === '~' || dirPath === homeDir + '/';
    const maxDepth = isHomeDir ? 2 : Infinity;

    async function readDirRecursive(currentPath, depth = 0) {
      const result = {};
      let items;
      try {
        items = await fsPromises.readdir(currentPath, { withFileTypes: true });
      } catch (err) {
        if (err.code === 'EACCES' || err.code === 'EPERM') {
          console.log(`[Main Process] Permission denied, skipping: ${currentPath}`);
          return result;
        }
        throw err;
      }
      for (const item of items) {
        if (item.isDirectory() && ignorePatterns.includes(item.name)) {
          continue;
        }

        const itemPath = path.join(currentPath, item.name);
        if (item.isDirectory()) {
          if (depth < maxDepth) {
            try {
              result[item.name] = {
                type: 'directory',
                path: itemPath,
                children: await readDirRecursive(itemPath, depth + 1)
              };
            } catch (err) {
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
            result[item.name] = {
              type: 'directory',
              path: itemPath,
              children: {}
            };
          }
        } else if (item.isFile()) {
          const ext = path.extname(item.name).toLowerCase();
          if (allowedExtensions.includes(ext)) {
            let mtime = 0;
            try { mtime = (await fsPromises.stat(itemPath)).mtimeMs; } catch {}
            result[item.name] = {
              type: 'file',
              path: itemPath,
              mtime
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

  ipcMain.handle('getNpcshHome', async () => {
    return ctx.INCOGNIDE_HOME || path.join(os.homedir(), '.incognide');
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

  ipcMain.handle('analyze-disk-usage', async (_, folderPath) => {
    console.log('[DiskUsage Main] Received request for:', folderPath);

    if (!folderPath) {
        console.error('[DiskUsage Main] No folder path provided');
        return null;
    }

    const SKIP_PATHS = ['/proc', '/sys', '/dev', '/run', '/snap', '/tmp/.X11-unix', '/var/run'];
    const shouldSkip = (p) => SKIP_PATHS.some(skip => p === skip || p.startsWith(skip + '/'));

    try {
        const analyzePath = async (currentPath, depth = 0, maxDepth = 3) => {
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
                                console.warn(`Skipping inaccessible: ${childPath}`);
                            }
                        }
                    } else {
                        for (const entry of entries) {
                            const childPath = path.join(currentPath, entry.name);
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
                            }
                        }
                    }
                } catch (readErr) {
                    console.warn(`Cannot read directory: ${currentPath}`);
                }

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

  ipcMain.handle('chmod', async (_, { path: filePath, mode, recursive, useSudo }) => {
      try {
          if (!filePath || !mode) {
              return { success: false, error: 'Path and mode are required' };
          }

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
  ipcMain.handle('search-files', async (_, { query, path: searchPath, limit = 50 }) => {
      try {
          if (!query || !searchPath) return { files: [] };

          const excludeDirs = new Set(['node_modules', '.git', '__pycache__', '.venv', 'venv', 'dist', 'build', '.cache', 'AppData', '.npm', '.nvm']);
          const excludeExts = new Set(['.exe', '.dll', '.so', '.dylib', '.bin', '.dat', '.db', '.sqlite', '.pack', '.idx', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.mp3', '.mp4', '.zip', '.tar', '.gz', '.7z', '.rar']);
          const results = [];
          const queryLower = query.toLowerCase();
          let filesChecked = 0;
          const maxFiles = 5000;

          const walkDir = async (dir, depth = 0) => {
              if (depth > 10 || results.length >= limit || filesChecked >= maxFiles) return;

              let entries;
              try {
                  entries = await fs.promises.readdir(dir, { withFileTypes: true });
              } catch (e) {
                  return;
              }

              for (const entry of entries) {
                  if (results.length >= limit || filesChecked >= maxFiles) break;

                  const fullPath = path.join(dir, entry.name);

                  if (entry.isDirectory()) {
                      if (!excludeDirs.has(entry.name.toLowerCase()) && !entry.name.startsWith('.')) {
                          await walkDir(fullPath, depth + 1);
                      }
                  } else if (entry.isFile()) {
                      const ext = path.extname(entry.name).toLowerCase();
                      if (excludeExts.has(ext)) continue;

                      filesChecked++;
                      try {
                          const stat = await fs.promises.stat(fullPath);
                          if (stat.size > 1024 * 1024) continue;

                          const content = await fs.promises.readFile(fullPath, 'utf-8');
                          const lines = content.split('\n');
                          const matches = [];

                          for (let i = 0; i < lines.length && matches.length < 3; i++) {
                              if (lines[i].toLowerCase().includes(queryLower)) {
                                  matches.push({ line: i + 1, content: lines[i].trim().slice(0, 200) });
                              }
                          }

                          if (matches.length > 0) {
                              results.push({
                                  name: entry.name,
                                  path: fullPath,
                                  snippet: matches.map(m => `L${m.line}: ${m.content}`).join('\n'),
                                  match: matches[0]?.content || ''
                              });
                          }
                      } catch (e) {
                      }
                  }
              }
          };

          await walkDir(searchPath);
          results.sort((a, b) => {
              const aHidden = a.name.startsWith('.') || a.path.includes('\\.') || a.path.includes('/.');
              const bHidden = b.name.startsWith('.') || b.path.includes('\\.') || b.path.includes('/.');
              if (aHidden !== bHidden) return aHidden ? 1 : -1;
              return a.path.length - b.path.length;
          });
          console.log(`[SEARCH_FILES] Found ${results.length} files for "${query}" in ${searchPath} (checked ${filesChecked} files)`);
          return { files: results };
      } catch (err) {
          console.error('[SEARCH_FILES] Error:', err);
          return { files: [], error: err.message };
      }
  });
}

module.exports = { register };
