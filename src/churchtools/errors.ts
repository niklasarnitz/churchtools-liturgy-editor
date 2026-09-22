export type ChurchToolsErrorKind =
    | 'unauthenticated'
    | 'forbidden'
    | 'not-found'
    | 'conflict'
    | 'validation'
    | 'rate-limited'
    | 'network'
    | 'unknown';

export class ChurchToolsError extends Error {
    readonly kind: ChurchToolsErrorKind;
    readonly status?: number;
    readonly operation?: string;
    readonly details?: unknown;

    constructor(
        message: string,
        options: {
            kind?: ChurchToolsErrorKind;
            status?: number;
            operation?: string;
            details?: unknown;
            cause?: unknown;
        } = {},
    ) {
        super(message, { cause: options.cause });
        this.name = 'ChurchToolsError';
        this.kind = options.kind ?? 'unknown';
        this.status = options.status;
        this.operation = options.operation;
        this.details = options.details;
    }
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | undefined {
    return typeof value === 'object' && value !== null ? (value as UnknownRecord) : undefined;
}

function statusOf(error: unknown): number | undefined {
    const record = asRecord(error);
    const response = asRecord(record?.response);
    return typeof response?.status === 'number' ? response.status : typeof record?.status === 'number' ? record.status : undefined;
}

function responseData(error: unknown): unknown {
    const record = asRecord(error);
    const response = asRecord(record?.response);
    return response?.data ?? record?.data;
}

function messageOf(error: unknown): string | undefined {
    const record = asRecord(error);
    const data = asRecord(responseData(error));
    for (const candidate of [data?.translatedMessage, data?.message, data?.error, record?.message]) {
        if (typeof candidate === 'string' && candidate.trim()) return candidate;
    }
    return undefined;
}

function kindForStatus(status?: number): ChurchToolsErrorKind {
    switch (status) {
        case 401:
            return 'unauthenticated';
        case 403:
            return 'forbidden';
        case 404:
            return 'not-found';
        case 409:
            return 'conflict';
        case 422:
            return 'validation';
        case 429:
            return 'rate-limited';
        default:
            return status === undefined ? 'network' : 'unknown';
    }
}

export function toChurchToolsError(error: unknown, operation?: string): ChurchToolsError {
    if (error instanceof ChurchToolsError) return error;
    const status = statusOf(error);
    return new ChurchToolsError(messageOf(error) ?? 'ChurchTools request failed.', {
        kind: kindForStatus(status),
        status,
        operation,
        details: responseData(error),
        cause: error,
    });
}

export function userFacingChurchToolsMessage(error: unknown): string {
    const normalized = toChurchToolsError(error);
    switch (normalized.kind) {
        case 'unauthenticated':
            return 'Die ChurchTools-Sitzung ist abgelaufen. Bitte erneut anmelden.';
        case 'forbidden':
            return 'Für diese ChurchTools-Aktion fehlen die erforderlichen Berechtigungen.';
        case 'not-found':
            return 'Die angeforderte ChurchTools-Ressource wurde nicht gefunden.';
        case 'conflict':
            return 'ChurchTools meldet einen Konflikt. Bitte den aktuellen Stand prüfen.';
        case 'validation':
            return normalized.message || 'ChurchTools hat die Eingaben abgelehnt.';
        case 'rate-limited':
            return 'ChurchTools hat zu viele Anfragen erhalten. Bitte kurz warten und erneut versuchen.';
        case 'network':
            return 'ChurchTools ist momentan nicht erreichbar.';
        default:
            return normalized.message;
    }
}
