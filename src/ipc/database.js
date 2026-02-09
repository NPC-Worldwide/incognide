const path = require('path');
const fs = require('fs');
const os = require('os');
const { dialog, shell } = require('electron');
const sqlite3 = require('sqlite3');

// Parse connection string to determine database type and connection params
const parseConnectionString = (connString) => {
  if (!connString) {
    return { type: 'sqlite', path: path.join(os.homedir(), 'npcsh_history.db') };
  }

  const str = connString.trim();

  // Handle ~ for home directory in paths
  const expandHome = (p) => p.startsWith('~') ? p.replace('~', os.homedir()) : p;

  // SQLite: file path, sqlite:path, or sqlite://path
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

  // PostgreSQL: postgres:// or postgresql://
  if (str.startsWith('postgres://') || str.startsWith('postgresql://')) {
    return { type: 'postgresql', connectionString: str };
  }

  // MySQL: mysql://
  if (str.startsWith('mysql://')) {
    return { type: 'mysql', connectionString: str };
  }

  // MSSQL: mssql:// or sqlserver://
  if (str.startsWith('mssql://') || str.startsWith('sqlserver://')) {
    return { type: 'mssql', connectionString: str };
  }

  // Snowflake: snowflake://
  if (str.startsWith('snowflake://')) {
    return { type: 'snowflake', connectionString: str };
  }

  // Default: assume SQLite file path
  return { type: 'sqlite', path: path.resolve(expandHome(str)) };
};

// Get database-specific SQL for listing tables
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

// Get database-specific SQL for table schema
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

// Try to load optional database drivers
const tryRequire = (moduleName) => {
  try {
    return require(moduleName);
  } catch (e) {
    return null;
  }
};

// Execute query on any supported database
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

  // PostgreSQL
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

  // MySQL
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

  // MSSQL
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

  // Snowflake
  if (type === 'snowflake') {
    const snowflake = tryRequire('snowflake-sdk');
    if (!snowflake) {
      throw new Error('Snowflake driver not installed. Run: npm install snowflake-sdk');
    }
    // Parse snowflake connection string: snowflake://user:pass@account/database/schema?warehouse=WH
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

// Helper to get models directory path
const getModelsDir = (basePath, isGlobal) => {
    if (isGlobal) {
        return path.join(os.homedir(), '.npcsh', 'npc_team', 'models');
    }
    return path.join(basePath, 'npc_team', 'models');
};

// Helper to get metadata file path
const getModelsMetaPath = (basePath, isGlobal) => {
    const modelsDir = getModelsDir(basePath, isGlobal);
    return path.join(modelsDir, 'models_meta.json');
};

// Helper to load models from directory
const loadModelsFromDir = (modelsDir) => {
    const models = [];
    if (!fs.existsSync(modelsDir)) return models;

    // Load metadata
    const metaPath = path.join(modelsDir, 'models_meta.json');
    let metadata = {};
    if (fs.existsSync(metaPath)) {
        try {
            metadata = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        } catch (e) {
            console.error('Error reading models metadata:', e);
        }
    }

    // Discover .sql files
    const sqlFiles = fs.readdirSync(modelsDir).filter(f => f.endsWith('.sql'));
    for (const file of sqlFiles) {
        const name = file.replace('.sql', '');
        const filePath = path.join(modelsDir, file);
        const sql = fs.readFileSync(filePath, 'utf-8');
        const meta = metadata[name] || {};

        models.push({
            id: name, // Use filename as ID
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

// Helper to save model metadata
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

  // ─── PDF Highlights CRUD ───────────────────────────────────────────

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

  // ─── PDF Drawings CRUD ─────────────────────────────────────────────

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

  // ─── Basic DB introspection (app's own SQLite) ────────────────────

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

  // ─── Multi-DB support ─────────────────────────────────────────────

  // Test database connection and return basic info
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

      // Add file info for SQLite
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

  // List tables for a database
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

  // Get table schema for a database
  ipcMain.handle('db:getTableSchemaForPath', async (event, { connectionString, tableName }) => {
    // Validate table name (allow dots for schema.table notation)
    if (!/^[a-zA-Z0-9_.]+$/.test(tableName)) {
      return { error: 'Invalid table name provided.' };
    }

    try {
      const connConfig = parseConnectionString(connectionString);
      const schemaSQL = getTableSchemaSQL(connConfig.type, tableName);
      const schemaRows = await executeOnDatabase(connConfig, schemaSQL);

      // Normalize schema response across database types
      const schema = schemaRows.map(r => ({
        name: r.name || r.column_name || r.COLUMN_NAME || r.Field,
        type: r.type || r.data_type || r.DATA_TYPE || r.Type,
        notnull: r.notnull || (r.is_nullable === 'NO') || (r.Null === 'NO') ? 1 : 0,
        pk: r.pk || (r.Key === 'PRI') ? 1 : 0
      }));

      // Try to get row count
      let rowCount = null;
      try {
        const countResult = await executeOnDatabase(connConfig, `SELECT COUNT(*) as count FROM ${tableName}`);
        rowCount = countResult[0]?.count || countResult[0]?.COUNT || null;
      } catch (e) {
        // Ignore count errors
      }

      return { schema, rowCount, dbType: connConfig.type };
    } catch (err) {
      return { error: err.message };
    }
  });

  // Execute SQL on a database
  ipcMain.handle('db:executeSQLForPath', async (event, { connectionString, query, params = [] }) => {
    try {
      const connConfig = parseConnectionString(connectionString);
      const result = await executeOnDatabase(connConfig, query, params);

      // If it's an array, it's rows from a SELECT
      if (Array.isArray(result)) {
        return { rows: result, dbType: connConfig.type };
      }
      // Otherwise it's a write result
      return { ...result, dbType: connConfig.type };
    } catch (err) {
      return { error: err.message };
    }
  });

  // Browse for database file (SQLite only)
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

  // Get supported database types
  ipcMain.handle('db:getSupportedTypes', async () => {
    const types = [
      { type: 'sqlite', name: 'SQLite', installed: true, example: '~/database.db or sqlite:~/database.db' }
    ];

    // Check which drivers are installed
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

  // ─── SQL Models ────────────────────────────────────────────────────

  // Get global SQL models
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

  // Get project SQL models
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

  // Save global SQL model (as .sql file)
  ipcMain.handle('saveSqlModelGlobal', async (event, modelData) => {
      try {
          const modelsDir = getModelsDir(null, true);
          if (!fs.existsSync(modelsDir)) {
              fs.mkdirSync(modelsDir, { recursive: true });
          }

          // Sanitize model name for filename
          const safeName = modelData.name.replace(/[^a-zA-Z0-9_-]/g, '_');
          const sqlFilePath = path.join(modelsDir, `${safeName}.sql`);

          // Write the SQL file
          fs.writeFileSync(sqlFilePath, modelData.sql);

          // Save metadata
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

  // Save project SQL model (as .sql file)
  ipcMain.handle('saveSqlModelProject', async (event, { path: projectPath, model: modelData }) => {
      try {
          if (!projectPath) return { success: false, error: 'No project path provided' };

          const modelsDir = getModelsDir(projectPath, false);
          if (!fs.existsSync(modelsDir)) {
              fs.mkdirSync(modelsDir, { recursive: true });
          }

          // Sanitize model name for filename
          const safeName = modelData.name.replace(/[^a-zA-Z0-9_-]/g, '_');
          const sqlFilePath = path.join(modelsDir, `${safeName}.sql`);

          // Write the SQL file
          fs.writeFileSync(sqlFilePath, modelData.sql);

          // Save metadata
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

  // Delete global SQL model
  ipcMain.handle('deleteSqlModelGlobal', async (event, modelId) => {
      try {
          const modelsDir = getModelsDir(null, true);
          const sqlFilePath = path.join(modelsDir, `${modelId}.sql`);

          // Delete the .sql file
          if (fs.existsSync(sqlFilePath)) {
              fs.unlinkSync(sqlFilePath);
          }

          // Update metadata
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

  // Delete project SQL model
  ipcMain.handle('deleteSqlModelProject', async (event, { path: projectPath, modelId }) => {
      try {
          if (!projectPath) return { success: false, error: 'No project path provided' };

          const modelsDir = getModelsDir(projectPath, false);
          const sqlFilePath = path.join(modelsDir, `${modelId}.sql`);

          // Delete the .sql file
          if (fs.existsSync(sqlFilePath)) {
              fs.unlinkSync(sqlFilePath);
          }

          // Update metadata
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

  // Run SQL model (execute via npcpy backend API)
  ipcMain.handle('runSqlModel', async (event, { path: projectPath, modelId, isGlobal, targetDb: userTargetDb }) => {
      try {
          const modelsDir = getModelsDir(isGlobal ? null : projectPath, isGlobal);
          const sqlFilePath = path.join(modelsDir, `${modelId}.sql`);

          if (!fs.existsSync(sqlFilePath)) {
              return { success: false, error: `Model file not found: ${sqlFilePath}` };
          }

          // Load metadata for NPC context
          const metaPath = path.join(modelsDir, 'models_meta.json');
          let meta = {};
          if (fs.existsSync(metaPath)) {
              try {
                  const allMeta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
                  meta = allMeta[modelId] || {};
              } catch (e) {}
          }

          const npcDirectory = isGlobal
              ? path.join(os.homedir(), '.npcsh', 'npc_team')
              : path.join(projectPath, 'npc_team');

          // Use user-selected database or default to npcsh_history.db
          let targetDb = userTargetDb || '~/npcsh_history.db';
          // Expand ~ to home directory
          if (targetDb.startsWith('~')) {
              targetDb = path.join(os.homedir(), targetDb.slice(1));
          }

          // Call the npcpy backend API
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

          // Update last run timestamp in metadata
          meta.lastRunAt = new Date().toISOString();
          meta.lastRunResult = result.success ? 'success' : 'error';
          saveModelMeta(modelsDir, modelId, meta);

          return result;
      } catch (err) {
          console.error('Error running SQL model:', err);
          return { success: false, error: err.message };
      }
  });

  // ─── Generic SQL execution (app's own SQLite) ─────────────────────

  ipcMain.handle('executeSQL', async (event, { query }) => {
    try {
      const rows = await dbQuery(query);
      return { result: rows, error: null };
    } catch (err) {
      return { result: null, error: err.message };
    }
  });
}

module.exports = { register };
