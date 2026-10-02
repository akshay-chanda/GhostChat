import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ShieldCheck, Menu, X } from 'lucide-react';

/**
 * Navbar
 *
 * Top-level site navigation. Transparent over the hero, solidifies on scroll.
 * Hides "Create Room" / "Join Room" CTAs once the user is inside an active
 * chat room.
 */
export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  const inRoom = location.pathname.startsWith('/room/');

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);

    window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  // Close the mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const navLinks = [
    { label: 'How it works', href: '/#how-it-works' },
    { label: 'Security', href: '/#security' },
    { label: 'Privacy policy', href: '/privacy' },
  ];

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-200 ${
        scrolled
          ? 'border-b border-white/5 bg-[#0B0F14]/90 backdrop-blur-md'
          : 'bg-transparent'
      }`}
    >
      <nav
        className="
          mx-auto flex h-16 w-full max-w-6xl items-center justify-between
          px-3 xs:px-4 sm:px-6
          pt-[env(safe-area-inset-top)]
        "
      >
        {/* Brand */}
        <Link
          to="/"
          className="
            flex min-w-0 shrink-0 items-center gap-3
            rounded-md
            focus:outline-none focus-visible:ring-2
            focus-visible:ring-[#00D9FF]
          "
          aria-label="GhostChat home"
        >
          <ShieldCheck
            className="
              h-7 w-7 shrink-0 text-[#00D9FF]
              max-md:h-7 max-md:w-7
            "
            strokeWidth={2}
            aria-hidden="true"
          />

          <span
            className="
              truncate
              text-xl font-semibold tracking-tight
              text-[#F8FAFC]
            "
          >
            GhostChat
          </span>
        </Link>

        {!inRoom && (
          <>
            {/* Desktop links */}
            <div className="hidden items-center gap-6 md:flex lg:gap-8">
              {navLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="
                    whitespace-nowrap rounded-md px-1 py-2
                    text-sm text-[#94A3B8]
                    transition-colors
                    hover:text-[#F8FAFC]
                    focus:outline-none
                    focus-visible:ring-2
                    focus-visible:ring-[#00D9FF]
                  "
                >
                  {link.label}
                </a>
              ))}
            </div>

            {/* Desktop CTAs */}
            <div className="hidden items-center gap-2 sm:gap-3 md:flex">
              <Link
                to="/join"
                className="
                  whitespace-nowrap rounded-lg px-3 py-2
                  text-sm text-[#F8FAFC]
                  transition-colors
                  hover:text-[#00D9FF]
                  focus:outline-none
                  focus-visible:ring-2
                  focus-visible:ring-[#00D9FF]
                "
              >
                Join room
              </Link>

              <Link
                to="/create"
                className="
                  whitespace-nowrap rounded-lg
                  bg-[#00D9FF] px-4 py-2
                  text-sm font-medium text-[#0B0F14]
                  transition-colors
                  hover:bg-[#5CE7FF]
                  focus:outline-none
                  focus-visible:ring-2
                  focus-visible:ring-[#00D9FF]
                  focus-visible:ring-offset-2
                  focus-visible:ring-offset-[#0B0F14]
                "
              >
                Create room
              </Link>
            </div>

            {/* Mobile toggle */}
            <button
              type="button"
              onClick={() => setMobileOpen((value) => !value)}
              className="
                flex min-h-11 min-w-11 shrink-0 items-center justify-center
                rounded-lg
                text-[#F8FAFC]
                transition-colors
                hover:bg-white/5
                focus:outline-none
                focus-visible:ring-2
                focus-visible:ring-[#00D9FF]
                touch-manipulation
                md:hidden
              "
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileOpen}
              aria-controls="mobile-navigation"
            >
              {mobileOpen ? (
                <X className="h-6 w-6" aria-hidden="true" />
              ) : (
                <Menu className="h-6 w-6" aria-hidden="true" />
              )}
            </button>
          </>
        )}
      </nav>

      {/* Mobile menu panel */}
      {!inRoom && mobileOpen && (
        <div
          id="mobile-navigation"
          className="
            border-t border-white/5
            bg-[#0B0F14]/95
            backdrop-blur-md
            md:hidden
          "
        >
          <div
            className="
              mx-auto flex w-full max-w-6xl flex-col
              gap-1
              px-3 xs:px-4 sm:px-6
              py-3
              pb-[max(0.75rem,env(safe-area-inset-bottom))]
            "
          >
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="
                  flex min-h-11 items-center
                  rounded-lg px-3
                  text-sm text-[#94A3B8]
                  transition-colors
                  hover:bg-white/5 hover:text-[#F8FAFC]
                  focus:outline-none
                  focus-visible:ring-2
                  focus-visible:ring-[#00D9FF]
                  touch-manipulation
                "
              >
                {link.label}
              </a>
            ))}

            <div className="mt-2 grid grid-cols-1 gap-2 xs:grid-cols-2">
              <Link
                to="/join"
                className="
                  flex min-h-11 items-center justify-center
                  rounded-lg border border-white/10
                  px-4 py-2.5
                  text-center text-sm text-[#F8FAFC]
                  transition-colors
                  hover:border-white/20 hover:bg-white/5
                  focus:outline-none
                  focus-visible:ring-2
                  focus-visible:ring-[#00D9FF]
                  touch-manipulation
                "
              >
                Join room
              </Link>

              <Link
                to="/create"
                className="
                  flex min-h-11 items-center justify-center
                  rounded-lg
                  bg-[#00D9FF]
                  px-4 py-2.5
                  text-center text-sm font-medium text-[#0B0F14]
                  transition-colors
                  hover:bg-[#5CE7FF]
                  focus:outline-none
                  focus-visible:ring-2
                  focus-visible:ring-[#00D9FF]
                  focus-visible:ring-offset-2
                  focus-visible:ring-offset-[#0B0F14]
                  touch-manipulation
                "
              >
                Create room
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}