import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowLeft, ChevronRight, ClipboardList, Phone } from 'lucide-react';
import { toast } from 'sonner';
import clsx from 'clsx';
import { useOrder, useOrders, useSetOrderStatus } from '../../lib/queries';
import { friendlyError } from '../../lib/supabase';
import { dateTime, displayPhone, num, packSummary, relative } from '../../lib/format';
import type { Order, OrderStatus } from '../../lib/types';
import { Button, Card, Confirm, Empty, Field, Input, OrderPill, PageHeader, Segmented, Skeleton } from '../../components/ui';
import { listChild, listParent, Page } from '../../components/motion';
import { ProductImage } from '../catalogue/Swatch';
import { useMe } from '../auth/AuthProvider';
import { InvoiceButton } from './InvoiceButton';

type Filter = OrderStatus | 'all';

/** Shared by the retailer's "My orders" and the admin order board. */
export function OrderList({ admin }: { admin?: boolean }) {
  const [status, setStatus] = useState<Filter>(admin ? 'placed' : 'all');
  const [search, setSearch] = useState('');
  const orders = useOrders({ status, search: admin ? search : undefined });
  const base = admin ? '/admin/orders' : '/orders';

  return (
    <Page>
      <PageHeader eyebrow={admin ? 'Orders' : 'History'} title={admin ? <>Order <em className="text-indigo">board</em></> : <>My <em className="text-indigo">orders</em></>} />
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Segmented id={admin ? 'admin-orders' : 'orders'} value={status} onChange={setStatus} options={[
          ...(admin ? [] : [{ value: 'all' as Filter, label: 'All' }]),
          { value: 'placed', label: 'Open' },
          { value: 'completed', label: 'Completed' },
          { value: 'cancelled', label: 'Cancelled' },
          ...(admin ? [{ value: 'all' as Filter, label: 'All' }] : []),
        ]} />
        {admin && <Input className="h-10 max-w-xs rounded-full" placeholder="Shop, city or order no." value={search} onChange={(e) => setSearch(e.target.value)} />}
      </div>

      {orders.isPending ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : !orders.data?.length ? (
        <Empty icon={<ClipboardList className="size-7" />} title="No orders here" body={admin ? 'Orders appear the moment a retailer places one.' : 'When you place an order it will show up here.'} action={!admin && <Link to="/"><Button>Start an order</Button></Link>} />
      ) : (
        <motion.ul key={status} variants={listParent} initial="hidden" animate="show" className="space-y-2.5">
          {orders.data.map((o) => (
            <motion.li key={o.id} variants={listChild} layout>
              <OrderRow order={o} to={`${base}/${o.id}`} admin={admin} />
            </motion.li>
          ))}
        </motion.ul>
      )}
    </Page>
  );
}

function OrderRow({ order: o, to, admin }: { order: Order; to: string; admin?: boolean }) {
  return (
    <Link to={to} className="group flex items-center gap-4 rounded-2xl border border-line bg-card p-4 transition hover:border-line-strong hover:shadow-[var(--shadow-lift)]">
      <div className={clsx('grid size-12 shrink-0 place-items-center rounded-xl font-display text-[15px] font-semibold', o.status === 'placed' ? 'bg-marigold-100 text-[#8a5a10]' : 'bg-paper-2 text-ink-soft')}>
        #{String(o.order_number).slice(-3)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-semibold">{admin ? (o.shop_name ?? o.retailer_name) : `Order #${o.order_number}`}</p>
          <OrderPill status={o.status} />
        </div>
        <p className="mt-0.5 truncate text-sm text-ink-mute">
          {admin && o.city ? `${o.city} · ` : ''}<span className="sm:hidden">{num(o.total_pieces)} pcs · </span>{relative(o.created_at)}
        </p>
      </div>
      <p className="tabular hidden font-bold sm:block">{num(o.total_pieces)} pcs</p>
      <ChevronRight className="size-5 text-ink-mute transition group-hover:translate-x-0.5" />
    </Link>
  );
}

export function OrderDetail({ admin }: { admin?: boolean }) {
  const { id } = useParams();
  const me = useMe();
  const navigate = useNavigate();
  const order = useOrder(id);
  const setStatus = useSetOrderStatus();
  const [confirm, setConfirm] = useState<'completed' | 'cancelled' | null>(null);
  const [reason, setReason] = useState('');

  if (order.isPending) return <div className="space-y-4"><Skeleton className="h-10 w-48" /><Skeleton className="h-64" /></div>;
  if (!order.data) return <Empty icon={<ClipboardList className="size-7" />} title="Order not found" body="It may have been removed, or you don’t have access to it." />;

  const o = order.data;
  const canCancel = o.status === 'placed' && (admin || o.retailer_id === me.id);
  const run = () => {
    if (!confirm) return;
    setStatus.mutate({ id: o.id, status: confirm, reason }, {
      onSuccess: () => {
        toast.success(confirm === 'completed' ? `Order #${o.order_number} completed` : `Order #${o.order_number} cancelled`);
        setConfirm(null);
        setReason('');
      },
      onError: (e) => toast.error(friendlyError(e)),
    });
  };

  const steps = [
    { label: 'Placed', at: o.created_at, done: true },
    o.status === 'cancelled' ? { label: 'Cancelled', at: o.cancelled_at, done: true, bad: true } : { label: 'Completed', at: o.completed_at, done: o.status === 'completed' },
  ];

  return (
    <Page>
      <button onClick={() => navigate(-1)} className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-soft hover:text-ink">
        <ArrowLeft className="size-4" /> Back
      </button>
      <PageHeader eyebrow={dateTime(o.created_at)} title={<>Order <span className="text-indigo">#{o.order_number}</span></>}>
        <OrderPill status={o.status} />
        <InvoiceButton orderId={o.id} size="sm" />
      </PageHeader>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-3">
          {o.items.map((it, i) => (
            <motion.div key={it.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
              <Card className="flex gap-3 p-3 sm:gap-4 sm:p-4">
                <ProductImage path={it.image_path} name={it.product_name} className="h-20 w-16 shrink-0" rounded="rounded-xl" />
                <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-start sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="label-caps truncate">{it.company_name}</p>
                    <p className="line-clamp-2 font-display text-lg leading-snug font-medium break-words">{it.product_name}</p>
                    <p className="text-sm text-ink-mute">
                      {it.packs} × {it.composition.length === 1 ? `Size ${it.composition[0]!.size} · pack of ${it.pieces_per_pack}` : `${it.pack_label} (${packSummary(it.composition)})`}
                    </p>
                  </div>
                  <div className="flex items-baseline justify-between gap-2 sm:block sm:text-right">
                    <p className="tabular font-bold">{num(it.packs)} pack{it.packs === 1 ? '' : 's'}</p>
                    <p className="tabular text-xs text-ink-mute">{num(it.line_pieces)} pcs</p>
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>

        <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <Card className="p-5">
            <p className="label-caps">Total packs</p>
            <p className="tabular mt-1 font-display text-[34px] leading-none font-medium">{num(o.items.reduce((s, it) => s + it.packs, 0))}</p>
            <p className="mt-1.5 text-sm text-ink-mute">{num(o.total_pieces)} pieces · {num(o.items.length)} line{o.items.length === 1 ? '' : 's'}</p>
            <div className="stitch my-5" />
            <ol className="space-y-4">
              {steps.map((s, i) => (
                <li key={s.label} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.2 + i * 0.15, type: 'spring' }}
                      className={clsx('size-3 rounded-full', s.done ? ('bad' in s && s.bad ? 'bg-madder' : 'bg-leaf') : 'border-2 border-line-strong')} />
                    {i < steps.length - 1 && <span className="mt-1 w-px flex-1 bg-line-strong" />}
                  </div>
                  <div className="-mt-1 pb-1">
                    <p className="text-sm font-semibold">{s.label}</p>
                    <p className="text-xs text-ink-mute">{s.at ? dateTime(s.at) : 'Waiting'}</p>
                  </div>
                </li>
              ))}
            </ol>
            {o.cancel_reason && <p className="mt-4 rounded-xl bg-madder-100 p-3 text-sm text-madder">Reason: {o.cancel_reason}</p>}
            {o.note && <p className="mt-4 rounded-xl bg-paper-2 p-3 text-sm text-ink-soft"><span className="font-semibold">Note:</span> {o.note}</p>}
          </Card>

          {admin && (
            <Card className="p-5">
              <p className="label-caps mb-2">Retailer</p>
              <p className="font-display text-xl font-medium">{o.shop_name ?? o.retailer_name}</p>
              <p className="text-sm text-ink-soft">{o.retailer_name}{o.city ? ` · ${o.city}` : ''}</p>
              {o.retailer_phone && (
                <a href={`tel:+${o.retailer_phone.replace(/\D/g, '')}`} className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-indigo hover:underline">
                  <Phone className="size-4" /> {displayPhone(o.retailer_phone)}
                </a>
              )}
              {o.retailer_id && <Link to={`/admin/users/${o.retailer_id}`} className="mt-1 block text-sm font-semibold text-ink-soft hover:text-indigo">View retailer →</Link>}
            </Card>
          )}

          {o.status === 'placed' && (
            <div className="flex gap-2">
              {admin && <Button className="flex-1" variant="primary" onClick={() => setConfirm('completed')}>Mark completed</Button>}
              {canCancel && <Button className={admin ? '' : 'flex-1'} variant="outline" onClick={() => setConfirm('cancelled')}>Cancel order</Button>}
            </div>
          )}
        </div>
      </div>

      <Confirm
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={run}
        loading={setStatus.isPending}
        tone={confirm === 'completed' ? 'primary' : 'danger'}
        title={confirm === 'completed' ? 'Complete this order?' : 'Cancel this order?'}
        confirmLabel={confirm === 'completed' ? 'Complete order' : 'Cancel order'}
        body={confirm === 'completed' ? 'The retailer will be notified that the order is on its way. This can’t be undone.' : 'This can’t be undone. The other side will be notified.'}
      >
        {confirm === 'cancelled' && (
          <Field label="Reason (optional)" htmlFor="reason">
            <Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder={admin ? 'e.g. Design discontinued' : 'e.g. Ordered by mistake'} />
          </Field>
        )}
      </Confirm>
    </Page>
  );
}
