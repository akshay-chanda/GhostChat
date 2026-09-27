import { Link } from 'react-router-dom';
import { Ghost } from 'lucide-react';

export default function NotFoundPage() {
  return (
    <section className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <div className="mx-auto flex items-center justify-center h-14 w-14 rounded-full bg-white/5">
          <Ghost className="h-6 w-6 text-[#94A3B8]" aria-hidden="true" />
        </div>
        <h1 className="mt-5 text-2xl font-semibold text-[#F8FAFC]">Nothing here</h1>
        <p className="mt-2 text-sm text-[#94A3B8]">
          This page doesn&apos;t exist, or whatever was here already expired.
        </p>

        <Link
          to="/"
          className="mt-8 inline-block text-sm font-medium bg-[#00D9FF] text-[#0B0F14] px-5 py-2.5 rounded-lg hover:bg-[#5CE7FF] transition-colors"
        >
          Back to home
        </Link>
      </div>
    </section>
  );
}
