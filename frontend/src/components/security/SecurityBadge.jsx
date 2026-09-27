import { useState } from 'react';
import { Lock } from 'lucide-react';
import SecurityModal from './SecurityModal';

/**
 * SecurityBadge
 *
 * Small persistent indicator in the chat header. Clicking it opens
 * SecurityModal, which is where the actual (carefully-worded) claims
 * live — this component is just the entry point.
 */
export default function SecurityBadge() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-[#94A3B8] hover:text-[#F8FAFC] hover:border-white/20 transition-colors"
      >
        <Lock className="h-3 w-3 text-[#22C55E]" aria-hidden="true" />
        Secure room
      </button>

      <SecurityModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
