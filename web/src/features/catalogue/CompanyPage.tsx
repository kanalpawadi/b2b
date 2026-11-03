import { useDeferredValue, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { Building2, PackageOpen, Search, X } from 'lucide-react';
import { useCompany, useCompanyTrades } from '../../lib/queries';
import { Button, Empty, Skeleton } from '../../components/ui';
import { listChild, listParent, Page } from '../../components/motion';
import { Breadcrumbs } from '../../components/Breadcrumbs';
import { CompanyLogo } from '../../components/CompanyLogo';
import { ProductImage } from './Swatch';

/** One company: its logo, name and the trades it has live designs in. */
export function CompanyPage() {
  const { companyId } = useParams();
  const company = useCompany(companyId);
  const trades = useCompanyTrades(companyId);
  const [search, setSearch] = useState('');
  const term = useDeferredValue(search).trim().toLowerCase();

  // Trade name first; a design name inside the trade also counts as a match.
  const rows = useMemo(() => {
    const all = trades.data ?? [];
    if (!term) return all;
    const byName = all.filter((t) => t.trade_name.toLowerCase().includes(term));
    const byDesign = all.filter((t) => !byName.includes(t) && t.search_text.toLowerCase().includes(term));
    return [...byName, ...byDesign];
  }, [trades.data, term]);

  if (company.isPending) {
    return <Page><Skeleton className="mb-6 h-9 w-48" /><Skeleton className="mb-8 h-28" /><Skeleton className="h-64" /></Page>;
  }
  const c = company.data;
  if (!c) {
    return (
      <Page>
        <Breadcrumbs back="/" items={[{ label: 'Home', to: '/' }, { label: 'Not found' }]} />
        <Empty icon={<Building2 className="size-7" />} title="This company isn’t available" body="It may have been removed from the catalogue." action={<Link to="/"><Button variant="outline">All companies</Button></Link>} />
      </Page>
    );
  }

  return (
    <Page>
      <Breadcrumbs back="/" items={[{ label: 'Home', to: '/' }, { label: c.name }]} />

      <header className="mb-6 flex items-center gap-5">
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 22 }}>
          <CompanyLogo path={c.logo_path} name={c.name} className="size-20 shrink-0 shadow-[var(--shadow-lift)] sm:size-28" />
        </motion.div>
        <div className="min-w-0">
          <p className="label-caps">Company</p>
          <h1 className="mt-1 text-[30px] leading-tight font-medium sm:text-[44px]">{c.name}</h1>
          {trades.data && <p className="text-sm text-ink-mute">{trades.data.length} trade{trades.data.length === 1 ? '' : 's'}</p>}
        </div>
      </header>

      <div className="sticky top-16 z-20 -mx-4 mb-6 bg-paper/90 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6">
        <label className="flex h-12 items-center gap-2.5 rounded-full border border-line bg-card px-4 transition focus-within:border-indigo focus-within:ring-4 focus-within:ring-indigo/10">
          <Search className="size-[18px] text-ink-mute" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${c.name}’s trades`} aria-label="Search trades" className="h-full w-full bg-transparent text-[15px] focus:outline-none" />
          {search && <button onClick={() => setSearch('')} aria-label="Clear search"><X className="size-4 text-ink-mute" /></button>}
        </label>
      </div>

      {trades.isPending ? (
        <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="space-y-3"><Skeleton className="aspect-[4/5] rounded-2xl" /><Skeleton className="h-5 w-2/3" /></div>)}
        </div>
      ) : trades.isError ? (
        <Empty icon={<PackageOpen className="size-7" />} title="Couldn’t load trades" body="Check your connection and try again." action={<Button variant="outline" onClick={() => trades.refetch()}>Retry</Button>} />
      ) : !trades.data.length ? (
        <Empty icon={<PackageOpen className="size-7" />} title="No trades available yet" body={`${c.name}’s designs will appear here as soon as they’re added.`} action={<Link to="/"><Button variant="outline">Other companies</Button></Link>} />
      ) : !rows.length ? (
        <Empty icon={<Search className="size-7" />} title="No trades found" body={`Nothing in ${c.name} matches “${search.trim()}”.`} action={<Button variant="outline" onClick={() => setSearch('')}>Clear search</Button>} />
      ) : (
        <motion.ul key={term} variants={listParent} initial="hidden" animate="show" className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 lg:grid-cols-4">
          {rows.map((t) => (
            <motion.li key={t.trade_id} variants={listChild}>
              <Link to={`/companies/${c.id}/trades/${t.trade_id}`} className="group block">
                <motion.div whileHover={{ y: -4 }} transition={{ type: 'spring', stiffness: 400, damping: 28 }} className="relative">
                  <ProductImage path={t.cover_image} name={t.trade_name} className="aspect-[4/5] w-full shadow-[var(--shadow-lift)] transition-shadow group-hover:shadow-[var(--shadow-pop)]" />
                  <span className="absolute top-3 left-3 rounded-full bg-card/95 px-2.5 py-1 text-[11px] font-bold text-ink">{t.product_count} design{t.product_count === 1 ? '' : 's'}</span>
                </motion.div>
                <h3 className="mt-3.5 px-0.5 font-display text-[19px] leading-snug font-medium group-hover:text-indigo">{t.trade_name}</h3>
              </Link>
            </motion.li>
          ))}
        </motion.ul>
      )}
    </Page>
  );
}
