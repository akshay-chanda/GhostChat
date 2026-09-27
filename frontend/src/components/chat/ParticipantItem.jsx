import { Crown, UserMinus } from 'lucide-react';

/**
 * ParticipantItem
 *
 * One row in the participant list. The remove action only renders
 * for the room owner looking at someone else — never shown for a
 * participant's own row, and never shown to non-owners at all.
 */
export default function ParticipantItem({ participant, isSelf, isOwner, canRemove, onRemove }) {
  return (
    <li className="group flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 hover:bg-white/[0.03]">
      <div className="flex items-center gap-2 min-w-0">
        <span className="h-2 w-2 rounded-full bg-[#22C55E] shrink-0" aria-hidden="true" />
        <span className="text-sm text-[#F8FAFC] truncate">
          {participant.anonymousName}
          {isSelf && <span className="text-[#94A3B8]"> (you)</span>}
        </span>
        {isOwner && (
          <Crown
            className="h-3.5 w-3.5 text-[#F59E0B] shrink-0"
            aria-label="Room creator"
            title="Room creator"
          />
        )}
      </div>

      {canRemove && (
        <button
          type="button"
          onClick={onRemove}
          title={`Remove ${participant.anonymousName}`}
          className="p-1 text-[#94A3B8] opacity-0 group-hover:opacity-100 hover:text-[#EF4444] transition-colors shrink-0"
        >
          <UserMinus className="h-3.5 w-3.5" />
        </button>
      )}
    </li>
  );
}
