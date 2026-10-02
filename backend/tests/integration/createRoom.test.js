const request = require('supertest');
const app = require('../../src/app');

describe('POST /api/rooms', () => {
  it('creates a room and never echoes the password back', async () => {
    const res = await request(app)
      .post('/api/rooms')
      .send({
        password: 'correct-horse-battery',
        duration: 1800,
        allowFileSharing: true,
      });

    expect(res.status).toBe(201);

    expect(res.body).toMatchObject({
      roomId: expect.stringMatching(/^[A-Z0-9]{8}$/),
      sessionId: expect.any(String),
      sessionSecret: expect.any(String),
      participantId: expect.any(String),
      anonymousName: expect.stringMatching(/^Anonymous /),
      expiresAt: expect.any(String),
    });

    expect(res.body.shareLink).toEqual(
      expect.stringMatching(/\/join\?invite=[^&]+$/)
    );

    expect(JSON.stringify(res.body)).not.toContain(
      'correct-horse-battery'
    );
  });

  it('returns private session credentials without setting a session cookie', async () => {
    const res = await request(app)
      .post('/api/rooms')
      .send({
        password: 'another-strong-password',
        duration: 600,
      });

    expect(res.status).toBe(201);

    expect(res.body.sessionId).toEqual(expect.any(String));
    expect(res.body.sessionSecret).toEqual(expect.any(String));

    const setCookie = res.headers['set-cookie'];

    expect(setCookie).toBeUndefined();
  });

  it('rejects a password shorter than the minimum length', async () => {
    const res = await request(app)
      .post('/api/rooms')
      .send({
        password: 'short',
        duration: 600,
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('generic');
  });

  it('rejects a duration outside the allowed set', async () => {
    const res = await request(app)
      .post('/api/rooms')
      .send({
        password: 'a-valid-password-here',
        duration: 42,
      });

    expect(res.status).toBe(400);
  });

  it('rate-limits repeated room creation from the same client', async () => {
    const attempts = await Promise.all(
      Array.from({ length: 7 }, () =>
        request(app)
          .post('/api/rooms')
          .send({
            password: 'a-valid-password-here',
            duration: 600,
          })
      )
    );

    const statuses = attempts.map((r) => r.status);

    expect(statuses.filter((s) => s === 429).length).toBeGreaterThan(0);
  });
});