const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs/promises');
const os = require('os');

function register(ctx) {
  const { ipcMain, log, getMainWindow, readPythonEnvConfig } = ctx;

  const jupyterKernels = new Map();

  const getWorkspacePythonPath = async (workspacePath) => {
      if (!workspacePath) return 'python3';

      try {
          const config = await readPythonEnvConfig();
          const wsConfig = config.workspaces[workspacePath];
          if (wsConfig?.path) {
              return wsConfig.path;
          }
      } catch {}

      const isWindows = process.platform === 'win32';
      const binDir = isWindows ? 'Scripts' : 'bin';
      const pythonBin = isWindows ? 'python.exe' : 'python';

      for (const venvDir of ['.venv', 'venv', '.env', 'env']) {
          const venvPythonPath = path.join(workspacePath, venvDir, binDir, pythonBin);
          try {
              await fsPromises.access(venvPythonPath);
              return venvPythonPath;
          } catch {}
      }

      return 'python3';
  };

  const discoverPythonEnvironments = async (workspacePath) => {
      const discovered = [];
      const isWindows = process.platform === 'win32';
      const binDir = isWindows ? 'Scripts' : 'bin';
      const home = os.homedir();

      const tryPython = async (pythonPath, label, source) => {
          try {
              await fsPromises.access(pythonPath, fs.constants.X_OK);
              if (!discovered.find(e => e.pythonPath === pythonPath)) {
                  discovered.push({ pythonPath, label, source });
              }
          } catch {}
      };

      // Local venv dirs in workspace
      if (workspacePath) {
          for (const venvDir of ['.venv', 'venv', '.env', 'env']) {
              for (const bin of ['python3', 'python']) {
                  await tryPython(path.join(workspacePath, venvDir, binDir, bin), `${venvDir} (local)`, 'local');
              }
          }
      }

      // pyenv versions
      const pyenvRoot = process.env.PYENV_ROOT || path.join(home, '.pyenv');
      try {
          const versions = await fsPromises.readdir(path.join(pyenvRoot, 'versions'));
          for (const v of versions) {
              await tryPython(path.join(pyenvRoot, 'versions', v, 'bin', 'python3'), `pyenv: ${v}`, 'pyenv');
          }
      } catch {}

      // uv managed pythons
      for (const uvDir of [
          path.join(home, '.local', 'share', 'uv', 'python'),
          path.join(home, 'Library', 'Application Support', 'uv', 'python'),
      ]) {
          try {
              const versions = await fsPromises.readdir(uvDir);
              for (const v of versions) {
                  await tryPython(path.join(uvDir, v, 'bin', 'python3'), `uv: ${v}`, 'uv');
              }
          } catch {}
      }

      // conda environments
      try {
          const condaResult = await new Promise((resolve) => {
              const proc = spawn('conda', ['env', 'list', '--json'], { env: { ...process.env } });
              let out = '';
              proc.stdout.on('data', d => { out += d.toString(); });
              proc.on('close', () => { try { resolve(JSON.parse(out)); } catch { resolve(null); } });
              proc.on('error', () => resolve(null));
          });
          if (condaResult?.envs) {
              for (const envPath of condaResult.envs) {
                  const name = path.basename(envPath);
                  for (const bin of ['python3', 'python']) {
                      await tryPython(path.join(envPath, binDir, bin), `conda: ${name}`, 'conda');
                  }
              }
          }
      } catch {}

      return discovered;
  };

  ipcMain.handle('jupyter:listKernels', async (_, { workspacePath } = {}) => {
      try {
          const workspacePythonPath = await getWorkspacePythonPath(workspacePath);

          // Get formally registered kernels — use workspace python, not a fixed binary,
          // so we pick up whatever jupyter is on PATH/in the env.
          const registeredKernels = await new Promise((resolve) => {
              const proc = spawn(workspacePythonPath, ['-m', 'jupyter', 'kernelspec', 'list', '--json'], {
                  env: { ...process.env },
                  cwd: workspacePath || process.cwd()
              });
              let stdout = '';
              proc.stdout.on('data', (data) => { stdout += data.toString(); });
              proc.on('close', (code) => {
                  if (code === 0 && stdout) {
                      try {
                          const result = JSON.parse(stdout);
                          resolve(Object.entries(result.kernelspecs || {}).map(([name, spec]) => ({
                              name,
                              displayName: spec.spec?.display_name || name,
                              language: spec.spec?.language || 'unknown',
                              resourceDir: spec.resource_dir,
                          })));
                      } catch { resolve([]); }
                  } else { resolve([]); }
              });
              proc.on('error', () => resolve([]));
          });

          // Discover unregistered python environments
          const discovered = await discoverPythonEnvironments(workspacePath);

          // Get the python path embedded in each registered kernelspec so we can deduplicate
          const registeredPythons = new Set();
          for (const k of registeredKernels) {
              if (k.resourceDir) {
                  try {
                      const kernelJson = JSON.parse(await fsPromises.readFile(path.join(k.resourceDir, 'kernel.json'), 'utf8'));
                      const argv0 = kernelJson.argv?.[0];
                      if (argv0) registeredPythons.add(fs.realpathSync(argv0));
                  } catch {}
              }
          }

          // Add discovered envs that aren't already registered
          const extraKernels = [];
          for (const env of discovered) {
              try {
                  const realPath = fs.realpathSync(env.pythonPath);
                  if (registeredPythons.has(realPath)) continue;
              } catch {}
              const hasIpykernel = await new Promise((resolve) => {
                  const proc = spawn(env.pythonPath, ['-c', 'import ipykernel'], { env: { ...process.env } });
                  proc.on('close', code => resolve(code === 0));
                  proc.on('error', () => resolve(false));
              });
              const safeName = `incognide_${env.source}_${path.basename(path.dirname(path.dirname(env.pythonPath)))}`.replace(/[^a-z0-9_]/gi, '_');
              extraKernels.push({
                  name: safeName,
                  displayName: env.label,
                  language: 'python',
                  pythonPath: env.pythonPath,
                  needsRegistration: true,
                  needsIpykernel: !hasIpykernel,
              });
          }

          const kernels = registeredKernels.length > 0 || extraKernels.length > 0
              ? [...registeredKernels, ...extraKernels]
              : [{ name: 'python3', displayName: 'Python 3', language: 'python' }];

          return { success: true, kernels, pythonPath: workspacePythonPath };
      } catch (err) {
          return { success: false, error: err.message, kernels: [] };
      }
  });

  ipcMain.handle('jupyter:startKernel', async (_, { kernelId, kernelName = 'python3', workspacePath, pythonOverridePath, needsRegistration }) => {
      try {
          let pythonPath = pythonOverridePath || await getWorkspacePythonPath(workspacePath);

          // Auto-register unregistered envs before starting
          if (needsRegistration && pythonOverridePath) {
              log(`[Jupyter] Auto-registering kernel: ${kernelName} with ${pythonOverridePath}`);
              const displayName = kernelName.replace(/_/g, ' ');
              const isUvManaged = pythonOverridePath.includes(`${path.sep}uv${path.sep}python${path.sep}`);
              const regResult = await new Promise((resolve) => {
                  // uv-managed pythons need uv run to invoke ipykernel
                  const cmd = isUvManaged ? 'uv' : pythonOverridePath;
                  const args = isUvManaged
                      ? ['run', '--python', pythonOverridePath, '-m', 'ipykernel', 'install', '--user', '--name', kernelName, '--display-name', displayName]
                      : ['-m', 'ipykernel', 'install', '--user', '--name', kernelName, '--display-name', displayName];
                  const proc = spawn(cmd, args, { env: { ...process.env } });
                  let stderr = '';
                  proc.stderr.on('data', d => { stderr += d.toString(); });
                  proc.on('close', code => resolve({ code, stderr }));
                  proc.on('error', err => resolve({ code: 1, stderr: err.message }));
              });
              if (regResult.code !== 0) {
                  return { success: false, error: `Failed to register kernel: ${regResult.stderr}` };
              }
          }

          const connectionFile = path.join(os.tmpdir(), `kernel-${kernelId}.json`);

          log(`[Jupyter] Starting kernel with Python: ${pythonPath}`);

          const proc = spawn(pythonPath, ['-m', 'jupyter', 'kernel', '--kernel=' + kernelName, '--KernelManager.connection_file=' + connectionFile], {
              env: { ...process.env },
              cwd: workspacePath || process.cwd(),
              detached: false
          });

          let kernelStderr = '';
          proc.stderr.on('data', (data) => {
              const msg = data.toString();
              kernelStderr += msg;
              log('[Jupyter Kernel]', msg);
          });

          proc.stdout.on('data', (data) => {
              log('[Jupyter Kernel stdout]', data.toString());
          });

          proc.on('error', (err) => {
              console.error('[Jupyter Kernel] Process error:', err);
              jupyterKernels.delete(kernelId);
              getMainWindow()?.webContents.send('jupyter:kernelStopped', { kernelId, error: err.message });
          });

          proc.on('exit', (code) => {
              log(`[Jupyter Kernel] Exited with code ${code}`);
              jupyterKernels.delete(kernelId);
              getMainWindow()?.webContents.send('jupyter:kernelStopped', { kernelId, exitCode: code, error: kernelStderr || undefined });
          });

          jupyterKernels.set(kernelId, {
              process: proc,
              connectionFile,
              kernelName,
              executionCount: 0,
              pythonPath,
              workspacePath
          });

          let connectionReady = false;
          for (let i = 0; i < 30; i++) {
              await new Promise((resolve) => setTimeout(resolve, 500));
              try {
                  await fsPromises.access(connectionFile);
                  connectionReady = true;
                  break;
              } catch {}

              if (proc.exitCode !== null) {
                  jupyterKernels.delete(kernelId);
                  return { success: false, error: `Kernel exited with code ${proc.exitCode}${kernelStderr ? ': ' + kernelStderr.trim() : ''}` };
              }
          }

          if (!connectionReady) {
              return { success: true, kernelId, connectionFile, pythonPath, warning: 'Connection file may not be ready yet' };
          }

          try {
              const testProc = spawn(pythonPath, ['-c', `
import sys, json
from jupyter_client import BlockingKernelClient
client = BlockingKernelClient(connection_file=sys.argv[1])
client.load_connection_file()
client.start_channels()
client.wait_for_ready(timeout=15)
client.stop_channels()
print(json.dumps({"ready": True}))
`, connectionFile], { timeout: 20000 });
              const testResult = await new Promise((resolve) => {
                  let out = '';
                  testProc.stdout.on('data', d => { out += d.toString(); });
                  testProc.on('close', () => {
                      try {
                          const r = JSON.parse(out.trim());
                          resolve(r.ready === true);
                      } catch { resolve(false); }
                  });
                  testProc.on('error', () => resolve(false));
              });
              if (!testResult) {
                  log('[Jupyter] Kernel started but not responsive yet');
              }
          } catch (e) {
              log('[Jupyter] Kernel readiness check failed:', e.message);
          }

          return { success: true, kernelId, connectionFile, pythonPath };
      } catch (err) {
          console.error('[Jupyter] Failed to start kernel:', err);
          return { success: false, error: err.message };
      }
  });

  ipcMain.handle('jupyter:executeCode', async (_, { kernelId, code }) => {
      try {
          const kernel = jupyterKernels.get(kernelId);
          if (!kernel) {
              return { success: false, error: 'Kernel not found. Start a kernel first.', outputs: [] };
          }

          kernel.executionCount++;
          const execCount = kernel.executionCount;

          const pythonPath = kernel.pythonPath || 'python3';

          const pythonScript = `
import sys, json
try:
    from jupyter_client import BlockingKernelClient
    client = BlockingKernelClient(connection_file=sys.argv[1])
    client.load_connection_file()
    client.start_channels()
    client.wait_for_ready(timeout=10)
    client.execute(sys.argv[2])
    outputs = []
    while True:
        try:
            msg = client.get_iopub_msg(timeout=30)
            t, c = msg['msg_type'], msg['content']
            if t == 'stream': outputs.append({'output_type': 'stream', 'name': c.get('name','stdout'), 'text': [c.get('text','')]})
            elif t == 'execute_result': outputs.append({'output_type': 'execute_result', 'data': c.get('data',{}), 'metadata': c.get('metadata',{}), 'execution_count': c.get('execution_count')})
            elif t == 'display_data': outputs.append({'output_type': 'display_data', 'data': c.get('data',{}), 'metadata': c.get('metadata',{})})
            elif t == 'error': outputs.append({'output_type': 'error', 'ename': c.get('ename','Error'), 'evalue': c.get('evalue',''), 'traceback': c.get('traceback',[])})
            elif t == 'status' and c.get('execution_state') == 'idle': break
        except: break
    client.stop_channels()
    print(json.dumps({'success': True, 'outputs': outputs}))
except Exception as e:
    print(json.dumps({'success': False, 'error': str(e)}))
`;

          return new Promise((resolve) => {
              const proc = spawn(pythonPath, ['-c', pythonScript, kernel.connectionFile, code], {
                  env: { ...process.env },
                  cwd: kernel.workspacePath || process.cwd(),
                  timeout: 60000
              });

              let stdout = '';
              let stderr = '';
              proc.stdout.on('data', (data) => { stdout += data.toString(); });
              proc.stderr.on('data', (data) => { stderr += data.toString(); });

              proc.on('close', () => {
                  if (stdout) {
                      try {
                          const lines = stdout.trim().split('\n');
                          const result = JSON.parse(lines[lines.length - 1]);
                          resolve({ success: result.success, outputs: result.outputs || [], executionCount: execCount, error: result.error });
                      } catch (e) {
                          resolve({ success: false, error: 'Parse error: ' + e.message, executionCount: execCount, outputs: [{ output_type: 'stream', name: 'stdout', text: [stdout] }] });
                      }
                  } else {
                      resolve({ success: false, error: stderr || 'No output from kernel', executionCount: execCount, outputs: [] });
                  }
              });

              proc.on('error', (err) => {
                  resolve({ success: false, error: err.message, executionCount: execCount, outputs: [] });
              });
          });
      } catch (err) {
          return { success: false, error: err.message, outputs: [] };
      }
  });

  ipcMain.handle('jupyter:interruptKernel', async (_, { kernelId }) => {
      try {
          const kernel = jupyterKernels.get(kernelId);
          if (!kernel) return { success: false, error: 'Kernel not found' };
          kernel.process.kill('SIGINT');
          return { success: true };
      } catch (err) {
          return { success: false, error: err.message };
      }
  });

  ipcMain.handle('jupyter:getVariables', async (_, { kernelId }) => {
      try {
          const kernel = jupyterKernels.get(kernelId);
          if (!kernel) {
              return { success: false, error: 'Kernel not found', variables: [] };
          }

          const pythonPath = kernel.pythonPath || 'python3';

          const pythonScript = `
import sys, json
try:
    from jupyter_client import BlockingKernelClient
    client = BlockingKernelClient(connection_file=sys.argv[1])
    client.load_connection_file()
    client.start_channels()
    client.wait_for_ready(timeout=10)

    # Introspection code to run in kernel
    introspect_code = '''
import json
def _incognide_get_variables():
    ip = get_ipython()
    ns = ip.user_ns
    variables = []
    skip_types = (type, type(json), type(lambda: None))
    # Skip IPython internals, system vars, and common imports
    skip_names = {
        'In', 'Out', 'get_ipython', 'exit', 'quit',
        '_', '__', '___', '_i', '_ii', '_iii', '_oh', '_dh', '_sh',
        'original_ps1', 'is_wsl', 'sys', 'os', 'np', 'pd', 'plt',
        'numpy', 'pandas', 'matplotlib', 'scipy', 'sklearn',
        'json', 're', 'math', 'random', 'datetime', 'time',
        'collections', 'itertools', 'functools', 'pathlib',
        'warnings', 'logging', 'typing', 'copy', 'io', 'csv',
        'pickle', 'gzip', 'zipfile', 'tempfile', 'shutil',
        'subprocess', 'threading', 'multiprocessing',
        'requests', 'urllib', 'http', 'socket',
        'IPython', 'ipykernel', 'traitlets',
        'display', 'HTML', 'Image', 'Markdown',
    }
    # Also skip anything that looks like an internal/config var
    skip_prefixes = ('_', 'original_', 'is_', 'has_', 'PYTHON', 'LC_', 'XDG_')

    for name, val in ns.items():
        if name.startswith(skip_prefixes) or name in skip_names:
            continue
        if isinstance(val, skip_types):
            continue
        # Skip modules
        if type(val).__name__ == 'module':
            continue

        var_info = {'name': name, 'type': type(val).__name__}

        # Get size/shape info
        try:
            if hasattr(val, 'shape'):
                var_info['shape'] = str(val.shape)
                if hasattr(val, 'dtype'):
                    var_info['dtype'] = str(val.dtype)
            elif hasattr(val, '__len__'):
                var_info['length'] = int(len(val))
        except:
            pass

        # DataFrame specific info
        try:
            if type(val).__name__ == 'DataFrame':
                var_info['columns'] = list(val.columns)[:20]
                var_info['dtypes'] = {str(k): str(v) for k, v in val.dtypes.items()}
                var_info['memory'] = int(val.memory_usage(deep=True).sum())
                var_info['is_dataframe'] = True
        except:
            pass

        # Series info
        try:
            if type(val).__name__ == 'Series':
                var_info['dtype'] = str(val.dtype)
                var_info['is_series'] = True
        except:
            pass

        # Get short repr
        try:
            r = repr(val)
            var_info['repr'] = r[:100] + '...' if len(r) > 100 else r
        except:
            var_info['repr'] = '<unable to repr>'

        variables.append(var_info)

    return variables

print("__VARS__" + json.dumps(_incognide_get_variables()))
del _incognide_get_variables
'''

    client.execute(introspect_code)
    result_json = None
    all_msgs = []
    while True:
        try:
            msg = client.get_iopub_msg(timeout=10)
            t, c = msg['msg_type'], msg['content']
            all_msgs.append({'type': t, 'content': str(c)[:200]})
            if t == 'stream' and '__VARS__' in c.get('text', ''):
                text = c.get('text', '')
                idx = text.find('__VARS__')
                result_json = text[idx + 8:].strip()
                break
            elif t == 'error':
                # Capture error from introspection
                import sys
                sys.stderr.write(f"Introspection error: {c.get('ename')}: {c.get('evalue')}\\n")
            elif t == 'status' and c.get('execution_state') == 'idle':
                break
        except Exception as loop_err:
            import sys
            sys.stderr.write(f"Loop error: {loop_err}\\n")
            break

    client.stop_channels()

    if result_json:
        variables = json.loads(result_json)
        print(json.dumps({'success': True, 'variables': variables}))
    else:
        # Debug: include the messages we received
        print(json.dumps({'success': True, 'variables': [], 'debug_msgs': all_msgs[:10]}))
except Exception as e:
    print(json.dumps({'success': False, 'error': str(e), 'variables': []}))
`;

          return new Promise((resolve) => {
              const proc = spawn(pythonPath, ['-c', pythonScript, kernel.connectionFile], {
                  env: { ...process.env },
                  cwd: kernel.workspacePath || process.cwd(),
                  timeout: 15000
              });

              let stdout = '';
              let stderr = '';
              proc.stdout.on('data', (data) => { stdout += data.toString(); });
              proc.stderr.on('data', (data) => { stderr += data.toString(); });

              proc.on('close', (code) => {
                  console.log('[getVariables] Process closed with code:', code);
                  console.log('[getVariables] stdout:', stdout.slice(0, 500));
                  console.log('[getVariables] stderr:', stderr.slice(0, 500));
                  if (stdout) {
                      try {
                          const lines = stdout.trim().split('\n');
                          const result = JSON.parse(lines[lines.length - 1]);
                          resolve({
                              success: result.success,
                              variables: result.variables || [],
                              error: result.error,
                              debug_msgs: result.debug_msgs,
                              stderr: stderr || undefined
                          });
                      } catch (e) {
                          resolve({ success: false, error: 'Parse error: ' + e.message + ' stdout: ' + stdout.slice(0, 500), variables: [], stderr });
                      }
                  } else {
                      resolve({ success: false, error: 'No output from python process', variables: [], stderr });
                  }
              });

              proc.on('error', (err) => {
                  resolve({ success: false, error: err.message, variables: [], stderr });
              });
          });
      } catch (err) {
          return { success: false, error: err.message, variables: [] };
      }
  });

  ipcMain.handle('jupyter:getDataFrame', async (_, { kernelId, varName, offset = 0, limit = 100 }) => {
      try {
          const kernel = jupyterKernels.get(kernelId);
          if (!kernel) {
              return { success: false, error: 'Kernel not found' };
          }

          const pythonPath = kernel.pythonPath || 'python3';

          const pythonScript = `
import sys, json
try:
    from jupyter_client import BlockingKernelClient
    client = BlockingKernelClient(connection_file=sys.argv[1])
    client.load_connection_file()
    client.start_channels()
    client.wait_for_ready(timeout=10)

    var_name = sys.argv[2]
    offset = int(sys.argv[3])
    limit = int(sys.argv[4])

    fetch_code = f'''
import json
import pandas as pd
import numpy as np

def _incognide_get_df_data():
    df = get_ipython().user_ns["{var_name}"]
    total_rows = len(df)
    total_cols = len(df.columns)

    # Get slice of data
    df_slice = df.iloc[{offset}:{offset}+{limit}]

    # Convert to records, handling various types
    def safe_val(v):
        if pd.isna(v):
            return None
        if isinstance(v, (np.integer, np.floating)):
            return float(v) if np.isfinite(v) else None
        if isinstance(v, np.ndarray):
            return v.tolist()
        return str(v) if not isinstance(v, (int, float, bool, str, type(None))) else v

    rows = []
    for idx, row in df_slice.iterrows():
        rows.append({{"__index__": safe_val(idx), **{{col: safe_val(row[col]) for col in df.columns}}}})

    # Column info with stats
    columns = []
    for col in df.columns:
        col_info = {{"name": str(col), "dtype": str(df[col].dtype)}}
        try:
            col_info["null_count"] = int(df[col].isna().sum())
            col_info["unique_count"] = int(df[col].nunique())
            if df[col].dtype in ['int64', 'float64', 'int32', 'float32']:
                col_info["min"] = safe_val(df[col].min())
                col_info["max"] = safe_val(df[col].max())
                col_info["mean"] = safe_val(df[col].mean())
                col_info["std"] = safe_val(df[col].std())
        except:
            pass
        columns.append(col_info)

    return {{"rows": rows, "columns": columns, "total_rows": total_rows, "total_cols": total_cols, "offset": {offset}}}

print("__DFDATA__" + json.dumps(_incognide_get_df_data()))
del _incognide_get_df_data
'''

    client.execute(fetch_code)
    result_json = None
    while True:
        try:
            msg = client.get_iopub_msg(timeout=15)
            t, c = msg['msg_type'], msg['content']
            if t == 'stream' and '__DFDATA__' in c.get('text', ''):
                text = c.get('text', '')
                idx = text.find('__DFDATA__')
                result_json = text[idx + 10:].strip()
                break
            elif t == 'error':
                print(json.dumps({'success': False, 'error': c.get('evalue', 'Unknown error')}))
                sys.exit(0)
            elif t == 'status' and c.get('execution_state') == 'idle':
                break
        except:
            break

    client.stop_channels()

    if result_json:
        data = json.loads(result_json)
        print(json.dumps({'success': True, **data}))
    else:
        print(json.dumps({'success': False, 'error': 'No data returned'}))
except Exception as e:
    print(json.dumps({'success': False, 'error': str(e)}))
`;

          return new Promise((resolve) => {
              const proc = spawn(pythonPath, ['-c', pythonScript, kernel.connectionFile, varName, String(offset), String(limit)], {
                  env: { ...process.env },
                  cwd: kernel.workspacePath || process.cwd(),
                  timeout: 30000
              });

              let stdout = '';
              let stderr = '';
              proc.stdout.on('data', (data) => { stdout += data.toString(); });
              proc.stderr.on('data', (data) => { stderr += data.toString(); });

              proc.on('close', (code) => {
                  console.log('[getDataFrame] Process closed with code:', code);
                  console.log('[getDataFrame] stdout:', stdout.slice(0, 500));
                  console.log('[getDataFrame] stderr:', stderr.slice(0, 500));
                  if (stdout) {
                      try {
                          const lines = stdout.trim().split('\n');
                          const result = JSON.parse(lines[lines.length - 1]);
                          resolve(result);
                      } catch (e) {
                          resolve({ success: false, error: 'Parse error: ' + e.message + ' stdout: ' + stdout.slice(0, 300), stderr });
                      }
                  } else {
                      resolve({ success: false, error: 'No output', stderr });
                  }
              });

              proc.on('error', (err) => {
                  resolve({ success: false, error: err.message, stderr });
              });
          });
      } catch (err) {
          return { success: false, error: err.message };
      }
  });

  ipcMain.handle('jupyter:stopKernel', async (_, { kernelId }) => {
      try {
          const kernel = jupyterKernels.get(kernelId);
          if (!kernel) return { success: true };
          kernel.process.kill('SIGTERM');
          try { await fsPromises.unlink(kernel.connectionFile); } catch {}
          jupyterKernels.delete(kernelId);
          return { success: true };
      } catch (err) {
          return { success: false, error: err.message };
      }
  });

  ipcMain.handle('jupyter:getRunningKernels', async () => {
      const running = [];
      for (const [kernelId, kernel] of jupyterKernels) {
          running.push({ kernelId, kernelName: kernel.kernelName, executionCount: kernel.executionCount, pythonPath: kernel.pythonPath });
      }
      return { success: true, kernels: running };
  });

  ipcMain.handle('jupyter:checkInstalled', async (_, { workspacePath } = {}) => {
      try {
          const pythonPath = await getWorkspacePythonPath(workspacePath);

          return new Promise((resolve) => {
              const proc = spawn(pythonPath, ['-c', 'import jupyter_client; import ipykernel; print("ok")'], {
                  env: { ...process.env },
                  cwd: workspacePath || process.cwd()
              });

              let stdout = '';
              let stderr = '';
              proc.stdout.on('data', (data) => { stdout += data.toString(); });
              proc.stderr.on('data', (data) => { stderr += data.toString(); });

              proc.on('close', (code) => {
                  if (code === 0 && stdout.includes('ok')) {
                      resolve({ installed: true, pythonPath });
                  } else {
                      resolve({ installed: false, pythonPath, error: stderr || 'Jupyter not found' });
                  }
              });

              proc.on('error', (err) => {
                  resolve({ installed: false, pythonPath, error: err.message });
              });
          });
      } catch (err) {
          return { installed: false, error: err.message };
      }
  });

  ipcMain.handle('jupyter:install', async (_, { workspacePath } = {}) => {
      try {
          const pythonPath = await getWorkspacePythonPath(workspacePath);

          log(`[Jupyter] Installing jupyter in: ${pythonPath}`);

          return new Promise((resolve) => {
              const proc = spawn(pythonPath, ['-m', 'pip', 'install', 'jupyter', 'ipykernel', 'jupyter_client'], {
                  env: { ...process.env },
                  cwd: workspacePath || process.cwd()
              });

              let stdout = '';
              let stderr = '';
              proc.stdout.on('data', (data) => {
                  const msg = data.toString();
                  stdout += msg;
                  getMainWindow()?.webContents.send('jupyter:installProgress', { message: msg });
              });
              proc.stderr.on('data', (data) => {
                  const msg = data.toString();
                  stderr += msg;
                  getMainWindow()?.webContents.send('jupyter:installProgress', { message: msg });
              });

              proc.on('close', (code) => {
                  if (code === 0) {
                      resolve({ success: true, pythonPath });
                  } else {
                      resolve({ success: false, error: stderr || 'Installation failed', pythonPath });
                  }
              });

              proc.on('error', (err) => {
                  resolve({ success: false, error: err.message, pythonPath });
              });
          });
      } catch (err) {
          return { success: false, error: err.message };
      }
  });

  ipcMain.handle('jupyter:registerKernel', async (_, { workspacePath, kernelName = 'python3', displayName = 'Python 3' } = {}) => {
      try {
          const pythonPath = await getWorkspacePythonPath(workspacePath);

          return new Promise((resolve) => {
              const proc = spawn(pythonPath, ['-m', 'ipykernel', 'install', '--user', '--name', kernelName, '--display-name', displayName], {
                  env: { ...process.env },
                  cwd: workspacePath || process.cwd()
              });

              let stdout = '';
              let stderr = '';
              proc.stdout.on('data', (data) => { stdout += data.toString(); });
              proc.stderr.on('data', (data) => { stderr += data.toString(); });

              proc.on('close', (code) => {
                  if (code === 0) {
                      resolve({ success: true, pythonPath });
                  } else {
                      resolve({ success: false, error: stderr || 'Registration failed', pythonPath });
                  }
              });

              proc.on('error', (err) => {
                  resolve({ success: false, error: err.message, pythonPath });
              });
          });
      } catch (err) {
          return { success: false, error: err.message };
      }
  });
  ipcMain.handle('jupyter:installIpykernel', async (_, { pythonPath }) => {
      if (!pythonPath) return { success: false, error: 'No python path provided' };

      const isUvManaged = pythonPath.includes(`${path.sep}uv${path.sep}python${path.sep}`);

      const doInstall = (cmd, args) => new Promise((resolve) => {
          const proc = spawn(cmd, args, { env: { ...process.env } });
          let stderr = '';
          proc.stdout.on('data', d => getMainWindow()?.webContents.send('jupyter:installProgress', { message: d.toString() }));
          proc.stderr.on('data', d => {
              const msg = d.toString();
              stderr += msg;
              getMainWindow()?.webContents.send('jupyter:installProgress', { message: msg });
          });
          proc.on('close', code => code === 0 ? resolve({ success: true }) : resolve({ success: false, error: stderr }));
          proc.on('error', err => resolve({ success: false, error: err.message }));
      });

      if (isUvManaged) {
          // uv-managed base pythons are externally managed (PEP 668) — use uv pip install
          const result = await doInstall('uv', ['pip', 'install', '--python', pythonPath, 'ipykernel', 'jupyter_client']);
          if (!result.success) return result;
      } else {
          const result = await doInstall(pythonPath, ['-m', 'pip', 'install', 'ipykernel', 'jupyter_client']);
          if (!result.success) return result;
      }
      return { success: true };
  });
}

module.exports = { register };
