const path = require('path');
const os = require('os');
const fs = require('fs');

// Point file storage at a throwaway temp directory for this test
// file's module registry, before app.js (and its transitive
// config/env require) loads.
process.env.FILE_STORAGE_PATH = fs.mkdtempSync(path.join(os.tmpdir(), 'ghostchat-test-'));

const request = require('supertest');
const app = require('../../src/app');

async function createTestRoom() {
  const res = await request(app)
    .post('/api/rooms')
    .send({ password: 'a-valid-password-here', duration: 600, allowFileSharing: true });
  return { ...res.body, cookie: res.headers['set-cookie'] };
}

describe('file sharing over HTTP', () => {
  it('uploads a file and returns metadata without the plaintext bytes', async () => {
    const room = await createTestRoom();
    const fakeCiphertext = Buffer.from('this-stands-in-for-encrypted-bytes');

    const res = await request(app)
      .post(`/api/rooms/${room.roomId}/files`)
      .set('Cookie', room.cookie)
      .field('iv', 'ZmFrZS1pdg==')
      .field('originalName', 'notes.txt')
      .field('mimeType', 'text/plain')
      .field('size', String(fakeCiphertext.length))
      .attach('file', fakeCiphertext, 'notes.txt');

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      type: 'file',
      file: { originalName: 'notes.txt', size: fakeCiphertext.length, iv: 'ZmFrZS1pdg==' },
    });
    expect(res.body.file.downloadUrl).toMatch(/^\/api\/files\/.+\/download$/);
  });

  it('downloads exactly the ciphertext bytes that were uploaded', async () => {
    const room = await createTestRoom();
    const fakeCiphertext = Buffer.from('roundtrip-bytes-should-match-exactly');

    const uploadRes = await request(app)
      .post(`/api/rooms/${room.roomId}/files`)
      .set('Cookie', room.cookie)
      .field('iv', 'aXY=')
      .field('originalName', 'data.bin')
      .field('mimeType', 'application/octet-stream')
      .field('size', String(fakeCiphertext.length))
      .attach('file', fakeCiphertext, 'data.bin');

    const downloadRes = await request(app)
      .get(uploadRes.body.file.downloadUrl)
      .set('Cookie', room.cookie);

    expect(downloadRes.status).toBe(200);
    expect(Buffer.compare(downloadRes.body, fakeCiphertext)).toBe(0);
  });

  it('rejects an upload from a session that does not belong to the room', async () => {
    const roomA = await createTestRoom();
    const roomB = await createTestRoom();

    const res = await request(app)
      .post(`/api/rooms/${roomA.roomId}/files`)
      .set('Cookie', roomB.cookie) // valid session, wrong room
      .field('iv', 'aXY=')
      .field('originalName', 'x.txt')
      .field('mimeType', 'text/plain')
      .field('size', '3')
      .attach('file', Buffer.from('abc'), 'x.txt');

    expect(res.status).toBe(403);
  });

  it('rejects a file over the 20MB limit before writing anything to disk', async () => {
    const room = await createTestRoom();
    const oversized = Buffer.alloc(20 * 1024 * 1024 + 1024, 1);

    const res = await request(app)
      .post(`/api/rooms/${room.roomId}/files`)
      .set('Cookie', room.cookie)
      .field('iv', 'aXY=')
      .field('originalName', 'huge.bin')
      .field('mimeType', 'application/octet-stream')
      .field('size', String(oversized.length))
      .attach('file', oversized, 'huge.bin');

    expect(res.status).toBe(413);
  }, 15000);

  it('lets the uploader delete their own file, and the file becomes unreachable after', async () => {
    const room = await createTestRoom();
    const uploadRes = await request(app)
      .post(`/api/rooms/${room.roomId}/files`)
      .set('Cookie', room.cookie)
      .field('iv', 'aXY=')
      .field('originalName', 'temp.txt')
      .field('mimeType', 'text/plain')
      .field('size', '3')
      .attach('file', Buffer.from('abc'), 'temp.txt');

    const fileId = uploadRes.body.file.id;

    const deleteRes = await request(app).delete(`/api/files/${fileId}`).set('Cookie', room.cookie);
    expect(deleteRes.status).toBe(200);

    const downloadAfterDelete = await request(app)
      .get(`/api/files/${fileId}/download`)
      .set('Cookie', room.cookie);
    expect(downloadAfterDelete.status).toBe(404);
  });
});
