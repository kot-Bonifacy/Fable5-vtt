export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(`${status} ${code}`);
    this.name = 'ApiError';
  }
}

async function request<T>(method: 'GET' | 'POST', url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
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

export const apiGet = <T>(url: string): Promise<T> => request<T>('GET', url);
export const apiPost = <T>(url: string, body?: unknown): Promise<T> => request<T>('POST', url, body);
