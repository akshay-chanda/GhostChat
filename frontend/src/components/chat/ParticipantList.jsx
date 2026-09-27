import { Users } from 'lucide-react';
import ParticipantItem from './ParticipantItem';

/**
 * ParticipantList
 *
 * Sidebar showing who's currently in the room. Deliberately shows
 * only anonymous names and online state — no IP, device, or location
 * data ever reaches this component, per the room's presence model.
 */
export default function ParticipantList({
  participants = [],
  currentSessionId,
  roomOwnerId,
  maxParticipants,
  onRemoveParticipant,
}) {
  const isOwner = currentSessionId === roomOwnerId;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 px-4 py-3.5 border-b border-white/5">
        <Users className="h-4 w-4 text-[#94A3B8]" aria-hidden="true" />
        <span className="text-sm font-medium text-[#F8FAFC]">
          Online: {participants.length}
          {maxParticipants ? <span className="text-[#94A3B8]"> / {maxParticipants}</span> : null}
        </span>
      </div>

      <ul className="flex-1 min-h-0 overflow-y-auto px-2 py-2 space-y-0.5">
        {participants.map((p) => (
          <ParticipantItem
            key={p.id}
            participant={p}
            isSelf={p.id === currentSessionId}
            isOwner={p.id === roomOwnerId}
            canRemove={isOwner && p.id !== currentSessionId}
            onRemove={() => onRemoveParticipant?.(p.id)}
          />
        ))}
      </ul>
    </div>
  );
}
