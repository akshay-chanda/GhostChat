/**
 * SystemMessage
 *
 * Centered, low-emphasis notice for room events (joins, leaves, lock
 * state changes). Intentionally styled to disappear into the
 * background relative to real messages — these are context, not
 * conversation.
 */
export default function SystemMessage({ content, timestamp }) {
  return (
    <div className="flex justify-center my-3">
      <span className="text-[11px] text-[#94A3B8]/70 bg-white/[0.03] rounded-full px-3 py-1">
        {content}
        {timestamp && (
          <>
            {' · '}
            {new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </>
        )}
      </span>
    </div>
  );
}
