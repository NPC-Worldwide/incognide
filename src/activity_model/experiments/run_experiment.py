"""Run the full synthetic next-action experiment (all three distributions)."""

from __future__ import annotations

import os
import sys

# Ensure src/ is importable when invoked as a script.
_REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
_SRC = os.path.join(_REPO_ROOT, 'src')
if _SRC not in sys.path:
    sys.path.insert(0, _SRC)
if os.path.dirname(__file__) not in sys.path:
    sys.path.insert(0, os.path.dirname(__file__))

from evaluate import main  # noqa: E402

if __name__ == '__main__':
    argv = sys.argv[1:] if len(sys.argv) > 1 else ['--distribution', 'all']
    raise SystemExit(main(argv))
