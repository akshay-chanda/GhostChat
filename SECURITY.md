# Security Model

This document describes what GhostChat actually protects against, how, and — just as importantly — what it does not protect against.

If something isn't claimed here, assume it isn't guaranteed.

## Threat Model

GhostChat is designed to reduce exposure of message content and temporary room data:

- **Ordinary server-side message disclosure.** Messages are encrypted client-side before they are stored or relayed by the application. The application does not store plaintext message content or the derived room encryption key.

- **A persistent database breach exposing chat history.** The current application architecture uses an in-memory room store rather than a permanent chat-history database. Messages exist only for the lifetime of their room.

- **An attacker guessing a room ID or password.** Room IDs and session credentials use cryptographically secure randomness rather than `Math.random()`. Password verification uses Argon2id, and room creation/join attempts are rate-limited.

- **A stolen password-verification record being brute-forced offline.** Argon2id is used for password verification rather than storing plaintext passwords.

- **Casual file-based attacks.** Server-side validation protects against oversized uploads, disallowed extensions, inconsistent declared sizes, and user-controlled storage paths.

- **Unauthorized cross-room file access.** A valid session for one room cannot use a file ID to download a file belonging to another room.

GhostChat is **not** designed to protect against:

- A participant in the room screenshotting, recording, photographing, copying, or retyping what they see. Once content is decrypted and rendered in someone's browser, it is visible to that person by definition.

- A compromised or malicious browser extension with page access.

- A compromised participant device or browser that can access decrypted content.

- A fully compromised or malicious server that captures the room password while it is being submitted or otherwise obtains the password. Because the room password is also used to derive the room encryption key, possession of that password allows the same room encryption key to be derived.

- Network-level observation of **the fact that a connection happened**. Application-level encryption does not make network activity invisible to hosting providers, reverse proxies, CDNs, or other infrastructure.

- A nation-state or other adversary capable of compelling infrastructure providers or directly attacking AES-256-GCM, Argon2id, or PBKDF2 with substantial resources. These primitives are treated as computationally infeasible to break with current public knowledge, not as mathematically unbreakable.

---

## Encryption Model

- **Algorithm:** AES-256-GCM authenticated encryption through the browser's native Web Crypto API. Tampering with ciphertext is detected during decryption rather than silently accepted.

- **Key derivation:** Every participant already shares the same secret — the room password — so GhostChat does not require an asymmetric key exchange for the room encryption key.

  The room encryption key is derived in the browser from the room password using PBKDF2 with:

  - SHA-256
  - 250,000 iterations
  - The room ID as the salt

  Using the room ID as the salt means the same password reused across different rooms does not produce the same derived encryption key.

  See:

  `frontend/src/crypto/keyExchange.js`

- **What the application server receives:** The server receives message ciphertext and its initialization vector (IV), together with the room/session metadata required to route and authorize the request.

  The application server does not store the derived room encryption key or plaintext message content.

- **Password handling:** The room password is sent to the server when creating or joining a room so the server can authenticate access and maintain its Argon2id password-verification record.

  This means GhostChat is **not a zero-knowledge server architecture**. A fully compromised server could potentially capture the password and derive the room encryption key.

- **Files:** Files are encrypted client-side with the same room key before upload, using the same AES-256-GCM construction. The server stores the encrypted bytes under a generated storage filename rather than the original filename.

- **Voice messages:** Voice recordings are encrypted client-side before upload using the room encryption key. The server stores and serves the encrypted file data without decrypting the recording.

- **Known limitation — no forward secrecy within a room's lifetime:** Anyone who learns the room password can derive the same room key for as long as the room exists and potentially decrypt content sent during that room's lifetime.

  This is a deliberate simplification of the current architecture. Full forward secrecy would require a per-message or per-session key ratchet.

  If the room password is exposed, destroy the room and create a new one with a different password.

---

## Authentication Model

- **Room passwords:** Room passwords are protected using Argon2id before their verification data is stored. Plaintext passwords are not intentionally stored as persistent application data.

  See:

  `backend/src/services/passwordService.js`

- **Joining a room:** Joining requires the correct room ID and password.

  The application avoids unnecessarily revealing whether an initial authentication failure was caused by an invalid room ID or invalid password.

  Once the requester has successfully demonstrated knowledge of the room password, subsequent room states such as a locked room or full room may be distinguished because the requester has already proven possession of the room secret.

- **No accounts:** GhostChat does not use persistent user accounts.

  There is no:

  - Account password
  - Password-reset flow
  - Email account
  - Persistent user profile
  - Long-lived account credential

---

## Session Model

- Joining or creating a room issues two temporary session credentials:

  `sessionId`

  `sessionSecret`

- These credentials are generated using cryptographically secure randomness and returned to the frontend over HTTPS.

- HTTP requests authenticate using:

  `X-Session-Id`

  `X-Session-Secret`

- Session credentials are **not stored in cookies** and are **not stored in**:

  - `localStorage`
  - `sessionStorage`

- Session credentials are kept only in the frontend's in-memory session state for the lifetime of the current page.

- WebSocket connections send the same `sessionId` and `sessionSecret` through the Socket.IO handshake `auth` payload.

- The server validates those credentials against the live room and participant state before allowing the socket to access the room.

- The server does not send the `sessionSecret` back as part of the authenticated session object after validation. It is used only to prove possession of the session.

- A session remains valid only while the associated room exists and the participant remains authorized.

- Authenticated requests and socket operations are checked against live room/session state rather than treating possession of an old credential as permanent access.

- Because session credentials are intentionally kept only in memory, a full browser refresh ends the frontend's authenticated session by design.

- The user must create or join the room again to obtain fresh session credentials.

The relevant frontend implementation includes:

`frontend/src/context/SessionContext.jsx`

and the API authentication helpers.

---

## Data Lifecycle

1. A room is created with a duration selected by its creator.

2. The supported room lifetime is currently between **5 minutes and 24 hours**.

3. Room state, participants, messages, sessions, and file metadata are temporary application data.

4. Messages and room state are maintained in the current in-memory store:

   `backend/src/storage/memoryStore.js`

5. Uploaded files are encrypted blobs stored temporarily on disk under the backend upload storage directory.

6. Uploaded files use generated server-side storage filenames rather than the original filename.

7. When the timer expires or the owner explicitly destroys the room, the server:

   - Cancels the room timer.
   - Deletes associated encrypted files.
   - Removes participants.
   - Removes messages.
   - Removes room state.
   - Removes associated temporary file metadata.

8. Room expiration and explicit room destruction use the same internal room-destruction cleanup path.

9. There is currently no permanent application database containing GhostChat chat history.

### Redis status

A Redis store exists in the repository for possible future or multi-instance use, but the current application architecture primarily uses the in-memory store.

Redis should **not currently be described as a fully wired drop-in replacement** for the in-memory store.

The Redis implementation should be treated as incomplete until all relevant synchronous/asynchronous call sites and lifecycle behavior have been fully integrated and tested.

---

## File Security

Every uploaded file is re-validated **server-side** regardless of what the client already checked.

Client-side validation is intended for fast UI feedback and is never treated as the security boundary.

### Server-side validation

The server applies:

- A hard **20 MB** size limit
- Extension allow-list validation
- Declared-size versus received-size consistency checks
- Filename sanitization
- Room/session authorization

### Storage filenames

The original filename is never used as the physical on-disk filename.

The server generates a random storage filename instead.

This prevents user-controlled filenames from directly determining the filesystem path used to store encrypted data.

The original filename may still be retained as temporary metadata for display in the chat UI after sanitization.

### MIME handling

The application does not treat a client-supplied MIME type as a trusted security boundary.

Encrypted file data is served as binary data rather than intentionally rendered as trusted application content.

### Download authorization

A file can only be downloaded by an authenticated session belonging to the same room as the uploaded file.

A valid session for Room A cannot use a file ID from Room B to retrieve that file.

### Delete authorization

A file can only be deleted by:

- The participant who uploaded it
- The room owner

Deleting a file also removes its associated file message from the room.

### Temporary storage

Uploaded encrypted files are temporary and are removed when their associated room expires or is destroyed.

Files can also be explicitly deleted by an authorized uploader or room owner.

---

## Rate Limiting

The application applies rate limits to sensitive operations.

| Action | Limit |
| --- | --- |
| Room creation | 5 per minute per client |
| Join attempts | 10 per minute per client |
| Messages | 10 per 5 seconds per session |
| File uploads | 5 per minute per client |

HTTP-side limits use `express-rate-limit`.

The message limit is enforced at the Socket.IO event layer because normal HTTP middleware does not automatically apply to WebSocket events.

Rate limiting is intended to reduce abuse and automated guessing. It is not a guarantee against distributed attacks or infrastructure-level abuse.

---

## WebSocket Security

- A socket cannot access a room before authentication.

- Socket authentication is performed through Socket.IO middleware before room access is granted.

  See:

  `backend/src/sockets/socketAuth.js`

- Socket event handlers perform server-side authorization using authenticated session and room state.

- Privileged operations such as room management, message deletion, participant removal, and other owner-only operations do not rely solely on client-provided ownership flags.

- Server-side authorization is checked against the live room and participant state.

- Incoming application payloads are validated against the corresponding backend validation rules where defined.

- Zod-based validators are located under:

  `backend/src/validators/`

Client-provided identifiers and authorization-related values are not treated as trustworthy simply because they originated from a connected browser.

---

## Screenshot & Screen-Recording Limitations

GhostChat includes lightweight screenshot deterrence and best-effort detection.

### Watermark

The chat interface can display an anonymous participant name and room information as a visible watermark.

The watermark is intended as **deterrence**, not as a technical prevention mechanism.

### Screenshot detection

GhostChat currently has a narrow browser-level screenshot signal based primarily on the Windows `PrintScreen` key.

When a supported screenshot signal is detected:

1. The browser reports the event.
2. The authenticated socket sends the screenshot event to the server.
3. The server validates the authenticated participant.
4. The event is broadcast to the room.
5. Other participants can receive a screenshot notification associated with that participant.

The sender's own browser does not display the resulting room notification to itself.

### Important limitation

No normal web application can reliably detect or prevent all:

- Windows screenshots
- macOS screenshots
- Linux screenshots
- iOS screenshots
- Android screenshots
- Screen recordings
- Browser-extension capture
- External-camera photography
- Manual copying
- Retyping

Therefore, screenshot detection is an **honesty-scoped signal and notification feature**, not a security boundary.

Anything displayed in a GhostChat room should be treated as potentially capturable by anyone who can see it.

---

## Logging Policy

`backend/src/utils/logger.js` is the centralized application logging utility.

The logger is designed as a single choke point to reduce accidental exposure of sensitive information.

Sensitive field names are redacted, including:

- `password`
- `ciphertext`
- `iv`
- `content`
- `roomKey`
- `encryptionKey`
- `plaintext`

The logger recursively processes nested metadata objects.

Message content, plaintext room passwords, ciphertext fields, IV values, and derived encryption keys are therefore not intentionally written to application logs through this logging utility.

### Important infrastructure limitation

This policy applies to logs controlled by the GhostChat application.

It does not automatically control logs produced by:

- Hosting providers
- Reverse proxies
- CDNs
- Operating systems
- Load balancers
- TLS termination infrastructure
- Monitoring platforms
- Other third-party services

Those systems may retain operational information independently.

---

## Infrastructure Processing

"Messages aren't stored" does not mean the infrastructure delivering them generates zero logs.

Hosting providers, reverse proxies, CDNs, and other infrastructure may process or retain operational metadata such as:

- IP addresses
- Connection timestamps
- Request information
- Network-level connection records
- Error or infrastructure telemetry

GhostChat's application code does not control the retention policies of those external systems.

Therefore, GhostChat does not claim that using the application makes a user's network activity invisible.

The user-facing `/privacy` page contains the same general disclosure in simpler language.

---

## Security Boundaries

GhostChat's security model has several deliberate boundaries.

### The browser performs encryption and decryption

The browser performs encryption before sending message content to the server and performs decryption when receiving encrypted content.

If the browser, operating system, or browser extension is compromised, an attacker may access plaintext after decryption.

### The server is not a zero-knowledge system

The server does not receive plaintext message content during normal encrypted message handling.

However, the server receives the room password during room creation or joining for authentication.

Therefore, a fully compromised server could potentially obtain the password and derive the room encryption key.

### The room password is security-critical

The room password protects both:

- Room access
- The room's message encryption key

A strong, unique room password is therefore important.

If the password is exposed, the room should be considered compromised and destroyed.

### Session credentials are temporary

Session credentials are intentionally kept only in browser memory.

This reduces persistent browser exposure but also means that a page refresh ends the current frontend session.

---

## Known Limitations

The current implementation has the following known limitations:

- **No forward secrecy within a room's lifetime.** The room password derives the room encryption key, so obtaining the password can expose room content during the room's lifetime.

- **Screenshot and recording protection is deterrence and best-effort detection only.** It cannot reliably prevent or detect all capture methods.

- **The server receives the room password during authentication.** GhostChat therefore does not claim to be a zero-knowledge server architecture.

- **Application encryption does not hide network metadata.** Infrastructure providers may still observe connection-level information.

- **Session inactivity tracking is not currently an independent expiration mechanism.** `lastActiveAt` may be tracked, but the room's own expiration lifecycle remains the enforced expiration mechanism.

- **Redis is not currently a fully wired drop-in replacement for the in-memory store.** Multi-instance Redis behavior should not be treated as equivalent to the current memory-store implementation until the integration is completed and tested.

- **No formal third-party security audit has been performed on this codebase.**

- **Temporary deletion is application-level deletion.** GhostChat removes its own temporary room data and encrypted files, but cannot control copies, backups, snapshots, logs, or retention performed by external infrastructure providers.

---

## Security Recommendations for Users

Users should still:

1. Use a strong, unique room password.
2. Avoid reusing important passwords from other services.
3. Destroy a room if its password may have been exposed.
4. Treat messages, files, and voice recordings as potentially capturable by other participants.
5. Keep their operating system and browser updated.
6. Avoid using GhostChat from compromised devices.
7. Be cautious with browser extensions that have access to page content.
8. Avoid sending information that would cause harm if another participant copied it.

GhostChat's security model reduces certain forms of server-side exposure, but it cannot protect information after a trusted participant's device has rendered it.

---

## Responsible Disclosure

If you find a security issue in this project, please avoid immediately publishing sensitive exploit details in a public issue.

Where supported, use a private GitHub security advisory or contact the maintainer directly so the issue can be investigated and fixed before detailed exploitation information becomes public.

GhostChat is currently a portfolio/demonstration project without a dedicated security team or formal bug-bounty program, but responsible security reports are welcome and will be reviewed in good faith.

---

## Security Documentation Scope

This document describes the security properties of the current GhostChat implementation.

It should be updated whenever changes are made to:

- Encryption
- Key derivation
- Authentication
- Session handling
- File storage
- Message storage
- Room lifecycle
- Socket authorization
- Rate limiting
- Logging
- Screenshot detection
- Infrastructure architecture
- Redis integration

Security claims should always reflect the actual implementation rather than intended future architecture.