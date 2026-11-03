import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowLeft, Ban, Check, ChevronRight, Phone, ShieldCheck, Users as UsersIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useDirectory, useDirectoryEntry, useOrders, useSetAccountStatus } from '../../lib/queries';
import { friendlyError } from '../../lib/supabase';
import { dateOnly, displayPhone, money, moneyShort, num, relative } from '../../lib/format';
import type { DirectoryEntry } from '../../lib/types';
import { AccountPill, Avatar, Button, Card, Confirm, Empty, Input, OrderPill, PageHeader, Segmented, Skeleton } from '../../components/ui';
import { listChild, listParent, Page } from '../../components/motion';
import { useMe } from '../auth/AuthProvider';

type Tab = 'retailers' | 'admins' | 'pending';

export function Users() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'retailers';
  const [search, setSearch] = useState('');
  const dir = useDirectory();

  const pending = dir.data?.filter((u) => u.role === 'admin' && u.status === 'pending') ?? [];
  const term = search.trim().toLowerCase();
  const rows = (dir.data ?? [])
    .filter((u) => (tab === 'retailers' ? u.role === 'retailer' : tab === 'admins' ? u.role === 'admin' && u.status !== 'pending' : u.role === 'admin' && u.status === 'pending'))
    .filter((u) => !term || [u.full_name, u.shop_name, u.city, u.phone, u.email].some((v) => v?.toLowerCase().includes(term)));

  return (
    <Page>
      <PageHeader eyebrow="People" title={<>Retailers <em className="text-indigo">&amp;</em> staff</>} />
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Segmented id="users" value={tab} onChange={(t) => setParams({ tab: t })} options={[
          { value: 'retailers', label: 'Retailers' },
          { value: 'admins', label: 'Admins' },
          { value: 'pending', label: <>Requests{pending.length > 0 && <span className="ml-1.5 rounded-full bg-marigold px-1.5 text-[11px] text-indigo">{pending.length}</span>}</> },
        ]} />
        <Input className="h-10 max-w-xs rounded-full" placeholder="Name, shop, city, phone or email" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {dir.isPending ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : !rows.length ? (
        <Empty icon={<UsersIcon className="size-7" />} title={tab === 'pending' ? 'No requests' : 'Nobody here yet'} body={tab === 'retailers' ? 'Retailers appear here once they register and verify their number.' : tab === 'pending' ? 'New admin requests will wait here for the owner.' : 'Only you so far.'} />
      ) : (
        <motion.ul key={tab} variants={listParent} initial="hidden" animate="show" className="space-y-2">
          {rows.map((u) => (
            <motion.li key={u.id} variants={listChild}>
              <UserRow u={u} />
            </motion.li>
          ))}
        </motion.ul>
      )}
    </Page>
  );
}

function UserRow({ u }: { u: DirectoryEntry }) {
  return (
    <Link to={`/admin/users/${u.id}`} className="group flex items-center gap-4 rounded-2xl border border-line bg-card p-4 transition hover:border-line-strong hover:shadow-[var(--shadow-lift)]">
      <Avatar name={u.shop_name ?? u.full_name} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-semibold">{u.shop_name ?? u.full_name}</p>
          {u.status !== 'active' && <AccountPill status={u.status} />}
          {u.is_owner && <span className="rounded-full bg-indigo px-2 py-0.5 text-[10.5px] font-bold text-paper">Owner</span>}
        </div>
        <p className="truncate text-sm text-ink-mute">{u.shop_name ? `${u.full_name} · ` : ''}{u.city ?? u.email ?? displayPhone(u.phone)}</p>
      </div>
      {u.role === 'retailer' && (
        <div className="hidden text-right sm:block">
          <p className="tabular font-bold">{moneyShort(Number(u.lifetime_value))}</p>
          <p className="text-xs text-ink-mute">{u.order_count} orders{u.last_order_at ? ` · ${relative(u.last_order_at)}` : ''}</p>
        </div>
      )}
      <ChevronRight className="size-5 text-ink-mute transition group-hover:translate-x-0.5" />
    </Link>
  );
}

export function UserDetail() {
  const { id } = useParams();
  const me = useMe();
  const navigate = useNavigate();
  const user = useDirectoryEntry(id);
  const orders = useOrders({ retailerId: id, status: 'all' });
  const setStatus = useSetAccountStatus();
  const [confirm, setConfirm] = useState<'block' | 'unblock' | 'approve' | null>(null);

  if (user.isPending) return <Skeleton className="h-64" />;
  if (!user.data) return <Empty icon={<UsersIcon className="size-7" />} title="Not found" body="This account may have been deleted." />;
  const u = user.data;

  const canManage = u.id !== me.id && !u.is_owner && (u.role === 'retailer' || me.is_owner);
  const run = () => {
    if (!confirm) return;
    setStatus.mutate({ id: u.id, status: confirm === 'block' ? 'blocked' : 'active' }, {
      onSuccess: () => {
        toast.success(confirm === 'approve' ? `${u.full_name} is now an admin` : confirm === 'block' ? 'Account paused' : 'Account restored');
        setConfirm(null);
        user.refetch();
      },
      onError: (e) => toast.error(friendlyError(e)),
    });
  };

  return (
    <Page>
      <button onClick={() => navigate(-1)} className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-soft hover:text-ink"><ArrowLeft className="size-4" /> Back</button>
      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <Card className="h-fit p-6">
          <Avatar name={u.shop_name ?? u.full_name} className="size-16 text-xl" />
          <h1 className="mt-4 text-[28px] leading-tight font-medium">{u.shop_name ?? u.full_name}</h1>
          <p className="text-sm text-ink-soft">{u.shop_name ? u.full_name : u.role === 'admin' ? (u.is_owner ? 'Owner' : 'Admin') : 'Retailer'}</p>
          <div className="mt-3"><AccountPill status={u.status} /></div>
          <div className="stitch my-5" />
          <dl className="space-y-2.5 text-sm">
            {u.email && <Row k="Email" v={<a className="font-semibold text-indigo hover:underline" href={`mailto:${u.email}`}>{u.email}</a>} />}
            <Row k="Mobile" v={u.phone ? <a className="font-semibold text-indigo hover:underline" href={`tel:+${u.phone.replace(/\D/g, '')}`}><Phone className="mr-1 inline size-3.5" />{displayPhone(u.phone)}</a> : '—'} />
            {u.gst_number && <Row k="GSTIN" v={<span className="font-mono text-[13px]">{u.gst_number}</span>} />}
            {(u.area || u.city || u.state) && <Row k="Location" v={[u.area, u.city, u.state].filter(Boolean).join(', ')} />}
            <Row k="Joined" v={dateOnly(u.created_at)} />
            {u.role === 'retailer' && <Row k="Business" v={`${money(Number(u.lifetime_value))} · ${u.order_count} orders`} />}
          </dl>
          {canManage && (
            <div className="mt-6 flex gap-2">
              {u.status === 'pending' && <Button className="flex-1" icon={<ShieldCheck className="size-4" />} onClick={() => setConfirm('approve')}>Approve admin</Button>}
              {u.status === 'active' && <Button variant="outline" className="flex-1 hover:!border-madder hover:!text-madder" icon={<Ban className="size-4" />} onClick={() => setConfirm('block')}>Pause account</Button>}
              {u.status === 'blocked' && <Button className="flex-1" icon={<Check className="size-4" />} onClick={() => setConfirm('unblock')}>Restore account</Button>}
              {u.status === 'pending' && <Button variant="ghost" onClick={() => setConfirm('block')}>Decline</Button>}
            </div>
          )}
        </Card>

        {u.role === 'retailer' && (
          <div>
            <h2 className="mb-4 text-2xl font-medium">Order history</h2>
            {!orders.data?.length ? (
              <p className="rounded-2xl border border-dashed border-line-strong p-6 text-center text-sm text-ink-mute">No orders yet.</p>
            ) : (
              <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-card">
                {orders.data.map((o) => (
                  <li key={o.id}>
                    <Link to={`/admin/orders/${o.id}`} className="flex items-center gap-3 p-4 text-sm transition hover:bg-paper/60">
                      <span className="tabular w-14 font-display font-semibold text-ink-mute">#{o.order_number}</span>
                      <span className="flex-1 text-ink-soft">{dateOnly(o.created_at)} · {num(o.total_pieces)} pcs</span>
                      <span className="tabular font-semibold">{money(o.total_amount)}</span>
                      <OrderPill status={o.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <Confirm open={!!confirm} onClose={() => setConfirm(null)} onConfirm={run} loading={setStatus.isPending}
        tone={confirm === 'block' ? 'danger' : 'primary'}
        title={confirm === 'approve' ? 'Give admin access?' : confirm === 'block' ? (u.status === 'pending' ? 'Decline this request?' : 'Pause this account?') : 'Restore this account?'}
        confirmLabel={confirm === 'approve' ? 'Approve' : confirm === 'block' ? (u.status === 'pending' ? 'Decline' : 'Pause') : 'Restore'}
        body={confirm === 'approve' ? `${u.full_name} will be able to manage orders, the catalogue and retailers.` : confirm === 'block' ? 'They will be signed out of everything and can’t place orders until you restore them.' : 'They will be able to sign in and order again.'} />
    </Page>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex justify-between gap-4"><dt className="text-ink-mute">{k}</dt><dd className="text-right font-semibold">{v}</dd></div>;
}
