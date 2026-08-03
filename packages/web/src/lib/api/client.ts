import { LOCAL_ORG_ID } from "@/lib/auth/client";

export const API_BASE = import.meta.env.VITE_API_URL ?? "";

// Fully-local single-user build: no Authorization header — just the fixed org
// id the server scopes all queries by.
export async function getAuthHeaders(): Promise<HeadersInit> {
  return { "X-Org-Id": LOCAL_ORG_ID };
}

/**
 * Throws an Error carrying the server's message when one is available, so the
 * UI can show e.g. "No game configured for this collection." instead of just
 * "API error: 400". Returns the parsed body for callers that need it (e.g.
 * 423 lock responses).
 */
async function throwOrReturn<T>(
  res: Response,
): Promise<T | { success: boolean; message?: string }> {
  if (res.ok) return res.json();
  let body: { success?: boolean; message?: string } | null = null;
  try {
    body = await res.json();
  } catch {
    // non-JSON error body — fall back to status text
  }
  const message = body?.message ?? `API error: ${res.status}`;
  const err = new Error(message) as Error & { status?: number };
  err.status = res.status;
  throw err;
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { ...(await getAuthHeaders()) },
  });
  return throwOrReturn<T>(res) as Promise<T>;
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await getAuthHeaders()),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return throwOrReturn<T>(res) as Promise<T>;
}

export async function apiPut<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...(await getAuthHeaders()),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return throwOrReturn<T>(res) as Promise<T>;
}

export async function apiDelete<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "DELETE",
    headers: { ...(await getAuthHeaders()) },
  });
  return throwOrReturn<T>(res) as Promise<T>;
}

export async function apiPostForm<T>(
  path: string,
  formData: FormData,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { ...(await getAuthHeaders()) },
    body: formData,
  });
  return throwOrReturn<T>(res) as Promise<T>;
}
