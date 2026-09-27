/**
 * Decrypts a message payload produced by encryptMessage. Because
 * AES-GCM is authenticated, a tampered or wrong-key ciphertext
 * throws here rather than returning corrupted text — callers should
 * catch this and show the message as undecryptable rather than
 * crash the render.
 */
export async function decryptMessage({ ciphertext, iv }, key) {
  const ciphertextBuffer = base64ToBuffer(ciphertext);
  const ivBuffer = base64ToBuffer(iv);

  const plaintextBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBuffer },
    key,
    ciphertextBuffer
  );

  return new TextDecoder().decode(plaintextBuffer);
}

function base64ToBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
