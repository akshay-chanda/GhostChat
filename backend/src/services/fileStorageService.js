const fs = require('fs');
const fsPromises = require('fs/promises');
const path = require('path');
const store = require('../storage/memoryStore');
const { createFileMeta } = require('../models/FileMeta');
const { generateFileId, generateStorageFilename } = require('../utils/idGenerator');
const { MAX_FILE_SIZE, BLOCKED_FILE_EXTENSIONS, ALLOWED_FILE_EXTENSIONS } = require('../utils/constants');
const env = require('../config/env');

const STORAGE_DIR = path.resolve(env.FILE_STORAGE_PATH);

function invalidFileError(message) {
  const err = new Error(message);
  err.code = 'INVALID_FILE_TYPE';
  return err;
}

function tooLargeError() {
  const err = new Error('File is larger than the 20MB limit.');
  err.code = 'FILE_TOO_LARGE';
  return err;
}

/**
 * Display-only sanitization — the file is stored on disk under a
 * random name (generateStorageFilename), never the original name, so
 * this can't be used for path traversal even if it were skipped. It
 * exists so a crafted filename can't do anything unexpected when
 * rendered back in the chat UI.
 */
function sanitizeOriginalName(name) {
  return path.basename(name).replace(/[/\\]/g, '').slice(0, 255);
}

function getExtension(filename) {
  const ext = path.extname(filename).toLowerCase();
  return ext;
}

/**
 * Re-validates everything the client already checked — size,
 * extension — using the actual buffer and filename this request
 * carries, never trusting the client's own validation pass. mimeType
 * is recorded for the UI's file-preview icon only; it is never used
 * as a security decision on its own since it's fully client-supplied.
 */
async function saveEncryptedFile({ roomId, buffer, iv, originalName, mimeType, declaredSize, expiresAt, uploaderSessionId }) {
  if (buffer.length > MAX_FILE_SIZE) throw tooLargeError();
  if (Number.isFinite(declaredSize) && Math.abs(declaredSize - buffer.length) > 1024) {
    throw invalidFileError('Declared file size does not match the uploaded data.');
  }

  const safeName = sanitizeOriginalName(originalName || 'file');
  const ext = getExtension(safeName);
  if (BLOCKED_FILE_EXTENSIONS.includes(ext)) throw invalidFileError('This file type isn\u2019t allowed.');
  if (ALLOWED_FILE_EXTENSIONS.length && !ALLOWED_FILE_EXTENSIONS.includes(ext)) {
    throw invalidFileError('This file type isn\u2019t allowed.');
  }

  await fsPromises.mkdir(STORAGE_DIR, { recursive: true });

  const id = generateFileId();
  const storageFilename = generateStorageFilename();
  await fsPromises.writeFile(path.join(STORAGE_DIR, storageFilename), buffer);

  const record = createFileMeta({
    id,
    roomId,
    storageFilename,
    originalName: safeName,
    mimeType: mimeType || 'application/octet-stream',
    size: buffer.length,
    iv,
    uploaderSessionId,
    expiresAt,
  });
  store.addFile(record);

  return record;
}

async function getFileStream(fileId) {
  const record = store.getFile(fileId);
  if (!record) return null;

  const filePath = path.join(STORAGE_DIR, record.storageFilename);
  try {
    await fsPromises.access(filePath);
  } catch {
    return null; // Metadata outlived the file on disk — treat as gone.
  }

  return { stream: fs.createReadStream(filePath), meta: record };
}

/**
 * uploaderSessionId/isRoomOwner are both accepted so either the
 * person who shared the file or the room owner can remove it — the
 * caller (fileController) is responsible for knowing which is true
 * for the current request, since that avoids this service needing
 * to import roomManager and create a circular dependency.
 */
async function deleteFile(fileId, requesterSessionId, isRoomOwner = false) {
  const record = store.getFile(fileId);
  if (!record) return false;
  if (!isRoomOwner && record.uploaderSessionId && record.uploaderSessionId !== requesterSessionId) {
    return false;
  }

  await unlinkQuietly(record.storageFilename);
  store.deleteFile(fileId);
  return true;
}

async function deleteRoomFiles(roomId) {
  const roomFiles = store.getFilesByRoom(roomId);
  await Promise.all(
    roomFiles.map(async (file) => {
      await unlinkQuietly(file.storageFilename);
      store.deleteFile(file.id);
    })
  );
}

async function unlinkQuietly(storageFilename) {
  try {
    await fsPromises.unlink(path.join(STORAGE_DIR, storageFilename));
  } catch {
    // Already gone — fine, that's the desired end state either way.
  }
}

module.exports = { saveEncryptedFile, getFileStream, deleteFile, deleteRoomFiles };
