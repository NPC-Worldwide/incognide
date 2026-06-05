const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');
const os = require('os');

const connections = new Map();

function register(ctx) {
  const { ipcMain, getMainWindow, log } = ctx;

  const getConnection = (id) => connections.get(id);

  const ensureSftp = (conn) => {
    return new Promise((resolve, reject) => {
      if (conn._sftp) return resolve(conn._sftp);
      conn.ssh.sftp((err, sftp) => {
        if (err) return reject(err);
        conn._sftp = sftp;
        resolve(sftp);
      });
    });
  };

  ipcMain.handle('ssh:connect', async (event, config) => {
    const { id, host, port = 22, username, password, privateKeyPath, passphrase } = config;
    if (!id || !host || !username) {
      return { success: false, error: 'Missing required fields: id, host, username' };
    }
    if (connections.has(id)) {
      return { success: true, reused: true };
    }

    const client = new Client();
    const conn = { id, ssh: client, config, _sftp: null };

    return new Promise((resolve) => {
      client.on('ready', () => {
        connections.set(id, conn);
        log?.(`[SSH] Connected to ${username}@${host}:${port} (id: ${id})`);
        resolve({ success: true });
      });

      client.on('error', (err) => {
        log?.(`[SSH] Error on ${host}: ${err.message}`);
        connections.delete(id);
        resolve({ success: false, error: err.message });
      });

      client.on('close', () => {
        log?.(`[SSH] Connection closed ${id}`);
        connections.delete(id);
        const win = getMainWindow();
        if (win && !win.isDestroyed()) {
          win.webContents.send('ssh:disconnected', { id });
        }
      });

      const connectOpts = { host, port, username };
      if (password) {
        connectOpts.password = password;
      } else if (privateKeyPath) {
        const keyPath = privateKeyPath.startsWith('~')
          ? path.join(os.homedir(), privateKeyPath.slice(1))
          : privateKeyPath;
        try {
          connectOpts.privateKey = fs.readFileSync(keyPath);
        } catch (e) {
          return resolve({ success: false, error: `Failed to read private key: ${e.message}` });
        }
        if (passphrase) connectOpts.passphrase = passphrase;
      } else {
        return resolve({ success: false, error: 'Authentication requires password or privateKeyPath' });
      }

      client.connect(connectOpts);
    });
  });

  ipcMain.handle('ssh:disconnect', async (event, { id }) => {
    const conn = connections.get(id);
    if (conn) {
      conn.ssh.end();
      connections.delete(id);
    }
    return { success: true };
  });

  ipcMain.handle('ssh:list-connections', async () => {
    return Array.from(connections.values()).map((c) => ({
      id: c.id,
      host: c.config.host,
      port: c.config.port,
      username: c.config.username,
    }));
  });

  ipcMain.handle('ssh:test-connection', async (event, config) => {
    const { host, port = 22, username, password, privateKeyPath, passphrase } = config;
    const client = new Client();
    return new Promise((resolve) => {
      client.on('ready', () => {
        client.end();
        resolve({ success: true });
      });
      client.on('error', (err) => {
        resolve({ success: false, error: err.message });
      });
      const connectOpts = { host, port, username };
      if (password) connectOpts.password = password;
      else if (privateKeyPath) {
        const keyPath = privateKeyPath.startsWith('~')
          ? path.join(os.homedir(), privateKeyPath.slice(1))
          : privateKeyPath;
        try {
          connectOpts.privateKey = fs.readFileSync(keyPath);
        } catch (e) {
          return resolve({ success: false, error: `Failed to read private key: ${e.message}` });
        }
        if (passphrase) connectOpts.passphrase = passphrase;
      }
      client.connect(connectOpts);
    });
  });

  ipcMain.handle('ssh:read-directory', async (event, { id, dirPath }) => {
    const conn = getConnection(id);
    if (!conn) return { error: 'Not connected' };
    try {
      const sftp = await ensureSftp(conn);
      const list = await new Promise((resolve, reject) => {
        sftp.readdir(dirPath, (err, items) => {
          if (err) return reject(err);
          resolve(items);
        });
      });
      const entries = list.map((item) => ({
        name: item.filename,
        isDirectory: item.attrs.isDirectory(),
        isFile: item.attrs.isFile(),
        size: item.attrs.size,
        mtime: item.attrs.mtime,
      }));
      return { entries };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('ssh:read-file', async (event, { id, filePath }) => {
    const conn = getConnection(id);
    if (!conn) return { error: 'Not connected' };
    try {
      const sftp = await ensureSftp(conn);
      const buffer = await new Promise((resolve, reject) => {
        sftp.readFile(filePath, (err, data) => {
          if (err) return reject(err);
          resolve(data);
        });
      });
      return { content: buffer.toString('utf-8') };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('ssh:write-file', async (event, { id, filePath, content }) => {
    const conn = getConnection(id);
    if (!conn) return { error: 'Not connected' };
    try {
      const sftp = await ensureSftp(conn);
      await new Promise((resolve, reject) => {
        sftp.writeFile(filePath, Buffer.from(content, 'utf-8'), (err) => {
          if (err) return reject(err);
          resolve(null);
        });
      });
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('ssh:rename', async (event, { id, oldPath, newPath }) => {
    const conn = getConnection(id);
    if (!conn) return { error: 'Not connected' };
    try {
      const sftp = await ensureSftp(conn);
      await new Promise((resolve, reject) => {
        sftp.rename(oldPath, newPath, (err) => {
          if (err) return reject(err);
          resolve(null);
        });
      });
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('ssh:mkdir', async (event, { id, dirPath }) => {
    const conn = getConnection(id);
    if (!conn) return { error: 'Not connected' };
    try {
      const sftp = await ensureSftp(conn);
      await new Promise((resolve, reject) => {
        sftp.mkdir(dirPath, (err) => {
          if (err) return reject(err);
          resolve(null);
        });
      });
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('ssh:unlink', async (event, { id, filePath, isDirectory }) => {
    const conn = getConnection(id);
    if (!conn) return { error: 'Not connected' };
    try {
      const sftp = await ensureSftp(conn);
      await new Promise((resolve, reject) => {
        if (isDirectory) {
          sftp.rmdir(filePath, (err) => {
            if (err) return reject(err);
            resolve(null);
          });
        } else {
          sftp.unlink(filePath, (err) => {
            if (err) return reject(err);
            resolve(null);
          });
        }
      });
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('ssh:stat', async (event, { id, filePath }) => {
    const conn = getConnection(id);
    if (!conn) return { error: 'Not connected' };
    try {
      const sftp = await ensureSftp(conn);
      const stats = await new Promise((resolve, reject) => {
        sftp.stat(filePath, (err, stat) => {
          if (err) return reject(err);
          resolve(stat);
        });
      });
      return {
        isDirectory: stats.isDirectory(),
        isFile: stats.isFile(),
        size: stats.size,
        mtime: stats.mtime,
      };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('ssh:exec', async (event, { id, command }) => {
    const conn = getConnection(id);
    if (!conn) return { error: 'Not connected' };
    try {
      const result = await new Promise((resolve, reject) => {
        conn.ssh.exec(command, (err, stream) => {
          if (err) return reject(err);
          let stdout = '';
          let stderr = '';
          stream.on('data', (data) => { stdout += data; });
          stream.stderr.on('data', (data) => { stderr += data; });
          stream.on('close', (code) => {
            resolve({ stdout, stderr, code });
          });
        });
      });
      return result;
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('ssh:create-terminal', async (event, { id, sessionId, cols = 80, rows = 24 }) => {
    const conn = getConnection(id);
    if (!conn) return { success: false, error: 'Not connected' };
    try {
      const stream = await new Promise((resolve, reject) => {
        conn.ssh.shell({ cols, rows, term: 'xterm-256color' }, (err, s) => {
          if (err) return reject(err);
          resolve(s);
        });
      });

      const sender = event.sender;
      stream.on('data', (data) => {
        if (!sender.isDestroyed()) {
          sender.send('ssh:terminal-data', { sessionId, data: data.toString('utf-8') });
        }
      });
      stream.on('close', () => {
        if (!sender.isDestroyed()) {
          sender.send('ssh:terminal-closed', { sessionId });
        }
      });

      if (!conn._terminals) conn._terminals = new Map();
      conn._terminals.set(sessionId, stream);

      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('ssh:write-terminal', async (event, { id, sessionId, data }) => {
    const conn = getConnection(id);
    if (!conn) return { success: false, error: 'Not connected' };
    const stream = conn._terminals?.get(sessionId);
    if (!stream) return { success: false, error: 'Terminal session not found' };
    stream.write(data);
    return { success: true };
  });

  ipcMain.handle('ssh:resize-terminal', async (event, { id, sessionId, cols, rows }) => {
    const conn = getConnection(id);
    if (!conn) return { success: false, error: 'Not connected' };
    const stream = conn._terminals?.get(sessionId);
    if (!stream) return { success: false, error: 'Terminal session not found' };
    stream.setWindow(rows, cols, 0, 0);
    return { success: true };
  });

  ipcMain.handle('ssh:kill-terminal', async (event, { id, sessionId }) => {
    const conn = getConnection(id);
    if (!conn) return { success: false, error: 'Not connected' };
    const stream = conn._terminals?.get(sessionId);
    if (stream) {
      stream.close();
      conn._terminals.delete(sessionId);
    }
    return { success: true };
  });

  ipcMain.handle('ssh:read-file-buffer', async (event, { id, filePath }) => {
    const conn = getConnection(id);
    if (!conn) return { error: 'Not connected' };
    try {
      const sftp = await ensureSftp(conn);
      const buffer = await new Promise((resolve, reject) => {
        sftp.readFile(filePath, (err, data) => {
          if (err) return reject(err);
          resolve(data);
        });
      });
      return { buffer: Array.from(buffer) };
    } catch (err) {
      return { error: err.message };
    }
  });
}

module.exports = { register };
