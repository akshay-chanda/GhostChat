import { API_BASE_URL } from '../utils/constants';

/**
 * Read the current private session credentials for authenticated
 * HTTP requests.
 *
 * SECURITY:
 * - sessionId is private.
 * - sessionSecret is private.
 * - participantId is NOT used for authentication.
 *
 * Credentials are sent only as HTTP headers. They are never added
 * to request bodies or URLs.
 */
function getSessionCredentials() {
  try {
    const pathname = window.location.pathname;

    const roomMatch =
      pathname.match(/^\/room\/([^/]+)/);

    if (!roomMatch) {
      return null;
    }

    const roomId = roomMatch[1];

    const raw =
      sessionStorage.getItem(
        `ghostchat-session-${roomId}`
      );

    if (!raw) {
      return null;
    }

    const session = JSON.parse(raw);

    if (
      !session?.sessionId ||
      !session?.sessionSecret
    ) {
      return null;
    }

    return {
      sessionId: session.sessionId,
      sessionSecret: session.sessionSecret,
    };
  } catch {
    return null;
  }
}

/**
 * Thin fetch wrapper. Throws an Error with a `.status` property on
 * any non-2xx response so callers (see JoinRoomForm's err.status
 * checks) can branch on status codes without re-parsing the response
 * themselves. Never logs request/response bodies — they may contain
 * room passwords.
 */
async function request(
  path,
  {
    method = 'GET',
    body,
    headers = {},
  } = {}
) {
  const session =
    getSessionCredentials();

  const authHeaders = {};

  if (session) {
    authHeaders['X-Session-Id'] =
      session.sessionId;

    authHeaders['X-Session-Secret'] =
      session.sessionSecret;
  }

  const response = await fetch(
    `${API_BASE_URL}${path}`,
    {
      method,
      headers: {
        'Content-Type':
          'application/json',

        ...authHeaders,
        ...headers,
      },
      credentials: 'include',
      body: body
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