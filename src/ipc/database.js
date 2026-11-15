const path = require('path');
const fs = require('fs');
const os = require('os');
const { dialog, shell } = require('electron');
const sqlite3 = require('sqlite3');
const syncCategories = require('./syncCategories');

const DEFAULT_DB_PATH = process.env.INCOGNIDE_DB_PATH || path.join(os.homedir(), '.incognide', 'history.db');

const dbPath = DEFAULT_DB_PATH;

const parseConnectionString = (connString) => {
  if (!connString) {
    return { type: 'sqlite', path: DEFAULT_DB_PATH };
  }

  const str = connString.trim();

  const expandHome = (p) => p.startsWith('~') ? p.replace('~', os.homedir()) : p;

  if (str.match(/\.(db|sqlite|sqlite3)$/i) || str.startsWith('sqlite:') || str.startsWith('~') || str.startsWith('/') || str.startsWith('.')) {
    let dbPath = str;
    if (dbPath.startsWith('sqlite://')) {
      dbPath = dbPath.replace('sqlite://', '');
    } else if (dbPath.startsWith('sqlite:')) {
      dbPath = dbPath.replace('sqlite:', '');
    }
    dbPath = expandHome(dbPath);
    return { type: 'sqlite', path: path.resolve(dbPath) };
  }

  if (str.startsWith('postgres://') || str.startsWith('postgresql://')) {
    return { type: 'postgresql', connectionString: str };
  }

  if (str.startsWith('mysql://')) {
    return { type: 'mysql', connectionString: str };
  }

  if (str.startsWith('mssql://') || str.startsWith('sqlserver://')) {
    return { type: 'mssql', connectionString: str };
  }

  if (str.startsWith('snowflake://')) {
    return { type: 'snowflake', connectionString: str };
  }

  return { type: 'sqlite', path: path.resolve(expandHome(str)) };
};

const getListTablesSQL = (dbType) => {
  switch (dbType) {
    case 'postgresql':
      return "SELECT tablename as name FROM pg_tables WHERE schemaname = 'public'";
    case 'mysql':
      return "SHOW TABLES";
    case 'mssql':
      return "SELECT TABLE_NAME as name FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'";
    case 'snowflake':
      return "SHOW TABLES";
    case 'sqlite':
    default:
      return "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'";
  }
};

const getTableSchemaSQL = (dbType, tableName) => {
  switch (dbType) {
    case 'postgresql':
      return `SELECT column_name as name, data_type as type, is_nullable,
              CASE WHEN pk.column_name IS NOT NULL THEN 1 ELSE 0 END as pk
              FROM information_schema.columns c
              LEFT JOIN (
                SELECT ku.column_name FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage ku ON tc.constraint_name = ku.constraint_name
                WHERE tc.table_name = '${tableName}' AND tc.constraint_type = 'PRIMARY KEY'
              ) pk ON c.column_name = pk.column_name
              WHERE c.table_name = '${tableName}'`;
    case 'mysql':
      return `DESCRIBE ${tableName}`;
    case 'mssql':
      return `SELECT COLUMN_NAME as name, DATA_TYPE as type, IS_NULLABLE as is_nullable
              FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '${tableName}'`;
    case 'snowflake':
      return `DESCRIBE TABLE ${tableName}`;
    case 'sqlite':
    default:
      return `PRAGMA table_info(${tableName})`;
  }
};

const tryRequire = (moduleName) => {
  try {
    return require(moduleName);
  } catch (e) {
    return null;
  }
};

const executeOnDatabase = async (connConfig, query, params = []) => {
  const { type } = connConfig;

  if (type === 'sqlite') {
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(connConfig.path)) {
        return reject(new Error(`Database file not found: ${connConfig.path}`));
      }

      const isReadQuery = query.trim().toUpperCase().startsWith('SELECT') ||
                          query.trim().toUpperCase().startsWith('PRAGMA') ||
                          query.trim().toUpperCase().startsWith('SHOW');
      const mode = isReadQuery ? sqlite3.OPEN_READONLY : (sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE);

      const db = new sqlite3.Database(connConfig.path, mode, (err) => {
        if (err) return reject(err);

        // Resolve only once the handle is released. sqlite3's close() is async:
        // settling first leaves the file briefly locked, which surfaces as
        // EBUSY on Windows when the caller immediately removes the database.
        if (isReadQuery) {
          db.all(query, params, (err, rows) => {
            db.close(() => (err ? reject(err) : resolve(rows)));
          });
        } else {
          db.run(query, params, function(err) {
            const result = { lastID: this.lastID, changes: this.changes };
            db.close(() => (err ? reject(err) : resolve(result)));
          });
        }
      });
    });
  }

  if (type === 'postgresql') {
    const pg = tryRequire('pg');
    if (!pg) {
      throw new Error('PostgreSQL driver not installed. Run: npm install pg');
    }
    const client = new pg.Client({ connectionString: connConfig.connectionString });
    await client.connect();
    try {
      const result = await client.query(query, params);
      return result.rows;
    } finally {
      await client.end();
    }
  }

  if (type === 'mysql') {
    const mysql = tryRequire('mysql2/promise');
    if (!mysql) {
      throw new Error('MySQL driver not installed. Run: npm install mysql2');
    }
    const connection = await mysql.createConnection(connConfig.connectionString);
    try {
      const [rows] = await connection.execute(query, params);
      return Array.isArray(rows) ? rows : [rows];
    } finally {
      await connection.end();
    }
  }

  if (type === 'mssql') {
    const mssql = tryRequire('mssql');
    if (!mssql) {
      throw new Error('MSSQL driver not installed. Run: npm install mssql');
    }
    await mssql.connect(connConfig.connectionString);
    try {
      const result = await mssql.query(query);
      return result.recordset;
    } finally {
      await mssql.close();
    }
  }

  if (type === 'snowflake') {
    const snowflake = tryRequire('snowflake-sdk');
    if (!snowflake) {
      throw new Error('Snowflake driver not installed. Run: npm install snowflake-sdk');
    }

    const url = new URL(connConfig.connectionString);
    const connection = snowflake.createConnection({
      account: url.hostname,
      username: url.username,
      password: url.password,
      database: url.pathname.split('/')[1],
      schema: url.pathname.split('/')[2],
      warehouse: url.searchParams.get('warehouse')
    });

    return new Promise((resolve, reject) => {
      connection.connect((err, conn) => {
        if (err) return reject(err);
        conn.execute({
          sqlText: query,
          complete: (err, stmt, rows) => {
            conn.destroy();
            if (err) return reject(err);
            resolve(rows);
          }
        });
      });
    });
  }

  throw new Error(`Unsupported database type: ${type}`);
};

const getModelsDir = (basePath, isGlobal) => {
    if (isGlobal) {
        return path.join(os.homedir(), '.incognide', 'npc_team', 'models');
    }
    return path.join(basePath, 'npc_team', 'models');
};

const getModelsMetaPath = (basePath, isGlobal) => {
    const modelsDir = getModelsDir(basePath, isGlobal);
    return path.join(modelsDir, 'models_meta.json');
};

const loadModelsFromDir = (modelsDir) => {
    const models = [];
    if (!fs.existsSync(modelsDir)) return models;

    const metaPath = path.join(modelsDir, 'models_meta.json');
    let metadata = {};
    if (fs.existsSync(metaPath)) {
        try {
            metadata = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        } catch (e) {
            console.error('Error reading models metadata:', e);
        }
    }

    const sqlFiles = fs.readdirSync(modelsDir).filter(f => f.endsWith('.sql'));
    for (const file of sqlFiles) {
        const name = file.replace('.sql', '');
        const filePath = path.join(modelsDir, file);
        const sql = fs.readFileSync(filePath, 'utf-8');
        const meta = metadata[name] || {};

        models.push({
            id: name,
            name,
            sql,
            description: meta.description || '',
            schedule: meta.schedule || '',
            materialization: meta.materialization || 'table',
            npc: meta.npc || '',
            createdAt: meta.createdAt || new Date().toISOString(),
            updatedAt: meta.updatedAt || new Date().toISOString(),
            lastRunAt: meta.lastRunAt,
            lastRunResult: meta.lastRunResult,
            filePath
        });
    }
    return models;
};

const saveModelMeta = (modelsDir, name, meta) => {
    const metaPath = path.join(modelsDir, 'models_meta.json');
    let metadata = {};
    if (fs.existsSync(metaPath)) {
        try {
            metadata = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        } catch (e) {}
    }
    metadata[name] = meta;
    fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2));
};

function register(ctx) {
  const { ipcMain, dbQuery, ensureTablesExist, BACKEND_URL, log } = ctx;

  ipcMain.handle('db:addPdfHighlight', async (event, { filePath, text, position, annotation = '', color = 'yellow' }) => {
    console.log('[DB_ADD_HIGHLIGHT] Received request:', {
      filePath,
      textLength: text?.length,
      positionType: typeof position,
      position: position,
      annotation,
      color
    });

    try {
      const positionJson = JSON.stringify(position);
      console.log('[DB_ADD_HIGHLIGHT] Stringified position:', positionJson.substring(0, 100));

      const result = await dbQuery(
        'INSERT INTO pdf_highlights (file_path, highlighted_text, position_json, annotation, color) VALUES (?, ?, ?, ?, ?)',
        [filePath, text, positionJson, annotation, color]
      );

      console.log('[DB_ADD_HIGHLIGHT] Insert result:', result);
      return { success: true, lastID: result.lastID };
    } catch (error) {
      console.error('[DB_ADD_HIGHLIGHT] Error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:getHighlightsForFile', async (event, { filePath }) => {
    console.log('[DB_GET_HIGHLIGHTS] Fetching for file:', filePath);

    try {
      await ensureTablesExist();
      const rows = await dbQuery('SELECT * FROM pdf_highlights WHERE file_path = ? ORDER BY id ASC', [filePath]);

      console.log('[DB_GET_HIGHLIGHTS] Found rows:', rows.length);

      const highlights = rows.map(r => {
        console.log('[DB_GET_HIGHLIGHTS] Raw row:', r);

        let position = {};
        try {
          position = JSON.parse(r.position_json);
          console.log('[DB_GET_HIGHLIGHTS] Parsed position:', position);
        } catch (e) {
          console.error('[DB_GET_HIGHLIGHTS] Error parsing position_json:', e, r.position_json);
        }

        return {
          ...r,
          position: position,
          annotation: r.annotation || ''
        };
      });

      console.log('[DB_GET_HIGHLIGHTS] Returning highlights:', highlights);
      return { highlights };
    } catch (error) {
      console.error('[DB_GET_HIGHLIGHTS] Error:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('db:updatePdfHighlight', async (event, { id, annotation, color }) => {
    console.log('[DB_UPDATE_HIGHLIGHT] Updating highlight:', id);
    try {
      const updates = [];
      const params = [];

      if (annotation !== undefined) {
        updates.push('annotation = ?');
        params.push(annotation);
      }
      if (color !== undefined) {
        updates.push('color = ?');
        params.push(color);
      }

      if (updates.length === 0) {
        return { success: false, error: 'No updates provided' };
      }

      params.push(id);
      await dbQuery(`UPDATE pdf_highlights SET ${updates.join(', ')} WHERE id = ?`, params);
      return { success: true };
    } catch (error) {
      console.error('[DB_UPDATE_HIGHLIGHT] Error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:deletePdfHighlight', async (event, { id }) => {
    console.log('[DB_DELETE_HIGHLIGHT] Deleting highlight:', id);
    try {
      await dbQuery('DELETE FROM pdf_highlights WHERE id = ?', [id]);
      return { success: true };
    } catch (error) {
      console.error('[DB_DELETE_HIGHLIGHT] Error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:addPdfDrawing', async (event, { filePath, pageIndex, drawingType, svgPath, strokeColor, strokeWidth, positionX, positionY, width, height }) => {
    try {
      await ensureTablesExist();
      const result = await dbQuery(
        'INSERT INTO pdf_drawings (file_path, page_index, drawing_type, svg_path, stroke_color, stroke_width, position_x, position_y, width, height) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [filePath, pageIndex, drawingType || 'freehand', svgPath, strokeColor || '#000000', strokeWidth || 2, positionX || 0, positionY || 0, width || 100, height || 100]
      );
      return { success: true, lastID: result.lastID };
    } catch (error) {
      console.error('[DB_ADD_DRAWING] Error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:getDrawingsForFile', async (event, { filePath }) => {
    try {
      await ensureTablesExist();
      const rows = await dbQuery('SELECT * FROM pdf_drawings WHERE file_path = ? ORDER BY id ASC', [filePath]);
      return { drawings: rows };
    } catch (error) {
      console.error('[DB_GET_DRAWINGS] Error:', error);
      return { drawings: [] };
    }
  });

  ipcMain.handle('db:updatePdfDrawing', async (event, { id, positionX, positionY, width, height }) => {
    try {
      const fields = [];
      const values = [];
      if (positionX !== undefined) { fields.push('position_x = ?'); values.push(positionX); }
      if (positionY !== undefined) { fields.push('position_y = ?'); values.push(positionY); }
      if (width !== undefined) { fields.push('width = ?'); values.push(width); }
      if (height !== undefined) { fields.push('height = ?'); values.push(height); }
      if (fields.length === 0) return { success: false, error: 'No fields to update' };
      values.push(id);
      await dbQuery(`UPDATE pdf_drawings SET ${fields.join(', ')} WHERE id = ?`, values);
      return { success: true };
    } catch (error) {
      console.error('[DB_UPDATE_DRAWING] Error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:deleteDrawing', async (event, { id }) => {
    try {
      await dbQuery('DELETE FROM pdf_drawings WHERE id = ?', [id]);
      return { success: true };
    } catch (error) {
      console.error('[DB_DELETE_DRAWING] Error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:clearDrawingsForPage', async (event, { filePath, pageIndex }) => {
    try {
      await dbQuery('DELETE FROM pdf_drawings WHERE file_path = ? AND page_index = ?', [filePath, pageIndex]);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:listTables', async () => {
    try {
      const rows = await dbQuery("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';");
      return { tables: rows.map(r => r.name) };
    } catch (error) {
      return { error: error.message };
    }
  });

  ipcMain.handle('db:getTableSchema', async (event, { tableName }) => {

    if (!/^[a-zA-Z0-9_]+$/.test(tableName)) {
        return { error: 'Invalid table name provided.' };
    }
    try {
      const rows = await dbQuery(`PRAGMA table_info(${tableName});`);
      return { schema: rows.map(r => ({ name: r.name, type: r.type })) };
    } catch (error) {
      return { error: error.message };
    }
  });

  ipcMain.handle('open-in-native-explorer', async (event, folderPath) => {
      try {
          const expandedPath = folderPath.startsWith('~')
              ? path.join(os.homedir(), folderPath.slice(1))
              : folderPath;
          await shell.openPath(expandedPath);
          return { success: true };
      } catch (error) {
          return { error: error.message };
      }
  });

  ipcMain.handle('db:testConnection', async (event, { connectionString }) => {
    try {
      const connConfig = parseConnectionString(connectionString);
      const listSQL = getListTablesSQL(connConfig.type);

      const tables = await executeOnDatabase(connConfig, listSQL);
      const tableNames = tables.map(r => r.name || r.tablename || r.TABLE_NAME || Object.values(r)[0]);

      const result = {
        success: true,
        dbType: connConfig.type,
        tableCount: tableNames.length,
        tables: tableNames
      };

      if (connConfig.type === 'sqlite' && connConfig.path) {
        result.resolvedPath = connConfig.path;
        if (fs.existsSync(connConfig.path)) {
          const stats = fs.statSync(connConfig.path);
          result.fileSize = stats.size;
          result.lastModified = stats.mtime;
        }
      }

      return result;
    } catch (err) {
      const connConfig = parseConnectionString(connectionString);
      return {
        success: false,
        error: err.message,
        dbType: connConfig.type,
        resolvedPath: connConfig.path || null
      };
    }
  });

  ipcMain.handle('db:listTablesForPath', async (event, { connectionString }) => {
    try {
      const connConfig = parseConnectionString(connectionString);
      const listSQL = getListTablesSQL(connConfig.type);
      const tables = await executeOnDatabase(connConfig, listSQL);
      const tableNames = tables.map(r => r.name || r.tablename || r.TABLE_NAME || Object.values(r)[0]);
      return { tables: tableNames, dbType: connConfig.type };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('db:getTableSchemaForPath', async (event, { connectionString, tableName }) => {

    if (!/^[a-zA-Z0-9_.]+$/.test(tableName)) {
      return { error: 'Invalid table name provided.' };
    }

    try {
      const connConfig = parseConnectionString(connectionString);
      const schemaSQL = getTableSchemaSQL(connConfig.type, tableName);
      const schemaRows = await executeOnDatabase(connConfig, schemaSQL);

      const schema = schemaRows.map(r => ({
        name: r.name || r.column_name || r.COLUMN_NAME || r.Field,
        type: r.type || r.data_type || r.DATA_TYPE || r.Type,
        notnull: r.notnull || (r.is_nullable === 'NO') || (r.Null === 'NO') ? 1 : 0,
        pk: r.pk || (r.Key === 'PRI') ? 1 : 0
      }));

      let rowCount = null;
      try {
        const countResult = await executeOnDatabase(connConfig, `SELECT COUNT(*) as count FROM ${tableName}`);
        rowCount = countResult[0]?.count || countResult[0]?.COUNT || null;
      } catch (e) {

      }

      return { schema, rowCount, dbType: connConfig.type };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('db:executeSQLForPath', async (event, { connectionString, query, params = [] }) => {
    try {
      const connConfig = parseConnectionString(connectionString);
      const result = await executeOnDatabase(connConfig, query, params);

      if (Array.isArray(result)) {
        return { rows: result, dbType: connConfig.type };
      }

      return { ...result, dbType: connConfig.type };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('db:browseForDatabase', async () => {
    const { filePaths } = await dialog.showOpenDialog({
      title: 'Select Database File',
      filters: [
        { name: 'Database Files', extensions: ['db', 'sqlite', 'sqlite3', 'mdb', 'accdb'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile']
    });

    if (filePaths && filePaths.length > 0) {
      return { path: filePaths[0] };
    }
    return { path: null };
  });

  ipcMain.handle('db:getSupportedTypes', async () => {
    const types = [
      { type: 'sqlite', name: 'SQLite', installed: true, example: '~/database.db or sqlite:~/database.db' }
    ];

    if (tryRequire('pg')) {
      types.push({ type: 'postgresql', name: 'PostgreSQL', installed: true, example: 'postgresql://user:pass@host:5432/database' });
    } else {
      types.push({ type: 'postgresql', name: 'PostgreSQL', installed: false, example: 'postgresql://user:pass@host:5432/database', install: 'npm install pg' });
    }

    if (tryRequire('mysql2/promise')) {
      types.push({ type: 'mysql', name: 'MySQL', installed: true, example: 'mysql://user:pass@host:3306/database' });
    } else {
      types.push({ type: 'mysql', name: 'MySQL', installed: false, example: 'mysql://user:pass@host:3306/database', install: 'npm install mysql2' });
    }

    if (tryRequire('mssql')) {
      types.push({ type: 'mssql', name: 'SQL Server', installed: true, example: 'mssql://user:pass@host/database' });
    } else {
      types.push({ type: 'mssql', name: 'SQL Server', installed: false, example: 'mssql://user:pass@host/database', install: 'npm install mssql' });
    }

    if (tryRequire('snowflake-sdk')) {
      types.push({ type: 'snowflake', name: 'Snowflake', installed: true, example: 'snowflake://user:pass@account/db/schema?warehouse=WH' });
    } else {
      types.push({ type: 'snowflake', name: 'Snowflake', installed: false, example: 'snowflake://user:pass@account/db/schema?warehouse=WH', install: 'npm install snowflake-sdk' });
    }

    return types;
  });

  ipcMain.handle('db:exportCSV', async (event, data) => {
      if (!data || data.length === 0) {
          return { success: false, error: 'No data to export.'};
      }

      const { filePath } = await dialog.showSaveDialog({
          title: 'Export Query Results to CSV',
          defaultPath: `query-export-${Date.now()}.csv`,
          filters: [{ name: 'CSV Files', extensions: ['csv'] }]
      });

      if (!filePath) {
          return { success: false, message: 'Export cancelled.' };
      }

      try {
          const headers = Object.keys(data[0]).join(',');
          const rows = data.map(row => {
              return Object.values(row).map(value => {
                  const strValue = String(value ?? '');

                  if (strValue.includes(',') || strValue.includes('"') || strValue.includes('\n')) {
                      return `"${strValue.replace(/"/g, '""')}"`;
                  }
                  return strValue;
              }).join(',');
          });
          const csvContent = `${headers}\n${rows.join('\n')}`;
          fs.writeFileSync(filePath, csvContent, 'utf-8');
          return { success: true, path: filePath };
      } catch (error) {
          return { success: false, error: error.message };
      }
  });

  ipcMain.handle('getSqlModelsGlobal', async () => {
      try {
          const modelsDir = getModelsDir(null, true);
          const models = loadModelsFromDir(modelsDir);
          return { models };
      } catch (err) {
          console.error('Error loading global SQL models:', err);
          return { models: [], error: err.message };
      }
  });

  ipcMain.handle('getSqlModelsProject', async (event, currentPath) => {
      try {
          if (!currentPath) return { models: [], error: 'No project path provided' };
          const modelsDir = getModelsDir(currentPath, false);
          const models = loadModelsFromDir(modelsDir);
          return { models };
      } catch (err) {
          console.error('Error loading project SQL models:', err);
          return { models: [], error: err.message };
      }
  });

  ipcMain.handle('saveSqlModelGlobal', async (event, modelData) => {
      try {
          const modelsDir = getModelsDir(null, true);
          if (!fs.existsSync(modelsDir)) {
              fs.mkdirSync(modelsDir, { recursive: true });
          }

          const safeName = modelData.name.replace(/[^a-zA-Z0-9_-]/g, '_');
          const sqlFilePath = path.join(modelsDir, `${safeName}.sql`);

          fs.writeFileSync(sqlFilePath, modelData.sql);

          const meta = {
              description: modelData.description || '',
              schedule: modelData.schedule || '',
              materialization: modelData.materialization || 'table',
              npc: modelData.npc || '',
              createdAt: modelData.createdAt || new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              lastRunAt: modelData.lastRunAt,
              lastRunResult: modelData.lastRunResult
          };
          saveModelMeta(modelsDir, safeName, meta);

          return { success: true, model: { ...modelData, id: safeName, filePath: sqlFilePath } };
      } catch (err) {
          console.error('Error saving global SQL model:', err);
          return { success: false, error: err.message };
      }
  });

  ipcMain.handle('saveSqlModelProject', async (event, { path: projectPath, model: modelData }) => {
      try {
          if (!projectPath) return { success: false, error: 'No project path provided' };

          const modelsDir = getModelsDir(projectPath, false);
          if (!fs.existsSync(modelsDir)) {
              fs.mkdirSync(modelsDir, { recursive: true });
          }

          const safeName = modelData.name.replace(/[^a-zA-Z0-9_-]/g, '_');
          const sqlFilePath = path.join(modelsDir, `${safeName}.sql`);

          fs.writeFileSync(sqlFilePath, modelData.sql);

          const meta = {
              description: modelData.description || '',
              schedule: modelData.schedule || '',
              materialization: modelData.materialization || 'table',
              npc: modelData.npc || '',
              createdAt: modelData.createdAt || new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              lastRunAt: modelData.lastRunAt,
              lastRunResult: modelData.lastRunResult
          };
          saveModelMeta(modelsDir, safeName, meta);

          return { success: true, model: { ...modelData, id: safeName, filePath: sqlFilePath } };
      } catch (err) {
          console.error('Error saving project SQL model:', err);
          return { success: false, error: err.message };
      }
  });

  ipcMain.handle('deleteSqlModelGlobal', async (event, modelId) => {
      try {
          const modelsDir = getModelsDir(null, true);
          const sqlFilePath = path.join(modelsDir, `${modelId}.sql`);

          if (fs.existsSync(sqlFilePath)) {
              fs.unlinkSync(sqlFilePath);
          }

          const metaPath = path.join(modelsDir, 'models_meta.json');
          if (fs.existsSync(metaPath)) {
              try {
                  const metadata = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
                  delete metadata[modelId];
                  fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2));
              } catch (e) {}
          }

          return { success: true };
      } catch (err) {
          console.error('Error deleting global SQL model:', err);
          return { success: false, error: err.message };
      }
  });

  ipcMain.handle('deleteSqlModelProject', async (event, { path: projectPath, modelId }) => {
      try {
          if (!projectPath) return { success: false, error: 'No project path provided' };

          const modelsDir = getModelsDir(projectPath, false);
          const sqlFilePath = path.join(modelsDir, `${modelId}.sql`);

          if (fs.existsSync(sqlFilePath)) {
              fs.unlinkSync(sqlFilePath);
          }

          const metaPath = path.join(modelsDir, 'models_meta.json');
          if (fs.existsSync(metaPath)) {
              try {
                  const metadata = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
                  delete metadata[modelId];
                  fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2));
              } catch (e) {}
          }

          return { success: true };
      } catch (err) {
          console.error('Error deleting project SQL model:', err);
          return { success: false, error: err.message };
      }
  });

  ipcMain.handle('runSqlModel', async (event, { path: projectPath, modelId, isGlobal, targetDb: userTargetDb }) => {
      try {
          const modelsDir = getModelsDir(isGlobal ? null : projectPath, isGlobal);
          const sqlFilePath = path.join(modelsDir, `${modelId}.sql`);

          if (!fs.existsSync(sqlFilePath)) {
              return { success: false, error: `Model file not found: ${sqlFilePath}` };
          }

          const metaPath = path.join(modelsDir, 'models_meta.json');
          let meta = {};
          if (fs.existsSync(metaPath)) {
              try {
                  const allMeta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
                  meta = allMeta[modelId] || {};
              } catch (e) {}
          }

          const npcDirectory = isGlobal
              ? path.join(os.homedir(), '.incognide', 'npc_team')
              : path.join(projectPath, 'npc_team');

          let targetDb = userTargetDb || DEFAULT_DB_PATH;

          if (targetDb.startsWith('~')) {
              targetDb = path.join(os.homedir(), targetDb.slice(1));
          }

          const response = await fetch(`${BACKEND_URL}/api/npcsql/run_model`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  modelsDir: modelsDir,
                  modelName: modelId,
                  npcDirectory: npcDirectory,
                  targetDb: targetDb
              })
          });

          let result;
          if (!response.ok) {
              try {
                  result = await response.json();
              } catch (e) {
                  const errorText = await response.text();
                  result = { success: false, error: errorText || `HTTP ${response.status}` };
              }
          } else {
              result = await response.json();
          }

          meta.lastRunAt = new Date().toISOString();
          meta.lastRunResult = result.success ? 'success' : 'error';
          saveModelMeta(modelsDir, modelId, meta);

          return result;
      } catch (err) {
          console.error('Error running SQL model:', err);
          return { success: false, error: err.message };
      }
  });

  ipcMain.handle('runAllSqlModels', async (event, { path: projectPath, isGlobal, targetDb: userTargetDb }) => {
      const send = (data) => getMainWindow()?.webContents.send('sqlModels:runProgress', data);

      let targetDb = userTargetDb || DEFAULT_DB_PATH;
      if (targetDb.startsWith('~')) targetDb = path.join(os.homedir(), targetDb.slice(1));

      const results = [];

      const runSet = async (dir, global) => {
          if (!dir || !fs.existsSync(dir)) return;
          const sqlFiles = fs.readdirSync(dir).filter(f => f.endsWith('.sql'));
          for (const file of sqlFiles) {
              const modelId = file.replace(/\.sql$/, '');
              const npcDirectory = global
                  ? path.join(os.homedir(), '.incognide', 'npc_team')
                  : path.join(projectPath || os.homedir(), 'npc_team');
              send({ modelId, status: 'running', isGlobal: global });
              try {
                  const response = await fetch(`${BACKEND_URL}/api/npcsql/run_model`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ modelsDir: dir, modelName: modelId, npcDirectory, targetDb })
                  });
                  const result = response.ok ? await response.json() : { success: false, error: `HTTP ${response.status}` };
                  saveModelMeta(dir, modelId, { lastRunAt: new Date().toISOString(), lastRunResult: result.success ? 'success' : 'error' });
                  send({ modelId, status: result.success ? 'success' : 'error', message: result.success ? `${result.rows ?? 0} rows` : result.error, isGlobal: global });
                  results.push({ modelId, success: result.success, error: result.error });
              } catch (err) {
                  send({ modelId, status: 'error', message: err.message, isGlobal: global });
                  results.push({ modelId, success: false, error: err.message });
              }
          }
      };

      send({ modelId: null, status: 'start' });
      if (isGlobal !== false) await runSet(getModelsDir(null, true), true);
      if (projectPath) await runSet(getModelsDir(projectPath, false), false);
      send({ modelId: null, status: 'done', results });

      const succeeded = results.filter(r => r.success).length;
      return { success: true, total: results.length, succeeded, failed: results.length - succeeded, results };
  });

  ipcMain.handle('executeSQL', async (event, { query }) => {
    try {
      const rows = await dbQuery(query);
      return { result: rows, error: null };
    } catch (err) {
      return { result: null, error: err.message };
    }
  });

  /**
   * Export local data for sync, filtered by the user's category selection.
   *
   * The category list lives in src/ipc/syncCategories.js so the account panel,
   * the export, and the import all agree on what exists. A disabled category is
   * simply never queried, so opting out also means the data never leaves the
   * machine.
   *
   * `messages` remains the key name for conversation rows because the renderer's
   * existing encryption/push loop consumes it; splitting agent transcripts into
   * their own top-level key would require a parallel push path for no benefit.
   * Which agent rows are included is decided by the selection instead.
   */
  /**
   * Read/write the sync category selection.
   *
   * Stored in its own table rather than .incogniderc, which is line-oriented
   * KEY=value and awkward for a structured map.
   */
  const SYNC_SETTINGS_TABLE = `
    CREATE TABLE IF NOT EXISTS sync_settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `;

  /** Write one sync_settings row (creates the table first). */
  const setSyncSetting = async (key, value) =>
    new Promise((resolve, reject) => {
      const db = new sqlite3.Database(dbPath);
      db.all(SYNC_SETTINGS_TABLE, () => {
        db.run(
          `INSERT INTO sync_settings (key, value) VALUES (?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
          [key, value],
          (err) => {
            db.close();
            if (err) return reject(err);
            resolve(true);
          }
        );
      });
    });

  /**
   * Load the payload versions recorded by previous syncs, so a device that
   * already pushed a category at the current field list does not re-export it
   * in full on every sync.
   *
   * Reads once per process and caches the promise. The versions are process
   * state held in syncCategories, so re-reading before every export bought
   * nothing and opened an extra SQLite connection on a hot path that already
   * opens several -- measurable contention when tests run in parallel.
   */
  let payloadVersionsHydration = null;
  const hydratePayloadVersions = () => {
    if (!payloadVersionsHydration) {
      payloadVersionsHydration = new Promise((resolve) => {
        const db = new sqlite3.Database(dbPath);
        db.all(SYNC_SETTINGS_TABLE, () => {
          db.get(`SELECT value FROM sync_settings WHERE key = 'payloadVersions'`, [], (err, row) => {
            db.close();
            if (!err && row && row.value) {
              try {
                syncCategories.loadPayloadVersions(JSON.parse(row.value));
              } catch {
                // Corrupt value: start from scratch rather than failing sync.
              }
            }
            resolve();
          });
        });
      });
    }
    return payloadVersionsHydration;
  };

  const readSyncCategorySelection = async () =>
    new Promise((resolve) => {
      const db = new sqlite3.Database(dbPath);
      db.all(SYNC_SETTINGS_TABLE, () => {
        db.get(`SELECT value FROM sync_settings WHERE key = 'categories'`, [], (err, row) => {
          db.close();
          if (err || !row) return resolve(syncCategories.defaultSelection());
          try {
            resolve(syncCategories.normalizeSelection(JSON.parse(row.value)));
          } catch {
            resolve(syncCategories.defaultSelection());
          }
        });
      });
    });

  const setSyncCategorySelection = async (selection) =>
    new Promise((resolve, reject) => {
      const db = new sqlite3.Database(dbPath);
      db.all(SYNC_SETTINGS_TABLE, () => {
        db.run(
          `INSERT INTO sync_settings (key, value) VALUES ('categories', ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
          [JSON.stringify(selection)],
          (err) => {
            db.close();
            if (err) return reject(err);
            resolve(true);
          }
        );
      });
    });

  ipcMain.handle('sync:get-categories-selection', async () => {
    try {
      const selection = await readSyncCategorySelection();
      return { selection, error: null };
    } catch (err) {
      return { selection: syncCategories.defaultSelection(), error: err.message };
    }
  });

  ipcMain.handle('sync:export-data', async (_, { since, fullDump, categories } = {}) => {
    const sinceTs = (fullDump || !since) ? '1970-01-01T00:00:00.000Z' : since;

    /**
     * Compare timestamps format-agnostically.
     *
     * Timestamps in these tables are NOT consistently ISO-8601. Rows written by
     * npcsh (and by older Incognide builds that shared a database with it) look
     * like `2026-11-15 18:12:26` — space separator, no zone. Everything newer is
     * `2026-11-15T18:12:26.123Z`. SQLite compares those as *strings*, and at
     * position 10 a space (0x20) sorts below 'T' (0x54), so a space-format row
     * always reads as older than an ISO cursor. The result was that ~29k npcsh
     * rows and 3.9k browser history rows were NEVER selected by an incremental
     * sync — silently.
     *
     * datetime() normalises all three observed shapes (`... 18:12:26`,
     * `...T18:12:26.123Z`, `...T18:12:26.123`) to the same comparable value, so
     * this repairs already-ingested rows without needing a re-ingest.
     */
    const selection = syncCategories.normalizeSelection(categories);
    const enabled = new Set(syncCategories.enabledCategories(selection));

    /**
     * Categories whose encrypted field list changed since this device last
     * pushed them. They are exported from the epoch (not the cursor) so the
     * corrected fields are actually sent for rows that already exist remotely.
     * Without this, a fixed ENCRYPTED_FIELDS entry would only ever apply to
     * rows created after the fix, and every previously-pushed blob would stay
     * permanently missing those fields on other devices.
     */
    await hydratePayloadVersions();
    const staleSet = new Set(syncCategories.staleCategories(selection));
    const fullTs = '1970-01-01T00:00:00.000Z';
    /** Cursor to use for a category: epoch when its payload shape changed. */
    const sinceFor = (categoryId) => (staleSet.has(categoryId) ? fullTs : sinceTs);

    return new Promise((resolve) => {
      const db = new sqlite3.Database(dbPath);
      const result = {
        conversations: [], messages: [], bookmarks: [], history: [],
        // Additional category payloads. Kept as separate arrays so the renderer
        // can encrypt each with the right field list.
        pdfHighlights: [], pdfDrawings: [], kgEntities: [],
        kgRelations: [], kgTriples: [],
        fileIndex: [], agents: [],
        categories: selection,
        // Categories exported in full because their payload shape changed.
        staleCategories: [...staleSet],
      };

      // Run each category's query set; a missing table or error yields empty
      // arrays rather than aborting the whole sync.
      const jobs = [];

      const query = (sql, params = []) =>
        new Promise((res) => {
          db.all(sql, params, (err, rows) => {
            if (err) {
              // Tables differ between installs; absence is not a failure.
              if (!/no such table/i.test(err.message)) {
                console.error('[SYNC EXPORT] query error:', err.message);
              }
              return res([]);
            }
            res(rows || []);
          });
        });

      if (enabled.has('conversations') || enabled.has('agent_transcripts') || enabled.has('npcsh_history')) {
        jobs.push((async () => {
          // One query per included slice, then merge with de-duplication by
          // message_id so a row matched by two categories is not sent twice.
          const slices = [];

          if (enabled.has('conversations')) {
            // Native conversations and any transcript category not separately
            // requested. agent_transcripts/npcsh_history filter below.
            if (enabled.has('agent_transcripts') && enabled.has('npcsh_history')) {
              slices.push({ sql: `SELECT * FROM conversation_history WHERE datetime(timestamp) > datetime(?) ORDER BY timestamp ASC`, params: [sinceTs] });
            } else if (enabled.has('agent_transcripts')) {
              slices.push({ sql: `SELECT * FROM conversation_history WHERE datetime(timestamp) > datetime(?) AND (source_agent IS NULL OR source_agent = '' OR source_agent != 'npcsh') ORDER BY timestamp ASC`, params: [sinceTs] });
            } else if (enabled.has('npcsh_history')) {
              slices.push({ sql: `SELECT * FROM conversation_history WHERE datetime(timestamp) > datetime(?) AND (source_agent IS NULL OR source_agent = '' OR source_agent = 'npcsh') ORDER BY timestamp ASC`, params: [sinceTs] });
            } else {
              slices.push({ sql: `SELECT * FROM conversation_history WHERE datetime(timestamp) > datetime(?) AND (source_agent IS NULL OR source_agent = '') ORDER BY timestamp ASC`, params: [sinceTs] });
            }
          }
          if (enabled.has('agent_transcripts') && !enabled.has('conversations')) {
            slices.push({ sql: `SELECT * FROM conversation_history WHERE datetime(timestamp) > datetime(?) AND source_agent IS NOT NULL AND source_agent != '' AND source_agent != 'npcsh' ORDER BY timestamp ASC`, params: [sinceTs] });
          }
          if (enabled.has('npcsh_history') && !enabled.has('conversations')) {
            slices.push({ sql: `SELECT * FROM conversation_history WHERE datetime(timestamp) > datetime(?) AND source_agent = 'npcsh' ORDER BY timestamp ASC`, params: [sinceTs] });
          }

          const seen = new Set();
          const messages = [];
          for (const slice of slices) {
            for (const row of await query(slice.sql, slice.params)) {
              if (seen.has(row.message_id)) continue;
              seen.add(row.message_id);
              messages.push(row);
            }
          }
          messages.sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
          result.messages = messages;

          const convSeen = new Set();
          result.conversations = messages
            .filter((m) => {
              if (convSeen.has(m.conversation_id)) return false;
              convSeen.add(m.conversation_id);
              return true;
            })
            .map((m) => ({
              conversation_id: m.conversation_id,
              directory_path: m.directory_path,
              created_at: m.timestamp,
              updated_at: m.timestamp,
            }));
        })());
      }

      if (enabled.has('bookmarks')) {
        jobs.push((async () => {
          result.bookmarks = await query(
            `SELECT id, title, url, folder_path, is_global, timestamp
             FROM bookmarks WHERE datetime(timestamp) > datetime(?) ORDER BY timestamp DESC`, [sinceTs]);
        })());
      }

      if (enabled.has('browser_history')) {
        jobs.push((async () => {
          result.history = await query(
            `SELECT id, title, url, folder_path, visit_count, last_visited
             FROM browser_history WHERE datetime(last_visited) > datetime(?) ORDER BY last_visited DESC`, [sinceTs]);
        })());
      }

      if (enabled.has('pdf_annotations')) {
        jobs.push((async () => {
          // Filtered: these tables persist indefinitely, so an unfiltered SELECT
          // re-sends every highlight and drawing on every sync.
          const pdfSince = sinceFor('pdf_annotations');
          result.pdfHighlights = await query(
            `SELECT * FROM pdf_highlights WHERE datetime(timestamp) > datetime(?) ORDER BY timestamp ASC`, [pdfSince]);
          result.pdfDrawings = await query(
            `SELECT * FROM pdf_drawings WHERE datetime(timestamp) > datetime(?) ORDER BY timestamp ASC`, [pdfSince]);
        })());
      }

      if (enabled.has('knowledge_graph')) {
        jobs.push((async () => {
          // kg_entities carries updated_at; relations/triples carry only
          // created_at. Filter each on the timestamp it actually has rather
          // than shipping the whole graph every time.
          const kgSince = sinceFor('knowledge_graph');
          result.kgEntities = await query(
            `SELECT * FROM kg_entities WHERE datetime(updated_at) > datetime(?) ORDER BY updated_at ASC`, [kgSince]);
          result.kgRelations = await query(
            `SELECT * FROM kg_relations WHERE datetime(created_at) > datetime(?) ORDER BY created_at ASC`, [kgSince]);
          result.kgTriples = await query(
            `SELECT * FROM kg_triples WHERE datetime(created_at) > datetime(?) ORDER BY created_at ASC`, [kgSince]);
        })());
      }

      if (enabled.has('agent_registry')) {
        jobs.push((async () => {
          // Only the portable identity fields leave the machine. Discovery
          // output (home paths, credential presence) is deliberately excluded,
          // matching what agents:export already guarantees.
          result.agents = (await query(`SELECT id, label, command, pinned, custom FROM agents`))
            .map((a) => ({
              id: a.id,
              label: a.label,
              command: a.command,
              pinned: !!a.pinned,
              custom: !!a.custom,
            }));
        })());
      }

      if (enabled.has('file_index')) {
        jobs.push((async () => {
          // Filter on indexed_at, NOT mtime.
          //
          // `indexed_at` is when the row entered the index (written as
          // datetime('now')), which is what a sync cursor should track.
          // `mtime` is when the file on disk last changed: a file from 2019
          // indexed today has a 2019 mtime, so filtering on it would exclude
          // that row from every incremental sync forever. The first version of
          // this query made exactly that mistake.
          //
          // indexed_at is a datetime string, so it uses the same
          // format-agnostic datetime() comparison as the other categories.
          result.fileIndex = await query(
            `SELECT * FROM file_index WHERE datetime(indexed_at) > datetime(?) ORDER BY indexed_at ASC`,
            [sinceFor('file_index')]);
        })());
      }

      /**
       * Close the connection and only then resolve.
       *
       * sqlite3's close() is asynchronous. Resolving first leaves the file handle
       * open a moment longer, which on Windows means the caller can observe the
       * database as still locked (EBUSY on unlink). Awaiting the close callback
       * makes the operation complete before the promise settles.
       */
      const closeAndResolve = (err) => {
        if (err) console.error('[SYNC EXPORT] failed:', err.message);
        else console.log(`[SYNC EXPORT] categories=${[...enabled].join(',')} messages=${result.messages.length} bookmarks=${result.bookmarks.length} history=${result.history.length}`);
        db.close(() => resolve(result));
      };

      Promise.all(jobs)
        .then(() => closeAndResolve(null))
        .catch(closeAndResolve);
    });
  });

  /**
   * Describe the sync categories with live local row counts, for the account
   * panel's per-category toggles.
   */
  ipcMain.handle('sync:categories', async () => {
    try {
      const categories = await syncCategories.describeCategories({ dbPath });
      const selection = await readSyncCategorySelection();
      return { categories, selection, error: null };
    } catch (err) {
      return { categories: [], selection: syncCategories.defaultSelection(), error: err.message };
    }
  });

  /**
   * Record that the given categories were pushed at their current payload
   * version, so they stop being re-exported in full on every sync.
   *
   * Separate from the export call on purpose: the renderer invokes this only
   * after the push batches were accepted. That way an interrupted upload
   * leaves the category stale and the next sync retries it.
   */
  ipcMain.handle('sync:mark-categories-pushed', async (_, ids = []) => {
    try {
      const valid = (Array.isArray(ids) ? ids : []).filter(
        (id) => typeof id === 'string' && syncCategories.byId(id)
      );
      const versions = syncCategories.markCategoriesPushed(valid);
      await setSyncSetting('payloadVersions', JSON.stringify(versions));
      return { success: true, marked: valid, error: null };
    } catch (err) {
      return { success: false, marked: [], error: err.message };
    }
  });

  /** Persist the user's category selection. */
  ipcMain.handle('sync:set-categories', async (_, { selection } = {}) => {
    try {
      const normalized = syncCategories.normalizeSelection(selection);
      await setSyncCategorySelection(normalized);
      return { success: true, selection: normalized, error: null };
    } catch (err) {
      return { success: false, selection: syncCategories.defaultSelection(), error: err.message };
    }
  });

  ipcMain.handle('sync:import-data', async (_, {
    conversations, messages, bookmarks, history,
    pdfHighlights, pdfDrawings,
    kgEntities, kgRelations, kgTriples,
    fileIndex,
  }) => {
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(dbPath);
      let imported = {
        conversations: 0, messages: 0, bookmarks: 0, history: 0,
        pdfHighlights: 0, pdfDrawings: 0,
        kgEntities: 0, kgRelations: 0, kgTriples: 0,
        fileIndex: 0,
      };

      /**
       * Generic insert-or-ignore for a category whose column set differs between
       * installs. Reads the live table columns, intersects them with the keys
       * actually present on the incoming rows, and inserts only those. Missing
       * table or no overlap yields 0 rather than throwing.
       */
      const insertRows = (table, rows, keyColumns) => new Promise((res) => {
        if (!Array.isArray(rows) || rows.length === 0) return res(0);
        db.all(`PRAGMA table_info(${table})`, [], (err, cols) => {
          if (err || !cols || cols.length === 0) return res(0);
          const tableCols = cols.map((c) => c.name).filter((n) => n !== 'id');
          const usable = tableCols.filter((c) => rows.some((r) => r[c] !== undefined));
          if (usable.length === 0) return res(0);

          /**
           * Natural key to de-duplicate on.
           *
           * When a caller names no key columns, fall back to the WHOLE row
           * rather than to nothing. An empty key list used to mean "skip
           * de-duplication entirely", which made a repeat import append a
           * duplicate of every row -- and these tables have a bare
           * AUTOINCREMENT primary key, so INSERT OR IGNORE never stopped it.
           *
           * That was mostly harmless while imports were cursor-driven, but a
           * category is now re-exported in full when its payload shape changes
           * (see staleCategories), so a second full import is expected
           * behaviour, not an edge case. Falling back to the full tuple keeps
           * "re-import the same rows" a no-op while still allowing rows that
           * genuinely differ.
           */
          const explicitKeys = (keyColumns || []).filter((k) => usable.includes(k));
          const keys = explicitKeys.length > 0 ? explicitKeys : usable;

          /**
           * De-duplicate against what is ALREADY in the table, not just against
           * this batch.
           *
           * INSERT OR IGNORE only skips rows that violate a declared
           * constraint. Most of these tables have a bare AUTOINCREMENT primary
           * key and no natural-key uniqueness, so a repeated pull (or a pull
           * after a failed cursor advance) would insert the same rows again.
           * Querying the existing keys first makes import idempotent regardless
           * of the table's constraints.
           */
          const existing = new Set();
          const finishInsert = () => {
            const seen = new Set();
            const placeholders = usable.map(() => '?').join(',');
            const stmt = db.prepare(`INSERT OR IGNORE INTO ${table} (${usable.join(',')}) VALUES (${placeholders})`);
            let n = 0;
            for (const row of rows) {
              if (keys.length > 0) {
                const key = keys.map((k) => String(row[k] === undefined ? '' : row[k])).join('|');
                if (seen.has(key) || existing.has(key)) continue;
                seen.add(key);
              }
              stmt.run(usable.map((c) => (row[c] === undefined ? null : row[c])));
              n++;
            }
            stmt.finalize(() => res(n));
          };

          if (keys.length === 0) return finishInsert();

          db.all(`SELECT ${keys.join(',')} FROM ${table}`, [], (readErr, existingRows) => {
            if (!readErr && Array.isArray(existingRows)) {
              for (const row of existingRows) {
                existing.add(keys.map((k) => String(row[k] === undefined ? '' : row[k])).join('|'));
              }
            }
            finishInsert();
          });
        });
      });

      const getColumns = () => new Promise((res, rej) => {
        db.all("PRAGMA table_info(conversation_history)", [], (err, rows) => {
          if (err) rej(err);
          else res(rows.map(r => r.name).filter(n => n !== 'id'));
        });
      });

      const messageValue = (m, col) => {
        return m[col] ?? null;
      };

      const bookmarkValue = (b, col) => {
        if (col === 'is_global') return b[col] || 0;
        if (col === 'timestamp') return b[col] || Date.now();
        return b[col] ?? null;
      };

      const historyValue = (h, col) => {
        if (col === 'visit_count') return h[col] || 1;
        return h[col] ?? null;
      };

      db.serialize(async () => {
        if (messages && messages.length) {
          const cols = await getColumns();
          const placeholders = cols.map(() => '?').join(',');
          const stmt = db.prepare(
            `INSERT OR IGNORE INTO conversation_history (${cols.join(',')}) VALUES (${placeholders})`
          );
          for (const m of messages) {
            stmt.run(cols.map(c => messageValue(m, c)));
            imported.messages++;
          }
          stmt.finalize();
        }

        if (bookmarks && bookmarks.length) {
          const bmCols = (await getColumns()).filter(c => c !== 'id').map(c => c === 'folder_path' ? 'folder_path' : c);
          const bmColsFromTable = await new Promise((res, rej) => {
            db.all("PRAGMA table_info(bookmarks)", [], (err, rows) => {
              if (err) rej(err);
              else res(rows.map(r => r.name).filter(n => n !== 'id'));
            });
          });
          const urls = [...new Set(bookmarks.map(b => b.url).filter(Boolean))];
          if (urls.length > 0) {
            const placeholders = urls.map(() => '?').join(',');
            db.run(`DELETE FROM bookmarks WHERE url IN (${placeholders})`, urls);
          }
          const placeholders = bmColsFromTable.map(() => '?').join(',');
          const stmt = db.prepare(`INSERT INTO bookmarks (${bmColsFromTable.join(',')}) VALUES (${placeholders})`);
          for (const b of bookmarks) {
            stmt.run(bmColsFromTable.map(c => bookmarkValue(b, c)));
            imported.bookmarks++;
          }
          stmt.finalize();
        }

        if (history && history.length) {
          const histCols = await new Promise((res, rej) => {
            db.all("PRAGMA table_info(browser_history)", [], (err, rows) => {
              if (err) rej(err);
              else res(rows.map(r => r.name).filter(n => n !== 'id'));
            });
          });
          for (const h of history) {
            if (h.url && h.last_visited) {
              db.run('DELETE FROM browser_history WHERE url = ? AND last_visited = ?', [h.url, h.last_visited]);
            }
          }
          const placeholders = histCols.map(() => '?').join(',');
          const stmt = db.prepare(`INSERT INTO browser_history (${histCols.join(',')}) VALUES (${placeholders})`);
          for (const h of history) {
            stmt.run(histCols.map(c => historyValue(h, c)));
            imported.history++;
          }
          stmt.finalize();
        }

        // --- Additional category payloads ---
        // Best-effort: a table missing on this install must not abort the
        // message/bookmark/history import that already succeeded above.
        // Key on the CONTENT, not just the file. Keying a drawing on
        // `file_path` alone collapsed every stroke on the same PDF into one
        // row, so a second ink annotation was silently dropped on import.
        try { imported.pdfHighlights = await insertRows('pdf_highlights', pdfHighlights, ['file_path', 'highlighted_text', 'position_json']); } catch (err) { console.warn('[SYNC IMPORT] pdf_highlights:', err.message); }
        try { imported.pdfDrawings = await insertRows('pdf_drawings', pdfDrawings, ['file_path', 'page_index', 'svg_path']); } catch (err) { console.warn('[SYNC IMPORT] pdf_drawings:', err.message); }
        try { imported.kgEntities = await insertRows('kg_entities', kgEntities, ['name']); } catch (err) { console.warn('[SYNC IMPORT] kg_entities:', err.message); }
        // kg_relations is identified by `name` (UNIQUE upstream); kg_triples by
        // its head/relation/tail edge. Both previously passed no key columns,
        // which disabled de-duplication and duplicated every row on re-import.
        try { imported.kgRelations = await insertRows('kg_relations', kgRelations, ['name', 'relation_type']); } catch (err) { console.warn('[SYNC IMPORT] kg_relations:', err.message); }
        try { imported.kgTriples = await insertRows('kg_triples', kgTriples, ['head_entity_id', 'relation_id', 'tail_entity_id']); } catch (err) { console.warn('[SYNC IMPORT] kg_triples:', err.message); }
        try { imported.fileIndex = await insertRows('file_index', fileIndex, ['path']); } catch (err) { console.warn('[SYNC IMPORT] file_index:', err.message); }

        db.close((err) => {
          if (err) reject(err);
          else resolve(imported);
        });
      });
    });
  });
}

module.exports = { register };
