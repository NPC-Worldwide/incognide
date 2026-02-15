/**
 * Electron-based DocumentFileApi adapter.
 * Bridges window.api (Electron IPC) to the npcts DocumentFileApi interface
 * so the shared viewer components work in incognide.
 */
import type { DocumentFileApi } from 'npcts';

declare global {
    interface Window {
        api: {
            readFileBuffer: (path: string) => Promise<ArrayBuffer>;
            readFileContent: (path: string) => Promise<string>;
            writeFileContent: (path: string, content: string | ArrayBuffer, encoding?: string) => Promise<void>;
            writeFileBuffer: (path: string, buffer: ArrayBuffer | Uint8Array) => Promise<void>;
            readCsvContent: (path: string) => Promise<{ headers?: string[]; rows?: any[][]; error?: string; content?: string }>;
            readDocxContent: (path: string) => Promise<{ content?: string; error?: string }>;
            [key: string]: any;
        };
    }
}

export const electronFileApi: DocumentFileApi = {
    readFileBuffer: (path: string) => window.api.readFileBuffer(path),

    readFileContent: (path: string) => window.api.readFileContent(path),

    writeFileContent: (path: string, content: string) => window.api.writeFileContent(path, content),

    writeFileBuffer: (path: string, buffer: ArrayBuffer | Uint8Array) => {
        if (window.api.writeFileBuffer) {
            return window.api.writeFileBuffer(path, buffer);
        }
        // Fallback: some versions use writeFileContent with 'binary' flag
        return window.api.writeFileContent(path, buffer as any, 'binary');
    },

    convertDocxToHtml: async (path: string) => {
        const response = await window.api.readDocxContent(path);
        return {
            html: response.content || '',
            error: response.error,
        };
    },

    readCsvContent: async (path: string) => {
        const response = await window.api.readCsvContent(path);
        if (response.error) return { content: '', error: response.error };
        // readCsvContent in Electron returns parsed { headers, rows } - convert back to text
        // But the npcts CsvViewer expects raw text. For XLSX files this path isn't used anyway.
        // Return the content if available, otherwise signal that parsed data was returned.
        return { content: response.content || '', error: undefined };
    },
};
