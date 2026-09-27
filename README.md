# GhostChat

**Anonymous. Temporary. Private.**

A privacy-focused, real-time chat application where people can talk inside a temporary,
password-protected room without creating an account. Rooms self-destruct on a timer;
messages are encrypted in the browser before they ever reach the server.

## Project Overview

GhostChat lets someone create a room in a few seconds, share a link and a password, and
talk — with nothing left behind once the room expires. There's no signup, no persistent
chat history, and the server is architecturally unable to read message content, since
encryption happens client-side.

This project was built as a full-stack portfolio piece demonstrating end-to-end
encrypted real-time messaging, ephemeral-by-design data handling, and defense-in-depth
security practices (see [`SECURITY.md`](./SECURITY.md) for the full model).

## Features

- No accounts, ever — a room password is the only credential
- Client-side AES-256-GCM encryption; the server only ever sees ciphertext
- Rooms expire automatically on a timer (5 minutes to 24 hours)
- Anonymous per-room identities ("Anonymous Fox") with no persistent profile
- Secure encrypted file sharing, up to 20MB, with server-side re-validation
- Real-time messaging, typing indicators, and presence via Socket.IO
- Room owner controls: lock, remove participants, clear messages, end room early
- Rate limiting, Argon2id password hashing, and anti-enumeration login responses
- Honest security UI — a "what we can and can't promise" panel, not blanket claims

## Architecture

```
Browser (React)
   │  HTTPS (room create/join, file upload/download)
   │  WSS (real-time messages, typing, presence)
   ▼
Node.js + Express + Socket.IO
   │
   ├── In-memory room state (default) ──── or ──── Redis (optional, multi-instance)
   └── Encrypted files on local disk, random filenames, auto-deleted on expiry
```

Messages are encrypted in the browser before they're sent and decrypted only after
they're received — the diagram above has no point where the server holds plaintext.

## Technology Stack

**Frontend:** React 18, Vite, React Router, Tailwind CSS, Socket.IO client, Web Crypto
API, Zod, Lucide icons

**Backend:** Node.js, Express, Socket.IO, Argon2id, `express-rate-limit`, Helmet, Zod,
Multer

## Security Model

Summarized here; the full write-up (threat model, encryption details, session model,
known limitations) lives in [`SECURITY.md`](./SECURITY.md).

- **Encryption:** AES-256-GCM, key derived from the room password via PBKDF2
  (client-side only — the server never has the key).
- **Passwords:** hashed with Argon2id, never stored or logged in plaintext.
- **Anti-enumeration:** a wrong password and a nonexistent room return identical
  responses.
- **File security:** server-side re-validation of size/extension, random on-disk
  filenames, fixed `Content-Type: application/octet-stream` on download.

GhostChat deliberately avoids overclaiming — you won't find "military-grade" or "100%
secure" anywhere in this project, in the code or the UI.

## Encryption Model (Quick Reference)

| What | How |
|---|---|
| Room key | PBKDF2(password, salt = room ID), 250,000 iterations |
| Messages | AES-256-GCM, encrypted client-side before sending |
| Files | AES-256-GCM, same room key, encrypted before upload |
| What the server stores | Ciphertext + IV only |

## Data Lifecycle

1. Room created → timer starts (chosen duration, 5 min–24 hr)
2. Messages/files exist only for the room's lifetime, in memory or on disk
3. Timer expires (or owner destroys the room) → files deleted from disk, all in-memory
   state wiped, every session invalidated
4. Nothing is retained afterward, by design

## Installation

Requires Node.js 18+.

```bash
git clone <this-repo>
cd ghostchat

# Backend
cd backend
cp .env.example .env      # then set SESSION_SECRET (see below)
npm install

# Frontend
cd ../frontend
cp .env.example .env
npm install
```

## Environment Variables

**`backend/.env`** (see `backend/.env.example` for the full annotated list):

| Variable | Required | Notes |
|---|---|---|
| `PORT` | No | Defaults to 3000 |
| `SESSION_SECRET` | **Yes in production** | `openssl rand -hex 32` |
| `CORS_ORIGIN` | Yes | Must match the frontend's exact origin |
| `FILE_STORAGE_PATH` | No | Defaults to `./uploads` |
| `MAX_FILE_SIZE` | No | Bytes; defaults to 20MB |
| `REDIS_URL` | No | Leave unset for single-instance deployments |

**`frontend/.env`**:

| Variable | Notes |
|---|---|
| `VITE_API_BASE_URL` | Defaults to `/api` (works with the Vite dev proxy) |
| `VITE_SOCKET_URL` | Defaults to `/` |

## Running Locally

```bash
# Terminal 1 — backend
cd backend
npm run dev        # http://localhost:3000

# Terminal 2 — frontend
cd frontend
npm run dev         # http://localhost:5173, proxies /api and /socket.io to the backend
```

Or with Docker:

```bash
SESSION_SECRET=$(openssl rand -hex 32) docker compose up --build
# frontend: http://localhost:8080
```

## Production Deployment

- Serve the frontend's `npm run build` output (or the Docker image) behind HTTPS.
- Run the backend behind HTTPS/WSS — never over plain HTTP/WS in production; redirect
  HTTP to HTTPS at your reverse proxy or load balancer.
- Set a real `SESSION_SECRET` and a `CORS_ORIGIN` matching your actual frontend origin.
- For more than one backend instance, set `REDIS_URL` — but read the caveat in
  `backend/src/storage/redisStore.js` first; that swap isn't fully wired yet (see
  `SECURITY.md`'s "Known Limitations" section).

## API Documentation

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/rooms` | Create a room |
| `POST` | `/api/rooms/join` | Join a room by ID + password |
| `GET` | `/api/rooms/:roomId` | Public room info (no password hash) |
| `POST` | `/api/rooms/:roomId/lock` \| `/unlock` \| `/destroy` | Owner-only, session-authenticated |
| `POST` | `/api/rooms/:roomId/files` | Upload an encrypted file (multipart) |
| `GET` | `/api/files/:fileId/download` | Download ciphertext |
| `DELETE` | `/api/files/:fileId` | Delete a file (uploader or room owner) |
| `GET` | `/health` | Health check |

Standard status codes throughout: `400` invalid request, `401` no/invalid session, `403`
unauthorized action, `404` not found, `409` room full, `413` file too large/invalid,
`429` rate limited.

## WebSocket Events

| Event | Direction | Purpose |
|---|---|---|
| `room:joined` | server → client | Initial room/participant snapshot on connect |
| `room:user-joined` / `room:user-left` | server → client | Presence updates |
| `room:updated` | server → client | Settings changed (lock state, etc.) |
| `room:lock` / `room:unlock` / `room:destroy` | client → server | Owner-only actions |
| `room:remove-participant` | client → server | Owner-only |
| `message:send` / `message:new` | both | Encrypted message relay |
| `message:delete` / `message:cleared` | both | Message removal |
| `typing:start` / `typing:stop` | both | Typing indicator |
| `file:delete` | client → server | Real-time file deletion (upload itself is HTTP — see below) |
| `connection:error` | server → client | Rejected/invalid action notice |

File **upload** deliberately goes through HTTP (`POST /api/rooms/:roomId/files`) rather
than a socket event, because only HTTP/XHR gives real upload-progress callbacks — the
resulting file then broadcasts to the room over `message:new`, same as a text message.

## Security Testing

```bash
cd backend
npm test                 # everything
npm run test:unit        # ID generation, password hashing, expiration timers, file validation
npm run test:integration # full request/response and socket flows
npm run test:security    # rate limiting, unauthorized access, XSS payloads, path traversal
```

## Limitations

See `SECURITY.md`'s "Known Limitations" section for the complete, current list. The
short version: no forward secrecy within a room's lifetime, screenshot deterrence rather
than prevention, and the Redis storage backend isn't a fully wired drop-in yet.

## Privacy

No account, email, phone number, or real name is ever requested. Message content is
never logged. See the in-app `/privacy` page for the full, plain-language policy,
including the honest disclosure that infrastructure providers in the delivery path may
still generate their own connection-level logs outside this application's control.

## Future Improvements

- Wire `storage/redisStore.js` in as a true drop-in for multi-instance deployments
- Per-message forward secrecy (key ratcheting) instead of one static room key
- An automated inactivity sweep, not just a tracked `lastActiveAt` timestamp
- A room→file index in Redis so `getFilesByRoom` works in the Redis-backed store
