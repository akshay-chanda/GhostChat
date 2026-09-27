// Server-side values are authoritative — the frontend's copies in
// utils/constants.js are for UI feedback only. Nothing here should
// ever be relaxed to match a client-supplied value.

const MAX_FILE_SIZE = Number(process.env.MAX_FILE_SIZE || 20 * 1024 * 1024); // 20MB
const MAX_MESSAGE_LENGTH = 5000;
const MIN_PASSWORD_LENGTH = 8;

const ROOM_DURATIONS_SECONDS = [300, 600, 1800, 3600, 21600, 43200, 86400];

const PARTICIPANT_LIMITS = [2, 5, 10, 20, 50];
const DEFAULT_MAX_PARTICIPANTS = 20;
const HARD_MAX_PARTICIPANTS = 50;

const BLOCKED_FILE_EXTENSIONS = ['.exe', '.bat', '.cmd', '.ps1', '.scr', '.js', '.vbs', '.msi', '.jar'];
const ALLOWED_FILE_EXTENSIONS = ['.pdf', '.txt', '.docx', '.png', '.jpg', '.jpeg', '.webp', '.zip'];

const ROOM_ID_LENGTH = 8;
const SESSION_ID_BYTES = 24;
const FILE_ID_BYTES = 16;

const RATE_LIMITS = {
  roomCreation: { windowMs: 60_000, max: 5 },
  joinAttempts: { windowMs: 60_000, max: 10 },
  messagesPerWindow: { windowMs: 5_000, max: 10 },
  filesPerWindow: { windowMs: 60_000, max: 5 },
};

const ANONYMOUS_NAME_POOL = [
  'Fox', 'Wolf', 'Raven', 'Tiger', 'Panda', 'Otter', 'Falcon', 'Lynx',
  'Heron', 'Badger', 'Owl', 'Cobra', 'Puma', 'Hawk', 'Bear', 'Crane',
];

module.exports = {
  MAX_FILE_SIZE,
  MAX_MESSAGE_LENGTH,
  MIN_PASSWORD_LENGTH,
  ROOM_DURATIONS_SECONDS,
  PARTICIPANT_LIMITS,
  DEFAULT_MAX_PARTICIPANTS,
  HARD_MAX_PARTICIPANTS,
  BLOCKED_FILE_EXTENSIONS,
  ALLOWED_FILE_EXTENSIONS,
  ROOM_ID_LENGTH,
  SESSION_ID_BYTES,
  FILE_ID_BYTES,
  RATE_LIMITS,
  ANONYMOUS_NAME_POOL,
};
