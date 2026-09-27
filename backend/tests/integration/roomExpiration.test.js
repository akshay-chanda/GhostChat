const path = require('path');
const os = require('os');
const fs = require('fs');

process.env.FILE_STORAGE_PATH = fs.mkdtempSync(path.join(os.tmpdir(), 'ghostchat-expiry-test-'));

const roomManager = require('../../src/services/roomManager');
const passwordService = require('../../src/services/passwordService');
const fileStorageService = require('../../src/services/fileStorageService');
const store = require('../../src/storage/memoryStore');

describe('room expiration', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick'] });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('destroys the room automatically once its duration elapses', async () => {
    const passwordHash = await passwordService.hashPassword('a-valid-password-here');
    const { room } = await roomManager.createRoom({
      passwordHash,
      duration: 300, // shortest allowed duration — 5 minutes of *virtual* time
      maxParticipants: 5,
      allowFileSharing: true,
    });

    expect(roomManager.getPublicRoomInfo(room.roomId)).not.toBeNull();

    jest.advanceTimersByTime(300_000);

    expect(roomManager.getPublicRoomInfo(room.roomId)).toBeNull();
  });

  it('does not destroy the room before its timer is due', async () => {
    const passwordHash = await passwordService.hashPassword('a-valid-password-here');
    const { room } = await roomManager.createRoom({
      passwordHash,
      duration: 600,
      maxParticipants: 5,
      allowFileSharing: true,
    });

    jest.advanceTimersByTime(599_000);
    expect(roomManager.getPublicRoomInfo(room.roomId)).not.toBeNull();
  });

  it('extending expiration reschedules destruction to the new time, not the original', async () => {
    const passwordHash = await passwordService.hashPassword('a-valid-password-here');
    const { room, owner } = await roomManager.createRoom({
      passwordHash,
      duration: 300,
      maxParticipants: 5,
      allowFileSharing: true,
    });

    roomManager.extendExpiration(room.roomId, owner.sessionId, 300); // now due at 600s, not 300s

    jest.advanceTimersByTime(300_000);
    expect(roomManager.getPublicRoomInfo(room.roomId)).not.toBeNull(); // original 300s mark: still alive

    jest.advanceTimersByTime(300_000);
    expect(roomManager.getPublicRoomInfo(room.roomId)).toBeNull(); // extended 600s mark: now gone
  });

  it('an explicit owner destroy cancels the pending expiration timer (no double-fire)', async () => {
    const passwordHash = await passwordService.hashPassword('a-valid-password-here');
    const { room, owner } = await roomManager.createRoom({
      passwordHash,
      duration: 300,
      maxParticipants: 5,
      allowFileSharing: true,
    });

    roomManager.destroyRoom(room.roomId, owner.sessionId);
    expect(roomManager.getPublicRoomInfo(room.roomId)).toBeNull();

    // Should not throw even though the timer that would have called
    // destroyRoomInternal again was already cancelled.
    expect(() => jest.advanceTimersByTime(300_000)).not.toThrow();
  });

  it('deletes the room\u2019s uploaded files from disk when the room expires', async () => {
    const passwordHash = await passwordService.hashPassword('a-valid-password-here');
    const { room, owner } = await roomManager.createRoom({
      passwordHash,
      duration: 300,
      maxParticipants: 5,
      allowFileSharing: true,
    });

    const fileRecord = await fileStorageService.saveEncryptedFile({
      roomId: room.roomId,
      buffer: Buffer.from('ciphertext-stand-in'),
      iv: 'aXY=',
      originalName: 'note.txt',
      mimeType: 'text/plain',
      declaredSize: Buffer.from('ciphertext-stand-in').length,
      expiresAt: room.expiresAt,
      uploaderSessionId: owner.sessionId,
    });

    expect(store.getFile(fileRecord.id)).not.toBeNull();

    jest.advanceTimersByTime(300_000);
    // Allow the async fileStorageService.deleteRoomFiles(...).catch(() => {})
    // fire-and-forget call inside destroyRoomInternal to settle.
    await Promise.resolve();
    await Promise.resolve();

    expect(store.getFile(fileRecord.id)).toBeNull();
  });
});
