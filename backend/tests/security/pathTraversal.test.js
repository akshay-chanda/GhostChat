const path = require('path');
const os = require('os');
const fs = require('fs');

const storageDir = fs.mkdtempSync(
  path.join(os.tmpdir(), 'ghostchat-traversal-test-')
);

process.env.FILE_STORAGE_PATH = storageDir;

const request = require('supertest');
const app = require('../../src/app');
const { resetRateLimiters } = require('../../src/middleware/rateLimiter');

async function createRoomWithFiles() {
  const res = await request(app)
    .post('/api/rooms')
    .send({
      password: 'a-valid-password-here',
      duration: 600,
      allowFileSharing: true,
    });

  return {
    ...res.body,
    cookie: res.headers['set-cookie'],
  };
}

describe('path traversal', () => {
  beforeEach(() => {
    resetRateLimiters();
  });

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

    const filesOnDisk = fs.readdirSync(storageDir);

    expect(filesOnDisk.length).toBeGreaterThan(0);

    filesOnDisk.forEach((name) => {
      expect(name).toMatch(/^f_[0-9a-f]{32}\.bin$/);
    });

    expect(fs.existsSync('/etc/cron.d/evil.txt')).toBe(false);
  });

  it('a traversal sequence in the fileId route parameter matches no file, rather than reading an arbitrary path', async () => {
    const room = await createRoomWithFiles();

    const res = await request(app)
      .get('/api/files/..%2F..%2F..%2Fetc%2Fpasswd/download')
      .set('Cookie', room.cookie);

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

    sameNameUploads.forEach((res) => {
      expect(res.status).toBe(201);
      expect(res.body.file).toBeDefined();
      expect(res.body.file.downloadUrl).toBeDefined();
    });

    const downloadUrls = sameNameUploads.map(
      (res) => res.body.file.downloadUrl
    );

    expect(new Set(downloadUrls).size).toBe(3);
  });
});