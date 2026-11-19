import { API_BASE_URL, MOCK, READ_TIMEOUT_MS, REQUEST_TIMEOUT_MS } from '../config';
import { handleMock, isMockOffline } from '../mock/server';

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

/** Gets the token the failed request carried, so the handler can tell an old token from the current one. */
type Unauthorized = (usedToken: string) => void;
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

  if (MOCK) return mockRequest<T>(path, options, requestId);

  const controller = new AbortController();
  const isRead = (options.method ?? 'GET') === 'GET';
  const timer = setTimeout(() => controller.abort(), isRead ? READ_TIMEOUT_MS : REQUEST_TIMEOUT_MS);
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
    if (response.status === 401 && options.token) onUnauthorized?.(options.token);
    throw new ApiError(response.status, problem, requestId);
  }

  const etag = response.headers.get('ETag');
  if (response.status === 204) return { data: undefined as T, etag };
  return { data: (await response.json()) as T, etag };
}

/** Mock mode: the same outcomes the real call gives (data, ApiError), from memory, after a short delay like a network. */
async function mockRequest<T>(path: string, options: RequestOptions, requestId: string): Promise<{ data: T; etag: string | null }> {
  await new Promise((resolve) => setTimeout(resolve, 250));
  if (isMockOffline()) throw new UnknownOutcomeError(requestId); // the settings switch: pretend there is no signal
  const reply = handleMock({
    method: options.method ?? 'GET',
    path,
    body: options.body,
    token: options.token ?? null,
    ifMatch: options.version ?? null,
    idempotencyKey: options.idempotencyKey ?? null,
  });
  if (reply.status >= 400) {
    if (reply.status === 401 && options.token) onUnauthorized?.(options.token);
    throw new ApiError(reply.status, reply.body as ProblemDetails, requestId);
  }
  return { data: reply.body as T, etag: reply.etag ?? null };
}
