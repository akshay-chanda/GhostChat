import { forwardRef } from 'react';

const VARIANTS = {
  primary: 'bg-[#00D9FF] text-[#0B0F14] hover:bg-[#5CE7FF]',
  secondary: 'text-[#F8FAFC] border border-white/10 hover:border-white/25 bg-transparent',
  danger: 'bg-[#EF4444] text-[#F8FAFC] hover:bg-[#F87171]',
  ghost: 'text-[#94A3B8] hover:text-[#F8FAFC] bg-transparent',
};

const SIZES = {
  sm: 'text-xs px-3 py-1.5',
  md: 'text-sm px-4 py-2.5',
  lg: 'text-sm px-5 py-3',
};

/**
 * Button
 *
 * The shared button primitive — variant/size cover every case used
 * across CreateRoomForm, modals, and empty/error states, so new
 * screens should reach for this instead of hand-rolling button
 * classes again.
 */
const Button = forwardRef(function Button(
  { variant = 'primary', size = 'md', loading = false, disabled = false, fullWidth = false, children, className = '', ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
        VARIANTS[variant] || VARIANTS.primary
      } ${SIZES[size] || SIZES.md} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {loading && (
        <span className="h-3.5 w-3.5 rounded-full border-2 border-current/30 border-t-current animate-spin" />
      )}
      {children}
    </button>
  );
});

export default Button;
