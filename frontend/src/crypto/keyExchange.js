// Every participant already holds the same secret: the room
// password. That makes a full ECDH exchange unnecessary complexity —
// there's no asymmetric "who am I talking to" problem to solve, just
// "turn the shared password into a key nobody can brute-force from
// the ciphertext alone." So this module derives one shared AES-GCM
// key per room via PBKDF2 (Web Crypto's built-in, not a custom
// construction), salted with the room ID so the same password used
// in two different rooms never produces the same key.
//
// This intentionally does not implement forward secrecy across a
// whole room's lifetime — anyone who learns the room password can
// derive the same key for as long as the room exists. That's a
// documented limitation (see SECURITY.md), not an oversight.

const PBKDF2_ITERATIONS = 250_000;

async function importPasswordKey(password) {
  const encoder = new TextEncoder();
  return crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
}

/**
 * Derives a per-room AES-256-GCM key from the room password.
 * `roomId` doubles as the PBKDF2 salt so the derivation is
 * deterministic across participants without transmitting a salt.
 */
export async function deriveRoomKey(password, roomId) {
  const passwordKey = await importPasswordKey(password);
  const salt = new TextEncoder().encode(`ghostchat:${roomId}`);

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false, // not extractable — the raw key material never leaves the CryptoKey object
    ['encrypt', 'decrypt']
  );
}
