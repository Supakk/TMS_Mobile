import { API_BASE_URL, REQUEST_TIMEOUT_MS } from '../config';

/** RFC 9457 problem details as the backend returns them. */
export type ProblemDetails = {
  title?: string;
  detail?: string;
  /** Stable machine-readable code. Branch on this, never on the English text. */
  code?: string;
  status?: number;
  errors?: Record<string, string[]>;
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly problem: ProblemDetails | null,
    readonly requestId: string,
  ) {
    super(problem?.detail ?? problem?.title ?? `HTTP ${status}`);
  }
}

/** The request may or may not have reached the server: a time-out or a network failure. */
export class UnknownOutcomeError extends Error {
  constructor(readonly requestId: string) {
    super('Network failure or time-out');
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  /** A plain object is sent as JSON; FormData is sent as multipart. */
  body?: unknown;
  token?: string | null;
  /** Item version, sent as If-Match. */
  version?: string;
  /** One key per user action; the caller reuses it on retries. */
  idempotencyKey?: string;
};

type Unauthorized = () => void;
let onUnauthorized: Unauthorized | null = null;

/** The session store registers itself here so any 401 clears the session. */
export function setUnauthorizedHandler(handler: Unauthorized | null) {
  onUnauthorized = handler;
}

function newRequestId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** The only place that builds headers. A feature never assembles one itself. */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<{ data: T; etag: string | null }> {
  const requestId = newRequestId();
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Request-Id': requestId,
  };
  const isForm = typeof FormData !== 'undefined' && options.body instanceof FormData;
  if (options.body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.version) headers['If-Match'] = options.version;
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : isForm ? (options.body as FormData) : JSON.stringify(options.body),
      signal: controller.signal,
    });
  } catch {
    throw new UnknownOutcomeError(requestId);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    let problem: ProblemDetails | null = null;
    try {
      problem = (await response.json()) as ProblemDetails;
    } catch {
      problem = null;
    }
    if (response.status === 401 && options.token) onUnauthorized?.();
    throw new ApiError(response.status, problem, requestId);
  }

  const etag = response.headers.get('ETag');
  if (response.status === 204) return { data: undefined as T, etag };
  return { data: (await response.json()) as T, etag };
}
