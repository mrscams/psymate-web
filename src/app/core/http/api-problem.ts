import { HttpErrorResponse } from '@angular/common/http';

/** Erreur d'un champ (errors[] d'un 422 ou d'un 400 de paramètre, RFC 9457). */
export interface FieldProblem {
  field: string;
  code: string;
  message: string;
}

/**
 * Toute erreur HTTP, une fois passée par problem.interceptor (handbook §6.3). Les stores et les
 * composants ne voient jamais un HttpErrorResponse : ils testent `code`, jamais `detail` ni `title`.
 */
export interface ApiProblem {
  /** Statut HTTP ; 0 quand le serveur n'a pas répondu (hors ligne, CORS, coupure). */
  status: number;
  /** Code stable du contrat (UNAUTHENTICATED, VALIDATION_FAILED…), ou un code client (NETWORK_ERROR…). */
  code: string;
  detail?: string;
  errors?: FieldProblem[];
  /** 423 et 429 : champ retryAfterSeconds, sinon en-tête Retry-After. */
  retryAfterSeconds?: number;
  /** Champs complémentaires du contrat (existingLinkId, missing, usedByPublishedProfiles…). */
  extra?: Record<string, unknown>;
}

/** Codes posés par le client quand la réponse n'est pas un problem+json du contrat. */
export const CLIENT_PROBLEM_CODES = {
  network: 'NETWORK_ERROR',
  server: 'INTERNAL_ERROR',
  unknown: 'UNKNOWN_ERROR',
} as const;

const KNOWN_FIELDS = new Set([
  'type',
  'title',
  'status',
  'detail',
  'instance',
  'code',
  'errors',
  'retryAfterSeconds',
]);

export function isApiProblem(value: unknown): value is ApiProblem {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<ApiProblem>;
  return typeof candidate.status === 'number' && typeof candidate.code === 'string';
}

/** Pour un store : n'importe quelle erreur attrapée devient un ApiProblem (handbook §7). */
export function asProblem(error: unknown): ApiProblem {
  if (isApiProblem(error)) return error;
  if (error instanceof HttpErrorResponse) return toApiProblem(error);
  return { status: 0, code: CLIENT_PROBLEM_CODES.unknown };
}

/** Traduit une réponse d'erreur HTTP (problem+json ou non) en ApiProblem. */
export function toApiProblem(response: HttpErrorResponse): ApiProblem {
  const body = parseBody(response.error);
  const headerRetry = parseRetryAfter(response.headers?.get('Retry-After') ?? null);

  if (body && typeof body['code'] === 'string') {
    const problem: ApiProblem = {
      status: typeof body['status'] === 'number' ? body['status'] : response.status,
      code: body['code'],
    };
    if (typeof body['detail'] === 'string') problem.detail = body['detail'];
    const errors = parseErrors(body['errors']);
    if (errors) problem.errors = errors;
    const retry =
      typeof body['retryAfterSeconds'] === 'number' ? body['retryAfterSeconds'] : headerRetry;
    if (retry !== undefined) problem.retryAfterSeconds = retry;
    const extra = Object.fromEntries(
      Object.entries(body).filter(([key]) => !KNOWN_FIELDS.has(key)),
    );
    if (Object.keys(extra).length > 0) problem.extra = extra;
    return problem;
  }

  const problem: ApiProblem = {
    status: response.status,
    code:
      response.status === 0
        ? CLIENT_PROBLEM_CODES.network
        : response.status >= 500
          ? CLIENT_PROBLEM_CODES.server
          : CLIENT_PROBLEM_CODES.unknown,
  };
  if (headerRetry !== undefined) problem.retryAfterSeconds = headerRetry;
  return problem;
}

function parseBody(error: unknown): Record<string, unknown> | null {
  if (typeof error === 'string') {
    try {
      return parseBody(JSON.parse(error));
    } catch {
      return null;
    }
  }
  return typeof error === 'object' && error !== null && !Array.isArray(error)
    ? (error as Record<string, unknown>)
    : null;
}

function parseErrors(value: unknown): FieldProblem[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => ({
      field: typeof item['field'] === 'string' ? item['field'] : '',
      code: typeof item['code'] === 'string' ? item['code'] : '',
      message: typeof item['message'] === 'string' ? item['message'] : '',
    }));
}

/** Retry-After en secondes (la forme date HTTP n'est pas utilisée par l'API). */
function parseRetryAfter(value: string | null): number | undefined {
  if (value === null || !/^\d+$/.test(value.trim())) return undefined;
  return Number(value.trim());
}
