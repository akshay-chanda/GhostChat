import { Link } from 'react-router-dom';
import { ShieldCheck, Github } from 'lucide-react';

/**
 * Footer
 *
 * Site-wide footer. Kept deliberately quiet and text-forward — the
 * one place the app states its data-retention position plainly,
 * without repeating marketing claims made in the hero.
 */
export default function Footer() {
  const year = new Date().getFullYear();

  const linkGroups = [
    {
      heading: 'Product',
      links: [
        { label: 'Create a room', to: '/create' },
        { label: 'Join a room', to: '/join' },
        { label: 'How it works', to: '/#how-it-works' },
      ],
    },
    {
      heading: 'Trust',
      links: [
        { label: 'Privacy policy', to: '/privacy' },
        { label: 'Security model', to: '/#security' },
        { label: 'Limitations', to: '/privacy#limitations' },
      ],
    },
  ];

  return (
    <footer className="border-t border-white/5 bg-[#0B0F14]">
      <div
        className="
          mx-auto
          w-full
          max-w-6xl
          px-4
          py-8
          xs:px-5 xs:py-10
          sm:px-6 sm:py-12
        "
      >
        <div
          className="
            flex
            flex-col
            gap-8
            md:flex-row
            md:items-start
            md:justify-between
            md:gap-10
          "
        >
          {/* Brand + statement */}
          <div className="w-full max-w-sm min-w-0">
            <div className="flex items-center gap-2">
              <ShieldCheck
                className="h-5 w-5 shrink-0 text-[#00D9FF]"
                strokeWidth={2}
                aria-hidden="true"
              />

              <span className="truncate text-[15px] font-semibold tracking-tight text-[#F8FAFC]">
                GhostChat
              </span>
            </div>

            <p
              className="
                mt-3
                max-w-sm
                break-words
                text-sm
                leading-relaxed
                text-[#94A3B8]
              "
            >
              Rooms are held in memory and expire on a timer. No accounts, no
              chat history, no message content in our logs.
            </p>
          </div>

          {/* Link groups */}
          <div
            className="
              grid
              w-full
              max-w-sm
              grid-cols-2
              gap-6
              xs:gap-10
              sm:gap-16
              md:w-auto
              md:max-w-none
            "
          >
            {linkGroups.map((group) => (
              <div key={group.heading} className="min-w-0">
                <p className="text-sm font-medium text-[#F8FAFC]">
                  {group.heading}
                </p>

                <ul className="mt-2.5 space-y-1 xs:mt-3 xs:space-y-2.5">
                  {group.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        to={link.to}
                        className="
                          inline-flex
                          min-h-9
                          max-w-full
                          items-center
                          py-1
                          text-sm
                          text-[#94A3B8]
                          transition-colors
                          hover:text-[#F8FAFC]
                          focus:outline-none
                          focus-visible:ring-2
                          focus-visible:ring-[#00D9FF]
                          focus-visible:ring-offset-2
                          focus-visible:ring-offset-[#0B0F14]
                          touch-manipulation
                        "
                      >
                        <span className="truncate">
                          {link.label}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom bar */}
        <div
          className="
            mt-8
            flex
            flex-col-reverse
            items-start
            gap-4
            border-t
            border-white/5
            pt-5
            sm:mt-12
            sm:flex-row
            sm:items-center
            sm:justify-between
            sm:pt-6
          "
        >
          <p
            className="
              max-w-2xl
              break-words
              text-xs
              leading-relaxed
              text-[#94A3B8]
            "
          >
            © {year} GhostChat. Infrastructure providers may still process
            connection-level data — see our{' '}
            <Link
              to="/privacy"
              className="
                underline
                decoration-white/20
                transition-colors
                hover:text-[#F8FAFC]
                focus:outline-none
                focus-visible:ring-2
                focus-visible:ring-[#00D9FF]
              "
            >
              privacy policy
            </Link>
            .
          </p>

          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            className="
              inline-flex
              min-h-9
              shrink-0
              items-center
              gap-1.5
              rounded-md
              py-1
              text-xs
              text-[#94A3B8]
              transition-colors
              hover:text-[#F8FAFC]
              focus:outline-none
              focus-visible:ring-2
              focus-visible:ring-[#00D9FF]
              touch-manipulation
            "
          >
            <Github
              className="h-3.5 w-3.5 shrink-0"
              aria-hidden="true"
            />
            <span>Source</span>
          </a>
        </div>
      </div>
    </footer>
  );
}