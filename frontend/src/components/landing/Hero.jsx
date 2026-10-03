import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Clock3,
  LockKeyhole,
  ShieldCheck,
} from 'lucide-react';

/**
 * Hero
 *
 * Main landing-page introduction.
 * Responsive and interactive across desktop, tablet and mobile.
 */
export default function Hero() {
  const [activeFeature, setActiveFeature] = useState(null);

  const features = [
    {
      id: 'encryption',
      icon: LockKeyhole,
      title: 'Encrypted in browser',
      description:
        'Your messages are encrypted before they leave your browser.',
    },
    {
      id: 'duration',
      icon: Clock3,
      title: '5 min – 24 hours',
      description:
        'Choose how long your temporary room should exist.',
    },
    {
      id: 'account',
      icon: ShieldCheck,
      title: 'No account required',
      description:
        'Create or join a room without creating an account.',
    },
  ];

  return (
    <section
      className="
        group/hero
        relative
        flex
        min-h-screen
        items-center
        justify-center
        overflow-hidden
        px-4
        pb-16
        pt-20
        sm:px-6
        sm:pb-20
        sm:pt-28
      "
    >
      {/* Background grid */}
      <div
        aria-hidden="true"
        className="
          pointer-events-none
          absolute
          inset-0
          opacity-[0.022]
          transition-opacity
          duration-500
          group-hover/hero:opacity-[0.035]
        "
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)
          `,
          backgroundSize: '52px 52px',
        }}
      />

      {/* Main cyan glow */}
      <div
        aria-hidden="true"
        className="
          pointer-events-none
          absolute
          left-1/2
          top-1/2
          h-[320px]
          w-[500px]
          -translate-x-1/2
          -translate-y-1/2
          rounded-full
          opacity-15
          blur-3xl
          transition-all
          duration-700
          group-hover/hero:scale-110
          group-hover/hero:opacity-20
          sm:h-[420px]
          sm:w-[650px]
        "
        style={{
          background:
            'radial-gradient(circle, rgba(0,217,255,0.65) 0%, rgba(0,217,255,0.2) 38%, transparent 72%)',
        }}
      />

      {/* Secondary purple glow */}
      <div
        aria-hidden="true"
        className="
          pointer-events-none
          absolute
          left-1/2
          top-[54%]
          h-[220px]
          w-[340px]
          -translate-x-1/2
          rounded-full
          bg-[#7C3AED]/[0.06]
          blur-3xl
          transition-all
          duration-700
          group-hover/hero:scale-110
          sm:h-[260px]
          sm:w-[420px]
        "
      />

      {/* Subtle hero boundary */}
      <div
        aria-hidden="true"
        className="
          pointer-events-none
          absolute
          left-1/2
          top-1/2
          h-[460px]
          w-[min(900px,92vw)]
          -translate-x-1/2
          -translate-y-1/2
          rounded-[32px]
          border
          border-white/[0.018]
          transition-colors
          duration-500
          group-hover/hero:border-[#00D9FF]/[0.06]
          sm:h-[500px]
          sm:rounded-[40px]
        "
      />

      {/* Hero content */}
      <div
        className="
          relative
          z-10
          mx-auto
          flex
          w-full
          max-w-4xl
          -translate-y-1
          flex-col
          items-center
          text-center
          sm:-translate-y-5
        "
      >
        {/* Eyebrow */}
        <div
          className="
            mb-5
            inline-flex
            max-w-full
            items-center
            justify-center
            gap-1.5
            rounded-full
            border
            border-[#00D9FF]/20
            bg-[#00D9FF]/[0.045]
            px-3
            py-1.5
            transition-all
            duration-300
            hover:border-[#00D9FF]/40
            hover:bg-[#00D9FF]/[0.08]
            hover:shadow-[0_0_20px_rgba(0,217,255,0.08)]
            sm:mb-6
            sm:gap-2
            sm:px-3.5
          "
        >
          <span
            aria-hidden="true"
            className="
              h-1.5
              w-1.5
              shrink-0
              rounded-full
              bg-[#22C55E]
              shadow-[0_0_8px_rgba(34,197,94,0.7)]
            "
          />

          <span
            className="
              text-[8px]
              font-semibold
              uppercase
              tracking-[0.1em]
              text-[#7DDFF0]
              sm:text-xs
              sm:tracking-[0.16em]
            "
          >
            Private · Temporary · No account
          </span>
        </div>

        {/* Main heading */}
        <h1
          className="
            w-full
            max-w-4xl
            cursor-default
            text-[40px]
            font-semibold
            leading-[1.04]
            tracking-[-0.035em]
            text-[#F8FAFC]
            sm:text-6xl
            md:text-[68px]
            lg:text-[74px]
          "
        >
          <span className="block">Say it.</span>

          <span
            className="
              block
              whitespace-nowrap
              bg-gradient-to-r
              from-[#F8FAFC]
              via-[#BDF6FF]
              to-[#00D9FF]
              bg-clip-text
              text-transparent
              transition-all
              duration-500
            "
          >
            Then it's gone.
          </span>
        </h1>

        {/* Description */}
        <p
          className="
            mx-auto
            mt-5
            max-w-[345px]
            px-1
            text-[13.5px]
            leading-[1.55]
            text-[#94A3B8]
            sm:mt-7
            sm:max-w-2xl
            sm:px-0
            sm:text-lg
            sm:leading-8
          "
        >
          Create a temporary room, share the link, and talk privately.
          No account, no permanent chat history — everything disappears
          when the room expires.
        </p>

        {/* Main actions */}
        <div
          className="
            mt-7
            flex
            w-full
            max-w-[210px]
            flex-col
            items-center
            justify-center
            gap-2
            sm:mt-8
            sm:w-auto
            sm:max-w-none
            sm:flex-row
            sm:items-center
            sm:gap-3
          "
        >
          {/* Create room */}
          <Link
            to="/create"
            className="
              group/create
              flex
              min-h-10
              w-full
              items-center
              justify-center
              gap-1.5
              rounded-lg
              bg-[#00D9FF]
              px-3
              py-2
              text-[13px]
              font-semibold
              text-[#061016]
              shadow-[0_0_25px_rgba(0,217,255,0.12)]
              transition-all
              duration-200
              hover:-translate-y-1
              hover:bg-[#5CE7FF]
              hover:shadow-[0_0_35px_rgba(0,217,255,0.25)]
              active:translate-y-0
              active:scale-[0.98]
              focus:outline-none
              focus-visible:ring-2
              focus-visible:ring-[#00D9FF]
              focus-visible:ring-offset-2
              focus-visible:ring-offset-[#0B0F14]
              touch-manipulation
              sm:min-h-12
              sm:w-auto
              sm:rounded-xl
              sm:px-6
              sm:py-3
              sm:text-sm
            "
          >
            Create a room

            <ArrowRight
              className="
                h-4
                w-4
                transition-transform
                duration-200
                group-hover/create:translate-x-1
              "
              aria-hidden="true"
            />
          </Link>

          {/* Join room */}
          <Link
            to="/join"
            className="
              group/join
              flex
              min-h-10
              w-full
              items-center
              justify-center
              rounded-lg
              border
              border-white/10
              bg-white/[0.02]
              px-3
              py-2
              text-[13px]
              font-semibold
              text-[#F8FAFC]
              transition-all
              duration-200
              hover:-translate-y-1
              hover:border-[#00D9FF]/30
              hover:bg-[#00D9FF]/[0.04]
              active:translate-y-0
              active:scale-[0.98]
              focus:outline-none
              focus-visible:ring-2
              focus-visible:ring-[#00D9FF]
              touch-manipulation
              sm:min-h-12
              sm:w-auto
              sm:rounded-xl
              sm:px-6
              sm:py-3
              sm:text-sm
            "
          >
            Join with a room ID
          </Link>
        </div>

        {/* Feature cards */}
        <div
          className="
            mt-7
            grid
            w-full
            max-w-[350px]
            grid-cols-3
            gap-1.5
            sm:mt-9
            sm:max-w-xl
            sm:gap-2
          "
        >
          {features.map((feature) => {
            const Icon = feature.icon;
            const isActive = activeFeature === feature.id;

            return (
              <button
                key={feature.id}
                type="button"
                onClick={() =>
                  setActiveFeature((current) =>
                    current === feature.id ? null : feature.id
                  )
                }
                onMouseEnter={() => setActiveFeature(feature.id)}
                onMouseLeave={() => setActiveFeature(null)}
                className={`
                  group/feature
                  relative
                  flex
                  min-h-[70px]
                  w-full
                  flex-col
                  items-center
                  justify-center
                  gap-1.5
                  rounded-lg
                  border
                  px-1.5
                  py-2.5
                  text-center
                  transition-all
                  duration-200
                  touch-manipulation
                  focus:outline-none
                  focus-visible:ring-2
                  focus-visible:ring-[#00D9FF]
                  sm:min-h-11
                  sm:flex-row
                  sm:gap-2
                  sm:px-3
                  sm:py-2.5
                  ${
                    isActive
                      ? 'border-[#00D9FF]/25 bg-[#00D9FF]/[0.07] shadow-[0_0_20px_rgba(0,217,255,0.06)]'
                      : 'border-white/[0.055] bg-white/[0.018] hover:border-[#00D9FF]/20 hover:bg-[#00D9FF]/[0.035]'
                  }
                `}
                aria-expanded={isActive}
              >
                <Icon
                  className={`
                    h-4
                    w-4
                    shrink-0
                    transition-all
                    duration-200
                    ${
                      isActive
                        ? 'scale-110 text-[#5CE7FF]'
                        : 'text-[#00D9FF]'
                    }
                  `}
                  aria-hidden="true"
                />

                <span
                  className={`
                    max-w-[105px]
                    text-[9.5px]
                    font-medium
                    leading-[1.25]
                    transition-colors
                    duration-200
                    sm:max-w-none
                    sm:text-xs
                    sm:leading-normal
                    ${
                      isActive
                        ? 'text-[#F8FAFC]'
                        : 'text-[#94A3B8]'
                    }
                  `}
                >
                  {feature.title}
                </span>

                {/* Feature explanation */}
                {isActive && (
                  <span
                    className="
                      absolute
                      left-1/2
                      top-full
                      z-30
                      mt-2
                      w-[190px]
                      -translate-x-1/2
                      rounded-lg
                      border
                      border-white/10
                      bg-[#111827]
                      px-3
                      py-2.5
                      text-[11px]
                      leading-4
                      text-[#94A3B8]
                      shadow-xl
                      sm:w-[calc(100%+16px)]
                    "
                  >
                    {feature.description}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}