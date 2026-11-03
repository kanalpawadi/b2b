import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronRight } from 'lucide-react';

export interface Crumb {
  label: string;
  to?: string;
}

/** Back button plus the path so far (Home › Company › Trade). */
export function Breadcrumbs({ items, back }: { items: Crumb[]; back: string }) {
  const navigate = useNavigate();
  return (
    <nav aria-label="Breadcrumb" className="mb-5 flex min-w-0 items-center gap-2 text-sm">
      <button
        type="button"
        onClick={() => (window.history.state?.idx > 0 ? navigate(-1) : navigate(back))}
        aria-label="Back"
        className="grid size-9 shrink-0 place-items-center rounded-full border border-line bg-card text-ink-soft transition hover:border-indigo hover:text-indigo"
      >
        <ArrowLeft className="size-4" />
      </button>
      <ol className="no-scrollbar flex min-w-0 items-center gap-1 overflow-x-auto whitespace-nowrap">
        {items.map((c, i) => (
          <li key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="size-3.5 shrink-0 text-ink-mute" />}
            {c.to ? (
              <Link to={c.to} className="inline-block max-w-[42vw] truncate align-bottom font-semibold text-ink-soft hover:text-indigo sm:max-w-xs">{c.label}</Link>
            ) : (
              <span aria-current="page" className="inline-block max-w-[50vw] truncate align-bottom font-semibold text-ink sm:max-w-sm">{c.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
