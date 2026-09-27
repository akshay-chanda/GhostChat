// Client-side generation for UX convenience (a suggested strong
// password, an optimistic local message id for the reconnect
// idempotency logic in useReconnect). The Room ID itself is always
// generated server-side with crypto.randomBytes — this file never
// generates anything the server is expected to trust as-is.

const PASSWORD_CHARSET =
  'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*';

export function generateStrongPassword(length = 16) {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => PASSWORD_CHARSET[b % PASSWORD_CHARSET.length]).join('');
}

/**
 * A client-generated id attached to outgoing messages before the
 * server assigns its own canonical id. Used to de-duplicate a
 * message that gets echoed back after a reconnect (see useReconnect),
 * never used for anything authorization-related.
 */
export function generateClientMessageId() {
  return crypto.randomUUID();
}
