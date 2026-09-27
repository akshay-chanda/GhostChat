const path = require('path');
const os = require('os');
const fs = require('fs');

process.env.FILE_STORAGE_PATH = fs.mkdtempSync(path.join(os.tmpdir(), 'ghostchat-xss-test-'));

const request = require('supertest');
const app = require('../../src/app');

const SCRIPT_PAYLOAD = '<script>alert(document.cookie)</script>';
const IMG_PAYLOAD = '<img src=x onerror=alert(1)>';

describe('XSS payload handling', () => {
  it('every API response is served as JSON, never text/html, regardless of payload content', async () => {
    const res = await request(app)
      .post('/api/rooms')
      .send({ roomName: SCRIPT_PAYLOAD, password: 'a-valid-password-here', duration: 600 });

    expect(res.status).toBe(201);
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });

  it('a room name containing a script tag is stored and returned verbatim as a JSON string, not executed or stripped', async () => {
    // Correct behavior here is neither "reject" nor "silently sanitize" —
    // it's "store the bytes, and let the renderer (React, which
    // auto-escapes) be the actual XSS boundary." A JSON API has no
    // execution context of its own for this string to run in.
    const createRes = await request(app)
      .post('/api/rooms')
      .send({ roomName: SCRIPT_PAYLOAD, password: 'a-valid-password-here', duration: 600 });

    const infoRes = await request(app).get(`/api/rooms/${createRes.body.roomId}`);
    expect(infoRes.body.roomName).toBe(SCRIPT_PAYLOAD);
    expect(typeof infoRes.body.roomName).toBe('string');
  });

  it('sends X-Content-Type-Options: nosniff so a browser never reinterprets a JSON response as HTML', async () => {
    const res = await request(app)
      .post('/api/rooms')
      .send({ password: 'a-valid-password-here', duration: 600 });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('a file\u2019s Content-Type on download is always application/octet-stream, never the client-supplied mimeType', async () => {
    const createRes = await request(app)
      .post('/api/rooms')
      .send({ password: 'a-valid-password-here', duration: 600, allowFileSharing: true });
    const cookie = createRes.headers['set-cookie'];

    // An attacker-controlled mimeType claiming to be HTML, in a file
    // named to look like a script — if the server ever honored
    // this mimeType on download, a browser could render it inline.
    const uploadRes = await request(app)
      .post(`/api/rooms/${createRes.body.roomId}/files`)
      .set('Cookie', cookie)
      .field('iv', 'aXY=')
      .field('originalName', 'page.txt')
      .field('mimeType', 'text/html')
      .field('size', String(Buffer.from(IMG_PAYLOAD).length))
      .attach('file', Buffer.from(IMG_PAYLOAD), 'page.txt');

    const downloadRes = await request(app)
      .get(uploadRes.body.file.downloadUrl)
      .set('Cookie', cookie);

    expect(downloadRes.headers['content-type']).toBe('application/octet-stream');
    expect(downloadRes.headers['content-disposition']).toMatch(/^attachment/);
  });

  it('a file uploaded with an .html extension is rejected outright (outside the allow-list), not merely served safely', async () => {
    const createRes = await request(app)
      .post('/api/rooms')
      .send({ password: 'a-valid-password-here', duration: 600, allowFileSharing: true });
    const cookie = createRes.headers['set-cookie'];

    const res = await request(app)
      .post(`/api/rooms/${createRes.body.roomId}/files`)
      .set('Cookie', cookie)
      .field('iv', 'aXY=')
      .field('originalName', 'evil.html')
      .field('mimeType', 'text/html')
      .field('size', String(Buffer.from(SCRIPT_PAYLOAD).length))
      .attach('file', Buffer.from(SCRIPT_PAYLOAD), 'evil.html');

    expect(res.status).toBe(413);
  });

  it('a message payload with script-like content passes through socket validation as opaque ciphertext, never parsed as markup', async () => {
    const { messageSendSchema } = require('../../src/validators/messageSchemas');
    // The server has no plaintext to inspect in the first place —
    // this documents that the schema only constrains shape (string
    // length), never content, since ciphertext is meaningless as HTML.
    const result = messageSendSchema.safeParse({
      ciphertext: Buffer.from(SCRIPT_PAYLOAD).toString('base64'),
      iv: 'aXY=',
    });
    expect(result.success).toBe(true);
  });
});
