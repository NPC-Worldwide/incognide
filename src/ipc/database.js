const path = require('path');
const fs = require('fs');
const os = require('os');
const { dialog, shell } = require('electron');
const sqlite3 = require('sqlite3');

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

        if (isReadQuery) {
          db.all(query, params, (err, rows) => {
            db.close();
            if (err) return reject(err);
            resolve(rows);
          });
        } else {
          db.run(query, params, function(err) {
            db.close();
            if (err) return reject(err);
            resolve({ lastID: this.lastID, changes: this.changes });
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

  // ---- Sync: export data from npcsh_history.db ----

  ipcMain.handle('sync:export-data', async (_, { since, fullDump }) => {
    const sinceTs = (fullDump || !since) ? '1970-01-01T00:00:00.000Z' : since;
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(dbPath);

      const result = { conversations: [], messages: [], bookmarks: [], history: [] };

      db.all(
        `SELECT DISTINCT conversation_id, directory_path,
                MIN(timestamp) as created_at, MAX(timestamp) as updated_at
         FROM conversation_history
         WHERE timestamp > ?
         GROUP BY conversation_id
         ORDER BY updated_at DESC`,
        [sinceTs],
        (err, rows) => {
          if (!err && rows) result.conversations = rows;

          db.all(
            `SELECT message_id, timestamp, role, content, conversation_id,
                    directory_path, model, provider, npc, team,
                    reasoning_content, tool_calls, tool_results,
                    parent_message_id, branch_id, device_id, device_name,
                    input_tokens, output_tokens, cost
             FROM conversation_history
             WHERE timestamp > ?
             ORDER BY timestamp ASC`,
            [sinceTs],
            (err2, msgRows) => {
              if (!err2 && msgRows) result.messages = msgRows;

              db.all(
                `SELECT id, title, url, folder_path, is_global, timestamp
                 FROM bookmarks WHERE timestamp > ? ORDER BY timestamp DESC`,
                [sinceTs],
                (err3, bmRows) => {
                  if (!err3 && bmRows) result.bookmarks = bmRows;

                  db.all(
                    `SELECT id, title, url, folder_path, visit_count, last_visited
                     FROM browser_history
                     WHERE last_visited > ?
                     ORDER BY last_visited DESC`,
                    [sinceTs],
                    (err4, histRows) => {
                      db.close();
                      if (!err4 && histRows) result.history = histRows;
                      resolve(result);
                    }
                  );
                }
              );
            }
          );
        }
      );
    });
  });

  ipcMain.handle('sync:import-data', async (_, { conversations, messages, bookmarks, history }) => {
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(dbPath);
      let imported = { conversations: 0, messages: 0, bookmarks: 0, history: 0 };

      db.serialize(() => {
        if (messages && messages.length) {
          const stmt = db.prepare(
            `INSERT OR IGNORE INTO conversation_history
             (message_id, timestamp, role, content, conversation_id,
              directory_path, model, provider, npc, team,
              reasoning_content, tool_calls, tool_results,
              parent_message_id, branch_id, device_id, device_name,
              input_tokens, output_tokens, cost)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          );
          for (const m of messages) {
            stmt.run(
              m.message_id, m.timestamp, m.role, m.content, m.conversation_id,
              m.directory_path, m.model, m.provider, m.npc, m.team,
              m.reasoning_content, m.tool_calls, m.tool_results,
              m.parent_message_id, m.branch_id || 'main',
              m.device_id || null, m.device_name || null,
              m.input_tokens, m.output_tokens, m.cost
            );
            imported.messages++;
          }
          stmt.finalize();
        }

        if (bookmarks && bookmarks.length) {
          const urls = [...new Set(bookmarks.map(b => b.url).filter(Boolean))];
          if (urls.length > 0) {
            const placeholders = urls.map(() => '?').join(',');
            db.run(`DELETE FROM bookmarks WHERE url IN (${placeholders})`, urls);
          }
          const stmt = db.prepare(
            `INSERT INTO bookmarks (title, url, folder_path, is_global, timestamp)
             VALUES (?, ?, ?, ?, ?)`
          );
          for (const b of bookmarks) {
            stmt.run(b.title, b.url, b.folder_path, b.is_global || 0, b.timestamp);
            imported.bookmarks++;
          }
          stmt.finalize();
        }

        if (history && history.length) {
          for (const h of history) {
            if (h.url && h.last_visited) {
              db.run('DELETE FROM browser_history WHERE url = ? AND last_visited = ?', [h.url, h.last_visited]);
            }
          }
          const stmt = db.prepare(
            `INSERT INTO browser_history (title, url, folder_path, visit_count, last_visited)
             VALUES (?, ?, ?, ?, ?)`
          );
          for (const h of history) {
            stmt.run(h.title, h.url, h.folder_path, h.visit_count || 1, h.last_visited);
            imported.history++;
          }
          stmt.finalize();
        }

        db.close((err) => {
          if (err) reject(err);
          else resolve(imported);
        });
      });
    });
  });
}

module.exports = { register };
