# GhostChat

**Anonymous. Temporary. Private.**

GhostChat is a privacy-focused, real-time chat application where people can communicate inside a temporary, password-protected room without creating an account.

Rooms automatically expire after a configurable lifetime, messages are encrypted in the browser before they are sent, and temporary room data is removed when the room ends.

> **Security note:** GhostChat is designed to minimize server-side exposure of message content, but it is **not a zero-knowledge system**. The room password is submitted to the server for room authentication, and a compromised server could potentially obtain that password and derive the room encryption key. See [`SECURITY.md`](./SECURITY.md) for the complete security model and limitations.

## Project Overview

GhostChat lets someone create a temporary room, share an invite link and password, and communicate without creating an account or maintaining persistent chat history.

The application is built around:

* Client-side AES-256-GCM encryption for messages and files
* Temporary in-memory room state
* Temporary encrypted file storage
* Password-protected room access
* Anonymous per-room identities
* Header-based session authentication
* Automatic room expiration and cleanup
* Defense-in-depth security controls

This project was built as a full-stack portfolio application demonstrating real-time encrypted messaging, ephemeral-by-design data handling, secure session management, and practical web security.

See [`SECURITY.md`](./SECURITY.md) for the detailed threat model, encryption model, authentication model, data lifecycle, and known limitations.

## Features

* **No accounts** — no signup, email, phone number, or persistent user profile
* **Client-side encryption** — messages are encrypted with AES-256-GCM before being sent to the server
* **Temporary rooms** — rooms can last from 5 minutes to 24 hours
* **Anonymous identities** — participants receive temporary names such as `Anonymous Fox`
* **Secure encrypted file sharing** — files are encrypted before upload, with a 20MB maximum size
* **Real-time messaging** — Socket.IO handles message delivery, typing indicators, and presence
* **Room owner controls** — lock/unlock rooms, remove participants, clear messages, and destroy rooms
* **Password hashing** — room passwords are protected with Argon2id
* **Anti-enumeration responses** — incorrect passwords and nonexistent rooms use the same initial authentication response
* **Header-based sessions** — authentication uses temporary `X-Session-Id` and `X-Session-Secret` headers rather than cookies
* **No browser persistence** — session credentials are kept only in frontend memory and are not stored in `localStorage` or `sessionStorage`
* **Rate limiting** — HTTP actions and message sending are rate-limited
* **Security validation** — request payloads and uploaded files are validated server-side
* **Honest security UI** — the application explains what it can and cannot protect against

## Architecture

```text
                         HTTPS / WSS
Browser (React) ───────────────────────────────► Node.js
     │                                             │
     │                                             ├── Express
     │                                             ├── Socket.IO
     │                                             ├── Room/session state
     │                                             │
     │                                             └── Encrypted files
     │                                                  on local disk
     │
     ├── Derives room encryption key
     ├── Encrypts messages
     ├── Encrypts files
     └── Decrypts received content
```

### Default storage model

```text
Node.js + Express + Socket.IO
            │
            ├── memoryStore
            │     ├── rooms
            │     ├── participants
            │     └── messages
            │
            └── local encrypted file storage
```

Redis-related storage code exists for future scaling, but the current Redis implementation is **not a fully wired drop-in replacement** for the synchronous in-memory store.

Do not enable Redis for multi-instance production deployments until the storage layer has been fully integrated.

## How Encryption Works

Messages are encrypted in the browser before being transmitted.

```text
Room password
     │
     ▼
PBKDF2
250,000 iterations
SHA-256
salt = room ID
     │
     ▼
AES-256 key
     │
     ├── Encrypt message ──► ciphertext + IV ──► server
     │
     └── Encrypt file ─────► ciphertext + IV ──► server
```

The server relays and stores ciphertext rather than plaintext message content.

However, the room password is also submitted to the server when creating or joining a room so that the server can authenticate access. Therefore, GhostChat should **not** be described as zero-knowledge or as providing protection against a fully compromised server.

## Technology Stack

### Frontend

* React 18
* Vite
* React Router
* Tailwind CSS
* Socket.IO Client
* Web Crypto API
* Zod
* Lucide Icons

### Backend

* Node.js
* Express
* Socket.IO
* Argon2id
* `express-rate-limit`
* Helmet
* Zod
* Multer

## Security Model

GhostChat uses multiple layers of security.

### Encryption

* AES-256-GCM
* Browser-side encryption
* PBKDF2 key derivation
* 250,000 PBKDF2 iterations
* SHA-256
* Room ID used as the key-derivation salt
* Authenticated encryption detects ciphertext tampering

### Passwords

Room passwords are hashed with Argon2id before storage.

Passwords are not intentionally written to application logs.

### Authentication

Creating or joining a room generates:

* `sessionId`
* `sessionSecret`
* `participantId`

HTTP requests authenticate using:

```text
X-Session-Id
X-Session-Secret
```

Socket.IO connections provide the same credentials through the Socket.IO handshake.

Session credentials are:

* Randomly generated
* Validated against live room state
* Kept only in frontend memory
* Not stored in cookies
* Not stored in `localStorage`
* Not stored in `sessionStorage`

A full browser refresh intentionally ends the current frontend session.

### File Security

Files are:

1. Encrypted in the browser
2. Uploaded as ciphertext
3. Re-validated by the server
4. Stored using a random filename
5. Served as `application/octet-stream`
6. Deleted when the room is destroyed or expires

The server enforces a maximum file size of 20MB and validates the uploaded file independently of the client's checks.

## Encryption Quick Reference

| What                    | How                              |
| ----------------------- | -------------------------------- |
| Room key                | PBKDF2(password, salt = room ID) |
| PBKDF2 iterations       | 250,000                          |
| Hash function           | SHA-256                          |
| Messages                | AES-256-GCM                      |
| Files                   | AES-256-GCM                      |
| Message encryption      | Client-side                      |
| File encryption         | Client-side                      |
| Server message storage  | Ciphertext + IV                  |
| Server-derived room key | Not stored                       |

## Data Lifecycle

1. A room is created with a duration between 5 minutes and 24 hours.
2. The room timer starts immediately.
3. Messages and participant state are held in memory for the room's lifetime.
4. Encrypted uploaded files are temporarily stored on disk.
5. When the owner destroys the room or the timer expires:

   * the room timer is cancelled,
   * associated files are deleted,
   * room state is removed,
   * participants and messages are removed,
   * active sessions become invalid.
6. The application does not maintain a persistent chat-history database.

Infrastructure providers and hosting platforms may still retain their own operational or connection-level logs outside the application's control.

## Installation

Requires Node.js 18+.

```bash
git clone <this-repo>

cd ghostchat

# Backend
cd backend
cp .env.example .env
# Configure the required environment variables

npm install

# Frontend
cd ../frontend
cp .env.example .env

npm install
```

## Environment Variables

### Backend

See `backend/.env.example` for the complete annotated configuration.

| Variable            | Required          | Notes                                                                       |
| ------------------- | ----------------- | --------------------------------------------------------------------------- |
| `PORT`              | No                | Defaults to `3000`                                                          |
| `NODE_ENV`          | No                | Use `production` for production                                             |
| `SESSION_SECRET`    | Yes in production | Legacy compatibility secret currently required by the backend configuration |
| `FRONTEND_URL`      | Yes               | Frontend origin used when generating invite links                           |
| `CORS_ORIGIN`       | Yes               | Must match the frontend's exact origin                                      |
| `FILE_STORAGE_PATH` | No                | Defaults to `./uploads`                                                     |
| `MAX_FILE_SIZE`     | No                | Defaults to 20MB                                                            |
| `REDIS_URL`         | No                | Leave unset for the current single-instance architecture                    |

Generate a strong `SESSION_SECRET` with:

```bash
openssl rand -hex 32
```

### Frontend

| Variable            | Notes                                    |
| ------------------- | ---------------------------------------- |
| `VITE_API_BASE_URL` | Defaults to `/api` for local development |
| `VITE_SOCKET_URL`   | Defaults to the local Socket.IO backend  |

For the deployed Vercel frontend, these values point to the deployed Render backend.

## Running Locally

### Terminal 1 — Backend

```bash
cd backend
npm run dev
```

Backend:

```text
http://localhost:3000
```

### Terminal 2 — Frontend

```bash
cd frontend
npm run dev
```

Frontend:

```text
http://localhost:5173
```

The Vite development configuration proxies API and Socket.IO requests to the local backend.

## Docker

```bash
SESSION_SECRET=$(openssl rand -hex 32) docker compose up --build
```

The frontend is then available according to the Docker Compose configuration.

Docker builds exclude sensitive and unnecessary files through `.dockerignore`, including:

* `.env`
* `node_modules`
* uploaded files
* logs
* `.git`
* development artifacts

## Production Deployment

### Frontend

Build the React application:

```bash
cd frontend
npm run build
```

Deploy the resulting application behind HTTPS.

### Backend

Run the Node.js backend behind HTTPS/WSS.

Production should use:

```text
HTTPS
WSS
```

rather than plain HTTP/WS.

### Required production configuration

Set:

```text
SESSION_SECRET=<strong-random-secret>
FRONTEND_URL=https://your-frontend-domain
CORS_ORIGIN=https://your-frontend-domain
```

For the current GhostChat deployment, the frontend and backend are hosted separately, so the frontend environment variables must point to the deployed backend rather than `localhost`.

### Reverse proxy

The Express application trusts the first reverse proxy:

```js
app.set('trust proxy', 1);
```

This allows IP-based rate limiting to correctly use the original client address when the backend is deployed behind a proxy such as Render's infrastructure.

### Redis

Redis should **not** currently be enabled simply by setting `REDIS_URL`.

The existing Redis storage implementation is not yet a complete drop-in replacement for the application's in-memory storage. Multi-instance deployment requires the storage layer to be fully integrated first.

## API Documentation

| Method   | Path                          | Description                            |
| -------- | ----------------------------- | -------------------------------------- |
| `POST`   | `/api/rooms`                  | Create a room                          |
| `POST`   | `/api/rooms/join`             | Join a room using room ID and password |
| `GET`    | `/api/rooms/invite/:token`    | Resolve a temporary invite token       |
| `GET`    | `/api/rooms/:roomId`          | Public room information                |
| `POST`   | `/api/rooms/:roomId/lock`     | Owner-only room lock                   |
| `POST`   | `/api/rooms/:roomId/unlock`   | Owner-only room unlock                 |
| `POST`   | `/api/rooms/:roomId/destroy`  | Owner-only room destruction            |
| `POST`   | `/api/rooms/:roomId/files`    | Upload an encrypted file               |
| `GET`    | `/api/files/:fileId/download` | Download encrypted file ciphertext     |
| `DELETE` | `/api/files/:fileId`          | Delete a file                          |
| `GET`    | `/health`                     | Backend health check                   |

### Authentication

Authenticated HTTP endpoints use:

```text
X-Session-Id: <session id>
X-Session-Secret: <session secret>
```

Typical status codes include:

| Status | Meaning                               |
| ------ | ------------------------------------- |
| `400`  | Invalid request                       |
| `401`  | Missing or invalid session            |
| `403`  | Authenticated but unauthorized action |
| `404`  | Resource not found                    |
| `409`  | Room conflict/full                    |
| `413`  | File too large or invalid             |
| `429`  | Rate limited                          |

## WebSocket Events

| Event                     | Direction       | Purpose                               |
| ------------------------- | --------------- | ------------------------------------- |
| `room:joined`             | Server → Client | Initial room and participant snapshot |
| `room:user-joined`        | Server → Client | Participant joined                    |
| `room:user-left`          | Server → Client | Participant left                      |
| `room:updated`            | Server → Client | Room settings changed                 |
| `room:lock`               | Client → Server | Owner-only room lock                  |
| `room:unlock`             | Client → Server | Owner-only room unlock                |
| `room:destroy`            | Client → Server | Owner-only room destruction           |
| `room:remove-participant` | Client → Server | Owner-only participant removal        |
| `message:send`            | Client → Server | Send encrypted message                |
| `message:new`             | Server → Client | Relay encrypted message               |
| `message:delete`          | Client → Server | Delete message                        |
| `message:cleared`         | Server → Client | Messages cleared                      |
| `typing:start`            | Client → Server | Typing indicator                      |
| `typing:stop`             | Client → Server | Stop typing indicator                 |
| `file:delete`             | Client → Server | Delete uploaded file                  |
| `connection:error`        | Server → Client | Invalid/rejected action               |

File uploads deliberately use HTTP:

```text
POST /api/rooms/:roomId/files
```

rather than a Socket.IO event because HTTP/XHR provides upload-progress callbacks.

After the upload completes, the resulting file message is broadcast to the room through the normal message flow.

## Rate Limiting

Current application limits include:

| Action        | Limit                        |
| ------------- | ---------------------------- |
| Room creation | 5 per minute per client      |
| Join attempts | 10 per minute per client     |
| Messages      | 10 per 5 seconds per session |
| File uploads  | 5 per minute per client      |

HTTP limits use `express-rate-limit`.

The message limit is enforced inside the Socket.IO message handling layer because HTTP middleware does not apply to WebSocket events.

## Security Testing

Run the complete backend test suite:

```bash
cd backend
npm test
```

Individual test groups are also available:

```bash
npm run test:unit
npm run test:integration
npm run test:security
```

Security-related tests cover areas including:

* Authentication and authorization
* Session handling
* Rate limiting
* XSS payloads
* Path traversal
* File access controls
* Room isolation
* File sharing
* Socket flows

## Security Limitations

GhostChat intentionally does not claim to provide perfect security.

Important limitations include:

* **No forward secrecy within a room's lifetime.** The room password derives the room encryption key, so anyone who obtains the password can derive the same key while the room exists.
* **Server compromise is in scope.** Because the room password is submitted to the server for authentication, a fully compromised server could potentially capture the password and derive the room encryption key.
* **Screenshots cannot be prevented.** The application uses a lightweight watermark and limited screenshot detection as deterrence only.
* **Browser compromise is not protected against.** A malicious browser extension or compromised device may access decrypted content.
* **Infrastructure logs may exist.** Hosting providers, proxies, and other infrastructure may retain connection-level metadata outside the application's control.
* **Redis is not production-ready for multi-instance scaling yet.**
* **Inactivity expiration is not automatically swept.** `lastActiveAt` is tracked, but room expiration remains the enforced lifecycle mechanism.
* **No formal third-party security audit has been performed.**

See [`SECURITY.md`](./SECURITY.md) for the complete security model.

## Privacy

GhostChat does not require:

* Account creation
* Email address
* Phone number
* Real name
* Persistent user profile

Message content is not intentionally written to application logs.

The application's privacy page also explains that infrastructure providers may generate connection-level logs outside the application's direct control.

## Project Structure

```text
ghostchat/
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── context/
│   │   ├── crypto/
│   │   ├── services/
│   │   └── ...
│   └── ...
│
├── backend/
│   ├── src/
│   │   ├── config/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── sockets/
│   │   ├── storage/
│   │   ├── validators/
│   │   └── ...
│   ├── tests/
│   └── ...
│
├── SECURITY.md
├── README.md
└── ...
```

## Future Improvements

Planned improvements include:

* Fully integrate Redis as a true shared storage backend for multi-instance deployments
* Add per-message forward secrecy through a key-ratcheting design
* Implement automatic inactivity-session sweeping
* Add a Redis room-to-file index for efficient file lookup
* Continue expanding automated security and integration testing
* Consider an independent third-party security audit

## Responsible Disclosure

If you discover a security vulnerability, please report it privately rather than publishing exploit details immediately.

GhostChat is a portfolio/demonstration project without a dedicated security team or bug-bounty program, but responsible reports are welcome.

---

## License

Add the project's applicable license here if one has been selected.
