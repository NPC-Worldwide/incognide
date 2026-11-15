

export function generateSalt(): string {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    return arrayBufferToBase64(salt.buffer as ArrayBuffer);
}

export async function deriveKey(password: string, saltBase64: string): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const salt = base64ToArrayBuffer(saltBase64);

    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(password),
        'PBKDF2',
        false,
        ['deriveKey']
    );

    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: salt.buffer as ArrayBuffer,
            iterations: 100000,
            hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
    );
}

export async function encrypt(
    data: string,
    key: CryptoKey
): Promise<{ ciphertext: string; iv: string }> {

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(data);

    const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
        key,
        encoded
    );

    return {
        ciphertext: arrayBufferToBase64(ciphertext),
        iv: arrayBufferToBase64(iv.buffer as ArrayBuffer)
    };
}

export async function decrypt(
    ciphertextBase64: string,
    ivBase64: string,
    key: CryptoKey
): Promise<string> {
    const ciphertext = base64ToArrayBuffer(ciphertextBase64);
    const iv = base64ToArrayBuffer(ivBase64);

    const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
        key,
        ciphertext.buffer as ArrayBuffer
    );

    return new TextDecoder().decode(decrypted);
}

export async function encryptObject(
    obj: unknown,
    key: CryptoKey
): Promise<{ ciphertext: string; iv: string }> {
    const json = JSON.stringify(obj);
    return encrypt(json, key);
}

export async function decryptObject<T = unknown>(
    ciphertextBase64: string,
    ivBase64: string,
    key: CryptoKey
): Promise<T> {
    const json = await decrypt(ciphertextBase64, ivBase64, key);
    return JSON.parse(json) as T;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function base64ToArrayBuffer(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

export type EncryptedEntityType =
    | 'conversation'
    | 'message'
    | 'bookmark'
    | 'history'
    | 'memory'
    | 'agent'
    // Additional sync categories. Each entry below lists the fields that must
    // not leave the device in the clear.
    | 'pdf_highlight'
    | 'pdf_drawing'
    | 'kg_entity'
    | 'kg_relation'
    | 'kg_triple'
    | 'command'
    | 'jinx_execution'
    | 'file_index'
    | 'attachment';

/**
 * Fields encrypted per entity type.
 *
 * INVARIANT: every name here MUST exist as a column on the table the exporter
 * reads for that type. `encryptEntity` builds its plaintext by copying only
 * these keys and skipping the ones whose value is `undefined`, so a name that
 * is not on the row is dropped SILENTLY -- the blob still encrypts, still
 * uploads, still decrypts, and simply arrives missing that field on every
 * other device. There is no error at any layer.
 *
 * That is exactly how the knowledge graph shipped unusable: kg_relation listed
 * `source_id`/`target_id` and kg_triple listed `subject`/`predicate`/`object`,
 * while the real columns are `name` and `head_entity_id`/`relation_id`/
 * `tail_entity_id`. Relations decrypted with no endpoints and triples with
 * nothing but an id, so no graph could be rebuilt anywhere.
 *
 * Every name must exist on its real table; a missing one is dropped silently.
 */
export const ENCRYPTED_FIELDS: Record<EncryptedEntityType, string[]> = {
    // NOTE: nothing currently ENCRYPTS this type -- the renderer pushes
    // per-message blobs and `sync:export-data` derives conversation summaries
    // (conversation_id / directory_path / created_at / updated_at) from
    // conversation_history without uploading them separately. Kept in sync with
    // the real message columns so it stays correct if a producer is added.
    conversation: ['conversation_id', 'directory_path', 'timestamp'],
    message: [
        'message_id', 'timestamp', 'role', 'content', 'conversation_id',
        'directory_path', 'model', 'provider', 'npc', 'team',
        'reasoning_content', 'tool_calls', 'tool_results',
        'device_id', 'device_name',
        'input_tokens', 'output_tokens', 'cost',
        // Provenance for messages ingested from a coding agent's own history
        // (codex/claude/opencode). The source path can reveal project layout,
        // so it is encrypted with the rest of the message rather than sent in
        // the clear.
        'source_agent', 'source_session_id', 'source_path'
    ],
    bookmark: ['id', 'title', 'url', 'folder_path', 'is_global', 'timestamp'],
    history: ['id', 'title', 'url', 'folder_path', 'visit_count', 'last_visited'],
    memory: ['content', 'metadata'],
    // Agents sync only their portable identity/label/pin state. Discovery data
    // such as local paths and credential presence is deliberately excluded by
    // agents:export in the main process.
    agent: ['id', 'label', 'command', 'pinned', 'custom'],

    // PDF annotations: the highlighted text and any note are user content, and
    // the file path reveals project layout.
    // Columns per src/main.js `pdf_highlights`. The anchor is `position_json`,
    // not `position`; without it a highlight cannot be placed back on a page.
    pdf_highlight: [
        'id', 'file_path', 'highlighted_text', 'annotation', 'color',
        'position_json', 'timestamp'
    ],
    // Columns per src/main.js `pdf_drawings`. The ink itself is `svg_path`
    // (there is no `drawing_data` column), so the full stroke geometry and its
    // placement all have to travel or the drawing is unreproducible.
    pdf_drawing: [
        'id', 'file_path', 'page_index', 'drawing_type', 'svg_path',
        'stroke_color', 'stroke_width',
        'position_x', 'position_y', 'width', 'height', 'timestamp'
    ],

    // Knowledge-graph rows are pure user content.
    // Columns per src/main.js `kg_entities`. `description`/`properties` do not
    // exist -- the descriptive payload lives in `metadata`. `embedding` is a
    // derived vector blob and is deliberately not synced.
    kg_entity: ['id', 'name', 'entity_type', 'source', 'metadata', 'created_at', 'updated_at'],
    // Columns per src/main.js `kg_relations`. A relation's identity is its
    // `name`; the endpoints live on kg_triples, not here.
    kg_relation: ['id', 'name', 'relation_type', 'created_at'],
    // Columns per src/main.js `kg_triples`. This is where the graph edges are
    // actually stored: head/relation/tail. Syncing only `id` reproduced nothing.
    kg_triple: [
        'id', 'head_entity_id', 'relation_id', 'tail_entity_id', 'weight',
        'source', 'metadata', 'created_at'
    ],

    // Command history can contain secrets typed at a prompt.
    command: ['id', 'command', 'output', 'location', 'timestamp', 'subcommands', 'device_id', 'device_name'],

    // Execution logs carry the jinx input/output, which is user content.
    jinx_execution: ['message_id', 'jinx_name', 'input', 'output', 'timestamp', 'npc', 'team',
                     'conversation_id', 'error_message', 'device_id', 'device_name'],

    // File index paths and previews reveal filesystem layout and file contents.
    file_index: ['id', 'path', 'folder_path', 'filename', 'extension', 'size', 'mtime',
                 'content_hash', 'content_preview', 'indexed_at'],

    // Message attachments: the actual bytes are the sensitive part.
    attachment: ['id', 'message_id', 'attachment_name', 'attachment_type', 'attachment_data',
                 'attachment_size', 'file_path', 'upload_timestamp']
};

export async function encryptEntity(
    entity: Record<string, unknown>,
    entityType: EncryptedEntityType,
    key: CryptoKey
): Promise<{ encrypted_data: string; iv: string }> {
    const sensitiveFields = ENCRYPTED_FIELDS[entityType] || [];
    const sensitiveData: Record<string, unknown> = {};

    for (const field of sensitiveFields) {
        if (entity[field] !== undefined) {
            sensitiveData[field] = entity[field];
        }
    }

    const { ciphertext, iv } = await encryptObject(sensitiveData, key);
    return { encrypted_data: ciphertext, iv };
}

export async function decryptEntity<T extends Record<string, unknown>>(
    encryptedData: string,
    iv: string,
    nonSensitiveData: Partial<T>,
    key: CryptoKey
): Promise<T> {
    const sensitiveData = await decryptObject<Record<string, unknown>>(encryptedData, iv, key);
    return { ...nonSensitiveData, ...sensitiveData } as T;
}

let encryptionKey: CryptoKey | null = null;

export function setEncryptionKey(key: CryptoKey | null): void {
    encryptionKey = key;
}

export function getEncryptionKey(): CryptoKey | null {
    return encryptionKey;
}

export function clearEncryptionKey(): void {
    encryptionKey = null;
}

export function hasEncryptionKey(): boolean {
    return encryptionKey !== null;
}
