import { useEffect } from 'react';
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from 'lucide-react';

const VARIANTS = {
  success: { Icon: CheckCircle2, color: '#22C55E' },
  error: { Icon: XCircle, color: '#EF4444' },
  warning: { Icon: AlertTriangle, color: '#F59E0B' },
  info: { Icon: Info, color: '#00D9FF' },
};

/**
 * Toast
 *
 * Renders a single toast. Expects a parent ToastContainer/context to
 * stack multiple instances and assign each a unique id/onDismiss —
 * this component only handles its own auto-dismiss timer and layout.
 */
export default function Toast({ message, variant = 'info', duration = 4000, onDismiss }) {
  const { Icon, color } = VARIANTS[variant] || VARIANTS.info;

  useEffect(() => {
    if (!duration) return;
    const timeout = setTimeout(onDismiss, duration);
    return () => clearTimeout(timeout);
  }, [duration, onDismiss]);

  return (
    <div
      role="status"
      className="flex items-center gap-2.5 rounded-lg border border-white/10 bg-[#111827] px-4 py-3 shadow-lg max-w-sm"
    >
      <Icon className="h-4 w-4 shrink-0" style={{ color }} aria-hidden="true" />
      <p className="text-sm text-[#F8FAFC] flex-1">{message}</p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="p-0.5 text-[#94A3B8] hover:text-[#F8FAFC] transition-colors shrink-0"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
