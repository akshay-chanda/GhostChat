/**
 * TypingIndicator
 *
 * Renders "who's typing" text plus a small animated dot cluster.
 * Caps the named list at two people so a busy room doesn't produce
 * an unreadable run-on sentence.
 */
export default function TypingIndicator({ users = [] }) {
  if (users.length === 0) return null;

  const names = users.map((u) => u.anonymousName);
  let label;
  if (names.length === 1) {
    label = `${names[0]} is typing`;
  } else if (names.length === 2) {
    label = `${names[0]} and ${names[1]} are typing`;
  } else {
    label = `${names[0]}, ${names[1]} and ${names.length - 2} more are typing`;
  }

  return (
    <div className="flex items-center gap-2 px-1 py-2" aria-live="polite">
      <span className="flex gap-0.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-[#94A3B8] animate-bounce"
            style={{ animationDelay: `${i * 120}ms` }}
          />
        ))}
      </span>
      <span className="text-xs text-[#94A3B8]">{label}</span>
    </div>
  );
}
