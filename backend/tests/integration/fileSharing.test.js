const path = require('path');
const os = require('os');
const fs = require('fs');

process.env.FILE_STORAGE_PATH = fs.mkdtempSync(
  path.join(os.tmpdir(), 'ghostchat-file-sharing-test-')
);

const request = require('supertest');
const app = require('../../src/app');
const { resetRateLimiters } = require('../../src/middleware/rateLimiter');

async function createRoom(overrides = {}) {
  const res = await request(app)
    .post('/api/rooms')
    .send({
      password: 'a-valid-password-here',
      duration: 600,
      allowFileSharing: true,
      ...overrides,
    });

  return {
    ...res.body,
  };
}

function withSession(requestBuilder, room) {
  return requestBuilder
    .set('X-Session-Id', room.sessionId)
    .set('X-Session-Secret', room.sessionSecret);
}

describe('file sharing over HTTP', () => {
  beforeEach(() => {
    resetRateLimiters();
  });

  it('uploads a file and returns metadata without the plaintext bytes', async () => {
    const room = await createRoom();
    const plaintext = Buffer.from('secret file contents');

    const res = await withSession(
      request(app).post(`/api/rooms/${room.roomId}/files`),
      room
    )
      .field('iv', 'aXY=')
      .field('originalName', 'secret.txt')
      .field('mimeType', 'text/plain')
      .field('size', String(plaintext.length))
      .attach('file', plaintext, 'secret.txt');

    expect(res.status).toBe(201);
    expect(res.body.file).toBeDefined();
    expect(res.body.file.originalName).toBe('secret.txt');
    expect(res.body.file.downloadUrl).toBeDefined();
    expect(res.body.file).not.toHaveProperty('data');
    expect(res.body.file).not.toHaveProperty('buffer');
    expect(JSON.stringify(res.body)).not.toContain(
      plaintext.toString()
    );
  });

  it('downloads exactly the ciphertext bytes that were uploaded', async () => {
    const room = await createRoom();
    const ciphertext = Buffer.from('encrypted-ciphertext-bytes');

    const uploadRes = await withSession(
      request(app).post(`/api/rooms/${room.roomId}/files`),
      room
    )
      .field('iv', 'aXY=')
      .field('originalName', 'encrypted.bin')
      .field('mimeType', 'application/octet-stream')
      .field('size', String(ciphertext.length))
      .attach('file', ciphertext, 'encrypted.bin');

    expect(uploadRes.status).toBe(201);
    expect(uploadRes.body.file).toBeDefined();

    const fileId = uploadRes.body.file.id;

    const downloadRes = await withSession(
      request(app).get(`/api/files/${fileId}/download`),
      room
    );

    expect(downloadRes.status).toBe(200);
    expect(Buffer.from(downloadRes.body)).toEqual(ciphertext);
  });

  it('rejects an upload from a session that does not belong to the room', async () => {
    const roomA = await createRoom();
    const roomB = await createRoom();

    const payload = Buffer.from('should-not-upload');

    const res = await withSession(
      request(app).post(`/api/rooms/${roomA.roomId}/files`),
      roomB
    )
      .field('iv', 'aXY=')
      .field('originalName', 'blocked.txt')
      .field('mimeType', 'text/plain')
      .field('size', String(payload.length))
      .attach('file', payload, 'blocked.txt');

    expect(res.status).toBe(401);
  });

  it('rejects a file over the 20MB limit before writing anything to disk', async () => {
    const room = await createRoom();

    const oversized = Buffer.alloc(20 * 1024 * 1024 + 1);

    const res = await withSession(
      request(app).post(`/api/rooms/${room.roomId}/files`),
      room
    )
      .field('iv', 'aXY=')
      .field('originalName', 'too-large.bin')
      .field('mimeType', 'application/octet-stream')
      .field('size', String(oversized.length))
      .attach('file', oversized, 'too-large.bin');

    expect(res.status).toBe(413);
  });

  it('lets the uploader delete their own file, and the file becomes unreachable after', async () => {
    const room = await createRoom();
    const ciphertext = Buffer.from('temporary-file');

    const uploadRes = await withSession(
      request(app).post(`/api/rooms/${room.roomId}/files`),
      room
    )
      .field('iv', 'aXY=')
      .field('originalName', 'temporary.txt')
      .field('mimeType', 'text/plain')
      .field('size', String(ciphertext.length))
      .attach('file', ciphertext, 'temporary.txt');

    expect(uploadRes.status).toBe(201);
    expect(uploadRes.body.file).toBeDefined();

    const fileId = uploadRes.body.file.id;

    const deleteRes = await withSession(
      request(app).delete(`/api/files/${fileId}`),
      room
    );

    expect(deleteRes.status).toBe(200);

    const downloadRes = await withSession(
      request(app).get(`/api/files/${fileId}/download`),
      room
    );

    expect(downloadRes.status).toBe(401);
  });
});