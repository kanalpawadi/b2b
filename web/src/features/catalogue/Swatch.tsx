import { useState } from 'react';
import clsx from 'clsx';
import { imageUrl } from '../../lib/supabase';

const DYES = [
  ['#1e2a4a', '#2f4275'],
  ['#7a2e22', '#b4432e'],
  ['#2f5a43', '#3d7a55'],
  ['#8a5a10', '#e09a2c'],
  ['#4a3b5c', '#6b5885'],
];

/** Product photo, or a dyed-cloth swatch when there's no photo yet. */
export function ProductImage({ path, name, className, rounded = 'rounded-2xl' }: { path: string | null | undefined; name: string; className?: string; rounded?: string }) {
  const [failed, setFailed] = useState(false);
  const url = imageUrl(path);
  const [a, b] = DYES[[...name].reduce((h, c) => h + c.charCodeAt(0), 0) % DYES.length]!;

  if (url && !failed) {
    return (
      <div className={clsx('overflow-hidden bg-paper-2', rounded, className)}>
        <img src={url} alt={name} loading="lazy" onError={() => setFailed(true)} className="size-full object-cover" />
      </div>
    );
  }
  return (
    <div
      className={clsx('relative grid place-items-center overflow-hidden', rounded, className)}
      style={{
        backgroundColor: a,
        backgroundImage: `repeating-linear-gradient(45deg, ${b}55 0 3px, transparent 3px 11px), repeating-linear-gradient(-45deg, #00000022 0 3px, transparent 3px 11px)`,
      }}
      aria-label={name}
    >
      <span className="font-display text-[clamp(1.5rem,5vw,2.75rem)] font-medium text-white/85 italic">
        {name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('')}
      </span>
    </div>
  );
}
