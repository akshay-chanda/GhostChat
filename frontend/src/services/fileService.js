import { API_BASE_URL } from '../utils/constants';
import { encryptFile, decryptFile } from '../crypto/fileCrypto';

/**
 * Convert a backend download URL into an absolute URL.
 *
 * Examples:
 *   /api/rooms/ABC/files/123/download
 *      -> https://ghostchat-backend-redk.onrender.com/api/rooms/ABC/files/123/download
 *
 *   https://ghostchat-backend-redk.onrender.com/api/...
 *      -> stays unchanged
 */
function getAbsoluteDownloadUrl(downloadUrl) {
  if (!downloadUrl) {
    throw new Error(
      'File download URL is missing'
    );
  }

  // Already an absolute URL
  if (
    downloadUrl.startsWith('http://') ||
    downloadUrl.startsWith('https://')
  ) {
    return downloadUrl;
  }

  const apiUrl = new URL(API_BASE_URL);

  /*
   * If the backend gives us:
   *
   * /api/rooms/...
   *
   * use the backend origin + that complete path.
   */
  if (downloadUrl.startsWith('/')) {
    return `${apiUrl.origin}${downloadUrl}`;
  }

  /*
   * If the backend gives us:
   *
   * rooms/...
   *
   * use the API base URL.
   */
  return new URL(
    downloadUrl,
    `${API_BASE_URL}/`
  ).toString();
}


/**
 * Upload an encrypted file.
 */
export function uploadFile({
  roomId,
  file,
  key,
  sessionId,
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
          `${API_BASE_URL}/rooms/${roomId}/files`
        );

        xhr.withCredentials = true;

        if (sessionId) {
          xhr.setRequestHeader(
            'X-Session-Id',
            sessionId
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
 * Returns:
 *   Blob
 */
export async function downloadAndDecryptFile({
  downloadUrl,
  iv,
  mimeType,
  key,
  sessionId,
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

  /*
   * IMPORTANT:
   *
   * The backend may return a relative URL.
   *
   * Example:
   * /api/rooms/ABC/files/123/download
   *
   * Because the frontend is hosted on Vercel,
   * fetch(downloadUrl) would otherwise try to
   * download the file from Vercel.
   *
   * We convert it to the Render backend URL.
   */
  const absoluteDownloadUrl =
    getAbsoluteDownloadUrl(
      downloadUrl
    );

  console.log(
    'Downloading encrypted file from:',
    absoluteDownloadUrl
  );

  const headers = {};

  if (sessionId) {
    headers[
      'X-Session-Id'
    ] = sessionId;
  }

  const response =
    await fetch(
      absoluteDownloadUrl,
      {
        method: 'GET',
        credentials: 'include',
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
   * The backend should return the
   * encrypted ciphertext as raw binary.
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
   * Decrypt using the SAME:
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

  /*
   * Return the actual Blob.
   *
   * MessageBubble.jsx creates the temporary
   * object URL and starts the browser download.
   */
  return decryptedBlob;
}


/**
 * Delete a file from the backend.
 */
export async function deleteFile(
  fileId,
  sessionId
) {
  if (!fileId) {
    throw new Error(
      'File ID is missing'
    );
  }

  const response =
    await fetch(
      `${API_BASE_URL}/files/${fileId}`,
      {
        method: 'DELETE',
        credentials: 'include',
        headers: sessionId
          ? {
              'X-Session-Id':
                sessionId,
            }
          : undefined,
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