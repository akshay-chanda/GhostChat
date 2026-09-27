const SIZES = {
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-2',
  lg: 'h-9 w-9 border-[3px]',
};

/**
 * LoadingSpinner
 *
 * Plain CSS spinner — no animation library needed for something
 * this simple. `label` is visually hidden but read by screen readers.
 */
export default function LoadingSpinner({ size = 'md', label = 'Loading' }) {
  return (
    <span role="status" className="inline-flex items-center justify-center">
      <span
        className={`${SIZES[size] || SIZES.md} rounded-full border-white/10 border-t-[#00D9FF] animate-spin`}
      />
      <span className="sr-only">{label}</span>
    </span>
  );
}
