const roomManager = require('../services/roomManager');
const passwordService = require('../services/passwordService');
const logger = require('../utils/logger');

const SESSION_COOKIE = 'gc_session';

/**
 * Stores the complete private HTTP session credential.
 *
 * The cookie is:
 * - httpOnly: unavailable to browser JavaScript
 * - signed: cannot be forged without SESSION_SECRET
 * - sameSite: strict
 * - secure in production
 *
 * sessionId and sessionSecret are both required by auth middleware.
 * Neither value is exposed in public room information.
 */
function setSessionCookie(
  res,
  { sessionId, sessionSecret, roomId }
) {
  res.cookie(
    SESSION_COOKIE,
    JSON.stringify({
      sessionId,
      sessionSecret,
      roomId,
    }),
    {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      signed: true,
    }
  );
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

    const passwordHash = await passwordService.hashPassword(password);

    const { room, owner, sessionSecret } =
      await roomManager.createRoom({
        roomName,
        passwordHash,
        duration,
        maxParticipants,
        allowFileSharing,
      });

    setSessionCookie(res, {
      sessionId: owner.sessionId,
      sessionSecret,
      roomId: room.roomId,
    });

    // The password is never returned by the backend.
    // The client already has the password it submitted.
    res.status(201).json({
      roomId: room.roomId,
      shareLink: `${req.protocol}://${req.get('host')}/join/${room.roomId}`,
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

async function joinRoom(req, res, next) {
  try {
    const { roomId, password } = req.body;

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
        responses[result.reason] || responses.notFound;

      return res.status(status).json(body);
    }

    setSessionCookie(res, {
      sessionId: result.participant.sessionId,
      sessionSecret: result.sessionSecret,
      roomId,
    });

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
        roomManager.getPublicRoomInfo(req.params.roomId)
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
        roomManager.getPublicRoomInfo(req.params.roomId)
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
    const destroyed = await roomManager.destroyRoom(
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
      io.to(req.params.roomId).emit('room:expired');
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
  getRoomInfo,
  lockRoom,
  unlockRoom,
  destroyRoom,
};