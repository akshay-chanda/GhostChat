import { API_BASE_URL } from '../utils/constants';

/**
 * Thin fetch wrapper. Throws an Error with a `.status` property on
 * any non-2xx response so callers (see JoinRoomForm's err.status
 * checks) can branch on status codes without re-parsing the response
 * themselves. Never logs request/response bodies — they may contain
 * room passwords.
 */
async function request(path, { method = 'GET', body, headers = {} } = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined,
  });

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    const error = new Error(data?.message || 'Request failed');
    error.status = response.status;
    error.code = data?.code;
    throw error;
  }

  return data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body }),
  delete: (path) => request(path, { method: 'DELETE' }),
};