# npc_serve.py

import os
import sys


def _install_log_tee():
    """Tee stdout/stderr to ~/.npcsh/incognide/logs/backend.log so Electron's
    Backend Logs panel can surface them regardless of whether Electron spawned
    this process or it was started externally (dev workflow)."""
    log_dir = os.environ.get(
        'INCOGNIDE_LOG_DIR',
        os.path.join(os.path.expanduser('~'), '.npcsh', 'incognide', 'logs'),
    )
    try:
        os.makedirs(log_dir, exist_ok=True)
    except OSError:
        return
    log_path = os.path.join(log_dir, 'backend.log')
    try:
        fh = open(log_path, 'a', buffering=1)
    except OSError:
        return

    class _Tee:
        def __init__(self, underlying, file_handle):
            self._u = underlying
            self._f = file_handle
        def write(self, data):
            try:
                self._u.write(data)
            except Exception:
                pass
            try:
                self._f.write(data)
            except Exception:
                pass
        def flush(self):
            for s in (self._u, self._f):
                try:
                    s.flush()
                except Exception:
                    pass
        def __getattr__(self, name):
            return getattr(self._u, name)

    sys.stdout = _Tee(sys.stdout, fh)
    sys.stderr = _Tee(sys.stderr, fh)


_install_log_tee()

from npcpy.serve import start_flask_server

if __name__ == "__main__":
    # --test-import: smoke test that all critical imports resolve (for CI)
    if sys.argv[1:] == ['--test-import']:
        print("[TEST] Importing npcpy.serve...")
        from npcpy.serve import app
        print("[TEST] Importing npcpy.npc_compiler...")
        from npcpy.npc_compiler import CLIAgent, NPC, Team
        print("[TEST] Importing npcpy.gen.cli_agent...")
        from npcpy.gen.cli_agent import run_cli_agent, _is_cli_provider
        print("[TEST] All imports OK")
        sys.exit(0)

    # Detect if running as compiled executable (prod) or Python script (dev)
    is_frozen = getattr(sys, 'frozen', False)
    is_dev = not is_frozen

    # Dev: 5437, Prod: 5337
    default_port = '5437' if is_dev else '5337'
    port = os.environ.get('INCOGNIDE_PORT', default_port)

    # Frontend port follows the pattern: dev=7337, prod=6337, docker=3000
    frontend_port = os.environ.get('FRONTEND_PORT', '7337' if port == '5437' else '6337')

    mode_str = 'dev' if is_dev else 'prod'
    print(f"Starting Flask server on http://0.0.0.0:{port} ({mode_str} mode)")

    start_flask_server(
        port=port,
        cors_origins=f"localhost:{frontend_port}",
        db_path=os.path.expanduser('~/npcsh_history.db'),
        user_npc_directory=os.path.expanduser('~/.npcsh/npc_team'),
        debug=False)
