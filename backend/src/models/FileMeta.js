/**
 * storageFilename is the random on-disk name (never derived from
 * originalName — see fileStorageService's generateStorageFilename).
 * originalName/mimeType exist purely for the UI's file-preview card;
 * they carry no authority over what's actually stored or how it's
 * served.
 */
function createFileMeta({ id, roomId, storageFilename, originalName, mimeType, size, iv, uploaderSessionId, expiresAt }) {
  return {
    id,
    roomId,
    storageFilename,
    originalName,
    mimeType,
    size,
    iv,
    uploaderSessionId,
    expiresAt,
    createdAt: new Date().toISOString(),
  };
}

module.exports = { createFileMeta };
