import { Link } from 'react-router-dom';
import { Clock } from 'lucide-react';

export default function RoomExpiredPage() {
  return (
    <section className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <div className="mx-auto flex items-center justify-center h-14 w-14 rounded-full bg-white/5">
          <Clock className="h-6 w-6 text-[#94A3B8]" aria-hidden="true" />
        </div>
        <h1 className="mt-5 text-2xl font-semibold text-[#F8FAFC]">This room has expired</h1>
        <p className="mt-2 text-sm text-[#94A3B8] leading-relaxed">
          All temporary room data — messages, files, and sessions — has been destroyed.
        </p>

        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            to="/create"
            className="text-sm font-medium bg-[#00D9FF] text-[#0B0F14] px-5 py-2.5 rounded-lg hover:bg-[#5CE7FF] transition-colors"
          >
            Create a new room
          </Link>
          <Link
            to="/"
            className="text-sm text-[#F8FAFC] border border-white/10 px-5 py-2.5 rounded-lg hover:border-white/25 transition-colors"
          >
            Back to home
          </Link>
        </div>
      </div>
    </section>
  );
}
