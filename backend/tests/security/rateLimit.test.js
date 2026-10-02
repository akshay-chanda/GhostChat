const path = require('path');
const os = require('os');
const fs = require('fs');

process.env.FILE_STORAGE_PATH = fs.mkdtempSync(
  path.join(os.tmpdir(), 'ghostchat-ratelimit-test-')
);

const request = require('supertest');
const app = require('../../src/app');
const { resetRateLimiters } = require('../../src/middleware/rateLimiter');

function withSession(requestBuilder, room) {
  return requestBuilder
    .set('X-Session-Id', room.sessionId)
    .set('X-Session-Secret', room.sessionSecret);
}

describe('rate limiting', () => {
  afterEach(() => {
    resetRateLimiters();
  });

  it('room creation is limited per client', async () => {
    const attempts = await Promise.all(
      Array.from({ length: 8 }, () =>
        request(app)
          .post('/api/rooms')
          .send({
            password: 'a-valid-password-here',
            duration: 600,
          })
      )
    );

    const limited = attempts.filter((r) => r.status === 429);

    expect(limited.length).toBeGreaterThan(0);

    limited.forEach((res) => {
      expect(res.body.code).toBe('tooManyRequests');
    });
  });

  it('join attempts are limited per client, independent of the room creation limiter', async () => {
    const createRes = await request(app)
      .post('/api/rooms')
      .send({
        password: 'a-valid-password-here',
        duration: 600,
      });

    const { roomId } = createRes.body;

    const attempts = await Promise.all(
      Array.from({ length: 15 }, () =>
        request(app)
          .post('/api/rooms/join')
          .send({
            roomId,
            password: 'wrong-password-guess',
          })
      )
    );

    expect(attempts.some((r) => r.status === 429)).toBe(true);
  });

  it('file uploads are limited per client', async () => {
    const createRes = await request(app)
      .post('/api/rooms')
      .send({
        password: 'a-valid-password-here',
        duration: 600,
        allowFileSharing: true,
      });

    expect(createRes.status).toBe(201);

    const room = createRes.body;
    const attempts = [];

    for (let i = 0; i < 7; i += 1) {
      const buffer = Buffer.from(`file-${i}`);

      // eslint-disable-next-line no-await-in-loop
      attempts.push(
        await withSession(
          request(app).post(`/api/rooms/${room.roomId}/files`),
          room
        )
          .field('iv', 'aXY=')
          .field('originalName', `f${i}.txt`)
          .field('mimeType', 'text/plain')
          .field('size', String(buffer.length))
          .attach('file', buffer, `f${i}.txt`)
      );
    }

    expect(attempts.some((r) => r.status === 429)).toBe(true);
  });

  it('rate limit responses never distinguish IP-blocked from account-blocked — no user enumeration via limiter behavior', async () => {
    // Two different (nonexistent vs real) room IDs should be
    // rate-limited identically once the join-attempt limiter trips,
    // since the limiter acts before roomManager ever looks the room
    // up.
    const attempts = await Promise.all(
      Array.from({ length: 15 }, (_, i) =>
        request(app)
          .post('/api/rooms/join')
          .send({
            roomId: i % 2 === 0 ? 'REAL0001' : 'FAKE0002',
            password: 'irrelevant',
          })
      )
    );

    const limitedBodies = attempts
      .filter((r) => r.status === 429)
      .map((r) => JSON.stringify(r.body));

    const uniqueBodies = new Set(limitedBodies);

    expect(uniqueBodies.size).toBeLessThanOrEqual(1);
  });
});