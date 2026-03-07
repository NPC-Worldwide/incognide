

export interface PasswordEntry {
    id: string;
    name: string;
    url?: string;
    username?: string;
    password: string;
    notes?: string;
    folder?: string;
    totp?: string;
    createdAt: string;
    updatedAt: string;
}

export type PasswordManagerType =
    | 'bitwarden-json'
    | 'bitwarden-csv'
    | 'lastpass-csv'
    | 'chrome-csv'
    | 'firefox-csv'
    | 'apple-csv'
    | '1password-csv'
    | 'dashlane-csv'
    | 'keepass-csv'
    | 'generic-csv';

interface ImportResult {
    success: boolean;
    entries: PasswordEntry[];
    errors: string[];
    skipped: number;
}

const generateId = (): string => {
    return `pwd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

const parseCSV = (content: string): string[][] => {
    const lines: string[][] = [];
    let currentLine: string[] = [];
    let currentField = '';
    let inQuotes = false;

    for (let i = 0; i < content.length; i++) {
        const char = content[i];
        const nextChar = content[i + 1];

        if (inQuotes) {
            if (char === '"' && nextChar === '"') {
                currentField += '"';
                i++;
            } else if (char === '"') {
                inQuotes = false;
            } else {
                currentField += char;
            }
        } else {
            if (char === '"') {
                inQuotes = true;
            } else if (char === ',') {
                currentLine.push(currentField);
                currentField = '';
            } else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
                currentLine.push(currentField);
                if (currentLine.some(f => f.trim())) {
                    lines.push(currentLine);
                }
                currentLine = [];
                currentField = '';
                if (char === '\r') i++;
            } else if (char !== '\r') {
                currentField += char;
            }
        }
    }

    if (currentField || currentLine.length > 0) {
        currentLine.push(currentField);
        if (currentLine.some(f => f.trim())) {
            lines.push(currentLine);
        }
    }

    return lines;
};

const getColumnIndex = (headers: string[], possibleNames: string[]): number => {
    const normalizedHeaders = headers.map(h => h.toLowerCase().trim());
    for (const name of possibleNames) {
        const index = normalizedHeaders.indexOf(name.toLowerCase());
        if (index !== -1) return index;
    }
    return -1;
};

const importBitwardenJSON = (content: string): ImportResult => {
    const errors: string[] = [];
    const entries: PasswordEntry[] = [];
    let skipped = 0;

    try {
        const data = JSON.parse(content);
        const items = data.items || data.logins || [];

        for (const item of items) {
            if (item.type !== 1 && item.type !== undefined) {

                skipped++;
                continue;
            }

            const login = item.login || item;

            if (!login.password && !login.username) {
                skipped++;
                continue;
            }

            entries.push({
                id: generateId(),
                name: item.name || login.name || 'Unnamed',
                url: login.uris?.[0]?.uri || login.url || '',
                username: login.username || '',
                password: login.password || '',
                notes: item.notes || '',
                folder: item.folderId || '',
                totp: login.totp || '',
                createdAt: item.creationDate || new Date().toISOString(),
                updatedAt: item.revisionDate || new Date().toISOString(),
            });
        }
    } catch (e: any) {
        errors.push(`Failed to parse Bitwarden JSON: ${e.message}`);
    }

    return { success: errors.length === 0, entries, errors, skipped };
};

const importBitwardenCSV = (content: string): ImportResult => {
    const errors: string[] = [];
    const entries: PasswordEntry[] = [];
    let skipped = 0;

    try {
        const lines = parseCSV(content);
        if (lines.length < 2) {
            errors.push('CSV file is empty or has no data rows');
            return { success: false, entries, errors, skipped };
        }

        const headers = lines[0];
        const nameIdx = getColumnIndex(headers, ['name', 'title']);
        const urlIdx = getColumnIndex(headers, ['login_uri', 'url', 'uri']);
        const usernameIdx = getColumnIndex(headers, ['login_username', 'username', 'user']);
        const passwordIdx = getColumnIndex(headers, ['login_password', 'password', 'pass']);
        const notesIdx = getColumnIndex(headers, ['notes', 'note', 'comments']);
        const folderIdx = getColumnIndex(headers, ['folder', 'group']);
        const totpIdx = getColumnIndex(headers, ['login_totp', 'totp', 'otp']);

        for (let i = 1; i < lines.length; i++) {
            const row = lines[i];
            const password = passwordIdx >= 0 ? row[passwordIdx] : '';
            const username = usernameIdx >= 0 ? row[usernameIdx] : '';

            if (!password && !username) {
                skipped++;
                continue;
            }

            entries.push({
                id: generateId(),
                name: nameIdx >= 0 ? row[nameIdx] || 'Unnamed' : 'Unnamed',
                url: urlIdx >= 0 ? row[urlIdx] : '',
                username: username,
                password: password,
                notes: notesIdx >= 0 ? row[notesIdx] : '',
                folder: folderIdx >= 0 ? row[folderIdx] : '',
                totp: totpIdx >= 0 ? row[totpIdx] : '',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            });
        }
    } catch (e: any) {
        errors.push(`Failed to parse Bitwarden CSV: ${e.message}`);
    }

    return { success: errors.length === 0, entries, errors, skipped };
};

const importLastPassCSV = (content: string): ImportResult => {
    const errors: string[] = [];
    const entries: PasswordEntry[] = [];
    let skipped = 0;

    try {
        const lines = parseCSV(content);
        if (lines.length < 2) {
            errors.push('CSV file is empty or has no data rows');
            return { success: false, entries, errors, skipped };
        }

        const headers = lines[0];
        const urlIdx = getColumnIndex(headers, ['url', 'uri', 'website']);
        const usernameIdx = getColumnIndex(headers, ['username', 'user', 'email']);
        const passwordIdx = getColumnIndex(headers, ['password', 'pass']);
        const notesIdx = getColumnIndex(headers, ['extra', 'notes', 'note']);
        const nameIdx = getColumnIndex(headers, ['name', 'title', 'site']);
        const folderIdx = getColumnIndex(headers, ['grouping', 'folder', 'group']);
        const totpIdx = getColumnIndex(headers, ['totp', 'otp']);

        for (let i = 1; i < lines.length; i++) {
            const row = lines[i];
            const password = passwordIdx >= 0 ? row[passwordIdx] : '';
            const username = usernameIdx >= 0 ? row[usernameIdx] : '';

            if (!password && !username) {
                skipped++;
                continue;
            }

            let name = nameIdx >= 0 ? row[nameIdx] : '';
            if (!name && urlIdx >= 0) {
                try {
                    const url = new URL(row[urlIdx]);
                    name = url.hostname;
                } catch {
                    name = row[urlIdx] || 'Unnamed';
                }
            }

            entries.push({
                id: generateId(),
                name: name || 'Unnamed',
                url: urlIdx >= 0 ? row[urlIdx] : '',
                username: username,
                password: password,
                notes: notesIdx >= 0 ? row[notesIdx] : '',
                folder: folderIdx >= 0 ? row[folderIdx] : '',
                totp: totpIdx >= 0 ? row[totpIdx] : '',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            });
        }
    } catch (e: any) {
        errors.push(`Failed to parse LastPass CSV: ${e.message}`);
    }

    return { success: errors.length === 0, entries, errors, skipped };
};

const importChromeCSV = (content: string): ImportResult => {
    const errors: string[] = [];
    const entries: PasswordEntry[] = [];
    let skipped = 0;

    try {
        const lines = parseCSV(content);
        if (lines.length < 2) {
            errors.push('CSV file is empty or has no data rows');
            return { success: false, entries, errors, skipped };
        }

        const headers = lines[0];
        const nameIdx = getColumnIndex(headers, ['name', 'title', 'origin']);
        const urlIdx = getColumnIndex(headers, ['url', 'uri', 'origin', 'website']);
        const usernameIdx = getColumnIndex(headers, ['username', 'user', 'login']);
        const passwordIdx = getColumnIndex(headers, ['password', 'pass']);
        const notesIdx = getColumnIndex(headers, ['note', 'notes', 'comment']);

        for (let i = 1; i < lines.length; i++) {
            const row = lines[i];
            const password = passwordIdx >= 0 ? row[passwordIdx] : '';
            const username = usernameIdx >= 0 ? row[usernameIdx] : '';

            if (!password && !username) {
                skipped++;
                continue;
            }

            let name = nameIdx >= 0 ? row[nameIdx] : '';
            if (!name && urlIdx >= 0 && row[urlIdx]) {
                try {
                    const url = new URL(row[urlIdx]);
                    name = url.hostname;
                } catch {
                    name = row[urlIdx];
                }
            }

            entries.push({
                id: generateId(),
                name: name || 'Unnamed',
                url: urlIdx >= 0 ? row[urlIdx] : '',
                username: username,
                password: password,
                notes: notesIdx >= 0 ? row[notesIdx] : '',
                folder: '',
                totp: '',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            });
        }
    } catch (e: any) {
        errors.push(`Failed to parse Chrome CSV: ${e.message}`);
    }

    return { success: errors.length === 0, entries, errors, skipped };
};

const importFirefoxCSV = (content: string): ImportResult => {
    const errors: string[] = [];
    const entries: PasswordEntry[] = [];
    let skipped = 0;

    try {
        const lines = parseCSV(content);
        if (lines.length < 2) {
            errors.push('CSV file is empty or has no data rows');
            return { success: false, entries, errors, skipped };
        }

        const headers = lines[0];
        const urlIdx = getColumnIndex(headers, ['url', 'hostname', 'origin']);
        const usernameIdx = getColumnIndex(headers, ['username', 'user']);
        const passwordIdx = getColumnIndex(headers, ['password', 'pass']);
        const httpRealmIdx = getColumnIndex(headers, ['httprealm', 'realm']);
        const formActionIdx = getColumnIndex(headers, ['formactionorigin', 'formaction']);
        const guidIdx = getColumnIndex(headers, ['guid', 'id']);
        const timeCreatedIdx = getColumnIndex(headers, ['timecreated', 'created']);
        const timePasswordChangedIdx = getColumnIndex(headers, ['timepasswordchanged', 'modified']);

        for (let i = 1; i < lines.length; i++) {
            const row = lines[i];
            const password = passwordIdx >= 0 ? row[passwordIdx] : '';
            const username = usernameIdx >= 0 ? row[usernameIdx] : '';

            if (!password && !username) {
                skipped++;
                continue;
            }

            let name = '';
            const url = urlIdx >= 0 ? row[urlIdx] : '';
            if (url) {
                try {
                    const parsedUrl = new URL(url);
                    name = parsedUrl.hostname;
                } catch {
                    name = url;
                }
            }

            let createdAt = new Date().toISOString();
            let updatedAt = new Date().toISOString();

            if (timeCreatedIdx >= 0 && row[timeCreatedIdx]) {
                try {
                    createdAt = new Date(parseInt(row[timeCreatedIdx])).toISOString();
                } catch {}
            }
            if (timePasswordChangedIdx >= 0 && row[timePasswordChangedIdx]) {
                try {
                    updatedAt = new Date(parseInt(row[timePasswordChangedIdx])).toISOString();
                } catch {}
            }

            entries.push({
                id: generateId(),
                name: name || 'Unnamed',
                url: url,
                username: username,
                password: password,
                notes: httpRealmIdx >= 0 ? row[httpRealmIdx] : '',
                folder: '',
                totp: '',
                createdAt,
                updatedAt,
            });
        }
    } catch (e: any) {
        errors.push(`Failed to parse Firefox CSV: ${e.message}`);
    }

    return { success: errors.length === 0, entries, errors, skipped };
};

const importAppleCSV = (content: string): ImportResult => {
    const errors: string[] = [];
    const entries: PasswordEntry[] = [];
    let skipped = 0;

    try {
        const lines = parseCSV(content);
        if (lines.length < 2) {
            errors.push('CSV file is empty or has no data rows');
            return { success: false, entries, errors, skipped };
        }

        const headers = lines[0];
        const titleIdx = getColumnIndex(headers, ['title', 'name', 'website']);
        const urlIdx = getColumnIndex(headers, ['url', 'website', 'uri']);
        const usernameIdx = getColumnIndex(headers, ['username', 'user', 'account']);
        const passwordIdx = getColumnIndex(headers, ['password', 'pass']);
        const notesIdx = getColumnIndex(headers, ['notes', 'note', 'comments']);
        const otpIdx = getColumnIndex(headers, ['otpauth', 'otp', 'totp']);

        for (let i = 1; i < lines.length; i++) {
            const row = lines[i];
            const password = passwordIdx >= 0 ? row[passwordIdx] : '';
            const username = usernameIdx >= 0 ? row[usernameIdx] : '';

            if (!password && !username) {
                skipped++;
                continue;
            }

            let name = titleIdx >= 0 ? row[titleIdx] : '';
            if (!name && urlIdx >= 0 && row[urlIdx]) {
                try {
                    const url = new URL(row[urlIdx]);
                    name = url.hostname;
                } catch {
                    name = row[urlIdx];
                }
            }

            entries.push({
                id: generateId(),
                name: name || 'Unnamed',
                url: urlIdx >= 0 ? row[urlIdx] : '',
                username: username,
                password: password,
                notes: notesIdx >= 0 ? row[notesIdx] : '',
                folder: '',
                totp: otpIdx >= 0 ? row[otpIdx] : '',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            });
        }
    } catch (e: any) {
        errors.push(`Failed to parse Apple Keychain CSV: ${e.message}`);
    }

    return { success: errors.length === 0, entries, errors, skipped };
};

const import1PasswordCSV = (content: string): ImportResult => {
    const errors: string[] = [];
    const entries: PasswordEntry[] = [];
    let skipped = 0;

    try {
        const lines = parseCSV(content);
        if (lines.length < 2) {
            errors.push('CSV file is empty or has no data rows');
            return { success: false, entries, errors, skipped };
        }

        const headers = lines[0];
        const titleIdx = getColumnIndex(headers, ['title', 'name']);
        const urlIdx = getColumnIndex(headers, ['url', 'urls', 'website']);
        const usernameIdx = getColumnIndex(headers, ['username', 'user', 'login']);
        const passwordIdx = getColumnIndex(headers, ['password', 'pass']);
        const notesIdx = getColumnIndex(headers, ['notes', 'note', 'notesplain']);
        const tagsIdx = getColumnIndex(headers, ['tags', 'tag', 'folder']);
        const otpIdx = getColumnIndex(headers, ['otp', 'totp', 'one-time password']);

        for (let i = 1; i < lines.length; i++) {
            const row = lines[i];
            const password = passwordIdx >= 0 ? row[passwordIdx] : '';
            const username = usernameIdx >= 0 ? row[usernameIdx] : '';

            if (!password && !username) {
                skipped++;
                continue;
            }

            entries.push({
                id: generateId(),
                name: titleIdx >= 0 ? row[titleIdx] || 'Unnamed' : 'Unnamed',
                url: urlIdx >= 0 ? row[urlIdx] : '',
                username: username,
                password: password,
                notes: notesIdx >= 0 ? row[notesIdx] : '',
                folder: tagsIdx >= 0 ? row[tagsIdx] : '',
                totp: otpIdx >= 0 ? row[otpIdx] : '',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            });
        }
    } catch (e: any) {
        errors.push(`Failed to parse 1Password CSV: ${e.message}`);
    }

    return { success: errors.length === 0, entries, errors, skipped };
};

const importDashlaneCSV = (content: string): ImportResult => {
    const errors: string[] = [];
    const entries: PasswordEntry[] = [];
    let skipped = 0;

    try {
        const lines = parseCSV(content);
        if (lines.length < 2) {
            errors.push('CSV file is empty or has no data rows');
            return { success: false, entries, errors, skipped };
        }

        const headers = lines[0];
        const titleIdx = getColumnIndex(headers, ['title', 'name', 'website']);
        const urlIdx = getColumnIndex(headers, ['url', 'website', 'domain']);
        const usernameIdx = getColumnIndex(headers, ['username', 'login', 'email']);
        const passwordIdx = getColumnIndex(headers, ['password', 'pass']);
        const notesIdx = getColumnIndex(headers, ['note', 'notes']);
        const categoryIdx = getColumnIndex(headers, ['category', 'folder', 'group']);
        const otpIdx = getColumnIndex(headers, ['otpsecret', 'otp', 'totp']);

        for (let i = 1; i < lines.length; i++) {
            const row = lines[i];
            const password = passwordIdx >= 0 ? row[passwordIdx] : '';
            const username = usernameIdx >= 0 ? row[usernameIdx] : '';

            if (!password && !username) {
                skipped++;
                continue;
            }

            entries.push({
                id: generateId(),
                name: titleIdx >= 0 ? row[titleIdx] || 'Unnamed' : 'Unnamed',
                url: urlIdx >= 0 ? row[urlIdx] : '',
                username: username,
                password: password,
                notes: notesIdx >= 0 ? row[notesIdx] : '',
                folder: categoryIdx >= 0 ? row[categoryIdx] : '',
                totp: otpIdx >= 0 ? row[otpIdx] : '',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            });
        }
    } catch (e: any) {
        errors.push(`Failed to parse Dashlane CSV: ${e.message}`);
    }

    return { success: errors.length === 0, entries, errors, skipped };
};

const importKeePassCSV = (content: string): ImportResult => {
    const errors: string[] = [];
    const entries: PasswordEntry[] = [];
    let skipped = 0;

    try {
        const lines = parseCSV(content);
        if (lines.length < 2) {
            errors.push('CSV file is empty or has no data rows');
            return { success: false, entries, errors, skipped };
        }

        const headers = lines[0];
        const titleIdx = getColumnIndex(headers, ['title', 'account', 'name']);
        const urlIdx = getColumnIndex(headers, ['url', 'web site', 'website']);
        const usernameIdx = getColumnIndex(headers, ['username', 'user name', 'login name']);
        const passwordIdx = getColumnIndex(headers, ['password']);
        const notesIdx = getColumnIndex(headers, ['notes', 'comments']);
        const groupIdx = getColumnIndex(headers, ['group', 'folder', 'category']);

        for (let i = 1; i < lines.length; i++) {
            const row = lines[i];
            const password = passwordIdx >= 0 ? row[passwordIdx] : '';
            const username = usernameIdx >= 0 ? row[usernameIdx] : '';

            if (!password && !username) {
                skipped++;
                continue;
            }

            entries.push({
                id: generateId(),
                name: titleIdx >= 0 ? row[titleIdx] || 'Unnamed' : 'Unnamed',
                url: urlIdx >= 0 ? row[urlIdx] : '',
                username: username,
                password: password,
                notes: notesIdx >= 0 ? row[notesIdx] : '',
                folder: groupIdx >= 0 ? row[groupIdx] : '',
                totp: '',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            });
        }
    } catch (e: any) {
        errors.push(`Failed to parse KeePass CSV: ${e.message}`);
    }

    return { success: errors.length === 0, entries, errors, skipped };
};

const importGenericCSV = (content: string): ImportResult => {
    const errors: string[] = [];
    const entries: PasswordEntry[] = [];
    let skipped = 0;

    try {
        const lines = parseCSV(content);
        if (lines.length < 2) {
            errors.push('CSV file is empty or has no data rows');
            return { success: false, entries, errors, skipped };
        }

        const headers = lines[0];

        const nameIdx = getColumnIndex(headers, ['name', 'title', 'site', 'website', 'service', 'account']);
        const urlIdx = getColumnIndex(headers, ['url', 'uri', 'website', 'site', 'domain', 'link', 'address']);
        const usernameIdx = getColumnIndex(headers, ['username', 'user', 'login', 'email', 'account', 'id']);
        const passwordIdx = getColumnIndex(headers, ['password', 'pass', 'pwd', 'secret', 'credential']);
        const notesIdx = getColumnIndex(headers, ['notes', 'note', 'comments', 'comment', 'extra', 'description']);
        const folderIdx = getColumnIndex(headers, ['folder', 'group', 'category', 'tag', 'tags']);

        if (passwordIdx === -1) {
            errors.push('Could not find password column. Please ensure your CSV has a "password" column.');
            return { success: false, entries, errors, skipped };
        }

        for (let i = 1; i < lines.length; i++) {
            const row = lines[i];
            const password = row[passwordIdx] || '';
            const username = usernameIdx >= 0 ? row[usernameIdx] : '';

            if (!password && !username) {
                skipped++;
                continue;
            }

            let name = nameIdx >= 0 ? row[nameIdx] : '';
            if (!name && urlIdx >= 0 && row[urlIdx]) {
                try {
                    const url = new URL(row[urlIdx]);
                    name = url.hostname;
                } catch {
                    name = row[urlIdx];
                }
            }

            entries.push({
                id: generateId(),
                name: name || 'Unnamed',
                url: urlIdx >= 0 ? row[urlIdx] : '',
                username: username,
                password: password,
                notes: notesIdx >= 0 ? row[notesIdx] : '',
                folder: folderIdx >= 0 ? row[folderIdx] : '',
                totp: '',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            });
        }
    } catch (e: any) {
        errors.push(`Failed to parse CSV: ${e.message}`);
    }

    return { success: errors.length === 0, entries, errors, skipped };
};

export const detectFormat = (content: string, filename: string): PasswordManagerType | null => {
    const lowerFilename = filename.toLowerCase();
    const trimmedContent = content.trim();

    if (trimmedContent.startsWith('{') || trimmedContent.startsWith('[')) {
        try {
            const data = JSON.parse(trimmedContent);
            if (data.items || data.logins || data.encrypted) {
                return 'bitwarden-json';
            }
        } catch {}
    }

    if (lowerFilename.includes('bitwarden')) return 'bitwarden-csv';
    if (lowerFilename.includes('lastpass')) return 'lastpass-csv';
    if (lowerFilename.includes('chrome') || lowerFilename.includes('chromium')) return 'chrome-csv';
    if (lowerFilename.includes('firefox')) return 'firefox-csv';
    if (lowerFilename.includes('safari') || lowerFilename.includes('keychain') || lowerFilename.includes('apple') || lowerFilename.includes('icloud')) return 'apple-csv';
    if (lowerFilename.includes('1password')) return '1password-csv';
    if (lowerFilename.includes('dashlane')) return 'dashlane-csv';
    if (lowerFilename.includes('keepass')) return 'keepass-csv';
    if (lowerFilename.includes('vivaldi') || lowerFilename.includes('edge') || lowerFilename.includes('brave')) return 'chrome-csv';

    const lines = parseCSV(trimmedContent);
    if (lines.length > 0) {
        const headerLine = lines[0].join(',').toLowerCase();

        if (headerLine.includes('login_uri') || headerLine.includes('login_username')) return 'bitwarden-csv';
        if (headerLine.includes('grouping') && headerLine.includes('extra')) return 'lastpass-csv';
        if (headerLine.includes('httprealm') || headerLine.includes('formactionorigin')) return 'firefox-csv';
        if (headerLine.includes('otpauth')) return 'apple-csv';
    }

    return 'generic-csv';
};

export const importPasswords = (content: string, format: PasswordManagerType): ImportResult => {
    switch (format) {
        case 'bitwarden-json':
            return importBitwardenJSON(content);
        case 'bitwarden-csv':
            return importBitwardenCSV(content);
        case 'lastpass-csv':
            return importLastPassCSV(content);
        case 'chrome-csv':
            return importChromeCSV(content);
        case 'firefox-csv':
            return importFirefoxCSV(content);
        case 'apple-csv':
            return importAppleCSV(content);
        case '1password-csv':
            return import1PasswordCSV(content);
        case 'dashlane-csv':
            return importDashlaneCSV(content);
        case 'keepass-csv':
            return importKeePassCSV(content);
        case 'generic-csv':
        default:
            return importGenericCSV(content);
    }
};

export const exportPasswordsToCSV = (entries: PasswordEntry[]): string => {
    const headers = ['name', 'url', 'username', 'password', 'notes', 'folder', 'totp'];
    const escapeCSV = (value: string): string => {
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
            return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
    };

    const rows = entries.map(entry => [
        escapeCSV(entry.name),
        escapeCSV(entry.url || ''),
        escapeCSV(entry.username || ''),
        escapeCSV(entry.password),
        escapeCSV(entry.notes || ''),
        escapeCSV(entry.folder || ''),
        escapeCSV(entry.totp || ''),
    ].join(','));

    return [headers.join(','), ...rows].join('\n');
};

export const getPasswordManagerDisplayName = (type: PasswordManagerType): string => {
    const names: Record<PasswordManagerType, string> = {
        'bitwarden-json': 'Bitwarden (JSON)',
        'bitwarden-csv': 'Bitwarden (CSV)',
        'lastpass-csv': 'LastPass',
        'chrome-csv': 'Chrome / Chromium / Vivaldi / Edge / Brave',
        'firefox-csv': 'Firefox',
        'apple-csv': 'Apple Passwords / iCloud Keychain',
        '1password-csv': '1Password',
        'dashlane-csv': 'Dashlane',
        'keepass-csv': 'KeePass',
        'generic-csv': 'Generic CSV',
    };
    return names[type] || type;
};
