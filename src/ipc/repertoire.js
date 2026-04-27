const path = require('path');
const fs = require('fs');
const fsPromises = fs.promises;
const os = require('os');
const { spawn } = require('child_process');

const REPERTOIRE_DIR = path.join(os.homedir(), '.npcsh', 'incognide', 'data', 'repertoire');

function ensureRepertoireDir() {
  try { fs.mkdirSync(REPERTOIRE_DIR, { recursive: true }); } catch {}
}

function safeFilename(s) {
  return (s || 'untitled').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80);
}

// =========================================================================
// Standard MIDI File parser (format 0/1) — extracts per-track note events.
// Returns { ticksPerQuarter, tempoBpm, tracks: [{ name, notes:[{midi,startBeat,durationBeats,velocity}] }] }
// =========================================================================
function parseSmf(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  let p = 0;

  function read32() { const v = buf.readUInt32BE(p); p += 4; return v; }
  function read16() { const v = buf.readUInt16BE(p); p += 2; return v; }
  function read8() { const v = buf.readUInt8(p); p += 1; return v; }
  function readVarLen() {
    let v = 0;
    for (;;) {
      const b = read8();
      v = (v << 7) | (b & 0x7f);
      if ((b & 0x80) === 0) return v;
    }
  }

  // Header
  if (buf.slice(p, p + 4).toString('ascii') !== 'MThd') throw new Error('not a MIDI file (missing MThd)');
  p += 4;
  const headerLen = read32();
  const headerEnd = p + headerLen;
  /* format */ read16();
  const ntracks = read16();
  const division = read16();
  if (division & 0x8000) throw new Error('SMPTE timing not supported');
  const ticksPerQuarter = division;
  p = headerEnd;

  let microsPerQuarter = 500000; // default 120 BPM
  const tracks = [];

  for (let t = 0; t < ntracks; t++) {
    if (buf.slice(p, p + 4).toString('ascii') !== 'MTrk') throw new Error(`track ${t} missing MTrk`);
    p += 4;
    const trkLen = read32();
    const trkEnd = p + trkLen;

    let trackTick = 0;
    let runningStatus = 0;
    let trackName = '';
    // Map noteOn -> { startTick, velocity }
    const open = new Map(); // key: `${ch}_${midi}` -> { startTick, velocity }
    const noteEvents = []; // { midi, startTick, endTick, velocity }
    let firstChannel = -1;

    while (p < trkEnd) {
      const delta = readVarLen();
      trackTick += delta;
      let status = read8();
      if (status < 0x80) {
        // running status — re-use prev status, current byte is data
        p--;
        status = runningStatus;
      } else {
        runningStatus = status;
      }

      if (status === 0xff) {
        // meta event
        const metaType = read8();
        const len = readVarLen();
        const data = buf.slice(p, p + len);
        p += len;
        if (metaType === 0x03) {
          trackName = data.toString('utf8').trim();
        } else if (metaType === 0x51 && len === 3) {
          microsPerQuarter = (data[0] << 16) | (data[1] << 8) | data[2];
        } else if (metaType === 0x2f) {
          break; // end of track
        }
      } else if (status === 0xf0 || status === 0xf7) {
        const len = readVarLen();
        p += len;
      } else {
        const high = status & 0xf0;
        const ch = status & 0x0f;
        if (firstChannel < 0) firstChannel = ch;
        if (high === 0x80 || high === 0x90) {
          const midi = read8();
          const vel = read8();
          const key = `${ch}_${midi}`;
          if (high === 0x90 && vel > 0) {
            open.set(key, { startTick: trackTick, velocity: vel });
          } else {
            // note off (or note on w/ vel 0)
            const o = open.get(key);
            if (o) {
              noteEvents.push({ midi, startTick: o.startTick, endTick: trackTick, velocity: o.velocity });
              open.delete(key);
            }
          }
        } else if (high === 0xa0 || high === 0xb0 || high === 0xe0) {
          p += 2;
        } else if (high === 0xc0 || high === 0xd0) {
          p += 1;
        } else {
          // Unknown; bail to track end to be safe
          p = trkEnd;
        }
      }
    }
    p = trkEnd;

    // Close any dangling notes at trackTick
    for (const [key, o] of open.entries()) {
      const [, midiStr] = key.split('_');
      noteEvents.push({ midi: parseInt(midiStr), startTick: o.startTick, endTick: trackTick, velocity: o.velocity });
    }

    if (noteEvents.length === 0) continue; // skip empty tracks (often track 0 in format-1)

    const notes = noteEvents.map(n => ({
      midi: n.midi,
      startBeat: n.startTick / ticksPerQuarter,
      durationBeats: Math.max(0.0625, (n.endTick - n.startTick) / ticksPerQuarter),
      velocity: Math.max(0.1, Math.min(1, n.velocity / 127)),
    }));

    tracks.push({
      name: trackName || `Track ${tracks.length + 1}`,
      notes,
    });
  }

  const tempoBpm = Math.round(60000000 / microsPerQuarter);
  return { ticksPerQuarter, tempoBpm, tracks };
}

// =========================================================================
// Build MusicXML string from parsed MIDI tracks.
// Quantizes to a 16th-note grid, drops sub-1/16 noise hits, and splits any wide-range
// single track into treble + bass parts so the result is readable on staff.
// =========================================================================
function midiTracksToMusicXml({ tracks, tempoBpm, title, composer }) {
  const tsNum = 4, tsDenom = 4;
  const beatsPerMeasure = tsNum;
  const divisions = 4; // ticks per quarter in MusicXML output (16ths)
  const QUANT = 0.25;  // quantization grid: 16th note (in beats)
  const MIN_DUR = 0.25; // minimum kept note duration (16th)

  if (!tracks || tracks.length === 0) tracks = [{ name: 'Track 1', notes: [] }];

  // Quantize + filter every track
  const quantize = (v) => Math.round(v / QUANT) * QUANT;
  tracks = tracks.map(t => {
    const cleaned = t.notes
      .map(n => ({
        midi: n.midi,
        startBeat: Math.max(0, quantize(n.startBeat)),
        durationBeats: Math.max(MIN_DUR, quantize(n.durationBeats)),
        velocity: n.velocity,
      }))
      .filter(n => n.durationBeats >= MIN_DUR);
    return { ...t, notes: cleaned };
  });

  // Auto-split: if a single wide-range track is the only input (typical of basic-pitch),
  // split into treble (>=60) and bass (<60) parts so it's readable.
  if (tracks.length === 1 && tracks[0].notes.length > 0) {
    const ns = tracks[0].notes;
    const minP = Math.min(...ns.map(n => n.midi));
    const maxP = Math.max(...ns.map(n => n.midi));
    if (maxP - minP > 24 || minP < 55) {
      const baseName = tracks[0].name || 'Derived';
      const treble = ns.filter(n => n.midi >= 60);
      const bass = ns.filter(n => n.midi < 60);
      tracks = [];
      if (treble.length) tracks.push({ name: `${baseName} (RH)`, notes: treble });
      if (bass.length) tracks.push({ name: `${baseName} (LH)`, notes: bass });
      if (tracks.length === 0) tracks = [{ name: baseName, notes: ns }];
    }
  }

  // Compute total measures across all tracks
  let maxEndBeat = 0;
  for (const t of tracks) {
    for (const n of t.notes) {
      const end = n.startBeat + n.durationBeats;
      if (end > maxEndBeat) maxEndBeat = end;
    }
  }
  const totalMeasures = Math.max(1, Math.ceil(maxEndBeat / beatsPerMeasure));

  function midiToPitch(midi) {
    const names = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'];
    const alters = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0];
    const pc = midi % 12;
    const octave = Math.floor(midi / 12) - 1;
    return { step: names[pc], alter: alters[pc], octave };
  }
  function durationType(beats) {
    if (beats >= 4) return 'whole';
    if (beats >= 2) return 'half';
    if (beats >= 1) return 'quarter';
    if (beats >= 0.5) return 'eighth';
    if (beats >= 0.25) return '16th';
    return '32nd';
  }
  function escapeXml(s) {
    return (s || '').replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
  }

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">\n';
  xml += '<score-partwise version="4.0">\n';
  xml += `  <work><work-title>${escapeXml(title || 'Untitled')}</work-title></work>\n`;
  xml += '  <identification>\n';
  xml += `    <creator type="composer">${escapeXml(composer || '')}</creator>\n`;
  xml += '    <encoding><software>Incognide Scherzo (basic-pitch)</software></encoding>\n';
  xml += '  </identification>\n';
  xml += '  <part-list>\n';
  tracks.forEach((t, i) => {
    xml += `    <score-part id="P${i + 1}"><part-name>${escapeXml(t.name)}</part-name></score-part>\n`;
  });
  xml += '  </part-list>\n';

  tracks.forEach((track, partIdx) => {
    // Clef heuristic
    const avgMidi = track.notes.length
      ? track.notes.reduce((s, n) => s + n.midi, 0) / track.notes.length
      : 60;
    const clefSign = avgMidi < 60 ? 'F' : 'G';
    const clefLine = clefSign === 'F' ? 4 : 2;

    xml += `  <part id="P${partIdx + 1}">\n`;

    // Group notes per measure
    const perMeasure = Array.from({ length: totalMeasures }, () => []);
    for (const n of track.notes) {
      const mIdx = Math.floor(n.startBeat / beatsPerMeasure);
      if (mIdx >= 0 && mIdx < totalMeasures) perMeasure[mIdx].push(n);
    }

    for (let m = 0; m < totalMeasures; m++) {
      xml += `    <measure number="${m + 1}">\n`;
      if (m === 0) {
        xml += '      <attributes>\n';
        xml += `        <divisions>${divisions}</divisions>\n`;
        xml += '        <key><fifths>0</fifths></key>\n';
        xml += `        <time><beats>${tsNum}</beats><beat-type>${tsDenom}</beat-type></time>\n`;
        xml += `        <clef><sign>${clefSign}</sign><line>${clefLine}</line></clef>\n`;
        xml += '      </attributes>\n';
        xml += `      <direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${tempoBpm}</per-minute></metronome></direction-type></direction>\n`;
      }

      const sorted = perMeasure[m].slice().sort((a, b) => a.startBeat - b.startBeat);
      const measureStart = m * beatsPerMeasure;

      if (sorted.length === 0) {
        xml += `      <note><rest/><duration>${beatsPerMeasure * divisions}</duration><type>whole</type></note>\n`;
      } else {
        let cursor = measureStart;
        for (let i = 0; i < sorted.length; i++) {
          const n = sorted[i];
          if (n.startBeat > cursor + 0.01) {
            const restDur = n.startBeat - cursor;
            xml += `      <note><rest/><duration>${Math.max(1, Math.round(restDur * divisions))}</duration><type>${durationType(restDur)}</type></note>\n`;
          }
          const dur = Math.min(n.durationBeats, measureStart + beatsPerMeasure - n.startBeat);
          const xmlDur = Math.max(1, Math.round(dur * divisions));
          const isChord = i > 0 && Math.abs(sorted[i].startBeat - sorted[i - 1].startBeat) < 0.01;
          const { step, alter, octave } = midiToPitch(n.midi);

          xml += '      <note>\n';
          if (isChord) xml += '        <chord/>\n';
          xml += `        <pitch><step>${step}</step>${alter ? `<alter>${alter}</alter>` : ''}<octave>${octave}</octave></pitch>\n`;
          xml += `        <duration>${xmlDur}</duration>\n`;
          xml += `        <type>${durationType(dur)}</type>\n`;
          xml += `        <dynamics><other-dynamics>${Math.round(n.velocity * 127)}</other-dynamics></dynamics>\n`;
          xml += '      </note>\n';

          if (!isChord) cursor = n.startBeat + dur;
        }
        const remaining = measureStart + beatsPerMeasure - cursor;
        if (remaining > 0.01) {
          xml += `      <note><rest/><duration>${Math.max(1, Math.round(remaining * divisions))}</duration><type>${durationType(remaining)}</type></note>\n`;
        }
      }
      xml += '    </measure>\n';
    }
    xml += '  </part>\n';
  });
  xml += '</score-partwise>\n';
  return xml;
}

function findHelperScript(scriptName) {
  const { app } = require('electron');
  const candidates = [
    path.resolve(__dirname, '..', '..', 'resources', scriptName),
    path.join(process.resourcesPath || '', scriptName),
    app && app.getAppPath ? path.join(app.getAppPath(), 'resources', scriptName) : null,
  ].filter(Boolean);
  return candidates.find(p => { try { return fs.existsSync(p); } catch { return false; } });
}

function register(ctx) {
  const { ipcMain, dbQuery, log } = ctx;

  ensureRepertoireDir();

  ipcMain.handle('repertoire:list', async () => {
    try {
      const rows = await dbQuery(
        'SELECT id, title, composer, album, audio_path, source_url, source_type, duration_sec, created_at, updated_at FROM repertoire ORDER BY updated_at DESC, id DESC'
      );
      return { success: true, items: rows };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('repertoire:get', async (_, id) => {
    try {
      const row = (await dbQuery('SELECT * FROM repertoire WHERE id = ?', [id]))[0];
      if (!row) return { success: false, error: 'not found' };
      const sheets = await dbQuery(
        'SELECT id, name, length(musicxml) AS xml_length, created_at FROM repertoire_sheets WHERE repertoire_id = ? ORDER BY id ASC',
        [id]
      );
      return { success: true, item: row, sheets };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('repertoire:getSheetXml', async (_, sheetId) => {
    try {
      const row = (await dbQuery('SELECT musicxml FROM repertoire_sheets WHERE id = ?', [sheetId]))[0];
      if (!row) return { success: false, error: 'sheet not found' };
      return { success: true, musicxml: row.musicxml };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('repertoire:create', async (_, { title, composer, audioPath, sourceUrl, sourceType }) => {
    try {
      const result = await dbQuery(
        'INSERT INTO repertoire (title, composer, audio_path, source_url, source_type) VALUES (?, ?, ?, ?, ?)',
        [title || 'Untitled', composer || null, audioPath || null, sourceUrl || null, sourceType || null]
      );
      return { success: true, id: result.lastID || result.insertId || null };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('repertoire:update', async (_, { id, fields }) => {
    try {
      const allowed = ['title', 'composer', 'album', 'audio_path', 'source_url', 'source_type', 'notes', 'duration_sec'];
      const setKeys = Object.keys(fields || {}).filter(k => allowed.includes(k));
      if (setKeys.length === 0) return { success: true };
      const setClause = setKeys.map(k => `${k} = ?`).join(', ');
      const params = setKeys.map(k => fields[k]);
      params.push(id);
      await dbQuery(
        `UPDATE repertoire SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        params
      );
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('repertoire:delete', async (_, id) => {
    try {
      // Best-effort delete the audio file too
      const row = (await dbQuery('SELECT audio_path FROM repertoire WHERE id = ?', [id]))[0];
      if (row?.audio_path && row.audio_path.startsWith(REPERTOIRE_DIR)) {
        try { await fsPromises.unlink(row.audio_path); } catch {}
      }
      await dbQuery('DELETE FROM repertoire_sheets WHERE repertoire_id = ?', [id]);
      await dbQuery('DELETE FROM repertoire WHERE id = ?', [id]);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('repertoire:attachSheet', async (_, { repertoireId, name, musicxml }) => {
    try {
      const result = await dbQuery(
        'INSERT INTO repertoire_sheets (repertoire_id, name, musicxml) VALUES (?, ?, ?)',
        [repertoireId, name || 'Sheet', musicxml]
      );
      return { success: true, id: result.lastID || result.insertId || null };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('repertoire:deleteSheet', async (_, sheetId) => {
    try {
      await dbQuery('DELETE FROM repertoire_sheets WHERE id = ?', [sheetId]);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Copy a local audio file into the repertoire directory and create an entry
  ipcMain.handle('repertoire:importLocalFile', async (_, { sourcePath, title, composer }) => {
    try {
      ensureRepertoireDir();
      const ext = path.extname(sourcePath).toLowerCase() || '.mp3';
      const base = safeFilename(title || path.basename(sourcePath, ext));
      const dest = path.join(REPERTOIRE_DIR, `${Date.now()}_${base}${ext}`);
      await fsPromises.copyFile(sourcePath, dest);
      const result = await dbQuery(
        'INSERT INTO repertoire (title, composer, audio_path, source_type) VALUES (?, ?, ?, ?)',
        [title || base, composer || null, dest, 'local']
      );
      return { success: true, id: result.lastID || result.insertId || null, audioPath: dest };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Shell out to yt-dlp. Assumes it's on PATH — surfaces a clear error if not.
  ipcMain.handle('repertoire:downloadYouTube', async (event, { url, title, composer }) => {
    return new Promise(async (resolve) => {
      try {
        ensureRepertoireDir();
        // Sanitize: strip whitespace, stray backslashes/quotes the user might paste in
        const cleanUrl = String(url || '')
          .trim()
          .replace(/^[\\"']+|[\\"']+$/g, '');
        if (!cleanUrl || !/^https?:\/\//i.test(cleanUrl)) {
          console.log('[repertoire] downloadYouTube: bad url:', JSON.stringify(url));
          resolve({ success: false, error: `Bad URL: ${url}` });
          return;
        }

        const safeBase = safeFilename(title || `yt_${Date.now()}`);
        const outTemplate = path.join(REPERTOIRE_DIR, `${Date.now()}_${safeBase}.%(ext)s`);
        const args = [
          '-x',
          '--audio-format', 'mp3',
          '--audio-quality', '0',
          '--no-playlist',
          '--no-warnings',
          '--write-info-json',          // dumps full metadata next to the audio
          '-o', outTemplate,
          '--print', 'after_move:filepath',
          cleanUrl,
        ];

        // PATH normalization — Electron sometimes loses /opt/homebrew/bin
        const env = {
          ...process.env,
          PATH: [
            process.env.PATH || '',
            '/opt/homebrew/bin',
            '/usr/local/bin',
            '/usr/bin',
            '/bin',
          ].filter(Boolean).join(':'),
        };

        console.log('[repertoire] yt-dlp spawn:', cleanUrl, '→', outTemplate);
        const proc = spawn('yt-dlp', args, { stdio: ['ignore', 'pipe', 'pipe'], env });
        let stdout = '';
        let stderr = '';
        proc.stdout.on('data', d => {
          const chunk = d.toString();
          stdout += chunk;
          process.stdout.write(`[yt-dlp out] ${chunk}`);
          try { event.sender.send('repertoire:downloadProgress', { url: cleanUrl, line: chunk }); } catch {}
        });
        proc.stderr.on('data', d => {
          const chunk = d.toString();
          stderr += chunk;
          process.stdout.write(`[yt-dlp err] ${chunk}`);
          try { event.sender.send('repertoire:downloadProgress', { url: cleanUrl, line: chunk }); } catch {}
        });
        proc.on('error', (err) => {
          console.log('[repertoire] yt-dlp spawn error:', err.message);
          if (err.code === 'ENOENT') {
            resolve({ success: false, error: 'yt-dlp not found on PATH. Install with: brew install yt-dlp' });
          } else {
            resolve({ success: false, error: `yt-dlp spawn failed: ${err.message}` });
          }
        });
        proc.on('close', async (code) => {
          console.log('[repertoire] yt-dlp exit', code);
          if (code !== 0) {
            resolve({ success: false, error: (stderr || `yt-dlp exited with code ${code}`).trim().slice(0, 500) });
            return;
          }
          // Last non-empty stdout line is the resolved filepath
          const finalPath = stdout.trim().split('\n').filter(Boolean).pop() || null;
          if (!finalPath || !fs.existsSync(finalPath)) {
            resolve({ success: false, error: `yt-dlp did not report an output file. stdout: ${stdout.slice(-200)}` });
            return;
          }

          // Pull metadata from the .info.json yt-dlp wrote next to the audio.
          // yt-dlp's filename varies; check several possibilities then fall back to a directory scan.
          let metaTitle = null, metaArtist = null, metaAlbum = null, metaDuration = null;
          try {
            const dir = path.dirname(finalPath);
            const baseNoExt = path.basename(finalPath).replace(/\.[^.]+$/, '');
            const candidates = [
              path.join(dir, `${baseNoExt}.info.json`),
              `${finalPath}.info.json`,
              finalPath.replace(/\.[^.]+$/, '.info.json'),
            ];
            let infoPath = candidates.find(p => fs.existsSync(p));
            if (!infoPath) {
              // Last-resort scan: any .info.json in the dir created in the last minute
              try {
                const recent = (await fsPromises.readdir(dir))
                  .filter(f => f.endsWith('.info.json'))
                  .map(f => ({ f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
                  .sort((a, b) => b.mtime - a.mtime);
                if (recent[0] && Date.now() - recent[0].mtime < 60_000) {
                  infoPath = path.join(dir, recent[0].f);
                }
              } catch {}
            }
            console.log('[repertoire] info.json path:', infoPath || '(not found)');
            if (infoPath) {
              const raw = await fsPromises.readFile(infoPath, 'utf8');
              const info = JSON.parse(raw);
              console.log('[repertoire] info.json keys:', Object.keys(info).filter(k =>
                ['title','track','artist','creator','uploader','channel','album','duration','release_year','playlist','playlist_title']
                .includes(k)
              ).map(k => `${k}=${JSON.stringify(info[k])?.slice(0, 80)}`).join(' | '));

              metaTitle = info.track || info.title || null;
              metaArtist = info.artist || info.creator || info.uploader || info.channel || null;
              metaAlbum = info.album || info.playlist_title || null;
              if (typeof info.duration === 'number') metaDuration = info.duration;

              // Many music videos title themselves "Artist - Song (Official Video)" — split that out
              // when no explicit artist field was provided.
              if (metaTitle && (!info.artist && !info.track)) {
                const m = String(metaTitle).match(/^\s*([^-—]{2,60})\s*[-—]\s*([^()\[\]]{2,120})/);
                if (m) {
                  const left = m[1].trim();
                  const right = m[2].trim().replace(/\s*\((Official|Audio|Video|Lyric|HD|HQ).*\)$/i, '');
                  // Heuristic: if the channel matches the left side, left is the artist
                  if (!metaArtist || metaArtist.toLowerCase().includes(left.toLowerCase()) || left.toLowerCase().includes((metaArtist || '').toLowerCase())) {
                    metaArtist = left;
                    metaTitle = right;
                  }
                }
              }

              try { await fsPromises.unlink(infoPath); } catch {}
            }
          } catch (e) {
            console.log('[repertoire] info.json parse warning:', e.message);
          }
          console.log('[repertoire] resolved metadata:', { metaTitle, metaArtist, metaAlbum, metaDuration });

          try {
            const result = await dbQuery(
              'INSERT INTO repertoire (title, composer, album, audio_path, source_url, source_type, duration_sec) VALUES (?, ?, ?, ?, ?, ?, ?)',
              [
                title || metaTitle || safeBase,
                composer || metaArtist || null,
                metaAlbum || null,
                finalPath,
                cleanUrl,
                'youtube',
                metaDuration,
              ]
            );
            console.log('[repertoire] inserted id', result.lastID || result.insertId, '→', finalPath, { metaTitle, metaArtist, metaAlbum });
            resolve({ success: true, id: result.lastID || result.insertId || null, audioPath: finalPath });
          } catch (dbErr) {
            resolve({ success: false, error: `db insert failed: ${dbErr.message}` });
          }
        });
      } catch (err) {
        console.log('[repertoire] downloadYouTube exception:', err.message);
        resolve({ success: false, error: err.message });
      }
    });
  });

  // Sheet derivation via basic-pitch — runs the inference helper, parses MIDI, emits MusicXML, stores it as a sheet.
  ipcMain.handle('repertoire:deriveSheet', async (event, { repertoireId }) => {
    try {
      const row = (await dbQuery('SELECT audio_path, title, composer FROM repertoire WHERE id = ?', [repertoireId]))[0];
      if (!row?.audio_path) return { success: false, error: 'no audio file for this entry' };
      if (!fs.existsSync(row.audio_path)) return { success: false, error: 'audio file missing on disk' };

      const scriptPath = findHelperScript('derive_basic_pitch.py');
      if (!scriptPath) return { success: false, error: 'derive_basic_pitch.py helper missing from resources' };

      // Resolve a Python that can import basic-pitch
      const fullCtx = ctx;
      let pythonPath = '/usr/bin/env';
      let pythonArgs = ['python3', scriptPath];
      try {
        const cfg = await fullCtx.readPythonEnvConfig?.();
        const cwd = process.env.HOME || process.cwd();
        const wsConfig = cfg?.workspaces?.[cwd] || cfg?.default;
        const resolved = wsConfig ? await fullCtx.resolvePythonPath?.(cwd, wsConfig) : null;
        if (resolved?.pythonPath) {
          pythonPath = resolved.pythonPath;
          pythonArgs = [scriptPath];
        }
      } catch {}
      // Fall back to the npc env if it exists
      if (pythonPath === '/usr/bin/env') {
        const npcPython = path.join(os.homedir(), '.pyenv', 'versions', 'npc', 'bin', 'python');
        if (fs.existsSync(npcPython)) {
          pythonPath = npcPython;
          pythonArgs = [scriptPath];
        }
      }

      const outDir = path.join(REPERTOIRE_DIR, 'derived');
      try { fs.mkdirSync(outDir, { recursive: true }); } catch {}
      const payload = JSON.stringify({ audio_path: row.audio_path, out_dir: outDir });

      const helperResult = await new Promise((resolve) => {
        const proc = spawn(pythonPath, pythonArgs, { stdio: ['pipe', 'pipe', 'pipe'] });
        let stdout = '';
        let stderr = '';
        proc.stdout.on('data', d => {
          const s = d.toString();
          stdout += s;
          try { event.sender.send('repertoire:downloadProgress', { url: row.audio_path, line: s }); } catch {}
        });
        proc.stderr.on('data', d => {
          const s = d.toString();
          stderr += s;
          try { event.sender.send('repertoire:downloadProgress', { url: row.audio_path, line: s }); } catch {}
        });
        proc.on('error', err => {
          if (err.code === 'ENOENT') {
            resolve({ success: false, error: `Python not found at ${pythonPath}. Install basic-pitch in your active env (pip install basic-pitch).` });
          } else {
            resolve({ success: false, error: `helper spawn failed: ${err.message}` });
          }
        });
        proc.on('close', () => {
          try {
            const last = stdout.trim().split('\n').filter(Boolean).pop();
            if (!last) {
              resolve({ success: false, error: stderr || 'helper produced no output' });
              return;
            }
            resolve(JSON.parse(last));
          } catch (e) {
            resolve({ success: false, error: `could not parse helper output: ${e.message}; stderr: ${stderr}` });
          }
        });
        try { proc.stdin.write(payload); proc.stdin.end(); } catch {}
      });

      if (!helperResult?.success) return { success: false, error: helperResult?.error || 'derivation failed' };

      // Helper returns either { stems: [{name, midi_path}, ...] } (new pipeline)
      // or legacy { midi_path }. Normalize to a stems list.
      const stems = Array.isArray(helperResult.stems)
        ? helperResult.stems
        : (helperResult.midi_path ? [{ name: 'all', midi_path: helperResult.midi_path }] : []);
      if (stems.length === 0) {
        return { success: false, error: 'helper reported no MIDI output' };
      }
      const missing = stems.filter(s => !s.midi_path || !fs.existsSync(s.midi_path));
      if (missing.length === stems.length) {
        return { success: false, error: `all reported MIDI files missing on disk` };
      }

      // Parse each stem's MIDI → one named track per stem; combine into one MusicXML.
      let xml;
      try {
        const allTracks = [];
        let bpm = 120;
        for (const stem of stems) {
          if (!stem.midi_path || !fs.existsSync(stem.midi_path)) continue;
          const midiBuf = await fsPromises.readFile(stem.midi_path);
          const parsed = parseSmf(midiBuf);
          if (parsed.tempoBpm) bpm = parsed.tempoBpm;
          // Tag each parsed track with the stem name (and skip empties)
          parsed.tracks.forEach((t, i) => {
            if (t.notes.length === 0) return;
            const baseName = stem.name || `Track ${allTracks.length + 1}`;
            const name = parsed.tracks.filter(x => x.notes.length > 0).length > 1
              ? `${baseName} ${i + 1}`
              : baseName;
            allTracks.push({ ...t, name });
          });
        }
        if (allTracks.length === 0) {
          return { success: false, error: 'all stems empty after MIDI parse' };
        }
        xml = midiTracksToMusicXml({
          tracks: allTracks,
          tempoBpm: bpm,
          title: row.title,
          composer: row.composer,
        });
      } catch (e) {
        return { success: false, error: `MIDI→MusicXML conversion failed: ${e.message}` };
      }

      // Insert as a sheet
      try {
        const insertResult = await dbQuery(
          'INSERT INTO repertoire_sheets (repertoire_id, name, musicxml) VALUES (?, ?, ?)',
          [repertoireId, `Derived ${new Date().toLocaleString()}`, xml]
        );
        return {
          success: true,
          sheetId: insertResult.lastID || insertResult.insertId || null,
          midiPath,
          numTracks: xml ? (xml.match(/<score-part /g) || []).length : 0,
        };
      } catch (e) {
        return { success: false, error: `db insert failed: ${e.message}` };
      }
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

module.exports = { register, REPERTOIRE_DIR };
