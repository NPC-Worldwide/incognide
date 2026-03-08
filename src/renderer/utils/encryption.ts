

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
        false,
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
    | 'memory';

export const ENCRYPTED_FIELDS: Record<EncryptedEntityType, string[]> = {
    conversation: ['title', 'directory_path'],
    message: ['content', 'reasoning_content', 'tool_calls', 'tool_results'],
    bookmark: ['title', 'url'],
    history: ['title', 'url'],
    memory: ['content', 'metadata']
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
