# npc_serve.py

from npcpy.serve import start_flask_server
import os
import sys

if __name__ == "__main__":
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