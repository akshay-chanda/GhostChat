import { API_BASE_URL } from '../utils/constants';

/*
 * --------------------------------------------------
 * In-memory session credentials
 * --------------------------------------------------
 *
 * SECURITY:
 *
 * sessionId:
 *   Private authentication credential.
 *
 * sessionSecret:
 *   Private authentication credential.
 *
 * These values are intentionally kept only in JavaScript
 * memory.
 *
 * They are NOT stored in:
 *
 *   - localStorage
 *   - sessionStorage
 *   - URL parameters
 *   - request bodies
 *   - cookies
 *
 * The values disappear when the page is refreshed or
 * the application is closed.
 */

let sessionCredentials = null;

/**
 * Store the current private session credentials
 * in memory for authenticated HTTP requests.
 *
 * @param {string} sessionId
 * @param {string} sessionSecret
 */
export function setSessionCredentials(
  sessionId,
  sessionSecret
) {
  if (
    typeof sessionId !== 'string' ||
    !sessionId ||
    typeof sessionSecret !== 'string' ||
    !sessionSecret
  ) {
    sessionCredentials = null;
    return;
  }

  sessionCredentials = {
    sessionId,
    sessionSecret,
  };
}

/**
 * Clear the current private session credentials
 * from application memory.
 */
export function clearSessionCredentials() {
  sessionCredentials = null;
}

/**
 * Read the current private session credentials.
 *
 * This function returns a copy so callers cannot
 * directly mutate the internal object.
 */
function getSessionCredentials() {
  if (
    !sessionCredentials?.sessionId ||
    !sessionCredentials?.sessionSecret
  ) {
    return null;
  }

  return {
    sessionId: sessionCredentials.sessionId,
    sessionSecret:
      sessionCredentials.sessionSecret,
  };
}

/**
 * Build authentication headers for an HTTP request.
 *
 * Authentication is explicitly header-based.
 *
 * This avoids relying on cookies across:
 *
 *   Vercel frontend
 *        ↓
 *   Render backend
 *
 * Credentials are never placed in:
 *
 *   - URLs
 *   - query parameters
 *   - request bodies
 */
function getAuthHeaders() {
  const session =
    getSessionCredentials();

  if (!session) {
    return {};
  }

  return {
    'X-Session-Id':
      session.sessionId,

    'X-Session-Secret':
      session.sessionSecret,
  };
}

/**
 * Thin fetch wrapper.
 *
 * Throws an Error with a `.status` property on
 * non-2xx responses.
 *
 * Request and response bodies are never logged because
 * they may contain sensitive room information.
 */
async function request(
  path,
  {
    method = 'GET',
    body,
    headers = {},
  } = {}
) {
  const authHeaders =
    getAuthHeaders();

  const requestHeaders = {
    'Content-Type':
      'application/json',

    ...authHeaders,
    ...headers,
  };

  const response = await fetch(
    `${API_BASE_URL}${path}`,
    {
      method,
      headers: requestHeaders,

      /*
       * IMPORTANT:
       *
       * Do NOT use:
       *
       *   credentials: 'include'
       *
       * Authentication is handled explicitly through
       * X-Session-Id and X-Session-Secret headers.
       *
       * This avoids cross-origin cookie problems between
       * Vercel and Render.
       */

      body:
        body !== undefined &&
        body !== null
          ? JSON.stringify(body)
          : undefined,
    }
  );

  const isJson =
    response.headers
      .get('content-type')
      ?.includes(
        'application/json'
      );

  const data = isJson
    ? await response
        .json()
        .catch(() => null)
    : null;

  if (!response.ok) {
    const error = new Error(
      data?.message ||
        'Request failed'
    );

    error.status =
      response.status;

    error.code =
      data?.code;

    throw error;
  }

  return data;
}

/**
 * Public API wrapper.
 */
export const api = {
  get: (path) =>
    request(path),

  post: (path, body) =>
    request(path, {
      method: 'POST',
      body,
    }),

  delete: (path) =>
    request(path, {
      method: 'DELETE',
    }),
};