import { NetworkError } from './errors';

export async function httpPost<T>(url: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new NetworkError(`Network request failed: ${(e as Error).message}`);
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({ message: res.statusText }));
    throw new NetworkError(data.message ?? res.statusText, res.status);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export async function httpGet<T>(url: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch (e) {
    throw new NetworkError(`Network request failed: ${(e as Error).message}`);
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({ message: res.statusText }));
    throw new NetworkError(data.message ?? res.statusText, res.status);
  }
  return res.json();
}
