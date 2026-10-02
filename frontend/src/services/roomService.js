import {
  api,
  setSessionCredentials,
} from './api';

/**
 * HTTP-side room operations.
 *
 * Authentication is handled by api.js using the private
 * X-Session-Id and X-Session-Secret headers.
 *
 * Private session credentials are kept only in JavaScript
 * memory and are never stored in:
 *
 *   - localStorage
 *   - sessionStorage
 *   - URLs
 *   - request bodies after authentication is established
 *   - cross-origin cookies
 *
 * Real-time room actions that need to reach everyone
 * immediately are handled by Socket.IO.
 */

/**
 * Create a new room.
 *
 * The backend returns the owner's private session
 * credentials. Store those credentials in the in-memory
 * HTTP authentication layer immediately.
 */
export async function createRoom({
  roomName,
  password,
  duration,
  maxParticipants,
  allowFiles,
}) {
  const result = await api.post('/rooms', {
    roomName,
    password,
    duration,
    maxParticipants,
    allowFileSharing: allowFiles,
  });

  /*
   * The owner is authenticated for subsequent HTTP
   * requests using these private credentials.
   *
   * IMPORTANT:
   *
   * sessionId and sessionSecret are NOT persisted.
   */
  if (
    result?.sessionId &&
    result?.sessionSecret
  ) {
    setSessionCredentials(
      result.sessionId,
      result.sessionSecret
    );
  }

  return result;
}

/**
 * Join an existing room.
 *
 * The backend returns a newly generated private
 * sessionId and sessionSecret for this participant.
 *
 * Store them only in the in-memory authentication layer.
 */
export async function joinRoom({
  roomId,
  password,
}) {
  const result = await api.post(
    '/rooms/join',
    {
      roomId,
      password,
    }
  );

  /*
   * Establish authenticated HTTP requests for this
   * participant.
   */
  if (
    result?.sessionId &&
    result?.sessionSecret
  ) {
    setSessionCredentials(
      result.sessionId,
      result.sessionSecret
    );
  }

  return result;
}

/**
 * Get public room information.
 *
 * If an authenticated session already exists,
 * api.js automatically attaches:
 *
 *   X-Session-Id
 *   X-Session-Secret
 *
 * No cookie is required.
 */
export async function getRoomInfo(
  roomId
) {
  return api.get(
    `/rooms/${encodeURIComponent(roomId)}`
  );
}