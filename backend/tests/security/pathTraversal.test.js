const path = require('path');
const os = require('os');
const fs = require('fs');

const storageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ghostchat-traversal-test-'));
process.env.FILE_STORAGE_PATH = storageDir;

const request = require('supertest');
const app = require('../../src/app');

async function createRoomWithFiles() {
  const res = await request(app)
    .post('/api/rooms')
    .send({ password: 'a-valid-password-here', duration: 600, allowFileSharing: true });
  return { ...res.body, cookie: res.headers['set-cookie'] };
}

describe('path traversal', () => {
  it('a traversal sequence in the original filename never escapes the storage directory', async () => {
    const room = await createRoomWithFiles();
    const payload = Buffer.from('should-stay-inside-storage-dir');

    const res = await request(app)
      .post(`/api/rooms/${room.roomId}/files`)
      .set('Cookie', room.cookie)
      .field('iv', 'aXY=')
      .field('originalName', '../../../../etc/cron.d/evil.txt')
      .field('mimeType', 'text/plain')
      .field('size', String(payload.length))
      .attach('file', payload, '../../../../etc/cron.d/evil.txt');

    expect(res.status).toBe(201);
    expect(res.body.file.originalName).not.toContain('..');
    expect(res.body.file.originalName).not.toContain('/');

    // The file this actually wrote must be inside storageDir, under
    // a random server-generated name — never at the traversed path.
    const filesOnDisk = fs.readdirSync(storageDir);
    expect(filesOnDisk.length).toBeGreaterThan(0);
    filesOnDisk.forEach((name) => expect(name).toMatch(/^f_[0-9a-f]{32}\.bin$/));
    expect(fs.existsSync('/etc/cron.d/evil.txt')).toBe(false);
  });

  it('a traversal sequence in the fileId route parameter matches no file, rather than reading an arbitrary path', async () => {
    const room = await createRoomWithFiles();

    const res = await request(app)
      .get('/api/files/..%2F..%2F..%2Fetc%2Fpasswd/download')
      .set('Cookie', room.cookie);

    // fileId is used as a lookup key into an in-memory Map, never
    // concatenated into a filesystem path — so a traversal-shaped id
    // simply fails to match anything.
    expect(res.status).toBe(404);
  });

  it('an absolute path as the original filename is reduced to its basename', async () => {
    const room = await createRoomWithFiles();
    const payload = Buffer.from('abc');

    const res = await request(app)
      .post(`/api/rooms/${room.roomId}/files`)
      .set('Cookie', room.cookie)
      .field('iv', 'aXY=')
      .field('originalName', '/etc/passwd.txt')
      .field('mimeType', 'text/plain')
      .field('size', String(payload.length))
      .attach('file', payload, 'passwd.txt');

    expect(res.status).toBe(201);
    expect(res.body.file.originalName).toBe('passwd.txt');
  });

  it('a Windows-style traversal sequence is also neutralized', async () => {
    const room = await createRoomWithFiles();
    const payload = Buffer.from('abc');

    const res = await request(app)
      .post(`/api/rooms/${room.roomId}/files`)
      .set('Cookie', room.cookie)
      .field('iv', 'aXY=')
      .field('originalName', '..\\..\\windows\\system32\\evil.txt')
      .field('mimeType', 'text/plain')
      .field('size', String(payload.length))
      .attach('file', payload, 'evil.txt');

    expect(res.status).toBe(201);
    expect(res.body.file.originalName).not.toContain('\\');
    expect(res.body.file.originalName).not.toContain('..');
  });

  it('storage filenames are unique random tokens, never derived from user input in any way', async () => {
    const room = await createRoomWithFiles();
    const sameNameUploads = await Promise.all(
      Array.from({ length: 3 }, () =>
        request(app)
          .post(`/api/rooms/${room.roomId}/files`)
          .set('Cookie', room.cookie)
          .field('iv', 'aXY=')
          .field('originalName', 'same-name.txt')
          .field('mimeType', 'text/plain')
          .field('size', '3')
          .attach('file', Buffer.from('abc'), 'same-name.txt')
      )
    );

    const downloadUrls = sameNameUploads.map((r) => r.body.file.downloadUrl);
    expect(new Set(downloadUrls).size).toBe(3); // three distinct files, no collision
  });
});
