const path = require('path');
const os = require('os');
const fs = require('fs');

process.env.FILE_STORAGE_PATH = fs.mkdtempSync(
  path.join(os.tmpdir(), 'ghostchat-xss-test-')
);

const request = require('supertest');
const app = require('../../src/app');

const SCRIPT_PAYLOAD = '<script>alert(document.cookie)</script>';
const IMG_PAYLOAD = '<img src=x onerror=alert(1)>';

function withSession(requestBuilder, room) {
  return requestBuilder
    .set('X-Session-Id', room.sessionId)
    .set('X-Session-Secret', room.sessionSecret);
}

describe('XSS payload handling', () => {
  it('every API response is served as JSON, never text/html, regardless of payload content', async () => {
    const res = await request(app)
      .post('/api/rooms')
      .send({
        roomName: SCRIPT_PAYLOAD,
        password: 'a-valid-password-here',
        duration: 600,
      });

    expect(res.status).toBe(201);
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });

  it('a room name containing a script tag is stored and returned verbatim as a JSON string, not executed or stripped', async () => {
    const createRes = await request(app)
      .post('/api/rooms')
      .send({
        roomName: SCRIPT_PAYLOAD,
        password: 'a-valid-password-here',
        duration: 600,
      });

    expect(createRes.status).toBe(201);

    const infoRes = await request(app).get(
      `/api/rooms/${createRes.body.roomId}`
    );

    expect(infoRes.body.roomName).toBe(SCRIPT_PAYLOAD);
    expect(typeof infoRes.body.roomName).toBe('string');
  });

  it('sends X-Content-Type-Options: nosniff so a browser never reinterprets a JSON response as HTML', async () => {
    const res = await request(app)
      .post('/api/rooms')
      .send({
        password: 'a-valid-password-here',
        duration: 600,
      });

    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('a file Content-Type on download is always application/octet-stream, never the client-supplied mimeType', async () => {
    const createRes = await request(app)
      .post('/api/rooms')
      .send({
        password: 'a-valid-password-here',
        duration: 600,
        allowFileSharing: true,
      });

    expect(createRes.status).toBe(201);

    const room = createRes.body;
    const payload = Buffer.from(IMG_PAYLOAD);

    const uploadRes = await withSession(
      request(app).post(`/api/rooms/${room.roomId}/files`),
      room
    )
      .field('iv', 'aXY=')
      .field('originalName', 'page.txt')
      .field('mimeType', 'text/html')
      .field('size', String(payload.length))
      .attach('file', payload, 'page.txt');

    expect(uploadRes.status).toBe(201);
    expect(uploadRes.body.file).toBeDefined();

    const downloadRes = await withSession(
      request(app).get(uploadRes.body.file.downloadUrl),
      room
    );

    expect(downloadRes.status).toBe(200);
    expect(downloadRes.headers['content-type']).toBe(
      'application/octet-stream'
    );
    expect(downloadRes.headers['content-disposition']).toMatch(
      /^attachment/
    );
  });

  it('a file uploaded with an .html extension is rejected outright (outside the allow-list), not merely served safely', async () => {
    const createRes = await request(app)
      .post('/api/rooms')
      .send({
        password: 'a-valid-password-here',
        duration: 600,
        allowFileSharing: true,
      });

    expect(createRes.status).toBe(201);

    const room = createRes.body;
    const payload = Buffer.from(SCRIPT_PAYLOAD);

    const res = await withSession(
      request(app).post(`/api/rooms/${room.roomId}/files`),
      room
    )
      .field('iv', 'aXY=')
      .field('originalName', 'evil.html')
      .field('mimeType', 'text/html')
      .field('size', String(payload.length))
      .attach('file', payload, 'evil.html');

    expect(res.status).toBe(413);
  });

  it('a message payload with script-like content passes through socket validation as opaque ciphertext, never parsed as markup', async () => {
    const { messageSendSchema } = require('../../src/validators/messageSchemas');

    const result = messageSendSchema.safeParse({
      ciphertext: Buffer.from(SCRIPT_PAYLOAD).toString('base64'),
      iv: 'aXY=',
    });

    expect(result.success).toBe(true);
  });
});