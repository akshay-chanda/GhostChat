import { API_BASE_URL } from '../utils/constants';

import {
  encryptFile,
  decryptFile,
} from '../crypto/fileCrypto';

/**
 * Convert a backend download URL into an absolute URL.
 *
 * Supports:
 *
 * 1. Absolute API base:
 *    https://ghostchat-backend-redk.onrender.com/api
 *
 * 2. Relative API base:
 *    /api
 */
function getAbsoluteDownloadUrl(downloadUrl) {
  if (!downloadUrl) {
    throw new Error(
      'File download URL is missing'
    );
  }

  if (
    downloadUrl.startsWith('http://') ||
    downloadUrl.startsWith('https://')
  ) {
    return downloadUrl;
  }

  const apiBaseUrl = new URL(
    API_BASE_URL,
    window.location.origin
  );

  if (downloadUrl.startsWith('/')) {
    return new URL(
      downloadUrl,
      apiBaseUrl.origin
    ).toString();
  }

  return new URL(
    downloadUrl,
    `${apiBaseUrl.toString().replace(/\/$/, '')}/`
  ).toString();
}

/**
 * Normalize MIME types.
 *
 * Browser MediaRecorder can sometimes produce:
 *
 *   audio/webm;codecs=opus
 *   audio/ogg;codecs=opus
 *
 * For the decrypted Blob we only need the base MIME type.
 */
function normalizeMimeType(mimeType) {
  if (
    typeof mimeType !== 'string' ||
    !mimeType.trim()
  ) {
    return 'application/octet-stream';
  }

  return mimeType
    .split(';')[0]
    .trim()
    .toLowerCase();
}

/**
 * Upload an encrypted file.
 *
 * Authentication uses:
 *
 *   X-Session-Id
 *   X-Session-Secret
 *
 * No cookies are used.
 */
export function uploadFile({
  roomId,
  file,
  key,
  sessionId,
  sessionSecret,
  onProgress,
}) {
  return new Promise((resolve, reject) => {
    (async () => {
      try {
        if (!roomId) {
          throw new Error(
            'Room ID is missing'
          );
        }

        if (!file) {
          throw new Error(
            'File is missing'
          );
        }

        if (!key) {
          throw new Error(
            'File encryption key is missing'
          );
        }

        /*
         * Preserve the original MIME type before
         * encryption.
         */
        const originalMimeType =
          normalizeMimeType(
            file.type
          );

        /*
         * Encrypt the original file locally.
         */
        const {
          encryptedBlob,
          iv,
        } = await encryptFile(
          file,
          key
        );

        if (
          !(encryptedBlob instanceof Blob)
        ) {
          throw new Error(
            'File encryption did not return a valid Blob'
          );
        }

        if (
          encryptedBlob.size === 0
        ) {
          throw new Error(
            'Encrypted file is empty'
          );
        }

        const formData =
          new FormData();

        /*
         * The backend stores encrypted bytes.
         */
        formData.append(
          'file',
          encryptedBlob,
          file.name
        );

        formData.append(
          'iv',
          iv
        );

        /*
         * Keep the original filename.
         */
        formData.append(
          'originalName',
          file.name
        );

        /*
         * IMPORTANT:
         *
         * Send the original MIME type,
         * not the encrypted Blob MIME type.
         */
        formData.append(
          'mimeType',
          originalMimeType
        );

        /*
         * This is the original plaintext
         * file size.
         */
        formData.append(
          'size',
          String(file.size)
        );

        const xhr =
          new XMLHttpRequest();

        xhr.open(
          'POST',
          `${API_BASE_URL}/rooms/${encodeURIComponent(
            roomId
          )}/files`
        );

        /*
         * Authentication is header-only.
         *
         * Do NOT enable credentials/cookies.
         */
        if (sessionId) {
          xhr.setRequestHeader(
            'X-Session-Id',
            sessionId
          );
        }

        if (sessionSecret) {
          xhr.setRequestHeader(
            'X-Session-Secret',
            sessionSecret
          );
        }

        xhr.upload.onprogress =
          (event) => {
            if (
              event.lengthComputable
            ) {
              onProgress?.(
                (event.loaded /
                  event.total) *
                  100
              );
            }
          };

        xhr.onload = () => {
          if (
            xhr.status >= 200 &&
            xhr.status < 300
          ) {
            try {
              const response =
                JSON.parse(
                  xhr.responseText
                );

              /*
               * Helpful diagnostics for voice
               * messages during development.
               */
              if (
                originalMimeType.startsWith(
                  'audio/'
                )
              ) {
                console.log(
                  'Voice upload completed:',
                  {
                    name: file.name,
                    mimeType:
                      originalMimeType,
                    originalSize:
                      file.size,
                    encryptedSize:
                      encryptedBlob.size,
                  }
                );
              }

              resolve(response);
            } catch {
              reject(
                new Error(
                  'Upload succeeded but the server returned invalid JSON.'
                )
              );
            }

            return;
          }

          const error =
            new Error(
              `Upload failed (${xhr.status})`
            );

          error.status =
            xhr.status;

          try {
            error.response =
              JSON.parse(
                xhr.responseText
              );
          } catch {
            error.response =
              xhr.responseText;
          }

          reject(error);
        };

        xhr.onerror = () => {
          reject(
            new Error(
              'Upload failed'
            )
          );
        };

        xhr.send(formData);
      } catch (err) {
        reject(err);
      }
    })();
  });
}

/**
 * Download an encrypted file from the backend
 * and decrypt it using the room encryption key.
 *
 * Authentication uses:
 *
 *   X-Session-Id
 *   X-Session-Secret
 *
 * No cookies are used.
 *
 * Returns:
 *   Blob
 */
export async function downloadAndDecryptFile({
  downloadUrl,
  iv,
  mimeType,
  key,
  sessionId,
  sessionSecret,
}) {
  if (!downloadUrl) {
    throw new Error(
      'File download URL is missing'
    );
  }

  if (!iv) {
    throw new Error(
      'File IV is missing'
    );
  }

  if (!key) {
    throw new Error(
      'File encryption key is missing'
    );
  }

  const absoluteDownloadUrl =
    getAbsoluteDownloadUrl(
      downloadUrl
    );

  const headers = {};

  if (sessionId) {
    headers[
      'X-Session-Id'
    ] = sessionId;
  }

  if (sessionSecret) {
    headers[
      'X-Session-Secret'
    ] = sessionSecret;
  }

  const response =
    await fetch(
      absoluteDownloadUrl,
      {
        method: 'GET',
        headers,
      }
    );

  if (!response.ok) {
    const error =
      new Error(
        `Download failed (${response.status})`
      );

    error.status =
      response.status;

    try {
      error.response =
        await response
          .clone()
          .json();
    } catch {
      error.response =
        await response
          .clone()
          .text()
          .catch(() => '');
    }

    throw error;
  }

  /*
   * Backend returns encrypted ciphertext
   * as raw binary.
   */
  const encryptedBlob =
    await response.blob();

  if (
    !(encryptedBlob instanceof Blob)
  ) {
    throw new Error(
      'Downloaded file is not a valid Blob'
    );
  }

  if (
    encryptedBlob.size === 0
  ) {
    throw new Error(
      'Downloaded encrypted file is empty'
    );
  }

  /*
   * Normalize the original MIME type before
   * passing it to the decryption layer.
   */
  const normalizedMimeType =
    normalizeMimeType(
      mimeType
    );

  /*
   * Decrypt locally.
   */
  const decryptedBlob =
    await decryptFile(
      encryptedBlob,
      iv,
      key,
      normalizedMimeType
    );

  if (
    !(decryptedBlob instanceof Blob)
  ) {
    throw new Error(
      'Decrypted file is not a valid Blob'
    );
  }

  if (
    decryptedBlob.size === 0
  ) {
    throw new Error(
      'Decrypted file is empty'
    );
  }

  /*
   * IMPORTANT FOR VOICE:
   *
   * Explicitly restore the original audio MIME
   * type on the resulting Blob.
   *
   * This makes the Blob suitable for:
   *
   *   URL.createObjectURL(blob)
   *
   * and:
   *
   *   <audio src="...">
   */
  const finalBlob =
    new Blob(
      [decryptedBlob],
      {
        type:
          normalizedMimeType,
      }
    );

  if (
    finalBlob.size === 0
  ) {
    throw new Error(
      'Final decrypted file is empty'
    );
  }

  /*
   * Helpful diagnostics for audio playback.
   */
  if (
    normalizedMimeType.startsWith(
      'audio/'
    )
  ) {
    console.log(
      'Voice download/decryption completed:',
      {
        mimeType:
          normalizedMimeType,
        encryptedSize:
          encryptedBlob.size,
        decryptedSize:
          decryptedBlob.size,
        finalSize:
          finalBlob.size,
        url:
          absoluteDownloadUrl,
      }
    );
  }

  return finalBlob;
}

/**
 * Delete a file from the backend.
 *
 * Authentication uses private headers.
 * No cookies are used.
 */
export async function deleteFile(
  fileId,
  sessionId,
  sessionSecret
) {
  if (!fileId) {
    throw new Error(
      'File ID is missing'
    );
  }

  const headers = {};

  if (sessionId) {
    headers[
      'X-Session-Id'
    ] = sessionId;
  }

  if (sessionSecret) {
    headers[
      'X-Session-Secret'
    ] = sessionSecret;
  }

  const response =
    await fetch(
      `${API_BASE_URL}/files/${encodeURIComponent(
        fileId
      )}`,
      {
        method: 'DELETE',
        headers,
      }
    );

  if (!response.ok) {
    const error =
      new Error(
        `Could not delete file (${response.status})`
      );

    error.status =
      response.status;

    try {
      error.response =
        await response
          .clone()
          .json();
    } catch {
      error.response =
        await response
          .clone()
          .text()
          .catch(() => '');
    }

    throw error;
  }

  return true;
}