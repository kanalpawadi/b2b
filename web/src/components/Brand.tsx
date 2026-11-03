import clsx from 'clsx';

export const BRAND = {
  name: 'Mukesh Sales Corporation',
  short: 'Mukesh Sales',
  tagline: 'Wholesale clothing, ordered by the pack.',
};

/** The MSC logo as supplied (cropped, background made transparent). */
export const MSC_LOGO = '/brand/msc-logo.png';

/**
 * The MSC mark. On dark surfaces it sits on a paper tile so its own
 * colours stay true. Size it with a height class; the width follows.
 */
export function Mark({ className, onDark }: { className?: string; onDark?: boolean }) {
  const img = <img src={MSC_LOGO} alt="" draggable={false} className={clsx('aspect-[416/432] w-auto max-w-none shrink-0 select-none', className ?? 'h-9')} />;
  if (!onDark) return img;
  return <span className="inline-flex shrink-0 rounded-xl bg-paper p-1">{img}</span>;
}

export function Wordmark({ className, light }: { className?: string; light?: boolean }) {
  return (
    <span className={clsx('flex items-center gap-2.5', className)} aria-label={BRAND.name}>
      <Mark onDark={light} className={light ? 'h-8' : 'h-10'} />
      <span className="leading-none">
        <span className={clsx('block font-display text-[19px] font-semibold tracking-tight', light ? 'text-paper' : 'text-ink')}>{BRAND.short}</span>
        <span className={clsx('mt-0.5 block text-[10px] font-semibold uppercase tracking-[0.2em]', light ? 'text-paper/60' : 'text-ink-mute')}>Corporation</span>
      </span>
    </span>
  );
}
