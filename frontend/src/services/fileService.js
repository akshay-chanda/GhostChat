import { API_BASE_URL } from '../utils/constants';

import {
  encryptFile,
  decryptFile,
} from '../crypto/fileCrypto';

/**
 * Convert a backend download URL into an absolute URL.
 *
 * Supports both:
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

  // Already an absolute URL.
  if (
    downloadUrl.startsWith('http://') ||
    downloadUrl.startsWith('https://')
  ) {
    return downloadUrl;
  }

  /*
   * Resolve the configured API base safely.
   */
  const apiBaseUrl = new URL(
    API_BASE_URL,
    window.location.origin
  );

  /*
   * Backend returned an absolute path.
   */
  if (downloadUrl.startsWith('/')) {
    return new URL(
      downloadUrl,
      apiBaseUrl.origin
    ).toString();
  }

  /*
   * Backend returned a relative path.
   */
  return new URL(
    downloadUrl,
    `${apiBaseUrl.toString().replace(/\/$/, '')}/`
  ).toString();
}

/**
 * Upload an encrypted file.
 *
 * Authentication uses private HTTP headers:
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

        // Encrypt the file before sending it.
        const {
          encryptedBlob,
          iv,
        } = await encryptFile(
          file,
          key
        );

        const formData =
          new FormData();

        formData.append(
          'file',
          encryptedBlob,
          file.name
        );

        formData.append(
          'iv',
          iv
        );

        formData.append(
          'originalName',
          file.name
        );

        formData.append(
          'mimeType',
          file.type
        );

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
         * IMPORTANT:
         *
         * Do NOT use:
         *
         *   xhr.withCredentials = true
         *
         * Authentication is handled entirely through
         * X-Session-Id and X-Session-Secret.
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
              resolve(
                JSON.parse(
                  xhr.responseText
                )
              );
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
   * The backend returns encrypted
   * ciphertext as raw binary.
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
   * Decrypt using the same:
   *
   * - room key
   * - IV
   *
   * that were used during upload.
   */
  const decryptedBlob =
    await decryptFile(
      encryptedBlob,
      iv,
      key,
      mimeType
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

  return decryptedBlob;
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