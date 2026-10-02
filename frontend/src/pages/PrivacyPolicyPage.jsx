import { useState } from 'react';
import {
  ShieldCheck,
  UserRoundX,
  LockKeyhole,
  Clock3,
  FileLock2,
  ServerOff,
  ChevronDown,
  Check,
  ArrowRight,
} from 'lucide-react';

const SECTIONS = [
  {
    id: 'collection',
    heading: 'What we intentionally don’t collect',
    icon: UserRoundX,
    summary: 'No account, email, phone number, or real name is required.',
    body: 'GhostChat does not require an account, email address, phone number, or real name. Creating or joining a room does not require you to provide any of these details.',
  },
  {
    id: 'sessions',
    heading: 'Temporary anonymous sessions',
    icon: ShieldCheck,
    summary: 'Your session credentials exist only in browser memory.',
    body: 'Creating or joining a room creates a temporary anonymous session. Session credentials are kept in browser memory and are not stored in cookies, localStorage, or sessionStorage. Refreshing the page ends the frontend session by design.',
  },
  {
    id: 'messages',
    heading: 'Messages and encryption',
    icon: LockKeyhole,
    summary: 'Messages are encrypted before they reach the server.',
    body: 'Messages are encrypted in your browser using AES-256-GCM before being sent to the application server. The room encryption key is derived from the room password in the browser. The server handles encrypted message data rather than plaintext message content.',
  },
  {
    id: 'passwords',
    heading: 'Room passwords',
    icon: LockKeyhole,
    summary: 'Passwords are protected with Argon2id verification data.',
    body: 'The room password is submitted to the server when creating or joining a room so the server can authenticate access. Password verification data is protected using Argon2id rather than storing the password as plaintext. A fully compromised server could potentially capture a submitted password and derive the room encryption key.',
  },
  {
    id: 'files',
    heading: 'Files',
    icon: FileLock2,
    summary: 'Files are encrypted before upload and remain temporary.',
    body: 'Files are encrypted in your browser before upload. The server stores the encrypted file data using a random server-side filename. Files are deleted when their associated room expires or is destroyed.',
  },
  {
    id: 'deletion',
    heading: 'Room lifetime and deletion',
    icon: Clock3,
    summary: 'Rooms and their temporary data disappear when the room ends.',
    body: 'Rooms have a user-selected expiration time. When a room expires or the owner destroys it, the application removes its participants, messages, room state, file metadata, and associated uploaded files.',
  },
  {
    id: 'visibility',
    heading: 'Who can see your messages',
    icon: ServerOff,
    summary: 'Participants can see content after it is decrypted.',
    body: 'The people participating in a room can see messages after their browsers decrypt them. Anyone who gains access to a participant’s device, browser, or browser extension may potentially access that content.',
  },
];

const AT_A_GLANCE = [
  'No accounts required',
  'No email or phone required',
  'Messages encrypted in the browser',
  'Files encrypted before upload',
  'Temporary rooms',
  'Session credentials not stored in browser storage',
];

function PrivacySection({ section, isOpen, onToggle }) {
  const Icon = section.icon;

  return (
    <article className="border-b border-white/5 last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={`${section.id}-content`}
        className="w-full flex items-center gap-4 py-5 text-left"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/5 bg-[#111827]">
          <Icon
            className="h-5 w-5 text-[#00D9FF]"
            strokeWidth={1.8}
            aria-hidden="true"
          />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block text-sm sm:text-base font-medium text-[#F8FAFC]">
            {section.heading}
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
          <p className="text-sm text-[#94A3B8] leading-relaxed">
            {section.body}
          </p>
        </div>
      )}
    </article>
  );
}

export default function PrivacyPolicyPage() {
  const [openSection, setOpenSection] = useState('collection');

  const toggleSection = (id) => {
    setOpenSection((current) => (current === id ? null : id));
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
              GhostChat Privacy
            </span>
          </div>

          <h1 className="mt-5 text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight text-[#F8FAFC]">
            Privacy, without the fine print
          </h1>

          <p className="mt-4 max-w-2xl text-sm sm:text-base text-[#94A3B8] leading-relaxed">
            GhostChat is designed for temporary, anonymous conversations.
            Here&apos;s what the application processes, what disappears, and
            what remains outside our control.
          </p>
        </div>

        {/* At a glance */}
        <div className="mt-12 rounded-2xl border border-white/5 bg-[#111827]/60 p-6 sm:p-7">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-medium text-[#F8FAFC]">
                Privacy at a glance
              </h2>

              <p className="mt-1 text-sm text-[#94A3B8]">
                The important parts, without reading the whole policy.
              </p>
            </div>

            <ShieldCheck
              className="h-6 w-6 shrink-0 text-[#22C55E]"
              strokeWidth={1.8}
              aria-hidden="true"
            />
          </div>

          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {AT_A_GLANCE.map((item) => (
              <div
                key={item}
                className="flex items-start gap-3 rounded-xl border border-white/5 bg-[#0B0F14] p-4"
              >
                <Check
                  className="mt-0.5 h-4 w-4 shrink-0 text-[#22C55E]"
                  strokeWidth={2}
                  aria-hidden="true"
                />

                <span className="text-sm text-[#F8FAFC]/90 leading-relaxed">
                  {item}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Data lifecycle */}
        <div className="mt-10">
          <div>
            <h2 className="text-xl sm:text-2xl font-semibold text-[#F8FAFC]">
              What happens to your data
            </h2>

            <p className="mt-2 text-sm text-[#94A3B8]">
              GhostChat is built around a temporary data lifecycle.
            </p>
          </div>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-3">
            {[
              {
                number: '01',
                title: 'Create or join',
                text: 'A temporary anonymous session is created.',
              },
              {
                number: '02',
                title: 'Encrypt',
                text: 'Messages and files are encrypted in your browser.',
              },
              {
                number: '03',
                title: 'Chat',
                text: 'The room remains active for its selected lifetime.',
              },
              {
                number: '04',
                title: 'Expire',
                text: 'Room state and associated files are deleted.',
              },
            ].map((step, index) => (
              <div
                key={step.number}
                className="relative rounded-2xl border border-white/5 bg-[#111827]/60 p-5"
              >
                <span className="text-xs font-semibold text-[#00D9FF]">
                  {step.number}
                </span>

                <h3 className="mt-3 text-sm font-medium text-[#F8FAFC]">
                  {step.title}
                </h3>

                <p className="mt-2 text-xs text-[#94A3B8] leading-relaxed">
                  {step.text}
                </p>

                {index < 3 && (
                  <ArrowRight
                    className="hidden md:block absolute -right-3 top-1/2 h-5 w-5 text-[#94A3B8] bg-[#0B0F14]"
                    aria-hidden="true"
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Interactive sections */}
        <div className="mt-14">
          <div className="mb-5">
            <h2 className="text-xl sm:text-2xl font-semibold text-[#F8FAFC]">
              Privacy details
            </h2>

            <p className="mt-2 text-sm text-[#94A3B8]">
              Open any section to see how that part of GhostChat works.
            </p>
          </div>

          <div className="rounded-2xl border border-white/5 bg-[#0B0F14]/60 overflow-hidden">
            {SECTIONS.map((section) => (
              <PrivacySection
                key={section.id}
                section={section}
                isOpen={openSection === section.id}
                onToggle={() => toggleSection(section.id)}
              />
            ))}
          </div>
        </div>

        {/* Infrastructure */}
        <div
          id="infrastructure"
          className="mt-10 rounded-2xl border border-white/5 bg-[#111827]/60 p-6 sm:p-7"
        >
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/5">
              <ServerOff
                className="h-5 w-5 text-[#94A3B8]"
                strokeWidth={1.8}
                aria-hidden="true"
              />
            </div>

            <div>
              <h2 className="text-lg font-medium text-[#F8FAFC]">
                Infrastructure and connection metadata
              </h2>

              <div className="mt-3 space-y-3">
                <p className="text-sm text-[#94A3B8] leading-relaxed">
                  GhostChat does not control every system involved in
                  delivering the service. Hosting providers, reverse proxies,
                  CDNs, TLS termination points, and monitoring systems may
                  process operational information.
                </p>

                <p className="text-sm text-[#94A3B8] leading-relaxed">
                  This can include connection-level information such as IP
                  addresses, timestamps, request information, or other
                  operational metadata depending on the provider.
                </p>

                <p className="text-sm text-[#94A3B8] leading-relaxed">
                  GhostChat&apos;s application logging is designed not to write
                  message content, room passwords, or derived encryption keys
                  to logs controlled by the application.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Limitations */}
        <div
          id="limitations"
          className="mt-6 rounded-2xl border border-[#7C3AED]/15 bg-[#7C3AED]/5 p-6 sm:p-7"
        >
          <h2 className="text-lg font-medium text-[#F8FAFC]">
            Important limitations
          </h2>

          <div className="mt-4 space-y-3">
            <p className="text-sm text-[#94A3B8] leading-relaxed">
              GhostChat does not claim to make messages unhackable, invisible,
              or impossible to capture.
            </p>

            <p className="text-sm text-[#94A3B8] leading-relaxed">
              Participants can screenshot, record, copy, photograph, or share
              information displayed on their devices. Browser extensions or
              compromised devices may also access messages after decryption.
            </p>

            <p className="text-sm text-[#94A3B8] leading-relaxed">
              GhostChat does not currently provide forward secrecy within a
              room&apos;s lifetime. Anyone who obtains the room password can
              derive the room encryption key while that room exists.
            </p>
          </div>
        </div>

        {/* Security Center CTA */}
        <div className="mt-10 flex flex-col sm:flex-row gap-3">
          <a
            href="/security"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#00D9FF]/20 bg-[#00D9FF]/5 px-5 py-3 text-sm font-medium text-[#00D9FF] transition-colors hover:bg-[#00D9FF]/10"
          >
            Explore Security Center
            <ArrowRight
              className="h-4 w-4"
              aria-hidden="true"
            />
          </a>

          <a
            href="/"
            className="inline-flex items-center justify-center rounded-lg border border-white/10 px-5 py-3 text-sm font-medium text-[#94A3B8] transition-colors hover:border-white/20 hover:text-[#F8FAFC]"
          >
            Back to GhostChat
          </a>
        </div>

        <p className="mt-8 text-xs text-[#94A3B8] leading-relaxed">
          This policy describes the current GhostChat implementation and its
          documented data-handling boundaries.
        </p>
      </div>
    </section>
  );
}