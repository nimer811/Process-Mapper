import { authHeaders } from '@/auth/headers';
import { ApiError } from './api';

/** Downloads an authenticated API file and saves it with the server-provided filename. */
export async function downloadFile(path: string, fallbackName: string) {
  const headers = new Headers(await authHeaders());

  const res = await fetch(`/api/v1${path}`, { headers });
  if (!res.ok) {
    const problem = await res
      .json()
      .catch(() => ({ type: 'about:blank', title: res.statusText, status: res.status }));
    throw new ApiError(problem);
  }
  const disposition = res.headers.get('content-disposition') ?? '';
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? fallbackName;

  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
