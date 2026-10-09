import type { ProblemDetails } from '@process-ai/shared';
import { authHeaders } from '@/auth/headers';

export class ApiError extends Error {
  constructor(public readonly problem: ProblemDetails) {
    super(problem.title);
  }
  get status() {
    return this.problem.status;
  }
}

/** Fetch wrapper for /api/v1: attaches identity, parses JSON, throws ApiError with problem details. */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('accept', 'application/json');
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  for (const [k, v] of Object.entries(await authHeaders())) headers.set(k, v);

  const res = await fetch(`/api/v1${path}`, { ...init, headers });
  if (!res.ok) {
    const problem = await res
      .json()
      .catch(() => ({ type: 'about:blank', title: res.statusText, status: res.status }));
    throw new ApiError(problem as ProblemDetails);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}
