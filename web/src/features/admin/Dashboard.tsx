import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import clsx from 'clsx';
import { ArrowUpRight, Megaphone, Send, Trash2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { useAnnouncements, useDashboard, useDeleteAnnouncement, useNotifications, useOrders, usePostAnnouncement } from '../../lib/queries';
import { dateTime, num, relative } from '../../lib/format';
import { friendlyError } from '../../lib/supabase';
import { Button, Card, Input, OrderPill, PageHeader, Skeleton, TextArea } from '../../components/ui';
import { AlertIcon, alertLink } from '../notifications/Alerts';
import { ease, listChild, listParent, Page, Ticker } from '../../components/motion';
import { useMe } from '../auth/AuthProvider';
import type { DashboardStats } from '../../lib/types';

function Stat({ label, value, format, tone, to }: { label: string; value: number; format: (n: number) => string; tone?: 'dark' | 'accent'; to?: string }) {
  const body = (
    <motion.div variants={listChild} whileHover={to ? { y: -3 } : undefined} className={clsx(
      'relative h-full overflow-hidden rounded-[var(--radius-card)] border p-5',
      tone === 'dark' ? 'weave grain border-indigo text-paper' : tone === 'accent' ? 'border-marigold bg-marigold text-indigo' : 'border-line bg-card',
    )}>
      <p className={clsx('relative text-[11px] font-semibold tracking-[0.14em] uppercase', tone === 'dark' ? 'text-paper/60' : tone === 'accent' ? 'text-indigo/70' : 'text-ink-mute')}>{label}</p>
      <p className="relative mt-3 font-display text-[38px] leading-none font-medium"><Ticker value={value} format={format} /></p>
      {to && <ArrowUpRight className="absolute top-4 right-4 size-4 opacity-50" />}
    </motion.div>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

function DailyChart({ daily }: { daily: DashboardStats['daily'] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...daily.map((d) => d.pieces));
  const active = hover ?? daily.length - 1;
  const cur = daily[active];

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="label-caps">Last 14 days</p>
          <p className="mt-1 font-display text-2xl font-medium">Pieces ordered</p>
        </div>
        {cur && (
          <div className="text-right">
            <p className="tabular font-display text-2xl font-medium">{num(cur.pieces)} pcs</p>
            <p className="text-xs text-ink-mute">{new Date(cur.day).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })} · {cur.orders} orders</p>
          </div>
        )}
      </div>
      <div className="mt-6 flex h-44 items-end gap-1.5 sm:gap-2" onMouseLeave={() => setHover(null)}>
        {daily.map((d, i) => (
          <button key={d.day} className="group flex h-full flex-1 flex-col justify-end" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} aria-label={`${d.day}: ${d.pieces} pieces`}>
            <motion.div
              className={clsx('w-full rounded-t-md rounded-b-sm transition-colors', i === active ? 'bg-marigold' : 'bg-indigo/80 group-hover:bg-indigo')}
              initial={{ height: 0 }}
              animate={{ height: `${Math.max(3, (d.pieces / max) * 100)}%` }}
              transition={{ duration: 0.8, delay: i * 0.035, ease }}
            />
          </button>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-ink-mute">
        <span>{daily[0] && new Date(daily[0].day).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
        <span>Today</span>
      </div>
    </Card>
  );
}

export function Dashboard() {
  const me = useMe();
  const stats = useDashboard();
  const open = useOrders({ status: 'placed' });
  const s = stats.data;

  return (
    <Page>
      <PageHeader eyebrow={new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })} title={<>Namaste, <em className="text-indigo">{me.full_name.split(' ')[0]}</em></>} />

      {s && s.pending_admins > 0 && me.is_owner && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          <Link to="/admin/users?tab=pending" className="mb-6 flex items-center gap-3 rounded-2xl border border-marigold bg-marigold-100 p-4 text-sm font-semibold text-[#6d470c]">
            <UserPlus className="size-5" />
            {s.pending_admins} admin {s.pending_admins === 1 ? 'request is' : 'requests are'} waiting for your approval
            <ArrowUpRight className="ml-auto size-4" />
          </Link>
        </motion.div>
      )}

      {!s ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32" />)}</div>
      ) : (
        <motion.div variants={listParent} initial="hidden" animate="show" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Open orders" value={s.open_orders} format={num} tone="accent" to="/admin/orders" />
          <Stat label="Orders today" value={s.orders_today} format={num} />
          <Stat label="Packs this month" value={s.month_packs} format={num} tone="dark" />
          <Stat label="Active retailers" value={s.retailers} format={num} to="/admin/users" />
        </motion.div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <RecentAlerts />
        <RetailerUpdates />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        {s ? <DailyChart daily={s.daily} /> : <Skeleton className="h-72" />}

        <Card className="p-5 sm:p-6">
          <p className="label-caps">30 days</p>
          <p className="mt-1 font-display text-2xl font-medium">Best sellers</p>
          {!s?.top_products.length ? (
            <p className="mt-6 text-sm text-ink-mute">Your best-selling designs will rank here once orders come in.</p>
          ) : (
            <ol className="mt-5 space-y-4">
              {s.top_products.map((p, i) => {
                const pct = (p.pieces / s.top_products[0]!.pieces) * 100;
                return (
                  <li key={p.product_name + p.company_name}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate"><span className="mr-2 font-display text-ink-mute italic">{i + 1}</span><span className="font-semibold">{p.product_name}</span> <span className="text-ink-mute">· {p.company_name}</span></span>
                      <span className="tabular shrink-0 font-semibold">{num(p.packs)} packs <span className="font-normal text-ink-mute">· {num(p.pieces)} pcs</span></span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-paper-2">
                      <motion.div className="h-full rounded-full bg-indigo" initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.9, delay: 0.2 + i * 0.08, ease }} />
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </Card>
      </div>

      <Card className="mt-6 p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <p className="font-display text-2xl font-medium">Waiting to be packed</p>
          <Link to="/admin/orders" className="text-sm font-semibold text-indigo hover:underline">All orders →</Link>
        </div>
        {!open.data?.length ? (
          <p className="mt-4 text-sm text-ink-mute">No open orders. Nice and clear.</p>
        ) : (
          <ul className="mt-4 divide-y divide-line">
            {open.data.slice(0, 6).map((o) => (
              <li key={o.id}>
                <Link to={`/admin/orders/${o.id}`} className="flex items-center gap-3 py-3 text-sm hover:text-indigo">
                  <span className="tabular w-14 font-display font-semibold text-ink-mute">#{o.order_number}</span>
                  <span className="min-w-0 flex-1 truncate font-semibold">{o.shop_name ?? o.retailer_name}<span className="font-normal text-ink-mute"> · {relative(o.created_at)}</span></span>
                  <span className="tabular hidden font-semibold sm:block">{num(o.total_pieces)} pcs</span>
                  <OrderPill status={o.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </Page>
  );
}

/** Latest activity for this admin: catalogue changes, orders, sign-ups. */
function RecentAlerts() {
  const me = useMe();
  const list = useNotifications(me.id);
  const navigate = useNavigate();
  const rows = list.data?.slice(0, 7) ?? [];

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="label-caps">Alerts</p>
          <p className="mt-1 font-display text-2xl font-medium">Recent activity</p>
        </div>
        <Link to="/admin/alerts" className="text-sm font-semibold text-indigo hover:underline">All alerts →</Link>
      </div>
      {list.isPending ? (
        <div className="mt-4 space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : !rows.length ? (
        <p className="mt-4 text-sm text-ink-mute">New companies, products, orders and retailers will show up here.</p>
      ) : (
        <motion.ul variants={listParent} initial="hidden" animate="show" className="mt-3 divide-y divide-line">
          {rows.map((n) => {
            const to = alertLink(n, true);
            return (
              <motion.li key={n.id} variants={listChild}>
                <button disabled={!to} onClick={() => to && navigate(to)} className="flex w-full items-start gap-3 py-3 text-left disabled:cursor-default enabled:hover:text-indigo">
                  <AlertIcon kind={n.kind} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{n.title}</span>
                    <span className="block truncate text-sm text-ink-soft">{n.body}</span>
                  </span>
                  <span className="shrink-0 text-right text-xs text-ink-mute">
                    {dateTime(n.created_at)}
                    {!n.read_at && <span className="ml-1.5 inline-block size-2 rounded-full bg-marigold" />}
                  </span>
                </button>
              </motion.li>
            );
          })}
        </motion.ul>
      )}
    </Card>
  );
}

/** What retailers see on their home page, plus a way to post an update. */
function RetailerUpdates() {
  const list = useAnnouncements(5);
  const post = usePostAnnouncement();
  const del = useDeleteAnnouncement();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return toast.error('Give the update a headline');
    post.mutate({ title, body }, {
      onSuccess: () => { setTitle(''); setBody(''); toast.success('Posted to every retailer’s home page'); },
      onError: (err) => toast.error(friendlyError(err)),
    });
  };

  return (
    <Card className="p-5 sm:p-6">
      <p className="label-caps">Retailer home page</p>
      <p className="mt-1 font-display text-2xl font-medium">Updates</p>
      <form onSubmit={submit} className="mt-4 space-y-2">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} placeholder="Headline, e.g. Diwali dispatch schedule" className="h-11" />
        <TextArea value={body} onChange={(e) => setBody(e.target.value)} maxLength={1000} placeholder="Details (optional)" className="min-h-16" />
        <div className="flex justify-end"><Button type="submit" size="sm" loading={post.isPending} icon={<Send className="size-4" />}>Post update</Button></div>
      </form>
      <ul className="mt-4 divide-y divide-line border-t border-line">
        <AnimatePresence initial={false}>
          {list.data?.map((a) => (
            <motion.li key={a.id} layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} className="group flex items-start gap-3 py-3">
              <Megaphone className="mt-0.5 size-4 shrink-0 text-ink-mute" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{a.title}</span>
                <span className="block text-xs text-ink-mute">{a.kind === 'announcement' ? 'Posted' : 'Automatic'} · {dateTime(a.created_at)}</span>
              </span>
              <button onClick={() => del.mutate(a.id, { onError: (e) => toast.error(friendlyError(e)) })} aria-label="Remove update" title="Remove from retailers’ home page"
                className="grid size-8 shrink-0 place-items-center rounded-lg text-ink-mute opacity-0 transition group-hover:opacity-100 hover:bg-madder-100 hover:text-madder focus:opacity-100">
                <Trash2 className="size-4" />
              </button>
            </motion.li>
          ))}
        </AnimatePresence>
        {list.data?.length === 0 && <li className="py-3 text-sm text-ink-mute">Nothing posted yet.</li>}
      </ul>
    </Card>
  );
}
