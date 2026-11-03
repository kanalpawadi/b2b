import { useId, useState, type KeyboardEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import clsx from 'clsx';
import { Plus, X } from 'lucide-react';

/**
 * Free multi-value input: type a value and press Enter or comma. Pasting
 * "S, M, L" adds three. Values are never limited to a list; `suggestions`
 * are only one-tap shortcuts.
 */
export function TagInput({ id, values, onChange, placeholder, suggestions = [], max = 30, maxLength = 40, invalid }: {
  id?: string; values: string[]; onChange: (v: string[]) => void; placeholder?: string; suggestions?: string[];
  max?: number; maxLength?: number; invalid?: boolean;
}) {
  const auto = useId();
  const [draft, setDraft] = useState('');
  const has = (v: string) => values.some((x) => x.toLowerCase() === v.toLowerCase());

  const add = (raw: string) => {
    const next = [...values];
    for (const part of raw.split(/[,\n]/)) {
      const v = part.trim().replace(/\s+/g, ' ').slice(0, maxLength);
      if (v && !next.some((x) => x.toLowerCase() === v.toLowerCase()) && next.length < max) next.push(v);
    }
    onChange(next);
    setDraft('');
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === 'Enter' || e.key === ',') && draft.trim()) {
      e.preventDefault();
      add(draft);
    } else if (e.key === 'Enter') {
      e.preventDefault();
    } else if (e.key === 'Backspace' && !draft && values.length) {
      onChange(values.slice(0, -1));
    }
  };

  const open = suggestions.filter((s) => !has(s));

  return (
    <div>
      <div className={clsx(
        'flex min-h-12 flex-wrap items-center gap-1.5 rounded-xl border bg-card px-2 py-1.5 transition focus-within:border-indigo focus-within:ring-4 focus-within:ring-indigo/10',
        invalid ? 'border-madder' : 'border-line',
      )}>
        <AnimatePresence initial={false}>
          {values.map((v) => (
            <motion.span key={v} layout initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
              className="inline-flex items-center gap-1 rounded-full bg-indigo-100 py-1 pr-1 pl-3 text-[13px] font-semibold text-indigo">
              {v}
              <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} aria-label={`Remove ${v}`} className="grid size-5 place-items-center rounded-full hover:bg-indigo hover:text-paper">
                <X className="size-3" />
              </button>
            </motion.span>
          ))}
        </AnimatePresence>
        <input
          id={id ?? auto}
          value={draft}
          onChange={(e) => (/[,\n]/.test(e.target.value) ? add(e.target.value) : setDraft(e.target.value))}
          onKeyDown={onKey}
          onBlur={() => draft.trim() && add(draft)}
          placeholder={values.length ? '' : placeholder}
          maxLength={maxLength}
          className="h-8 min-w-28 flex-1 bg-transparent px-1.5 text-[15px] focus:outline-none"
        />
        {draft.trim() && (
          <button type="button" onClick={() => add(draft)} aria-label="Add" className="grid size-8 place-items-center rounded-full bg-indigo text-paper">
            <Plus className="size-4" />
          </button>
        )}
      </div>
      {open.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {open.map((s) => (
            <button key={s} type="button" onClick={() => add(s)} className="rounded-full border border-dashed border-line-strong px-2.5 py-0.5 text-xs font-semibold text-ink-mute transition hover:border-indigo hover:text-indigo">
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
