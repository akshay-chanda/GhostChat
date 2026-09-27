import { Link } from 'react-router-dom';
import { ArrowRight, Radio } from 'lucide-react';

/**
 * Hero
 *
 * First thing a visitor sees. Leads with the core promise in plain
 * language, then a single live-feeling detail (the countdown) to make
 * "temporary" concrete rather than abstract marketing copy.
 */
export default function Hero() {
  return (
    <section className="relative pt-32 pb-24 px-4 sm:px-6 overflow-hidden">
      {/* Soft radial glow, not a full gradient wash */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 h-[480px] w-[720px] rounded-full opacity-20 blur-3xl"
        style={{ background: 'radial-gradient(circle, #00D9FF 0%, transparent 70%)' }}
      />

      <div className="relative mx-auto max-w-3xl text-center">
        <h1 className="text-4xl sm:text-6xl font-semibold tracking-tight text-[#F8FAFC] leading-[1.1]">
          Say it, then it's gone.
        </h1>
        <p className="mt-6 text-lg text-[#94A3B8] max-w-xl mx-auto leading-relaxed">
          Create a room, share a link, talk. No account, no saved history —
          the room and everything in it expires on a timer you set.
        </p>

        <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            to="/create"
            className="group flex items-center gap-2 text-sm font-medium bg-[#00D9FF] text-[#0B0F14] px-5 py-3 rounded-lg hover:bg-[#5CE7FF] transition-colors"
          >
            Create a room
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link
            to="/join"
            className="text-sm font-medium text-[#F8FAFC] border border-white/10 px-5 py-3 rounded-lg hover:border-white/25 transition-colors"
          >
            Join with a room ID
          </Link>
        </div>

        {/* One concrete, live-feeling artifact rather than another claim */}
        <div className="mt-14 inline-flex items-center gap-2.5 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2">
          <Radio className="h-3.5 w-3.5 text-[#22C55E]" aria-hidden="true" />
          <span className="text-xs text-[#94A3B8]">
            A room created now would expire in
          </span>
          <span className="text-xs font-mono text-[#F8FAFC]">29:59</span>
        </div>
      </div>
    </section>
  );
}
