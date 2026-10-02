import { Check, Minus } from 'lucide-react';

const GUARANTEES = [
  'Messages are encrypted in your browser before they reach the server',
  'Room passwords are protected with Argon2id and never stored in plain text',
  'Room state and messages live only for the room’s lifetime',
  'Files are encrypted in your browser before upload and deleted when the room ends',
  'Session credentials stay in browser memory — not cookies, localStorage, or sessionStorage',
];

const LIMITS = [
  'Your hosting and network provider may still see that a connection happened and retain connection metadata',
  'A screenshot or photo of the screen can’t be technically prevented',
  'Anyone you’re chatting with can still choose to save, copy, or share what they see',
  'A compromised device or browser extension may access messages after they are decrypted',
  'A fully compromised server could potentially capture the room password and derive the room encryption key',
];

/**
 * SecuritySection
 *
 * States the security model as two plain lists rather than a single
 * "100% secure" banner — the limitations get equal visual weight to
 * the guarantees, on purpose.
 */
export default function SecuritySection() {
  return (
    <section id="security" className="px-4 sm:px-6 py-20 border-t border-white/5">
      <div className="mx-auto max-w-6xl">
        <div className="max-w-lg">
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-[#F8FAFC]">
            What we can promise, and what we can&apos;t
          </h2>

          <p className="mt-3 text-[#94A3B8] leading-relaxed">
            Privacy tools should be honest about their limits. Here&apos;s the
            actual security model.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12">
          <div>
            <p className="text-sm font-medium text-[#22C55E]">
              Holds true
            </p>

            <ul className="mt-4 space-y-4">
              {GUARANTEES.map((item) => (
                <li key={item} className="flex gap-3">
                  <Check
                    className="h-4.5 w-4.5 shrink-0 mt-0.5 text-[#22C55E]"
                    strokeWidth={2}
                    aria-hidden="true"
                  />

                  <span className="text-sm text-[#F8FAFC]/90 leading-relaxed">
                    {item}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-sm font-medium text-[#94A3B8]">
              Out of our hands
            </p>

            <ul className="mt-4 space-y-4">
              {LIMITS.map((item) => (
                <li key={item} className="flex gap-3">
                  <Minus
                    className="h-4.5 w-4.5 shrink-0 mt-0.5 text-[#94A3B8]"
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
        </div>

        <p className="mt-10 text-xs text-[#94A3B8]">
          Explore the full{' '}
          <a
            href="/security"
            className="underline decoration-white/20 hover:text-[#F8FAFC] transition-colors"
          >
            Security Center
          </a>{' '}
          — threat model, encryption, authentication, file security, data
          lifecycle, and known limitations.
        </p>
      </div>
    </section>
  );
}