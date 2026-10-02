const request = require('supertest');
const app = require('../../src/app');

async function createTestRoom(overrides = {}) {
  const password = overrides.password || 'a-valid-password-here';

  const res = await request(app)
    .post('/api/rooms')
    .send({
      password,
      duration: 600,
      maxParticipants: 2,
      ...overrides,
    });

  return {
    ...res.body,
    password,
  };
}

describe('POST /api/rooms/join', () => {
  it('joining with the correct roomId and password succeeds', async () => {
    const room = await createTestRoom();

    const res = await request(app)
      .post('/api/rooms/join')
      .send({
        roomId: room.roomId,
        password: room.password,
      });

    expect(res.status).toBe(200);

    expect(res.body).toMatchObject({
      roomId: room.roomId,
      sessionId: expect.any(String),
      sessionSecret: expect.any(String),
      participantId: expect.any(String),
      isOwner: false,
      anonymousName: expect.any(String),
    });

    expect(res.body.sessionId).not.toBe(room.sessionId);
    expect(res.body.sessionSecret).not.toBe(room.sessionSecret);
  });

  it('gives the exact same response for a wrong password as for a nonexistent room (anti-enumeration)', async () => {
    const room = await createTestRoom();

    const wrongPassword = await request(app)
      .post('/api/rooms/join')
      .send({
        roomId: room.roomId,
        password: 'definitely-wrong',
      });

    const noSuchRoom = await request(app)
      .post('/api/rooms/join')
      .send({
        roomId: 'ZZZZZZZZ',
        password: 'anything-at-all',
      });

    expect(wrongPassword.status).toBe(noSuchRoom.status);
    expect(wrongPassword.body).toEqual(noSuchRoom.body);
  });

  it('rejects joining a locked room even with the correct password', async () => {
    const room = await createTestRoom();

    const lockResponse = await request(app)
      .post(`/api/rooms/${room.roomId}/lock`)
      .set('X-Session-Id', room.sessionId)
      .set('X-Session-Secret', room.sessionSecret);

    expect(lockResponse.status).toBe(200);

    const res = await request(app)
      .post('/api/rooms/join')
      .send({
        roomId: room.roomId,
        password: room.password,
      });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('roomLocked');
  });

  it('rejects joining once the room is at its participant limit', async () => {
    const room = await createTestRoom({ maxParticipants: 2 });

    // Owner already counts as participant 1.
    const firstJoin = await request(app)
      .post('/api/rooms/join')
      .send({
        roomId: room.roomId,
        password: room.password,
      });

    expect(firstJoin.status).toBe(200);

    // Room is now 2/2.
    const secondJoin = await request(app)
      .post('/api/rooms/join')
      .send({
        roomId: room.roomId,
        password: room.password,
      });

    expect(secondJoin.status).toBe(409);
    expect(secondJoin.body.code).toBe('roomFull');
  });

  it('rate-limits repeated join attempts', async () => {
    const room = await createTestRoom();

    const attempts = await Promise.all(
      Array.from({ length: 12 }, () =>
        request(app)
          .post('/api/rooms/join')
          .send({
            roomId: room.roomId,
            password: 'wrong-every-time',
          })
      )
    );

    expect(attempts.some((r) => r.status === 429)).toBe(true);
  });
});