// Same AES-256-GCM key as encryption.js/decryption.js — files and
// messages in a room share one derived key, since they share the
// same trust boundary (anyone who can read messages can already
// read files, and vice versa).

const IV_LENGTH_BYTES = 12;

/**
 * Encrypts a File/Blob in one pass. Fine at the 20MB ceiling this
 * app enforces — if that limit ever grows meaningfully, this should
 * move to streaming/chunked encryption instead of buffering the
 * whole file in memory.
 */
export async function encryptFile(file, key) {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH_BYTES));
  const fileBuffer = await file.arrayBuffer();

  const encryptedBuffer = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, fileBuffer);

  return {
    encryptedBlob: new Blob([encryptedBuffer], { type: 'application/octet-stream' }),
    iv: bufferToBase64(iv),
  };
}

/**
 * Decrypts a downloaded ciphertext blob back into its original bytes.
 * The caller is responsible for re-attaching the original mimeType
 * and filename (kept as separate, unencrypted metadata) when
 * constructing the final Blob/File for download.
 */
export async function decryptFile(encryptedBlob, ivBase64, key, mimeType) {
  const encryptedBuffer = await encryptedBlob.arrayBuffer();
  const iv = base64ToBuffer(ivBase64);

  const decryptedBuffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, encryptedBuffer);

  return new Blob([decryptedBuffer], { type: mimeType || 'application/octet-stream' });
}

function bufferToBase64(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

function base64ToBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
