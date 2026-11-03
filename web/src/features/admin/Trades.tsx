import { useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useTradeMutations, useTrades } from '../../lib/queries';
import { friendlyError } from '../../lib/supabase';
import { Card, PageHeader, Skeleton } from '../../components/ui';
import { Breadcrumbs } from '../../components/Breadcrumbs';
import { Page } from '../../components/motion';

interface Row { id: string; name: string }

function MasterList({ title, hint, rows, loading, onAdd, onRename, onRemove, upper }: {
  title: string; hint: string; rows: Row[] | undefined; loading: boolean; upper?: boolean;
  onAdd: (v: string) => Promise<unknown>; onRename: (id: string, v: string) => Promise<unknown>; onRemove: (id: string) => Promise<unknown>;
}) {
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const wrap = async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn();
      if (ok) toast.success(ok);
      return true;
    } catch (e) {
      toast.error(friendlyError(e));
      return false;
    }
  };

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const v = draft.trim();
    if (!v) return;
    if (await wrap(() => onAdd(v))) setDraft('');
  };

  return (
    <Card className="flex flex-col p-5">
      <h2 className="text-2xl font-medium">{title}</h2>
      <p className="mt-1 text-sm text-ink-mute">{hint}</p>
      <form onSubmit={add} className="mt-4 flex gap-2">
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={`Add ${title.toLowerCase().replace(/s$/, '')}`} maxLength={upper ? 12 : 80}
          className={`h-11 min-w-0 flex-1 rounded-xl border border-line bg-paper px-3.5 text-[15px] focus:border-indigo focus:outline-none ${upper ? 'uppercase' : ''}`} />
        <button type="submit" aria-label="Add" className="grid size-11 shrink-0 place-items-center rounded-xl bg-indigo text-paper transition hover:bg-indigo-700 disabled:opacity-40" disabled={!draft.trim()}>
          <Plus className="size-5" />
        </button>
      </form>
      <ul className="mt-4 flex-1 divide-y divide-line">
        {loading && Array.from({ length: 3 }).map((_, i) => <li key={i} className="py-2"><Skeleton className="h-8" /></li>)}
        {!loading && !rows?.length && <li className="py-6 text-center text-sm text-ink-mute">None yet.</li>}
        <AnimatePresence initial={false}>
          {rows?.map((r) => (
            <motion.li key={r.id} layout initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, height: 0 }} className="group flex items-center gap-2 py-2">
              {editing === r.id ? (
                <form className="flex flex-1 gap-1" onSubmit={async (e) => { e.preventDefault(); if (await wrap(() => onRename(r.id, editValue.trim()))) setEditing(null); }}>
                  <input autoFocus value={editValue} onChange={(e) => setEditValue(e.target.value)} className="h-9 min-w-0 flex-1 rounded-lg border border-indigo bg-card px-2.5 text-sm focus:outline-none" />
                  <button type="submit" aria-label="Save" className="grid size-9 place-items-center rounded-lg text-leaf hover:bg-leaf-100"><Check className="size-4" /></button>
                  <button type="button" aria-label="Cancel" onClick={() => setEditing(null)} className="grid size-9 place-items-center rounded-lg text-ink-mute hover:bg-paper-2"><X className="size-4" /></button>
                </form>
              ) : (
                <>
                  <span className="flex-1 truncate font-semibold">{r.name}</span>
                  <button aria-label={`Rename ${r.name}`} onClick={() => { setEditing(r.id); setEditValue(r.name); }} className="grid size-9 place-items-center rounded-lg text-ink-mute opacity-0 transition group-hover:opacity-100 hover:bg-paper-2 focus:opacity-100"><Pencil className="size-4" /></button>
                  <button aria-label={`Delete ${r.name}`} onClick={() => wrap(() => onRemove(r.id), `${r.name} removed`)} className="grid size-9 place-items-center rounded-lg text-ink-mute opacity-0 transition group-hover:opacity-100 hover:bg-madder-100 hover:text-madder focus:opacity-100"><Trash2 className="size-4" /></button>
                </>
              )}
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </Card>
  );
}

/** Trades are shared by every company; products pick one (or create one) when saved. */
export function Trades() {
  const trades = useTrades();
  const tr = useTradeMutations();

  return (
    <Page>
      <Breadcrumbs back="/admin/companies" items={[{ label: 'Companies', to: '/admin/companies' }, { label: 'Trades' }]} />
      <PageHeader eyebrow="Set-up" title={<>Trades</>} />
      <div className="max-w-xl">
        <MasterList title="Trades" hint="Sections like Kurtis or Shirts. A trade that products still use can’t be deleted." rows={trades.data} loading={trades.isPending}
          onAdd={(v) => tr.create.mutateAsync(v)} onRename={(id, name) => tr.rename.mutateAsync({ id, name })} onRemove={(id) => tr.remove.mutateAsync(id)} />
      </div>
    </Page>
  );
}
