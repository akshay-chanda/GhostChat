const path = require('path');
const os = require('os');
const fs = require('fs');

process.env.FILE_STORAGE_PATH = fs.mkdtempSync(
  path.join(os.tmpdir(), 'ghostchat-authz-test-')
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
    cookie: res.headers['set-cookie'],
  };
}

async function joinRoom(roomId, password = 'a-valid-password-here') {
  const res = await request(app)
    .post('/api/rooms/join')
    .send({
      roomId,
      password,
    });

  return {
    ...res.body,
    cookie: res.headers['set-cookie'],
  };
}

describe('unauthorized access', () => {
  beforeEach(() => {
    resetRateLimiters();
  });

  it('rejects an owner-only action with no session at all', async () => {
    const room = await createRoom();

    const res = await request(app)
      .post(`/api/rooms/${room.roomId}/lock`);

    expect(res.status).toBe(401);
  });

  it('rejects an owner-only action from a valid non-owner session', async () => {
    const room = await createRoom();
    const member = await joinRoom(room.roomId);

    const res = await request(app)
      .post(`/api/rooms/${room.roomId}/lock`)
      .set('Cookie', member.cookie);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('unauthorized');
  });

  it('rejects a session cookie presented against a different room', async () => {
    const roomA = await createRoom();
    const roomB = await createRoom();

    const res = await request(app)
      .post(`/api/rooms/${roomA.roomId}/lock`)
      .set('Cookie', roomB.cookie);

    expect(res.status).toBe(403);
  });

  it('rejects destroying a room you do not own', async () => {
    const room = await createRoom();
    const member = await joinRoom(room.roomId);

    const res = await request(app)
      .post(`/api/rooms/${room.roomId}/destroy`)
      .set('Cookie', member.cookie);

    expect(res.status).toBe(403);

    const infoRes = await request(app)
      .get(`/api/rooms/${room.roomId}`);

    expect(infoRes.status).toBe(200);
  });

  it('a member cannot download a file that belongs to a different room', async () => {
    const roomA = await createRoom();
    const roomB = await createRoom();

    const uploadRes = await request(app)
      .post(`/api/rooms/${roomA.roomId}/files`)
      .set('Cookie', roomA.cookie)
      .field('iv', 'aXY=')
      .field('originalName', 'secret.txt')
      .field('mimeType', 'text/plain')
      .field('size', '3')
      .attach('file', Buffer.from('abc'), 'secret.txt');

    expect(uploadRes.status).toBe(201);
    expect(uploadRes.body.file).toBeDefined();

    const fileId = uploadRes.body.file.id;

    const crossRoomDownload = await request(app)
      .get(`/api/files/${fileId}/download`)
      .set('Cookie', roomB.cookie);

    expect(crossRoomDownload.status).toBe(403);
  });

  it('only the uploader or the room owner can delete a shared file — a random member cannot', async () => {
    const room = await createRoom();
    const uploaderMember = await joinRoom(room.roomId);
    const otherMember = await joinRoom(room.roomId);

    const uploadRes = await request(app)
      .post(`/api/rooms/${room.roomId}/files`)
      .set('Cookie', uploaderMember.cookie)
      .field('iv', 'aXY=')
      .field('originalName', 'shared.txt')
      .field('mimeType', 'text/plain')
      .field('size', '3')
      .attach('file', Buffer.from('abc'), 'shared.txt');

    expect(uploadRes.status).toBe(201);
    expect(uploadRes.body.file).toBeDefined();

    const fileId = uploadRes.body.file.id;

    const deleteAttempt = await request(app)
      .delete(`/api/files/${fileId}`)
      .set('Cookie', otherMember.cookie);

    expect(deleteAttempt.status).toBe(403);

    const ownerDelete = await request(app)
      .delete(`/api/files/${fileId}`)
      .set('Cookie', room.cookie);

    expect(ownerDelete.status).toBe(200);
  });

  it('an expired/unknown session cookie is rejected rather than silently treated as anonymous', async () => {
    const room = await createRoom();

    const forgedCookie = [
      `gc_session=${encodeURIComponent(
        JSON.stringify({
          sessionId: 'nope',
          roomId: room.roomId,
        })
      )}`,
    ];

    const res = await request(app)
      .post(`/api/rooms/${room.roomId}/lock`)
      .set('Cookie', forgedCookie);

    expect(res.status).toBe(401);
  });
});