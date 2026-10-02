# Security Model

This document describes what GhostChat actually protects against, how, and — just as
importantly — what it does not protect against. If something isn't claimed here, assume
it isn't guaranteed.

## Threat Model

GhostChat is designed to reduce exposure of message content and temporary room data:

* **Ordinary server-side message disclosure.** Messages are encrypted client-side
  before they are stored or relayed by the application. The application does not store
  plaintext message content or the derived room encryption key.
* **A database breach exposing chat history.** There is no persistent database of chat
  history — messages live in memory (or, if Redis is enabled, in a TTL-bound cache) and
  are removed when a room expires.
* **An attacker guessing a room ID or password.** Room IDs are generated with
  `crypto.randomBytes`, not `Math.random`. Passwords are hashed with Argon2id, and login
  attempts are rate-limited.
* **A stolen password-hash database being brute-forced offline.** Argon2id's cost
  parameters (see `backend/src/config/security.js`) are set above the library defaults
  specifically to make this expensive.
* **Casual file-based attacks** — path traversal via filenames, disguised executables,
  oversized uploads, spoofed MIME types.

GhostChat is **not** designed to protect against:

* A participant in the room screenshotting, recording, or retyping what they see. Once
  content is decrypted and rendered in someone's browser, it is visible to that person
  by definition.
* A compromised or malicious browser extension with page access.
* A fully compromised or malicious server that captures the room password while it is
  being submitted or otherwise obtains the password. Because the room password is also
  the secret from which the message encryption key is derived, possession of that
  password allows the same room encryption key to be derived.
* Network-level observation of *that a connection happened* (see "Infrastructure
  Processing" below).
* A nation-state or other adversary capable of compelling infrastructure providers, or
  with the resources to attack AES-256-GCM/Argon2id/PBKDF2 directly. These are believed
  computationally infeasible with current public knowledge, not proven unbreakable.

## Encryption Model

* **Algorithm:** AES-256-GCM (authenticated encryption) via the browser's native Web
  Crypto API. Tampering with ciphertext in transit is detected on decrypt, not silently
  accepted.
* **Key derivation:** every participant already shares the same secret — the room
  password — so there is no asymmetric key-exchange problem to solve. The room's AES key
  is derived in the browser from the password via PBKDF2 (250,000 iterations, SHA-256),
  salted with the room ID so the same password reused across two rooms does not produce
  the same key. See `frontend/src/crypto/keyExchange.js`.
* **What the application server receives:** message ciphertext and its initialization
  vector (IV), together with the room/session metadata required to route and authorize
  the request. The application server does not store the derived room encryption key
  or plaintext message content.
* **Password handling:** the room password is sent to the server when creating or
  joining a room so the server can authenticate access and maintain its Argon2id
  password verification record. This means GhostChat is **not a zero-knowledge server
  architecture**: a fully compromised server could potentially capture the password and
  derive the room encryption key.
* **Files:** files are encrypted client-side with the same room key before upload, using
  the same AES-256-GCM construction. The server stores and serves ciphertext under a
  random filename.
* **Known limitation — no forward secrecy within a room's lifetime.** Anyone who learns
  the room password can derive the same key for as long as the room exists and decrypt
  anything sent in it, past or future, during that window. This is a deliberate
  simplification: full forward secrecy would require a per-message or per-session key
  ratchet. If the password leaks, destroy the room.

## Authentication Model

* **Room passwords** are hashed with Argon2id before storage — never stored or logged in
  plaintext. See `backend/src/services/passwordService.js`.
* **Joining a room** requires the correct room ID and password. A wrong password and a
  nonexistent room ID return the *exact same response* — this is deliberate, to prevent
  an attacker from using error messages to enumerate which room IDs exist. Once a
  password
  has been verified correct, subsequent states (room locked, room full) are
  distinguished, since at that point the requester has already proven they hold the
  room's secret.
* **No accounts.** There is nothing to phish, no password reset flow, no persistent
  credential that outlives a room.

## Session Model

* Joining or creating a room issues two random session credentials:
  `sessionId` and `sessionSecret`. They are generated using cryptographically secure
  randomness and are returned to the frontend over HTTPS.
* HTTP requests authenticate using the following custom headers:
  `X-Session-Id` and `X-Session-Secret`.
* The session credentials are **not stored in cookies** and are **not stored in**
  **`localStorage` or `sessionStorage`.** They are kept only in the frontend's in-memory
  session state for the lifetime of the current page.
* WebSocket connections send the same `sessionId` and `sessionSecret` through the Socket.IO
  handshake `auth` payload. The server validates those credentials against the live room
  and participant state before allowing the socket to access the room.
* The server never sends the `sessionSecret` back as part of the authenticated session
  object after validation. It is used only to prove possession of the session.
* A session is valid only as long as its room exists and the participant hasn't been
  removed. Every authenticated request re-validates the session against live room state;
  possessing session credentials does not by itself guarantee continued access.
* Because the session credentials are intentionally kept only in memory, a full browser
  refresh ends the frontend's authenticated session by design. The user must join or
  create the room again to obtain fresh session credentials.
* The frontend does not persist session authentication in browser storage. See
  `frontend/src/context/SessionContext.jsx` and the API authentication helpers.

## Data Lifecycle

1. A room is created with a duration (5 minutes to 24 hours) chosen by its creator.
2. Messages and file metadata live in memory (`backend/src/storage/memoryStore.js`) for
   the room's lifetime only — never written to a persistent database.
3. Uploaded files are encrypted blobs on disk under `backend/uploads/`, referenced by
   a random ID, never the original filename.
4. When the timer expires (or the owner explicitly destroys the room), the server:
   cancels the room's timer, deletes all files belonging to it from disk, and deletes
   the room's in-memory state (participants, messages, room record). This is one code
   path (`roomManager.destroyRoomInternal`) regardless of whether expiration was automatic
   or explicit — there's no separate "leftover" cleanup step to forget.
5. If Redis is enabled for multi-instance scaling, room/participant/message keys carry
   a TTL matching the room's expiration — Redis expires them on its own even if the
   process that scheduled the in-memory timer isn't the one still running.

## File Security

* Every uploaded file is re-validated **server-side** regardless of what the client
  already checked — size (hard 20MB ceiling), extension (allow-list, not just a
  block-list), and a size-vs-declared-size consistency check. The client's own checks
  are for fast UI feedback only and are never trusted.
* The original filename is never used as the on-disk filename — a random token
  (`f_<32 hex chars>.bin`) is generated instead, making path traversal via filename
  structurally impossible regardless of sanitization quality. The original name is still
  sanitized before being *displayed* (stripped of directory components, `..` sequences,
  and both `/`- and `\`-based traversal attempts), since it's shown in the chat UI.
* Downloads are always served with `Content-Type: application/octet-stream`, never the
  client-supplied MIME type — this prevents a browser from ever choosing to render a
  malicious upload inline based on an attacker-controlled MIME claim.
* A file can only be deleted by the person who uploaded it or by the room owner.
* A file can only be downloaded by a session belonging to the same room it was uploaded
  to — a valid session for Room A cannot fetch a file from Room B, even with its file ID.

## Rate Limiting

| Action        | Limit                                               |
| ------------- | --------------------------------------------------- |
| Room creation | 5 per minute per client                             |
| Join attempts | 10 per minute per client                            |
| Messages      | 10 per 5 seconds per session (enforced socket-side) |
| File uploads  | 5 per minute per client                             |

HTTP-side limits use `express-rate-limit`; the message limit is enforced inline in
`backend/src/sockets/messageEvents.js` since `express-rate-limit` doesn't apply to
WebSocket events at all.

## WebSocket Security

* A socket cannot emit or receive anything before authenticating — `socketAuth`
  (`backend/src/sockets/socketAuth.js`) runs as `io.use()` middleware, so there is no
  window where an unauthenticated socket is connected to a room.
* Every socket event handler re-validates authorization against live state (e.g.
  `room:lock` re-checks room ownership server-side) rather than trusting a flag cached at
  connect time.
* Every incoming payload is validated against a Zod schema (`backend/src/validators/`)
  before being acted on.

## Screenshot & Screen-Recording Limitations

GhostChat includes a lightweight, best-effort watermark (anonymous name + room ID,
periodically repositioned) as **deterrence**, and a narrow detection hook for the Windows
`PrintScreen` key as an **honesty-scoped signal**, not a guarantee.

No web application can reliably detect or block screenshots or screen recording across
Windows, macOS, Linux, iOS, Android, every browser, every browser extension, and every
external camera. GhostChat does not claim to. If this matters for your use case, treat
anything sent in a room as potentially capturable by anyone who can see their own screen.

## Logging Policy

`backend/src/utils/logger.js` is the single choke point for all server-side logging, and
it redacts a fixed set of field names (`password`, `ciphertext`, `iv`, `content`,
`roomKey`, `encryptionKey`, `plaintext`) on every call — this is enforced structurally,
not left to each call site to remember. Message content, room passwords, and derived
encryption keys are never written to any log this application controls.

## Infrastructure Processing

"Messages aren't stored" does not mean the infrastructure delivering them generates zero
logs of any kind. Hosting providers, reverse proxies, CDNs, and TLS termination points
may retain their own operational logs — typically connection metadata like IP addresses
and timestamps — as a normal part of running any web service. GhostChat's application
code does not control this layer and cannot truthfully promise it retains nothing. See the
frontend's `/privacy` page for the same disclosure in user-facing language.

## Known Limitations (Summary)

* No forward secrecy within a room's lifetime (see Encryption Model above).
* Screenshot/recording deterrence only, never prevention.
* `storage/redisStore.js` is not yet a fully wired drop-in replacement for
  `storage/memoryStore.js` — see the comment at the top of that file for the specific
  gap (sync vs. async call sites).
* Inactivity-based session expiry is tracked (`lastActiveAt`) but not currently swept
  automatically; the room's own timer is the only expiration mechanism actually enforced.
* No formal third-party security audit has been performed on this codebase.

## Responsible Disclosure

If you find a security issue in this project, please open a private security advisory
(or contact the maintainer directly) rather than filing a public issue, so a fix can be
prepared before details are public. This is a portfolio/demonstration project without
a dedicated security team or bug-bounty program, but reports are still welcome and will
be addressed in good faith.
