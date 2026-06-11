import sqlite3
import os
import sys

DB_PATH = os.path.expanduser('~/.incognide/history.db')

def add_annotation_column():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Check if annotation column already exists
    cursor.execute("PRAGMA table_info(pdf_highlights);")
    columns = [info[1] for info in cursor.fetchall()]
    if 'annotation' in columns:
        print("Column 'annotation' already exists. No changes made.")
        conn.close()
        return

    # Add annotation column
    try:
        cursor.execute("ALTER TABLE pdf_highlights ADD COLUMN annotation TEXT DEFAULT NULL;")
        conn.commit()
        print("Column 'annotation' added successfully.")
    except Exception as e:
        print(f"Failed to add column: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    add_annotation_column()