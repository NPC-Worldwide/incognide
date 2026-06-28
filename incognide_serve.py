import os
import sys


def _install_log_tee():
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
    if sys.argv[1:] == ['--test-import']:
        print("[TEST] Importing npcpy.serve...")
        from npcpy.serve import app
        print("[TEST] Importing npcpy.npc_compiler...")
        from npcpy.npc_compiler import CLIAgent, NPC, Team
        print("[TEST] Importing npcpy.gen.cli_agent...")
        from npcpy.gen.cli_agent import run_cli_agent, _is_cli_provider
        print("[TEST] All imports OK")
        sys.exit(0)

    is_frozen = getattr(sys, 'frozen', False)
    is_dev = not is_frozen

    default_port = '5437' if is_dev else '5337'
    port = os.environ.get('INCOGNIDE_PORT', default_port)

    frontend_port = os.environ.get('FRONTEND_PORT', '7337' if port == '5437' else '6337')

    mode_str = 'dev' if is_dev else 'prod'
    print(f"Starting Flask server on http://0.0.0.0:{port} ({mode_str} mode)")

    incognide_home = os.environ.get('INCOGNIDE_HOME', os.path.expanduser('~/.incognide'))
    db_path = os.environ.get('INCOGNIDE_DB_PATH', os.path.join(incognide_home, 'history.db'))

    teams = {}
    try:
        import yaml
        teams_yaml_path = os.path.join(incognide_home, 'teams.yaml')
        if os.path.isfile(teams_yaml_path):
            with open(teams_yaml_path, 'r') as f:
                yaml_data = yaml.safe_load(f) or {}
            loaded = yaml_data.get('teams', yaml_data)
            if isinstance(loaded, dict):
                for team_name, team_path in loaded.items():
                    tp = os.path.abspath(os.path.expanduser(str(team_path).replace('~', os.path.expanduser('~'))))
                    if os.path.isdir(tp):
                        teams[str(team_name)] = tp
            elif isinstance(loaded, list):
                for team_path in loaded:
                    tp = os.path.abspath(os.path.expanduser(str(team_path).replace('~', os.path.expanduser('~'))))
                    if os.path.isdir(tp):
                        team_name = os.path.basename(tp)
                        teams[team_name] = tp
    except Exception:
        pass

    start_flask_server(
        port=port,
        cors_origins=f"localhost:{frontend_port}",
        db_path=db_path,
        teams=teams,
        debug=False)
