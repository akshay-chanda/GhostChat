import { Inbox } from 'lucide-react';

/**
 * EmptyState
 *
 * Generic "nothing here yet" placeholder — distinct from ErrorState,
 * which is for something having gone wrong. Accepts a custom icon so
 * callers aren't stuck with the inbox glyph for every context.
 */
export default function EmptyState({ icon: Icon = Inbox, title, description, actionLabel, onAction }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-4">
      <div className="flex items-center justify-center h-12 w-12 rounded-full bg-white/5">
        <Icon className="h-5 w-5 text-[#94A3B8]" aria-hidden="true" />
      </div>
      {title && <h2 className="mt-4 text-base font-medium text-[#F8FAFC]">{title}</h2>}
      {description && <p className="mt-1.5 text-sm text-[#94A3B8] max-w-xs">{description}</p>}

      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-6 text-sm text-[#F8FAFC] border border-white/10 px-4 py-2 rounded-lg hover:border-white/25 transition-colors"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
