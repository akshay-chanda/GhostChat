const { redisClient } = require('../config/redis');

/**
 * Same exported function names as storage/memoryStore.js, so
 * swapping which one a service uses is a one-line require change —
 * with one honest caveat: every function here is async (Redis calls
 * are inherently network round-trips), while memoryStore's are
 * synchronous. roomManager/fileStorageService currently call the
 * store without awaiting, because memoryStore is the default. Truly
 * making this a drop-in swap means adding `await` at every one of
 * those call sites (or a small storage-selector module that both
 * implementations conform to) — that wiring isn't done yet, so
 * treat this file as the intended shape for multi-instance scaling
 * rather than something you can flip on today without that pass.
 *
 * Simplification: each room's participants and messages are stored
 * as whole JSON arrays under their own key, rewritten on every
 * mutation, rather than as native Redis hashes/lists. That's easy to
 * reason about and correct at this app's scale (rooms capped at 50
 * participants, messages bounded to 500) but does more work per
 * write than a hash/list-based layout would at high room counts.
 */

const MAX_MESSAGES_PER_ROOM = 500;

function roomKey(roomId) { return `room:${roomId}`; }
function participantsKey(roomId) { return `room:${roomId}:participants`; }
function messagesKey(roomId) { return `room:${roomId}:messages`; }
function fileKey(fileId) { return `file:${fileId}`; }

async function setWithExpiry(key, value, expiresAt) {
  const ttlSeconds = Math.max(1, Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000));
  await redisClient.set(key, JSON.stringify(value), { EX: ttlSeconds });
}

async function getJSON(key) {
  const raw = await redisClient.get(key);
  return raw ? JSON.parse(raw) : null;
}

async function createRoom(record) {
  await setWithExpiry(roomKey(record.roomId), record, record.expiresAt);
  await setWithExpiry(participantsKey(record.roomId), [], record.expiresAt);
  await setWithExpiry(messagesKey(record.roomId), [], record.expiresAt);
  return record;
}

async function getRoom(roomId) {
  return getJSON(roomKey(roomId));
}

async function updateRoom(roomId, patch) {
  const room = await getRoom(roomId);
  if (!room) return null;
  const updated = { ...room, ...patch };
  await setWithExpiry(roomKey(roomId), updated, updated.expiresAt);
  return updated;
}

async function deleteRoom(roomId) {
  await redisClient.del([roomKey(roomId), participantsKey(roomId), messagesKey(roomId)]);
}

async function addParticipant(roomId, participant) {
  const room = await getRoom(roomId);
  if (!room) return null;
  const list = (await getJSON(participantsKey(roomId))) || [];
  list.push(participant);
  await setWithExpiry(participantsKey(roomId), list, room.expiresAt);
  return participant;
}

async function getParticipants(roomId) {
  return (await getJSON(participantsKey(roomId))) || [];
}

async function getParticipant(roomId, sessionId) {
  const list = await getParticipants(roomId);
  return list.find((p) => p.sessionId === sessionId) || null;
}

async function removeParticipant(roomId, sessionId) {
  const room = await getRoom(roomId);
  if (!room) return false;
  const list = await getParticipants(roomId);
  const next = list.filter((p) => p.sessionId !== sessionId);
  if (next.length === list.length) return false;
  await setWithExpiry(participantsKey(roomId), next, room.expiresAt);
  return true;
}

async function addMessage(roomId, message) {
  const room = await getRoom(roomId);
  if (!room) return null;
  const list = (await getJSON(messagesKey(roomId))) || [];
  list.push(message);
  if (list.length > MAX_MESSAGES_PER_ROOM) list.shift();
  await setWithExpiry(messagesKey(roomId), list, room.expiresAt);
  return message;
}

async function getMessage(roomId, messageId) {
  const list = (await getJSON(messagesKey(roomId))) || [];
  return list.find((m) => m.id === messageId) || null;
}

async function removeMessage(roomId, messageId) {
  const room = await getRoom(roomId);
  if (!room) return false;
  const list = (await getJSON(messagesKey(roomId))) || [];
  const next = list.filter((m) => m.id !== messageId);
  if (next.length === list.length) return false;
  await setWithExpiry(messagesKey(roomId), next, room.expiresAt);
  return true;
}

async function clearMessages(roomId) {
  const room = await getRoom(roomId);
  if (!room) return;
  await setWithExpiry(messagesKey(roomId), [], room.expiresAt);
}

async function addFile(file) {
  await setWithExpiry(fileKey(file.id), file, file.expiresAt);
  return file;
}

async function getFile(fileId) {
  return getJSON(fileKey(fileId));
}

async function deleteFile(fileId) {
  const result = await redisClient.del(fileKey(fileId));
  return result > 0;
}

/**
 * Redis has no native "find files by roomId" query against this
 * layout — files aren't indexed by room the way memoryStore's flat
 * Map can be filtered in place. A real multi-instance deployment
 * would want a secondary set (e.g. `room:{roomId}:files` holding
 * file ids) maintained alongside addFile/deleteFile; that index
 * isn't implemented here, so this returns an empty list rather than
 * scanning the whole keyspace with KEYS (which you should never run
 * against production Redis).
 */
async function getFilesByRoom() {
  return [];
}

module.exports = {
  createRoom,
  getRoom,
  updateRoom,
  deleteRoom,
  addParticipant,
  getParticipants,
  getParticipant,
  removeParticipant,
  addMessage,
  getMessage,
  removeMessage,
  clearMessages,
  addFile,
  getFile,
  deleteFile,
  getFilesByRoom,
};
