const crypto = require('crypto');

const roomManager = require('../services/roomManager');
const passwordService = require('../services/passwordService');
const logger = require('../utils/logger');

/*
 * Temporary invite-token storage.
 *
 * The token itself is the only value placed in the share URL.
 *
 * The actual room password is kept server-side and is returned
 * only when the invite token is successfully resolved.
 *
 * Tokens expire automatically after 10 minutes.
 */
const INVITE_TOKEN_TTL_MS = 10 * 60 * 1000;

const inviteTokens = new Map();

/**
 * Remove expired invite tokens periodically.
 */
function cleanupExpiredInviteTokens() {
  const now = Date.now();

  for (const [token, invite] of inviteTokens.entries()) {
    if (invite.expiresAt <= now) {
      inviteTokens.delete(token);
    }
  }
}

/**
 * Create a cryptographically secure temporary invite token.
 */
function createInviteToken({
  roomId,
  password,
}) {
  cleanupExpiredInviteTokens();

  const token = crypto.randomBytes(32).toString('hex');

  inviteTokens.set(token, {
    roomId,
    password,
    expiresAt: Date.now() + INVITE_TOKEN_TTL_MS,
  });

  return token;
}

/**
 * Resolve a temporary invite token.
 */
function resolveInviteToken(token) {
  cleanupExpiredInviteTokens();

  if (!token || typeof token !== 'string') {
    return null;
  }

  const invite = inviteTokens.get(token);

  if (!invite) {
    return null;
  }

  if (invite.expiresAt <= Date.now()) {
    inviteTokens.delete(token);
    return null;
  }

  return {
    roomId: invite.roomId,
    password: invite.password,
    expiresAt: invite.expiresAt,
  };
}

async function createRoom(req, res, next) {
  try {
    const {
      roomName,
      password,
      duration,
      maxParticipants,
      allowFileSharing,
    } = req.body;

    const passwordHash =
      await passwordService.hashPassword(password);

    const {
      room,
      owner,
      sessionSecret,
    } = await roomManager.createRoom({
      roomName,
      passwordHash,
      duration,
      maxParticipants,
      allowFileSharing,
    });

    /*
     * Create a temporary invite token.
     *
     * IMPORTANT:
     * The actual password is NOT placed in the URL.
     */
    const inviteToken = createInviteToken({
      roomId: room.roomId,
      password,
    });

    /*
     * Invitation links MUST point to the FRONTEND.
     *
     * Never use req.protocol or req.get('host') here because
     * those values point to the backend server.
     */
    const frontendUrl =
      process.env.FRONTEND_URL ||
      process.env.CORS_ORIGIN;

    if (!frontendUrl) {
      throw new Error(
        'Missing FRONTEND_URL or CORS_ORIGIN environment variable'
      );
    }

    const cleanFrontendUrl =
      frontendUrl.trim().replace(/\/$/, '');

    /*
     * Example:
     *
     * https://ghost-chat-akshay.vercel.app/join?invite=TOKEN
     */
    const shareLink =
      `${cleanFrontendUrl}/join?invite=${encodeURIComponent(inviteToken)}`;

    /*
     * IMPORTANT:
     *
     * No session cookie is created here.
     *
     * The frontend receives the private session credentials
     * and keeps them only in JavaScript memory.
     */
    res.status(201).json({
      roomId: room.roomId,
      shareLink,
      sessionId: owner.sessionId,
      sessionSecret,
      participantId: owner.participantId,
      anonymousName: owner.anonymousName,
      expiresAt: room.expiresAt,
    });
  } catch (err) {
    logger.error('Room creation failed', {
      code: err.code,
    });

    next(err);
  }
}

/**
 * Resolve a temporary invite token.
 *
 * GET /api/rooms/invite/:token
 *
 * This only pre-fills the Join Room form.
 * It does not authenticate a participant.
 */
async function resolveInvite(req, res, next) {
  try {
    const { token } = req.params;

    const invite = resolveInviteToken(token);

    if (!invite) {
      return res.status(404).json({
        code: 'inviteNotFound',
        message: 'This invite link is invalid or has expired.',
      });
    }

    /*
     * Verify that the room still exists.
     */
    const roomInfo = roomManager.getPublicRoomInfo(
      invite.roomId
    );

    if (!roomInfo) {
      inviteTokens.delete(token);

      return res.status(404).json({
        code: 'roomNotFound',
        message: 'This room no longer exists.',
      });
    }

    res.status(200).json({
      roomId: invite.roomId,
      password: invite.password,
      expiresAt: invite.expiresAt,
    });
  } catch (err) {
    next(err);
  }
}

async function joinRoom(req, res, next) {
  try {
    const {
      roomId,
      password,
    } = req.body;

    const result = await roomManager.joinRoom({
      roomId,
      password,
    });

    if (!result.ok) {
      const responses = {
        notFound: [
          401,
          {
            code: 'incorrectCredentials',
            message: 'Incorrect room ID or password.',
          },
        ],

        locked: [
          403,
          {
            code: 'roomLocked',
            message: 'This room is locked.',
          },
        ],

        full: [
          409,
          {
            code: 'roomFull',
            message: 'This room is full.',
          },
        ],
      };

      const [status, body] =
        responses[result.reason] ||
        responses.notFound;

      return res.status(status).json(body);
    }

    /*
     * IMPORTANT:
     *
     * No session cookie is created here.
     *
     * The frontend receives the private session credentials
     * and keeps them only in JavaScript memory.
     */
    res.status(200).json({
      roomId,
      sessionId: result.participant.sessionId,
      sessionSecret: result.sessionSecret,
      participantId: result.participant.participantId,
      anonymousName: result.participant.anonymousName,
      isOwner: result.participant.isOwner,
    });
  } catch (err) {
    next(err);
  }
}

async function getRoomInfo(req, res, next) {
  try {
    const info = roomManager.getPublicRoomInfo(
      req.params.roomId
    );

    if (!info) {
      return res.status(404).json({
        code: 'roomNotFound',
        message: 'Room not found.',
      });
    }

    res.status(200).json(info);
  } catch (err) {
    next(err);
  }
}

async function lockRoom(req, res, next) {
  try {
    roomManager.setLocked(
      req.params.roomId,
      req.session.sessionId,
      true
    );

    const io = req.app.get('io');

    if (io) {
      io.to(req.params.roomId).emit(
        'room:updated',
        roomManager.getPublicRoomInfo(
          req.params.roomId
        )
      );
    }

    res.status(200).json({
      locked: true,
    });
  } catch (err) {
    next(err);
  }
}

async function unlockRoom(req, res, next) {
  try {
    roomManager.setLocked(
      req.params.roomId,
      req.session.sessionId,
      false
    );

    const io = req.app.get('io');

    if (io) {
      io.to(req.params.roomId).emit(
        'room:updated',
        roomManager.getPublicRoomInfo(
          req.params.roomId
        )
      );
    }

    res.status(200).json({
      locked: false,
    });
  } catch (err) {
    next(err);
  }
}

async function destroyRoom(req, res, next) {
  try {
    const destroyed =
      await roomManager.destroyRoom(
        req.params.roomId,
        req.session.sessionId
      );

    if (!destroyed) {
      return res.status(404).json({
        code: 'roomNotFound',
        message: 'Room not found.',
      });
    }

    const io = req.app.get('io');

    if (io) {
      io.to(req.params.roomId).emit(
        'room:expired'
      );
    }

    /*
     * Delete all invite tokens belonging to
     * the destroyed room.
     */
    for (
      const [token, invite]
      of inviteTokens.entries()
    ) {
      if (
        invite.roomId === req.params.roomId
      ) {
        inviteTokens.delete(token);
      }
    }

    res.status(200).json({
      destroyed: true,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createRoom,
  joinRoom,
  resolveInvite,
  getRoomInfo,
  lockRoom,
  unlockRoom,
  destroyRoom,
};