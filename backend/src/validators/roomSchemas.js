const { z } = require('zod');
const {
  MIN_PASSWORD_LENGTH,
  ROOM_DURATIONS_SECONDS,
  PARTICIPANT_LIMITS,
  HARD_MAX_PARTICIPANTS,
} = require('../utils/constants');

const ROOM_ID_PATTERN = /^[A-Z0-9]{6,10}$/;

const createRoomSchema = z.object({
  roomName: z.string().trim().max(40).optional(),
  password: z.string().min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`),
  duration: z.number().refine((v) => ROOM_DURATIONS_SECONDS.includes(v), 'Invalid room duration.'),
  maxParticipants: z
    .number()
    .refine((v) => PARTICIPANT_LIMITS.includes(v), 'Invalid participant limit.')
    .optional(),
  allowFileSharing: z.boolean().optional(),
});

const joinRoomSchema = z.object({
  roomId: z
    .string()
    .trim()
    .toUpperCase()
    .regex(ROOM_ID_PATTERN, 'Invalid room ID.'),
  password: z.string().min(1, 'Password is required.'),
});

// Not yet wired to a route — extendExpiration/setMaxParticipants in
// roomManager are currently only reachable via the socket path
// (room:lock/unlock, etc. are; a matching HTTP settings endpoint
// isn't in routes/roomRoutes.js). Kept here so adding one later is
// just a route + this schema, not a new schema too.
const updateSettingsSchema = z.object({
  locked: z.boolean().optional(),
  acceptingNewMembers: z.boolean().optional(),
  fileSharingEnabled: z.boolean().optional(),
  maxParticipants: z.number().max(HARD_MAX_PARTICIPANTS).optional(),
  extendBySeconds: z.number().positive().optional(),
});

module.exports = { createRoomSchema, joinRoomSchema, updateSettingsSchema };
