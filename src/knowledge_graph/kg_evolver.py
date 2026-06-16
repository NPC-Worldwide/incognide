"""
Knowledge Graph Evolver — collects, links, and indexes local knowledge.

Functional. No classes. No pickle, no json for model state.

Sources:
  - activity_log (types, paths, npcs)
  - browser_history (urls, titles)
  - autocomplete_suggestions/training (accepted text)
  - jinx_execution_log (jinx names, npcs, paths)
  - .knowledge.yaml files in ~/.incognide directories

Operations:
  - evolve: scan sources, extract entities, create triples, cross-link
  - query: search entities and triples by keyword / relation
  - crosslink: find entities appearing in multiple contexts and link them
  - search: hybrid keyword + graph-traversal search

Storage: SQLite tables kg_entities, kg_relations, kg_triples, kg_locations, kg_evolutions.
"""

import json
import os
import re
import sqlite3
import sys
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

# Ensure npcpy is importable from typical monorepo layouts
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
for _rel in (
    os.path.join(_SCRIPT_DIR, '..', '..', 'npcpy'),
    os.path.join(_SCRIPT_DIR, '..', '..', '..', 'npcpy'),
):
    _cand = os.path.abspath(_rel)
    if os.path.isdir(_cand) and _cand not in sys.path:
        sys.path.insert(0, _cand)

try:
    from npcpy.memory.knowledge_store import KnowledgeStore
except ImportError:
    KnowledgeStore = None

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

DEFAULT_DB_PATH = os.path.expanduser('~/.incognide/history.db')
DEFAULT_MODEL_DIR = os.path.expanduser('~/.incognide/knowledge_graph')

# Standard relation types seeded on first run
STANDARD_RELATIONS = [
    ('located_in', 'spatial'),
    ('mentioned_in', 'contextual'),
    ('used_by', 'functional'),
    ('related_to', 'semantic'),
    ('part_of', 'structural'),
    ('created_by', 'causal'),
    ('co_occurs_with', 'statistical'),
    ('follows', 'temporal'),
    ('precedes', 'temporal'),
    ('similar_to', 'semantic'),
]

# Stop words for entity extraction
STOP_WORDS = {
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare',
    'ought', 'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by',
    'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above',
    'below', 'between', 'under', 'and', 'but', 'or', 'yet', 'so', 'if',
    'because', 'although', 'though', 'while', 'where', 'when', 'that',
    'which', 'who', 'whom', 'whose', 'what', 'this', 'these', 'those',
    'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her',
    'us', 'them', 'my', 'your', 'his', 'its', 'our', 'their', 'mine',
    'yours', 'hers', 'ours', 'theirs', 'myself', 'yourself', 'himself',
    'herself', 'itself', 'ourselves', 'themselves', 'am', 'here', 'there',
    'then', 'now', 'than', 'too', 'very', 'just', 'only', 'also', 'even',
    'back', 'after', 'over', 'up', 'out', 'down', 'off', 'again', 'further',
    'once', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not',
    'same', 'so', 'than', 'too', 'very', 'just', 'own', 'same', 'each',
    'few', 'much', 'many', 'all', 'any', 'both', 'either', 'neither',
    'one', 'two', 'first', 'last', 'next', 'previous', 'new', 'old',
}

# ---------------------------------------------------------------------------
# Entity extraction
# ---------------------------------------------------------------------------


def _extract_tokens(text: str) -> List[str]:
    """Extract candidate entity tokens from text."""
    if not text:
        return []
    # Lowercase, split on non-alphanumeric, filter length > 2, filter stop words
    tokens = re.findall(r'[a-zA-Z][a-zA-Z0-9_\-\.]{2,}', text)
    out = []
    for t in tokens:
        lower = t.lower()
        if lower not in STOP_WORDS and len(lower) > 2:
            out.append(t)
    return out


def _extract_entities_from_json(data: str) -> List[Tuple[str, str, str]]:
    """Extract (name, type, context) from JSON activity data."""
    entities = []
    try:
        obj = json.loads(data)
    except Exception:
        return entities

    if isinstance(obj, dict):
        for k, v in obj.items():
            if isinstance(v, str):
                for tok in _extract_tokens(v):
                    entities.append((tok, 'term', f'{k}={v[:80]}'))
            elif isinstance(v, (list, tuple)):
                for item in v:
                    if isinstance(item, str):
                        for tok in _extract_tokens(item):
                            entities.append((tok, 'term', f'{k} item'))
    return entities


def _extract_url_entities(url: str, title: str = '') -> List[Tuple[str, str, str]]:
    """Extract domain and path tokens from a URL."""
    entities = []
    if not url:
        return entities
    # Domain
    m = re.match(r'https?://([^/]+)', url)
    if m:
        domain = m.group(1)
        entities.append((domain, 'domain', url[:120]))
        # Subdomain tokens
        for part in domain.split('.'):
            if len(part) > 2 and part not in STOP_WORDS:
                entities.append((part, 'domain_part', domain))
    # Path tokens
    path = url.split('://', 1)[-1].split('/', 1)[-1] if '/' in url else ''
    for tok in _extract_tokens(path):
        entities.append((tok, 'url_term', url[:120]))
    # Title tokens
    for tok in _extract_tokens(title or ''):
        entities.append((tok, 'title_term', title[:120]))
    return entities


# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------


def _get_conn(db_path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def _ensure_standard_relations(conn: sqlite3.Connection) -> Dict[str, int]:
    """Seed standard relations, return name -> id mapping."""
    mapping = {}
    cursor = conn.cursor()
    for name, rel_type in STANDARD_RELATIONS:
        cursor.execute(
            "INSERT OR IGNORE INTO kg_relations (name, relation_type) VALUES (?, ?)",
            (name, rel_type),
        )
    conn.commit()
    cursor.execute("SELECT id, name FROM kg_relations")
    for row in cursor.fetchall():
        mapping[row['name']] = row['id']
    return mapping


def _get_or_create_entity(conn: sqlite3.Connection, name: str, entity_type: str, source: str, metadata: Optional[str] = None) -> int:
    """Get existing entity id or create new. Returns entity id."""
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id FROM kg_entities WHERE name = ? AND entity_type = ?",
        (name, entity_type),
    )
    row = cursor.fetchone()
    if row:
        return row['id']
    cursor.execute(
        "INSERT INTO kg_entities (name, entity_type, source, metadata) VALUES (?, ?, ?, ?)",
        (name, entity_type, source, metadata),
    )
    conn.commit()
    return cursor.lastrowid


def _record_location(conn: sqlite3.Connection, entity_id: int, location_type: str, location_value: str, context_snippet: str = '') -> None:
    """Record where an entity was found."""
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id FROM kg_locations WHERE entity_id = ? AND location_type = ? AND location_value = ?",
        (entity_id, location_type, location_value),
    )
    if not cursor.fetchone():
        cursor.execute(
            "INSERT INTO kg_locations (entity_id, location_type, location_value, context_snippet) VALUES (?, ?, ?, ?)",
            (entity_id, location_type, location_value, context_snippet[:200]),
        )
        conn.commit()


def _get_or_create_relation(conn: sqlite3.Connection, name: str, rel_type: str = 'semantic') -> int:
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM kg_relations WHERE name = ?", (name,))
    row = cursor.fetchone()
    if row:
        return row['id']
    cursor.execute(
        "INSERT INTO kg_relations (name, relation_type) VALUES (?, ?)",
        (name, rel_type),
    )
    conn.commit()
    return cursor.lastrowid


def _add_triple(conn: sqlite3.Connection, head_id: int, relation_id: int, tail_id: int, weight: float = 1.0, source: str = '', metadata: str = '') -> None:
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id FROM kg_triples WHERE head_entity_id = ? AND relation_id = ? AND tail_entity_id = ?",
        (head_id, relation_id, tail_id),
    )
    if not cursor.fetchone():
        cursor.execute(
            "INSERT INTO kg_triples (head_entity_id, relation_id, tail_entity_id, weight, source, metadata) VALUES (?, ?, ?, ?, ?, ?)",
            (head_id, relation_id, tail_id, weight, source, metadata),
        )
        conn.commit()
    else:
        cursor.execute(
            "UPDATE kg_triples SET weight = max(weight, ?), updated_at = datetime('now') WHERE head_entity_id = ? AND relation_id = ? AND tail_entity_id = ?",
            (weight, head_id, relation_id, tail_id),
        )
        conn.commit()


def _get_last_evolution_time(conn: sqlite3.Connection) -> Optional[str]:
    cursor = conn.cursor()
    cursor.execute("SELECT created_at FROM kg_evolutions ORDER BY created_at DESC LIMIT 1")
    row = cursor.fetchone()
    return row['created_at'] if row else None


def _log_evolution(conn: sqlite3.Connection, run_type: str, entities_found: int, triples_created: int, cross_links: int, duration_ms: int, log_summary: str) -> None:
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO kg_evolutions (run_type, entities_found, triples_created, cross_links, duration_ms, log_summary) VALUES (?, ?, ?, ?, ?, ?)",
        (run_type, entities_found, triples_created, cross_links, duration_ms, log_summary),
    )
    conn.commit()


# ---------------------------------------------------------------------------
# Source scanners
# ---------------------------------------------------------------------------


def _scan_activity_log(conn: sqlite3.Connection, since: Optional[str]) -> List[Tuple[str, str, str, str, str]]:
    """Scan activity_log and return list of (entity_name, entity_type, context, location_type, location_value)."""
    results = []
    cursor = conn.cursor()
    if since:
        cursor.execute(
            "SELECT activity_type, activity_data, directory_path, npc, timestamp FROM activity_log WHERE timestamp > ? ORDER BY timestamp",
            (since,),
        )
    else:
        cursor.execute(
            "SELECT activity_type, activity_data, directory_path, npc, timestamp FROM activity_log ORDER BY timestamp"
        )
    for row in cursor.fetchall():
        activity_type = row['activity_type'] or 'unknown'
        data = row['activity_data'] or '{}'
        directory = row['directory_path'] or ''
        npc = row['npc'] or ''
        ts = row['timestamp'] or ''

        # Activity type as entity
        results.append((activity_type, 'activity_type', f'timestamp={ts}', 'activity_log', directory or 'global'))

        # NPC as entity
        if npc:
            results.append((npc, 'npc', f'activity_type={activity_type}', 'activity_log', directory or 'global'))

        # Extract from JSON data
        for name, etype, ctx in _extract_entities_from_json(data):
            results.append((name, etype, ctx, 'activity_log', directory or 'global'))

        # Directory as entity
        if directory:
            dir_name = os.path.basename(directory) or directory
            results.append((dir_name, 'directory', f'activity={activity_type}', 'activity_log', directory))
    return results


def _scan_browser_history(conn: sqlite3.Connection, since: Optional[str]) -> List[Tuple[str, str, str, str, str]]:
    results = []
    cursor = conn.cursor()
    if since:
        cursor.execute(
            "SELECT url, title, folder_path FROM browser_history WHERE timestamp > ? ORDER BY timestamp",
            (since,),
        )
    else:
        cursor.execute("SELECT url, title, folder_path FROM browser_history ORDER BY timestamp")
    for row in cursor.fetchall():
        url = row['url'] or ''
        title = row['title'] or ''
        folder = row['folder_path'] or ''
        for name, etype, ctx in _extract_url_entities(url, title):
            results.append((name, etype, ctx, 'browser_history', folder or url))
    return results


def _scan_autocomplete(conn: sqlite3.Connection, since: Optional[str]) -> List[Tuple[str, str, str, str, str]]:
    results = []
    cursor = conn.cursor()
    tables = [
        ("SELECT input_context, suggestion, directory_path FROM autocomplete_suggestions WHERE accepted = 1", "autocomplete_suggestion"),
        ("SELECT input_text, output_text, '' AS directory_path FROM autocomplete_training WHERE accepted = 1", "autocomplete_training"),
    ]
    for query, loc_type in tables:
        try:
            cursor.execute(query)
            for row in cursor.fetchall():
                inp = row[0] or ''
                out = row[1] or ''
                directory = row[2] or ''
                text = inp + ' ' + out
                for tok in _extract_tokens(text):
                    results.append((tok, 'term', f'input={inp[:60]}', loc_type, directory or 'global'))
                if directory:
                    dir_name = os.path.basename(directory) or directory
                    results.append((dir_name, 'directory', 'autocomplete_context', loc_type, directory))
        except Exception:
            pass
    return results


def _scan_jinx_executions(conn: sqlite3.Connection, since: Optional[str]) -> List[Tuple[str, str, str, str, str]]:
    results = []
    cursor = conn.cursor()
    if since:
        cursor.execute(
            "SELECT jinx_name, npc_name, folder_path, input_summary, output_summary FROM jinx_execution_log WHERE timestamp > ?",
            (since,),
        )
    else:
        cursor.execute("SELECT jinx_name, npc_name, folder_path, input_summary, output_summary FROM jinx_execution_log")
    for row in cursor.fetchall():
        jinx = row['jinx_name'] or ''
        npc = row['npc_name'] or ''
        folder = row['folder_path'] or ''
        inp = row['input_summary'] or ''
        out = row['output_summary'] or ''
        if jinx:
            results.append((jinx, 'jinx', f'npc={npc}', 'jinx_execution', folder or 'global'))
        if npc:
            results.append((npc, 'npc', f'jinx={jinx}', 'jinx_execution', folder or 'global'))
        if folder:
            dir_name = os.path.basename(folder) or folder
            results.append((dir_name, 'directory', f'jinx={jinx}', 'jinx_execution', folder))
        for tok in _extract_tokens(inp + ' ' + out):
            results.append((tok, 'term', f'jinx={jinx}', 'jinx_execution', folder or 'global'))
    return results


def _scan_knowledge_yaml(conn: sqlite3.Connection) -> List[Tuple[str, str, str, str, str]]:
    """Scan .knowledge.yaml files in ~/.incognide tree."""
    results = []
    base = os.path.expanduser('~/.incognide')
    try:
        for root, _, files in os.walk(base):
            for f in files:
                if f.endswith('.knowledge.yaml') or f == '.knowledge.yaml':
                    path = os.path.join(root, f)
                    try:
                        with open(path, 'r', encoding='utf-8') as fh:
                            content = fh.read()
                        for tok in _extract_tokens(content):
                            results.append((tok, 'term', f'file={path}', 'knowledge_yaml', root))
                        dir_name = os.path.basename(root) or root
                        results.append((dir_name, 'directory', f'has_knowledge_yaml', 'knowledge_yaml', root))
                    except Exception:
                        pass
    except Exception:
        pass
    return results


# ---------------------------------------------------------------------------
# Cross-linking
# ---------------------------------------------------------------------------


def _build_cross_links(conn: sqlite3.Connection) -> int:
    """Find entities appearing in multiple contexts and create co_occurs_with links."""
    cursor = conn.cursor()
    relation_id = _get_or_create_relation(conn, 'co_occurs_with', 'statistical')
    cross_links = 0

    cursor.execute("""
        SELECT e.id, e.name, COUNT(DISTINCT l.location_type) AS loc_types
        FROM kg_entities e
        JOIN kg_locations l ON e.id = l.entity_id
        GROUP BY e.id
        HAVING loc_types >= 2
    """)
    multi_context = cursor.fetchall()

    # For each pair of entities that share a location_value, link them
    for i, row_i in enumerate(multi_context):
        eid_i = row_i['id']
        name_i = row_i['name']
        cursor.execute(
            "SELECT DISTINCT location_value FROM kg_locations WHERE entity_id = ?",
            (eid_i,),
        )
        locs_i = {r['location_value'] for r in cursor.fetchall()}

        for row_j in multi_context[i + 1:]:
            eid_j = row_j['id']
            if eid_i == eid_j:
                continue
            cursor.execute(
                "SELECT DISTINCT location_value FROM kg_locations WHERE entity_id = ?",
                (eid_j,),
            )
            locs_j = {r['location_value'] for r in cursor.fetchall()}
            shared = locs_i & locs_j
            if shared:
                weight = min(len(shared) * 0.5, 3.0)
                _add_triple(conn, eid_i, relation_id, eid_j, weight=weight, source='crosslink', metadata=f'shared_locations={len(shared)}')
                cross_links += 1

    return cross_links


# ---------------------------------------------------------------------------
# YAML-based evolve (plaintext knowledge stores)
# ---------------------------------------------------------------------------

def evolve_yaml(stores: List[str] = None,
                workspace: str = None,
                include_memories: bool = True,
                include_knowledge: bool = True,
                full_rebuild: bool = False,
                model: str = None,
                provider: str = None) -> Dict[str, Any]:
    """Evolve knowledge graph across plaintext .knowledge.yaml stores."""
    if KnowledgeStore is None:
        return {"status": "error", "reason": "npcpy.memory.knowledge_store not available"}

    if not stores and workspace:
        stores = [s.directory for s in KnowledgeStore.find_all(workspace)]

    if not stores:
        return {"status": "skipped", "reason": "no_stores_found"}

    # Aggregate corpus from all selected stores
    all_facts = []
    all_concepts = []
    for spath in stores:
        store = KnowledgeStore(spath)
        data = store.load()
        if include_memories:
            for mem in data.get("memories", []):
                stmt = mem.get("final_memory") or mem.get("initial_memory", "")
                if stmt:
                    all_facts.append({
                        "statement": stmt,
                        "source_text": stmt,
                        "type": "memory",
                        "generation": 0,
                        "memory_id": mem.get("id"),
                    })
        if include_knowledge:
            for entry in data.get("knowledge", []):
                txt = entry.get("relation") or entry.get("to") or ""
                if txt:
                    all_facts.append({
                        "statement": txt,
                        "source_text": txt,
                        "type": "knowledge",
                        "generation": 0,
                        "memory_id": entry.get("id"),
                    })
        for c in data.get("concepts", []):
            all_concepts.append({
                "name": c["name"],
                "description": c.get("description", ""),
                "generation": c.get("generation", 0),
            })

    stats = {"stores_updated": 0, "total_concepts": 0, "total_links": 0, "stores": []}
    for spath in stores:
        store = KnowledgeStore(spath)
        result = store.evolve(
            model=model,
            provider=provider,
            include_memories=include_memories,
            include_knowledge=include_knowledge,
            full_rebuild=full_rebuild,
            all_facts=all_facts,
            all_concepts=all_concepts,
        )
        stats["stores_updated"] += 1
        stats["stores"].append({"path": spath, **result})
        stats["total_concepts"] += result.get("concepts_added", 0)
        stats["total_links"] += result.get("links_added", 0)

    return {"status": "success", **stats}


# ---------------------------------------------------------------------------
# Evolve
# ---------------------------------------------------------------------------


def evolve(db_path: str, full: bool = False) -> Dict[str, Any]:
    """Main evolution routine: scan all sources, build/update the knowledge graph."""
    start_time = time.time()
    conn = _get_conn(db_path)

    since = None if full else _get_last_evolution_time(conn)

    _ensure_standard_relations(conn)

    all_entities: List[Tuple[str, str, str, str, str]] = []
    all_entities.extend(_scan_activity_log(conn, since))
    all_entities.extend(_scan_browser_history(conn, since))
    all_entities.extend(_scan_autocomplete(conn, since))
    all_entities.extend(_scan_jinx_executions(conn, since))
    all_entities.extend(_scan_knowledge_yaml(conn))

    entity_id_map: Dict[Tuple[str, str], int] = {}
    triples_created = 0

    # Batch insert entities and record locations
    for name, entity_type, context, location_type, location_value in all_entities:
        key = (name, entity_type)
        if key not in entity_id_map:
            eid = _get_or_create_entity(conn, name, entity_type, location_type, context)
            entity_id_map[key] = eid
        else:
            eid = entity_id_map[key]
        _record_location(conn, eid, location_type, location_value, context)

    # Create co-occurrence triples within each location_value
    location_groups: Dict[str, List[int]] = {}
    cursor = conn.cursor()
    cursor.execute("SELECT entity_id, location_type, location_value FROM kg_locations")
    for row in cursor.fetchall():
        loc_key = f"{row['location_type']}:{row['location_value']}"
        location_groups.setdefault(loc_key, []).append(row['entity_id'])

    relation_id_co = _get_or_create_relation(conn, 'co_occurs_with', 'statistical')
    relation_id_loc = _get_or_create_relation(conn, 'located_in', 'spatial')
    relation_id_ctx = _get_or_create_relation(conn, 'mentioned_in', 'contextual')

    for loc_key, eids in location_groups.items():
        unique_eids = list(set(eids))
        if len(unique_eids) < 2:
            continue
        # Pairwise co-occurrence within location
        for i in range(len(unique_eids)):
            for j in range(i + 1, min(i + 5, len(unique_eids))):  # cap pairs to avoid explosion
                _add_triple(conn, unique_eids[i], relation_id_co, unique_eids[j], weight=1.0, source='cooccurrence', metadata=loc_key)
                triples_created += 1

    # Directory-based location links: if entity appears in a directory location, link to directory entity
    cursor.execute("""
        SELECT e.id, l.location_value
        FROM kg_entities e
        JOIN kg_locations l ON e.id = l.entity_id
        WHERE l.location_type = 'activity_log' OR l.location_type = 'jinx_execution' OR l.location_type = 'knowledge_yaml'
    """)
    dir_relations = {}
    for row in cursor.fetchall():
        eid = row['id']
        loc = row['location_value']
        if not loc or loc == 'global':
            continue
        dir_name = os.path.basename(loc) or loc
        dir_key = (dir_name, 'directory')
        if dir_key not in entity_id_map:
            dir_eid = _get_or_create_entity(conn, dir_name, 'directory', 'directory', f'path={loc}')
            entity_id_map[dir_key] = dir_eid
        else:
            dir_eid = entity_id_map[dir_key]
        _add_triple(conn, eid, relation_id_loc, dir_eid, weight=1.0, source='directory_link', metadata=loc)
        triples_created += 1

    # Cross-link entities across contexts
    cross_links = _build_cross_links(conn)

    duration_ms = int((time.time() - start_time) * 1000)
    summary = f"Evolved from {len(all_entities)} raw entities. Entities: {len(entity_id_map)}, Triples: {triples_created}, Cross-links: {cross_links}"
    _log_evolution(conn, 'full' if full else 'incremental', len(entity_id_map), triples_created, cross_links, duration_ms, summary)
    conn.close()

    return {
        'success': True,
        'entities_found': len(entity_id_map),
        'triples_created': triples_created,
        'cross_links': cross_links,
        'duration_ms': duration_ms,
        'summary': summary,
    }


# ---------------------------------------------------------------------------
# Query / Search
# ---------------------------------------------------------------------------


def query_entity(db_path: str, name: str, entity_type: Optional[str] = None) -> List[Dict[str, Any]]:
    conn = _get_conn(db_path)
    cursor = conn.cursor()
    if entity_type:
        cursor.execute(
            "SELECT * FROM kg_entities WHERE name = ? AND entity_type = ?",
            (name, entity_type),
        )
    else:
        cursor.execute("SELECT * FROM kg_entities WHERE name = ?", (name,))
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows


def search_entities(db_path: str, keyword: str, limit: int = 20) -> List[Dict[str, Any]]:
    conn = _get_conn(db_path)
    cursor = conn.cursor()
    cursor.execute(
        "SELECT * FROM kg_entities WHERE name LIKE ? LIMIT ?",
        (f'%{keyword}%', limit),
    )
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows


def search_triples(db_path: str, head_name: Optional[str] = None, relation_name: Optional[str] = None, tail_name: Optional[str] = None, limit: int = 50) -> List[Dict[str, Any]]:
    conn = _get_conn(db_path)
    cursor = conn.cursor()
    query = """
        SELECT t.*, eh.name AS head_name, eh.entity_type AS head_type,
               r.name AS relation_name,
               et.name AS tail_name, et.entity_type AS tail_type
        FROM kg_triples t
        JOIN kg_entities eh ON t.head_entity_id = eh.id
        JOIN kg_relations r ON t.relation_id = r.id
        JOIN kg_entities et ON t.tail_entity_id = et.id
        WHERE 1=1
    """
    params = []
    if head_name:
        query += " AND eh.name LIKE ?"
        params.append(f'%{head_name}%')
    if relation_name:
        query += " AND r.name LIKE ?"
        params.append(f'%{relation_name}%')
    if tail_name:
        query += " AND et.name LIKE ?"
        params.append(f'%{tail_name}%')
    query += " ORDER BY t.weight DESC LIMIT ?"
    params.append(limit)
    cursor.execute(query, params)
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows


def get_entity_graph(db_path: str, entity_name: str, max_depth: int = 2, breadth: int = 10) -> Dict[str, Any]:
    """BFS graph traversal starting from an entity."""
    conn = _get_conn(db_path)
    cursor = conn.cursor()

    cursor.execute("SELECT id FROM kg_entities WHERE name = ?", (entity_name,))
    start_row = cursor.fetchone()
    if not start_row:
        conn.close()
        return {'error': f'Entity "{entity_name}" not found'}

    start_id = start_row['id']
    visited = {start_id}
    frontier = [start_id]
    nodes = {start_id: {'name': entity_name, 'depth': 0}}
    edges = []

    for depth in range(max_depth):
        next_frontier = []
        for eid in frontier:
            cursor.execute("""
                SELECT t.*, eh.name AS head_name, r.name AS rel_name, et.name AS tail_name
                FROM kg_triples t
                JOIN kg_entities eh ON t.head_entity_id = eh.id
                JOIN kg_relations r ON t.relation_id = r.id
                JOIN kg_entities et ON t.tail_entity_id = et.id
                WHERE t.head_entity_id = ? OR t.tail_entity_id = ?
                ORDER BY t.weight DESC LIMIT ?
            """, (eid, eid, breadth))
            for row in cursor.fetchall():
                other_id = row['tail_entity_id'] if row['head_entity_id'] == eid else row['head_entity_id']
                other_name = row['tail_name'] if row['head_entity_id'] == eid else row['head_name']
                edge_dir = 'out' if row['head_entity_id'] == eid else 'in'
                if other_id not in visited:
                    visited.add(other_id)
                    nodes[other_id] = {'name': other_name, 'depth': depth + 1}
                    next_frontier.append(other_id)
                edges.append({
                    'head': row['head_name'],
                    'relation': row['rel_name'],
                    'tail': row['tail_name'],
                    'weight': row['weight'],
                    'direction': edge_dir,
                })
        frontier = next_frontier
        if not frontier:
            break

    conn.close()
    return {
        'start': entity_name,
        'nodes': [{'id': k, **v} for k, v in nodes.items()],
        'edges': edges,
    }


def hybrid_search(db_path: str, query: str, max_results: int = 20) -> List[Dict[str, Any]]:
    """Hybrid search: keyword match on entities + triple graph traversal."""
    conn = _get_conn(db_path)
    cursor = conn.cursor()
    results = []

    # Keyword match entities
    cursor.execute(
        "SELECT * FROM kg_entities WHERE name LIKE ? LIMIT ?",
        (f'%{query}%', max_results),
    )
    for row in cursor.fetchall():
        results.append({
            'type': 'entity',
            'name': row['name'],
            'entity_type': row['entity_type'],
            'source': row['source'],
            'score': 1.0,
        })

    # Keyword match triples
    cursor.execute("""
        SELECT eh.name AS head_name, r.name AS rel_name, et.name AS tail_name, t.weight
        FROM kg_triples t
        JOIN kg_entities eh ON t.head_entity_id = eh.id
        JOIN kg_relations r ON t.relation_id = r.id
        JOIN kg_entities et ON t.tail_entity_id = et.id
        WHERE eh.name LIKE ? OR et.name LIKE ? OR r.name LIKE ?
        ORDER BY t.weight DESC LIMIT ?
    """, (f'%{query}%', f'%{query}%', f'%{query}%', max_results))
    for row in cursor.fetchall():
        results.append({
            'type': 'triple',
            'head': row['head_name'],
            'relation': row['rel_name'],
            'tail': row['tail_name'],
            'score': float(row['weight']),
        })

    conn.close()
    return results[:max_results]


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument('--db-path', default=DEFAULT_DB_PATH)
    parser.add_argument('command', choices=['evolve', 'query', 'search', 'graph', 'hybrid'])
    parser.add_argument('--name', default='', help='Entity name for query/graph')
    parser.add_argument('--type', default=None, help='Entity type filter')
    parser.add_argument('--head', default=None)
    parser.add_argument('--relation', default=None)
    parser.add_argument('--tail', default=None)
    parser.add_argument('--keyword', default='', help='Search keyword')
    parser.add_argument('--limit', type=int, default=20)
    parser.add_argument('--max-depth', type=int, default=2)
    parser.add_argument('--full', action='store_true', help='Full re-evolution (ignore last run time)')
    parser.add_argument('--stores', default=None, help='JSON array of .knowledge.yaml parent directory paths')
    parser.add_argument('--workspace', default=None, help='Directory to auto-scan for .knowledge.yaml files')
    parser.add_argument('--include-memories', action='store_true', default=True)
    parser.add_argument('--include-knowledge', action='store_true', default=True)
    parser.add_argument('--full-rebuild', action='store_true', help='Wipe existing concepts/links and regenerate')
    parser.add_argument('--model', default=None)
    parser.add_argument('--provider', default=None)
    args = parser.parse_args()

    if args.command == 'evolve':
        if args.stores or args.workspace:
            stores = None
            if args.stores:
                try:
                    stores = json.loads(args.stores)
                except Exception:
                    stores = [args.stores]
            result = evolve_yaml(
                stores=stores,
                workspace=args.workspace,
                include_memories=args.include_memories,
                include_knowledge=args.include_knowledge,
                full_rebuild=args.full_rebuild,
                model=args.model,
                provider=args.provider,
            )
        else:
            result = evolve(args.db_path, full=args.full)
    elif args.command == 'query':
        result = query_entity(args.db_path, args.name, args.type)
    elif args.command == 'search':
        result = search_entities(args.db_path, args.keyword, args.limit)
    elif args.command == 'graph':
        result = get_entity_graph(args.db_path, args.name, max_depth=args.max_depth, breadth=args.limit)
    elif args.command == 'hybrid':
        result = hybrid_search(args.db_path, args.keyword, args.limit)
    else:
        result = {'error': 'unknown command'}

    print(json.dumps(result, default=str))
