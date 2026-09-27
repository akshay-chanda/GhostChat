const express = require('express');
const roomController = require('../controllers/roomController');
const { requireSession, requireOwner } = require('../middleware/auth');
const { validateBody } = require('../middleware/validateRequest');
const { roomCreationLimiter, joinAttemptLimiter } = require('../middleware/rateLimiter');
const { createRoomSchema, joinRoomSchema } = require('../validators/roomSchemas');

const router = express.Router();

router.post('/', roomCreationLimiter, validateBody(createRoomSchema), roomController.createRoom);
router.post('/join', joinAttemptLimiter, validateBody(joinRoomSchema), roomController.joinRoom);
router.get('/:roomId', roomController.getRoomInfo);

// Owner-only lifecycle actions. These duplicate what's available
// over the socket (room:lock / room:unlock / room:destroy) so the
// same actions are testable and usable without an open WebSocket —
// but the socket path is what the UI actually calls for immediacy.
router.post('/:roomId/lock', requireSession, requireOwner, roomController.lockRoom);
router.post('/:roomId/unlock', requireSession, requireOwner, roomController.unlockRoom);
router.post('/:roomId/destroy', requireSession, requireOwner, roomController.destroyRoom);

module.exports = router;
