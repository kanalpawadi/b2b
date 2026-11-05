import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowLeft, Ban, Check, ChevronRight, MailPlus, Phone, ShieldCheck, Trash2, Users as UsersIcon, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAdminInvites, useCancelInvite, useDeleteAccount, useDirectory, useDirectoryEntry, useInviteAdmin, useOrders, useSetAccountStatus } from '../../lib/queries';
import { friendlyError } from '../../lib/supabase';
import { dateOnly, displayPhone, num, relative } from '../../lib/format';
import type { DirectoryEntry } from '../../lib/types';
import { AccountPill, Avatar, Button, Card, Confirm, Empty, Field, Input, OrderPill, PageHeader, Segmented, Skeleton } from '../../components/ui';
import { listChild, listParent, Page } from '../../components/motion';
import { useMe } from '../auth/AuthProvider';

type Tab = 'retailers' | 'admins' | 'pending';

export function Users() {
  const me = useMe();
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
      <PageHeader eyebrow="People" title={<>Users <em className="text-indigo">&amp;</em> admins</>} />
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Segmented id="users" value={tab} onChange={(t) => setParams({ tab: t })} options={[
          { value: 'retailers', label: 'Users' },
          { value: 'admins', label: 'Admins' },
          { value: 'pending', label: <>Requests{pending.length > 0 && <span className="ml-1.5 rounded-full bg-marigold px-1.5 text-[11px] text-indigo">{pending.length}</span>}</> },
        ]} />
        <Input className="h-10 max-w-xs rounded-full" placeholder="Name, shop, city, phone or email" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {tab === 'admins' && me.is_owner && <AddAdmin />}

      {dir.isPending ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : !rows.length ? (
        <Empty icon={<UsersIcon className="size-7" />} title={tab === 'pending' ? 'No requests' : 'Nobody here yet'} body={tab === 'retailers' ? 'Retailers appear here once they register and confirm their email.' : tab === 'pending' ? 'New admin requests wait here for the super admin.' : 'Only you so far.'} />
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

/** Super admin only: add an admin by email, and see who hasn't signed up yet. */
function AddAdmin() {
  const invites = useAdminInvites(true);
  const invite = useInviteAdmin();
  const cancel = useCancelInvite();
  const [address, setAddress] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = address.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return toast.error('Enter a valid email address');
    invite.mutate(v, {
      onSuccess: (r) => {
        setAddress('');
        toast.success(r === 'invited' ? `${v} can now sign up as an admin` : `${v} is now an admin`, {
          description: r === 'invited' ? 'They become an admin as soon as they register and confirm their email.' : undefined,
        });
      },
      onError: (err) => toast.error(friendlyError(err)),
    });
  };

  return (
    <Card className="mb-6 p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-indigo-100 text-indigo"><MailPlus className="size-5" /></span>
        <div className="min-w-0">
          <p className="font-display text-xl font-medium">Add an admin</p>
          <p className="text-sm text-ink-mute">Enter their email. If they already have an account they become an admin now; otherwise as soon as they register.</p>
        </div>
      </div>
      <form onSubmit={submit} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Input type="email" inputMode="email" autoComplete="off" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="staff@example.com" className="h-11 sm:flex-1" />
        <Button type="submit" loading={invite.isPending} icon={<MailPlus className="size-4" />}>Add admin</Button>
      </form>
      {!!invites.data?.length && (
        <div className="mt-4">
          <p className="label-caps mb-2">Waiting to sign up</p>
          <ul className="divide-y divide-line rounded-2xl border border-line">
            {invites.data.map((i) => (
              <li key={i.email} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="min-w-0 flex-1 truncate font-semibold">{i.email}</span>
                <span className="shrink-0 text-xs text-ink-mute">{relative(i.created_at)}</span>
                <button onClick={() => cancel.mutate(i.email, { onError: (e) => toast.error(friendlyError(e)) })} aria-label={`Cancel invite for ${i.email}`}
                  className="grid size-8 shrink-0 place-items-center rounded-full text-ink-mute hover:bg-madder-100 hover:text-madder"><X className="size-4" /></button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
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
          {u.is_owner && <span className="rounded-full bg-indigo px-2 py-0.5 text-[10.5px] font-bold text-paper">Super admin</span>}
        </div>
        <p className="truncate text-sm text-ink-mute">{u.shop_name ? `${u.full_name} · ` : ''}{u.city ?? u.email ?? displayPhone(u.phone)}</p>
      </div>
      {u.role === 'retailer' && (
        <div className="hidden text-right sm:block">
          <p className="tabular font-bold">{num(Number(u.packs_ordered))} packs</p>
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
  const del = useDeleteAccount();
  const [confirm, setConfirm] = useState<'block' | 'unblock' | 'approve' | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [typed, setTyped] = useState('');

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

  const remove = () =>
    del.mutate(u.id, {
      onSuccess: () => {
        toast.success(`${u.shop_name ?? u.full_name}’s account was deleted`, { description: u.role === 'retailer' ? 'Their past orders are kept.' : undefined });
        setDeleting(false);
        navigate(u.role === 'admin' ? '/admin/users?tab=admins' : '/admin/users', { replace: true });
      },
      onError: (e) => toast.error(friendlyError(e)),
    });

  return (
    <Page>
      <button onClick={() => navigate(-1)} className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-soft hover:text-ink"><ArrowLeft className="size-4" /> Back</button>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        <Card className="h-fit p-6">
          <Avatar name={u.shop_name ?? u.full_name} className="size-16 text-xl" />
          <h1 className="mt-4 text-[28px] leading-tight font-medium">{u.shop_name ?? u.full_name}</h1>
          <p className="text-sm text-ink-soft">{u.shop_name ? u.full_name : u.role === 'admin' ? (u.is_owner ? 'Super admin' : 'Admin') : 'Retailer'}</p>
          <div className="mt-3"><AccountPill status={u.status} /></div>
          <div className="stitch my-5" />
          <dl className="space-y-2.5 text-sm">
            {u.email && <Row k="Email" v={<a className="font-semibold text-indigo hover:underline" href={`mailto:${u.email}`}>{u.email}</a>} />}
            <Row k="Mobile" v={u.phone ? <a className="font-semibold text-indigo hover:underline" href={`tel:+${u.phone.replace(/\D/g, '')}`}><Phone className="mr-1 inline size-3.5" />{displayPhone(u.phone)}</a> : '—'} />
            {u.gst_number && <Row k="GSTIN" v={<span className="font-mono text-[13px]">{u.gst_number}</span>} />}
            {(u.area || u.city || u.state) && <Row k="Location" v={[u.area, u.city, u.state].filter(Boolean).join(', ')} />}
            <Row k="Joined" v={dateOnly(u.created_at)} />
            {u.role === 'retailer' && <Row k="Ordered" v={`${num(Number(u.packs_ordered))} packs · ${num(Number(u.pieces_ordered))} pcs · ${u.order_count} orders`} />}
          </dl>
          {canManage && (
            <div className="mt-6 flex gap-2">
              {u.status === 'pending' && <Button className="flex-1" icon={<ShieldCheck className="size-4" />} onClick={() => setConfirm('approve')}>Approve admin</Button>}
              {u.status === 'active' && <Button variant="outline" className="flex-1 hover:!border-madder hover:!text-madder" icon={<Ban className="size-4" />} onClick={() => setConfirm('block')}>Pause account</Button>}
              {u.status === 'blocked' && <Button className="flex-1" icon={<Check className="size-4" />} onClick={() => setConfirm('unblock')}>Restore account</Button>}
              {u.status === 'pending' && <Button variant="ghost" onClick={() => setConfirm('block')}>Decline</Button>}
            </div>
          )}
          {canManage && u.status === 'blocked' && (
            <div className="mt-4 rounded-2xl border border-madder/30 bg-madder-100/50 p-4">
              <p className="text-sm font-semibold text-madder">Remove for good</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-soft">Deletes this paused account and its sign-in. {u.role === 'retailer' ? 'Past orders stay on the order board.' : ''}</p>
              <Button variant="danger" size="sm" className="mt-3 w-full" icon={<Trash2 className="size-4" />} onClick={() => { setTyped(''); setDeleting(true); }}>Delete account</Button>
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
                      <span className="flex-1 text-ink-soft">{dateOnly(o.created_at)}</span>
                      <span className="tabular font-semibold">{num(o.total_pieces)} pcs</span>
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
        body={confirm === 'approve' ? `${u.full_name} will be able to manage orders, the catalogue and retailers.` : confirm === 'block' ? 'They will be signed out of everything and can’t place orders until you restore them. You can delete the account after pausing it.' : 'They will be able to sign in and order again.'} />

      <Confirm open={deleting} onClose={() => setDeleting(false)} onConfirm={() => typed.trim().toUpperCase() === 'DELETE' ? remove() : toast.error('Type DELETE to confirm')}
        loading={del.isPending} title="Delete this account?" confirmLabel="Delete forever"
        body={<>This permanently removes <b>{u.shop_name ?? u.full_name}</b> and their sign-in. It can’t be undone. {u.role === 'retailer' && 'Their orders stay on the order board with the shop details recorded at the time.'}</>}>
        <Field label="Type DELETE to confirm" htmlFor="del-confirm">
          <Input id="del-confirm" value={typed} autoComplete="off" onChange={(e) => setTyped(e.target.value)} placeholder="DELETE" />
        </Field>
      </Confirm>
    </Page>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex justify-between gap-4"><dt className="shrink-0 text-ink-mute">{k}</dt><dd className="min-w-0 text-right font-semibold [overflow-wrap:anywhere]">{v}</dd></div>;
}
