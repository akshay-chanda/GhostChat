const http = require('http');
const { io: ioClient } = require('socket.io-client');
const initSocketServer = require('../../src/sockets');
const roomManager = require('../../src/services/roomManager');
const passwordService = require('../../src/services/passwordService');

let httpServer;
let socketUrl;

beforeAll((done) => {
  httpServer = http.createServer();
  initSocketServer(httpServer);
  httpServer.listen(() => {
    socketUrl = `http://localhost:${httpServer.address().port}`;
    done();
  });
});

afterAll((done) => {
  httpServer.close(done);
});

async function createRoomAndParticipants() {
  const passwordHash = await passwordService.hashPassword('a-valid-password-here');
  const { room, owner } = await roomManager.createRoom({
    roomName: 'Test room',
    passwordHash,
    duration: 600,
    maxParticipants: 5,
    allowFileSharing: true,
  });
  const { participant } = await roomManager.joinRoom({ roomId: room.roomId, password: 'a-valid-password-here' });
  return { roomId: room.roomId, owner, participant };
}

function connect(roomId, sessionId) {
  return ioClient(socketUrl, { auth: { roomId, sessionId }, transports: ['websocket'], forceNew: true });
}

describe('message:send', () => {
  let sockets = [];

  afterEach(() => {
    sockets.forEach((s) => s.disconnect());
    sockets = [];
  });

  it('broadcasts an encrypted message to every other socket in the room', async () => {
    const { roomId, owner, participant } = await createRoomAndParticipants();
    const ownerSocket = connect(roomId, owner.sessionId);
    const otherSocket = connect(roomId, participant.sessionId);
    sockets = [ownerSocket, otherSocket];

    await new Promise((resolve) => ownerSocket.on('connect', resolve));
    await new Promise((resolve) => otherSocket.on('connect', resolve));

    const received = new Promise((resolve) => otherSocket.on('message:new', resolve));
    ownerSocket.emit('message:send', { ciphertext: 'ZmFrZS1jaXBoZXJ0ZXh0', iv: 'ZmFrZS1pdg==' });

    const message = await received;
    expect(message.ciphertext).toBe('ZmFrZS1jaXBoZXJ0ZXh0');
    expect(message.senderId).toBe(owner.sessionId);
    // The server must never have touched/derived plaintext — there's
    // no field here it could have populated with it.
    expect(message).not.toHaveProperty('content');
    expect(message).not.toHaveProperty('plaintext');
  });

  it('rejects a connection with no session credentials', async () => {
    const badSocket = ioClient(socketUrl, { transports: ['websocket'], forceNew: true });
    sockets = [badSocket];

    const error = await new Promise((resolve) => badSocket.on('connect_error', resolve));
    expect(error.message).toMatch(/credentials/i);
  });

  it('rejects a connection with a sessionId that was never issued', async () => {
    const { roomId } = await createRoomAndParticipants();
    const badSocket = connect(roomId, 'not-a-real-session-id');
    sockets = [badSocket];

    const error = await new Promise((resolve) => badSocket.on('connect_error', resolve));
    expect(error.message).toMatch(/invalid|expired/i);
  });

  it('flags the sender with connection:error once the per-socket rate limit is exceeded', async () => {
    const { roomId, owner } = await createRoomAndParticipants();
    const socket = connect(roomId, owner.sessionId);
    sockets = [socket];
    await new Promise((resolve) => socket.on('connect', resolve));

    const errorPromise = new Promise((resolve) => socket.on('connection:error', resolve));

    // RATE_LIMITS.messagesPerWindow allows 10 per 5s — send one more
    // than that in a burst to trip it.
    for (let i = 0; i < 11; i++) {
      socket.emit('message:send', { ciphertext: `msg-${i}`, iv: 'ZmFrZS1pdg==' });
    }

    const error = await errorPromise;
    expect(error.message).toMatch(/quickly/i);
  });

  it('message:delete removes the message and notifies the room', async () => {
    const { roomId, owner, participant } = await createRoomAndParticipants();
    const ownerSocket = connect(roomId, owner.sessionId);
    const otherSocket = connect(roomId, participant.sessionId);
    sockets = [ownerSocket, otherSocket];

    await new Promise((resolve) => ownerSocket.on('connect', resolve));
    await new Promise((resolve) => otherSocket.on('connect', resolve));

    const newMessage = new Promise((resolve) => otherSocket.on('message:new', resolve));
    ownerSocket.emit('message:send', { ciphertext: 'to-be-deleted', iv: 'ZmFrZS1pdg==' });
    const message = await newMessage;

    const deleteNotice = new Promise((resolve) => otherSocket.on('message:delete', resolve));
    ownerSocket.emit('message:delete', { messageId: message.id });

    const notice = await deleteNotice;
    expect(notice.messageId).toBe(message.id);
  });
});
