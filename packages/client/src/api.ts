export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(`${status} ${code}`);
    this.name = 'ApiError';
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let code = 'UNKNOWN';
    try {
      const data = (await response.json()) as { error?: string };
      if (data.error) code = data.error;
    } catch {
      // non-JSON error body — keep generic code
    }
    throw new ApiError(response.status, code);
  }
  return (await response.json()) as T;
}

async function request<T>(method: 'GET' | 'POST', url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return handleResponse<T>(response);
}

export const apiGet = <T>(url: string): Promise<T> => request<T>('GET', url);
export const apiPost = <T>(url: string, body?: unknown): Promise<T> => request<T>('POST', url, body);

/** Uploads a single file as multipart/form-data (field name: `file`). */
export async function apiUpload<T>(url: string, file: File): Promise<T> {
  const form = new FormData();
  form.append('file', file);
  const response = await fetch(url, { method: 'POST', body: form });
  return handleResponse<T>(response);
}
