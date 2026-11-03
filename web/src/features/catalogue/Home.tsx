import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowRight, Building2, Megaphone, PackagePlus, Sparkles } from 'lucide-react';
import { useAnnouncements, useCompanies, useCompanyTrades } from '../../lib/queries';
import { dateTime, relative } from '../../lib/format';
import type { Announcement } from '../../lib/types';
import { Button, Empty, Skeleton } from '../../components/ui';
import { listChild, listParent, Page } from '../../components/motion';
import { BRAND, MSC_LOGO } from '../../components/Brand';
import { CompanyLogo } from '../../components/CompanyLogo';
import { useMe } from '../auth/AuthProvider';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

const SEEN_KEY = 'msc.updates-seen';

/** When this browser last looked at the updates, so newer ones get a "New" tag. */
function useLastSeen() {
  const [seen] = useState(() => {
    try {
      return localStorage.getItem(SEEN_KEY);
    } catch {
      return null;
    }
  });
  const markSeen = (iso: string) => {
    try {
      localStorage.setItem(SEEN_KEY, iso);
    } catch {
      /* storage blocked: everything just looks new */
    }
  };
  return { seen, markSeen };
}

export function announcementLink(a: Announcement): string | null {
  if (a.company_id && a.trade_id) return `/companies/${a.company_id}/trades/${a.trade_id}${a.product_id ? `?product=${a.product_id}` : ''}`;
  if (a.company_id) return `/companies/${a.company_id}`;
  return null;
}

export function RetailerHome() {
  const me = useMe();
  const companies = useCompanies();
  const trades = useCompanyTrades();

  const counts = useMemo(() => {
    const m = new Map<string, { trades: number; products: number }>();
    trades.data?.forEach((t) => {
      const c = m.get(t.company_id) ?? { trades: 0, products: 0 };
      m.set(t.company_id, { trades: c.trades + 1, products: c.products + t.product_count });
    });
    return m;
  }, [trades.data]);

  return (
    <Page>
      <section className="weave grain relative mb-8 overflow-hidden rounded-[26px] p-5 text-paper sm:p-8">
        <div className="relative flex items-center gap-4 sm:gap-6">
          <motion.div initial={{ scale: 0.85, rotate: -8, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 220, damping: 18, delay: 0.1 }}
            className="grid size-16 shrink-0 place-items-center rounded-2xl bg-paper p-1.5 shadow-[var(--shadow-pop)] sm:size-28 sm:rounded-[22px] sm:p-2.5">
            <img src={MSC_LOGO} alt={`${BRAND.name} logo`} className="h-full w-auto" />
          </motion.div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold tracking-[0.16em] text-paper/60 uppercase">{greeting()}, {me.full_name.split(' ')[0]}</p>
            <h1 className="mt-1.5 text-[26px] leading-[1.05] font-medium sm:text-[44px]">
              Pick a <em className="text-marigold">company</em> to start.
            </h1>
            <p className="mt-1.5 text-[12.5px] text-paper/70 sm:hidden">Innerwear &amp; nightwear · wholesale</p>
            <p className="mt-2 hidden max-w-lg text-sm text-paper/70 sm:block">{BRAND.name} · ladies’ &amp; gents’ innerwear and nightwear since 2000.</p>
          </div>
          <Link to="/about" className="hidden sm:block">
            <Button variant="accent" size="sm">About us <ArrowRight className="size-4" /></Button>
          </Link>
        </div>
      </section>

      <Updates />

      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <p className="label-caps">Companies</p>
          <h2 className="mt-1 text-[26px] leading-tight font-medium">Shop by <em className="text-indigo">brand</em></h2>
        </div>
        {companies.data && <p className="text-sm text-ink-mute">{companies.data.length} {companies.data.length === 1 ? 'company' : 'companies'}</p>}
      </div>

      {companies.isPending ? (
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => <div key={i} className="space-y-3"><Skeleton className="aspect-square rounded-2xl" /><Skeleton className="h-5 w-3/4" /></div>)}
        </div>
      ) : companies.isError ? (
        <Empty icon={<Building2 className="size-7" />} title="Couldn’t load companies" body="Check your connection and try again." action={<Button variant="outline" onClick={() => companies.refetch()}>Retry</Button>} />
      ) : !companies.data.length ? (
        <Empty icon={<Building2 className="size-7" />} title="No companies yet" body="Brands will appear here as soon as Mukesh Sales adds them." />
      ) : (
        <motion.ul variants={listParent} initial="hidden" animate="show" className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-5">
          {companies.data.map((c) => {
            const n = counts.get(c.id);
            return (
              <motion.li key={c.id} variants={listChild}>
                <Link to={`/companies/${c.id}`} className="group block">
                  <motion.div whileHover={{ y: -5 }} transition={{ type: 'spring', stiffness: 400, damping: 26 }}>
                    <CompanyLogo path={c.logo_path} name={c.name} className="aspect-square w-full shadow-[var(--shadow-lift)] transition-shadow group-hover:shadow-[var(--shadow-pop)]" />
                  </motion.div>
                  <p className="mt-3 line-clamp-2 font-display text-[17px] leading-snug font-medium break-words group-hover:text-indigo">{c.name}</p>
                  <p className="text-xs text-ink-mute">
                    {n ? `${n.trades} trade${n.trades === 1 ? '' : 's'} · ${n.products} design${n.products === 1 ? '' : 's'}` : 'Coming soon'}
                  </p>
                </Link>
              </motion.li>
            );
          })}
        </motion.ul>
      )}

      <Link to="/about" className="mt-12 block rounded-2xl border border-line bg-card p-5 text-sm transition hover:border-indigo sm:hidden">
        <span className="label-caps">About us</span>
        <span className="mt-1 flex items-center justify-between font-display text-lg font-medium">{BRAND.name} <ArrowRight className="size-4" /></span>
      </Link>
    </Page>
  );
}

const kindIcon = {
  company_added: <Building2 className="size-4" />,
  product_added: <PackagePlus className="size-4" />,
  announcement: <Megaphone className="size-4" />,
};

function Updates() {
  const list = useAnnouncements(6);
  const { seen, markSeen } = useLastSeen();
  const newest = list.data?.[0]?.created_at;

  useEffect(() => {
    if (newest) {
      const t = window.setTimeout(() => markSeen(newest), 3000);
      return () => window.clearTimeout(t);
    }
  }, [newest]);

  if (list.isPending) return <Skeleton className="mb-10 h-28" />;
  if (!list.data?.length) return null;

  return (
    <section className="mb-10" aria-labelledby="updates-h">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="size-4 text-marigold" />
        <h2 id="updates-h" className="label-caps">Latest updates</h2>
      </div>
      <motion.ul variants={listParent} initial="hidden" animate="show" className="no-scrollbar -mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:scroll-px-6 sm:px-6">
        {list.data.map((a) => {
          const fresh = !seen || a.created_at > seen;
          const to = announcementLink(a);
          const body = (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className={a.kind === 'announcement' ? 'grid size-8 place-items-center rounded-full bg-indigo text-paper' : 'grid size-8 place-items-center rounded-full bg-marigold-100 text-[#8a5a10]'}>
                  {kindIcon[a.kind]}
                </span>
                {fresh && <span className="rounded-full bg-madder px-2 py-0.5 text-[10px] font-bold tracking-wide text-white uppercase">New</span>}
              </div>
              <p className="mt-3 line-clamp-2 font-semibold leading-snug">{a.title}</p>
              {a.body && <p className="mt-1 line-clamp-2 text-sm text-ink-soft">{a.body}</p>}
              <p className="mt-auto pt-3 text-xs text-ink-mute" title={relative(a.created_at)}>{dateTime(a.created_at)}</p>
            </>
          );
          const cls = 'flex h-full w-[260px] flex-col rounded-2xl border border-line bg-card p-4 transition';
          return (
            <motion.li key={a.id} variants={listChild} className="shrink-0 snap-start">
              {to ? <Link to={to} className={`${cls} hover:border-indigo hover:shadow-[var(--shadow-lift)]`}>{body}</Link> : <div className={cls}>{body}</div>}
            </motion.li>
          );
        })}
      </motion.ul>
    </section>
  );
}
