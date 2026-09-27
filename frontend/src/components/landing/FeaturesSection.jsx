import { UserX, Timer, Lock, FileUp, EyeOff, Trash2 } from 'lucide-react';

const FEATURES = [
  {
    icon: UserX,
    title: 'No account, ever',
    description:
      "Pick a room password and go. There's no signup, no email, no username tied to anything you say.",
  },
  {
    icon: Timer,
    title: 'Rooms expire on a timer',
    description:
      'You choose 5 minutes to 24 hours when you create a room. When it hits zero, the room is gone — for everyone.',
  },
  {
    icon: Lock,
    title: 'Encrypted before it leaves your browser',
    description:
      'Messages are encrypted client-side with keys derived from your room password. The server relays ciphertext.',
  },
  {
    icon: FileUp,
    title: 'Files that clean up after themselves',
    description:
      'Share files up to 20MB. Every upload inherits the room\u2019s expiration and is deleted with it.',
  },
  {
    icon: EyeOff,
    title: 'Anonymous by default',
    description:
      'You\u2019re "Anonymous Fox" or similar for the life of the room — not a profile, not a persistent identity.',
  },
  {
    icon: Trash2,
    title: 'Nothing left to find',
    description:
      'Messages live in memory, not a database. Close the room and there\u2019s no history to subpoena or leak.',
  },
];

/**
 * FeaturesSection
 *
 * A grid, not a sequence — deliberately unnumbered, since these six
 * properties don't happen in order.
 */
export default function FeaturesSection() {
  return (
    <section id="how-it-works" className="px-4 sm:px-6 py-20">
      <div className="mx-auto max-w-6xl">
        <div className="max-w-lg">
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-[#F8FAFC]">
            Built to forget
          </h2>
          <p className="mt-3 text-[#94A3B8] leading-relaxed">
            Every design decision favors leaving less behind, not more.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-white/5 rounded-2xl overflow-hidden border border-white/5">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <div key={title} className="bg-[#0B0F14] p-6 sm:p-7">
              <Icon className="h-5 w-5 text-[#00D9FF]" strokeWidth={1.75} aria-hidden="true" />
              <h3 className="mt-4 text-[15px] font-medium text-[#F8FAFC]">{title}</h3>
              <p className="mt-2 text-sm text-[#94A3B8] leading-relaxed">{description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
