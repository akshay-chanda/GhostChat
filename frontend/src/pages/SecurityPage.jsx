import { useState } from 'react';
import {
  ShieldCheck,
  LockKeyhole,
  UserRoundCheck,
  FileLock2,
  Trash2,
  Network,
  MonitorUp,
  ChevronDown,
  Check,
  AlertTriangle,
  Mic,
} from 'lucide-react';

const SECURITY_SECTIONS = [
  {
    id: 'overview',
    title: 'Security overview',
    icon: ShieldCheck,
    summary:
      'What GhostChat protects and what it deliberately does not promise.',
    content: [
      'GhostChat is designed around temporary rooms, anonymous identities, client-side encryption, and short-lived session credentials.',
      'Messages are encrypted in the browser before they reach the application server. The server handles encrypted ciphertext and the metadata required to route and authorize the room.',
      'Files and voice messages are also encrypted in the browser before upload. The server stores the encrypted data temporarily rather than decrypting the contents.',
      'Security has boundaries. A participant can still capture content, a compromised browser can access decrypted messages, and infrastructure providers may retain connection-level operational metadata.',
    ],
  },
  {
    id: 'encryption',
    title: 'Encryption',
    icon: LockKeyhole,
    summary:
      'Messages, files, and voice recordings are encrypted before they leave your browser.',
    content: [
      'GhostChat uses AES-256-GCM through the browser Web Crypto API for authenticated encryption.',
      'The room password is used in the browser to derive the room encryption key with PBKDF2 using SHA-256 and 250,000 iterations. The room ID is used as the salt so the same password does not produce the same derived key across different rooms.',
      'The application server does not store the derived room encryption key or plaintext message content.',
      'Files and voice recordings follow the same client-side encryption model. The browser encrypts the content before upload and the server stores the resulting encrypted bytes.',
    ],
  },
  {
    id: 'authentication',
    title: 'Authentication & sessions',
    icon: UserRoundCheck,
    summary:
      'Temporary session credentials stay in browser memory.',
    content: [
      'GhostChat does not use accounts. Creating or joining a room issues a temporary session ID and session secret generated with cryptographically secure randomness.',
      'HTTP requests authenticate with X-Session-Id and X-Session-Secret headers. WebSocket connections provide the same credentials during the Socket.IO handshake.',
      'Session credentials are not stored in cookies, localStorage, or sessionStorage. They remain in the current browser session memory.',
      'A full page refresh intentionally ends the frontend session. The user must create or join the room again to obtain fresh session credentials.',
      'The server re-validates session credentials against live room state rather than treating possession of an old credential as permanent access.',
    ],
  },
  {
    id: 'files',
    title: 'File & voice security',
    icon: FileLock2,
    summary:
      'Uploads are encrypted, validated, access-controlled, and temporary.',
    content: [
      'Files and voice recordings are encrypted client-side before they are uploaded to the server.',
      'The server applies its own file validation regardless of client-side checks, including a hard 20 MB size limit, extension allow-listing, and declared-size consistency checks.',
      'Uploaded files use random server-side filenames rather than the original filename.',
      'Downloads require an authenticated session belonging to the same room as the uploaded file.',
      'A file or voice message can be deleted by its uploader or by the room owner. Deletion removes the encrypted file data and its associated chat message.',
      'The server does not decrypt uploaded file or voice content.',
    ],
  },
  {
    id: 'lifecycle',
    title: 'Data lifecycle',
    icon: Trash2,
    summary:
      'Rooms and their temporary data are removed when the room ends.',
    content: [
      'Room state, participants, messages, sessions, and file metadata are temporary application data.',
      'When a room expires or the owner destroys it, associated files are deleted and the room state is removed.',
      'There is no permanent application database containing GhostChat chat history in the current architecture. The current application uses an in-memory store.',
      'Hosting and infrastructure providers are a separate layer and may retain operational connection metadata such as IP addresses and timestamps.',
    ],
  },
  {
    id: 'infrastructure',
    title: 'Infrastructure & network visibility',
    icon: Network,
    summary:
      'Application privacy does not mean network invisibility.',
    content: [
      'GhostChat does not control every system involved in delivering the service.',
      'Hosting providers, reverse proxies, CDNs, TLS termination points, and monitoring systems may process operational information required to run the service.',
      'That can include connection metadata such as IP addresses, timestamps, request information, or other operational records depending on the provider.',
      'GhostChat application logging is designed not to write message content, plaintext passwords, encryption keys, or similar sensitive content to application logs.',
    ],
  },
  {
    id: 'screenshots',
    title: 'Screenshots & recording',
    icon: MonitorUp,
    summary:
      'Browser-based detection can notify participants but cannot reliably prevent capture.',
    content: [
      'GhostChat includes best-effort browser screenshot detection. When a supported screenshot signal is detected, the application can notify the other participants in the room.',
      'Screenshot detection is not a security boundary. A normal website cannot reliably detect every screenshot, screen recording, mobile system screenshot, external camera capture, or other method of copying what is displayed.',
      'GhostChat cannot technically prevent a participant from saving, copying, photographing, recording, or sharing information visible on their device.',
      'Treat anything displayed in a room as potentially capturable by someone who can see it.',
    ],
  },
  {
    id: 'logging',
    title: 'Application logging',
    icon: Network,
    summary:
      'Application logs are designed to avoid sensitive message data.',
    content: [
      'GhostChat uses a centralized application logger designed to reduce accidental exposure of sensitive information in server logs.',
      'The application logger redacts sensitive fields such as passwords, ciphertext, IV values, plaintext content, and encryption keys.',
      'Error logging preserves useful diagnostic information such as error names, messages, stacks, and error codes without intentionally logging message contents or encryption secrets.',
      'This does not control logs generated by hosting providers, reverse proxies, operating systems, or other infrastructure outside the application.',
    ],
  },
  {
    id: 'limitations',
    title: 'Known limitations',
    icon: AlertTriangle,
    summary:
      'Important limitations that are part of the current design.',
    content: [
      'GhostChat does not currently provide forward secrecy within a room. Anyone who obtains the room password can derive the same room key while the room exists.',
      'A fully compromised server could potentially capture a room password while it is being submitted and derive the corresponding room encryption key. This is why GhostChat does not claim to be a zero-knowledge server architecture.',
      'Screenshot and recording protection is best-effort detection and notification only.',
      'The current architecture is primarily designed for temporary, single-instance operation and uses an in-memory store.',
      'No formal third-party security audit has been performed on the codebase.',
    ],
  },
];

const PROMISES = [
  'Client-side encryption for messages, files, and voice recordings',
  'Argon2id protection for stored room-password verification data',
  'Temporary room, session, message, and file lifecycle',
  'No browser persistence for session credentials',
  'Server-side validation and access control for uploaded files',
  'Application logging designed to avoid sensitive message data',
];

const BOUNDARIES = [
  'Infrastructure providers may process connection metadata',
  'Participants can capture or share what they see',
  'Compromised browsers or extensions can access decrypted content',
  'A compromised server could potentially obtain a submitted room password',
  'No forward secrecy during a room’s lifetime',
  'Screenshot detection cannot reliably detect every capture method',
];

function SecurityItem({
  section,
  isOpen,
  onToggle,
}) {
  const Icon = section.icon;

  return (
    <div className="border-b border-white/5">
      <button
        type="button"
        onClick={onToggle}
        className="w-full py-5 flex items-center gap-4 text-left group"
        aria-expanded={isOpen}
        aria-controls={`${section.id}-content`}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#111827] border border-white/5">
          <Icon
            className="h-5 w-5 text-[#00D9FF]"
            strokeWidth={1.8}
            aria-hidden="true"
          />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block text-sm sm:text-base font-medium text-[#F8FAFC]">
            {section.title}
          </span>

          <span className="mt-1 block text-xs sm:text-sm text-[#94A3B8] leading-relaxed">
            {section.summary}
          </span>
        </span>

        <ChevronDown
          className={`h-5 w-5 shrink-0 text-[#94A3B8] transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        />
      </button>

      {isOpen && (
        <div
          id={`${section.id}-content`}
          className="pb-6 pl-14 pr-2"
        >
          <div className="space-y-3">
            {section.content.map((paragraph) => (
              <p
                key={paragraph}
                className="text-sm text-[#94A3B8] leading-relaxed"
              >
                {paragraph}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function SecurityPage() {
  const [openSection, setOpenSection] =
    useState('overview');

  const toggleSection = (id) => {
    setOpenSection((current) =>
      current === id ? null : id
    );
  };

  return (
    <section className="min-h-screen px-4 sm:px-6 pt-28 pb-20">
      <div className="mx-auto max-w-5xl">

        {/* Header */}
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#00D9FF]/15 bg-[#00D9FF]/5 px-3 py-1.5">
            <ShieldCheck
              className="h-4 w-4 text-[#00D9FF]"
              strokeWidth={1.8}
              aria-hidden="true"
            />

            <span className="text-xs font-medium text-[#00D9FF]">
              GhostChat Security Center
            </span>
          </div>

          <h1 className="mt-5 text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight text-[#F8FAFC]">
            How GhostChat actually protects your data
          </h1>

          <p className="mt-4 max-w-2xl text-sm sm:text-base text-[#94A3B8] leading-relaxed">
            A plain-language explanation of encryption, authentication,
            temporary storage, file security, screenshot detection,
            infrastructure visibility, and the limits of the security model.
          </p>
        </div>

        {/* Promise / boundary overview */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="rounded-2xl border border-[#22C55E]/15 bg-[#22C55E]/5 p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#22C55E]/10">
                <Check
                  className="h-5 w-5 text-[#22C55E]"
                  strokeWidth={2}
                  aria-hidden="true"
                />
              </div>

              <h2 className="text-base font-medium text-[#F8FAFC]">
                What we can promise
              </h2>
            </div>

            <ul className="mt-5 space-y-3">
              {PROMISES.map((item) => (
                <li
                  key={item}
                  className="flex gap-3"
                >
                  <Check
                    className="mt-0.5 h-4 w-4 shrink-0 text-[#22C55E]"
                    strokeWidth={2}
                    aria-hidden="true"
                  />

                  <span className="text-sm text-[#94A3B8] leading-relaxed">
                    {item}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-white/5 bg-[#111827]/60 p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5">
                <AlertTriangle
                  className="h-5 w-5 text-[#94A3B8]"
                  strokeWidth={1.8}
                  aria-hidden="true"
                />
              </div>

              <h2 className="text-base font-medium text-[#F8FAFC]">
                Where the boundary is
              </h2>
            </div>

            <ul className="mt-5 space-y-3">
              {BOUNDARIES.map((item) => (
                <li
                  key={item}
                  className="flex gap-3"
                >
                  <span
                    className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#94A3B8]"
                    aria-hidden="true"
                  />

                  <span className="text-sm text-[#94A3B8] leading-relaxed">
                    {item}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Interactive security sections */}
        <div className="mt-14">
          <div className="mb-5">
            <h2 className="text-xl sm:text-2xl font-semibold text-[#F8FAFC]">
              Security model
            </h2>

            <p className="mt-2 text-sm text-[#94A3B8]">
              Select a section to see how that part of GhostChat works.
            </p>
          </div>

          <div className="rounded-2xl border border-white/5 bg-[#0B0F14]/60 overflow-hidden">
            {SECURITY_SECTIONS.map((section) => (
              <SecurityItem
                key={section.id}
                section={section}
                isOpen={openSection === section.id}
                onToggle={() =>
                  toggleSection(section.id)
                }
              />
            ))}
          </div>
        </div>

        {/* Final note */}
        <div className="mt-12 rounded-2xl border border-[#7C3AED]/15 bg-[#7C3AED]/5 p-6">
          <h2 className="text-base font-medium text-[#F8FAFC]">
            The important distinction
          </h2>

          <p className="mt-3 text-sm text-[#94A3B8] leading-relaxed">
            GhostChat encrypts message, file, and voice content before the
            application server receives it, but that does not make the entire
            communication system invisible or immune to compromise. The room
            password is submitted to the server for authentication, and
            anyone who can see decrypted content can potentially capture it.
          </p>

          <p className="mt-3 text-sm text-[#94A3B8] leading-relaxed">
            The goal is a transparent security model: protect what the
            application can protect, minimize temporary data, and clearly
            disclose what remains outside the application&apos;s control.
          </p>
        </div>

        <p className="mt-8 text-xs text-[#94A3B8] leading-relaxed">
          This page describes the current GhostChat implementation. For the
          repository-level security documentation, see{' '}
          <a
            target="_blank"
            rel="noopener noreferrer"
            href="https://github.com/akshay-chanda/GhostChat/blob/main/SECURITY.md"
            className="underline decoration-white/20 hover:text-[#F8FAFC]"
          >
            SECURITY.md
          </a>
          .
        </p>
      </div>
    </section>
  );
}