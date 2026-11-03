import { useState } from 'react';
import clsx from 'clsx';
import { logoUrl } from '../lib/supabase';
import { initials } from '../lib/format';

/**
 * A company's uploaded logo, contained on a card-coloured tile. Companies
 * made before logos existed (or a logo that fails to load) show initials.
 */
export function CompanyLogo({ path, name, className, src }: { path?: string | null; name: string; className?: string; src?: string | null }) {
  const [failed, setFailed] = useState(false);
  const url = src ?? logoUrl(path);

  return (
    <div className={clsx('relative grid place-items-center overflow-hidden rounded-2xl border border-line bg-card', className)}>
      {url && !failed ? (
        <img src={url} alt={`${name} logo`} loading="lazy" onError={() => setFailed(true)} className="size-full object-contain p-[12%]" />
      ) : (
        <span className="font-display text-[clamp(1.1rem,4vw,2rem)] font-medium text-indigo italic">{initials(name) || '?'}</span>
      )}
    </div>
  );
}
