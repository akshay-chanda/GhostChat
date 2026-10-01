import { API_BASE_URL } from '../utils/constants';

/**
 * Thin fetch wrapper for the GhostChat API.
 *
 * - Sends credentials so the signed session cookie is included.
 * - Parses JSON responses when available.
 * - Throws an Error containing status/code/message for non-2xx responses.
 * - Converts network/CORS failures into a clearer error.
 *
 * Never logs request or response bodies because they may contain
 * room passwords or other sensitive information.
 */
async function request(
  path,
  {
    method = 'GET',
    body,
    headers = {},
  } = {}
) {
  let response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,

      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },

      credentials: 'include',

      body:
        body !== undefined
          ? JSON.stringify(body)
          : undefined,
    });
  } catch (networkError) {
    const error = new Error(
      'Unable to connect to the GhostChat server. Please check your internet connection and try again.'
    );

    error.code = 'networkError';
    error.status = 0;
    error.cause = networkError;

    throw error;
  }

  const contentType =
    response.headers.get('content-type') || '';

  const isJson =
    contentType.includes('application/json');

  const data = isJson
    ? await response.json().catch(() => null)
    : null;

  if (!response.ok) {
    const error = new Error(
      data?.message ||
        `Request failed with status ${response.status}.`
    );

    error.status = response.status;
    error.code = data?.code;

    throw error;
  }

  return data;
}

export const api = {
  get: (path) => {
    return request(path);
  },

  post: (path, body) => {
    return request(path, {
      method: 'POST',
      body,
    });
  },

  delete: (path) => {
    return request(path, {
      method: 'DELETE',
    });
  },
};