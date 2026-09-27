// AES-256-GCM via the browser's native Web Crypto API — authenticated
// encryption, so tampering with ciphertext in transit is detected on
// decrypt rather than silently producing garbage plaintext.

const IV_LENGTH_BYTES = 12; // standard for AES-GCM

/**
 * Encrypts plaintext with the room's derived key. Returns base64
 * strings so the payload is safe to embed in a JSON WebSocket
 * message; the server only ever sees these two opaque strings.
 */
export async function encryptMessage(plaintext, key) {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH_BYTES));
  const encoded = new TextEncoder().encode(plaintext);

  const ciphertextBuffer = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);

  return {
    ciphertext: bufferToBase64(ciphertextBuffer),
    iv: bufferToBase64(iv),
  };
}

function bufferToBase64(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}
