import sqlite3
import json
import os

NPCSH_DB = '/home/caug/npcsh_history.db'
INCOGNIDE_DB = '/home/caug/.incognide/history.db'

def val(r, col):
    return r[col] if col in r.keys() else None

def migrate_activity_log():
    src = sqlite3.connect(NPCSH_DB)
    dst = sqlite3.connect(INCOGNIDE_DB)
    src.row_factory = sqlite3.Row
    dst.row_factory = sqlite3.Row

    rows = src.execute("SELECT * FROM activity_log ORDER BY timestamp").fetchall()
    existing = set()
    for r in dst.execute("SELECT activity_type, activity_data, timestamp FROM activity_log").fetchall():
        existing.add((r['activity_type'], r['activity_data'], r['timestamp']))

    inserted = 0
    for r in rows:
        key = (r['activity_type'], r['activity_data'], r['timestamp'])
        if key in existing:
            continue
        dst.execute(
            "INSERT INTO activity_log (activity_type, activity_data, directory_path, npc, device_id, session_id, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (r['activity_type'], r['activity_data'], val(r, 'directory_path'), val(r, 'npc'), val(r, 'device_id'), val(r, 'session_id'), r['timestamp'])
        )
        inserted += 1

    dst.commit()
    src.close(); dst.close()
    print(f"activity_log: migrated {inserted} rows")

def migrate_browser_history():
    src = sqlite3.connect(NPCSH_DB)
    dst = sqlite3.connect(INCOGNIDE_DB)
    src.row_factory = sqlite3.Row
    dst.row_factory = sqlite3.Row

    rows = src.execute("SELECT * FROM browser_history ORDER BY last_visited").fetchall()
    existing = set()
    for r in dst.execute("SELECT url, last_visited FROM browser_history").fetchall():
        existing.add((r['url'], r['last_visited']))

    inserted = 0
    for r in rows:
        key = (r['url'], r['last_visited'])
        if key in existing:
            continue
        dst.execute(
            "INSERT INTO browser_history (title, url, folder_path, pane_id, navigation_type, visit_count, last_visited) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (val(r, 'title'), r['url'], val(r, 'folder_path'), val(r, 'pane_id'), val(r, 'navigation_type'), val(r, 'visit_count') or 1, r['last_visited'])
        )
        inserted += 1

    dst.commit()
    src.close(); dst.close()
    print(f"browser_history: migrated {inserted} rows")

def migrate_autocomplete_suggestions():
    src = sqlite3.connect(NPCSH_DB)
    dst = sqlite3.connect(INCOGNIDE_DB)
    src.row_factory = sqlite3.Row
    dst.row_factory = sqlite3.Row

    rows = src.execute("SELECT * FROM autocomplete_suggestions ORDER BY timestamp").fetchall()
    existing = set()
    for r in dst.execute("SELECT suggestion, timestamp FROM autocomplete_suggestions").fetchall():
        existing.add((r['suggestion'], r['timestamp']))

    inserted = 0
    for r in rows:
        key = (r['suggestion'], r['timestamp'])
        if key in existing:
            continue
        dst.execute(
            "INSERT INTO autocomplete_suggestions (timestamp, suggestion_type, input_context, suggestion, accepted, npc, model, provider, directory_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (r['timestamp'], val(r, 'suggestion_type'), val(r, 'input_context'), r['suggestion'], val(r, 'accepted') or 0, val(r, 'npc'), val(r, 'model'), val(r, 'provider'), val(r, 'directory_path'))
        )
        inserted += 1

    dst.commit()
    src.close(); dst.close()
    print(f"autocomplete_suggestions: migrated {inserted} rows")

def migrate_autocomplete_training():
    src = sqlite3.connect(NPCSH_DB)
    dst = sqlite3.connect(INCOGNIDE_DB)
    src.row_factory = sqlite3.Row
    dst.row_factory = sqlite3.Row

    rows = src.execute("SELECT * FROM autocomplete_training ORDER BY created_at").fetchall()
    existing = set()
    for r in dst.execute("SELECT input_text, output_text, created_at FROM autocomplete_training").fetchall():
        existing.add((r['input_text'], r['output_text'], r['created_at']))

    inserted = 0
    for r in rows:
        key = (r['input_text'], r['output_text'], r['created_at'])
        if key in existing:
            continue
        dst.execute(
            "INSERT INTO autocomplete_training (suggestion_type, input_text, output_text, accepted, npc, model, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (val(r, 'suggestion_type'), r['input_text'], r['output_text'], val(r, 'accepted') or 0, val(r, 'npc'), val(r, 'model'), r['created_at'])
        )
        inserted += 1

    dst.commit()
    src.close(); dst.close()
    print(f"autocomplete_training: migrated {inserted} rows")

def migrate_command_history():
    src = sqlite3.connect(NPCSH_DB)
    dst = sqlite3.connect(INCOGNIDE_DB)
    src.row_factory = sqlite3.Row

    dst.execute("""
        CREATE TABLE IF NOT EXISTS command_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            command TEXT,
            timestamp TEXT,
            output TEXT,
            location TEXT
        )
    """)
    dst.commit()

    rows = src.execute("SELECT command, timestamp, output, location FROM command_history ORDER BY timestamp").fetchall()
    existing = set()
    try:
        for r in dst.execute("SELECT command, timestamp FROM command_history").fetchall():
            existing.add((r[0], r[1]))
    except:
        pass

    inserted = 0
    for r in rows:
        key = (r[0], r[1])
        if key in existing:
            continue
        dst.execute(
            "INSERT INTO command_history (command, timestamp, output, location) VALUES (?, ?, ?, ?)",
            (r[0], r[1], r[2], r[3])
        )
        inserted += 1

    dst.commit()
    src.close(); dst.close()
    print(f"command_history: migrated {inserted} rows")

def migrate_jinx_executions():
    src = sqlite3.connect(NPCSH_DB)
    dst = sqlite3.connect(INCOGNIDE_DB)
    src.row_factory = sqlite3.Row

    dst.execute("""
        CREATE TABLE IF NOT EXISTS jinx_executions (
            message_id VARCHAR(50) PRIMARY KEY,
            jinx_name VARCHAR(100),
            input TEXT,
            timestamp VARCHAR(50),
            npc VARCHAR(100),
            team VARCHAR(100),
            conversation_id VARCHAR(100),
            device_id VARCHAR(255),
            device_name VARCHAR(255),
            output TEXT,
            status VARCHAR(50),
            error_message TEXT,
            duration_ms INTEGER
        )
    """)
    dst.commit()

    rows = src.execute("SELECT * FROM jinx_executions ORDER BY timestamp").fetchall()
    existing = set()
    try:
        for r in dst.execute("SELECT message_id FROM jinx_executions").fetchall():
            existing.add(r[0])
    except:
        pass

    inserted = 0
    for r in rows:
        if r['message_id'] in existing:
            continue
        dst.execute(
            """
            INSERT INTO jinx_executions (message_id, jinx_name, input, timestamp, npc, team, conversation_id, device_id, device_name, output, status, error_message, duration_ms)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (r['message_id'], val(r, 'jinx_name'), val(r, 'input'), r['timestamp'], val(r, 'npc'), val(r, 'team'), val(r, 'conversation_id'), val(r, 'device_id'), val(r, 'device_name'), val(r, 'output'), val(r, 'status'), val(r, 'error_message'), val(r, 'duration_ms'))
        )
        inserted += 1

    dst.commit()
    src.close(); dst.close()
    print(f"jinx_executions: migrated {inserted} rows")

def migrate_memory_lifecycle():
    src = sqlite3.connect(NPCSH_DB)
    dst = sqlite3.connect(INCOGNIDE_DB)
    src.row_factory = sqlite3.Row

    dst.execute("""
        CREATE TABLE IF NOT EXISTS memory_lifecycle (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message_id VARCHAR(50) NOT NULL,
            conversation_id VARCHAR(100) NOT NULL,
            npc VARCHAR(100) NOT NULL,
            team VARCHAR(100) NOT NULL,
            directory_path TEXT NOT NULL,
            timestamp VARCHAR(50) NOT NULL,
            initial_memory TEXT NOT NULL,
            final_memory TEXT,
            status VARCHAR(50) NOT NULL,
            model VARCHAR(100),
            provider VARCHAR(100),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    dst.commit()

    rows = src.execute("SELECT * FROM memory_lifecycle ORDER BY timestamp").fetchall()
    existing = set()
    try:
        for r in dst.execute("SELECT message_id, timestamp FROM memory_lifecycle").fetchall():
            existing.add((r[0], r[1]))
    except:
        pass

    inserted = 0
    for r in rows:
        key = (r['message_id'], r['timestamp'])
        if key in existing:
            continue
        dst.execute(
            """
            INSERT INTO memory_lifecycle (message_id, conversation_id, npc, team, directory_path, timestamp, initial_memory, final_memory, status, model, provider, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (r['message_id'], r['conversation_id'], r['npc'], r['team'], r['directory_path'], r['timestamp'], r['initial_memory'], val(r, 'final_memory'), r['status'], val(r, 'model'), val(r, 'provider'), val(r, 'created_at'))
        )
        inserted += 1

    dst.commit()
    src.close(); dst.close()
    print(f"memory_lifecycle: migrated {inserted} rows")

if __name__ == '__main__':
    print("Migrating npcsh data to incognide local DB...")
    migrate_activity_log()
    migrate_browser_history()
    migrate_autocomplete_suggestions()
    migrate_autocomplete_training()
    migrate_command_history()
    migrate_jinx_executions()
    migrate_memory_lifecycle()
    print("Done.")
