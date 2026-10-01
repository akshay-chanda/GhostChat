const http = require('http');
const { io: ioClient } = require('socket.io-client');
const initSocketServer = require('../../src/sockets');
const roomManager = require('../../src/services/roomManager');
const passwordService = require('../../src/services/passwordService');

let httpServer;
let socketUrl;

beforeAll(async () => {
  httpServer = http.createServer();

  await initSocketServer(httpServer);

  await new Promise((resolve) => {
    httpServer.listen(0, '127.0.0.1', resolve);
  });

  socketUrl = `http://127.0.0.1:${httpServer.address().port}`;
});

afterAll(async () => {
  if (!httpServer) {
    return;
  }

  await new Promise((resolve) => {
    httpServer.close(() => resolve());
  });
});

async function createRoomAndParticipants() {
  const passwordHash = await passwordService.hashPassword(
    'a-valid-password-here'
  );

  const { room, owner } = await roomManager.createRoom({
    roomName: 'Test room',
    passwordHash,
    duration: 600,
    maxParticipants: 5,
    allowFileSharing: true,
  });

  const { participant } = await roomManager.joinRoom({
    roomId: room.roomId,
    password: 'a-valid-password-here',
  });

  return {
    roomId: room.roomId,
    owner,
    participant,
  };
}

function connect(roomId, participant) {
  return ioClient(socketUrl, {
    auth: {
      roomId,
      sessionId: participant.sessionId,
      sessionSecret: participant.sessionSecret,
    },
    transports: ['websocket'],
    forceNew: true,
  });
}

function waitForConnect(socket) {
  return new Promise((resolve, reject) => {
    if (socket.connected) {
      resolve();
      return;
    }

    const onConnect = () => {
      cleanup();
      resolve();
    };

    const onError = (error) => {
      cleanup();
      reject(error);
    };

    const cleanup = () => {
      socket.off('connect', onConnect);
      socket.off('connect_error', onError);
    };

    socket.once('connect', onConnect);
    socket.once('connect_error', onError);
  });
}

function waitForEvent(socket, eventName, predicate = () => true, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    let timer;

    const onEvent = (payload) => {
      if (!predicate(payload)) {
        return;
      }

      cleanup();
      resolve(payload);
    };

    const cleanup = () => {
      clearTimeout(timer);
      socket.off(eventName, onEvent);
    };

    timer = setTimeout(() => {
      cleanup();
      reject(
        new Error(
          `Timed out waiting for Socket.IO event "${eventName}".`
        )
      );
    }, timeoutMs);

    socket.on(eventName, onEvent);
  });
}

function waitForTextMessage(socket) {
  return waitForEvent(
    socket,
    'message:new',
    (message) =>
      message &&
      message.type === 'text' &&
      typeof message.ciphertext === 'string'
  );
}

describe('message:send', () => {
  let sockets = [];

  afterEach(() => {
    sockets.forEach((socket) => {
      if (socket) {
        socket.removeAllListeners();
        socket.disconnect();
      }
    });

    sockets = [];
  });

  it('broadcasts an encrypted message to every other socket in the room', async () => {
    const { roomId, owner, participant } =
      await createRoomAndParticipants();

    const ownerSocket = connect(roomId, owner);
    const otherSocket = connect(roomId, participant);

    sockets = [ownerSocket, otherSocket];

    /*
     * message:new is also used for system messages.
     * Only wait for the encrypted text message.
     */
    const received = waitForTextMessage(otherSocket);

    await Promise.all([
      waitForConnect(ownerSocket),
      waitForConnect(otherSocket),
    ]);

    ownerSocket.emit('message:send', {
      ciphertext: 'ZmFrZS1jaXBoZXJ0ZXh0',
      iv: 'ZmFrZS1pdg==',
    });

    const message = await received;

    expect(message.ciphertext).toBe(
      'ZmFrZS1jaXBoZXJ0ZXh0'
    );

    expect(message.senderId).toBe(
      owner.participantId
    );

    expect(message).not.toHaveProperty(
      'sessionId'
    );

    expect(message).not.toHaveProperty(
      'sessionSecret'
    );

    expect(message).not.toHaveProperty(
      'content'
    );

    expect(message).not.toHaveProperty(
      'plaintext'
    );
  });

  it('rejects a connection with no session credentials', async () => {
    const badSocket = ioClient(socketUrl, {
      transports: ['websocket'],
      forceNew: true,
    });

    sockets = [badSocket];

    const error = await new Promise((resolve) => {
      badSocket.once('connect_error', resolve);
    });

    expect(error.message).toMatch(/credentials/i);
  });

  it('rejects a connection with a sessionId that was never issued', async () => {
    const { roomId, owner } =
      await createRoomAndParticipants();

    const badSocket = ioClient(socketUrl, {
      auth: {
        roomId,
        sessionId: 'not-a-real-session-id',
        sessionSecret: owner.sessionSecret,
      },
      transports: ['websocket'],
      forceNew: true,
    });

    sockets = [badSocket];

    const error = await new Promise((resolve) => {
      badSocket.once('connect_error', resolve);
    });

    expect(error.message).toMatch(
      /invalid|expired/i
    );
  });

  it('rejects a connection with an invalid session secret', async () => {
    const { roomId, owner } =
      await createRoomAndParticipants();

    const badSocket = ioClient(socketUrl, {
      auth: {
        roomId,
        sessionId: owner.sessionId,
        sessionSecret: 'not-a-real-session-secret',
      },
      transports: ['websocket'],
      forceNew: true,
    });

    sockets = [badSocket];

    const error = await new Promise((resolve) => {
      badSocket.once('connect_error', resolve);
    });

    expect(error.message).toMatch(
      /invalid|expired/i
    );
  });

  it('flags the sender with connection:error once the per-socket rate limit is exceeded', async () => {
    const { roomId, owner } =
      await createRoomAndParticipants();

    const socket = connect(roomId, owner);

    sockets = [socket];

    await waitForConnect(socket);

    const errorPromise = waitForEvent(
      socket,
      'connection:error'
    );

    for (let i = 0; i < 11; i += 1) {
      socket.emit('message:send', {
        ciphertext: `msg-${i}`,
        iv: 'ZmFrZS1pdg==',
      });
    }

    const error = await errorPromise;

    expect(error.message).toMatch(
      /quickly/i
    );
  });

  it('message:delete removes the message and notifies the room', async () => {
    const { roomId, owner, participant } =
      await createRoomAndParticipants();

    const ownerSocket = connect(roomId, owner);
    const otherSocket = connect(
      roomId,
      participant
    );

    sockets = [
      ownerSocket,
      otherSocket,
    ];

    /*
     * Ignore the system "joined" messages and wait
     * specifically for the encrypted text message.
     */
    const newMessage = waitForTextMessage(
      otherSocket
    );

    await Promise.all([
      waitForConnect(ownerSocket),
      waitForConnect(otherSocket),
    ]);

    ownerSocket.emit('message:send', {
      ciphertext: 'to-be-deleted',
      iv: 'ZmFrZS1pdg==',
    });

    const message = await newMessage;

    const deleteNotice = waitForEvent(
      otherSocket,
      'message:delete'
    );

    ownerSocket.emit('message:delete', {
      messageId: message.id,
    });

    const notice = await deleteNotice;

    expect(notice.messageId).toBe(
      message.id
    );
  });
});