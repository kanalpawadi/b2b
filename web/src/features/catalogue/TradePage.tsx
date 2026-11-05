import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import clsx from 'clsx';
import { PackageOpen, ShoppingBag } from 'lucide-react';
import { toast } from 'sonner';
import { useCompany, useProducts } from '../../lib/queries';
import { cart } from '../../lib/cart';
import { flyToCart } from '../../lib/fly';
import { num, packSummary } from '../../lib/format';
import type { Pack, ProductWithRefs } from '../../lib/types';
import { Button, Empty, Skeleton, Stepper } from '../../components/ui';
import { listChild, listParent, Page } from '../../components/motion';
import { Breadcrumbs } from '../../components/Breadcrumbs';
import { CompanyLogo } from '../../components/CompanyLogo';
import { ProductImage } from './Swatch';

/** Every live design in one company's trade, with ordering right on the page. */
export function TradePage() {
  const { companyId, tradeId } = useParams();
  const [params] = useSearchParams();
  const focus = params.get('product');
  const company = useCompany(companyId);
  const products = useProducts({ companyId, tradeId }, { enabled: Boolean(companyId && tradeId) });

  const list = products.data ?? [];
  const tradeName = list[0]?.trade?.name ?? 'Trade';
  const c = company.data;

  // Arriving from an update ("New from …") scrolls to that design.
  useEffect(() => {
    if (!focus || !list.length) return;
    const t = window.setTimeout(() => document.getElementById(`p-${focus}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 350);
    return () => window.clearTimeout(t);
  }, [focus, list.length]);

  if (company.isPending || products.isPending) {
    return <Page><Skeleton className="mb-6 h-9 w-64" /><Skeleton className="mb-6 h-12 w-80" /><Skeleton className="h-96" /></Page>;
  }

  const crumbs = [{ label: 'Home', to: '/' }, ...(c ? [{ label: c.name, to: `/companies/${c.id}` }] : []), { label: tradeName }];
  const back = c ? `/companies/${c.id}` : '/';

  if (!c || products.isError || !list.length) {
    return (
      <Page>
        <Breadcrumbs back={back} items={crumbs} />
        <Empty icon={<PackageOpen className="size-7" />}
          title={products.isError ? 'Couldn’t load this trade' : 'Nothing here right now'}
          body={products.isError ? 'Check your connection and try again.' : 'These designs are no longer available.'}
          action={products.isError ? <Button variant="outline" onClick={() => products.refetch()}>Retry</Button> : <Link to={back}><Button variant="outline">Back to {c?.name ?? 'companies'}</Button></Link>} />
      </Page>
    );
  }

  return (
    <Page>
      <Breadcrumbs back={back} items={crumbs} />
      <header className="mb-6 flex items-start justify-between gap-3 sm:mb-8 sm:items-end">
        <div className="min-w-0">
          <p className="label-caps truncate">{c.name}</p>
          <h1 className="mt-1 text-[28px] leading-tight font-medium break-words sm:text-[44px]">{tradeName}</h1>
          <p className="text-sm text-ink-mute">{list.length} design{list.length === 1 ? '' : 's'}</p>
        </div>
        <CompanyLogo path={c.logo_path} name={c.name} className="size-11 shrink-0 rounded-xl sm:size-14 sm:rounded-2xl" />
      </header>

      <motion.ul variants={listParent} initial="hidden" animate="show" className="space-y-6">
        {list.map((p) => (
          <motion.li key={p.id} id={`p-${p.id}`} variants={listChild} className="scroll-mt-24">
            <ProductPanel product={p} highlight={p.id === focus} />
          </motion.li>
        ))}
      </motion.ul>
    </Page>
  );
}

function ProductPanel({ product: p, highlight }: { product: ProductWithRefs; highlight?: boolean }) {
  const [imgIdx, setImgIdx] = useState(0);
  const [qty, setQty] = useState<Record<string, number>>({});
  const addRef = useRef<HTMLButtonElement>(null);

  const chosen = useMemo(() => p.packs.filter((k) => (qty[k.id] ?? 0) > 0), [p.packs, qty]);
  const packs = chosen.reduce((a, k) => a + qty[k.id]!, 0);
  const pieces = chosen.reduce((a, k) => a + qty[k.id]! * k.pieces, 0);
  // Packs made by the current admin form are one size each; older ones can mix sizes.
  const singleSize = p.packs.every((k) => k.composition.length === 1);

  const add = () => {
    if (!chosen.length) return;
    chosen.forEach((k: Pack) => cart.add({
      packId: k.id, productId: p.id, productName: p.name, companyName: p.company?.name ?? '', packLabel: singleSize ? `Size ${k.label}` : k.label,
      packSummary: packSummary(k.composition), piecesPerPack: k.pieces, imagePath: p.image_paths[0] ?? null,
    }, qty[k.id]!));
    flyToCart(addRef.current);
    toast.success(`${packs} pack${packs === 1 ? '' : 's'} added`, { description: `${p.name} · ${num(pieces)} pcs` });
    setQty({});
  };

  return (
    <article className={clsx('grid overflow-hidden rounded-[var(--radius-card)] border bg-card transition-shadow md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]', highlight ? 'border-marigold ring-4 ring-marigold/25' : 'border-line')}>
      <div className="p-3 sm:p-4">
        <AnimatePresence mode="wait">
          <motion.div key={imgIdx} initial={{ opacity: 0, scale: 1.02 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
            <ProductImage path={p.image_paths[imgIdx]} name={p.name} className="aspect-[4/3] w-full md:aspect-[4/5]" />
          </motion.div>
        </AnimatePresence>
        {p.image_paths.length > 1 && (
          <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto">
            {p.image_paths.map((path, i) => (
              <button key={path} onClick={() => setImgIdx(i)} aria-label={`Photo ${i + 1}`} className={clsx('shrink-0 rounded-xl ring-2 ring-offset-2 ring-offset-card transition', i === imgIdx ? 'ring-indigo' : 'ring-transparent opacity-70 hover:opacity-100')}>
                <ProductImage path={path} name={p.name} className="size-14" rounded="rounded-xl" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-col p-4 pt-1 sm:p-6 md:pl-2">
        <p className="label-caps">{p.trade?.name}{p.sku ? ` · Design #${p.sku}` : ''}</p>
        <h2 className="mt-1 text-[22px] leading-tight font-medium break-words sm:text-[26px]">{p.name}</h2>

        <dl className="mt-4 grid grid-cols-2 gap-2 sm:max-w-sm">
          <Fact label="Pack of" value={p.pack_of ? `${p.pack_of} pcs` : singleSize ? '—' : 'Varies'} strong />
          <Fact label="Sizes" value={`${p.sizes.length || p.packs.length}`} />
        </dl>

        {p.colours.length > 0 && (
          <div className="mt-5">
            <p className="label-caps mb-2">Colours</p>
            <ul className="flex flex-wrap gap-1.5">
              {p.colours.map((col) => <li key={col} className="rounded-full border border-line bg-paper px-3 py-1 text-[13px] font-semibold text-ink-soft">{col}</li>)}
            </ul>
          </div>
        )}

        {p.sizes.length > 0 && (
          <div className="mt-5">
            <p className="label-caps mb-2">Sizes</p>
            <ul className="flex flex-wrap gap-1.5">
              {p.sizes.map((s) => <li key={s} className="min-w-10 rounded-lg bg-indigo-100 px-2.5 py-1 text-center text-[13px] font-bold text-indigo">{s}</li>)}
            </ul>
          </div>
        )}

        {p.description && <p className="mt-5 text-[14.5px] leading-relaxed whitespace-pre-line text-ink-soft">{p.description}</p>}

        <div className="mt-6 border-t border-line pt-5">
          <p className="label-caps mb-3">{singleSize ? 'How many packs of each size?' : 'Choose packs'}</p>
          {p.packs.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-line-strong p-4 text-sm text-ink-mute">This design isn’t ready to order yet.</p>
          ) : (
            <ul className="divide-y divide-line rounded-2xl border border-line">
              {p.packs.map((k) => (
                <li key={k.id} className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{k.label}</span>
                    <span className="block text-xs text-ink-mute">{singleSize ? `Pack of ${k.pieces} pcs` : `${packSummary(k.composition)} · ${k.pieces} pcs`}</span>
                  </span>
                  <Stepper size="sm" value={qty[k.id] ?? 0} min={0} onChange={(n) => setQty({ ...qty, [k.id]: n })} />
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-mute">
              {packs ? <><b className="tabular text-ink">{num(packs)}</b> pack{packs === 1 ? '' : 's'} · <b className="tabular text-ink">{num(pieces)}</b> pcs</> : 'Set a quantity to add to your cart.'}
            </p>
            <Button ref={addRef} onClick={add} disabled={!packs} className="w-full sm:w-auto" icon={<ShoppingBag className="size-4" />}>Add to cart</Button>
          </div>
        </div>
      </div>
    </article>
  );
}

function Fact({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className="rounded-xl bg-paper-2/70 px-3 py-2.5">
      <dt className="text-[10.5px] font-semibold tracking-[0.12em] text-ink-mute uppercase">{label}</dt>
      <dd className={clsx('tabular mt-0.5', strong ? 'text-lg font-bold' : 'text-[15px] font-semibold')}>{value}</dd>
    </div>
  );
}
