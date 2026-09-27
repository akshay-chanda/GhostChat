// The default backing store: plain Maps, nothing persisted to disk
// or a database. This is the literal implementation of the "zero
// intentional persistent chat storage" requirement — when the
// process restarts, every room is gone. storage/redisStore.js
// implements the same function names for horizontal scaling; nothing
// outside this file should reach into these Maps directly.

const rooms = new Map(); // roomId -> RoomRecord
const participants = new Map(); // roomId -> Map<sessionId, ParticipantRecord>
const messages = new Map(); // roomId -> MessageRecord[]
const files = new Map(); // fileId -> FileRecord

const MAX_MESSAGES_PER_ROOM = 500; // bounded buffer, not a history log

function createRoom(record) {
  rooms.set(record.roomId, record);
  participants.set(record.roomId, new Map());
  messages.set(record.roomId, []);
  return record;
}

function getRoom(roomId) {
  return rooms.get(roomId) || null;
}

function updateRoom(roomId, patch) {
  const room = rooms.get(roomId);
  if (!room) return null;
  Object.assign(room, patch);
  return room;
}

function deleteRoom(roomId) {
  rooms.delete(roomId);
  participants.delete(roomId);
  messages.delete(roomId);
  // File cleanup (disk + this map) is fileStorageService's job —
  // it's the only module that knows the on-disk paths.
}

function addParticipant(roomId, participant) {
  const roomParticipants = participants.get(roomId);
  if (!roomParticipants) return null;
  roomParticipants.set(participant.sessionId, participant);
  return participant;
}

function getParticipants(roomId) {
  return Array.from(participants.get(roomId)?.values() || []);
}

function getParticipant(roomId, sessionId) {
  return participants.get(roomId)?.get(sessionId) || null;
}

function removeParticipant(roomId, sessionId) {
  return participants.get(roomId)?.delete(sessionId) || false;
}

function addMessage(roomId, message) {
  const roomMessages = messages.get(roomId);
  if (!roomMessages) return null;
  roomMessages.push(message);
  if (roomMessages.length > MAX_MESSAGES_PER_ROOM) roomMessages.shift();
  return message;
}

function getMessage(roomId, messageId) {
  return messages.get(roomId)?.find((m) => m.id === messageId) || null;
}

function removeMessage(roomId, messageId) {
  const roomMessages = messages.get(roomId);
  if (!roomMessages) return false;
  const index = roomMessages.findIndex((m) => m.id === messageId);
  if (index === -1) return false;
  roomMessages.splice(index, 1);
  return true;
}

function clearMessages(roomId) {
  messages.set(roomId, []);
}

function addFile(file) {
  files.set(file.id, file);
  return file;
}

function getFile(fileId) {
  return files.get(fileId) || null;
}

function deleteFile(fileId) {
  return files.delete(fileId);
}

function getFilesByRoom(roomId) {
  return Array.from(files.values()).filter((f) => f.roomId === roomId);
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
