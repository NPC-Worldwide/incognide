import os
import time
from datetime import datetime
from npcpy.memory.knowledge_store import KnowledgeStore

ROOT = "/home/caug/npcww/npc-core/npcpy"

print("=== EXTRACTION PHASE ===")
store = KnowledgeStore(ROOT)

stats = store.extract_from_directory(
    include_extensions={
        ".py", ".js", ".ts", ".jsx", ".tsx", ".java", ".c", ".cpp", ".h",
        ".cs", ".go", ".rs", ".rb", ".php", ".swift", ".kt", ".scala",
        ".sh", ".bash", ".zsh", ".ps1", ".bat",
        ".txt", ".md", ".rst", ".log",
        ".csv", ".json", ".xml", ".yaml", ".yml",
        ".docx", ".pptx", ".xlsx", ".html", ".htm",
    },
    exclude_dirs={
        ".git", ".hg", ".svn", "node_modules", "__pycache__",
        ".pytest_cache", ".mypy_cache", "dist", "build",
        "venv", ".venv", "env", ".env", ".tox", ".egg-info",
        ".local", ".cache", ".config", ".claude",
        ".github", ".vscode", ".idea", "vendor",
        "site-packages", "pip", "setuptools",
        "target", "out", ".gradle", ".terraform",
        "coverage", "htmlcov", ".nyc_output",
        "tmp", "temp", "logs", "uploads", "media",
        ".DS_Store", ".Trash", "__MACOSX",
        "third_party", "third-party", "3rdparty",
    },
    max_file_size_mb=5,
    model="kimi-k2.6:cloud",
    provider="ollama",
)

print("\n=== EXTRACTION STATS ===")
for k, v in stats.items():
    print(f"  {k}: {v}")

print("\n=== EVOLUTION PHASE ===")
stores = KnowledgeStore.find_all(ROOT)
print(f"Found {len(stores)} knowledge stores")
for s in stores:
    print(f"\nEvolving {s.directory} ...")
    start = time.time()
    result = s.evolve(model="kimi-k2.6:cloud", provider="ollama")
    elapsed = time.time() - start
    print(f"Finished in {elapsed:.1f}s:")
    for k, v in result.items():
        print(f"  {k}: {v}")
